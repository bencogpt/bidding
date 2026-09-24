/* ============================================================
   OBMS — Mock data layer (static demo)
   ============================================================ */

const ROLES = {
  bid_manager:      { name: 'Dana Reyes',      title: 'Bid Manager',        type: 'internal', initials: 'DR', accent: '#0e8c8c' },
  internal_customer:{ name: 'Marcus Hale',     title: 'Internal Customer',  type: 'internal', initials: 'MH', accent: '#7c52d6' },
  legal:            { name: 'Priya Nandakumar',title: 'Legal Department',   type: 'internal', initials: 'PN', accent: '#2f6fd8' },
  finance:          { name: 'Sven Olsson',     title: 'Finance Department', type: 'internal', initials: 'SO', accent: '#1f9d62' },
  inspection:       { name: 'Lena Fischer',    title: 'Inspection',         type: 'internal', initials: 'LF', accent: '#d8932f' },
};

const STATUS_META = {
  draft:      { label: 'Draft',              cls: 'st-draft' },
  review:     { label: 'Internal Review',    cls: 'st-review' },
  ready:      { label: 'Ready',              cls: 'st-ready' },
  published:  { label: 'Published',          cls: 'st-published' },
  responses:  { label: 'Responses Received', cls: 'st-responses' },
  awarded:    { label: 'Evaluated / Awarded',cls: 'st-awarded' },
};

const LIFECYCLE = [
  { key: 'draft',     n: '1', name: 'Draft',          trigger: 'Internal Customer' },
  { key: 'review',    n: '2', name: 'Internal Review', trigger: 'Bid Manager' },
  { key: 'ready',     n: '3', name: 'Ready',           trigger: 'Bid Manager' },
  { key: 'published', n: '4', name: 'Published',       trigger: 'Bid Manager' },
  { key: 'responses', n: '5', name: 'Responses',       trigger: 'Suppliers' },
  { key: 'awarded',   n: '6', name: 'Evaluated',       trigger: 'Bid Manager' },
];

