// docsService — abstraction over the tender document.
//
// REAL GOOGLE DOCS mode (active when GOOGLE_OAUTH_REFRESH_TOKEN is present, or USE_GOOGLE_DOCS=true):
//   Authenticates as a dedicated Google account via an OAuth refresh token (works on consumer
//   Gmail — the account owns the docs, unlike a service account which has no Drive quota).
//   Copies a Google Docs template, fills {{params}}, sets permissions (manager=writer,
//   reviewers=commenter; suppliers get none), and exports the PDF on-demand for the in-system
//   viewer. Requires secrets GOOGLE_OAUTH_CLIENT_ID/SECRET/REFRESH_TOKEN bound to the functions.
// DEV / EMULATOR (default): renders the template's bodyTemplate to HTML in Storage and serves
//   it through a Cloud Function. Runs without any Google Workspace.
import { google, type docs_v1 } from 'googleapis';
import { storage } from '../lib/admin.js';
import type { TenderDoc, TemplateDoc, UserDoc } from '@obms/shared';
import { TENDER_TYPE_LABELS_HE } from '@obms/shared';
import { htmlToText } from './supervisorChecks.js';
import { groupSessions, sampleSessions, type RevisionMeta } from './scoreCalc.js';

// drive.file = access only to files the app creates. Non-sensitive → no OAuth verification
// needed. (We create the tender doc from the template text rather than copying a foreign file,
// which is why full `drive` is unnecessary.)
const SCOPES = ['https://www.googleapis.com/auth/drive.file'];

// Always dev/HTML mode under the emulator (hermetic local tests, no real Google calls), even
// if the emulator pulled the OAuth secret from Secret Manager. Real mode runs only in deployed
// functions where OAuth creds are present.
function realMode(): boolean {
  if (process.env.FUNCTIONS_EMULATOR === 'true') return false;
  return process.env.USE_GOOGLE_DOCS === 'true' || !!process.env.GOOGLE_OAUTH_REFRESH_TOKEN;
}

function googleClients() {
  const refreshToken = process.env.GOOGLE_OAUTH_REFRESH_TOKEN;
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  let auth;
  if (refreshToken && clientId && clientSecret) {
    const oauth = new google.auth.OAuth2(clientId, clientSecret);
    oauth.setCredentials({ refresh_token: refreshToken }); // googleapis auto-refreshes access tokens
    auth = oauth;
  } else {
    auth = new google.auth.GoogleAuth({ scopes: SCOPES });
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return {
    auth,
    drive: google.drive({ version: 'v3', auth: auth as any }),
    docs: google.docs({ version: 'v1', auth: auth as any }),
  };
}

// Unfilled placeholders stay visible as {{key}} (matching real Docs mode) so the supervisor and
// the manager see the gap — never silently papered over.
function fillTemplate(body: string, params: Record<string, string | number>): string {
  return body.replace(/\{\{\s*([^}\n]+?)\s*\}\}/g, (m, key: string) => {
    const v = params[key.trim()];
    return v !== undefined && String(v) !== '' ? String(v) : m;
  });
}

function renderHtml(tender: TenderDoc, template: TemplateDoc): string {
  const body = fillTemplate(template.bodyTemplate, tender.params);
  return `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8">
<style>body{font-family:'David',Arial,sans-serif;line-height:1.7;max-width:760px;margin:32px auto;padding:0 24px;color:#131a2b}
h1{font-size:24px}h2{font-size:18px;border-bottom:2px solid #d8a23a;padding-bottom:4px}
.meta{color:#475069;font-size:13px;margin-bottom:24px}</style></head>
<body>
<h1>${tender.title}</h1>
<div class="meta">${TENDER_TYPE_LABELS_HE[tender.type]} · מסמך מכרז · נוצר אוטומטית מתבנית</div>
${body.split('\n').map((l) => (l.trim() ? `<p>${l}</p>` : '')).join('\n')}
</body></html>`;
}

