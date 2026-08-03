// Content-Disposition for blueprint downloads.
//
// Titles are Unicode as of the phase-3a name relaxation, so the old
// `filename="${blueprint.name}.blueprint"` is no longer safe on two counts: an
// HTTP header field is ISO-8859-1 by the spec (a Korean title emits bytes a
// client may render as mojibake, and Node rejects some of them outright), and a
// title containing `"` or `\` would break out of the quoted string.
//
// RFC 6266 §4.3 is the answer, and it is what browsers implement: an ASCII
// `filename` every client understands, plus an RFC 5987 `filename*` with the
// real UTF-8 name that every current browser prefers when present.

/** Characters a filesystem or a quoted header string cannot carry. */
const UNSAFE_PATH = /[\\/:*?"<>|]/g;

/**
 * ASCII fallback: transliterate what we can (é → e via NFD + mark strip), drop
 * the rest. A wholly non-Latin title leaves nothing, so it falls back to a
 * fixed stem rather than emitting `.blueprint` with no name.
 */
export function asciiFilenameStem(name: string, fallback = 'blueprint'): string {
  const stem = name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    // eslint-disable-next-line no-control-regex
    .replace(/[^\x20-\x7E]/g, '')
    .replace(UNSAFE_PATH, '')
    .trim();
  return stem.length > 0 ? stem : fallback;
}

/**
 * A full Content-Disposition value for an attachment named `${name}${ext}`.
 * `ext` includes its dot.
 */
export function attachmentDisposition(name: string, ext: string): string {
  const utf8 = `${name.replace(UNSAFE_PATH, '')}${ext}`;
  const ascii = `${asciiFilenameStem(name)}${ext}`;
  // encodeURIComponent leaves !'()* unescaped; they are not attr-chars in RFC
  // 5987, so escape them too rather than emit a header a strict parser rejects.
  const encoded = encodeURIComponent(utf8).replace(
    /['()!*]/g,
    c => '%' + c.charCodeAt(0).toString(16).toUpperCase()
  );
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}