const BIDS = [
  {
    id: 'BID-2026-0148',
    title: 'Perimeter Surveillance & Access Control Modernization',
    category: 'Security Infrastructure',
    status: 'responses',
    owner: 'Dana Reyes',
    customer: 'Facilities & Site Security',
    created: '2026-05-04',
    deadline: '2026-06-22T17:00:00',
    published: '2026-05-29',
    value: '$4.2M – $5.8M',
    suppliers: 4,
    documents: [
      { name: 'Bid Requirement Specification', type: 'pdf', ver: 3, size: '2.4 MB', by: 'Marcus Hale', at: '2026-05-26', active: true },
      { name: 'Technical Scope Annex A', type: 'docx', ver: 2, size: '880 KB', by: 'Lena Fischer', at: '2026-05-20', active: true },
      { name: 'Site Layout & Camera Plan', type: 'img', ver: 1, size: '6.1 MB', by: 'Marcus Hale', at: '2026-05-06', active: true },
      { name: 'Evaluation Rubric & Weights', type: 'xlsx', ver: 1, size: '142 KB', by: 'Dana Reyes', at: '2026-05-27', active: true },
    ],
    artifacts: [
      { name: 'Legal Opinion — Liability Clauses', type: 'pdf', ver: 2, size: '410 KB', by: 'Priya Nandakumar', dept: 'legal', at: '2026-05-18' },
      { name: 'Budget Envelope Assessment', type: 'xlsx', ver: 1, size: '96 KB', by: 'Sven Olsson', dept: 'finance', at: '2026-05-19' },
      { name: 'Inspection & Acceptance Checklist', type: 'pdf', ver: 3, size: '320 KB', by: 'Lena Fischer', dept: 'inspection', at: '2026-05-21' },
    ],
    reviews: {
      legal:      { status: 'complete',  reviewer: 'Priya Nandakumar', initials: 'PN', items: [
        { who: 'Priya Nandakumar', init: 'PN', at: '2026-05-18', text: 'Indemnification clause §7.3 must reference the updated 2026 liability framework. Suggested wording attached as artifact.' },
        { who: 'Priya Nandakumar', init: 'PN', at: '2026-05-22', text: 'Resolved — Bid Manager incorporated revised clause. Marking review complete.' },
      ]},
      finance:    { status: 'complete',  reviewer: 'Sven Olsson', initials: 'SO', items: [
        { who: 'Sven Olsson', init: 'SO', at: '2026-05-19', text: 'Budget envelope confirmed within approved CAPEX band. Payment milestones should be tied to acceptance gates, not calendar dates.' },
      ]},
      inspection: { status: 'complete',  reviewer: 'Lena Fischer', initials: 'LF', items: [
        { who: 'Lena Fischer', init: 'LF', at: '2026-05-15', text: 'Technical spec lacks explicit IP66 enclosure rating for exterior units. Flagging as blocking until added.', flag: 'blocking' },
        { who: 'Lena Fischer', init: 'LF', at: '2026-05-21', text: 'Enclosure rating now specified in Annex A v2. Acceptance criteria complete.' },
      ]},
    },
  },
  {
    id: 'BID-2026-0151',
    title: 'Enterprise Data Warehouse — Hardware & Licensing',
    category: 'IT Infrastructure',
    status: 'review',
    owner: 'Dana Reyes',
    customer: 'Information Systems',
    created: '2026-06-01',
    deadline: '2026-07-15T17:00:00',
    published: null,
    value: '$1.8M – $2.4M',
    suppliers: 0,
    documents: [
      { name: 'Bid Requirement Specification', type: 'pdf', ver: 2, size: '1.9 MB', by: 'Marcus Hale', at: '2026-06-10', active: true },
      { name: 'Capacity & Throughput Requirements', type: 'xlsx', ver: 1, size: '210 KB', by: 'Marcus Hale', at: '2026-06-03', active: true },
    ],
    artifacts: [
      { name: 'Preliminary Legal Notes', type: 'docx', ver: 1, size: '64 KB', by: 'Priya Nandakumar', dept: 'legal', at: '2026-06-12' },
    ],
    reviews: {
      legal:      { status: 'reviewing', reviewer: 'Priya Nandakumar', initials: 'PN', items: [
        { who: 'Priya Nandakumar', init: 'PN', at: '2026-06-12', text: 'Data residency obligations need to be explicit — all data at rest must remain in-region. Reviewing vendor DPA templates.' },
      ]},
      finance:    { status: 'reviewing', reviewer: 'Sven Olsson', initials: 'SO', items: [
        { who: 'Sven Olsson', init: 'SO', at: '2026-06-11', text: 'Requesting a 5-year TCO model including support renewals before sign-off.' },
      ]},
      inspection: { status: 'pending', reviewer: 'Lena Fischer', initials: 'LF', items: [] },
    },
  },
  {
    id: 'BID-2026-0153',
    title: 'Fleet Telematics & Maintenance Platform',
    category: 'Logistics',
    status: 'draft',
    owner: 'Dana Reyes',
    customer: 'Fleet Operations',
    created: '2026-06-17',
    deadline: '2026-08-01T17:00:00',
    published: null,
    value: 'TBD',
    suppliers: 0,
    documents: [
      { name: 'Draft Requirement Outline', type: 'docx', ver: 1, size: '320 KB', by: 'Marcus Hale', at: '2026-06-17', active: true },
    ],
    artifacts: [],
    reviews: {
      legal:      { status: 'pending', reviewer: 'Priya Nandakumar', initials: 'PN', items: [] },
      finance:    { status: 'pending', reviewer: 'Sven Olsson', initials: 'SO', items: [] },
      inspection: { status: 'pending', reviewer: 'Lena Fischer', initials: 'LF', items: [] },
    },
  },
  {
    id: 'BID-2026-0139',
    title: 'Campus HVAC Retrofit — Phase II',
    category: 'Facilities',
    status: 'awarded',
    owner: 'Dana Reyes',
    customer: 'Facilities & Site Security',
    created: '2026-03-11',
    deadline: '2026-04-28T17:00:00',
    published: '2026-03-30',
    value: '$3.1M',
    suppliers: 5,
    awardedTo: 'Supplier C',
    documents: [
      { name: 'Bid Requirement Specification', type: 'pdf', ver: 4, size: '3.0 MB', by: 'Marcus Hale', at: '2026-03-28', active: true },
    ],
    artifacts: [],
    reviews: {
      legal:      { status: 'complete', reviewer: 'Priya Nandakumar', initials: 'PN', items: [] },
      finance:    { status: 'complete', reviewer: 'Sven Olsson', initials: 'SO', items: [] },
      inspection: { status: 'complete', reviewer: 'Lena Fischer', initials: 'LF', items: [] },
    },
  },
];

