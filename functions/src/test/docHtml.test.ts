// Unit tests for the document HTML helpers (no network). Run via `npm run test --workspace functions`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bodyToHtml } from '../services/docHtml.js';

test('## and ### lines become headings with ids; the title stays the only h1', () => {
  const html = bodyToHtml('## פרטי המכרז\nגוף מזמין: X\n### תת סעיף');
  assert.match(html, /<h3 id="sec-1">פרטי המכרז<\/h3>/);
  assert.match(html, /<h4 id="sec-2">תת סעיף<\/h4>/);
  assert.match(html, /<p>גוף מזמין: X<\/p>/);
  assert.doesNotMatch(html, /<h1/);
});

test('heading text is escaped; other lines are left as they were', () => {
  const html = bodyToHtml('## a <b> & c\nplain & <i>x</i>');
  assert.match(html, /<h3 id="sec-1">a &lt;b&gt; &amp; c<\/h3>/);
  assert.match(html, /<p>plain & <i>x<\/i><\/p>/);
});

test('blank lines are dropped and a line of only # is a paragraph', () => {
  assert.equal(bodyToHtml('\n\n'), '');
  assert.equal(bodyToHtml('##'), '<p>##</p>');
});

test('exported Docs HTML is made right-to-left and loses its left alignment and scripts', async () => {
  const { rtlifyExportedHtml } = await import('../services/docHtml.js');
  const out = rtlifyExportedHtml(
    '<html><head><script>x()</script></head><body><p style="text-align:left;color:red">שלום</p></body></html>',
  );
  assert.match(out, /<html dir="rtl" lang="he">/);
  assert.doesNotMatch(out, /<script|text-align:\s*left/);
  assert.match(out, /color:red/);
  assert.match(out, /<style>[\s\S]*direction:rtl[\s\S]*<\/style><\/head>/);
});
