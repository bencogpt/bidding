import type { TenderStatus } from '@obms/shared';

/** One solid colour per stage, running along a single journey from writing to award. */
export const STAGE_COLOR: Record<TenderStatus, string> = {
  draft: '#8a5cf0',
  internal_review: '#5a4fe0',
  ready: '#2f6fe0',
  published: '#0a8fc2',
  responses: '#0a9a8e',
  evaluated: '#1f9d5f',
  awarded: '#177a4a',
};

/** Statuses after which the case needs no more day-to-day work. */
const DONE_STATUSES: TenderStatus[] = ['evaluated', 'awarded'];
export const isActive = (s: TenderStatus) => !DONE_STATUSES.includes(s);
