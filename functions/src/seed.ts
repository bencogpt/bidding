// Seed script for the Firebase Emulator Suite.
// Usage (emulators running):  npm run seed   (from repo root or functions/)
// Sets emulator env defaults, creates auth users + custom-claim roles, suppliers, templates.
import process from 'node:process';

// SEED_TARGET=real seeds the live `biding-system` project (requires
// GOOGLE_APPLICATION_CREDENTIALS pointing at the service-account JSON).
// Default seeds the local Emulator Suite.
process.env.GCLOUD_PROJECT ??= 'biding-system';
if (process.env.SEED_TARGET !== 'real') {
  process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
  process.env.FIREBASE_AUTH_EMULATOR_HOST ??= '127.0.0.1:9099';
  process.env.FIREBASE_STORAGE_EMULATOR_HOST ??= '127.0.0.1:9199';
  console.log('Seeding EMULATOR suite (set SEED_TARGET=real for the live project).');
} else {
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    throw new Error('SEED_TARGET=real requires GOOGLE_APPLICATION_CREDENTIALS.');
  }
  console.log('Seeding LIVE project biding-system.');
}

const { auth } = await import('./lib/admin.js');
const { usersRepo, suppliersRepo, templatesRepo } = await import('./repositories.js');
const { TENDER_TYPES } = await import('@obms/shared');
const now = Date.now();

async function ensureUser(
  email: string,
  password: string,
  displayName: string,
  role: string,
  supplierId?: string,
  phone?: string,
) {
  let uid: string;
  try {
    const u = await auth.createUser({ email, password, displayName });
    uid = u.uid;
  } catch {
    const u = await auth.getUserByEmail(email);
    uid = u.uid;
  }
  await auth.setCustomUserClaims(uid, { role, supplierId });
  await usersRepo.upsert({
    uid,
    email,
    displayName,
    role: role as never,
    supplierId,
    ...(phone ? { phone } : {}),
    createdAt: now,
  });
  console.log(`  user ${email} (${role})${supplierId ? ' supplier=' + supplierId : ''}`);
  return uid;
}

console.log('Seeding internal users…'); // dummy phones (a bid manager must have one)
await ensureUser('manager@obms.test', 'password', 'דנה מנהלת', 'tender_manager', undefined, '050-0000001');
await ensureUser('legal@obms.test', 'password', 'עו״ד פריה', 'legal', undefined, '050-0000002');
await ensureUser('finance@obms.test', 'password', 'סבן כספים', 'finance', undefined, '050-0000003');
await ensureUser('security@obms.test', 'password', 'לנה ביטחון', 'security', undefined, '050-0000004');
await ensureUser('requester@obms.test', 'password', 'מרקוס מזמין', 'requester', undefined, '03-5550123');

console.log('Seeding suppliers + supplier accounts…');
const suppliers = [
  { id: 'sup_aegis', name: 'אגיס מערכות', email: 'a@aegis.test', isIsraeli: true },
  { id: 'sup_meridian', name: 'מרידיאן טכנולוגיות', email: 'b@meridian.test', isIsraeli: true },
  { id: 'sup_globex', name: 'Globex International', email: 'c@globex.test', isIsraeli: false },
];
for (const s of suppliers) {
  await suppliersRepo.upsert({
    id: s.id,
    name: s.name,
    contactEmail: s.email,
    country: s.isIsraeli ? 'IL' : 'US',
    isIsraeli: s.isIsraeli,
    status: 'active',
    createdAt: now,
  });
  await ensureUser(s.email, 'password', s.name, 'supplier', s.id);
}

// Mandatory legal sections (s11) for the DEMO templates only. The text is a clearly marked stand-in:
// real templates must carry the organization's approved legal wording, which this seed never
// invents. Without the headings the supervisor would (correctly) block every demo tender.
const DEMO_LEGAL_SECTIONS = [
  'סודיות',
  'קניין רוחני',
  'אחריות ושיפוי',
  'ביטול/סיום התקשרות',
  'פיצויים מוסכמים',
  'בחירת ההצעה הזוכה',
  'מסמכים שיש לצרף להצעה',
].flatMap(
  (name) => [`## ${name}`, `[נוסח לדוגמה בסביבת הדגמה — יוחלף בנוסח המשפטי המאושר: ${name}]`],
);

