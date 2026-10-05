// Supervisor agent — shared types + the template/skills contract it enforces.
//
// The supervisor follows a bid document from the AI draft to publication and checks that the
// right template and skills were used and that the document holds no unsourced values
// (skills/00_GLOBAL_RULES.md G1/G2/G6/G11). Reports are stored per run under
// tenders/{id}/supervision/{runId}; provenance under tenders/{id}/internal/provenance.
import type { TenderType } from './tender.js';

// Skill ids match the folder names under skills/skills/.
export const SKILL_IDS = [
  's01-requester-spec',
  's02-procurement-sla',
  's03-procurement-strategy-thresholds',
  's04-procurement-merge-and-style',
  's05-procurement-quality-check',
  's06-clarifications-consolidation',
  's07-clarifications-routing',
  's08-risk-analysis',
  's09-offer-evaluation',
  's10-supplier-sourcing',
  's11-legal-compliance',
  's12-finance-pricing-table',
  's13-finance-milestones-payment',
  's14-finance-all-inclusive-clause',
  's15-finance-guarantees',
  's16-finance-insurance-handoff',
  's17-security-requirements',
  's18-security-offer-review',
  's19-supplier-conference-deck',
] as const;
export type SkillId = (typeof SKILL_IDS)[number];

// ORCHESTRATOR template ids: T-A = off-the-shelf product, T-B = services.
export type OrchestratorTemplateId = 'T-A' | 'T-B';

export function templateIdFor(type: TenderType): OrchestratorTemplateId {
  return type === 'goods' ? 'T-A' : 'T-B';
}

// Drafting skills each bid type must be drafted with (ORCHESTRATOR phases 1–5).
const GOODS_SKILLS: SkillId[] = [
  's01-requester-spec',
  's03-procurement-strategy-thresholds',
  's04-procurement-merge-and-style',
  's05-procurement-quality-check',
  's11-legal-compliance',
  's12-finance-pricing-table',
  's14-finance-all-inclusive-clause',
];
const SERVICE_SKILLS: SkillId[] = [
  ...GOODS_SKILLS,
  's02-procurement-sla',
  's13-finance-milestones-payment',
  's15-finance-guarantees',
];
export const REQUIRED_SKILLS: Record<TenderType, SkillId[]> = {
  goods: GOODS_SKILLS,
  service: SERVICE_SKILLS,
  project: [...SERVICE_SKILLS, 's08-risk-analysis', 's17-security-requirements'],
};

// Mandatory hard legal sections (s11 / GLOBAL_RULES G3). Each must appear as a heading in the
// bid document, with the template's wording unchanged. Patterns tolerate common spelling variants.
export const MANDATORY_LEGAL_SECTIONS = [
  { id: 'confidentiality', nameHe: 'סודיות', pattern: /סודיות/ },
  { id: 'ip', nameHe: 'קניין רוחני', pattern: /קני[י]?ן\s*ה?רוחני/ },
  { id: 'liability', nameHe: 'אחריות ושיפוי', pattern: /שיפוי/ },
  { id: 'thresholds', nameHe: 'תנאי סף', pattern: /תנאי\s*ה?סף/ },
  { id: 'termination', nameHe: 'ביטול/סיום התקשרות', pattern: /ביטול|סיום\s*ה?התקשרות/ },
] as const;

// G11 traceability: where a drafted value came from.
export type SourceType = 'TEMPLATE' | 'BID_MANAGER' | 'REQUESTER' | 'SKILL_OUTPUT';
export interface ValueSource {
  source_type: SourceType;
  source_ref: string;
}

export interface SkillUse {
  id: SkillId | 'GLOBAL_RULES';
  hash: string;
}

/** Saved by draftBid (bidDrafts/{draftId}); linked to the tender at creation. */
export interface BidDraftRecord {
  draftId: string;
  type: TenderType;
  brief: string;
  model: string;
  status: 'COMPLETE' | 'NEEDS_INPUT' | 'FAILED';
  params: Record<string, string | number>;
  sources: Record<string, ValueSource>;
  missing: string[];
  templateHash: string;
  skillsUsed: SkillUse[];
  createdBy: string;
  createdAt: number;
}