/* ---- AI Comparison Report (for BID-2026-0148) ---- */
const AI_REPORT = {
  bidId: 'BID-2026-0148',
  generated: '2026-06-22T17:06:00',
  durationSec: 214,
  anonymized: true,
  suppliers: ['Supplier A', 'Supplier B', 'Supplier C', 'Supplier D'],
  criteria: [
    { name: 'Technical Compliance', weight: 30, scores: { 'Supplier A': 88, 'Supplier B': 72, 'Supplier C': 94, 'Supplier D': 61 } },
    { name: 'Total Cost of Ownership', weight: 25, scores: { 'Supplier A': 79, 'Supplier B': 91, 'Supplier C': 74, 'Supplier D': 95 } },
    { name: 'Delivery & Timeline', weight: 15, scores: { 'Supplier A': 85, 'Supplier B': 68, 'Supplier C': 90, 'Supplier D': 70 } },
    { name: 'Support & SLA', weight: 15, scores: { 'Supplier A': 92, 'Supplier B': 70, 'Supplier C': 88, 'Supplier D': 65 } },
    { name: 'Security & Compliance', weight: 10, scores: { 'Supplier A': 90, 'Supplier B': 64, 'Supplier C': 96, 'Supplier D': 58 } },
    { name: 'Past Performance', weight: 5,  scores: { 'Supplier A': 80, 'Supplier B': 75, 'Supplier C': 85, 'Supplier D': 72 } },
  ],
  swot: {
    'Supplier A': {
      strengths: ['Strongest SLA terms (4-hour on-site response)', 'Fully compliant security posture with SOC 2 Type II', 'Proven integration with existing VMS platform'],
      weaknesses: ['Mid-tier pricing — 11% above lowest bid', 'Phased rollout extends to 9 months'],
    },
    'Supplier C': {
      strengths: ['Highest technical compliance (94) — exceeds IP66 spec', 'Best delivery timeline at 6 months', 'Most complete compliance checklist with zero gaps'],
      weaknesses: ['Higher TCO driven by premium hardware', 'Support coverage limited to business hours unless upgraded'],
    },
    'Supplier B': {
      strengths: ['Competitive total cost of ownership', 'Flexible commercial terms'],
      weaknesses: ['Did not address redundancy requirements', 'No documented security certifications', 'Vague delivery commitments'],
    },
    'Supplier D': {
      strengths: ['Lowest total cost of ownership (95)', 'Aggressive pricing on hardware'],
      weaknesses: ['Technical compliance below threshold (61)', 'Missing IP66 enclosure rating', 'No 24/7 support option', 'Weakest security documentation'],
    },
  },
  compliance: [
    { req: 'IP66-rated exterior enclosures', 'Supplier A': 'met', 'Supplier B': 'partial', 'Supplier C': 'met', 'Supplier D': 'no' },
    { req: 'Redundant power & failover', 'Supplier A': 'met', 'Supplier B': 'no', 'Supplier C': 'met', 'Supplier D': 'partial' },
    { req: 'SOC 2 / ISO 27001 evidence', 'Supplier A': 'met', 'Supplier B': 'no', 'Supplier C': 'met', 'Supplier D': 'no' },
    { req: 'Integration with existing VMS', 'Supplier A': 'met', 'Supplier B': 'partial', 'Supplier C': 'met', 'Supplier D': 'partial' },
    { req: '24/7 monitored support SLA', 'Supplier A': 'met', 'Supplier B': 'partial', 'Supplier C': 'partial', 'Supplier D': 'no' },
  ],
  risks: [
    { level: 'high', supplier: 'Supplier D', title: 'Technical non-compliance', desc: 'Response omits IP66 enclosure rating mandated in Annex A — exterior units would not meet site environmental requirements.' },
    { level: 'high', supplier: 'Supplier B', title: 'No security certification evidence', desc: 'No SOC 2 / ISO 27001 documentation provided; cannot verify data-handling compliance for access-control subsystem.' },
    { level: 'amber', supplier: 'Supplier C', title: 'Ambiguous support coverage', desc: 'SLA language implies business-hours-only support; 24/7 coverage appears to require an unpriced upgrade. Clarification recommended.' },
    { level: 'amber', supplier: 'Supplier A', title: 'Timeline risk', desc: '9-month phased rollout exceeds the 7-month target window in the requirement spec.' },
  ],
};

