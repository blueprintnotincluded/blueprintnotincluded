import { describe, it } from 'mocha';
import { expect } from 'chai';
import {
  sanitizeCommentBody,
  extractTokenIds,
  segmentBody,
} from '../../app/api/services/comment-body';

const BP_ID = '507f1f77bcf86cd799439011';
const USER_ID = '61dbae02c147bedd3c952c1a';

// Resolver stub: knows exactly one user, "builder" (case-insensitive)
const resolver = async (usernames: string[]) => {
  const map = new Map<string, string>();
  if (usernames.includes('builder')) map.set('builder', USER_ID);
  return map;
};

describe('comment body parse pipeline', function () {
  it('strips HTML tags, including nested ones', async function () {
    const result = await sanitizeCommentBody('hello <b>world</b> <<i>script</i>>alert(1)</script>', resolver);
    expect(result).to.equal('hello world alert(1)');
  });

  it('strips external URLs silently', async function () {
    const result = await sanitizeCommentBody(
      'check https://evil.example.com/phish and www.spam.io for details',
      resolver
    );
    expect(result).to.equal('check and for details');
  });

  it('converts /b/:id paths and full site URLs into blueprint tokens', async function () {
    expect(await sanitizeCommentBody(`see /b/${BP_ID} here`, resolver)).to.equal(
      `see {{blueprint:${BP_ID}}} here`
    );
    expect(
      await sanitizeCommentBody(`see https://blueprintnotincluded.org/b/${BP_ID} here`, resolver)
    ).to.equal(`see {{blueprint:${BP_ID}}} here`);
    expect(
      await sanitizeCommentBody(`see blueprintnotincluded.org/blueprint/${BP_ID}`, resolver)
    ).to.equal(`see {{blueprint:${BP_ID}}}`);
  });

  it('does not tokenize /b/ paths with invalid ids', async function () {
    const result = await sanitizeCommentBody('see /b/not-an-id here', resolver);
    expect(result).to.equal('see /b/not-an-id here');
  });

  it('converts known @mentions to user tokens and leaves unknown ones as text', async function () {
    const result = await sanitizeCommentBody('thanks @builder and @ghost!', resolver);
    expect(result).to.equal(`thanks {{user:${USER_ID}}} and @ghost!`);
  });

  it('resolves mentions case-insensitively', async function () {
    const result = await sanitizeCommentBody('hey @BUILDER', resolver);
    expect(result).to.equal(`hey {{user:${USER_ID}}}`);
  });

  it('does not treat email addresses as mentions', async function () {
    const result = await sanitizeCommentBody('mail me at kevin@builder', resolver);
    expect(result).to.equal('mail me at kevin@builder');
  });

  it('converts profile URLs into user tokens', async function () {
    const result = await sanitizeCommentBody(
      'ask https://blueprintnotincluded.org/profile/builder or /profile/ghost',
      resolver
    );
    expect(result).to.equal(`ask {{user:${USER_ID}}} or @ghost`);
  });

  it('neutralizes forged reference tokens', async function () {
    const result = await sanitizeCommentBody(`{{user:${USER_ID}}}`, resolver);
    expect(result).to.equal(`user:${USER_ID}`);
  });

  it('strips zero-width and bidi override characters and normalizes to NFC', async function () {
    const result = await sanitizeCommentBody('cle\u200Ban\u202Eup e\u0301', resolver);
    expect(result).to.equal('cleanup \u00e9');
  });

  it('preserves non-Latin text (CJK, Cyrillic)', async function () {
    const text = '很好的设计 отличный чертёж';
    expect(await sanitizeCommentBody(text, resolver)).to.equal(text);
  });

  it('collapses excess whitespace and trims', async function () {
    const result = await sanitizeCommentBody('  a    b\n\n\n\nc  ', resolver);
    expect(result).to.equal('a b\n\nc');
  });

  it('returns an empty string for content that is only disallowed material', async function () {
    expect(await sanitizeCommentBody('https://spam.example.com', resolver)).to.equal('');
    expect(await sanitizeCommentBody('<script>alert(1)</script>', resolver)).to.equal('alert(1)');
    expect(await sanitizeCommentBody('<b></b>  ', resolver)).to.equal('');
  });
});

describe('comment body render pipeline', function () {
  it('extracts distinct token ids across bodies', function () {
    const { blueprintIds, userIds } = extractTokenIds([
      `a {{blueprint:${BP_ID}}} b {{user:${USER_ID}}}`,
      `c {{blueprint:${BP_ID}}}`,
    ]);
    expect(blueprintIds).to.deep.equal([BP_ID]);
    expect(userIds).to.deep.equal([USER_ID]);
  });

  it('splits a body into text and reference segments', function () {
    const segments = segmentBody(`try {{blueprint:${BP_ID}}} by {{user:${USER_ID}}}!`, {
      blueprints: new Map([[BP_ID, 'Coal Setup']]),
      users: new Map([[USER_ID, 'builder']]),
    });
    expect(segments).to.deep.equal([
      { type: 'text', text: 'try ' },
      { type: 'blueprint', id: BP_ID, name: 'Coal Setup' },
      { type: 'text', text: ' by ' },
      { type: 'user', id: USER_ID, name: 'builder' },
      { type: 'text', text: '!' },
    ]);
  });

  it('resolves missing targets to a null name', function () {
    const segments = segmentBody(`{{blueprint:${BP_ID}}}`, {
      blueprints: new Map(),
      users: new Map(),
    });
    expect(segments).to.deep.equal([{ type: 'blueprint', id: BP_ID, name: null }]);
  });

  it('returns a single text segment for a body without tokens', function () {
    expect(segmentBody('plain text', { blueprints: new Map(), users: new Map() })).to.deep.equal([
      { type: 'text', text: 'plain text' },
    ]);
  });
});
