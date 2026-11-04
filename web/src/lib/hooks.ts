import { useEffect, useState } from 'react';
import {
  collection,
  collectionGroup,
  doc,
  onSnapshot,
  query,
  where,
  orderBy,
  limit,
  getDoc,
} from 'firebase/firestore';
import { db } from './firebase';
import { api, type SupplierCase } from './api';
import { useAuth } from '../auth/AuthProvider';
import type {
  TenderDoc,
  BidRequestDoc,
  TemplateDoc,
  SupplierDoc,
  AccessDoc,
  QuestionDoc,
  AnswerDoc,
  AuditDoc,
  UserDoc,
  TenderType,
  SubmissionDoc,
  QuestionAuthorDoc,
  SupervisionReport,
  TenderProvenance,
  CaseScore,
  DocVersion,
  ScoreTargets,
  DciParams,
  FeedbackRequest,
  FeedbackDoc,
  SkillTipsRun,
  SkillsCatalog,
  ChatMessage,
  ConversionRun,
} from '@obms/shared';
import { DEFAULT_SCORE_TARGETS, DEFAULT_DCI_PARAMS, withBuiltinFills } from '@obms/shared';
import type { SupplierTenderView, ComparisonReport } from '@obms/shared';

// Managers see every case; other internal roles only the cases whose team they belong to
// (Firestore rules enforce the same — an unscoped query by a non-manager is denied).
export function useTenders() {
  const { user, role } = useAuth();
  const [tenders, setTenders] = useState<TenderDoc[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!user) return;
    const base = collection(db, 'tenders');
    const q =
      role === 'tender_manager'
        ? query(base, orderBy('createdAt', 'desc'))
        : query(base, where('memberUids', 'array-contains', user.uid), orderBy('createdAt', 'desc'));
    return onSnapshot(
      q,
      (snap) => {
        setTenders(snap.docs.map((d) => d.data() as TenderDoc));
        setLoading(false);
      },
      (e) => {
        console.error('useTenders: query error', e);
        setTenders([]);
        setLoading(false);
      },
    );
  }, [user, role]);
  return { tenders, loading };
}

export function useTender(id: string | undefined) {
  const [tender, setTender] = useState<TenderDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false); // not on this case's team
  useEffect(() => {
    if (!id) return;
    return onSnapshot(
      doc(db, 'tenders', id),
      (d) => {
        setTender(d.exists() ? (d.data() as TenderDoc) : null);
        setDenied(false);
        setLoading(false);
      },
      () => {
        setTender(null);
        setDenied(true);
        setLoading(false);
      },
    );
  }, [id]);
  return { tender, loading, denied };
}

// The manager sees every open request (procurement's inbox); anyone else only their own.
// Sorted in the browser — filtering on status/requester plus ordering would need a composite index.
export function useBidRequests() {
  const { user, role } = useAuth();
  const [requests, setRequests] = useState<BidRequestDoc[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!user) return;
    const base = collection(db, 'bidRequests');
    const q =
      role === 'tender_manager' ? query(base, where('status', '==', 'open')) : query(base, where('requesterUid', '==', user.uid));
    return onSnapshot(
      q,
      (snap) => {
        setRequests(snap.docs.map((d) => d.data() as BidRequestDoc).sort((a, b) => b.createdAt - a.createdAt));
        setLoading(false);
      },
      (e) => {
        console.error('useBidRequests: query error', e);
        setRequests([]);
        setLoading(false);
      },
    );
  }, [user, role]);
  return { requests, loading };
}

/** undefined while loading, null when it does not exist. */
export function useBidRequest(serial: string | undefined) {
  const [request, setRequest] = useState<BidRequestDoc | null | undefined>(undefined);
  useEffect(() => {
    setRequest(undefined);
    if (!serial) return;
    // A malformed id (e.g. an encoded "/") would make doc() throw: treat it as not found.
    if (!/^\d{4}-\d{1,3}$/.test(serial)) {
      setRequest(null);
      return;
    }
    return onSnapshot(
      doc(db, 'bidRequests', serial),
      (s) => setRequest(s.exists() ? (s.data() as BidRequestDoc) : null),
      (e) => {
        console.error('useBidRequest: snapshot error', e);
        // Only a definitive answer reads as "not found"; a transient error stays loading.
        if (e.code === 'permission-denied' || e.code === 'not-found') setRequest(null);
      },
    );
  }, [serial]);
  return { request };
}

