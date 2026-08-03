import { describe, it } from 'mocha';
import { expect } from 'chai';
import {
  BlueprintNameRejection,
  MAX_BLUEPRINT_NAME_LENGTH,
  isCanonicalBlueprintName,
  normalizeBlueprintName,
  validateBlueprintName,
} from '../../lib/index';

// Blueprint title policy (spec/multilingual-search-plan.md phase 3a). Every
// character class below is written as an escape: the whole point of the
// rejected ones is that they are invisible in a file read, so a literal in this
// file would be unreviewable and could be silently normalized by an editor.
const RLO = '\u202e'; // right-to-left override
const ZWSP = '\u200b'; // zero-width space
const ZWNJ = '\u200c'; // zero-width non-joiner
const ZWJ = '\u200d'; // zero-width joiner
const BOM = '\ufeff'; // byte-order mark
const NBSP = '\u00a0'; // no-break space
const IDEOGRAPHIC_SPACE = '\u3000';
const CYRILLIC_O = '\u043e'; // looks exactly like ASCII 'o'

function reasonFor(name: string): BlueprintNameRejection | 'accepted' {
  const result = validateBlueprintName(name);
  return result.ok ? 'accepted' : result.reason;
}

describe('blueprint-name policy', function () {
  describe('accepts real titles', function () {
    // The regression this whole change exists to fix: each of these was a 400
    // under the old /^[a-zA-Z0-9_ -]+$/.
    const titles: [string, string][] = [
      ['English', 'Rodriguez SPOM v2'],
      ['Vietnamese', 'Máy lọc nước tự động'],
      ['Chinese', '电解制氧系统'],
      ['Russian', 'Ферма для слизи'],
      ['Korean', '산소 발생기 설계'],
      ['Japanese, Han + Kana in one word', '酸素発生装置のせっけい'],
      ['mixed Latin and Han across words', 'SPOM 电解 v3'],
      ['emoji', 'Cool base 🚀'],
      ['punctuation the old regex rejected', 'Base #1 (v2.5): "final"'],
    ];
    for (const [label, title] of titles) {
      it(label, function () {
        expect(reasonFor(title), title).to.equal('accepted');
      });
    }
  });

  describe('normalization', function () {
    it('composes decomposed diacritics (NFC)', function () {
      const decomposed = 'Ma\u0301y lo\u0323c';
      const composed = 'M\u00e1y l\u1ecdc';
      expect(normalizeBlueprintName(decomposed)).to.equal(composed);
    });

    it('collapses every kind of whitespace to single spaces and trims', function () {
      const raw = `  Base${NBSP}One${IDEOGRAPHIC_SPACE}Two\t\tThree \n`;
      expect(normalizeBlueprintName(raw)).to.equal('Base One Two Three');
    });

    it('is idempotent, which is what lets the schema demand canonical form', function () {
      const once = normalizeBlueprintName(`  Máy${NBSP}lọc  `);
      expect(normalizeBlueprintName(once)).to.equal(once);
      expect(isCanonicalBlueprintName(once)).to.equal(true);
    });

    it('rejects a non-canonical string as a stored value even when it would validate', function () {
      // The decomposed form is a perfectly legal title, but not the form the
      // model may store — normalization happens at ingress, not in the schema.
      expect(validateBlueprintName('Ma\u0301y').ok).to.equal(true);
      expect(isCanonicalBlueprintName('Ma\u0301y')).to.equal(false);
      expect(isCanonicalBlueprintName('  padded  ')).to.equal(false);
    });
  });

  describe('rejections', function () {
    it('rejects an empty or whitespace-only name', function () {
      expect(reasonFor('')).to.equal('empty');
      expect(reasonFor(`  ${NBSP}\t `)).to.equal('empty');
    });

    it('rejects control characters', function () {
      expect(reasonFor('Base\u0000One')).to.equal('control');
      expect(reasonFor('Base\u0007One')).to.equal('control');
    });

    it('rejects bidi overrides and zero-width characters', function () {
      expect(reasonFor(`Base${RLO}One`)).to.equal('invisible');
      expect(reasonFor(`Base${ZWSP}One`)).to.equal('invisible');
      // Mid-string: a leading BOM is stripped by String.trim, which is fine —
      // it leaves a clean title rather than a rejected one.
      expect(reasonFor(`Base${BOM}One`)).to.equal('invisible');
      expect(reasonFor(`${BOM}Base`)).to.equal('accepted');
    });

    it('allows ZWNJ/ZWJ, which real scripts and emoji sequences need', function () {
      expect(reasonFor(`Base${ZWNJ}One`)).to.equal('accepted');
      // Family emoji: a ZWJ sequence.
      expect(reasonFor(`Base \u{1f468}${ZWJ}\u{1f469}${ZWJ}\u{1f466}`)).to.equal('accepted');
    });

    it('rejects stacked combining marks but not Vietnamese', function () {
      expect(reasonFor('Base' + '\u0301'.repeat(8))).to.equal('stacked-marks');
      // Vietnamese stacks at most two marks on a base letter.
      expect(reasonFor('Nứớc')).to.equal('accepted');
    });

    it('rejects Latin/Cyrillic homoglyph mixing inside one word', function () {
      expect(reasonFor(`R${CYRILLIC_O}driguez`)).to.equal('mixed-script');
    });

    it('allows Latin and Cyrillic in separate words', function () {
      // The narrowness that matters: a Russian title with an English model
      // number is ordinary, and must not be caught by the homoglyph rule.
      expect(reasonFor('Ферма SPOM v2')).to.equal('accepted');
    });

    it('rejects a name over the length limit, counted after normalization', function () {
      expect(reasonFor('a'.repeat(MAX_BLUEPRINT_NAME_LENGTH))).to.equal('accepted');
      expect(reasonFor('a'.repeat(MAX_BLUEPRINT_NAME_LENGTH + 1))).to.equal('too-long');
      // Trailing whitespace is normalized away, so it does not push a name over.
      expect(reasonFor('a'.repeat(MAX_BLUEPRINT_NAME_LENGTH) + '   ')).to.equal('accepted');
    });

    it('rejects a non-string', function () {
      expect(reasonFor(undefined as unknown as string)).to.equal('empty');
    });
  });
});
