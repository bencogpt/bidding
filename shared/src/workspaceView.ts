// The tender workspace's decisions, as pure functions: which stage a case is in, which tabs show, what
// the header's main button says, what the approvals card says, which findings are open, and what the
// home's "לטיפולך" list holds. Each mirrors a table in the UX prototype (docs/blm-prototype 19.html),
// changed only where the user decided otherwise (plan D1: the tender manager acts last and may approve on
// behalf of a participant). Plan: docs/superpowers/plans/2026-11-04-draft-flow-prototype-parity.md, A1–A5.
//
// Inputs are plain view data, not Firestore documents, so the same rules serve the browser and the
// server and are tested without either.
import type { TenderStatus } from './tender.js';
import type { DocumentStatus } from './draft.js';
import type { SupervisionFinding } from './supervision.js';
import type { TeamRole } from './team.js';
import {
  CONFERENCE_STAGE_IDX,
  FINDING_TYPE_HE,
  NEXT_ACTION_HE,
  NO_CONFERENCE_NOTE_HE,
  QUARTET_ROLES,
  ROLE_HE,
  ROLE_UNIT_HE,
  STAGE_APPROVERS,
  STAGE_BAR_COUNT,
  STAGE_COLORS,
  STAGES_HE,
  TEAM_APPROVER_ROLES,
  type ApprovalRole,
  type QuartetRole,
  type WorkspaceTabKey,
} from './workspaceLabels.js';

// ───────────────────────── formatting ─────────────────────────

const pad = (n: number) => String(n).padStart(2, '0');