export function useTemplates() {
  const [templates, setTemplates] = useState<TemplateDoc[]>([]);
  useEffect(() => {
    return onSnapshot(collection(db, 'templates'), (snap) =>
      setTemplates(snap.docs.map((d) => d.data() as TemplateDoc)),
    );
  }, []);
  return templates;
}

export function useTemplate(type: TenderType | undefined) {
  const [template, setTemplate] = useState<TemplateDoc | null>(null);
  useEffect(() => {
    setTemplate(null); // never show the previous type's template while the new one loads
    if (!type) return;
    let alive = true;
    void getDoc(doc(db, 'templates', type)).then((d) => {
      if (!alive) return;
      // As cases use it: with the built-in fill rules (manager email, guarantee, …) attached.
      const t = d.exists() ? (d.data() as TemplateDoc) : null;
      setTemplate(t ? { ...t, params: withBuiltinFills(t.params ?? []) } : null);
    });
    return () => {
      alive = false;
    };
  }, [type]);
  return template;
}

export function useSuppliers() {
  const [suppliers, setSuppliers] = useState<SupplierDoc[]>([]);
  useEffect(() => {
    return onSnapshot(collection(db, 'suppliers'), (snap) =>
      setSuppliers(snap.docs.map((d) => d.data() as SupplierDoc)),
    );
  }, []);
  return suppliers;
}

// The user directory is manager-only (rules); other roles get an empty list.
export function useUsers() {
  const { role } = useAuth();
  const [users, setUsers] = useState<UserDoc[]>([]);
  useEffect(() => {
    if (role !== 'tender_manager') return;
    return onSnapshot(
      collection(db, 'users'),
      (snap) => setUsers(snap.docs.map((d) => d.data() as UserDoc)),
      () => setUsers([]),
    );
  }, [role]);
  return users;
}

export function useAccess(tenderId: string | undefined) {
  const [access, setAccess] = useState<AccessDoc[]>([]);
  useEffect(() => {
    if (!tenderId) return;
    return onSnapshot(collection(db, 'tenders', tenderId, 'access'), (snap) =>
      setAccess(snap.docs.map((d) => d.data() as AccessDoc)),
    );
  }, [tenderId]);
  return access;
}

export function useQuestions(tenderId: string | undefined) {
  const [questions, setQuestions] = useState<QuestionDoc[]>([]);
  useEffect(() => {
    if (!tenderId) return;
    return onSnapshot(collection(db, 'tenders', tenderId, 'questions'), (snap) =>
      setQuestions(
        snap.docs.map((d) => d.data() as QuestionDoc).sort((a, b) => a.createdAt - b.createdAt),
      ),
    );
  }, [tenderId]);
  return questions;
}

/**
 * Who asked each question. Internal users get every author; a supplier gets ONLY their own
 * (the rules authorize on the supplierId field, so the query must filter by it or be denied).
 * Returns a questionId -> author map; a competitor is simply absent from it.
 */
export function useQuestionAuthors(tenderId: string | undefined, supplierId: string | null) {
  const [authors, setAuthors] = useState<Record<string, QuestionAuthorDoc>>({});
  useEffect(() => {
    if (!tenderId) return;
    const col = collection(db, 'tenders', tenderId, 'questionAuthors');
    // A supplier MUST constrain by their own id; an unfiltered list would be rejected.
    const q = supplierId ? query(col, where('supplierId', '==', supplierId)) : col;
    return onSnapshot(
      q,
      (snap) => {
        const next: Record<string, QuestionAuthorDoc> = {};
        for (const d of snap.docs) next[d.id] = d.data() as QuestionAuthorDoc;
        setAuthors(next);
      },
      () => setAuthors({}),
    );
  }, [tenderId, supplierId]);
  return authors;
}

// Manager: all submissions for a tender (rules allow manager list). Supplier: own only.
export function useSubmissions(tenderId: string | undefined) {
  const [submissions, setSubmissions] = useState<SubmissionDoc[]>([]);
  useEffect(() => {
    if (!tenderId) return;
    return onSnapshot(
      collection(db, 'tenders', tenderId, 'submissions'),
      (snap) => setSubmissions(snap.docs.map((d) => d.data() as SubmissionDoc)),
      () => setSubmissions([]),
    );
  }, [tenderId]);
  return submissions;
}

// A supplier's own submission (single-doc read; rules forbid listing the whole subcollection).
export function useAnswers(tenderId: string | undefined) {
  const [answers, setAnswers] = useState<AnswerDoc[]>([]);
  useEffect(() => {
    if (!tenderId) return;
    return onSnapshot(collection(db, 'tenders', tenderId, 'answers'), (snap) =>
      setAnswers(snap.docs.map((d) => d.data() as AnswerDoc)),
    );
  }, [tenderId]);
  return answers;
}

