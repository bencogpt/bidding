// aiService — Claude (Anthropic) integration.
//
// Called ONLY from Cloud Functions (never the client). API key from ANTHROPIC_API_KEY
// (Secret Manager in prod). Output is auditable and NON-BINDING — the tender manager always
// makes the final decision (constitution principle #6). If no API key is configured, both
// functions fall back to a deterministic local heuristic so the slice still runs.
import Anthropic from '@anthropic-ai/sdk';
import type {
  QuestionDoc,
  TemplateDoc,
  TenderType,
  BidDraft,
  ExternalSupplierSuggestion,
  ExternalSearchStatus,
} from '@obms/shared';
import { TENDER_TYPE_LABELS_HE, isSystemParam, isConfidentialParam, isFormHidden, templateIdFor } from '@obms/shared';
import type { LoadedSkill } from './skillsRegistry.js';

const CLUSTER_MODEL = process.env.ANTHROPIC_CLUSTER_MODEL ?? 'claude-sonnet-4-6';
export const COMPARE_MODEL = process.env.ANTHROPIC_COMPARE_MODEL ?? 'claude-opus-4-8';

export function getClient(): Anthropic | null {
  // Hermetic under the emulator (mirrors docsService.realMode()): the emulator pulls the real
  // secret from Secret Manager, which would make local tests hit the live API — slow, billable,
  // and non-deterministic. Set ALLOW_REAL_AI_IN_EMULATOR=true to opt back in deliberately.
  if (
    process.env.FUNCTIONS_EMULATOR === 'true' &&
    process.env.ALLOW_REAL_AI_IN_EMULATOR !== 'true'
  ) {
    return null;
  }
  const apiKey = process.env.ANTHROPIC_API_KEY;
  return apiKey ? new Anthropic({ apiKey }) : null;
}

/**
 * Extract the forced tool_use input from a Claude response.
 *
 * Rejects output cut short by `max_tokens`: the tool JSON is then incomplete, and callers here
 * all use `?? []` / `?? {}` fallbacks — so a truncated response would silently degrade into
 * missing fields (e.g. an empty evaluationCriteria rubric that later feeds runComparison)
 * instead of failing. Better to raise and let the caller return its labelled fallback.
 */
export function toolInput<T>(resp: {
  stop_reason?: string | null;
  content: Array<{ type: string; input?: unknown }>;
}): T {
  if (resp.stop_reason === 'max_tokens') {
    throw new Error('Claude output was truncated at max_tokens — tool result is incomplete');
  }
  const block = resp.content.find((b) => b.type === 'tool_use');
  if (!block) throw new Error('Claude did not return tool output');
  return block.input as T;
}

export interface QuestionCluster {
  clusterId: string;
  questionIds: string[];
  representativeText: string;
}

// ---- Question clustering ----