const htmlPath = (id: string) => `tenders/${id}/document.html`;

export interface GeneratedDoc {
  googleDocId: string | null;
  exportPath: string | null;
}

/** Generate the tender document from its template. */
export async function generateTenderDocument(
  tender: TenderDoc,
  template: TemplateDoc,
): Promise<GeneratedDoc> {
  if (!realMode()) {
    const html = renderHtml(tender, template);
    const path = htmlPath(tender.id);
    await storage
      .bucket()
      .file(path)
      .save(Buffer.from(html, 'utf8'), {
        contentType: 'text/html; charset=utf-8',
        metadata: { cacheControl: 'no-store' },
      });
    return { googleDocId: null, exportPath: path };
  }

  const { drive, docs } = googleClients();

  // Preferred: copy the system-owned template Doc (app-created → drive.file can copy it),
  // preserving its Google Docs formatting, then replace {{placeholders}} with the params.
  if (template.googleTemplateDocId) {
    const copy = await drive.files.copy({
      fileId: template.googleTemplateDocId,
      requestBody: { name: tender.title },
      fields: 'id',
    });
    const docId = copy.data.id!;
    const params = { title: tender.title, ...tender.params };
    const requests = Object.entries(params).map(([key, value]) => ({
      replaceAllText: {
        containsText: { text: `{{${key}}}`, matchCase: false },
        replaceText: String(value),
      },
    }));
    if (requests.length) {
      await docs.documents.batchUpdate({ documentId: docId, requestBody: { requests } });
    }
    return { googleDocId: docId, exportPath: null };
  }

  // Fallback (no template Doc yet): create a new Doc from the bodyTemplate text.
  const created = await docs.documents.create({ requestBody: { title: tender.title } });
  const docId = created.data.documentId!;
  const filled = fillTemplate(template.bodyTemplate || tender.title, {
    title: tender.title,
    ...tender.params,
  });
  await docs.documents.batchUpdate({
    documentId: docId,
    requestBody: { requests: [{ insertText: { location: { index: 1 }, text: filled } }] },
  });
  return { googleDocId: docId, exportPath: null };
}

/** Create a private, system-owned Google Doc template for a bid type (seeded with starter text). */
export async function createTemplateDoc(
  title: string,
  starterBody: string,
): Promise<{ docId: string; url: string }> {
  const { docs } = googleClients();
  const created = await docs.documents.create({ requestBody: { title } });
  const docId = created.data.documentId!;
  if (starterBody) {
    await docs.documents.batchUpdate({
      documentId: docId,
      requestBody: { requests: [{ insertText: { location: { index: 1 }, text: starterBody } }] },
    });
  }
  return { docId, url: `https://docs.google.com/document/d/${docId}/edit` };
}

function docPlainText(doc: docs_v1.Schema$Document): string {
  const lines: string[] = [];
  for (const el of doc.body?.content ?? []) {
    const para = el.paragraph;
    if (!para) continue;
    lines.push((para.elements ?? []).map((pe) => pe.textRun?.content ?? '').join(''));
  }
  return lines.join('').replace(/\n+$/, '');
}

/** Read a system-owned template Doc's text via the Docs API (drive.file — no public sharing). */
export async function readTemplateDocText(googleDocId: string): Promise<string> {
  const { docs } = googleClients();
  const doc = await docs.documents.get({ documentId: googleDocId });
  return docPlainText(doc.data);
}

/**
 * Current plain text of a tender's document, for the supervisor. Dev: the rendered HTML in
 * Storage. Real mode: the live Google Doc (system-owned copy), so manager edits are included.
 */
export async function readTenderDocText(tender: TenderDoc): Promise<string> {
  if (!realMode()) {
    const [buf] = await storage.bucket().file(htmlPath(tender.id)).download();
    return htmlToText(buf.toString('utf8'));
  }
  if (!tender.googleDocId) throw new Error('Tender has no googleDocId to read.');
  return readTemplateDocText(tender.googleDocId);
}

