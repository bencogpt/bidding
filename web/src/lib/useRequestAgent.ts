import { useCallback, useEffect, useRef, useState } from 'react';
import {
  BRIEF_MAX_LENGTH,
  BUDGET_MIN,
  agentDetailsFromFields,
  detectAmount,
  needsAgent,
  parseAmount,
  type AskKey,
  type AssistRequestResult,
} from '@obms/shared';
import { api } from './api';

export type Mode = 'free' | 'chat';
export interface ChatMsg {
  role: 'agent' | 'user';
  text: string;
  local?: boolean; // shown in the chat but never sent to the server (the frame amount, GLOBAL_RULES G6)
}
/** What the chat is waiting for: a server question, or the frame amount which the browser asks and keeps. */
export type Asking = AskKey | 'budget';
export interface Fields {
  service_name: string;
  document_classification: string;
  annual_budget: string;
  contract_years: string;
  // optional answers
  service_location: string;
  provider_responsibilities: string;
  team_lead_role: string;
  min_pool_candidates: string;
  service_providers_total: string;
  supplier_equipment: string;
  work_hours: string;
}

export const DEFAULT_CLASSIFICATION = 'בלמ"ס';
// The frame amount is asked by the agent in the chat, but the question and the answer stay in the browser:
// the model never sees the budget (GLOBAL_RULES G6).
const BUDGET_Q = 'מה סכום המסגרת המקסימלי, בש"ח? אפשר לכתוב למשל 1.2 מיליון או 1,200,000.';
const BUDGET_CHIPS = ['חצי מיליון', 'מיליון', '2 מיליון', '5 מיליון'];
const BUDGET_RETRY = 'לא הצלחתי להבין את הסכום. אפשר לכתוב למשל 1.2 מיליון או 1,200,000.';
const GREETING_LOCAL = 'שלום, כדי להשלים את הבקשה אשאל כמה שאלות, אחת בכל פעם.';
const SERVER_GREETING = /^שלום, אעזור לך להשלים את הבקשה\. אשאל שאלה אחת בכל פעם\.\s*/;
const MANDATORY: readonly string[] = ['service_name', 'document_classification', 'scope', 'contract_years'];
const CLARIFY = 'הבהרות מהדורש:';
const initialFields = (): Fields => ({
  service_name: '',
  document_classification: DEFAULT_CLASSIFICATION,
  annual_budget: '',
  contract_years: '',
  service_location: '',
  provider_responsibilities: '',
  team_lead_role: '',
  min_pool_candidates: '',
  service_providers_total: '',
  supplier_equipment: '',
  work_hours: '',
});

// The optional answers are collected only by the agent (the screen does not show them).
const OPTIONAL_KEYS: readonly (keyof Fields)[] = [
  'service_location',
  'provider_responsibilities',
  'team_lead_role',
  'min_pool_candidates',
  'service_providers_total',
  'supplier_equipment',
  'work_hours',
];