function naiveClusters(questions: QuestionDoc[]): QuestionCluster[] {
  const norm = (t: string) =>
    t
      .toLowerCase()
      .replace(/[?.,!"'()]/g, '')
      .split(/\s+/)
      .filter((w) => w.length > 2)
      .sort()
      .slice(0, 4)
      .join(' ');
  const buckets = new Map<string, QuestionDoc[]>();
  for (const q of questions) {
    const key = norm(q.text) || q.id;
    buckets.set(key, [...(buckets.get(key) ?? []), q]);
  }
  let i = 0;
  return [...buckets.values()].map((group) => ({
    clusterId: `cluster_${++i}`,
    questionIds: group.map((g) => g.id),
    representativeText: group[0].text,
  }));
}

/** Group semantically similar clarification questions so the manager answers each once. */
export async function clusterQuestions(questions: QuestionDoc[]): Promise<QuestionCluster[]> {
  if (questions.length === 0) return [];
  const client = getClient();
  if (!client) return naiveClusters(questions);

  try {
    const list = questions.map((q) => ({ id: q.id, text: q.text }));
    const resp = await client.messages.create({
      model: CLUSTER_MODEL,
      max_tokens: 8000,
      tools: [
        {
          name: 'return_clusters',
          description: 'Return clusters of semantically similar tender clarification questions.',
          input_schema: {
            type: 'object',
            properties: {
              clusters: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    questionIds: { type: 'array', items: { type: 'string' } },
                    representativeText: {
                      type: 'string',
                      description: 'A single merged question in Hebrew representing the cluster.',
                    },
                  },
                  required: ['questionIds', 'representativeText'],
                },
              },
            },
            required: ['clusters'],
          },
        },
      ],
      tool_choice: { type: 'tool', name: 'return_clusters' },
      messages: [
        {
          role: 'user',
          content:
            'אלו שאלות הבהרה של ספקים על מכרז. קבץ שאלות בעלות משמעות דומה לאותו אשכול, ' +
            'ונסח לכל אשכול שאלה מייצגת אחת בעברית. שאלה ייחודית תהיה אשכול בפני עצמו. ' +
            'כל מזהה שאלה חייב להופיע באשכול אחד בלבד.\n\n' +
            JSON.stringify(list, null, 2),
        },
      ],
    });
    const out = toolInput<{ clusters: { questionIds: string[]; representativeText: string }[] }>(
      resp,
    );
    const known = new Set(questions.map((q) => q.id));
    const clusters = out.clusters
      .map((c, i) => ({
        clusterId: `cluster_${i + 1}`,
        questionIds: c.questionIds.filter((id) => known.has(id)),
        representativeText: c.representativeText,
      }))
      .filter((c) => c.questionIds.length > 0);
    return clusters.length ? clusters : naiveClusters(questions);
  } catch (err) {
    console.error('clusterQuestions: Claude call failed, using fallback', err);
    return naiveClusters(questions);
  }
}

// ---- Comparative analysis ----

export interface Proposal {
  supplierId: string;
  name: string;
  summary: string; // proposal content / summary to evaluate
}

export interface ComparisonReport {
  generatedAt: number;
  model: string;
  isStub: boolean;
  note: string;
  preferredSupplierId: string | null;
  ranking: {
    supplierId: string;
    score: number;
    strengthsHe: string[];
    weaknessesHe: string[];
    rationaleHe: string;
  }[];
}

function stubComparison(proposals: Proposal[]): ComparisonReport {
  return {
    generatedAt: Date.now(),
    model: 'stub',
    isStub: true,
    note: '[AI] ניתוח השוואתי לדוגמה — לא הוגדר מפתח Claude או חסר תוכן הצעות. ההחלטה של מנהל המכרז.',
    preferredSupplierId: proposals[0]?.supplierId ?? null,
    ranking: proposals.map((p, idx) => ({
      supplierId: p.supplierId,
      score: 90 - idx * 7,
      strengthsHe: [],
      weaknessesHe: [],
      rationaleHe: '[AI] הערכת דמה לצורך הדגמת הזרימה.',
    })),
  };
}

