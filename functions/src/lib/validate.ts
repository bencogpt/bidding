import { HttpsError } from 'firebase-functions/v2/https';
import type { ZodSchema } from 'zod';

/** Runtime-validate a callable payload with a Zod schema (constitution Gate 1). */
export function parseInput<T>(schema: ZodSchema<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new HttpsError('invalid-argument', 'נתונים שגויים: ' + result.error.message);
  }
  return result.data;
}