// Suppliers list only the tenders shared with them, via their access docs (collection group).
// ---- the supplier's side: data only through Cloud Functions (no direct Firestore access) ----

/** The supplier's cases (safe projection), refreshed every 30 s. */
export function useSupplierTenders(supplierId: string | null) {
  const [tenders, setTenders] = useState<SupplierTenderView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (!supplierId) return;
    let alive = true;
    const load = () =>
      api
        .supplierListTenders({})
        .then((r) => alive && (setTenders(r.tenders), setError(false)))
        .catch(() => alive && setError(true))
        .finally(() => alive && setLoading(false));
    void load();
    const timer = setInterval(load, 30_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [supplierId]);
  return { tenders, loading, error };
}

/** One case as the supplier may see it (questions, answers, own submission), refreshed every 30 s. */
export function useSupplierCase(tenderId: string | undefined) {
  const [data, setData] = useState<SupplierCase | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!tenderId) return;
    let alive = true;
    const load = () =>
      api
        .supplierGetTender({ tenderId })
        .then((r) => alive && (setData(r), setError('')))
        .catch((e) => alive && setError(e instanceof Error ? e.message : String(e)))
        .finally(() => alive && setLoading(false));
    void load();
    const timer = setInterval(load, 30_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [tenderId, tick]);
  return { data, loading, error, reload: () => setTick((n) => n + 1) };
}

export function useAllAccess() {
  const [rows, setRows] = useState<(AccessDoc & { tenderId: string })[]>([]);
  useEffect(() => {
    return onSnapshot(
      collectionGroup(db, 'access'),
      (snap) =>
        setRows(
          snap.docs.map((d) => ({
            ...(d.data() as AccessDoc),
            tenderId: d.ref.parent.parent?.id ?? '',
          })),
        ),
      (e) => {
        console.error('useAllAccess: query error', e);
        setRows([]);
      },
    );
  }, []);
  return rows;
}

// Manager reporting: all submissions across tenders (rules allow manager read).
export function useAllSubmissions() {
  const [rows, setRows] = useState<{ tenderId: string; supplierId: string }[]>([]);
  useEffect(() => {
    const unsub = onSnapshot(
      collectionGroup(db, 'submissions'),
      (snap) =>
        setRows(
          snap.docs.map((d) => ({
            tenderId: d.ref.parent.parent?.id ?? '',
            supplierId: d.id,
          })),
        ),
      () => setRows([]),
    );
    return unsub;
  }, []);
  return rows;
}

// Audit entries for one bid (the "case" trail). Rules allow internal read of auditLog.
export function useTenderAudit(tenderId: string | undefined) {
  const [rows, setRows] = useState<AuditDoc[]>([]);
  useEffect(() => {
    if (!tenderId) return;
    return onSnapshot(
      query(collection(db, 'auditLog'), where('tenderId', '==', tenderId)),
      (snap) => setRows(snap.docs.map((d) => d.data() as AuditDoc).sort((a, b) => b.at - a.at)),
      () => setRows([]),
    );
  }, [tenderId]);
  return rows;
}

// Supervisor agent runs for one bid, newest first (internal-only by rules).
export function useSupervision(tenderId: string | undefined) {
  const [reports, setReports] = useState<SupervisionReport[]>([]);
  useEffect(() => {
    if (!tenderId) return;
    return onSnapshot(
      collection(db, 'tenders', tenderId, 'supervision'),
      (snap) => setReports(snap.docs.map((d) => d.data() as SupervisionReport).sort((a, b) => b.at - a.at)),
      () => setReports([]),
    );
  }, [tenderId]);
  return reports;
}