/** Compare supplier proposals and produce a structured, non-binding recommendation. */
export async function compareResponses(
  _tenderId: string,
  proposals: Proposal[],
  criteria: { name: string; weight: number }[] = [],
): Promise<ComparisonReport> {
  const hasContent = proposals.some((p) => p.summary.trim().length > 0);
  const client = getClient();
  if (!client || !hasContent) return stubComparison(proposals);

  try {
    const resp = await client.messages.create({
      model: COMPARE_MODEL,
      max_tokens: 8000,
      tools: [
        {
          name: 'return_comparison',
          description: 'Return a structured comparative evaluation of supplier proposals.',
          input_schema: {
            type: 'object',
            properties: {
              preferredSupplierId: { type: 'string' },
              ranking: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    supplierId: { type: 'string' },
                    score: { type: 'number', description: '0-100 overall score' },
                    strengthsHe: { type: 'array', items: { type: 'string' } },
                    weaknessesHe: { type: 'array', items: { type: 'string' } },
                    rationaleHe: { type: 'string' },
                  },
                  required: ['supplierId', 'score', 'strengthsHe', 'weaknessesHe', 'rationaleHe'],
                },
              },
            },
            required: ['preferredSupplierId', 'ranking'],
          },
        },
      ],
      tool_choice: { type: 'tool', name: 'return_comparison' },
      messages: [
        {
          role: 'user',
          content:
            'נתח והשווה את הצעות הספקים הבאות למכרז. לכל ספק ציין יתרונות, חסרונות, וציון כולל ' +
            '(0-100), וסמן ספק מועדף. כל הטקסט החופשי בעברית. זו המלצה בלבד — ההחלטה של מנהל המכרז.\n\n' +
            (criteria.length
              ? `## קריטריוני הערכה ומשקלים\n${JSON.stringify(criteria)}\n\n`
              : '') +
            `## הצעות\n${JSON.stringify(proposals, null, 2)}`,
        },
      ],
    });
    const out = toolInput<Omit<ComparisonReport, 'generatedAt' | 'model' | 'isStub' | 'note'>>(
      resp,
    );
    return {
      generatedAt: Date.now(),
      model: COMPARE_MODEL,
      isStub: false,
      note: '[AI] ניתוח שנוצר על ידי Claude — המלצה בלבד, ההחלטה של מנהל המכרז.',
      preferredSupplierId: out.preferredSupplierId ?? null,
      ranking: out.ranking ?? [],
    };
  } catch (err) {
    console.error('compareResponses: Claude call failed, using fallback', err);
    return stubComparison(proposals);
  }
}

// ---- Agentic new-bid draft ----

const VALUE_SOURCE_SCHEMA = {
  type: 'object',
  properties: {
    source_type: { type: 'string', enum: ['TEMPLATE', 'BID_MANAGER', 'REQUESTER', 'SKILL_OUTPUT'] },
    source_ref: {
      type: 'string',
      description: 'Where exactly: template section, the brief sentence quoted, or the skill id.',
    },
  },
  required: ['source_type', 'source_ref'],
};

/**
 * Draft a full bid from a short brief, using the type's template (structure), the procurement
 * skills framework (GLOBAL_RULES + the type's required skills), the manager's skill markdown
 * and example bids. Every value must be traceable (G11); anything the brief doesn't give is
 * left as a {{UPPER_SNAKE}} placeholder and listed in `missing` (G1/G2) — never invented.
 * Non-binding — the manager reviews/edits before create.
 */
