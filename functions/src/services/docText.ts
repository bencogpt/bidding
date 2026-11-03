// Plain text of a Google Doc, as the Docs API returns it (pure — no API calls, unit-tested).
//
// The whole document counts, the same parts the document generator copies and fills:
//  - every tab (and child tab), not only the first one;
//  - tables (cell by cell, nested tables too), headers, footers and footnotes;
//  - pending suggestions read as if accepted: suggested insertions count, suggested deletions don't.
//    So a template edited in suggestion mode yields its new fields only, not old + new.
import type { docs_v1 } from 'googleapis';

type Content = docs_v1.Schema$StructuralElement[] | undefined;

function contentText(content: Content, out: string[]): void {
  for (const el of content ?? []) {
    if (el.paragraph) {
      out.push(
        (el.paragraph.elements ?? [])
          .filter((pe) => !pe.textRun?.suggestedDeletionIds?.length)
          .map((pe) => pe.textRun?.content ?? '')
          .join(''),
      );
    } else if (el.table) {
      for (const row of el.table.tableRows ?? []) {
        for (const cell of row.tableCells ?? []) contentText(cell.content, out);
      }
    }
    // tableOfContents is generated from the headings — its text is already in the body.
  }
}

function documentTabText(tab: docs_v1.Schema$DocumentTab | docs_v1.Schema$Document, out: string[]): void {
  contentText(tab.body?.content, out);
  for (const part of [tab.headers, tab.footers, tab.footnotes]) {
    for (const p of Object.values(part ?? {})) contentText(p.content, out);
  }
}

function tabsText(tabs: docs_v1.Schema$Tab[] | undefined, out: string[]): void {
  for (const tab of tabs ?? []) {
    if (tab.documentTab) documentTabText(tab.documentTab, out);
    tabsText(tab.childTabs, out);
  }
}

export function docPlainText(doc: docs_v1.Schema$Document): string {
  const out: string[] = [];
  // Fetched with includeTabsContent the content is under `tabs`; older responses use `body`.
  if (doc.tabs?.length) tabsText(doc.tabs, out);
  else documentTabText(doc, out);
  return out.join('').replace(/\n+$/, '');
}
