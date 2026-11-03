// docsService — abstraction over the tender document.
//
// REAL GOOGLE DOCS mode (active when GOOGLE_OAUTH_REFRESH_TOKEN is present, or USE_GOOGLE_DOCS=true):
//   Authenticates as a dedicated Google account via an OAuth refresh token (works on consumer
//   Gmail — the account owns the docs, unlike a service account which has no Drive quota).
//   Copies a Google Docs template, fills {{params}}, sets permissions (manager=writer,
//   reviewers=commenter; suppliers get none), and exports the doc as HTML on-demand for the in-system
//   viewer. Requires secrets GOOGLE_OAUTH_CLIENT_ID/SECRET/REFRESH_TOKEN bound to the functions.
// DEV / EMULATOR (default): renders the template's bodyTemplate to HTML in Storage and serves
//   it through a Cloud Function. Runs without any Google Workspace.
import { google, type docs_v1 } from 'googleapis';
import { storage } from '../lib/admin.js';
import type { TenderDoc, TemplateDoc, UserDoc } from '@obms/shared';
import { TENDER_TYPE_LABELS_HE } from '@obms/shared';
import { htmlToText } from './supervisorChecks.js';
import { bodyToHtml, rtlifyExportedHtml } from './docHtml.js';
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

/** Whether documents live in Google Docs (deployed) or as HTML in Storage (emulator/dev). */
export function docsRealMode(): boolean {
  return realMode();
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

/** The spellings of a placeholder that detectPlaceholders treats as the same field. */
export function placeholderSpellings(key: string): string[] {
  return [`{{${key}}}`, `{{ ${key} }}`, `{{${key} }}`, `{{ ${key}}}`];
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
${bodyToHtml(body)}
</body></html>`;
}

/**
 * Plain text of the document a draft WOULD produce — the template filled with the draft values, in
 * memory, no Google Doc. The inspector checks drafts on this preview.
 */
export function renderDraftText(tender: TenderDoc, template: TemplateDoc): string {
  return htmlToText(renderHtml(tender, template));
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
    // Placeholders typed by hand sometimes carry spaces ("{{ key }}", "{{key }}") — the template
    // sync reads them as the same field, so the fill must match those spellings too.
    const requests = Object.entries(params).flatMap(([key, value]) =>
      placeholderSpellings(key).map((text) => ({
        replaceAllText: {
          containsText: { text, matchCase: false },
          replaceText: String(value),
        },
      })),
    );
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

/**
 * Undo a generated document when creating the case failed afterwards: the Google Doc goes to the
 * Drive trash (restorable), the dev-mode HTML is deleted. Best-effort.
 */
export async function discardGeneratedDocument(tenderId: string, gen: GeneratedDoc): Promise<void> {
  try {
    if (gen.googleDocId && realMode()) {
      const { drive } = googleClients();
      await drive.files.update({ fileId: gen.googleDocId, requestBody: { trashed: true } });
    } else if (gen.exportPath) {
      await storage.bucket().file(gen.exportPath).delete({ ignoreNotFound: true });
    }
  } catch (e) {
    console.warn(`discardGeneratedDocument(${tenderId}) failed:`, (e as Error).message);
  }
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

/** Copy a Doc as a backup before modifying it (e.g. template conversion). Returns the copy id. */
export async function backupDoc(googleDocId: string, name: string): Promise<string> {
  const { drive } = googleClients();
  const copy = await drive.files.copy({ fileId: googleDocId, requestBody: { name }, fields: 'id' });
  return copy.data.id!;
}

/** Run replaceAllText requests on a Doc; returns how many occurrences each request changed. */
export async function replaceInDoc(
  googleDocId: string,
  requests: { replaceAllText: { containsText: { text: string; matchCase: boolean }; replaceText: string } }[],
): Promise<number[]> {
  if (!requests.length) return [];
  const { docs } = googleClients();
  const res = await docs.documents.batchUpdate({ documentId: googleDocId, requestBody: { requests } });
  return (res.data.replies ?? []).map((r) => r.replaceAllText?.occurrencesChanged ?? 0);
}

/** Remove a user's Google Docs permission (when they leave the case team). Best-effort. */
export async function removeDocumentPermission(googleDocId: string | null, email: string | null): Promise<void> {
  if (!realMode() || !googleDocId || !email) return;
  const { drive } = googleClients();
  try {
    const res = await drive.permissions.list({
      fileId: googleDocId,
      fields: 'permissions(id, emailAddress, role)',
      supportsAllDrives: true,
    });
    for (const p of res.data.permissions ?? []) {
      if (p.emailAddress?.toLowerCase() === email.toLowerCase() && p.role !== 'owner') {
        await drive.permissions.delete({ fileId: googleDocId, permissionId: p.id!, supportsAllDrives: true });
      }
    }
  } catch (e) {
    console.warn(`Docs permission removal skipped for ${email}:`, (e as Error).message);
  }
}

const exportHtmlPath = (id: string) => `tenders/${id}/document-export.html`;

/**
 * Export the tender's Google Doc as HTML (the viewer needs real headings for its table of
 * contents, which a PDF cannot give). See rtlifyExportedHtml for the right-to-left cleanup.
 */
async function exportDocHtml(googleDocId: string): Promise<string> {
  const { drive } = googleClients();
  const res = await drive.files.export(
    { fileId: googleDocId, mimeType: 'text/html' },
    { responseType: 'arraybuffer' },
  );
  return rtlifyExportedHtml(Buffer.from(res.data as ArrayBuffer).toString('utf8'));
}

/**
 * Export the tender's Google Doc to HTML and cache it in Storage. Called at publish (and via a
 * manual refresh) so the supplier hot path serves a cached file instead of a live Google export.
 * Returns the Storage path, or null when not in real mode / no doc.
 */
export async function cacheTenderHtml(tender: TenderDoc): Promise<string | null> {
  if (!realMode() || !tender.googleDocId) return null;
  const html = await exportDocHtml(tender.googleDocId);
  const path = exportHtmlPath(tender.id);
  await storage
    .bucket()
    .file(path)
    .save(Buffer.from(html, 'utf8'), {
      contentType: 'text/html; charset=utf-8',
      metadata: { cacheControl: 'no-store' },
    });
  return path;
}

export type Viewable = { kind: 'html'; content: string; title: string };

/**
 * Returns the document for the in-system viewer (caller already authorized upstream), always as
 * HTML. Dev: the rendered HTML in Storage. Real mode: the Google Doc exported as HTML — suppliers
 * get the copy cached at publish; `live` (internal users) always re-exports so edits show at once.
 * The supplier never touches the raw Google Doc.
 */
export async function getViewable(tender: TenderDoc, live = false): Promise<Viewable> {
  if (!realMode()) {
    const path = tender.docExportPath ?? htmlPath(tender.id);
    const [buf] = await storage.bucket().file(path).download();
    return { kind: 'html', content: buf.toString('utf8'), title: tender.title };
  }
  // Documents cached before the HTML switch point at a PDF — ignore those and re-export.
  const cached = tender.docExportPath && !tender.docExportPath.endsWith('.pdf') ? tender.docExportPath : null;
  if (cached && !live) {
    const [buf] = await storage.bucket().file(cached).download();
    return { kind: 'html', content: buf.toString('utf8'), title: tender.title };
  }
  if (!tender.googleDocId) {
    throw new Error('Tender has no googleDocId to export.');
  }
  return { kind: 'html', content: await exportDocHtml(tender.googleDocId), title: tender.title };
}