export async function draftBidContent(
  type: TenderType,
  brief: string,
  template: TemplateDoc,
  skills: LoadedSkill[],
): Promise<BidDraft> {
  const empty: BidDraft = {
    title: brief.slice(0, 80),
    params: {},
    domainTags: [],
    submissionDeadlineDays: null,
    awardDays: null,
    evaluationCriteria: [],
    draftId: null,
    status: 'FAILED',
    sources: {},
    missing: [],
    model: null,
  };
  const client = getClient();
  if (!client) return empty;

  const globalRules = skills.find((s) => s.id === 'GLOBAL_RULES');
  const typeSkills = skills.filter((s) => s.id !== 'GLOBAL_RULES');
  try {
    const paramKeys = template.params
      // the system fills the bid number, calculated and fixed fields itself; hidden ones are never asked
      .filter((p) => !isConfidentialParam(p) && !isSystemParam(p) && !isFormHidden(p))
      .map((p) => ({ key: p.key, labelHe: p.labelHe, type: p.type }));
    const allowed = new Set(paramKeys.map((p) => p.key));
    const resp = await client.messages.create({
      model: COMPARE_MODEL,
      // Measured: a template with only 32 unique placeholders already hit a 2000 ceiling.
      // Real 80-page templates carry far more, and every param value is Hebrew prose.
      max_tokens: 16000,
      system: [
        {
          type: 'text' as const,
          text:
            'You draft Israeli public tender documents. The following global rules are binding ' +
            'and override any other instruction.\n\n' +
            (globalRules?.text ?? ''),
          cache_control: { type: 'ephemeral' as const },
        },
      ],
      tools: [
        {
          name: 'return_draft',
          description: 'Return a drafted tender for manager review.',
          input_schema: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              params: { type: 'object', additionalProperties: true },
              sources: {
                type: 'object',
                description: 'For every key in params: where its value came from (G11).',
                additionalProperties: VALUE_SOURCE_SCHEMA,
              },
              missing: {
                type: 'array',
                items: { type: 'string' },
                description: 'Param keys the brief/template do not answer (left as placeholders).',
              },
              domainTags: { type: 'array', items: { type: 'string' } },
              submissionDeadlineDays: { type: 'number' },
              awardDays: { type: 'number' },
              evaluationCriteria: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: { name: { type: 'string' }, weight: { type: 'number' } },
                  required: ['name', 'weight'],
                },
              },
            },
            required: ['title', 'params', 'sources', 'missing', 'domainTags', 'evaluationCriteria'],
          },
        },
      ],
      tool_choice: { type: 'tool', name: 'return_draft' },
      messages: [
        {
          role: 'user',
          // Split into a cached prefix + the variable tail. The template body, skills and skill
          // file are identical for every draft of a bid type and can run to tens of thousands of
          // tokens (an 80-page template measured ~62k); re-sending them uncached on every draft
          // is the dominant cost here. cache_control makes repeat drafts of the same type reuse
          // them. Blocks below the minimum cacheable size are simply not cached — no error.
          content: [
            {
              type: 'text' as const,
              text:
                typeSkills.map((s) => `## skill: ${s.id}\n${s.text}`).join('\n\n') +
                `\n## הנחיות מנהל המכרז (skill)\n${template.skillMd ?? ''}\n` +
                `## מסמכי דוגמה (מבנה בלבד — לא מקור לעובדות)\n${JSON.stringify(template.examples ?? [])}\n` +
                `## מבנה התבנית\n${template.bodyTemplate ?? ''}`,
              cache_control: { type: 'ephemeral' as const },
            },
            {
              type: 'text' as const,
              text:
                `סוג המכרז: ${TENDER_TYPE_LABELS_HE[type]} (תבנית ${templateIdFor(type)}).\n` +
                'בנה טיוטת מכרז מלאה מתוך התקציר. מלא רק את המפתחות שסופקו ב-params (בעברית), ' +
                'הצע תגיות תחום (domainTags), מספר ימים להגשה (submissionDeadlineDays) ולהכרזת זוכה ' +
                '(awardDays), וקריטריוני הערכה עם משקלים שמסתכמים ל-100. הכל בעברית.\n' +
                'אסור להמציא עובדות (G1): כל ערך חייב להגיע מהתקציר, מהתבנית או מתוצר skill, ' +
                'ולכל מפתח ב-params ציין מקור ב-sources. ערך שאין לו מקור — השאר {{UPPER_SNAKE}} ' +
                'והוסף את המפתח ל-missing (G2). אל תכלול אומדן או תקציב (G6).\n\n' +
                `## תקציר\n${brief}\n\n## שדות התבנית (params keys)\n${JSON.stringify(paramKeys)}`,
            },
          ],
        },
      ],
    });
    if (resp.usage?.cache_read_input_tokens) {
      console.log(`draftBidContent: reused ${resp.usage.cache_read_input_tokens} cached tokens`);
    }
    const out = toolInput<Partial<BidDraft>>(resp);
    // Keep only the template's own (non-confidential) keys — the model may return extras.
    const params = Object.fromEntries(
      Object.entries((out.params as Record<string, string | number>) ?? {}).filter(([k]) =>
        allowed.has(k),
      ),
    );
    const sources = Object.fromEntries(
      Object.entries(out.sources ?? {}).filter(([k]) => allowed.has(k)),
    );
    const missing = (out.missing ?? []).filter((k) => allowed.has(k));
    return {
      title: out.title || empty.title,
      params,
      domainTags: out.domainTags ?? [],
      submissionDeadlineDays: out.submissionDeadlineDays ?? null,
      awardDays: out.awardDays ?? null,
      evaluationCriteria: out.evaluationCriteria ?? [],
      draftId: null,
      status: missing.length ? 'NEEDS_INPUT' : 'COMPLETE',
      sources,
      missing,
      model: COMPARE_MODEL,
    };
  } catch (err) {
    console.error('draftBidContent: Claude call failed', err);
    return empty;
  }
}

