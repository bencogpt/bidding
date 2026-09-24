// supplierSearch — rank REGISTERED suppliers for a bid by domain-tag overlap, Israeli-first.
import { suppliersRepo } from '../repositories.js';
import type { SupplierDoc } from '@obms/shared';

export interface Candidate {
  supplierId: string;
  name: string;
  isIsraeli: boolean;
  matchedTags: string[];
  matchScore: number;
}

export async function findCandidates(domainTags: string[]): Promise<Candidate[]> {
  const wanted = new Set(domainTags.map((t) => t.trim().toLowerCase()).filter(Boolean));
  const suppliers = await suppliersRepo.list();
  return suppliers
    .filter((s: SupplierDoc) => s.status === 'active')
    .map((s) => {
      const tags = (s.domainTags ?? []).map((t) => t.trim());
      const matched = tags.filter((t) => wanted.has(t.toLowerCase()));
      // overlap dominates; Israeli suppliers get a priority boost (עדיפות לספקים ישראליים).
      const matchScore = matched.length * 100 + (s.isIsraeli ? 10 : 0);
      return { supplierId: s.id, name: s.name, isIsraeli: s.isIsraeli, matchedTags: matched, matchScore };
    })
    .sort((a, b) => b.matchScore - a.matchScore);
}
