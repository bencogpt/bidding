// Unit tests for reading a Google Doc's text (template sync, supervisor):
//   node --test functions/lib/test/docText.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { docs_v1 } from 'googleapis';
import { detectPlaceholders } from '@obms/shared';
import { docPlainText } from '../services/docText.js';

const run = (content: string, extra: docs_v1.Schema$TextRun = {}): docs_v1.Schema$ParagraphElement => ({
  textRun: { content, ...extra },
});
const para = (...elements: docs_v1.Schema$ParagraphElement[]): docs_v1.Schema$StructuralElement => ({
  paragraph: { elements },
});
const keys = (doc: docs_v1.Schema$Document) => detectPlaceholders(docPlainText(doc)).map((p) => p.key);

test('suggested deletions are not read; suggested insertions are (as if accepted)', () => {
  const doc = {
    body: {
      content: [
        para(
          run('בל"ם מס\' '),
          run('{{old_number}}', { suggestedDeletionIds: ['s1'] }),
          run('{{מספר מכרז}}', { suggestedInsertionIds: ['s2'] }),
          run('\n'),
        ),
      ],
    },
  };
  assert.deepEqual(keys(doc), ['מספר מכרז']);
});

test('fields inside tables (and nested tables) are read', () => {
  const cell = (...content: docs_v1.Schema$StructuralElement[]) => ({ content });
  const doc = {
    body: {
      content: [
        para(run('{{a}}\n')),
        {
          table: {
            tableRows: [
              {
                tableCells: [
                  cell(para(run('{{in_table}}\n'))),
                  cell({ table: { tableRows: [{ tableCells: [cell(para(run('{{nested}}\n')))] }] } }),
                ],
              },
            ],
          },
        },
      ],
    },
  };
  assert.deepEqual(keys(doc), ['a', 'in_table', 'nested']);
});

test('every tab, child tab, header and footer is read when the doc has tabs', () => {
  const tab = (content: string, childTabs: docs_v1.Schema$Tab[] = []): docs_v1.Schema$Tab => ({
    documentTab: { body: { content: [para(run(content))] } },
    childTabs,
  });
  const doc: docs_v1.Schema$Document = {
    tabs: [
      {
        ...tab('{{first}}\n', [tab('{{child}}\n')]),
        documentTab: {
          body: { content: [para(run('{{first}}\n'))] },
          headers: { h: { content: [para(run('{{in_header}}\n'))] } },
          footers: { f: { content: [para(run('{{in_footer}}\n'))] } },
        },
      },
      tab('{{second}}\n'),
    ],
  };
  assert.deepEqual(keys(doc), ['first', 'in_header', 'in_footer', 'child', 'second']);
});

test('a doc without tabs content still reads its body', () => {
  assert.equal(docPlainText({ body: { content: [para(run('שלום {{x}}\n')), para(run('\n\n'))] } }), 'שלום {{x}}');
});
