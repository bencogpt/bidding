// supervisorChecks — the deterministic (no-AI) layer of the supervisor agent. Pure functions so
// they are unit-testable without Firestore; supervisorService wires them to real data.
import { createHash } from 'node:crypto';
import {
  MANDATORY_LEGAL_SECTIONS,
  REQUIRED_SKILLS,
  isConfidentialParam,
  isSystemParam,
  isFormHidden,
  BLANK_LINE,
  type SkillUse,
  type SupervisionFinding,
  type TemplateDoc,
  type TenderDoc,
  type TenderProvenance,
} from '@obms/shared';

type Finding = Omit<SupervisionFinding, 'source'>;
type ParamValue = string | number;

const PLACEHOLDER_RE = /\{\{\s*([^}\n]+?)\s*\}\}/g;
const MAX_LISTED = 10;

/** Fingerprint of everything in a template that shapes the generated document. */
export function templateHash(t: Pick<TemplateDoc, 'bodyTemplate' | 'params' | 'skillMd'>): string {
  const material = JSON.stringify({ body: t.bodyTemplate, params: t.params, skillMd: t.skillMd ?? '' });
  return createHash('sha256').update(material, 'utf8').digest('hex');
}

export function docHash(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/** Plain text of the dev-mode HTML document. */
export function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<\/(p|h\d|div|li|tr)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

/** Whitespace-collapsed, thousands-separators removed — for value lookups. */
export function normalize(text: string): string {
  return text
    .normalize('NFKC')
    .replace(/(\d)[,٬'](?=\d{3}(?!\d))/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

const isBlank = (v: ParamValue | undefined) => v === undefined || String(v).trim() === '';

function containsNumber(normText: string, n: number): boolean {
  const digits = String(n);
  const re = new RegExp(`(?<![\\d.])${digits.replace('.', '\\.')}(?![\\d]|\\.\\d)`);
  return re.test(normText);
}

/** Numbers that look like real facts (skip 1-digit list numbering). */
function numbersIn(value: ParamValue): number[] {
  if (typeof value === 'number') return [value];
  return [...normalize(value).matchAll(/\d+(?:\.\d+)?/g)]
    .map((m) => Number(m[0]))
    .filter((n) => n >= 10);
}

function containsValue(normDoc: string, value: ParamValue): boolean {
  if (typeof value === 'number') return containsNumber(normDoc, value);
  return normDoc.includes(normalize(value));
}

/** Template lines with no placeholder — the fixed text that identifies a template. */
function staticLines(body: string): string[] {
  return body
    .split('\n')
    .map((l) => normalize(l.replace(/^#+\s*/, '')))
    .filter((l) => l.length >= 6 && !l.includes('{{'));
}

export interface DeterministicInput {
  tender: TenderDoc;
  template: TemplateDoc; // current template for tender.type
  otherTemplates: TemplateDoc[]; // templates of the other types (wrong-template detection)
  provenance: TenderProvenance | null;
  internalParams: Record<string, ParamValue>;
  docText: string | null;
  currentSkillHash: (id: SkillUse['id']) => string | null;
}

// ---- template ----
export function checkTemplate(i: DeterministicInput): Finding[] {
  const out: Finding[] = [];
  const { tender, template, provenance: prov } = i;

  if (!prov) {
    out.push({
      code: 'NO_PROVENANCE',
      severity: 'warn',
      location: 'tender',
      message: 'אין רישום מקור (provenance) למכרז — לא ניתן לאמת באיזו תבנית ומיומנויות נוצר.',
    });
  } else {
    if (prov.templateType !== tender.type) {
      out.push({
        code: 'TEMPLATE_MISMATCH',
        severity: 'block',
        location: 'provenance.templateType',
        message: `המסמך נוצר מתבנית "${prov.templateType}" אך סוג המכרז הוא "${tender.type}".`,
      });
    }
    if (prov.draftType && prov.draftType !== tender.type) {
      out.push({
        code: 'TEMPLATE_MISMATCH',
        severity: 'block',
        location: 'provenance.draftType',
        message: `טיוטת ה-AI נבנתה לסוג "${prov.draftType}" ולא לסוג המכרז "${tender.type}".`,
      });
    }
    if (prov.templateHash !== templateHash(template)) {
      out.push({
        code: 'TEMPLATE_CHANGED',
        severity: 'warn',
        location: `templates/${tender.type}`,
        message: 'התבנית שונתה לאחר יצירת המכרז — המסמך נוצר מגרסה קודמת של התבנית.',
      });
    }
    if ((prov.googleTemplateDocId ?? null) !== (template.googleTemplateDocId ?? null)) {
      out.push({
        code: 'TEMPLATE_DOC_CHANGED',
        severity: 'warn',
        location: `templates/${tender.type}.googleTemplateDocId`,
        message: 'מסמך ה-Google של התבנית הוחלף מאז יצירת המכרז.',
      });
    }
  }

  // Structural fingerprint: the document must carry its own template's fixed text, and must not
  // look more like another type's template.
  if (i.docText !== null) {
    const doc = normalize(i.docText);
    const own = staticLines(template.bodyTemplate);
    if (own.length >= 2) {
      const missing = own.filter((l) => !doc.includes(l));
      const ownScore = 1 - missing.length / own.length;
      if (ownScore < 0.5) {
        out.push({
          code: 'TEMPLATE_STRUCTURE_MISSING',
          severity: 'block',
          location: 'document',
          message: `רק ${Math.round(ownScore * 100)}% מהטקסט הקבוע של תבנית "${template.title}" נמצא במסמך.`,
          evidence: missing.slice(0, 3).join(' | '),
        });
      }
      const ownSet = new Set(own);
      for (const other of i.otherTemplates) {
        const otherLines = staticLines(other.bodyTemplate);
        const distinctive = otherLines.filter((l) => !ownSet.has(l));
        if (distinctive.length < 2) continue;
        const hits = distinctive.filter((l) => doc.includes(l));
        if (hits.length / distinctive.length >= 0.5 && hits.length / distinctive.length > ownScore) {
          out.push({
            code: 'TEMPLATE_MISMATCH',
            severity: 'block',
            location: 'document',
            message: `המסמך תואם את תבנית "${other.title}" (${other.type}) יותר מאשר את תבנית סוג המכרז.`,
            evidence: hits.slice(0, 3).join(' | '),
          });
        }
      }
    }
  }
  return out;
}

// ---- mandatory legal sections (s11 / G3) ----
type LegalSection = (typeof MANDATORY_LEGAL_SECTIONS)[number];

/** Heading text with markdown hashes, outline numbering ("5.", "5.1", "א.") and a trailing colon removed. */
function headingText(line: string): string {
  return normalize(line)
    .replace(/^#+\s*/, '')
    .replace(/^(?:\d+(?:\.\d+)*\.?|[א-ת][.)])\s*/, '')
    .replace(/[:：]\s*$/, '');
}

// A heading is short and isn't a sentence; a body line that merely mentions "סודיות" is not the
// section.
function isHeadingFor(line: string, s: LegalSection): boolean {
  const h = headingText(line);
  return (
    h.length > 0 && h.length <= 60 && h.split(' ').length <= 5 && !/[.!?]$/.test(h) && s.pattern.test(h)
  );
}

const isAnyHeading = (line: string) =>
  /^\s*#/.test(line) || MANDATORY_LEGAL_SECTIONS.some((s) => isHeadingFor(line, s));

/** Body lines of a section: after its heading, up to the next heading. Null if absent. */
function sectionLines(text: string, s: LegalSection): string[] | null {
  const lines = text.split('\n');
  const start = lines.findIndex((l) => isHeadingFor(l, s));
  if (start === -1) return null;
  const body: string[] = [];
  for (const l of lines.slice(start + 1)) {
    if (isAnyHeading(l)) break;
    if (l.trim()) body.push(l);
  }
  return body;
}

/** Ids of the mandatory legal sections whose heading appears in the text. */
export function presentLegalSections(text: string): LegalSection['id'][] {
  return MANDATORY_LEGAL_SECTIONS.filter((s) => sectionLines(text, s) !== null).map((s) => s.id);
}

export function checkLegalSections(i: DeterministicInput): Finding[] {
  if (i.docText === null) return [];
  const out: Finding[] = [];
  const doc = normalize(i.docText);
  for (const s of MANDATORY_LEGAL_SECTIONS) {
    const inTemplate = sectionLines(i.template.bodyTemplate, s);
    if (sectionLines(i.docText, s) === null) {
      out.push({
        code: 'LEGAL_SECTION_MISSING',
        severity: 'block',
        location: inTemplate ? 'document' : `templates/${i.template.type}`,
        message: inTemplate
          ? `סעיף החובה "${s.nameHe}" קיים בתבנית אך הוסר מהמסמך (s11).`
          : `סעיף החובה "${s.nameHe}" חסר — יש להוסיף לתבנית את הנוסח המשפטי המאושר (s11, G3).`,
      });
      continue;
    }
    // G3: the template's hard legal text must survive word for word (placeholders excepted).
    const altered = (inTemplate ?? [])
      .filter((l) => !l.includes('{{'))
      .map(normalize)
      .filter((l) => !doc.includes(l));
    if (altered.length) {
      out.push({
        code: 'LEGAL_SECTION_ALTERED',
        severity: 'block',
        location: `document (${s.nameHe})`,
        message: `נוסח סעיף החובה "${s.nameHe}" שונה מהתבנית — סעיף משפטי קשיח מועתק מילה במילה (G3).`,
        evidence: altered[0],
      });
    }
  }
  return out;
}

// ---- skills ----
export function checkSkills(i: DeterministicInput): Finding[] {
  const prov = i.provenance;
  if (!prov?.draftId) {
    return [
      {
        code: 'NO_AI_DRAFT',
        severity: 'info',
        location: 'provenance',
        message: 'המכרז הוזן ידנית ללא טיוטת AI — מיומנויות הניסוח לא הופעלו; הבדיקה מתבססת על כללי הפיקוח.',
      },
    ];
  }
  const out: Finding[] = [];
  if (prov.aiStatus === 'FAILED') {
    out.push({
      code: 'AI_DRAFT_FAILED',
      severity: 'warn',
      location: `bidDrafts/${prov.draftId}`,
      message: 'טיוטת ה-AI נכשלה — הערכים הוזנו ללא מיומנויות הניסוח.',
    });
    return out;
  }
  const used = new Map(prov.skillsUsed.map((s) => [s.id, s.hash]));
  const required: SkillUse['id'][] = ['GLOBAL_RULES', ...REQUIRED_SKILLS[i.tender.type]];
  for (const id of required) {
    const hash = used.get(id);
    if (!hash) {
      out.push({
        code: 'SKILL_MISSING',
        severity: 'block',
        location: `skills/${id}`,
        message: `המיומנות ${id} נדרשת למכרז מסוג ${i.tender.type} ולא הופעלה בניסוח.`,
      });
      continue;
    }
    const current = i.currentSkillHash(id);
    if (current && current !== hash) {
      out.push({
        code: 'SKILL_VERSION_CHANGED',
        severity: 'warn',
        location: `skills/${id}`,
        message: `המיומנות ${id} עודכנה מאז הניסוח — הטיוטה נוסחה לפי גרסה קודמת.`,
      });
    }
  }
  return out;
}

// ---- values ----
export function checkValues(i: DeterministicInput): Finding[] {
  const out: Finding[] = [];
  const { tender, template, provenance: prov } = i;
  const brief = normalize(prov?.brief ?? '');
  const body = normalize(template.bodyTemplate);
  const doc = i.docText !== null ? normalize(i.docText) : null;

  for (const p of template.params) {
    const value = tender.params[p.key];
    if (isConfidentialParam(p)) {
      if (!isBlank(value)) {
        out.push({
          code: 'CONFIDENTIAL_LEAK',
          severity: 'block',
          location: `params.${p.key}`,
          message: `"${p.labelHe}" הוא ערך חסוי (G6) אך נשמר בפרמטרים הגלויים לספקים.`,
        });
      }
      continue;
    }
    if (isBlank(value)) {
      if (p.required) {
        out.push({
          code: 'MISSING_INFO',
          severity: 'block',
          location: `params.${p.key}`,
          message: `שדה חובה "${p.labelHe}" ריק.`,
        });
      }
      continue;
    }
    if (String(value).includes('{{')) {
      out.push({
        code: 'MISSING_INFO',
        severity: 'block',
        location: `params.${p.key}`,
        message: `בשדה "${p.labelHe}" נותר מציין מקום שלא מולא.`,
        evidence: String(value),
      });
      continue;
    }
    if (value === BLANK_LINE) continue; // completed by hand in the document (checkBlankLines)
    // Amounts the system prints are formatted ("87,000").
    if (p.type === 'number' && !Number.isFinite(Number(String(value).replace(/,/g, '')))) {
      out.push({
        code: 'PARAM_INVALID',
        severity: 'block',
        location: `params.${p.key}`,
        message: `"${p.labelHe}" חייב להיות מספר.`,
        evidence: String(value),
      });
    }

    // G1/G11: a value the AI wrote (and the manager kept) must be traceable. Numbers are the
    // classic hallucination — they must literally appear in the brief or the template.
    // The bid number is the case serial, filled by the system — not an AI value to trace.
    // Fields the form doesn't ask (system or requester values) aren't the AI's either.
    if (prov?.draftId && !prov.editedByManager.includes(p.key) && !isSystemParam(p) && !isFormHidden(p)) {
      if (!prov.paramSources[p.key]) {
        out.push({
          code: 'UNSOURCED_PARAM',
          severity: 'warn',
          location: `params.${p.key}`,
          message: `ה-AI מילא את "${p.labelHe}" ללא ציון מקור (G11).`,
          evidence: String(value),
        });
      }
      const invented = numbersIn(value).filter(
        (n) => !containsNumber(brief, n) && !containsNumber(body, n),
      );
      if (invented.length) {
        out.push({
          code: 'UNSOURCED_VALUE',
          severity: 'block',
          location: `params.${p.key}`,
          message: `ה-AI הכניס ל"${p.labelHe}" מספרים שאינם מופיעים בתקציר או בתבנית: ${invented.join(', ')}.`,
          evidence: String(value),
        });
      }
    }

    // The document must carry the values the tender record says it does.
    if (doc !== null && !containsValue(doc, value)) {
      const isShort = typeof value === 'number' || String(value).length <= 80;
      if (isShort) {
        out.push({
          code: 'PARAM_NOT_IN_DOC',
          severity: typeof value === 'number' || p.type === 'number' ? 'block' : 'warn',
          location: `params.${p.key}`,
          message: `הערך של "${p.labelHe}" ברשומת המכרז אינו מופיע במסמך — ייתכן שהמסמך נערך לערך אחר.`,
          evidence: String(value),
        });
      }
    }
  }

  // Confidential values must never reach the document (G6).
  if (doc !== null) {
    for (const [key, value] of Object.entries(i.internalParams)) {
      if (isBlank(value)) continue;
      const leaked =
        typeof value === 'number' || /^\d[\d,.]*$/.test(String(value))
          ? Number(String(value).replace(/,/g, '')) >= 1000 &&
            containsNumber(doc, Number(String(value).replace(/,/g, '')))
          : String(value).length >= 4 && doc.includes(normalize(String(value)));
      if (leaked) {
        out.push({
          code: 'CONFIDENTIAL_LEAK',
          severity: 'block',
          location: `document (${key})`,
          message: 'ערך חסוי (אומדן/תקציב) מופיע במסמך המיועד לספקים (G6).',
          evidence: String(value),
        });
      }
    }
    const kw = doc.match(/(אומדן|תקציב משוער)[^.\n]{0,40}/);
    if (kw) {
      out.push({
        code: 'CONFIDENTIAL_LEAK',
        severity: 'warn',
        location: 'document',
        message: 'המסמך מזכיר אומדן/תקציב — ודא שלא נחשף ערך או בסיס לחישובו (G6).',
        evidence: kw[0],
      });
    }

    // Leftover placeholders / flags (G2: a document with placeholders can't pass S05).
    const leftovers = [...new Set([...i.docText!.matchAll(PLACEHOLDER_RE)].map((m) => m[0]))];
    for (const ph of leftovers.slice(0, MAX_LISTED)) {
      out.push({
        code: 'MISSING_INFO',
        severity: 'block',
        location: 'document',
        message: 'נותר במסמך מציין מקום שלא מולא.',
        evidence: ph,
      });
    }
    if (leftovers.length > MAX_LISTED) {
      out.push({
        code: 'MISSING_INFO',
        severity: 'block',
        location: 'document',
        message: `ועוד ${leftovers.length - MAX_LISTED} מציינים שלא מולאו.`,
      });
    }
    if (/\bMISSING_INFO\b|\[FLAG\s*\|/.test(i.docText!)) {
      out.push({
        code: 'MISSING_INFO',
        severity: 'block',
        location: 'document',
        message: 'במסמך נותרו דגלים פנימיים (MISSING_INFO / FLAG) שאסור לפרסם (G6).',
      });
    }
  }

  const criteria = tender.evaluationCriteria ?? [];
  if (criteria.length) {
    const sum = criteria.reduce((a, c) => a + c.weight, 0);
    if (Math.abs(sum - 100) > 0.01) {
      out.push({
        code: 'CRITERIA_WEIGHTS',
        severity: 'block',
        location: 'evaluationCriteria',
        message: `משקלי קריטריוני ההערכה מסתכמים ל-${sum} ולא ל-100.`,
      });
    }
  }
  return out;
}

/**
 * Fields the procurement form doesn't ask and nothing filled are printed as blank lines, to complete in
 * the document. A reminder (warning), not a blocker — the document can still be created.
 */
export function checkBlankLines(i: DeterministicInput): Finding[] {
  const labelOf = (k: string) => i.template.params.find((p) => p.key === k)?.labelHe ?? k;
  const keys = Object.entries(i.tender.params)
    .filter(([, v]) => v === BLANK_LINE)
    .map(([k]) => k);
  if (!keys.length) return [];
  return [
    {
      code: 'MISSING_INFO',
      severity: 'warn',
      location: 'document',
      message: `${keys.length} שדות יושלמו ידנית במסמך (מודפסים כקו ריק): ${keys.map(labelOf).join(', ')}`,
    },
  ];
}

export function runDeterministicChecks(i: DeterministicInput): SupervisionFinding[] {
  const findings: Finding[] = [
    ...checkTemplate(i),
    ...checkSkills(i),
    ...checkValues(i),
    ...checkLegalSections(i),
    ...checkBlankLines(i),
  ];
  if (i.docText === null) {
    findings.push({
      code: 'DOC_UNREADABLE',
      severity: 'block',
      location: 'document',
      message: 'לא ניתן היה לקרוא את מסמך המכרז לבדיקה.',
    });
  }
  return findings.map((f) => ({ ...f, source: 'rules' as const }));
}
