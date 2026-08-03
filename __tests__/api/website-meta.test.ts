import { describe, it } from 'mocha';
import { expect } from 'chai';

import { htmlMetaTag, WebsiteMeta } from '../../app/websiteMeta';

// These tags are rendered raw by index-robots.ejs (`<%- metaTags %>`), and
// og:title carries a user-supplied blueprint name. The old ASCII-only name
// regex made injection unreachable; Unicode titles allow `"` and `<`.
describe('websiteMeta', function () {
  it('escapes quotes and angle brackets in tag content', function () {
    const tag = htmlMetaTag('og:title' as any, 'x" /><script>alert(1)</script>');
    expect(tag).to.equal(
      '<meta property="og:title" content="x&quot; /&gt;&lt;script&gt;alert(1)&lt;/script&gt;" />'
    );
    expect(tag).to.not.contain('<script>');
  });

  it('escapes ampersands without double-escaping the entities it emits', function () {
    expect(htmlMetaTag('og:title' as any, 'Coal & Water')).to.contain('content="Coal &amp; Water"');
  });

  it('passes a non-ASCII title through unchanged — only markup is escaped', function () {
    const title = '산소 발생기'; // Korean, no markup characters
    expect(htmlMetaTag('og:title' as any, title)).to.contain(`content="${title}"`);
  });

  it('escapes a hostile title reached through WebsiteMeta.getHtmlTags', function () {
    const tags = new WebsiteMeta({ 'og:title': 'Base"><img src=x onerror=alert(1)>' }).getHtmlTags();
    expect(tags).to.not.contain('<img');
    expect(tags).to.contain('&lt;img');
  });
});