/**
 * Best-effort count of Google Docs revisions (raw editing activity). Real mode only. Google says
 * the list can be incomplete for heavily edited Docs, so this is shown for context, never scored.
 */
export async function countDriveRevisions(tender: TenderDoc): Promise<number | null> {
  if (!realMode() || !tender.googleDocId) return null;
  const { drive } = googleClients();
  let count = 0;
  let pageToken: string | undefined;
  do {
    const res = await drive.revisions.list({
      fileId: tender.googleDocId,
      pageSize: 1000,
      pageToken,
      fields: 'nextPageToken, revisions(id)',
    });
    count += res.data.revisions?.length ?? 0;
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);
  return count;
}

export interface EditSessionText {
  id: string;
  at: number;
  editor: string | null;
  text: string;
}

/**
 * The document's editions, one per Google Docs edit session (consecutive revisions by the same
 * editor within 30 minutes), oldest first. Revision texts are cached in Storage so each is
 * exported only once. Real mode only; null otherwise. Google may omit old revisions of heavily
 * edited Docs, and > 60 sessions are sampled (first, last, even spread).
 */
export async function collectEditSessions(
  tender: TenderDoc,
): Promise<{ sessions: EditSessionText[]; sampled: boolean } | null> {
  if (!realMode() || !tender.googleDocId) return null;
  const { auth, drive } = googleClients();
  const metas: (RevisionMeta & { exportUrl: string | null })[] = [];
  let pageToken: string | undefined;
  do {
    const res = await drive.revisions.list({
      fileId: tender.googleDocId,
      pageSize: 1000,
      pageToken,
      fields: 'nextPageToken, revisions(id, modifiedTime, lastModifyingUser(displayName, emailAddress), exportLinks)',
    });
    for (const r of res.data.revisions ?? []) {
      metas.push({
        id: r.id!,
        at: Date.parse(r.modifiedTime ?? '') || 0,
        editor: r.lastModifyingUser?.emailAddress ?? r.lastModifyingUser?.displayName ?? null,
        exportUrl: r.exportLinks?.['text/plain'] ?? null,
      });
    }
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);
  if (!metas.length) return null;

  const byId = new Map(metas.map((m) => [m.id, m]));
  const { kept, sampled } = sampleSessions(groupSessions(metas));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const token = (await (auth as any).getAccessToken())?.token ?? (await (auth as any).getAccessToken());
  const sessions: EditSessionText[] = [];
  for (const s of kept) {
    const path = `tenders/${tender.id}/revisions/${s.id}.txt`;
    const file = storage.bucket().file(path);
    let text: string;
    const [exists] = await file.exists();
    if (exists) {
      text = (await file.download())[0].toString('utf8');
    } else {
      const url = byId.get(s.id)?.exportUrl;
      if (!url) continue;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(`revision ${s.id} export failed: ${res.status}`);
      text = (await res.text()).replace(/^\uFEFF/, '');
      await file.save(Buffer.from(text, 'utf8'), { contentType: 'text/plain; charset=utf-8' });
    }
    sessions.push({ id: s.id, at: s.at, editor: s.editor, text });
  }
  return sessions.length ? { sessions, sampled } : null;
}

/** Store a text snapshot of a document version in Storage; returns the path. */
export async function saveVersionSnapshot(tenderId: string, name: string, text: string): Promise<string> {
  const path = `tenders/${tenderId}/versions/${name}.txt`;
  await storage
    .bucket()
    .file(path)
    .save(Buffer.from(text, 'utf8'), { contentType: 'text/plain; charset=utf-8' });
  return path;
}

export async function readVersionSnapshot(path: string): Promise<string> {
  const [buf] = await storage.bucket().file(path).download();
  return buf.toString('utf8');
}

/**
 * Resolve the Google address to use for a user's Doc permission.
 *
 * ONLY `googleEmail` counts. The OBMS login (often an @obms.test address) is not a Google
 * identity — granting on it always fails and fires a pointless notification email, so we skip
 * the user instead and let the UI surface that they have no Google account.
 */
