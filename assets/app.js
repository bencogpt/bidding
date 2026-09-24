/* ============================================================
   OBMS — App logic (static demo, no backend)
   ============================================================ */

/* ---- Minimal inline SVG icon set ---- */
const ICONS = {
  grid:    '<path d="M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z"/>',
  bid:     '<path d="M4 4h16v4H4zM4 10h10M4 14h16M4 18h10"/>',
  workspace:'<path d="M3 7l9-4 9 4-9 4-9-4zM3 7v10l9 4 9-4V7M12 11v10"/>',
  review:  '<path d="M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
  supplier:'<path d="M3 9l1-5h16l1 5M3 9v11h18V9M3 9h18M9 13h6"/>',
  ai:      '<path d="M12 3v3M12 18v3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M3 12h3M18 12h3M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/><circle cx="12" cy="12" r="3.2"/>',
  audit:   '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M9 13h6M9 17h4"/>',
  search:  '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/>',
  plus:    '<path d="M12 5v14M5 12h14"/>',
  upload:  '<path d="M12 16V4M6 10l6-6 6 6M4 20h16"/>',
  clock:   '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  lock:    '<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  shield:  '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>',
  check:   '<path d="M20 6L9 17l-5-5"/>',
  x:       '<path d="M18 6L6 18M6 6l12 12"/>',
  alert:   '<path d="M12 9v4M12 17h.01M10.3 3.9l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3l-8-14a2 2 0 0 0-3.4 0z"/>',
  arrow:   '<path d="M5 12h14M13 6l6 6-6 6"/>',
  doc:     '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>',
  trend:   '<path d="M3 17l6-6 4 4 8-8M21 7v6h-6"/>',
  users:   '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 7a4 4 0 1 0 0 0M23 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
  send:    '<path d="M22 2L11 13M22 2l-7 20-4-9-9-4z"/>',
  spark:   '<path d="M12 2l2.4 7.6L22 12l-7.6 2.4L12 22l-2.4-7.6L2 12l7.6-2.4z"/>',
  bell:    '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0"/>',
};
function icon(name, cls = 'ico') {
  return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ''}</svg>`;
}
const FT = { pdf: 'PDF', docx: 'DOC', xlsx: 'XLS', zip: 'ZIP', img: 'IMG' };
function fileIco(type) { return `<div class="doc-ico ft-${type}">${FT[type] || 'FILE'}</div>`; }
function badge(status) { const m = STATUS_META[status]; return `<span class="badge-st ${m.cls}"><span class="dot"></span>${m.label}</span>`; }

/* ---- State ---- */
let currentRole = 'bid_manager';
let currentBid = null;

/* ============================================================
   TOAST
   ============================================================ */
function toast(msg, ic = 'check') {
  let wrap = document.querySelector('.toast-wrap');
  if (!wrap) { wrap = document.createElement('div'); wrap.className = 'toast-wrap'; document.body.appendChild(wrap); }
  const t = document.createElement('div');
  t.className = 'toast';
  t.innerHTML = `<span class="ti">${icon(ic)}</span>${msg}`;
  wrap.appendChild(t);
  setTimeout(() => { t.style.transition = 'opacity .3s, transform .3s'; t.style.opacity = '0'; t.style.transform = 'translateX(40px)'; setTimeout(() => t.remove(), 320); }, 3200);
}

/* ============================================================
   MODAL
   ============================================================ */
function openModal(html) {
  let back = document.querySelector('.modal-back');
  if (!back) { back = document.createElement('div'); back.className = 'modal-back'; document.body.appendChild(back); back.addEventListener('click', e => { if (e.target === back) closeModal(); }); }
  back.innerHTML = `<div class="modal">${html}</div>`;
  requestAnimationFrame(() => back.classList.add('open'));
}
function closeModal() { const b = document.querySelector('.modal-back'); if (b) b.classList.remove('open'); }

/* ============================================================
   NAV
   ============================================================ */
function nav(view, push = true) {
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + view));
  document.querySelectorAll('.nav .navitem').forEach(n => n.classList.toggle('active', n.dataset.view === view));
  const titles = { dashboard: 'Dashboard', bids: 'All Bids', review: 'Review Queue', suppliers: 'Suppliers', ai: 'AI Evaluation', audit: 'Audit Trail', workspace: currentBid ? currentBid.id : 'Workspace' };
  setCrumb(titles[view] || 'Dashboard');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function setCrumb(leaf) {
  const el = document.getElementById('crumbs');
  if (el) el.innerHTML = `<span>OBMS</span><span class="sep">/</span><b>${leaf}</b>`;
}

/* ============================================================
   ROLE
   ============================================================ */
function setRole(role) {
  currentRole = role;
  const r = ROLES[role];
  document.getElementById('who-name').textContent = r.name;
  document.getElementById('who-title').textContent = r.title;
  const av = document.getElementById('who-avatar');
  av.textContent = r.initials;
  av.style.background = `linear-gradient(145deg, ${r.accent}, ${shade(r.accent, -25)})`;
  toast(`Viewing as <b>${r.title}</b>`, 'users');
}
function shade(hex, pct) {
  const n = parseInt(hex.slice(1), 16); let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  r = Math.max(0, Math.min(255, r + pct)); g = Math.max(0, Math.min(255, g + pct)); b = Math.max(0, Math.min(255, b + pct));
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

/* ============================================================
   RENDER: DASHBOARD
   ============================================================ */
function renderDashboard() {
  const active = BIDS.filter(b => b.status !== 'awarded').length;
  const inReview = BIDS.filter(b => b.status === 'review').length;
  const awaiting = BIDS.filter(b => b.status === 'responses').reduce((a, b) => a + b.suppliers, 0);
  const kpis = [
    { ic: 'bid', lbl: 'Active Bids', val: active, sub: `${BIDS.length} total this cycle`, trend: '+2', up: true },
    { ic: 'review', lbl: 'In Review', val: inReview, sub: 'awaiting department sign-off', trend: '3 depts', up: true },
    { ic: 'supplier', lbl: 'Supplier Responses', val: awaiting, sub: 'isolated submissions received', trend: 'live', up: true },
    { ic: 'spark', lbl: 'AI Reports', val: 1, sub: 'ready for human review', trend: 'new', up: true },
  ];
  document.getElementById('kpis').innerHTML = kpis.map(k => `
    <div class="card kpi-card">
      <div class="k-top"><span class="k-ico">${icon(k.ic)}</span>${k.lbl}</div>
      <div class="k-val">${k.val}</div>
      <div class="row spread center"><div class="k-sub">${k.sub}</div><div class="k-trend ${k.up ? 'up' : 'down'}">${k.trend}</div></div>
    </div>`).join('');

  // pipeline
  const order = ['draft', 'review', 'ready', 'published', 'responses', 'awarded'];
  document.getElementById('pipeline').innerHTML = order.map(st => {
    const items = BIDS.filter(b => b.status === st);
    const m = STATUS_META[st];
    return `<div class="card pad" style="padding:14px">
      <div class="row spread center" style="margin-bottom:10px">
        <span class="badge-st ${m.cls}"><span class="dot"></span>${m.label}</span>
        <span class="tag">${items.length}</span>
      </div>
      ${items.length ? items.map(b => `
        <div onclick="openBid('${b.id}')" style="padding:10px;border:1px solid var(--line);border-radius:10px;margin-bottom:8px;cursor:pointer;transition:.15s" onmouseover="this.style.borderColor='var(--gold)'" onmouseout="this.style.borderColor='var(--line)'">
          <div class="mono" style="font-size:11px;color:var(--text-mute)">${b.id}</div>
          <div style="font-weight:600;font-size:12.5px;margin-top:3px;line-height:1.3">${b.title}</div>
        </div>`).join('') : '<div style="color:var(--text-mute);font-size:12.5px;padding:10px 4px">—</div>'}
    </div>`;
  }).join('');

  renderBidTable('bid-table-body');
}

/* ============================================================
   RENDER: BID TABLE
   ============================================================ */
function renderBidTable(targetId, list = BIDS) {
  document.getElementById(targetId).innerHTML = list.map(b => `
    <tr onclick="openBid('${b.id}')">
      <td><div class="mono" style="font-size:12px;color:var(--text-mute)">${b.id}</div><div class="t-title">${b.title}</div></td>
      <td><span class="chip">${b.category}</span></td>
      <td>${badge(b.status)}</td>
      <td>${b.suppliers ? b.suppliers + ' suppliers' : '<span class="muted">—</span>'}</td>
      <td class="t-sub">${fmtDate(b.deadline)}</td>
      <td>${b.value}</td>
      <td style="text-align:right">${icon('arrow', 'ico')}</td>
    </tr>`).join('');
}

/* ============================================================
   RENDER: REVIEW QUEUE
   ============================================================ */
function renderReviewQueue() {
  const list = BIDS.filter(b => ['review', 'ready'].includes(b.status));
  const wrap = document.getElementById('review-queue');
  wrap.innerHTML = list.map(b => {
    const depts = ['legal', 'finance', 'inspection'];
    const done = depts.filter(d => b.reviews[d].status === 'complete').length;
    return `<div class="card pad" style="margin-bottom:16px">
      <div class="row spread center wrap gap12">
        <div>
          <div class="mono" style="font-size:11px;color:var(--text-mute)">${b.id}</div>
          <div style="font-weight:600;font-size:15px;margin-top:2px">${b.title}</div>
        </div>
        <div class="row gap12 center">
          <div style="text-align:right"><div style="font-weight:600">${done}/3 complete</div><div class="muted" style="font-size:12px">department reviews</div></div>
          <button class="btn sm" onclick="openBid('${b.id}','review')">Open workspace ${icon('arrow','ico')}</button>
        </div>
      </div>
      <div class="progress mt12"><i style="width:${(done / 3) * 100}%"></i></div>
      <div class="review-board mt16">${depts.map(d => deptCard(b, d)).join('')}</div>
    </div>`;
  }).join('') || emptyState('No bids in review');
}

function deptCard(bid, dept) {
  const r = bid.reviews[dept];
  const names = { legal: 'Legal', finance: 'Finance', inspection: 'Inspection' };
  const stCls = { complete: 'st-complete', reviewing: 'st-reviewing', pending: 'st-pending', blocking: 'st-blocking' };
  const stLbl = { complete: 'Complete', reviewing: 'Reviewing', pending: 'Not started', blocking: 'Blocking' };
  const hasBlock = r.items.some(i => i.flag === 'blocking') && r.status !== 'complete';
  const eff = hasBlock ? 'blocking' : r.status;
  return `<div class="card dept-card ${eff}">
    <div class="dh">
      <div class="avatar av" style="background:linear-gradient(145deg,${ROLES[dept].accent},${shade(ROLES[dept].accent,-25)})">${r.initials}</div>
      <div><div class="dn">${names[dept]}</div><div class="muted" style="font-size:11.5px">${r.reviewer}</div></div>
      <span class="badge-st ${stCls[eff]}" style="margin-left:auto"><span class="dot"></span>${stLbl[eff]}</span>
    </div>
    <div class="feedback">
      ${r.items.length ? r.items.map(i => `
        <div class="fb">
          <div class="fb-top">
            <div class="avatar fa" style="background:linear-gradient(145deg,${ROLES[dept].accent},${shade(ROLES[dept].accent,-25)})">${i.init}</div>
            <span class="fn">${i.who}</span>
            ${i.flag === 'blocking' ? '<span class="badge-st st-blocking" style="padding:1px 7px;font-size:10px"><span class="dot"></span>Blocking</span>' : ''}
            <time>${fmtDate(i.at)}</time>
          </div>
          <p>${i.text}</p>
        </div>`).join('') : '<div class="muted" style="font-size:12.5px;padding:6px 2px">No feedback yet.</div>'}
    </div>
  </div>`;
}

/* ============================================================
   RENDER: WORKSPACE
   ============================================================ */
function openBid(id, tab = 'overview') {
  currentBid = BIDS.find(b => b.id === id);
  renderWorkspace(tab);
  nav('workspace');
}

function renderWorkspace(activeTab = 'overview') {
  const b = currentBid; if (!b) return;
  const idx = LIFECYCLE.findIndex(l => l.key === b.status);
  const wrap = document.getElementById('view-workspace');

  wrap.innerHTML = `
    <button class="btn ghost sm" onclick="nav('bids')" style="margin-bottom:18px"><span style="transform:scaleX(-1);display:inline-flex">${icon('arrow','ico')}</span> Back to bids</button>
    <div class="ws-head">
      <div>
        <div class="bid-id row gap8 center">
          <span class="tag">${b.id}</span>${badge(b.status)}
          <span class="chip">${b.category}</span>
        </div>
        <h1>${b.title}</h1>
        <div class="ws-meta">
          <div class="m"><span class="ml">Owner</span><span class="mv">${b.owner}</span></div>
          <div class="m"><span class="ml">Originating Unit</span><span class="mv">${b.customer}</span></div>
          <div class="m"><span class="ml">Est. Value</span><span class="mv">${b.value}</span></div>
          <div class="m"><span class="ml">Response Deadline</span><span class="mv">${fmtDateTime(b.deadline)}</span></div>
        </div>
      </div>
      <div class="stack gap8" style="align-items:flex-end">
        ${workspaceActions(b)}
      </div>
    </div>

    <div class="lifecycle">
      ${LIFECYCLE.map((l, i) => {
        const cls = i < idx ? 'done' : i === idx ? 'current' : '';
        return `<div class="lc-step ${cls}">
          <div class="n">${i < idx ? '✓' : l.n}</div>
          <div class="lc-name">${l.name}</div>
          <div class="lc-meta">${l.trigger}</div>
        </div>`;
      }).join('')}
    </div>

    <div class="tabs">
      ${['overview', 'documents', 'review', 'artifacts'].map(t =>
        `<button class="tab ${t === activeTab ? 'active' : ''}" onclick="switchTab('${t}')" data-tab="${t}">${tabLabel(t)}</button>`).join('')}
    </div>

    <div class="tabpane ${activeTab === 'overview' ? 'active' : ''}" data-pane="overview">${wsOverview(b)}</div>
    <div class="tabpane ${activeTab === 'documents' ? 'active' : ''}" data-pane="documents">${wsDocuments(b)}</div>
    <div class="tabpane ${activeTab === 'review' ? 'active' : ''}" data-pane="review">${wsReview(b)}</div>
    <div class="tabpane ${activeTab === 'artifacts' ? 'active' : ''}" data-pane="artifacts">${wsArtifacts(b)}</div>
  `;
}
function tabLabel(t) {
  const b = currentBid;
  const counts = { documents: b.documents.length, artifacts: b.artifacts.length };
  const labels = { overview: 'Overview', documents: `Bid Documents (${counts.documents})`, review: 'Internal Review', artifacts: `Artifacts (${counts.artifacts})` };
  return labels[t];
}
function switchTab(t) {
  document.querySelectorAll('#view-workspace .tab').forEach(x => x.classList.toggle('active', x.dataset.tab === t));
  document.querySelectorAll('#view-workspace .tabpane').forEach(x => x.classList.toggle('active', x.dataset.pane === t));
}

function workspaceActions(b) {
  const isBM = currentRole === 'bid_manager';
  if (!isBM) return `<span class="chip">${icon('shield','ico')} Read & comment access</span>`;
  if (b.status === 'review') return `<button class="btn gold" onclick="markReady('${b.id}')">${icon('check','ico')} Mark as Ready</button><span class="muted" style="font-size:11.5px">all reviews must be addressed</span>`;
  if (b.status === 'ready') return `<button class="btn gold" onclick="openPublish('${b.id}')">${icon('send','ico')} Publish to Suppliers</button>`;
  if (b.status === 'published') return `<span class="chip">${icon('clock','ico')} Awaiting responses</span>`;
  if (b.status === 'responses') return `<button class="btn gold" onclick="runAI('${b.id}')">${icon('spark','ico')} Run AI Evaluation</button><span class="muted" style="font-size:11.5px">deadline passed — ${b.suppliers} submissions</span>`;
  if (b.status === 'awarded') return `<span class="chip">${icon('check','ico')} Awarded — ${b.awardedTo}</span><button class="btn sm ghost" onclick="nav('ai')">View AI report</button>`;
  if (b.status === 'draft') return `<button class="btn primary" onclick="assignReviewers('${b.id}')">${icon('users','ico')} Assign Reviewers</button>`;
  return '';
}

function wsOverview(b) {
  const depts = ['legal', 'finance', 'inspection'];
  const done = depts.filter(d => b.reviews[d].status === 'complete').length;
  return `<div class="grid c2">
    <div class="card pad">
      <h3 style="font-size:15px;margin-bottom:6px">Bid Summary</h3>
      <p class="soft" style="margin:0 0 16px">This bid project covers ${b.title.toLowerCase()} for ${b.customer}. It progresses through the OBMS lifecycle from internal initiation and cross-departmental review to controlled public release and AI-assisted evaluation.</p>
      <div class="divider"></div>
      <div class="row spread center"><span class="soft">Internal review progress</span><b>${done}/3 departments</b></div>
      <div class="progress mt8"><i style="width:${(done/3)*100}%"></i></div>
      <div class="divider"></div>
      <div class="grid c2" style="gap:12px">
        <div><div class="ml muted" style="font-size:11px;letter-spacing:.08em;text-transform:uppercase">Created</div><div style="font-weight:600">${fmtDate(b.created)}</div></div>
        <div><div class="ml muted" style="font-size:11px;letter-spacing:.08em;text-transform:uppercase">Published</div><div style="font-weight:600">${b.published ? fmtDate(b.published) : '—'}</div></div>
      </div>
    </div>
    <div class="card pad">
      <h3 style="font-size:15px;margin-bottom:12px">Department Status</h3>
      <div class="stack gap12">
        ${depts.map(d => {
          const r = b.reviews[d];
          const stCls = { complete: 'st-complete', reviewing: 'st-reviewing', pending: 'st-pending' };
          const lbl = { complete: 'Complete', reviewing: 'Reviewing', pending: 'Not started' };
          return `<div class="row spread center">
            <div class="row gap8 center">
              <div class="avatar" style="width:30px;height:30px;font-size:12px;background:linear-gradient(145deg,${ROLES[d].accent},${shade(ROLES[d].accent,-25)})">${r.initials}</div>
              <div><div style="font-weight:600;font-size:13px">${d.charAt(0).toUpperCase()+d.slice(1)}</div><div class="muted" style="font-size:11.5px">${r.reviewer}</div></div>
            </div>
            <span class="badge-st ${stCls[r.status]}"><span class="dot"></span>${lbl[r.status]}</span>
          </div>`;
        }).join('')}
      </div>
      ${b.status === 'responses' || b.status === 'awarded' ? `<div class="divider"></div><div class="notice ok">${icon('shield','ni')}<div><b>Supplier isolation active.</b> ${b.suppliers} responses received in partitioned private spaces. Internal access unlocked after deadline.</div></div>` : ''}
    </div>
  </div>`;
}

function wsDocuments(b) {
  return `<div class="card">
    <div class="panel-head"><h3>Bid Documents</h3>
      ${currentRole !== 'external' ? `<button class="btn sm gold tag" onclick="uploadDoc()" style="margin-left:auto">${icon('upload','ico')} Upload</button>` : ''}
    </div>
    ${b.documents.map(d => docRow(d, true)).join('')}
    <div class="panel-head" style="border-top:1px solid var(--line)"><h3 style="font-size:13px;color:var(--text-mute)">Version history — all prior versions retained (FR-03)</h3></div>
    <div style="padding:0 18px 8px">
      ${b.documents.filter(d => d.ver > 1).map(d => `
        <div class="row spread center" style="padding:9px 0;border-bottom:1px solid var(--line)">
          <span class="soft" style="font-size:13px">${d.name}</span>
          <div class="row gap8 center">
            ${Array.from({ length: d.ver }, (_, i) => `<span class="ver-pill ${i + 1 < d.ver ? 'old' : ''}">v${i + 1}</span>`).join('')}
          </div>
        </div>`).join('') || '<div class="muted" style="font-size:12.5px;padding:8px 0">Single-version documents only.</div>'}
    </div>
  </div>`;
}
function docRow(d, showVer) {
  return `<div class="doc-row">
    ${fileIco(d.type)}
    <div class="d-main"><div class="d-name">${d.name}</div><div class="d-meta">${d.size} · uploaded by ${d.by} · ${fmtDate(d.at)}</div></div>
    ${showVer ? `<span class="ver-pill">v${d.ver} · active</span>` : ''}
    <button class="btn sm ghost" onclick="toast('Opening preview (demo)','doc')">View</button>
  </div>`;
}

function wsReview(b) {
  const depts = ['legal', 'finance', 'inspection'];
  return `<div class="notice info" style="margin-bottom:18px">${icon('users','ni')}<div><b>Collaborative review.</b> All internal feedback is visible to every internal actor — not siloed. Reviewers flag items as Reviewing, Complete, or Blocking.</div></div>
    <div class="review-board">${depts.map(d => deptCard(b, d)).join('')}</div>
    ${['legal', 'finance', 'inspection'].includes(currentRole) ? `<div class="card pad mt24"><h3 style="font-size:14px;margin-bottom:10px">Add your review — ${ROLES[currentRole].title}</h3>
      <textarea id="fb-text" placeholder="Add a structured comment or annotation…" style="width:100%;min-height:74px;padding:11px;border:1px solid var(--line-strong);border-radius:10px;font-family:inherit;font-size:13.5px"></textarea>
      <div class="row gap8 mt12 wrap">
        <button class="btn sm" onclick="addFeedback('reviewing')">Save as Reviewing</button>
        <button class="btn sm" style="border-color:var(--st-blocking);color:var(--st-blocking)" onclick="addFeedback('blocking')">${icon('alert','ico')} Flag Blocking</button>
        <button class="btn sm gold" onclick="addFeedback('complete')">${icon('check','ico')} Mark Complete</button>
      </div></div>` : ''}`;
}

function wsArtifacts(b) {
  if (!b.artifacts.length) return emptyState('No supporting artifacts uploaded yet');
  return `<div class="card">
    <div class="panel-head"><h3>Supporting Artifacts</h3><span class="muted tag" style="margin-left:auto">legal opinions · financial assessments · checklists</span></div>
    ${b.artifacts.map(a => `<div class="doc-row">
      ${fileIco(a.type)}
      <div class="d-main"><div class="d-name">${a.name}</div><div class="d-meta">${a.size} · ${ROLES[a.dept].title} · ${a.by} · ${fmtDate(a.at)}</div></div>
      <span class="ver-pill ${a.ver > 1 ? '' : ''}">v${a.ver}</span>
      <button class="btn sm ghost" onclick="toast('Opening preview (demo)','doc')">View</button>
    </div>`).join('')}
  </div>`;
}

/* ---- Workspace actions ---- */
function markReady(id) {
  const b = BIDS.find(x => x.id === id);
  const depts = ['legal', 'finance', 'inspection'];
  const incomplete = depts.filter(d => b.reviews[d].status !== 'complete');
  if (incomplete.length) { toast(`Cannot mark Ready — ${incomplete.length} review(s) outstanding`, 'alert'); return; }
  b.status = 'ready'; renderWorkspace('overview'); toast('Bid marked <b>Ready</b> — document locked for release', 'check');
}
function assignReviewers(id) {
  const b = BIDS.find(x => x.id === id);
  b.status = 'review';
  ['legal', 'finance', 'inspection'].forEach(d => b.reviews[d].status = 'reviewing');
  renderWorkspace('overview'); toast('Reviewers assigned — bid moved to <b>Internal Review</b>', 'users');
}
function addFeedback(flag) {
  const txt = document.getElementById('fb-text').value.trim();
  if (!txt) { toast('Enter a comment first', 'alert'); return; }
  const dept = currentRole; const b = currentBid;
  b.reviews[dept].items.push({ who: ROLES[dept].name, init: ROLES[dept].initials, at: '2026-06-21', text: txt, flag: flag === 'blocking' ? 'blocking' : undefined });
  b.reviews[dept].status = flag === 'blocking' ? 'reviewing' : flag;
  renderWorkspace('review');
  toast(flag === 'complete' ? 'Review marked <b>Complete</b>' : flag === 'blocking' ? 'Item flagged <b>Blocking</b>' : 'Feedback saved', flag === 'blocking' ? 'alert' : 'check');
}

/* ---- Publish modal ---- */
function openPublish(id) {
  openModal(`
    <div class="modal-head">${icon('send')}<h3>Publish Bid to Suppliers</h3><button class="x" onclick="closeModal()">✕</button></div>
    <div class="modal-body">
      <div class="notice warn" style="margin-bottom:18px">${icon('shield','ni')}<div>Publishing makes the locked bid document visible to <b>registered, approved suppliers only</b>. Supplier isolation is enforced from this point — suppliers cannot see each other.</div></div>
      <div class="field"><label>Response Deadline</label><input type="datetime-local" value="2026-06-22T17:00"><div class="hint">Identical for all suppliers — prevents timing-based inference (§6.1).</div></div>
      <div class="field"><label>Registered Suppliers (approved)</label>
        <div class="stack gap8">
          ${['Aegis Integrated Systems', 'Meridian Security Group', 'Vanguard Controls', 'Cohort Infrastructure'].map(s => `<label class="row gap8 center" style="font-weight:500"><input type="checkbox" checked> ${s}</label>`).join('')}
        </div>
        <div class="hint">Suppliers receive individual notifications — never group threads (§6.1).</div>
      </div>
      <div class="field"><label>Anonymization Mode</label><select><option>Blind review (Supplier A/B/C codes) — recommended</option><option>Named suppliers</option></select></div>
    </div>
    <div class="modal-foot"><button class="btn ghost" onclick="closeModal()">Cancel</button><button class="btn gold" onclick="doPublish('${id}')">${icon('send','ico')} Publish Now</button></div>`);
}
function doPublish(id) {
  const b = BIDS.find(x => x.id === id); b.status = 'published'; b.published = '2026-06-21'; b.suppliers = 4;
  closeModal(); renderWorkspace('overview'); toast('Bid <b>published</b> — 4 suppliers notified individually', 'send');
}

/* ---- Upload modal ---- */
function uploadDoc() {
  openModal(`
    <div class="modal-head">${icon('upload')}<h3>Upload Document</h3><button class="x" onclick="closeModal()">✕</button></div>
    <div class="modal-body">
      <div class="dropzone"><div class="dz-ico">${icon('upload')}</div><h4>Drop files or click to browse</h4><p>PDF, DOCX, XLSX, images, ZIP · up to 50 MB</p></div>
      <div class="field mt16"><label>Document Type</label><select><option>Bid document (versioned)</option><option>Supporting artifact</option></select></div>
      <div class="notice info">${icon('audit','ni')}<div>Every upload is versioned (FR-03) and written to the immutable audit log (FR-14).</div></div>
    </div>
    <div class="modal-foot"><button class="btn ghost" onclick="closeModal()">Cancel</button><button class="btn gold" onclick="closeModal();toast('Document uploaded &amp; versioned','upload')">Upload</button></div>`);
}

/* ---- Run AI ---- */
function runAI(id) {
  openModal(`
    <div class="modal-head">${icon('spark')}<h3>Run AI Comparison Engine</h3><button class="x" onclick="closeModal()">✕</button></div>
    <div class="modal-body" id="ai-run-body">
      <p class="soft" style="margin-top:0">The engine parses all ${BIDS.find(b=>b.id===id).suppliers} sealed submissions, maps them to the evaluation criteria, and produces a structured comparison report. Identities stay anonymized (Supplier A–D) until de-anonymized.</p>
      <div class="stack gap12 mt16" id="ai-steps">
        ${['Parsing supplier submissions', 'Mapping responses to evaluation criteria', 'Scoring per criterion (weighted)', 'Detecting gaps, risks & non-compliance', 'Generating comparison report'].map((s, i) => `
          <div class="row gap12 center" id="ai-step-${i}" style="opacity:.4"><span class="comp-ico comp-partial" id="ai-dot-${i}">${icon('clock','ico')}</span><span style="font-weight:500">${s}</span></div>`).join('')}
      </div>
    </div>
    <div class="modal-foot"><button class="btn ghost" onclick="closeModal()">Cancel</button><button class="btn gold" id="ai-go" onclick="startAI('${id}')">${icon('spark','ico')} Start Evaluation</button></div>`);
}
function startAI(id) {
  document.getElementById('ai-go').disabled = true;
  const steps = 5; let i = 0;
  const tick = () => {
    if (i > 0) { const prev = document.getElementById('ai-dot-' + (i - 1)); prev.className = 'comp-ico comp-met'; prev.innerHTML = icon('check', 'ico'); }
    if (i < steps) {
      const el = document.getElementById('ai-step-' + i); el.style.opacity = '1';
      i++; setTimeout(tick, 620);
    } else {
      const b = BIDS.find(x => x.id === id); b.status = 'awarded'; b.awardedTo = 'Supplier C';
      closeModal(); nav('ai'); toast('AI comparison report generated', 'spark');
    }
  };
  tick();
}

/* ============================================================
   RENDER: AI REPORT
   ============================================================ */
function renderAIReport() {
  const r = AI_REPORT;
  const ranked = r.suppliers.map(s => ({ s, score: weightedScore(r, s) })).sort((a, b) => b.score - a.score);
  const wrap = document.getElementById('view-ai');

  wrap.innerHTML = `
    <div class="ai-hero">
      <span class="ai-tag">${icon('spark','ico')} AI Comparison Engine · advisory</span>
      <h2>Evaluation Report — ${r.bidId}</h2>
      <p>Structured comparison of ${r.suppliers.length} sealed supplier submissions against the finalized bid requirements and weighted rubric. Identities anonymized for blind review.</p>
      <div class="ai-stats">
        <div class="s"><div class="sv">${r.suppliers.length}</div><div class="sl">Submissions analyzed</div></div>
        <div class="s"><div class="sv">${r.criteria.length}</div><div class="sl">Weighted criteria</div></div>
        <div class="s"><div class="sv">${Math.floor(r.durationSec/60)}m ${r.durationSec%60}s</div><div class="sl">Generation time</div></div>
        <div class="s"><div class="sv">${ranked[0].s.replace('Supplier ','')}</div><div class="sl">Recommended</div></div>
      </div>
    </div>

    <div class="notice warn mt24">${icon('alert','ni')}<div><b>Human oversight required (§5.5).</b> This report is advisory only. Internal actors must validate findings and make the final award decision. Any AI score can be overridden with captured justification.</div></div>

    <h3 style="font-size:16px;margin:26px 0 14px">Recommended Shortlist & Overall Ranking</h3>
    <div class="grid c3" style="grid-template-columns:repeat(4,1fr)">
      ${ranked.map((x, i) => `
        <div class="card rank-card ${i === 0 ? 'first' : ''}">
          <div class="rk">${i + 1}</div>
          <div class="r-name">${x.s} ${i === 0 ? `<span class="badge-st st-awarded" style="font-size:10px"><span class="dot"></span>Top</span>` : ''}</div>
          <div class="r-score">${x.score}<small>/100</small></div>
          <div class="r-bar"><i style="width:${x.score}%"></i></div>
          <div class="muted mt8" style="font-size:11.5px">Weighted composite score</div>
        </div>`).join('')}
    </div>

    <div class="grid c2 mt24" style="align-items:start">
      <div class="card">
        <div class="panel-head"><h3>Per-Criterion Scoring Matrix</h3><span class="tag" style="margin-left:auto">weighted</span></div>
        <div style="overflow-x:auto"><table class="tbl matrix">
          <thead><tr><th>Criterion</th><th>Wt</th>${r.suppliers.map(s => `<th style="text-align:center">${s.replace('Supplier ','')}</th>`).join('')}</tr></thead>
          <tbody>${r.criteria.map(c => `<tr>
            <td class="crit">${c.name}</td><td class="wt">${c.weight}%</td>
            ${r.suppliers.map(s => { const v = c.scores[s]; const cls = v >= 85 ? 'sc-hi' : v >= 70 ? 'sc-mid' : 'sc-lo'; return `<td style="text-align:center"><span class="score-cell ${cls}">${v}</span></td>`; }).join('')}
          </tr>`).join('')}
          <tr style="background:var(--surface-2)"><td class="crit">Weighted Total</td><td class="wt">100%</td>
            ${r.suppliers.map(s => `<td style="text-align:center"><b class="mono">${weightedScore(r, s)}</b></td>`).join('')}
          </tr></tbody>
        </table></div>
      </div>

      <div class="card pad">
        <h3 style="font-size:15px;margin-bottom:6px">Compliance Checklist</h3>
        <p class="muted" style="font-size:12.5px;margin:0 0 12px">Mandatory requirements · Met / Partial / Not Met</p>
        ${r.compliance.map(row => `
          <div style="margin-bottom:14px">
            <div style="font-weight:600;font-size:13px;margin-bottom:7px">${row.req}</div>
            <div class="row gap8 wrap">
              ${r.suppliers.map(s => { const v = row[s]; const cls = v === 'met' ? 'comp-met' : v === 'partial' ? 'comp-partial' : 'comp-no'; const ic = v === 'met' ? 'check' : v === 'partial' ? 'alert' : 'x'; return `<span class="chip" style="gap:6px"><span class="comp-ico ${cls}" style="width:18px;height:18px">${icon(ic,'ico')}</span>${s.replace('Supplier ','')}</span>`; }).join('')}
            </div>
          </div>`).join('')}
      </div>
    </div>

    <h3 style="font-size:16px;margin:26px 0 14px">Strengths & Weaknesses</h3>
    <div class="grid c2">
      ${ranked.slice(0, 4).filter(x => r.swot[x.s]).map(x => {
        const sw = r.swot[x.s];
        return `<div class="card sw-card">
          <div class="row spread center"><div style="font-weight:600;font-size:15px">${x.s}</div><span class="score-cell ${x.score >= 85 ? 'sc-hi' : x.score >= 70 ? 'sc-mid' : 'sc-lo'}">${x.score}</span></div>
          <div class="grid c2 mt12" style="gap:14px">
            <div><div class="muted" style="font-size:11px;letter-spacing:.08em;text-transform:uppercase;font-weight:600">Strengths</div>
              <ul class="sw-list sw-pos">${sw.strengths.map(t => `<li><span class="m">${icon('check','ico')}</span>${t}</li>`).join('')}</ul></div>
            <div><div class="muted" style="font-size:11px;letter-spacing:.08em;text-transform:uppercase;font-weight:600">Weaknesses</div>
              <ul class="sw-list sw-neg">${sw.weaknesses.map(t => `<li><span class="m">${icon('x','ico')}</span>${t}</li>`).join('')}</ul></div>
          </div>
        </div>`;
      }).join('')}
    </div>

    <div class="grid c2 mt24" style="align-items:start">
      <div class="card pad">
        <h3 style="font-size:15px;margin-bottom:12px">${icon('alert','ico')} Risk Flags</h3>
        ${r.risks.map(rk => `<div class="risk ${rk.level === 'amber' ? 'amber' : ''}">
          <span class="ri">${icon('alert','ico')}</span>
          <div><div class="rt">${rk.supplier} — ${rk.title}</div><div class="rd">${rk.desc}</div></div>
        </div>`).join('')}
      </div>
      <div class="card pad">
        <h3 style="font-size:15px;margin-bottom:6px">Award Decision</h3>
        <p class="soft" style="margin:0 0 14px">Bid Manager records the final decision. AI recommendation: <b>${ranked[0].s}</b> (${ranked[0].score}/100).</p>
        <div class="field"><label>Award to</label><select>${ranked.map((x, i) => `<option ${i === 0 ? 'selected' : ''}>${x.s} — ${x.score}/100</option>`).join('')}</select></div>
        <div class="field"><label>Justification (captured in audit log)</label><textarea style="min-height:64px" placeholder="Rationale for award decision…">Highest technical compliance and complete compliance checklist; TCO premium justified by superior SLA and security posture.</textarea></div>
        <div class="row gap8 wrap">
          <button class="btn ghost sm" onclick="toast('De-anonymized — supplier identities revealed','users')">${icon('users','ico')} De-anonymize</button>
          <button class="btn gold" onclick="toast('Award recorded for ${ranked[0].s}','check')">${icon('check','ico')} Record Award</button>
        </div>
      </div>
    </div>
  `;
}

/* ============================================================
   RENDER: SUPPLIERS (internal admin view)
   ============================================================ */
function renderSuppliers() {
  const sups = [
    { name: 'Aegis Integrated Systems', code: 'Supplier A', status: 'approved', bids: 3, contact: 'j.okoro@aegis-is.example' },
    { name: 'Meridian Security Group', code: 'Supplier B', status: 'approved', bids: 2, contact: 'ops@meridian-sec.example' },
    { name: 'Vanguard Controls', code: 'Supplier C', status: 'approved', bids: 4, contact: 'bids@vanguard-ctrl.example' },
    { name: 'Cohort Infrastructure', code: 'Supplier D', status: 'approved', bids: 1, contact: 'tender@cohort-infra.example' },
    { name: 'Lumen Networks', code: '—', status: 'pending', bids: 0, contact: 'hello@lumen-net.example' },
  ];
  document.getElementById('supplier-table-body').innerHTML = sups.map(s => `
    <tr style="cursor:default">
      <td><div class="t-title">${s.name}</div><div class="t-sub mono">${s.contact}</div></td>
      <td><span class="tag">${s.code}</span></td>
      <td>${s.status === 'approved' ? '<span class="badge-st st-complete"><span class="dot"></span>Approved</span>' : '<span class="badge-st st-reviewing"><span class="dot"></span>Pending approval</span>'}</td>
      <td>${s.bids} bids</td>
      <td style="text-align:right">${s.status === 'pending' ? `<button class="btn sm gold" onclick="toast('Supplier approved','check')">Approve</button>` : '<span class="muted">—</span>'}</td>
    </tr>`).join('');
}

/* ============================================================
   RENDER: AUDIT
   ============================================================ */
function renderAudit() {
  document.getElementById('audit-body').innerHTML = AUDIT.map(a => `
    <tr class="audit-row" style="cursor:default">
      <td class="mono" style="font-size:12px;color:var(--text-mute);white-space:nowrap">${a.at}</td>
      <td><div style="font-weight:600">${a.actor}</div><div class="t-sub">${a.role}</div></td>
      <td><span class="audit-action aa-${a.action}">${a.label}</span></td>
      <td>${a.detail}</td>
    </tr>`).join('');
}

/* ============================================================
   HELPERS
   ============================================================ */
function emptyState(msg) { return `<div class="card pad empty"><div class="ei">${icon('doc')}</div>${msg}</div>`; }
function fmtDate(s) { if (!s) return '—'; const d = new Date(s); return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
function fmtDateTime(s) { if (!s) return '—'; const d = new Date(s); return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ', ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }); }

/* ============================================================
   INIT
   ============================================================ */
function initApp() {
  renderDashboard(); renderReviewQueue(); renderSuppliers(); renderAudit(); renderAIReport();
  setRole('bid_manager');
  document.querySelectorAll('.nav .navitem').forEach(n => n.addEventListener('click', () => {
    const v = n.dataset.view;
    if (v === 'dashboard') renderDashboard();
    if (v === 'bids') renderBidTable('bid-table-body-all');
    if (v === 'review') renderReviewQueue();
    if (v === 'ai') renderAIReport();
    nav(v);
  }));
  document.getElementById('role-select').addEventListener('change', e => setRole(e.target.value));
  nav('dashboard', false);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
}
document.addEventListener('DOMContentLoaded', initApp);
