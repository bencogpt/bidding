// Reading an amount of shekels out of what a person typed ("1.2 מיליון", "1,200,000", "500 אלף"). Pure. This runs in
// the browser only: the frame amount is never sent to the model (GLOBAL_RULES G6).

const NOISE = /₪|ש"ח|ש״ח|שקלים|שקל|בערך|כ-|עד/g;

/** The amount in shekels, or 0 when the text holds none. */
export function parseAmount(text: string): number {
  const t = String(text ?? '').replace(NOISE, ' ');
  if (/חצי\s+מיליון/.test(t)) return 500000;
  const m = t.match(/(\d{1,3}(?:,\d{3})+|\d{1,3}(?:\.\d{3})+(?!\d)|\d+(?:\.\d+)?)\s*(מיליון|אלף)?/);
  if (!m) return /מיליון/.test(t) ? 1_000_000 : 0;
  let raw = m[1];
  if (/^\d{1,3}(?:,\d{3})+$/.test(raw)) raw = raw.replace(/,/g, '');
  else if (/^\d{1,3}(?:\.\d{3})+$/.test(raw) && !m[2]) raw = raw.replace(/\./g, ''); // 240.000 is two hundred forty thousand
  let n = parseFloat(raw);
  if (!Number.isFinite(n) || n <= 0) return /מיליון/.test(t) && !m[2] ? 1_000_000 : 0;
  if (m[2] === 'מיליון') n *= 1_000_000;
  else if (m[2] === 'אלף') n *= 1000;
  return Math.round(n);
}

/** An amount stated inside free text. It must carry a unit (million, thousand, ₪, ש"ח) so head counts are ignored. */
export function detectAmount(text: string): number {
  const m = String(text ?? '').match(/חצי\s+מיליון|(?:\d[\d,.]*\s*)?מיליון|\d[\d,.]*\s*(?:אלף|₪|ש"ח|ש״ח)/);
  return m ? parseAmount(m[0]) : 0;
}
