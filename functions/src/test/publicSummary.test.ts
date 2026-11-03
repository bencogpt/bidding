// Unit tests for the public service description (פרק ב'):
//   node --test functions/lib/test/publicSummary.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fallbackPublicSummary, splitRequestBrief } from '@obms/shared';
import { publicServiceSummary, usablePublicSummary } from '../services/publicSummary.js';

// Request 2026-6 as it was sent: description, a clarification, and chosen recommendations (internal).
const BRIEF = "בדיקות חדירה, מומחיות ענן, ייעוץ הגנה, סקרי סיכונים\nבדיקות חדירה, devsecops, ייעוץ SOC, מומחיות ענן וניהול פגיעויות\n\nהבהרות מהדורש:\n- CISSP/CEH מחויב\n\nהמלצות שנבחרו:\n- הדרישות בחלק ה'תיאור' סותרות זו את זו: בחלק אחד מוזכר ייעוץ SOC ו-DevSecOps ובחלק אחר הן נעדרות. יש לאחד את רשימת השירותים לרשימה אחת מוסכמת וסופית כדי למנוע מחלוקות פרשנות בשלב ההצעות.\n- תפקיד 'ארכיטקט אבטחה' מוגדר כראש הצוות, אך אין פירוט של דרישות ניסיון מינימלי (שנות ניסיון, תחומי התמחות) לתפקיד זה – פרט לתעודות CISSP/CEH. יש להגדיר קריטריונים ברורים לאיוש התפקיד.\n- המסמך מגדיר 'כוננויות' כחלק מתנאי העסקה אך אינו מפרט זמני תגובה נדרשים (SLA) לאירועי אבטחה. היעדר SLA מוגדר מקשה על אכיפה ועל השוואת הצעות.\n- צוין שהספק יספק 'כלי בדיקה מתמחים', אך אין דרישה לגילוי ותיעוד הכלים שישמשו, לרבות גרסאות ורישיונות. הדבר עלול להוות סיכון אבטחתי ורגולטורי בסביבת הלקוח.\n- מומלץ להוסיף דרישה להגשת מתודולוגיית עבודה מפורטת (כגון OWASP, PTES או מסגרת דומה) כחלק מהצעת הספק, לצורך הבטחת אחידות ואיכות ביצוע הבדיקות.\n- מקובל לכלול בבל\"מ לשירותי סייבר סעיף סודיות והגנה על מידע (NDA) המחייב את הספק ועובדיו, לנוכח הגישה למידע רגיש בדרגת 'שמור' ועבודה באתר הלקוח.";

test('the request splits into the requester description and its internal sections', () => {
  const { description, sections } = splitRequestBrief(BRIEF);
  assert.match(description, /בדיקות חדירה/);
  assert.doesNotMatch(description, /הבהרות|המלצות/);
  assert.deepEqual(sections['הבהרות מהדורש:'], ['CISSP/CEH מחויב']);
  assert.equal(sections['המלצות שנבחרו:'].length, 6);
});

test('without AI: description + clarifications only — no recommendations, no headings', () => {
  const s = fallbackPublicSummary(BRIEF);
  assert.match(s, /CISSP\/CEH מחויב/);
  assert.doesNotMatch(s, /הבהרות מהדורש|המלצות שנבחרו|סותרות|מומלץ/);
});

test('a model summary is used only when clean', () => {
  assert.equal(usablePublicSummary('  '), null);
  assert.equal(usablePublicSummary('שירותי {{x}}'), null);
  assert.equal(usablePublicSummary('המלצות שנבחרו - משהו'), null, 'no internal heading');
  assert.equal(usablePublicSummary('המזמין מבקש שירותי אבטחת מידע:\n- בדיקות חדירה'), 'המזמין מבקש שירותי אבטחת מידע:\n- בדיקות חדירה');
});

const fakeClient = (summary: unknown, fail = false) =>
  ({
    messages: {
      create: async () => {
        if (fail) throw new Error('boom');
        return { content: [{ type: 'tool_use', id: 't', name: 'return_summary', input: { summary } }] };
      },
    },
  }) as never;

test('publicServiceSummary: the model text, else the fallback', async () => {
  const ok = await publicServiceSummary(BRIEF, fakeClient('המזמין מבקש שירותי הגנת סייבר:\n- בדיקות חדירה\n- נדרשת הסמכת CISSP או CEH'));
  assert.equal(ok.source, 'model');
  assert.match(ok.summary, /CISSP/);
  const bad = await publicServiceSummary(BRIEF, fakeClient('המלצות שנבחרו: ...'));
  assert.equal(bad.source, 'script');
  const err = await publicServiceSummary(BRIEF, fakeClient('', true));
  assert.equal(err.source, 'script');
  assert.doesNotMatch(err.summary, /המלצות שנבחרו/);
  assert.equal((await publicServiceSummary(BRIEF, null)).source, 'script');
});