/** "DD.MM HH:mm" in local time — the prototype's time stamp (nowT, line 2311). */
export function fmtStamp(ms: number): string {
  const d = new Date(ms);
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? '';

const rolesHe = (roles: readonly ApprovalRole[]) => roles.map((r) => ROLE_HE[r]).join(', ');

// ───────────────────────── A1: stage, draft state, tabs, progress ─────────────────────────

/** The prototype's r.ds: no document yet / being created / created. */
export type DraftState = 'draft' | 'creating' | 'doc';

/** Same rule as hasDocument(): cases from before draft-first have a document if a doc id/path exists. */
export function draftStateOf(t: {
  documentStatus?: DocumentStatus;
  googleDocId?: string | null;
  docExportPath?: string | null;
}): DraftState {
  if (t.documentStatus === 'generating') return 'creating';
  if (t.documentStatus === 'generated') return 'doc';
  if (t.documentStatus === 'none') return 'draft';
  return t.googleDocId || t.docExportPath ? 'doc' : 'draft';
}

/** Stage index of an open request (no tender yet). */
export const REQUEST_STAGE_IDX = 0;

const STAGE_OF_STATUS: Record<TenderStatus, number> = {
  draft: 1,
  internal_review: 1, // legacy cases and reopened ones: still being written
  ready: 2, // locked, waiting for publication
  published: 4, // no conference in the backend yet, so publication opens clarifications
  responses: 5,
  evaluated: 6,
  awarded: 7,
};

export function stageIndexOf(status: TenderStatus): number {
  return STAGE_OF_STATUS[status];
}

export const stageLabel = (idx: number) => STAGES_HE[idx] ?? '';

/** Progress shown on the overview (plan §1.1; the prototype defines 8 / 15 / 30 / 55). */
export function progressPct(stageIdx: number, ds: DraftState): number {
  if (stageIdx === 1) return ds === 'doc' ? 30 : 15;
  return [8, 15, 55, 62, 70, 80, 90, 100][stageIdx] ?? 0;
}

export interface TabView {
  key: WorkspaceTabKey;
  label: string;
  badge?: number;
}

/** Tabs in the prototype's order, each joining at its stage (syncTabs, line 2701). */
export function visibleTabs(i: {
  stageIdx: number;
  ds: DraftState;
  hasConference?: boolean;
  blockingCount?: number;
  questionCount?: number;
}): TabView[] {
  const joinsAt: Partial<Record<WorkspaceTabKey, number>> = {
    agent: 1,
    conference: i.hasConference ? CONFERENCE_STAGE_IDX : Infinity,
    questions: 2,
    bids: 5,
  };
  const all: TabView[] = [
    { key: 'overview', label: 'סקירה' },
    { key: 'document', label: i.ds === 'doc' ? 'מסמך' : 'טיוטה' },
    { key: 'agent', label: 'סוכן מפקח', ...(i.blockingCount ? { badge: i.blockingCount } : {}) },
    { key: 'conference', label: 'פרוטוקול כנס ספקים' },
    {
      key: 'questions',
      label: 'שאלות הבהרה',
      ...(i.stageIdx === 4 && i.questionCount ? { badge: i.questionCount } : {}),
    },
    { key: 'bids', label: 'הצעות והשוואה' },
    { key: 'activity', label: 'פעילות' },
    { key: 'versions', label: 'היסטוריית גרסאות' },
  ];
  return all.filter((t) => i.stageIdx >= (joinsAt[t.key] ?? 0));
}

/** A tab that has not joined yet falls back to the overview (setTTab, line 2417). */
export function resolveTab(want: string | null | undefined, tabs: TabView[]): WorkspaceTabKey {
  return tabs.find((t) => t.key === want)?.key ?? 'overview';
}

export type StageState = 'done' | 'current' | 'upcoming';
export interface StageBarItem {
  idx: number;
  label: string;
  color: string;
  state: StageState;
}

/** The header's stage bar: the first six stages, without the conference when the case has none. */
export function stageBar(i: { stageIdx: number; hasConference?: boolean }): {
  items: StageBarItem[];
  note: string | null;
} {
  const items = STAGES_HE.slice(0, STAGE_BAR_COUNT)
    .map((label, idx) => ({ label, idx }))
    .filter((s) => s.idx !== CONFERENCE_STAGE_IDX || i.hasConference)
    .map(({ label, idx }) => ({
      idx,
      label,
      color: STAGE_COLORS[idx],
      state: (idx < i.stageIdx ? 'done' : idx === i.stageIdx ? 'current' : 'upcoming') as StageState,
    }));
  return { items, note: i.hasConference ? null : NO_CONFERENCE_NOTE_HE };
}

export interface StagePopover {
  title: string;
  status: string;
  rows: { role: ApprovalRole; roleHe: string; tag: ApprovalTag; tagLabel: string }[];
}

/**
 * The hover card of one stage in the bar (prototype popOf, line 2387): done = everyone approved, upcoming =
 * everyone waiting, current = the real state where the app has one (writing: the team's approvals; publication:
 * procurement's final approval), otherwise waiting.
 */
export function stagePopover(
  item: StageBarItem,
  c: { stageIdx: number; holders: Holders; approvals: Approvals; securityInvolved: boolean },
): StagePopover {
  const roles = (STAGE_APPROVERS[item.idx] ?? QUARTET_ROLES).filter(
    (r) => r !== 'security' || c.securityInvolved || !!c.holders.security,
  );
  const tagOf = (role: ApprovalRole): ApprovalTag => {
    if (item.state === 'done') return 'approved';
    if (item.state === 'upcoming') return 'pending';
    if (item.idx === 1 && role !== 'manager') {
      if (!isApproved(c.holders, c.approvals, role)) return 'pending';
      return c.approvals[role]!.onBehalf ? 'on_behalf' : 'approved';
    }
    if (item.idx === 2 && role === 'manager') return 'approved'; // locked by procurement's final approval
    return 'pending';
  };
  return {
    title: `אישורים · ${item.label}`,
    status: item.state === 'done' ? 'השלב הושלם' : item.state === 'current' ? 'השלב הנוכחי' : 'טרם התחיל',
    rows: roles.map((role) => {
      const tag = tagOf(role);
      return { role, roleHe: ROLE_HE[role], tag, tagLabel: TAG_LABEL[tag] };
    }),
  };
}

// ───────────────────────── A2: findings ─────────────────────────

export type FindingDecisionAction = 'applied' | 'skipped';
export interface FindingDecision {
  action: FindingDecisionAction;
  by?: string;
  at?: number;
}

/**
 * A finding as stored today, plus the fields the server adds in plan B2 (stable key, Hebrew fix text) and
 * the draft field it is about with the proposed value (paramKey / suggestion).
 */
export type FindingInput = SupervisionFinding & { key?: string; fix?: string; paramKey?: string; suggestion?: string };

export interface FindingView {
  key: string;
  code: SupervisionFinding['code'];
  severity: SupervisionFinding['severity'];
  typeHe: string;
  location: string;
  message: string;
  evidence?: string;
  fix: string; // "הצעת הסוכן" — empty until the server provides one (plan B2)
  paramKey?: string;
  suggestion?: string;
  source: SupervisionFinding['source'];
  applied: boolean;
  skipped: boolean;
}

export type CheckBasis = 'draft' | 'document';

const norm = (s: string | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();

/** FNV-1a, 32 bit, base 36 — a stable fingerprint, not a security hash. */
function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36).padStart(7, '0');
}

/**
 * The finding's stable key: "draft:…" or "doc:…" (the prototype's draft:N / doc:N), from what the finding
 * is about rather than its wording, so a decision survives a re-run. The server stores it (plan B2); the
 * same function computes it until then.
 */
