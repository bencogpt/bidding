import { useCallback, useEffect, useRef, useState } from 'react';
import { BRIEF_MAX_LENGTH, agentDetailsFromFields, type AskKey, type AssistRequestResult } from '@obms/shared';
import { api } from './api';

export type Mode = 'free' | 'chat';
export interface ChatMsg {
  role: 'agent' | 'user';
  text: string;
}
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

export function useRequestAgent() {
  const [brief, setBrief] = useState('');
  const [fields, setFields] = useState<Fields>(initialFields);
  const [mode, setModeState] = useState<Mode>('free');
  const [chat, setChat] = useState<ChatMsg[]>([]);
  const [chips, setChips] = useState<string[]>([]);
  const [asking, setAsking] = useState<AskKey | null>(null);
  const [qualityAsked, setQualityAsked] = useState(0);
  const [typing, setTyping] = useState(false);
  const [limited, setLimited] = useState(false);
  const [error, setError] = useState('');
  const touched = useRef(new Set<keyof Fields>()); // fields the person typed: detection never overwrites them
  const answered = useRef(new Set<keyof Fields>()); // classification the chat itself established: sent back so it is not asked again
  const fieldsRef = useRef(fields);
  fieldsRef.current = fields;
  const extractSeq = useRef(0); // a newer extraction supersedes an older one
  const chatSeq = useRef(0); // a newer chat turn supersedes an older one; extraction never cancels a chat turn

  const applyDetails = useCallback((d: AssistRequestResult['details'], fromChat = false) => {
    if (fromChat && d.document_classification && !touched.current.has('document_classification')) {
      answered.current.add('document_classification');
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

  const setField = (k: keyof Fields, v: string) => {
    if (v.trim() && !(k === 'document_classification' && v === DEFAULT_CLASSIFICATION)) touched.current.add(k);
    else touched.current.delete(k);
    setFields((f) => ({ ...f, [k]: v }));
  };

  // Free writing: after a pause, ask the agent to read the details out of the text. A convenience only.
  useEffect(() => {
    if (mode !== 'free' || brief.trim().length < 20) return;
    const mine = ++extractSeq.current;
    const t = setTimeout(async () => {
      try {
        const r = await api.assistRequest({
          mode: 'extract',
          brief,
          details: agentDetailsFromFields({ ...fieldsRef.current }, new Set([...touched.current, ...answered.current])),
          history: [],
          qualityAsked: 0,
        });
        if (mine !== extractSeq.current) return;
        applyDetails(r.details);
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
          details: agentDetailsFromFields({ ...fieldsRef.current }, new Set([...touched.current, ...answered.current])),
          history: history.slice(-20),
          qualityAsked: nextQuality,
        });
        if (mine !== chatSeq.current) return;
        applyDetails(r.details, true);
        setLimited(r.source === 'script');
        setAsking(r.asking);
        setChips(r.chips);
        if (r.message) setChat([...history, { role: 'agent', text: r.message }]);
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

  // An answer to a "scope" or "quality" question belongs to the brief; the other answers are read by the agent.
  const say = (text: string) => {
    const t = text.trim().slice(0, 1000); // the server caps each chat turn at 1000 characters
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
    setBrief('');
    setFields(initialFields());
    setModeState('free');
    setChat([]);
    setChips([]);
    setAsking(null);
    setQualityAsked(0);
    setTyping(false);
    setLimited(false);
    setError('');
  };

  return { brief, setBrief, fields, setField, mode, setMode, chat, chips, asking, typing, limited, error, say, reset };
}