export function googleIdentityOf(user: Pick<UserDoc, 'googleEmail'>): string | null {
  return user.googleEmail?.trim() || null;
}

/**
 * Set Google Docs permissions. Tender managers => writer; every other internal role =>
 * commenter. Suppliers are intentionally never granted a Google permission.
 *
 * The writer/commenter split is what enforces "only the bid manager accepts changes": Google
 * lets a commenter add comments and propose tracked suggestions, but only a writer can
 * accept/reject them. Never grant `writer` to a non-manager.
 */
export async function setDocumentPermissions(
  googleDocId: string | null,
  opts: { writerEmails?: string[]; commenterEmails?: string[] },
): Promise<void> {
  if (!realMode() || !googleDocId) return; // dev mode enforces access in-system
  const { drive } = googleClients();
  // Best-effort: a bad/non-Google reviewer email must not fail tender creation. Google
  // requires sendNotificationEmail=true to share with a non-Google-account address.
  const grant = async (emailAddress: string, role: 'writer' | 'commenter') => {
    try {
      await drive.permissions.create({
        fileId: googleDocId,
        requestBody: { type: 'user', role, emailAddress },
        sendNotificationEmail: true,
        supportsAllDrives: true,
      });
    } catch (e) {
      console.warn(`Docs permission grant skipped for ${emailAddress} (${role}):`, (e as Error).message);
    }
  };
  for (const email of opts.writerEmails ?? []) await grant(email, 'writer');
  for (const email of opts.commenterEmails ?? []) await grant(email, 'commenter');
}

const pdfPath = (id: string) => `tenders/${id}/document.pdf`;

/**
 * Export the tender's Google Doc to PDF and cache it in Storage. Called at publish (and via a
 * manual refresh) so the supplier hot path serves a cached file instead of a live Google export.
 * Returns the Storage path, or null when not in real mode / no doc.
 */
export async function cacheTenderPdf(tender: TenderDoc): Promise<string | null> {
  if (!realMode() || !tender.googleDocId) return null;
  const { drive } = googleClients();
  const pdf = await drive.files.export(
    { fileId: tender.googleDocId, mimeType: 'application/pdf' },
    { responseType: 'arraybuffer' },
  );
  const path = pdfPath(tender.id);
  await storage
    .bucket()
    .file(path)
    .save(Buffer.from(pdf.data as ArrayBuffer), { contentType: 'application/pdf' });
  return path;
}

export type Viewable =
  | { kind: 'html'; content: string; title: string }
  | { kind: 'pdf'; dataBase64: string; title: string };

/**
 * Returns the document for the in-system viewer (caller already authorized upstream).
 * Dev: inline HTML from Storage. Real mode: PDF exported on-demand from Drive as base64 — the
 * supplier never touches the raw Google Doc, and no Storage / signed URL is involved.
 */
export async function getViewable(tender: TenderDoc): Promise<Viewable> {
  if (!realMode()) {
    const path = tender.docExportPath ?? htmlPath(tender.id);
    const [buf] = await storage.bucket().file(path).download();
    return { kind: 'html', content: buf.toString('utf8'), title: tender.title };
  }
  // Fast path: serve the PDF cached at publish (no Google call). Fall back to a live export.
  if (tender.docExportPath) {
    const [buf] = await storage.bucket().file(tender.docExportPath).download();
    return { kind: 'pdf', dataBase64: buf.toString('base64'), title: tender.title };
  }
  if (!tender.googleDocId) {
    throw new Error('Tender has no googleDocId to export.');
  }
  const { drive } = googleClients();
  const pdf = await drive.files.export(
    { fileId: tender.googleDocId, mimeType: 'application/pdf' },
    { responseType: 'arraybuffer' },
  );
  return {
    kind: 'pdf',
    dataBase64: Buffer.from(pdf.data as ArrayBuffer).toString('base64'),
    title: tender.title,
  };
}