export function findingKey(f: FindingInput, basis: CheckBasis): string {
  if (f.key) return f.key;
  const prefix = basis === 'document' ? 'doc' : 'draft';
  return `${prefix}:${fnv1a([f.code, f.paramKey ?? '', norm(f.location), norm(f.evidence)].join('|'))}`;
}

export interface FindingsView {
  /** Blocking and warning findings of the run, blocking first (info findings are kept apart). */
  all: FindingView[];
  open: FindingView[];
  applied: FindingView[];
  skipped: FindingView[];
  /** Open blocking findings. */
  blocking: FindingView[];
  /** Open warnings. */
  warnings: FindingView[];
  /** Severity 'info' (the prototype has none): not in the panel or the counts (plan D11). */
  info: FindingView[];
}

export function findingsView(
  run: { findings: FindingInput[]; basis?: CheckBasis } | null | undefined,
  decisions: Record<string, FindingDecision> = {},
): FindingsView {
  const basis = run?.basis ?? 'draft';
  const seen = new Map<string, number>();
  const views = (run?.findings ?? []).map((f): FindingView => {
    // Two findings about the same thing get "~2", "~3" so each still has a key of its own.
    let key = findingKey(f, basis);
    const n = (seen.get(key) ?? 0) + 1;
    seen.set(key, n);
    if (n > 1) key = `${key}~${n}`;
    const d = decisions[key];
    // A blocking finding can't be left as is: a stray "skipped" on it is ignored.
    const skipped = d?.action === 'skipped' && f.severity !== 'block';
    return {
      key,
      code: f.code,
      severity: f.severity,
      typeHe: FINDING_TYPE_HE[f.code] ?? f.code,
      location: f.location,
      message: f.message,
      ...(f.evidence ? { evidence: f.evidence } : {}),
      fix: f.fix ?? '',
      ...(f.paramKey ? { paramKey: f.paramKey } : {}),
      ...(f.suggestion ? { suggestion: f.suggestion } : {}),
      source: f.source,
      applied: d?.action === 'applied',
      skipped,
    };
  });
  const rank = (v: FindingView) => (v.severity === 'block' ? 0 : 1);
  const all = views.filter((v) => v.severity !== 'info').sort((a, b) => rank(a) - rank(b));
  const open = all.filter((v) => !v.applied && !v.skipped);
  return {
    all,
    open,
    applied: all.filter((v) => v.applied),
    skipped: all.filter((v) => v.skipped),
    blocking: open.filter((v) => v.severity === 'block'),
    warnings: open.filter((v) => v.severity === 'warn'),
    info: views.filter((v) => v.severity === 'info'),
  };
}

/** The agent's state as the workspace shows it. */
export type AgentRunState = 'none' | 'running' | 'done';

/** From the shared run state (plan B1) and the last report; a failed run shows the previous report. */
export function agentStateOf(i: {
  run?: { state: 'running' | 'done' | 'failed' } | null;
  lastAt?: number | null;
}): AgentRunState {
  if (i.run?.state === 'running') return 'running';
  return i.lastAt ? 'done' : 'none';
}

export type ChipTone = 'neutral' | 'run' | 'blk' | 'wrn' | 'ok';

/** The agent's status chip (agentChip, line 2556). */
export function agentChip(state: AgentRunState, v: Pick<FindingsView, 'open' | 'blocking'>): {
  label: string;
  tone: ChipTone;
} {
  if (state === 'none') return { label: 'טרם הורץ', tone: 'neutral' };
  if (state === 'running') return { label: 'בבדיקה', tone: 'run' };
  if (v.blocking.length) return { label: 'חוסם', tone: 'blk' };
  if (v.open.length) return { label: 'אזהרות', tone: 'wrn' };
  return { label: 'תקין', tone: 'ok' };
}

// ───────────────────────── approvals (shared by A3, A4, A5) ─────────────────────────

export interface SlotHolder {
  uid: string;
  name: string;
}
export interface ApprovalEntry {
  uid: string; // the slot holder the approval stands for (also when given on their behalf)
  name: string;
  at: number;
  onBehalf?: boolean;
  byName?: string; // who approved on their behalf (the tender manager)
  reason?: string;
}
export type Holders = Partial<Record<TeamRole, SlotHolder>>;
export type Approvals = Partial<Record<TeamRole, ApprovalEntry>>;

/** An approval counts only from the slot's current holder (same rule as missingApprovals). */
export function isApproved(holders: Holders, approvals: Approvals, role: TeamRole): boolean {
  const a = approvals[role];
  return !!a && !!holders[role] && a.uid === holders[role]!.uid;
}

