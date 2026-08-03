import { describe, it } from 'mocha';
import { expect } from 'chai';
import { detectLanguage } from '../../app/api/services/language-detection-service';

describe('detectLanguage', function () {
  it('detects English', function () {
    expect(detectLanguage('This is a wonderfully well organized power generation setup.')).to.equal('en');
  });

  it('detects French and collapses region variants', function () {
    expect(detectLanguage('Ceci est une configuration de generation electrique tres bien organisee.')).to.equal(
      'fr'
    );
  });

  it('detects Chinese and collapses to the zh macrolanguage code', function () {
    expect(detectLanguage('这是一个非常好的发电站布局，管理得很整洁有序。')).to.equal('zh');
  });

  it('detects Russian', function () {
    expect(detectLanguage('Это очень хорошо организованная схема выработки электроэнергии.')).to.equal('ru');
  });

  it('detects Korean', function () {
    expect(detectLanguage('이것은 매우 잘 정리된 발전소 배치입니다.')).to.equal('ko');
  });

  it('returns null below the minimum significant-character threshold', function () {
    expect(detectLanguage('nice')).to.equal(null);
    expect(detectLanguage('ok')).to.equal(null);
    expect(detectLanguage('')).to.equal(null);
  });

  it('returns null for pure punctuation/emoji', function () {
    expect(detectLanguage('!!! ... ??? *** ~~~ ### @@@ ]]] [[[ >>> <<<')).to.equal(null);
  });

  it('strips reference tokens before counting significant length', function () {
    // Only the token remains after stripping — well under the threshold
    expect(detectLanguage('{{blueprint:507f1f77bcf86cd799439011}}')).to.equal(null);
    expect(detectLanguage('{{user:507f1f77bcf86cd799439011}}')).to.equal(null);
  });

  it('strips URLs before detection so link-only text is not misdetected', function () {
    expect(detectLanguage('https://example.com/some/long/path/that/is/mostly/noise')).to.equal(null);
  });

  it('still detects real content alongside a stripped token/URL', function () {
    const result = detectLanguage(
      'Check out {{blueprint:507f1f77bcf86cd799439011}} https://example.com — this design saves a huge amount of power and space in the base.'
    );
    expect(result).to.equal('en');
  });

  it('never throws on malformed input', function () {
    expect(() => detectLanguage(null as unknown as string)).to.not.throw();
    expect(detectLanguage(null as unknown as string)).to.equal(null);
    expect(() => detectLanguage(undefined as unknown as string)).to.not.throw();
  });
});
