// Untrusted text (request text, field values, titles) never becomes markup:
//   node --test functions/lib/test/xss.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stripMarkup } from '@obms/shared';
import { bodyToHtml } from '../services/docHtml.js';
import { fillTemplate } from '../services/docsService.js';

// What request 2026-185 was opened with.
const ATTACK = 'https://www.google.com <script>alert(1);</script> <img src=x onerror="alert(1);"></>';

test('the document renderer escapes field values: no tag or handler survives', () => {
  const html = bodyToHtml(fillTemplate('עיקרי השירות: {{summary}}\n## {{summary}}', { summary: ATTACK }));
  assert.doesNotMatch(html, /<script|<img|<\/>/i);
  assert.match(html, /&lt;script&gt;/, 'shown as text');
  assert.match(html, /https:\/\/www\.google\.com/, 'the link stays as plain text');
});

test('request text loses its tags at the source; plain text and links stay', () => {
  const s = stripMarkup(ATTACK);
  assert.doesNotMatch(s, /[<>]/);
  assert.doesNotMatch(s, /alert/, 'script contents go with the script');
  assert.match(s, /https:\/\/www\.google\.com/);
  assert.equal(stripMarkup('ספק ≥ 3 שנים, מחיר < 5% מהאומדן'), 'ספק ≥ 3 שנים, מחיר < 5% מהאומדן', 'a lone < in prose is kept');
});