/**
 * Team approvals still missing before the manager's final action. `roles` defaults to requester, legal and
 * finance (security does not block, plan D2); until D2 is signed off the server still requires security for
 * service and project tenders, so callers pass the case's required roles.
 */
export function missingTeamApprovals(
  holders: Holders,
  approvals: Approvals,
  roles: readonly TeamRole[] = TEAM_APPROVER_ROLES,
): TeamRole[] {
  return roles.filter((r) => !isApproved(holders, approvals, r));
}

/** Legal approves after requester and finance (D1a). Roles the same person holds don't make them wait. */
function legalWaitsFor(holders: Holders, approvals: Approvals, myRoles: readonly TeamRole[]): TeamRole[] {
  return (['requester', 'finance'] as TeamRole[]).filter(
    (r) => !isApproved(holders, approvals, r) && !myRoles.includes(r),
  );
}

// ───────────────────────── A3: the header's main button ─────────────────────────

export type HeaderActionKind = 'run_agent' | 'create_document' | 'open_tab' | 'approve' | 'final_approve' | 'publish';

export interface HeaderAction {
  label: string;
  /** null: a status label with nothing to do. */
  kind: HeaderActionKind | null;
  enabled: boolean;
  tab?: WorkspaceTabKey;
  /** Native title: why the button is disabled, or what it waits for. */
  title?: string;
  /** The dark tooltip under the button (warnings left open before creating the document). */
  tip?: string;
}

export interface WorkspaceCtx {
  stageIdx: number;
  ds: DraftState;
  agent: AgentRunState;
  /** Open blocking and warning findings of the latest run. */
  openCount: number;
  blockingCount: number;
  /** The signed-in user is procurement (tender_manager). */
  isManager: boolean;
  /** Team slots the signed-in user holds on this case. */
  myRoles: TeamRole[];
  holders: Holders;
  approvals: Approvals;
  /** Roles whose approval the final action waits for (default: requester, legal, finance — see missingTeamApprovals). */
  approverRoles?: readonly TeamRole[];
}

/** Security is an extra, non-blocking participant unless the case's approver roles include it. */
const securityBlocks = (c: Pick<WorkspaceCtx, 'approverRoles'>) => !!c.approverRoles?.includes('security');

const ONLY_MANAGER_CREATES = 'רק הרכש יכול ליצור את המסמך';
const BLOCKED_TITLE = 'ממצא חוסם מונע אישור סופי ופרסום';

/** "שימו לב: …" on "יצירת מסמך" while warnings are open (syncNext, line 2608; singular fixed, plan §10). */
export function openWarningsTip(n: number): string {
  return n === 1
    ? 'שימו לב: יש ממצא אחד שלא הוטמע, ועדיין אפשר ליצור את המסמך'
    : `שימו לב: יש ${n} ממצאים שלא הוטמעו, ועדיין אפשר ליצור את המסמך`;
}

