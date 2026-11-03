import { useCallback, useEffect, useRef, useState } from 'react';
import type { AskKey, AssistRequestResult } from '@obms/shared';
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
}

export const DEFAULT_CLASSIFICATION = 'בלמ"ס';
const CLARIFY = 'הבהרות מהדורש:';
const initialFields = (): Fields => ({
  service_name: '',
  document_classification: DEFAULT_CLASSIFICATION,
  annual_budget: '',
  contract_years: '',
});

// What the agent may see. The budget is deliberately not here (GLOBAL_RULES G6).
function agentDetails(f: Fields) {
  const out: { service_name?: string; document_classification?: string; contract_years?: number } = {};
  if (f.service_name.trim()) out.service_name = f.service_name.trim();
  if (f.document_classification.trim()) out.document_classification = f.document_classification.trim();
  const y = Number(f.contract_years);
  if (f.contract_years.trim() && Number.isInteger(y) && y >= 1 && y <= 30) out.contract_years = y;
  return out;
}

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
  const fieldsRef = useRef(fields);
  fieldsRef.current = fields;
  const seq = useRef(0);

  const applyDetails = useCallback((d: AssistRequestResult['details']) => {
    setFields((f) => ({
      ...f,
      ...(d.service_name && !touched.current.has('service_name') ? { service_name: d.service_name } : {}),
      ...(d.document_classification && !touched.current.has('document_classification')
        ? { document_classification: d.document_classification }
        : {}),
      ...(d.contract_years && !touched.current.has('contract_years') ? { contract_years: String(d.contract_years) } : {}),
    }));
  }, []);

  const setField = (k: keyof Fields, v: string) => {
    if (v.trim() && !(k === 'document_classification' && v === DEFAULT_CLASSIFICATION)) touched.current.add(k);
    else touched.current.delete(k);
    setFields((f) => ({ ...f, [k]: v }));
  };

  // Free writing: after a pause, ask the agent to read the details out of the text. A convenience only.
  useEffect(() => {
    if (mode !== 'free' || brief.trim().length < 20) return;
    const mine = ++seq.current;
    const t = setTimeout(async () => {
      try {
        const r = await api.assistRequest({
          mode: 'extract',
          brief,
          details: agentDetails(fieldsRef.current),
          history: [],
          qualityAsked: 0,
        });
        if (mine !== seq.current) return;
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
      const mine = ++seq.current;
      setTyping(true);
      setChips([]);
      setError('');
      try {
        const r = await api.assistRequest({
          mode: 'chat',
          brief: nextBrief,
          details: agentDetails(fieldsRef.current),
          history: history.slice(-20),
          qualityAsked: nextQuality,
        });
        if (mine !== seq.current) return;
        applyDetails(r.details);
        setLimited(r.source === 'script');
        setAsking(r.asking);
        setChips(r.chips);
        if (r.message) setChat([...history, { role: 'agent', text: r.message }]);
      } catch (e) {
        if (mine === seq.current) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (mine === seq.current) setTyping(false);
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
    const t = text.trim();
    if (!t || typing || asking === 'done') return;
    let nextBrief = brief;
    let nextQuality = qualityAsked;
    if (asking === 'scope') nextBrief = brief ? `${brief}\n${t}` : t;
    if (asking === 'quality') {
      nextQuality += 1;
      if (t !== 'דלג') nextBrief = brief.includes(CLARIFY) ? `${brief}\n- ${t}` : `${brief}\n\n${CLARIFY}\n- ${t}`;
    }
    setBrief(nextBrief);
    setQualityAsked(nextQuality);
    const history = [...chat, { role: 'user' as const, text: t }];
    setChat(history);
    void turn(history, nextBrief, nextQuality);
  };

  const reset = () => {
    seq.current++;
    touched.current.clear();
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
