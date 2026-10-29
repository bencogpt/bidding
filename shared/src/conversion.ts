// Converting a Word-based document into a real template: an agent proposes {{fields}} for every
// fill-in spot, the manager reviews, and the system writes the placeholders into the document.
import { z } from 'zod';
import { tenderTypeSchema } from './schemas.js';
import type { FillSpot, TemplateFieldsStatus } from './templates.js';

export const FIELD_TYPES = ['text', 'number', 'date', 'textarea'] as const;

const occurrenceSchema = z.object({
  quote: z.string().min(1), // exact single-line excerpt of the document
  replace: z.string().min(1), // exact substring of quote that becomes {{key}}
});

export const conversionFieldSchema = z.object({
  key: z.string(),
  labelHe: z.string().min(1),
  type: z.enum(FIELD_TYPES),
  required: z.boolean(),
  internal: z.boolean().optional(),
  occurrences: z.array(occurrenceSchema),
});
export type ConversionField = z.infer<typeof conversionFieldSchema>;
export type ConversionOccurrence = z.infer<typeof occurrenceSchema>;

export const analyzeTemplateFieldsInput = z.object({ type: tenderTypeSchema });
export type AnalyzeTemplateFieldsInput = z.infer<typeof analyzeTemplateFieldsInput>;

export const applyTemplateConversionInput = z.object({
  type: tenderTypeSchema,
  runId: z.string(),
  fields: z.array(conversionFieldSchema), // as edited/approved by the manager
  supplierFill: z.array(z.string()),
});
export type ApplyTemplateConversionInput = z.infer<typeof applyTemplateConversionInput>;

/** templates/{type}/conversions/{runId} — the agent's proposal, awaiting manager review. */
export interface ConversionRun {
  runId: string;
  type: string;
  fields: ConversionField[];
  supplierFill: string[];
  unresolved: FillSpot[];
  dropped: { reason: string; detail: string }[]; // proposals rejected by validation
  rounds: number;
  model: string;
  docTextHash: string;
  createdBy: string;
  createdAt: number;
  appliedAt?: number;
}

export interface ConversionReport {
  fields: number;
  replaced: number;
  notFound: string[]; // quotes that no longer matched the document
  unresolved: FillSpot[];
  status: TemplateFieldsStatus;
  backupDocId: string | null;
}