export function headerAction(c: WorkspaceCtx): HeaderAction | null {
  if (c.stageIdx < 1) return null;

  // The draft: run the agent, handle what blocks, create the document (syncNext, line 2600).
  if (c.ds !== 'doc') {
    if (c.ds === 'creating') return { label: 'יוצר מסמך…', kind: null, enabled: false };
    if (c.agent === 'none') return { label: 'הרץ סוכן מפקח', kind: 'run_agent', enabled: true };
    if (c.agent === 'running') return { label: 'הסוכן בודק…', kind: null, enabled: false };
    if (c.blockingCount > 0)
      return {
        label: 'טפל בממצא חוסם',
        kind: 'open_tab',
        tab: 'document',
        enabled: c.isManager,
        ...(c.isManager ? {} : { title: ONLY_MANAGER_CREATES }),
      };
    return {
      label: 'יצירת מסמך',
      kind: 'create_document',
      enabled: c.isManager,
      ...(c.isManager
        ? c.openCount > 0
          ? { tip: openWarningsTip(c.openCount) }
          : {}
        : { title: ONLY_MANAGER_CREATES }),
    };
  }

  // A blocking finding on the document stops everyone (renderApr, line 2360).
  if (c.blockingCount > 0)
    return { label: 'טפל בממצא חוסם', kind: 'open_tab', tab: 'agent', enabled: true, title: BLOCKED_TITLE };

  // From publication on, the button points to the stage's work (NEXT_ACT).
  if (c.stageIdx >= 2) {
    const na = NEXT_ACTION_HE[c.stageIdx];
    if (!na) return null;
    if (c.stageIdx === 2 && c.isManager)
      return { label: `${na.text} ←`, kind: 'publish', enabled: true };
    return { label: `${na.text} ←`, kind: 'open_tab', tab: na.tab, enabled: true };
  }

  const approved = (r: TeamRole) => isApproved(c.holders, c.approvals, r);
  const myPending = c.myRoles.filter((r) => !approved(r));

  // Approving: the team first, legal after requester and finance (D1, D1a).
  const approveButton = (): HeaderAction => {
    if (myPending.includes('legal')) {
      const waits = legalWaitsFor(c.holders, c.approvals, c.myRoles);
      return {
        label: 'אישור סופי של המכרז',
        kind: 'approve',
        enabled: waits.length === 0,
        ...(waits.length
          ? { title: `הכפתור שלך יפעל אחרי שהדורש והכספים יאשרו. נותר: ${rolesHe(waits)}.` }
          : {}),
      };
    }
    if (myPending.every((r) => r === 'security') && !securityBlocks(c))
      return { label: 'אישור (משתתף נוסף)', kind: 'approve', enabled: true };
    return { label: 'אישור סופי של המכרז', kind: 'approve', enabled: true };
  };

  if (c.isManager) {
    // A manager who also holds a team slot (e.g. opened the request) approves it first.
    if (myPending.some((r) => r !== 'security' || securityBlocks(c))) return approveButton();
    // The manager acts last: the final action locks the case (D1, D1b, D1c).
    const missing = missingTeamApprovals(c.holders, c.approvals, c.approverRoles);
    return {
      label: 'אישור סופי של המכרז',
      kind: 'final_approve',
      enabled: missing.length === 0,
      ...(missing.length
        ? { title: `הכפתור שלך יפעל אחרי שהדורש, המשפטי והכספים יאשרו. נותר: ${rolesHe(missing)}.` }
        : {}),
    };
  }

  if (!c.myRoles.length) return null; // not on the team: nothing to approve
  if (!myPending.length) {
    const at = Math.max(...c.myRoles.map((r) => c.approvals[r]?.at ?? 0));
    return { label: 'האישור שלך נרשם', kind: null, enabled: false, title: `האישור שלך נרשם · ${fmtStamp(at)}` };
  }
  return approveButton();
}

// ───────────────────────── A4: the approvals indicator and card ─────────────────────────

export type ApprovalTag = 'approved' | 'pending' | 'on_behalf';

export interface ApprovalRowAction {
  kind: 'approve_on_behalf' | 'withdraw_on_behalf';
  role: TeamRole;
  label: string;
  enabled: boolean;
  title?: string;
}

export interface ApprovalRow {
  role: ApprovalRole;
  roleHe: string;
  name: string | null; // null: the slot has no holder yet
  nonBlocking: boolean;
  tag: ApprovalTag;
  tagLabel: string;
  tagTitle?: string;
  action?: ApprovalRowAction;
}

export interface ApprovalsView {
  visible: boolean;
  segments: { role: QuartetRole; approved: boolean }[];
  count: number;
  total: number;
  title: string;
  rows: ApprovalRow[];
  note: string;
  actions: { kind: 'withdraw' | 'reopen'; label: string }[];
}

export interface ApprovalsCtx extends WorkspaceCtx {
  myUid: string;
  /** The signed-in user owns the case (the only one who may approve on behalf — D1d). */
  isOwner: boolean;
  ownerName: string;
  lockedAt?: number | null;
  /** Show the security row: the role is required or has a holder. */
  securityInvolved: boolean;
}

const TAG_LABEL: Record<ApprovalTag, string> = { approved: 'אושר', pending: 'ממתין', on_behalf: 'אושר בשם' };

