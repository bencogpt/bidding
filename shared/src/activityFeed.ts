// The "פעילות" tab: the case's audit log as Hebrew sentences (prototype renderAct, lines 2787–2796; plan B6).
// One sentence per audit action the case flow writes. Actions without a sentence here are technical (scores,
// provenance, background research…) and are left out — the tab never shows a raw action code.
import { ROLE_HE } from './workspaceLabels.js';
import type { ApprovalRole } from './workspaceLabels.js';

const pad = (n: number) => String(n).padStart(2, '0');

/** "DD.MM.YYYY HH:mm" in local time — the activity and version tables (prototype dates, lines 2791–2794). */
export function fmtDateTime(ms: number): string {
  const d = new Date(ms);
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** The part of an audit entry the sentences use (AuditDoc has more). */
export interface ActivityEntry {
  id?: string;
  action: string;
  actorName: string;
  prevState: string | null;
  newState: string | null;
  detail?: string;
  at: number;
}

export interface ActivityRow {
  key: string;
  at: number;
  text: string;
}

const VERDICT_HE: Record<string, string> = { PASS: 'תקין', WARN: 'אזהרות', BLOCK: 'חוסם' };

const roleHe = (role: string | null | undefined) => ROLE_HE[(role ?? '') as ApprovalRole] ?? (role ?? '');
const count = (n: number, one: string, many: string) => (n === 1 ? one : `${n} ${many}`);

/** Cut at the first " · ": "אורי מזרחי · אורי בחופשה" → ["אורי מזרחי", "אורי בחופשה"]. */
function splitFirst(s: string | undefined): [string, string] {
  const i = (s ?? '').indexOf(' · ');
  return i < 0 ? [s ?? '', ''] : [s!.slice(0, i), s!.slice(i + 3)];
}

/**
 * One entry as a sentence, or null when the action is not part of the case's story. `labelOf` turns a draft
 * field key into its Hebrew label.
 */
export function activitySentence(e: ActivityEntry, labelOf: (key: string) => string | undefined = () => undefined): string | null {
  const who = e.actorName || 'מערכת';
  switch (e.action) {
    case 'create':
      return `${who} יצר את הבל"מ`;
    case 'document_generated':
      return `${who} יצר את המסמך מהטיוטה`;
    case 'document_reset':
      return `${who} יצר מחדש את המסמך מנתוני הטיוטה`;
    case 'draft_updated': {
      const keys = (e.detail ?? '')
        .split(',')
        .map((k) => k.trim())
        .filter(Boolean);
      if (!keys.length) return `${who} עדכן את הטיוטה`;
      const labels = keys.slice(0, 4).map((k) => labelOf(k) ?? k);
      return `${who} עדכן בטיוטה: ${labels.join(', ')}${keys.length > 4 ? ` ועוד ${keys.length - 4}` : ''}`;
    }
    case 'supervision': {
      if (e.prevState === 'edit') return null; // the rules re-check after every draft edit: noise
      const m = /(\d+) חוסמים · (\d+) ממצאים/.exec(e.detail ?? '');
      if (!m) return `הסוכן המפקח בדק: ${VERDICT_HE[e.newState ?? ''] ?? ''}`.trim();
      const blocking = Number(m[1]);
      return `הסוכן המפקח בדק: ${count(Number(m[2]), 'ממצא אחד', 'ממצאים')}${blocking ? `, מהם ${blocking} חוסמים` : ', אין ממצא חוסם'}`;
    }
    case 'supervisor_override':
      return `${who} פרסם בחריגה מתועדת מעל חסימת הסוכן המפקח: ${(e.detail ?? '').replace(/\s*\(run [^)]*\)\s*$/, '')}`;
    case 'finding_applied': {
      const n = Number(e.newState);
      return `${who} הטמיע ${count(n, 'ממצא אחד', 'ממצאים')}`;
    }
    case 'finding_skipped': {
      const n = Number(e.newState);
      return `${who} השאיר ${count(n, 'ממצא אחד', 'ממצאים')} כמו שהם`;
    }
    case 'approve_tender':
      return `אישור מסמך: ${who} · ${roleHe(e.newState)}`; // v22 (pack 2.6.8 held)
    case 'withdraw_approval':
      return `האישור בוטל: ${who} · ${roleHe(e.newState)}`;
    case 'approve_on_behalf': {
      const [holder, reason] = splitFirst(e.detail);
      return `אישור בשם: ${who} אישר בשם ${holder} · ${roleHe(e.newState)}${reason ? ` · סיבה: ${reason}` : ''}`;
    }
    case 'withdraw_on_behalf':
      return `${who} ביטל את האישור שניתן בשם ${roleHe(e.newState)}`;
    case 'tender_reopened':
      return `${who} פתח מחדש: ${e.detail ?? 'נוצרה גרסה חדשה מקושרת. המקור נשאר נעול'}`;
    case 'team_assigned': {
      const i = (e.newState ?? '').indexOf(':');
      if (i < 0) return null;
      const name = e.newState!.slice(i + 1);
      const role = roleHe(e.newState!.slice(0, i));
      // A unit assigning its own contact is the same person twice: say it once.
      return name === who ? `שיוך לתפקיד ${role}: ${name}` : `${who} שייך את ${name} לתפקיד ${role}`;
    }
    case 'team_unassigned':
      return `${who} הסיר את השיבוץ של ${roleHe(e.newState)}`;
    case 'suppliers_selected':
      return `${who} בחר ספקים לפרסום${e.newState ? ` (${e.newState})` : ''}`;
    // The final check (plan G-D3–G-D5), in v22's chat wording (pack 2.6.9 held).
    case 'final_check_started':
      return 'כל הרביעייה אישרה. הסוכן המפקח מבצע בדיקה סופית לפני הפרסום לספקים';
    case 'final_check_blocked':
      return 'הבדיקה הסופית מצאה ממצא חוסם. המכרז לא עבר לפרסום לספקים';
    case 'final_check_ai_unavailable':
      return 'הבדיקה הסופית לא הושלמה: בדיקת ה-AI אינה זמינה'; // new
    case 'final_check_override':
      return `${who} המשיך לפרסום לספקים בלי בדיקת AI · סיבה: ${e.detail ?? ''}`; // new
    case 'approvals_cancelled':
      return `המסמך השתנה אחרי האישור, ולכן בוטלו האישורים של: ${(e.newState ?? '').split(',').map(roleHe).join(', ')}`; // new
    case 'status_change':
      switch (e.newState) {
        case 'internal_review':
          return `נשלח לאישור: ${who} · ${ROLE_HE.manager}`;
        case 'ready':
          return 'הבדיקה הסופית עברה: המסמך עדיין תקין. הרכש יכול לפרסם לספקים';
        case 'published':
          return `פורסם לספקים: ${who} · ${ROLE_HE.manager}`;
        case 'responses':
          return 'התקבלה הצעה ראשונה: הבל"מ עבר לשלב ההצעות';
        case 'evaluated':
          return `${who} הפעיל את השוואת ההצעות`;
        case 'awarded':
          return `${who} הכריז על זוכה`;
        case 'draft':
          // Taking the send back (v22 cancelApproval for procurement); reopening has a sentence of its own.
          return e.prevState === 'internal_review' ? `${who} ביטל את השליחה לאישור` : null; // new
        default:
          return null;
      }
    default:
      return null;
  }
}

/** The case's activity, newest first. */
export function activityRows(
  entries: readonly ActivityEntry[],
  labelOf?: (key: string) => string | undefined,
): ActivityRow[] {
  return entries
    .map((e, i): ActivityRow | null => {
      const text = activitySentence(e, labelOf);
      return text ? { key: e.id ?? `${e.at}:${i}`, at: e.at, text } : null;
    })
    .filter((r): r is ActivityRow => !!r)
    .sort((a, b) => b.at - a.at);
}