export function useRequestAgent() {
  const [brief, setBrief] = useState('');
  const [fields, setFields] = useState<Fields>(initialFields);
  const [mode, setModeState] = useState<Mode>('free');
  const [chat, setChat] = useState<ChatMsg[]>([]);
  const [chips, setChips] = useState<string[]>([]);
  const [asking, setAsking] = useState<Asking | null>(null);
  const [textAsking, setTextAsking] = useState<AskKey | null>(null); // what the agent would ask next, read from the text
  const [qualityAsked, setQualityAsked] = useState(0);
  const [typing, setTyping] = useState(false);
  const [limited, setLimited] = useState(false);
  const [error, setError] = useState('');
  const touched = useRef(new Set<keyof Fields>()); // fields the person typed: detection never overwrites them
  const answered = useRef(new Set<keyof Fields>()); // values the chat itself established: sent back so they are not asked again
  const fieldsRef = useRef(fields);
  fieldsRef.current = fields;
  const extractSeq = useRef(0); // a newer extraction supersedes an older one
  const chatSeq = useRef(0); // a newer chat turn supersedes an older one; extraction never cancels a chat turn
  const greeted = useRef(false);
  const held = useRef<AssistRequestResult | null>(null); // the server's next question, kept while the amount is asked
  const budgetOk = () => {
    const n = Number(fieldsRef.current.annual_budget);
    return Number.isFinite(n) && n >= BUDGET_MIN;
  };

  const applyDetails = useCallback((d: AssistRequestResult['details'], fromChat = false) => {
    if (fromChat) {
      for (const k of Object.keys(d)) if (!touched.current.has(k as keyof Fields)) answered.current.add(k as keyof Fields);
    }
    // Every detected value fills its box unless the person typed in it.
    setFields((f) => {
      const next = { ...f };
      for (const [k, v] of Object.entries(d)) {
        if (v !== undefined && k in f && !touched.current.has(k as keyof Fields)) {
          next[k as keyof Fields] = String(v);
        }
      }
      return next;
    });
  }, []);

  // What the agent may see. An optional answer counts only once the chat established it, so editing the text
  // re-reads it; the budget is never included (GLOBAL_RULES G6).
  const detailsForAgent = () => {
    const d = agentDetailsFromFields({ ...fieldsRef.current }, new Set([...touched.current, ...answered.current]));
    const loose = d as Record<string, unknown>;
    for (const k of OPTIONAL_KEYS) if (!answered.current.has(k)) delete loose[k];
    return d;
  };

  const setField = (k: keyof Fields, v: string) => {
    if (v.trim() && !(k === 'document_classification' && v === DEFAULT_CLASSIFICATION)) touched.current.add(k);
    else touched.current.delete(k);
    setFields((f) => ({ ...f, [k]: v }));
  };

  // Free writing: after a pause, ask the agent to read the details out of the text. A convenience only.
  useEffect(() => {
    setTextAsking(null); // the text changed: what is left to ask is unknown until it has been read again
    // An amount written in the text ("עד 1.2 מיליון ש\"ח") fills the frame amount, here in the browser only.
    const written = detectAmount(brief);
    if (written >= BUDGET_MIN && !touched.current.has('annual_budget')) {
      setFields((f) => (f.annual_budget === String(written) ? f : { ...f, annual_budget: String(written) }));
    }
    if (mode !== 'free' || brief.trim().length < 20) return;
    const mine = ++extractSeq.current;
    const t = setTimeout(async () => {
      try {
        const r = await api.assistRequest({
          mode: 'extract',
          brief,
          details: detailsForAgent(),
          history: [],
          qualityAsked: 0,
        });
        if (mine !== extractSeq.current) return;
        applyDetails(r.details);
        setTextAsking(r.asking);
        setLimited(r.source === 'script');
      } catch {
        /* detection is optional: the panel stays editable by hand */
      }
    }, 1200);
    return () => clearTimeout(t);
  }, [brief, mode, applyDetails]);

  const turn = useCallback(
    async (history: ChatMsg[], nextBrief: string, nextQuality: number) => {
      const mine = ++chatSeq.current;
      setTyping(true);
      setChips([]);
      setError('');
      try {
        const r = await api.assistRequest({
          mode: 'chat',
          brief: nextBrief,
          details: detailsForAgent(),
          // the server caps each chat turn at 1000 characters; a long principal service travels in the brief
          history: history
            .filter((m) => !m.local)
            .slice(-20)
            .map((m) => ({ role: m.role, text: m.text.slice(0, 1000) })),
          qualityAsked: nextQuality,
        });
        if (mine !== chatSeq.current) return;
        applyDetails(r.details, true);
        setLimited(r.source === 'script');
        // Once the mandatory questions are done, the agent asks the frame amount before going on.
        if (!budgetOk() && !MANDATORY.includes(r.asking)) {
          held.current = r;
          const lead: ChatMsg[] = history.length === 0 ? [{ role: 'agent', text: GREETING_LOCAL, local: true }] : [];
          greeted.current = lead.length > 0; // the held question must not greet a second time
          setChat([...history, ...lead, { role: 'agent', text: BUDGET_Q, local: true }]);
          setAsking('budget');
          setChips(BUDGET_CHIPS);
        } else {
          setAsking(r.asking);
          setChips(r.chips);
          if (r.message) setChat([...history, { role: 'agent', text: r.message }]);
        }
      } catch (e) {
        if (mine === chatSeq.current) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (mine === chatSeq.current) setTyping(false);
      }
    },
    [applyDetails],
  );

  const setMode = (m: Mode) => {
    setModeState(m);
    if (m === 'chat' && chat.length === 0) void turn([], brief, qualityAsked);
  };

  // Text mode, "המשך": the agent asks only for what the text did not give (the optional extras are not part of it).
  const continueToAgent = () => {
    setQualityAsked(3);
    setModeState('chat');
    if (chat.length === 0) void turn([], brief, 3);
  };

  // In text mode the text is enough only when the agent has nothing left to ask for.
  const needsMore = textAsking === null ? true : needsAgent(textAsking);

  // The answer to the frame-amount question is read here, never sent: it fills the amount, then the server's
  // next question (kept in `held`) is shown.
  const answerBudget = (t: string) => {
    const n = parseAmount(t);
    const user: ChatMsg = { role: 'user', text: t, local: true };
    const base = [...chat, user];
    const reply = (text: string): ChatMsg => ({ role: 'agent', text, local: true });
    if (n === 0) {
      setChat([...base, reply(BUDGET_RETRY)]);
      setChips(BUDGET_CHIPS);
      return;
    }
    if (n < BUDGET_MIN) {
      setChat([...base, reply(`הסכום המינימלי הוא ₪${BUDGET_MIN.toLocaleString('en-US')}. כתבו סכום גבוה יותר.`)]);
      setChips(BUDGET_CHIPS);
      return;
    }
    touched.current.add('annual_budget');
    fieldsRef.current = { ...fieldsRef.current, annual_budget: String(n) };
    setFields((f) => ({ ...f, annual_budget: String(n) }));
    const ack = reply(`רשמתי ₪${n.toLocaleString('en-US')}.`);
    const next = held.current;
    held.current = null;
    if (next) {
      const said = greeted.current ? next.message.replace(SERVER_GREETING, '') : next.message;
      greeted.current = false;
      setChat([...base, ack, ...(said ? [{ role: 'agent' as const, text: said }] : [])]);
      setAsking(next.asking);
      setChips(next.chips);
    } else {
      setChat([...base, ack]);
      void turn([...base, ack], brief, qualityAsked);
    }
  };

  // An answer to a "scope" or "quality" question belongs to the brief; the other answers are read by the agent.
  const say = (text: string) => {
    if (asking === 'budget') {
      if (text.trim() && !typing) answerBudget(text.trim().slice(0, 100));
      return;
    }
    const full = text.trim().slice(0, BRIEF_MAX_LENGTH);
    const t = asking === 'scope' ? full : full.slice(0, 1000); // only the principal service may run long
    if (!t || typing || asking === 'done') return;
    let nextBrief = brief;
    let nextQuality = qualityAsked;
    if (asking === 'scope') nextBrief = brief ? `${brief}\n${t}` : t;
    if (asking === 'quality') {
      nextQuality += 1;
      if (t !== 'דלג') nextBrief = brief.includes(CLARIFY) ? `${brief}\n- ${t}` : `${brief}\n\n${CLARIFY}\n- ${t}`;
    }
    nextBrief = nextBrief.slice(0, BRIEF_MAX_LENGTH);
    setBrief(nextBrief);
    setQualityAsked(nextQuality);
    const history = [...chat, { role: 'user' as const, text: t }];
    setChat(history);
    void turn(history, nextBrief, nextQuality);
  };

  const reset = () => {
    extractSeq.current++;
    chatSeq.current++;
    touched.current.clear();
    answered.current.clear();
    held.current = null;
    greeted.current = false;
    setBrief('');
    setFields(initialFields());
    setModeState('free');
    setChat([]);
    setChips([]);
    setAsking(null);
    setTextAsking(null);
    setQualityAsked(0);
    setTyping(false);
    setLimited(false);
    setError('');
  };

  return {
    brief,
    setBrief,
    fields,
    setField,
    mode,
    setMode,
    continueToAgent,
    needsMore,
    chat,
    chips,
    asking,
    typing,
    limited,
    error,
    say,
    reset,
  };
}