/** What the tender was built from. Internal-only (suppliers can't read it). */
export interface TenderProvenance {
  templateType: TenderType;
  templateId: OrchestratorTemplateId;
  templateHash: string;
  googleTemplateDocId: string | null;
  draftId: string | null;
  draftType: TenderType | null; // type the AI draft was made for (must equal templateType)
  brief: string | null; // original brief, never edited
  aiModel: string | null;
  aiStatus: BidDraftRecord['status'] | null;
  skillsUsed: SkillUse[];
  paramSources: Record<string, ValueSource>;
  editedByManager: string[]; // param keys whose final value differs from the AI draft
  recordedAt: number;
}

export type FindingSeverity = 'block' | 'warn' | 'info';
export type SupervisionVerdict = 'PASS' | 'WARN' | 'BLOCK';
export type SupervisionStage = 'created' | 'review' | 'ready' | 'prepublish' | 'refresh' | 'manual';

export type FindingCode =
  // template
  | 'NO_PROVENANCE'
  | 'TEMPLATE_MISMATCH'
  | 'TEMPLATE_CHANGED'
  | 'TEMPLATE_DOC_CHANGED'
  | 'TEMPLATE_STRUCTURE_MISSING'
  | 'WRONG_TEMPLATE_SECTION'
  // skills
  | 'SKILL_MISSING'
  | 'SKILL_VERSION_CHANGED'
  | 'NO_AI_DRAFT'
  | 'AI_DRAFT_FAILED'
  // values
  | 'MISSING_INFO'
  | 'PARAM_INVALID'
  | 'PARAM_NOT_IN_DOC'
  | 'UNSOURCED_PARAM'
  | 'UNSOURCED_VALUE'
  | 'CONTRADICTION'
  | 'CRITERIA_WEIGHTS'
  | 'MISSING_MANDATORY_SECTION'
  | 'LEGAL_SECTION_MISSING'
  | 'LEGAL_SECTION_ALTERED'
  | 'CONFIDENTIAL_LEAK'
  | 'UNFAIR_REQUIREMENT'
  // supervisor itself
  | 'DOC_UNREADABLE'
  | 'AI_REVIEW_SKIPPED'
  | 'SUPERVISOR_UNAVAILABLE';

export interface SupervisionFinding {
  code: FindingCode;
  severity: FindingSeverity;
  location: string;
  message: string; // Hebrew
  evidence?: string; // verbatim quote from the document / record
  source: 'rules' | 'ai';
}

export interface SupervisionReport {
  runId: string;
  tenderId: string;
  stage: SupervisionStage;
  verdict: SupervisionVerdict;
  findings: SupervisionFinding[];
  docHash: string | null;
  templateType: TenderType;
  requiredSkills: SkillId[];
  skillsUsed: SkillUse[];
  aiModel: string | null; // null when the AI review layer did not run
  runBy: string;
  at: number;
}

/** Small summary kept on the tender doc so lists/headers can show the latest verdict. */
export interface SupervisionSummary {
  runId: string;
  verdict: SupervisionVerdict;
  stage: SupervisionStage;
  blockers: number;
  at: number;
}

export function verdictOf(findings: Pick<SupervisionFinding, 'severity'>[]): SupervisionVerdict {
  if (findings.some((f) => f.severity === 'block')) return 'BLOCK';
  if (findings.some((f) => f.severity === 'warn')) return 'WARN';
  return 'PASS';
}

/** G9 flag line: [FLAG | TYPE | SEVERITY | LOCATION | DESCRIPTION | SUGGESTED ACTION | OWNER]. */
export function toG9Flag(f: SupervisionFinding): string {
  const sev = f.severity === 'block' ? 'BLOCKER' : f.severity === 'warn' ? 'MAJOR' : 'MINOR';
  return `[FLAG | ${f.code} | ${sev} | ${f.location} | ${f.message} | ${f.evidence ?? ''} | bid_manager]`;
}