// Internal-only tender data: provenance (template/skills/AI draft) + confidential params (G6).
export function useTenderInternal(tenderId: string | undefined) {
  const [provenance, setProvenance] = useState<TenderProvenance | null>(null);
  const [params, setParams] = useState<Record<string, string | number>>({});
  const [pendingSuppliers, setPendingSuppliers] = useState<string[]>([]);
  const [comparison, setComparison] = useState<ComparisonReport | null>(null);
  useEffect(() => {
    if (!tenderId) return;
    // The AI comparison report is internal (case members only), never on the tender doc.
    const unsubC = onSnapshot(
      doc(db, 'tenders', tenderId, 'internal', 'comparison'),
      (d) => setComparison(d.exists() ? (d.data() as ComparisonReport) : null),
      () => setComparison(null),
    );
    // Suppliers picked for publication (internal until the case is published).
    const unsubS = onSnapshot(
      doc(db, 'tenders', tenderId, 'internal', 'suppliers'),
      (d) => setPendingSuppliers(d.exists() ? ((d.data().supplierIds as string[]) ?? []) : []),
      () => setPendingSuppliers([]),
    );
    const unsubP = onSnapshot(
      doc(db, 'tenders', tenderId, 'internal', 'provenance'),
      (d) => setProvenance(d.exists() ? (d.data() as TenderProvenance) : null),
      () => setProvenance(null),
    );
    const unsubI = onSnapshot(
      doc(db, 'tenders', tenderId, 'internal', 'params'),
      (d) => setParams(d.exists() ? (d.data() as Record<string, string | number>) : {}),
      () => setParams({}),
    );
    return () => {
      unsubP();
      unsubI();
      unsubS();
      unsubC();
    };
  }, [tenderId]);
  return { provenance, params, pendingSuppliers, comparison };
}

// Success score of one bid case (internal-only by rules).
export function useCaseScore(tenderId: string | undefined) {
  const [score, setScore] = useState<CaseScore | null>(null);
  useEffect(() => {
    if (!tenderId) return;
    return onSnapshot(
      doc(db, 'caseScores', tenderId),
      (d) => setScore(d.exists() ? (d.data() as CaseScore) : null),
      () => setScore(null),
    );
  }, [tenderId]);
  return score;
}

export function useCaseScores() {
  const [scores, setScores] = useState<CaseScore[]>([]);
  useEffect(() => {
    return onSnapshot(
      collection(db, 'caseScores'),
      (snap) => setScores(snap.docs.map((d) => d.data() as CaseScore)),
      () => setScores([]),
    );
  }, []);
  return scores;
}

// Stored content versions of a bid document (internal-only).
export function useVersions(tenderId: string | undefined) {
  const [versions, setVersions] = useState<DocVersion[]>([]);
  useEffect(() => {
    if (!tenderId) return;
    return onSnapshot(
      doc(db, 'tenders', tenderId, 'internal', 'versions'),
      (d) => setVersions(d.exists() ? ((d.data() as { list: DocVersion[] }).list ?? []) : []),
      () => setVersions([]),
    );
  }, [tenderId]);
  return versions;
}

// Scoring targets + DCI parameters: defaults overridden by settings/scoring.
export function useScoringTargets() {
  const [settings, setSettings] = useState<{ targets: ScoreTargets; dci: DciParams }>({
    targets: DEFAULT_SCORE_TARGETS,
    dci: DEFAULT_DCI_PARAMS,
  });
  useEffect(() => {
    return onSnapshot(
      doc(db, 'settings', 'scoring'),
      (d) => {
        const data = d.data() as { targets?: Partial<ScoreTargets>; dci?: Partial<DciParams> } | undefined;
        setSettings({
          targets: { ...DEFAULT_SCORE_TARGETS, ...(data?.targets ?? {}) },
          dci: { ...DEFAULT_DCI_PARAMS, ...(data?.dci ?? {}) },
        });
      },
      () => setSettings({ targets: DEFAULT_SCORE_TARGETS, dci: DEFAULT_DCI_PARAMS }),
    );
  }, []);
  return settings;
}

// The signed-in user's pending feedback requests (Dashboard card + nav badge).
export function useMyFeedbackRequests(uid: string | undefined) {
  const [rows, setRows] = useState<FeedbackRequest[]>([]);
  useEffect(() => {
    if (!uid) return;
    return onSnapshot(
      query(collection(db, 'feedbackRequests'), where('uid', '==', uid), where('status', '==', 'pending')),
      (snap) => setRows(snap.docs.map((d) => d.data() as FeedbackRequest).sort((a, b) => b.createdAt - a.createdAt)),
      () => setRows([]),
    );
  }, [uid]);
  return rows;
}

