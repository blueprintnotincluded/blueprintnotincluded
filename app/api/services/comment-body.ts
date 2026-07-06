import { CommentSegment } from '../../../lib/index';

// Comment body parse pipeline (spec/COMMENT_SYSTEM.md — Content Model).
// The stored body is never raw user input: HTML is stripped, external URLs are
// removed, and internal references are stored as {{blueprint:id}} / {{user:id}}
// tokens so they survive site URL refactors. Resolvers are injected so the
// pipeline stays unit-testable without a database.

const OBJECT_ID = '[0-9a-fA-F]{24}';
const USERNAME = '[a-zA-Z0-9_-]{1,30}';
const SITE_HOST = String.raw`(?:https?:\/\/)?(?:www\.)?blueprintnotincluded\.org`;

// Control chars (keep \n), zero-width/invisible chars, bidi overrides, soft hyphen
const INVISIBLE_CHARS =
  // eslint-disable-next-line no-control-regex
  /[\u0000-\u0008\u000B-\u001F\u007F-\u009F\u00AD\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF]/g;

const TOKEN_PATTERN = /\{\{(blueprint|user):([0-9a-fA-F]{24})\}\}/g;

/** username (lowercased) -> userId, for the usernames that actually exist */
export type MentionResolver = (usernames: string[]) => Promise<Map<string, string>>;

function stripHtml(text: string): string {
  // Repeat until stable so nested constructs like "<<b>script>" fully collapse
  let previous;
  do {
    previous = text;
    text = text.replace(/<[^<>]*>/g, '');
  } while (text !== previous);
  return text;
}

export async function sanitizeCommentBody(raw: string, resolveMentions: MentionResolver): Promise<string> {
  let text = raw.normalize('NFC').replace(/\r\n?/g, '\n').replace(INVISIBLE_CHARS, '');

  // Neutralize token delimiters so users cannot forge reference tokens
  text = text.replace(/\{\{|\}\}/g, '');

  text = stripHtml(text);

  // Internal blueprint links (full URL or site-relative path; /b/ is the live
  // route, /blueprint/ kept for forward compatibility) -> reference tokens
  text = text.replace(
    new RegExp(String.raw`${SITE_HOST}\/(?:b|blueprint)\/(${OBJECT_ID})\b`, 'g'),
    '{{blueprint:$1}}'
  );
  text = text.replace(
    new RegExp(String.raw`(^|[\s(])\/(?:b|blueprint)\/(${OBJECT_ID})\b`, 'gm'),
    '$1{{blueprint:$2}}'
  );

  // Profile links become @mentions, resolved with the rest below
  text = text.replace(new RegExp(String.raw`${SITE_HOST}\/profile\/(${USERNAME})\b`, 'g'), '@$1');
  text = text.replace(new RegExp(String.raw`(^|[\s(])\/profile\/(${USERNAME})\b`, 'gm'), '$1@$2');

  // Any remaining URL is external: stripped silently, per policy
  text = text.replace(/(?:https?:\/\/|www\.)[^\s)]+/gi, '');

  // @mentions -> {{user:id}} for usernames that exist; unknown ones stay literal
  const mentionRegex = new RegExp(String.raw`(^|[^a-zA-Z0-9_-])@(${USERNAME})`, 'g');
  const candidates = new Set<string>();
  for (const match of text.matchAll(mentionRegex)) {
    candidates.add(match[2].toLowerCase());
  }
  if (candidates.size > 0) {
    const resolved = await resolveMentions([...candidates]);
    text = text.replace(mentionRegex, (whole, prefix: string, username: string) => {
      const userId = resolved.get(username.toLowerCase());
      return userId ? `${prefix}{{user:${userId}}}` : whole;
    });
  }

  // Tidy whitespace left behind by stripped content
  text = text
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();

  return text;
}

/** Distinct entity ids referenced by a set of stored bodies, for batch resolution */
export function extractTokenIds(bodies: string[]): { blueprintIds: string[]; userIds: string[] } {
  const blueprintIds = new Set<string>();
  const userIds = new Set<string>();
  for (const body of bodies) {
    for (const match of body.matchAll(TOKEN_PATTERN)) {
      (match[1] === 'blueprint' ? blueprintIds : userIds).add(match[2].toLowerCase());
    }
  }
  return { blueprintIds: [...blueprintIds], userIds: [...userIds] };
}

/**
 * Inverse of the parse step, for prefilling an edit box: reference tokens are
 * rendered back to forms the parse pipeline will re-tokenize on save
 * (/b/<id> for blueprints, @username for users). A mention whose target no
 * longer resolves degrades to literal "@[deleted]" text.
 */
export function toEditableText(body: string, users: Map<string, string>): string {
  TOKEN_PATTERN.lastIndex = 0;
  return body.replace(TOKEN_PATTERN, (_match, kind: string, id: string) =>
    kind === 'blueprint' ? `/b/${id.toLowerCase()}` : `@${users.get(id.toLowerCase()) ?? '[deleted]'}`
  );
}

/**
 * Render pipeline: split a stored body into display segments. Reference names
 * come pre-resolved (id -> display name, or absent/null when the target is gone).
 */
export function segmentBody(
  body: string,
  names: { blueprints: Map<string, string>; users: Map<string, string> }
): CommentSegment[] {
  const segments: CommentSegment[] = [];
  let cursor = 0;
  TOKEN_PATTERN.lastIndex = 0;
  for (const match of body.matchAll(TOKEN_PATTERN)) {
    if (match.index! > cursor) {
      segments.push({ type: 'text', text: body.slice(cursor, match.index) });
    }
    const kind = match[1] as 'blueprint' | 'user';
    const id = match[2].toLowerCase();
    const name = (kind === 'blueprint' ? names.blueprints : names.users).get(id) ?? null;
    segments.push({ type: kind, id, name });
    cursor = match.index! + match[0].length;
  }
  if (cursor < body.length) {
    segments.push({ type: 'text', text: body.slice(cursor) });
  }
  return segments;
}
