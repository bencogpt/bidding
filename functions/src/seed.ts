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
    createdAt: now,
  });
  console.log(`  user ${email} (${role})${supplierId ? ' supplier=' + supplierId : ''}`);
  return uid;
}

console.log('Seeding internal users…');
await ensureUser('manager@obms.test', 'password', 'דנה מנהלת', 'tender_manager');
await ensureUser('legal@obms.test', 'password', 'עו״ד פריה', 'legal');
await ensureUser('finance@obms.test', 'password', 'סבן כספים', 'finance');
await ensureUser('security@obms.test', 'password', 'לנה ביטחון', 'security');
await ensureUser('requester@obms.test', 'password', 'מרקוס מזמין', 'requester');

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
    'גוף מזמין: {{org}}',
    'תיאור השירות הנדרש: {{description}}',
    'היקף כוח אדם נדרש: {{headcount}} אנשי צוות',
    'משך ההתקשרות: {{duration}}',
    '## דרישות מקצועיות',
    'על נותן השירות להציג ניסיון מוכח וכוח אדם מוסמך לתחום.',
    '## תנאי סף',
    'על נותן השירות להחזיק ברישיונות הנדרשים על פי דין.',
    '## אופן הגשת ההצעה',
    '[נוסח לדוגמה בסביבת הדגמה — יוחלף בנוסח המאושר: אופן הגשת ההצעה]',
    ...DEMO_LEGAL_SECTIONS,
  ].join('\n'),
  params: [
    { key: 'org', labelHe: 'גוף מזמין', type: 'text', required: true },
    { key: 'description', labelHe: 'תיאור השירות', type: 'textarea', required: true },
    { key: 'headcount', labelHe: 'היקף כוח אדם', type: 'number', required: true },
    { key: 'duration', labelHe: 'משך ההתקשרות', type: 'text', required: true },
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