/* weighted total */
function weightedScore(report, supplier) {
  let total = 0;
  report.criteria.forEach(c => { total += (c.scores[supplier] * c.weight) / 100; });
  return Math.round(total * 10) / 10;
}

/* ---- Supplier portal context (single isolated supplier) ---- */
const SUPPLIER_CTX = {
  account: 'Aegis Integrated Systems',
  code: 'Supplier A',
  contact: 'j.okoro@aegis-is.example',
  bid: {
    id: 'BID-2026-0148',
    title: 'Perimeter Surveillance & Access Control Modernization',
    category: 'Security Infrastructure',
    org: 'Northbridge Authority — Procurement Office',
    deadline: '2026-06-22T17:00:00',
    published: '2026-05-29',
  },
  publicDocs: [
    { name: 'Public Bid Document', type: 'pdf', size: '2.4 MB' },
    { name: 'Technical Scope Annex A', type: 'docx', size: '880 KB' },
    { name: 'Submission Instructions', type: 'pdf', size: '180 KB' },
  ],
  submission: [
    { name: 'Aegis_Technical_Response.pdf', type: 'pdf', size: '4.8 MB', at: '2026-06-19 14:22' },
    { name: 'Aegis_Pricing_Sheet.xlsx', type: 'xlsx', size: '220 KB', at: '2026-06-19 14:23' },
    { name: 'Compliance_Matrix.docx', type: 'docx', size: '340 KB', at: '2026-06-20 09:10' },
  ],
};

/* ---- Audit log ---- */
const AUDIT = [
  { actor: 'Dana Reyes', role: 'Bid Manager', action: 'publish', label: 'PUBLISH', detail: 'Published BID-2026-0148 to 4 registered suppliers', at: '2026-05-29 09:14' },
  { actor: 'System', role: 'System', action: 'login', label: 'NOTIFY', detail: 'Publication notifications dispatched to suppliers (individual)', at: '2026-05-29 09:14' },
  { actor: 'Lena Fischer', role: 'Inspection', action: 'feedback', label: 'FEEDBACK', detail: 'Marked review COMPLETE on BID-2026-0148', at: '2026-05-21 16:40' },
  { actor: 'Lena Fischer', role: 'Inspection', action: 'upload', label: 'UPLOAD', detail: 'Uploaded "Inspection & Acceptance Checklist" v3', at: '2026-05-21 16:38' },
  { actor: 'Dana Reyes', role: 'Bid Manager', action: 'status', label: 'STATUS', detail: 'BID-2026-0148 transitioned Internal Review → Ready', at: '2026-05-28 11:02' },
  { actor: 'Sven Olsson', role: 'Finance', action: 'feedback', label: 'FEEDBACK', detail: 'Added financial assessment comment on BID-2026-0148', at: '2026-05-19 10:25' },
  { actor: 'Priya Nandakumar', role: 'Legal', action: 'upload', label: 'UPLOAD', detail: 'Uploaded "Legal Opinion — Liability Clauses" v2', at: '2026-05-18 15:11' },
  { actor: 'Marcus Hale', role: 'Internal Customer', action: 'upload', label: 'UPLOAD', detail: 'Uploaded "Bid Requirement Specification" v3', at: '2026-05-26 08:50' },
  { actor: 'Marcus Hale', role: 'Internal Customer', action: 'status', label: 'CREATE', detail: 'Created bid project BID-2026-0148', at: '2026-05-04 13:30' },
  { actor: 'Supplier A', role: 'External Supplier', action: 'upload', label: 'UPLOAD', detail: 'Submission revised — 3 files in private space (isolated)', at: '2026-06-20 09:10' },
];
