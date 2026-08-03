import { describe, it } from 'mocha';
import { expect } from 'chai';
import { tokenizeReferences, restoreReferences } from '../../app/api/services/translation-token-safety';

describe('translation-token-safety', function () {
  describe('tokenizeReferences / restoreReferences round-trip', function () {
    it('round-trips a single token', function () {
      const source = 'Check out {{blueprint:507f1f77bcf86cd799439011}} for details.';
      const { text, tokens } = tokenizeReferences(source);
      expect(text).to.not.contain('{{blueprint:');
      expect(restoreReferences(text, tokens)).to.equal(source);
    });

    it('round-trips multiple distinct tokens', function () {
      const source =
        'Thanks {{user:507f1f77bcf86cd799439011}}, see {{blueprint:507f191e810c19729de860ea}} and also {{user:5f8d0d55b54764421b7156c5}}.';
      const { text, tokens } = tokenizeReferences(source);
      expect(restoreReferences(text, tokens)).to.equal(source);
    });

    it('round-trips a token at the very start of the string', function () {
      const source = '{{blueprint:507f1f77bcf86cd799439011}} is great';
      const { text, tokens } = tokenizeReferences(source);
      expect(restoreReferences(text, tokens)).to.equal(source);
    });

    it('round-trips adjacent tokens with no separator', function () {
      const source = '{{blueprint:507f1f77bcf86cd799439011}}{{user:507f191e810c19729de860ea}}';
      const { text, tokens } = tokenizeReferences(source);
      expect(restoreReferences(text, tokens)).to.equal(source);
    });

    it('round-trips a token embedded in CJK text with no surrounding whitespace', function () {
      const source = '请看这个蓝图{{blueprint:507f1f77bcf86cd799439011}}非常好用';
      const { text, tokens } = tokenizeReferences(source);
      expect(restoreReferences(text, tokens)).to.equal(source);
    });

    it('is a no-op when there are no tokens', function () {
      const source = 'nothing to see here';
      const { text, tokens } = tokenizeReferences(source);
      expect(text).to.equal(source);
      expect(tokens).to.have.length(0);
      expect(restoreReferences(source, tokens)).to.equal(source);
    });
  });

  describe('restoreReferences failure modes (must discard, never serve corrupted text)', function () {
    it('fails when a placeholder is missing from the translated text', function () {
      const { tokens } = tokenizeReferences('see {{blueprint:507f1f77bcf86cd799439011}}');
      expect(restoreReferences('the placeholder vanished', tokens)).to.equal(null);
    });

    it('fails when a placeholder appears twice (NMT duplication)', function () {
      const { text, tokens } = tokenizeReferences('see {{blueprint:507f1f77bcf86cd799439011}}');
      const duplicated = `${text} ${text}`;
      expect(restoreReferences(duplicated, tokens)).to.equal(null);
    });

    it('fails when only some of several placeholders survive', function () {
      const { text, tokens } = tokenizeReferences(
        'a {{user:507f1f77bcf86cd799439011}} b {{blueprint:507f191e810c19729de860ea}}'
      );
      // Drop the second placeholder entirely
      const mangled = text.replace(/xxBNIREFx1xx/, 'gone');
      expect(restoreReferences(mangled, tokens)).to.equal(null);
    });

    it('fails when the translated text contains a stray unrecognized placeholder-shaped sentinel', function () {
      const { tokens } = tokenizeReferences('see {{blueprint:507f1f77bcf86cd799439011}}');
      // Only one real placeholder existed (index 0); an extra index-99 sentinel
      // appearing in the output means the round-trip cannot be trusted.
      const withRestored = restoreReferences('see xxBNIREFx0xx and also xxBNIREFx99xx', tokens);
      expect(withRestored).to.equal(null);
    });
  });
});
