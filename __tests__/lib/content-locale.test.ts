import { expect } from 'chai';
import {
  DEFAULT_CONTENT_LOCALE,
  normalizeContentLocale,
  resolveContentLocale,
  resolveTitle,
  TitleTranslation,
} from '../../lib';

// The content-locale policy (spec/search-followups.md Part 2 §2.3/§2.5). Four
// surfaces validate the same code and one rule resolves every displayed title,
// so these are the assertions that keep them from drifting apart.
describe('content locale', function () {
  describe('normalizeContentLocale', function () {
    it('accepts base ISO tags', function () {
      expect(normalizeContentLocale('en')).to.equal('en');
      expect(normalizeContentLocale('vi')).to.equal('vi');
      expect(normalizeContentLocale('fil')).to.equal('fil');
    });

    it('lowercases and narrows region/script subtags to the base tag', function () {
      expect(normalizeContentLocale('PT-BR')).to.equal('pt');
      expect(normalizeContentLocale('zh-Hans')).to.equal('zh');
      expect(normalizeContentLocale('en_US')).to.equal('en');
      expect(normalizeContentLocale('  fr  ')).to.equal('fr');
    });

    it('returns null for anything that is not a language tag', function () {
      for (const bad of ['', 'english', 'e', '<script>', '12', 42, null, undefined, {}]) {
        expect(normalizeContentLocale(bad), JSON.stringify(bad)).to.equal(null);
      }
    });

    // null and 'en' are different states: "never chose" must keep resolving to
    // whatever the current default is, so nothing writes 'en' eagerly.
    it('distinguishes "no declaration" from "chose English"', function () {
      expect(normalizeContentLocale(undefined)).to.equal(null);
      expect(resolveContentLocale(undefined)).to.equal(DEFAULT_CONTENT_LOCALE);
    });
  });

  describe('resolveTitle', function () {
    const machine = (lang: string, title: string): TitleTranslation => ({
      lang,
      title,
      origin: 'machine',
    });

    // Rule 1 — the author gets their own words back.
    it('shows the authored title when the viewer reads its language', function () {
      const resolved = resolveTitle({
        authoredName: 'Máy lọc nước',
        sourceLang: 'vi',
        viewerLang: 'vi',
        translations: [machine('en', 'Water purifier')],
      });
      expect(resolved.title).to.equal('Máy lọc nước');
      expect(resolved.translated).to.equal(false);
    });

    // Rule 3 — the deliverable: everything readable in English.
    it('shows the English machine translation to an English reader', function () {
      const resolved = resolveTitle({
        authoredName: 'Cozinha estrategia em choque',
        sourceLang: 'pt',
        viewerLang: 'en',
        translations: [machine('en', 'Strategic cooking in conflict')],
      });
      expect(resolved.title).to.equal('Strategic cooking in conflict');
      expect(resolved.translated).to.equal(true);
      expect(resolved.original).to.equal('Cozinha estrategia em choque');
      expect(resolved.sourceLang).to.equal('pt');
    });

    // Rule 2 — inert today (English is the only target) but must win over
    // English when a second target is ever activated.
    it('prefers a translation into the viewer language over the English one', function () {
      const resolved = resolveTitle({
        authoredName: 'Máy lọc nước',
        sourceLang: 'vi',
        viewerLang: 'ru',
        translations: [machine('en', 'Water purifier'), machine('ru', 'Водоочиститель')],
      });
      expect(resolved.title).to.equal('Водоочиститель');
    });

    // Rule 4 — the guarantee that lets this ship ahead of any backfill.
    it('falls back to the authored title when nothing is translated', function () {
      const resolved = resolveTitle({
        authoredName: 'Dien phan full',
        sourceLang: null,
        viewerLang: 'en',
        translations: [],
      });
      expect(resolved.title).to.equal('Dien phan full');
      expect(resolved.translated).to.equal(false);
    });

    it('never returns a blank title when the search row is missing entirely', function () {
      const resolved = resolveTitle({
        authoredName: 'SPOM v2',
        sourceLang: undefined,
        viewerLang: 'en',
      });
      expect(resolved.title).to.equal('SPOM v2');
    });

    // An 'authored' row is the pivot echoing Blueprint.name — not a
    // translation. Treating it as one would tell an English reader their
    // English title had been "translated from English".
    it('ignores an authored row, which is the pivot echoing the name', function () {
      const resolved = resolveTitle({
        authoredName: 'SPOM v2',
        sourceLang: 'en',
        viewerLang: 'vi',
        translations: [{ lang: 'en', title: 'SPOM v2', origin: 'authored' }],
      });
      expect(resolved.title).to.equal('SPOM v2');
      expect(resolved.translated).to.equal(false);
    });

    it('ignores an empty translated title rather than showing a blank card', function () {
      const resolved = resolveTitle({
        authoredName: 'Ферма',
        sourceLang: 'ru',
        viewerLang: 'en',
        translations: [machine('en', '   ')],
      });
      expect(resolved.title).to.equal('Ферма');
    });

    // A human-corrected translation is still not the author's own words for
    // display purposes, but it is not machine output either — no "machine
    // translated" disclosure should claim otherwise.
    it('does not mark a human translation as machine output', function () {
      const resolved = resolveTitle({
        authoredName: 'Ферма',
        sourceLang: 'ru',
        viewerLang: 'en',
        translations: [{ lang: 'en', title: 'Farm', origin: 'human' }],
      });
      expect(resolved.title).to.equal('Farm');
      expect(resolved.translated).to.equal(false);
    });
  });
});