export function approvalsView(c: ApprovalsCtx): ApprovalsView {
  const locked = c.stageIdx >= 2;
  const approved = (r: TeamRole) => isApproved(c.holders, c.approvals, r);
  const segments = QUARTET_ROLES.map((role) => ({
    role,
    approved: role === 'manager' ? locked : approved(role),
  }));

  const roleOrder: ApprovalRole[] = [...QUARTET_ROLES, ...(c.securityInvolved || c.holders.security ? ['security' as const] : [])];
  const rows = roleOrder.map((role): ApprovalRow => {
    if (role === 'manager') {
      return {
        role,
        roleHe: ROLE_HE.manager,
        name: c.ownerName,
        nonBlocking: false,
        tag: locked ? 'approved' : 'pending',
        tagLabel: TAG_LABEL[locked ? 'approved' : 'pending'],
        ...(locked && c.lockedAt ? { tagTitle: fmtStamp(c.lockedAt) } : {}),
      };
    }
    const holder = c.holders[role];
    const a = c.approvals[role];
    const ok = approved(role);
    const tag: ApprovalTag = ok ? (a!.onBehalf ? 'on_behalf' : 'approved') : 'pending';
    const tagTitle = !ok
      ? undefined
      : a!.onBehalf
        ? `אושר על ידי ${a!.byName ?? ''} בשם ${holder!.name} · ${fmtStamp(a!.at)}${a!.reason ? ` · ${a!.reason}` : ''}`
        : fmtStamp(a!.at);
    const action = onBehalfAction(c, role, locked);
    return {
      role,
      roleHe: ROLE_HE[role],
      name: holder?.name ?? null,
      nonBlocking: role === 'security' && !securityBlocks(c),
      tag,
      tagLabel: TAG_LABEL[tag],
      ...(tagTitle ? { tagTitle } : {}),
      ...(action ? { action } : {}),
    };
  });

  const myPending = c.myRoles.filter((r) => !approved(r));
  const mine = !c.isManager && c.myRoles.length > 0 && myPending.length === 0;

  let note = '';
  if (locked) note = 'המסמך נעול ומוכן לפרסום.' + (c.isManager ? '' : ' רק הרכש יכול לפתוח מחדש.');
  else if (c.isManager) {
    const missing = missingTeamApprovals(c.holders, c.approvals, c.approverRoles);
    note = missing.length
      ? `הכפתור שלך יפעל אחרי שהדורש, המשפטי והכספים יאשרו. נותר: ${rolesHe(missing)}.`
      : 'כולם אישרו. לחץ על "אישור סופי של המכרז" כדי לנעול את המסמך.';
  } else if (mine) {
    const at = Math.max(...c.myRoles.map((r) => c.approvals[r]?.at ?? 0));
    note = `האישור שלך נרשם · ${fmtStamp(at)}`;
  } else if (myPending.includes('legal')) {
    const waits = legalWaitsFor(c.holders, c.approvals, c.myRoles);
    note = waits.length
      ? `הכפתור שלך יפעל אחרי שהדורש והכספים יאשרו. נותר: ${rolesHe(waits)}.`
      : 'הדורש והכספים אישרו. אחרי האישור שלך הרכש יוכל לתת אישור סופי.';
  } else if (myPending.length && myPending.every((r) => r === 'security') && !securityBlocks(c))
    note = 'משתתף נוסף: האישור נרשם ואינו חוסם נעילה.';
  else if (myPending.length) note = 'לחץ על "אישור סופי של המכרז" כשסיימת לעבוד על המסמך.';

  const actions: ApprovalsView['actions'] = [];
  if (mine && !locked) actions.push({ kind: 'withdraw', label: 'בטל את האישור שלי' });
  if (locked && c.isManager) actions.push({ kind: 'reopen', label: 'פתח מחדש (שכפול)' });

  return {
    visible: c.stageIdx >= 1 && c.ds === 'doc',
    segments,
    count: segments.filter((s) => s.approved).length,
    total: segments.length,
    title: 'אישור סופי של המכרז',
    rows,
    note,
    actions,
  };
}

/** The owner's "approve on behalf" on a participant's row (D1d): assigned slots, in turn, before the lock. */
function onBehalfAction(c: ApprovalsCtx, role: TeamRole, locked: boolean): ApprovalRowAction | undefined {
  if (!c.isOwner || locked || c.stageIdx !== 1 || c.ds !== 'doc') return undefined;
  const holder = c.holders[role];
  if (holder && holder.uid === c.myUid) return undefined; // your own slot is approved with the main button
  const a = c.approvals[role];
  if (isApproved(c.holders, c.approvals, role)) {
    return a!.onBehalf
      ? { kind: 'withdraw_on_behalf', role, label: `בטל את האישור בשם ${firstName(holder!.name)}`, enabled: true }
      : undefined;
  }
  if (!holder)
    return { kind: 'approve_on_behalf', role, label: 'אישור בשם', enabled: false, title: 'יש לשייך איש קשר לפני אישור בשמו' };
  if (role === 'legal' && legalWaitsFor(c.holders, c.approvals, []).length) return undefined; // not legal's turn yet
  if (c.blockingCount > 0)
    return { kind: 'approve_on_behalf', role, label: `אישור בשם ${firstName(holder.name)}`, enabled: false, title: BLOCKED_TITLE };
  return { kind: 'approve_on_behalf', role, label: `אישור בשם ${firstName(holder.name)}`, enabled: true };
}

// ───────────────────────── A5: the home's "לטיפולך" list ─────────────────────────

/** Row urgency: r = blocking / urgent, w = waiting for you, g = for your information. */
export type PendingTone = 'r' | 'w' | 'g';