console.log('Seeding tender templates…');
await templatesRepo.upsert({
  type: TENDER_TYPES.goods,
  title: 'תבנית מכרז טובין',
  googleTemplateDocId: null,
  bodyTemplate: [
    '## פרטי המכרז',
    'גוף מזמין: {{org}}',
    'תיאור הטובין הנדרשים: {{description}}',
    'כמות: {{quantity}}',
    '## תנאי סף',
    'על המציע לעמוד בכל דרישות התקן הרלוונטיות ולספק אחריות יצרן.',
    '## אופן ההגשה',
    'יש להגיש הצעת מחיר מפורטת בצירוף מפרט טכני מלא עד למועד ההגשה.',
    ...DEMO_LEGAL_SECTIONS,
  ].join('\n'),
  params: [
    { key: 'org', labelHe: 'גוף מזמין', type: 'text', required: true },
    { key: 'description', labelHe: 'תיאור הטובין', type: 'textarea', required: true },
    { key: 'quantity', labelHe: 'כמות', type: 'number', required: true },
    // The estimate is confidential (GLOBAL_RULES G6): kept internal, never in the document.
    { key: 'budget', labelHe: 'אומדן (₪) — פנימי, לא יפורסם', type: 'number', required: false, internal: true },
  ],
});
await templatesRepo.upsert({
  type: TENDER_TYPES.service,
  title: 'תבנית מכרז שירות וכוח-אדם',
  googleTemplateDocId: null,
  bodyTemplate: [
    '## פרטי המכרז',
    'מספר הבל"מ: {{bid_number}}',
    'שם הנמען על המעטפה: {{envelope_addressee}}',
    'נציג המזמין: {{requester_name}}, טלפון {{requester_phone}}',
    '## תקופת ההתקשרות',
    'סך נותני השירות: {{service_providers_total}}',
    'תקופת ההתקשרות הראשונה: {{initial_period_months}} חודשים',
    'מספר תקופות אופציה: {{option_periods}}',
    'סך מצטבר (התקשרות ואופציה): {{total_months}}',
    '## הגשת ההצעות',
    'יום הגשת ההצעות: {{submission_day}}',
    'מיקום תיבת ההצעות: {{bid_box_location}}',
    'תוקף ההצעה: {{offer_validity_days}} ימים',
    'מועד אחרון לשאלות הבהרה: {{clarification_deadline}}',
    'כתובת דוא"ל לשאלות הבהרה: {{clarification_email}}',
    'יעד מפת ההגעה (נספח 2): {{map_target}}',
    '## אמות מידה',
    'בל"מ איכותי: {{is_qualitative}}',
    'חלוקת הניקוד: {{economic_pct}}% כלכלי, {{quality_pct}}% איכותי',
    '## ערבות הצעה',
    'סכום ערבות ההצעה: {{guarantee_amount}} ₪ ({{guarantee_amount_words}})',
    'תוקף הערבות: {{guarantee_validity_days}} ימים',
    '## הסכם',
    'נציג המזמין בהסכם: {{contract_representative}}',
    '## דרישות מקצועיות',
    'על נותן השירות להציג ניסיון מוכח וכוח אדם מוסמך לתחום.',
    '## תנאי סף',
    'על נותן השירות להחזיק ברישיונות הנדרשים על פי דין.',
    '## אופן הגשת ההצעה',
    '[נוסח לדוגמה בסביבת הדגמה — יוחלף בנוסח המאושר: אופן הגשת ההצעה]',
    ...DEMO_LEGAL_SECTIONS,
  ].join('\n'),
  // Form order, required flags and system-filled fields follow the services create-form spec.
  // Fields without a rule or value yet are `hidden`: not asked, and left blank until one is set.
  params: [
    { key: 'estimate', labelHe: 'אומדן (₪) — פנימי, לא יפורסם', type: 'number', required: true, internal: true, order: 4 },
    { key: 'guarantee_amount', labelHe: 'סכום ערבות ההצעה (₪)', type: 'number', required: false, order: 5, defaultFrom: 'guarantee_pct' },
    { key: 'guarantee_validity_days', labelHe: 'תוקף ההצעה וערבות ההצעה (ימים)', type: 'number', required: false, order: 6 },
    { key: 'service_providers_total', labelHe: 'סך נותני השירות (סכום הכמויות מהדמ"צ)', type: 'number', required: false, order: 6.5 },
    { key: 'initial_period_months', labelHe: 'תקופת ההתקשרות הראשונה (חודשים)', type: 'number', required: false, order: 7 },
    { key: 'option_periods', labelHe: 'מספר תקופות אופציה', type: 'number', required: false, order: 8 },
    { key: 'clarification_deadline', labelHe: 'מועד אחרון לשאלות הבהרה', type: 'date', required: true, order: 10 },
    { key: 'map_target', labelHe: 'יעד מפת ההגעה (נספח 2)', type: 'text', required: false, order: 10.5 },
    { key: 'is_qualitative', labelHe: 'האם הבל"מ איכותי', type: 'checkbox', required: true, order: 16 },
    { key: 'economic_pct', labelHe: 'חלוקת הניקוד — כלכלי (%)', type: 'number', required: true, order: 17 },
    // ---- filled by the system ----
    { key: 'bid_number', labelHe: 'מספר הבל"מ', type: 'text', required: false },
    { key: 'guarantee_amount_words', labelHe: 'סכום ערבות ההצעה במילים', type: 'text', required: false, fill: { kind: 'formula', formula: 'guarantee_words' } },
    { key: 'offer_validity_days', labelHe: 'תוקף ההצעה (ימים)', type: 'number', required: false, fill: { kind: 'copy', from: 'guarantee_validity_days' } },
    { key: 'quality_pct', labelHe: 'חלוקת הניקוד — איכותי (%)', type: 'number', required: false, fill: { kind: 'formula', formula: 'quality_pct' } },
    { key: 'total_months', labelHe: 'סך מצטבר חודשים (התקשרות ואופציה)', type: 'number', required: false, fill: { kind: 'formula', formula: 'total_months' } },
    { key: 'envelope_addressee', labelHe: 'שם הנמען על המעטפה', type: 'text', required: false, fill: { kind: 'formula', formula: 'manager_name' } },
    { key: 'submission_day', labelHe: 'יום הגשת ההצעות', type: 'text', required: false, fill: { kind: 'formula', formula: 'submission_day' } },
    { key: 'bid_box_location', labelHe: 'מיקום תיבת ההצעות', type: 'text', required: false, fill: { kind: 'fixed', value: 'מרכז למורשת מודיעין' }, display: true, order: 9.5 },
    { key: 'requester_name', labelHe: 'שם נציגת המזמין', type: 'text', required: false, fill: { kind: 'formula', formula: 'requester_name' } },
    { key: 'requester_phone', labelHe: 'טלפון נציגת המזמין', type: 'text', required: false, fill: { kind: 'formula', formula: 'requester_phone' } },
    { key: 'clarification_email', labelHe: 'כתובת דוא"ל לשאלות הבהרה', type: 'text', required: false, fill: { kind: 'formula', formula: 'manager_email' } },
    { key: 'contract_representative', labelHe: 'נציג המזמין בהסכם (פרק ד׳)', type: 'text', required: false, fill: { kind: 'formula', formula: 'manager_name' } },
    // ---- not asked, no rule or value yet ----
    { key: 'core_providers', labelHe: 'מספר נותני שירות בגרעין ההקמה', type: 'number', required: false, hidden: true },
    { key: 'service_location', labelHe: 'מקום ביצוע השירות', type: 'text', required: false, hidden: true },
    { key: 'overlap_grant', labelHe: 'מענק תקופת חפיפה (₪)', type: 'number', required: false, hidden: true },
    { key: 'guarantee_office', labelHe: 'משרד בכתב הערבות', type: 'text', required: false, hidden: true },
    { key: 'signing_year', labelHe: 'שנת חתימת ההסכם', type: 'number', required: false, hidden: true },
    { key: 'damages_cap', labelHe: 'תקרת פיצוי מוסכם (סעיף 3)', type: 'number', required: false, hidden: true },
    { key: 'meals_monthly_payment', labelHe: 'תשלום חודשי קבוע עבור ארוחות (₪)', type: 'number', required: false, hidden: true },
    { key: 'meals_bank_details', labelHe: 'פרטי חשבון הבנק לארוחות', type: 'text', required: false, hidden: true },
    { key: 'transport_offset', labelHe: 'קיזוז תשלום הסעות (₪)', type: 'number', required: false, hidden: true },
  ],
});
await templatesRepo.upsert({
  type: TENDER_TYPES.project,
  title: 'תבנית מכרז פרויקטלי',
  googleTemplateDocId: null,
  bodyTemplate: [
    '## פרטי המכרז',
    'גוף מזמין: {{org}}',
    'תכולת הפרויקט: {{scope}}',
    'רכיב השירות הנלווה: {{service}}',
    'אבני דרך עיקריות: {{milestones}}',
    '## תנאים',
    'הפרויקט כולל אספקה והקמה לצד שירות ותחזוקה לאורך תקופת ההתקשרות.',
    '## תנאי סף',
    'על המציע להציג ניסיון בביצוע פרויקט דומה בהיקף ובמורכבות.',
    '## אופן הגשת ההצעה',
    '[נוסח לדוגמה בסביבת הדגמה — יוחלף בנוסח המאושר: אופן הגשת ההצעה]',
    ...DEMO_LEGAL_SECTIONS,
  ].join('\n'),
  params: [
    { key: 'org', labelHe: 'גוף מזמין', type: 'text', required: true },
    { key: 'scope', labelHe: 'תכולת הפרויקט', type: 'textarea', required: true },
    { key: 'service', labelHe: 'רכיב השירות', type: 'textarea', required: true },
    { key: 'milestones', labelHe: 'אבני דרך', type: 'text', required: false },
  ],
});

console.log('Seed complete.');
process.exit(0);
