import { describe, it } from 'mocha';
import { expect } from 'chai';
import { detectLanguage, detectLanguageCode } from '../../app/api/services/language-detection-service';

describe('detectLanguage', function () {
  it('detects English with high confidence', function () {
    expect(detectLanguage('This is a wonderfully well organized power generation setup.')).to.deep.equal({
      lang: 'en',
      confidence: 'high',
    });
  });

  it('detects French and collapses region variants', function () {
    expect(
      detectLanguage('Ceci est une configuration de generation electrique tres bien organisee.').lang
    ).to.equal('fr');
  });

  it('detects Chinese and collapses to the zh macrolanguage code', function () {
    expect(detectLanguage('这是一个非常好的发电站布局，管理得很整洁有序。').lang).to.equal('zh');
  });

  it('detects Russian', function () {
    expect(detectLanguage('Это очень хорошо организованная схема выработки электроэнергии.').lang).to.equal('ru');
  });

  it('detects Korean', function () {
    expect(detectLanguage('이것은 매우 잘 정리된 발전소 배치입니다.').lang).to.equal('ko');
  });

  describe('short texts (titles, queries)', function () {
    it('a short all-ASCII text is never statistically confident', function () {
      expect(detectLanguage('nice')).to.deep.equal({ lang: null, confidence: 'none' });
      expect(detectLanguage('New Blueprint')).to.deep.equal({ lang: null, confidence: 'none' });
      expect(detectLanguage('')).to.deep.equal({ lang: null, confidence: 'none' });
    });

    it('a short text in an unambiguous script is detected despite its length', function () {
      // Well under 20 significant chars — the length gate alone used to null
      // these out, which was ~half the title corpus. (A lone Cyrillic word
      // stays ambiguous — ru/kk/uk share the script — and correctly falls to
      // the prior instead; that's what the prior is for.)
      expect(detectLanguage('전기 발전소')).to.deep.equal({ lang: 'ko', confidence: 'high' });
      expect(detectLanguage('Máy lọc nước')).to.deep.equal({ lang: 'vi', confidence: 'high' });
      expect(detectLanguage('Электростанция', { prior: 'ru' })).to.deep.equal({
        lang: 'ru',
        confidence: 'prior',
      });
    });
  });

  describe('locale prior', function () {
    it('falls back to the prior when statistics cannot decide, and records it', function () {
      expect(detectLanguage('New Blueprint', { prior: 'ru' })).to.deep.equal({
        lang: 'ru',
        confidence: 'prior',
      });
    });

    it('normalizes the prior through the same alias table', function () {
      expect(detectLanguage('SPOM v2', { prior: 'zh-Hans' })).to.deep.equal({
        lang: 'zh',
        confidence: 'prior',
      });
    });

    it('a confident statistical hit overrides the prior', function () {
      const result = detectLanguage('Это очень хорошо организованная схема выработки электроэнергии.', {
        prior: 'ko',
      });
      expect(result).to.deep.equal({ lang: 'ru', confidence: 'high' });
    });
  });

  it('returns none for pure punctuation/emoji', function () {
    expect(detectLanguage('!!! ... ??? *** ~~~ ### @@@ ]]] [[[ >>> <<<').confidence).to.not.equal('high');
  });

  it('strips reference tokens before counting significant length', function () {
    expect(detectLanguage('{{blueprint:507f1f77bcf86cd799439011}}')).to.deep.equal({
      lang: null,
      confidence: 'none',
    });
    expect(detectLanguage('{{user:507f1f77bcf86cd799439011}}').lang).to.equal(null);
  });

  it('strips URLs before detection so link-only text is not misdetected', function () {
    expect(detectLanguage('https://example.com/some/long/path/that/is/mostly/noise').confidence).to.not.equal(
      'high'
    );
  });

  it('still detects real content alongside a stripped token/URL', function () {
    const result = detectLanguage(
      'Check out {{blueprint:507f1f77bcf86cd799439011}} https://example.com — this design saves a huge amount of power and space in the base.'
    );
    expect(result.lang).to.equal('en');
  });

  it('never throws on malformed input', function () {
    expect(() => detectLanguage(null as unknown as string)).to.not.throw();
    expect(detectLanguage(null as unknown as string)).to.deep.equal({ lang: null, confidence: 'none' });
    expect(() => detectLanguage(undefined as unknown as string)).to.not.throw();
    expect(detectLanguage(undefined as unknown as string, { prior: 'ru' })).to.deep.equal({
      lang: 'ru',
      confidence: 'prior',
    });
  });
});

describe('detectLanguageCode', function () {
  it('yields the code only for high confidence', function () {
    expect(detectLanguageCode('This is a wonderfully well organized power generation setup.')).to.equal('en');
    expect(detectLanguageCode('New Blueprint')).to.equal(null);
  });
});