export type PendingTarget =
  | { kind: 'request'; serial: string }
  | { kind: 'tender'; id: string; tab: WorkspaceTabKey }
  | { kind: 'assign'; tenderId: string; role: TeamRole };

export interface PendingItem {
  key: string;
  ref: string; // the בל"מ number
  name: string;
  stageIdx: number;
  tone: PendingTone;
  bold: string;
  text: string;
  button: string;
  target: PendingTarget;
  meta: string;
  /** Unit contact assignment: a select of that role's users next to the button. */
  select?: { role: TeamRole };
}

export interface PendingRequestInput {
  serial: string;
  ref: string;
  name: string;
  status: 'open' | 'converted';
  requesterUid: string;
  sentByName: string;
  sentAt: number;
}

export interface PendingTenderInput {
  id: string;
  ref: string;
  name: string;
  ownerUid: string;
  stageIdx: number;
  ds: DraftState;
  agent: AgentRunState;
  blockingCount: number;
  holders: Holders;
  approvals: Approvals;
  /** The AI is still preparing the draft (plan F1). */
  preparing?: boolean;
  /** Procurement's approval of the request (who and when), for the meta line. */
  approvedByName?: string;
  approvedAt?: number;
  /** The signed-in requester has opened the draft (plan B7). */
  draftSeen?: boolean;
  /** Roles the final action waits for (see missingTeamApprovals). */
  approverRoles?: readonly TeamRole[];
}

export interface PendingCtx {
  uid: string;
  isManager: boolean;
  /** The signed-in user's system role, for unit contact assignment (legal / finance). */
  unitRole?: TeamRole;
  requests: PendingRequestInput[];
  tenders: PendingTenderInput[];
  /** Cases waiting for a contact from the user's unit (their role's slot is empty). */
  unassigned?: PendingTenderInput[];
}

/** Rows shown before "הצג עוד". */
export const PENDING_VISIBLE = 3;