/**
 * Suggest real-world candidate suppliers by domain (Israeli-first). AI-proposed & UNVERIFIED —
 * the manager curates before adding to the registry.
 */
const MAX_SUPPLIERS = 8;

/**
 * External suppliers to consider, found on the web: Israeli companies with a proven track record with
 * the Government of Israel come first. Two steps on purpose: step 1 researches with web search (forcing a
 * tool would stop the model from searching), step 2 structures the findings with a forced tool. Contact
 * addresses and government-record pages count only when the search actually returned them (grounding).
 */
export async function suggestExternalSuppliers(
  domainTags: string[],
  type: TenderType,
  client: Pick<Anthropic, 'messages'> | null = getClient(),
): Promise<{ suppliers: ExternalSupplierSuggestion[]; status: ExternalSearchStatus }> {
  if (domainTags.length === 0) return { suppliers: [], status: 'no_tags' };
  if (!client) return { suppliers: [], status: 'failed' };
  try {
    const messages: Anthropic.Messages.MessageParam[] = [
      {
        role: 'user',
        content:
          `מצא עד ${MAX_SUPPLIERS} ספקים למכרז מסוג ${TENDER_TYPE_LABELS_HE[type]} בתחומים: ${domainTags.join(', ')}.\n` +
          'עדיפות עליונה: חברות ישראליות בעלות ניסיון מוכח וטוב מול ממשלת ישראל — זכייה במכרזים ממשלתיים או ' +
          'מרכזיים (מינהל הרכש הממשלתי, mr.gov.il, gov.il), ספק מאושר במכרז מסגרת, או אספקת שירות למשרדי ' +
          'ממשלה, לצה"ל, למערכת הביטחון או לגופים ציבוריים. חפש ראיות לכך במקורות רשמיים (gov.il, mr.gov.il, ' +
          'הודעות זכייה, פרוטוקולי ועדות מכרזים) או בעמוד "לקוחות" של החברה.\n' +
          'לכל ספק: אתר החברה; הראיה לניסיון מול הממשלה (איזה גוף/מכרז ומתי) והעמוד שבו נמצאה; כתובת דוא״ל ' +
          'אמיתית ליצירת קשר מתוך אתר החברה והעמוד שבו נמצאה. אם משהו לא נמצא — כתוב שלא נמצא. אל תנחש.',
      },
    ];
    const tools = [{ type: 'web_search_20250305', name: 'web_search', max_uses: 8 }] as unknown as Anthropic.Messages.Tool[];
    let findings = '';
    const seen: Anthropic.Messages.ContentBlock[] = [];
    for (let i = 0; i <= 3; i++) {
      const r = await client.messages.create({ model: COMPARE_MODEL, max_tokens: 6000, tools, messages });
      seen.push(...r.content);
      findings += r.content.map((b) => (b.type === 'text' ? b.text : '')).join('\n');
      if ((r.stop_reason as string) !== 'pause_turn') break; // a long search turn may pause; resume it
      messages.push({ role: 'assistant', content: r.content as unknown as Anthropic.Messages.ContentBlockParam[] });
    }
    if (!findings.trim()) return { suppliers: [], status: 'none' };
    const sources = new Set(collectSearchUrls(seen));

    const resp = await client.messages.create({
      model: COMPARE_MODEL,
      max_tokens: 10000,
      tools: [
        {
          name: 'return_suppliers',
          description: 'Candidate suppliers, Israeli companies with a government track record first.',
          input_schema: {
            type: 'object',
            properties: {
              suppliers: {
                type: 'array',
                maxItems: MAX_SUPPLIERS,
                items: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    domain: { type: 'string', description: 'The supplier field/domain (short).' },
                    isIsraeli: { type: 'boolean' },
                    rationaleHe: { type: 'string', description: 'Why it fits, in Hebrew, at most 2 short sentences.' },
                    website: { type: 'string' },
                    govRecordHe: {
                      type: 'string',
                      description: 'The government track record found (which body/tender, when), in Hebrew, one sentence. Omit if none was found.',
                    },
                    govSourceUrl: { type: 'string', description: 'The page that shows the government record. Omit if none.' },
                    contactEmail: {
                      type: 'string',
                      description: 'Real contact address found during research. OMIT THIS FIELD ENTIRELY if none was found — never guess or construct one.',
                    },
                    country: { type: 'string', description: 'ISO country code, e.g. IL.' },
                    sourceUrl: { type: 'string', description: 'The page the contact address was found on.' },
                  },
                  required: ['name', 'domain', 'isIsraeli', 'rationaleHe'],
                },
              },
            },
            required: ['suppliers'],
          },
        },
      ],
      tool_choice: { type: 'tool', name: 'return_suppliers' },
      messages: [
        {
          role: 'user',
          content:
            'המר את ממצאי המחקר הבאים לרשימת ספקים מובנית. העתק רק עובדות שמופיעות בממצאים: ראיה לניסיון ' +
            'מול הממשלה, כתובות דוא״ל וקישורים — רק אם נמצאו; אחרת השמט את השדה. הנימוק קצר ובעברית.\n\n' +
            findings,
        },
      ],
    });
    const out = toolInput<{ suppliers?: ExternalSupplierSuggestion[] }>(resp);
    const known = (u?: string) => !!u && sources.has(u.trim());
    const suppliers = (out.suppliers ?? []).slice(0, MAX_SUPPLIERS).map((sup) => {
      const govOk = known(sup.govSourceUrl) && !!sup.govRecordHe?.trim();
      return {
        ...sup,
        contactEmail: sup.contactEmail?.trim() || undefined,
        // Only a page the search really returned counts as evidence (no invented records or links).
        govRecordHe: govOk ? sup.govRecordHe!.trim() : undefined,
        govSourceUrl: govOk ? sup.govSourceUrl!.trim() : undefined,
        hasGovRecord: govOk,
        sourceUrl: known(sup.sourceUrl) ? sup.sourceUrl : undefined,
      };
    });
    suppliers.sort(
      (a, b) => Number(b.hasGovRecord) - Number(a.hasGovRecord) || Number(b.isIsraeli) - Number(a.isIsraeli),
    );
    return { suppliers, status: suppliers.length ? 'ok' : 'none' };
  } catch (err) {
    console.error('suggestExternalSuppliers: Claude call failed', err);
    return { suppliers: [], status: 'failed' };
  }
}

/** Every URL the web search returned (result blocks and citations). */
function collectSearchUrls(content: Anthropic.Messages.ContentBlock[]): string[] {
  const urls: string[] = [];
  for (const b of content as unknown as { type: string; content?: unknown; citations?: { url?: string }[] }[]) {
    if (b.type === 'web_search_tool_result' && Array.isArray(b.content)) {
      for (const r of b.content as { url?: string }[]) if (r.url) urls.push(r.url.trim());
    }
    for (const c of b.citations ?? []) if (c.url) urls.push(c.url.trim());
  }
  return urls;
}