// Manager view: all feedback requests + answers for one bid case.
export function useTenderFeedback(tenderId: string | undefined, enabled: boolean) {
  const [requests, setRequests] = useState<FeedbackRequest[]>([]);
  const [feedback, setFeedback] = useState<FeedbackDoc[]>([]);
  useEffect(() => {
    if (!tenderId || !enabled) return;
    const u1 = onSnapshot(
      query(collection(db, 'feedbackRequests'), where('tenderId', '==', tenderId)),
      (snap) => setRequests(snap.docs.map((d) => d.data() as FeedbackRequest)),
      () => setRequests([]),
    );
    const u2 = onSnapshot(
      collection(db, 'tenders', tenderId, 'feedback'),
      (snap) => setFeedback(snap.docs.map((d) => d.data() as FeedbackDoc)),
      () => setFeedback([]),
    );
    return () => {
      u1();
      u2();
    };
  }, [tenderId, enabled]);
  return { requests, feedback };
}

// Manager reporting: all feedback across bids.
export function useAllFeedback(enabled: boolean) {
  const [rows, setRows] = useState<FeedbackDoc[]>([]);
  useEffect(() => {
    if (!enabled) return;
    return onSnapshot(
      collectionGroup(db, 'feedback'),
      (snap) => setRows(snap.docs.map((d) => d.data() as FeedbackDoc)),
      () => setRows([]),
    );
  }, [enabled]);
  return rows;
}

// Latest skill-tips run for a bid type.
export function useLatestSkillTips(type: TenderType) {
  const [run, setRun] = useState<SkillTipsRun | null>(null);
  useEffect(() => {
    return onSnapshot(
      query(collection(db, 'skillTips', type, 'runs'), orderBy('createdAt', 'desc'), limit(1)),
      (snap) => setRun(snap.empty ? null : (snap.docs[0].data() as SkillTipsRun)),
      () => setRun(null),
    );
  }, [type]);
  return run;
}

export function useAudit() {
  const [audit, setAudit] = useState<AuditDoc[]>([]);
  useEffect(() => {
    return onSnapshot(collection(db, 'auditLog'), (snap) =>
      setAudit(snap.docs.map((d) => d.data() as AuditDoc).sort((a, b) => b.at - a.at)),
    );
  }, []);
  return audit;
}

// Read-only skills catalog from the deployed functions. Changes only on deploy, so one fetch per
// session is shared by every component.
let catalogPromise: Promise<SkillsCatalog> | null = null;
export function useSkillsCatalog() {
  const [catalog, setCatalog] = useState<SkillsCatalog | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    catalogPromise ??= api.getSkillsCatalog({});
    let alive = true;
    catalogPromise.then(
      (c) => alive && setCatalog(c),
      (e) => {
        catalogPromise = null; // allow a retry on the next mount
        if (alive) setError(e instanceof Error ? e.message : String(e));
      },
    );
    return () => {
      alive = false;
    };
  }, []);
  return { catalog, error };
}

// Internal chat of a case team, oldest first, plus the caller's unread count.
export function useChat(tenderId: string | undefined, uid: string | undefined) {
  const [messages, setMessages] = useState<(ChatMessage & { at: number })[]>([]);
  const [lastReadAt, setLastReadAt] = useState<number>(0);
  useEffect(() => {
    if (!tenderId) return;
    return onSnapshot(
      query(collection(db, 'tenders', tenderId, 'chat'), orderBy('createdAt', 'asc')),
      (snap) =>
        setMessages(
          snap.docs.map((d) => {
            const m = d.data() as ChatMessage;
            const ts = m.createdAt as { toMillis?: () => number } | number | null;
            // Pending local writes have no server time yet — treat them as "now".
            const at = typeof ts === 'number' ? ts : ts?.toMillis?.() ?? Date.now();
            return { ...m, at };
          }),
        ),
      () => setMessages([]),
    );
  }, [tenderId]);
  useEffect(() => {
    if (!tenderId || !uid) return;
    return onSnapshot(
      doc(db, 'tenders', tenderId, 'chatReads', uid),
      (d) => setLastReadAt((d.data()?.lastReadAt as { toMillis?: () => number } | undefined)?.toMillis?.() ?? 0),
      () => setLastReadAt(0),
    );
  }, [tenderId, uid]);
  const unread = messages.filter((m) => m.uid !== uid && m.at > lastReadAt).length;
  return { messages, unread };
}

// Latest template-conversion proposal for a type (manager review).
export function useLatestConversion(type: TenderType) {
  const [run, setRun] = useState<ConversionRun | null>(null);
  useEffect(() => {
    return onSnapshot(
      query(collection(db, 'templates', type, 'conversions'), orderBy('createdAt', 'desc'), limit(1)),
      (snap) => setRun(snap.empty ? null : (snap.docs[0].data() as ConversionRun)),
      () => setRun(null),
    );
  }, [type]);
  return run;
}