export function pendingItems(c: PendingCtx): PendingItem[] {
  const out: PendingItem[] = [];
  const tenderItem = (
    t: PendingTenderInput,
    k: string,
    o: Omit<PendingItem, 'key' | 'ref' | 'name' | 'stageIdx' | 'target' | 'meta'> & {
      tab: WorkspaceTabKey;
      meta?: string;
      stageIdx?: number;
    },
  ): PendingItem => {
    const { tab, meta, stageIdx, ...rest } = o;
    return {
      key: `${t.id}:${k}`,
      ref: t.ref,
      name: t.name,
      stageIdx: stageIdx ?? t.stageIdx,
      target: { kind: 'tender', id: t.id, tab },
      meta: meta ?? t.ref,
      ...rest,
    };
  };
  const approvedMeta = (t: PendingTenderInput) =>
    t.approvedByName ? `אושר על ידי ${t.approvedByName}${t.approvedAt ? ` · ${fmtStamp(t.approvedAt)}` : ''}` : t.ref;

  if (c.isManager) {
    // Procurement's own cases first (stateActs, line 1922).
    for (const t of c.tenders.filter((x) => x.ownerUid === c.uid)) {
      if (t.stageIdx === 1 && t.ds === 'draft' && !t.preparing) {
        if (t.agent === 'none')
          out.push(tenderItem(t, 'run', { tone: 'w', bold: 'טיוטה חדשה:', text: 'ממתינה להרצת הסוכן המפקח', button: 'הרץ סוכן מפקח', tab: 'document' }));
        else if (t.agent === 'done' && t.blockingCount > 0)
          out.push(tenderItem(t, 'block', { tone: 'r', bold: 'ממצא חוסם בטיוטה:', text: 'יש לטפל לפני יצירת המסמך', button: 'טפל בממצא', tab: 'agent' }));
        else if (t.agent === 'done')
          out.push(tenderItem(t, 'create', { tone: 'g', bold: 'הטיוטה נבדקה:', text: 'אין ממצא חוסם, אפשר ליצור את המסמך', button: 'יצירת מסמך', tab: 'document' }));
      } else if (t.ds === 'doc' && t.blockingCount > 0) {
        out.push(tenderItem(t, 'block', { tone: 'r', bold: 'ממצא חוסם בדוח הסוכן המפקח:', text: 'מונע אישור סופי ופרסום', button: 'טפל בממצא', tab: 'agent' }));
      } else if (t.ds === 'doc' && t.stageIdx === 1 && !missingTeamApprovals(t.holders, t.approvals, t.approverRoles).length) {
        // New with D1: the team approved, the manager's final action is due.
        out.push(tenderItem(t, 'final', { tone: 'w', bold: 'כל הצוות אישר:', text: 'ממתין לאישור הסופי שלך', button: 'אישור סופי של המכרז', tab: 'document' }));
      }
    }
    // Requests waiting for procurement (handoffActs0, line 1940).
    for (const r of c.requests.filter((x) => x.status === 'open'))
      out.push({
        key: `req:${r.serial}`,
        ref: r.ref,
        name: r.name,
        stageIdx: 0,
        tone: 'w',
        bold: 'בקשה חדשה מהדורש:',
        text: 'ממתינה להשלמה שלך',
        button: 'השלם את הבקשה',
        target: { kind: 'request', serial: r.serial },
        meta: `נשלח על ידי ${r.sentByName} · ${fmtStamp(r.sentAt)}`,
      });
    // Unit contacts still missing on the manager's cases (line 1945).
    for (const t of c.tenders.filter((x) => x.ownerUid === c.uid && x.stageIdx === 1)) {
      if (t.holders.legal && t.holders.finance) continue;
      out.push(
        tenderItem(t, 'contacts', {
          tone: 'g',
          bold: 'שיוך אנשי קשר:',
          text: `משפטי: ${t.holders.legal?.name ?? 'ממתין'} · כספים: ${t.holders.finance?.name ?? 'ממתין'}`,
          button: 'צפה',
          tab: 'overview',
          meta: 'נשלחה בקשת שיוך לשני הגופים',
        }),
      );
    }
    return out;
  }

  // The requester follows their own requests (handoffActs0, lines 1941–1943).
  for (const r of c.requests.filter((x) => x.status === 'open' && x.requesterUid === c.uid))
    out.push({
      key: `req:${r.serial}`,
      ref: r.ref,
      name: r.name,
      stageIdx: 0,
      tone: 'g',
      bold: 'בל"מ חדש בטיפול הרכש:',
      text: 'ממתין לבחירת סוג ולאישור',
      button: 'צפה בבל"מ',
      target: { kind: 'request', serial: r.serial },
      meta: `נשלחה ${fmtStamp(r.sentAt)}`,
    });
  for (const t of c.tenders) {
    const iAmRequester = t.holders.requester?.uid === c.uid;
    if (!iAmRequester || t.stageIdx !== 1 || t.ds === 'doc') continue;
    if (t.preparing)
      out.push(tenderItem(t, 'preparing', { tone: 'g', bold: 'הרכש אישר:', text: 'הטיוטה נוצרת כעת', button: 'צפה בבל"מ', tab: 'overview', meta: approvedMeta(t) }));
    else if (!t.draftSeen)
      out.unshift(tenderItem(t, 'ready', { tone: 'w', bold: 'הטיוטה מוכנה:', text: 'הרכש אישר את הבל"ם והכין טיוטה', button: 'פתח את הטיוטה', tab: 'document', meta: approvedMeta(t) }));
  }

  // Legal / finance: their unit's contact is still missing (line 1944).
  if (c.unitRole && ROLE_UNIT_HE[c.unitRole])
    for (const t of c.unassigned ?? [])
      out.push(
        tenderItem(t, `assign:${c.unitRole}`, {
          tone: 'w',
          bold: 'שיוך איש קשר:',
          text: `בל"מ חדש ממתין לאיש קשר מטעם ${ROLE_UNIT_HE[c.unitRole]}`,
          button: 'שייך',
          tab: 'overview',
          meta: approvedMeta(t),
          select: { role: c.unitRole },
        }),
      );

  // Approvals due from the signed-in team member (their turn has come, nothing blocks).
  for (const t of c.tenders) {
    if (t.stageIdx !== 1 || t.ds !== 'doc' || t.blockingCount > 0) continue;
    const mySlots = (Object.keys(t.holders) as TeamRole[]).filter((r) => t.holders[r]?.uid === c.uid);
    const pending = mySlots.filter((r) => !isApproved(t.holders, t.approvals, r));
    if (!pending.length) continue;
    if (pending.length === 1 && pending[0] === 'legal' && legalWaitsFor(t.holders, t.approvals, mySlots).length) continue;
    out.push(tenderItem(t, 'approve', { tone: 'w', bold: 'אישור סופי של המכרז:', text: 'המסמך מוכן לאישורך', button: 'פתח את המסמך', tab: 'document' }));
  }
  return out;
}

/** Items per stage for the stage chips (the first six stages). */
export function pendingStageCounts(items: PendingItem[]): number[] {
  return Array.from({ length: STAGE_BAR_COUNT }, (_, i) => items.filter((x) => x.stageIdx === i).length);
}
