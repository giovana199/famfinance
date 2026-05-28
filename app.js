/* ── FamFinance app.js ── */

const STORAGE_KEY = "famfinance_v4";
const LEGACY_KEYS = ["famfinance_v3", "famfinance_v2"];
const NOTIFICATION_KEY = "famfinance_notifications_v1";
const NOTIFICATION_ASKED_KEY = "famfinance_notifications_asked";

// ── DATA ──────────────────────────────────────────────────────────────────────
const CATS = [
  {e:'🏠', n:'Moradia'},
  {e:'💡', n:'Energia'},
  {e:'💧', n:'Água'},
  {e:'📱', n:'Internet'},
  {e:'🛒', n:'Mercado'},
  {e:'🚗', n:'Transporte'},
  {e:'🏥', n:'Saúde'},
  {e:'🎓', n:'Educação'},
  {e:'🎬', n:'Lazer'},
  {e:'💳', n:'Outros'},
];

const CAT_COLORS = [
  '#a78bfa','#ff6b6b','#00d4aa','#fbbf24',
  '#38bdf8','#f472b6','#4ade80','#fb923c',
  '#e879f9','#94a3b8',
];

const MONTHS = [
  'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro',
];

// ── STATE ─────────────────────────────────────────────────────────────────────
let bills = [];
let curMonth = new Date().getMonth();
let curYear  = new Date().getFullYear();
let activeFilter = 'all';
let editingId    = null;
let selectedCat  = 'Outros';
let selectedType = 'single';
let catChart     = null;

// ── HELPERS ───────────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);

function uid(prefix = 'id') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function pad(n) { return String(n).padStart(2, '0'); }
function ymKey(year, month) { return `${year}-${pad(month + 1)}`; }

function parseLocalDate(dateStr) {
  return new Date(dateStr + 'T12:00:00');
}

function daysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

function makeDateForMonth(year, month, preferredDay) {
  const day = Math.min(Number(preferredDay) || 1, daysInMonth(year, month));
  return `${year}-${pad(month + 1)}-${pad(day)}`;
}

function addMonths(dateStr, offset) {
  const d = parseLocalDate(dateStr);
  return makeDateForMonth(d.getFullYear(), d.getMonth() + offset, d.getDate());
}

function monthDiff(fromDateStr, year, month) {
  const from = parseLocalDate(fromDateStr);
  return (year - from.getFullYear()) * 12 + (month - from.getMonth());
}

function normalizeBill(raw) {
  const b = { ...raw };
  if (!b.id) b.id = uid('bill');
  if (!b.category) b.category = 'Outros';
  if (!b.type) b.type = b.recurring ? 'recurring' : 'single';
  if (b.type === 'recurring') {
    if (!b.seriesId) b.seriesId = uid('rec');
    if (!b.baseDate) b.baseDate = b.date;
    if (!b.dayOfMonth) b.dayOfMonth = parseLocalDate(b.date).getDate();
    b.repeatForever = b.repeatForever !== false;
    b.recurring = true;
  }
  if (b.type === 'installment') {
    if (!b.seriesId) b.seriesId = uid('inst');
    b.installmentCurrent = Number(b.installmentCurrent || 1);
    b.installmentTotal = Number(b.installmentTotal || 1);
    b.recurring = false;
  }
  b.amount = Number(b.amount || 0);
  b.paid = Boolean(b.paid);
  b.paidAt = b.paidAt || null;
  b.deleted = Boolean(b.deleted);
  b.deletedAt = b.deletedAt || null;
  return b;
}

function load() {
  try {
    let raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      for (const key of LEGACY_KEYS) {
        raw = localStorage.getItem(key);
        if (raw) break;
      }
    }
    bills = raw ? JSON.parse(raw).map(normalizeBill) : [];
    save();
  } catch(e) { bills = []; }
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(bills));
}

function fmt(v) {
  return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function getStatus(bill) {
  if (bill.paid) return 'paid';
  const due   = parseLocalDate(bill.date);
  const today = new Date(); today.setHours(0,0,0,0);
  return due < today ? 'overdue' : 'pending';
}

function daysUntil(dateStr) {
  const due   = parseLocalDate(dateStr);
  const today = new Date(); today.setHours(0,0,0,0);
  return Math.ceil((due - today) / 864e5);
}

function occurrenceKey(b) {
  if (b.type === 'recurring') return `${b.seriesId}|${ymKey(parseLocalDate(b.date).getFullYear(), parseLocalDate(b.date).getMonth())}`;
  if (b.type === 'installment') return `${b.seriesId}|${b.installmentCurrent}`;
  return String(b.id);
}

function recurringSources() {
  const map = new Map();
  bills.filter(b => b.type === 'recurring').forEach(b => {
    const current = map.get(b.seriesId);
    if (!current || parseLocalDate(b.baseDate || b.date) < parseLocalDate(current.baseDate || current.date)) {
      map.set(b.seriesId, b);
    }
  });
  return [...map.values()];
}

function hasRecurringOccurrence(seriesId, year, month) {
  const key = ymKey(year, month);
  return bills.some(b => {
    if (b.type !== 'recurring' || b.seriesId !== seriesId) return false;
    const d = parseLocalDate(b.date);
    return ymKey(d.getFullYear(), d.getMonth()) === key;
  });
}

function ensureGeneratedForMonth(year = curYear, month = curMonth) {
  let changed = false;

  recurringSources().forEach(src => {
    const baseDate = src.baseDate || src.date;
    if (monthDiff(baseDate, year, month) < 0) return;
    if (hasRecurringOccurrence(src.seriesId, year, month)) return;

    bills.push({
      id: uid('bill'),
      type: 'recurring',
      seriesId: src.seriesId,
      generated: true,
      generatedFrom: src.id,
      name: src.name,
      amount: src.amount,
      date: makeDateForMonth(year, month, src.dayOfMonth || parseLocalDate(baseDate).getDate()),
      baseDate,
      dayOfMonth: src.dayOfMonth || parseLocalDate(baseDate).getDate(),
      category: src.category,
      recurring: true,
      repeatForever: true,
      paid: false,
    });
    changed = true;
  });

  if (changed) save();
}

function billsForMonth(includeDeleted = false) {
  ensureGeneratedForMonth(curYear, curMonth);
  return bills.filter(b => {
    if (!includeDeleted && b.deleted) return false;
    const d = parseLocalDate(b.date);
    return d.getMonth() === curMonth && d.getFullYear() === curYear;
  });
}

function allDeletedBills() {
  return bills.filter(b => b.deleted).sort((a, b) => new Date(b.deletedAt || 0) - new Date(a.deletedAt || 0));
}

function cleanupOldDeletedBills() {
  const limit = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const before = bills.length;
  bills = bills.filter(b => !b.deleted || !b.deletedAt || new Date(b.deletedAt).getTime() > limit);
  if (bills.length !== before) save();
}

// ── NAVIGATION ────────────────────────────────────────────────────────────────
function setView(v) {
  document.querySelectorAll('.view').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(el => el.classList.remove('active'));
  $('view-' + v).classList.add('active');
  document.querySelector(`.nav-btn[data-view="${v}"]`).classList.add('active');
  if (v === 'dashboard') renderDashboard();
  if (v === 'bills')     renderBills();
}

function changeMonth(dir) {
  curMonth += dir;
  if (curMonth > 11) { curMonth = 0; curYear++; }
  if (curMonth < 0)  { curMonth = 11; curYear--; }
  render();
}

// ── RENDER ────────────────────────────────────────────────────────────────────
function render() {
  $('monthLabel').textContent = MONTHS[curMonth] + ' ' + curYear;
  renderDashboard();
  if ($('view-bills').classList.contains('active')) renderBills();
}

function renderDashboard() {
  const mb    = billsForMonth();
  const total = mb.reduce((s, b) => s + b.amount, 0);
  const paid  = mb.filter(b => b.paid);
  const paidT = paid.reduce((s, b) => s + b.amount, 0);
  const pend  = mb.filter(b => !b.paid);
  const pendT = pend.reduce((s, b) => s + b.amount, 0);

  $('total').textContent       = fmt(total);
  $('totalCount').textContent  = mb.length + ' conta' + (mb.length !== 1 ? 's' : '');
  $('paid').textContent        = fmt(paidT);
  $('pending').textContent     = fmt(pendT);
  $('pendingCount').textContent = pend.filter(b => getStatus(b) === 'pending').length +
    ' pendente' + (pend.length !== 1 ? 's' : '');
  $('pfill').style.width       = total > 0 ? Math.round(paidT / total * 100) + '%' : '0%';

  const alerts = bills
    .filter(b => { if (b.deleted || b.paid) return false; const d = daysUntil(b.date); return d >= 0 && d <= 5; })
    .sort((a, b) => parseLocalDate(a.date) - parseLocalDate(b.date))
    .slice(0, 3);

  if (alerts.length) {
    $('alertsSection').style.display = 'block';
    $('alertsList').innerHTML = alerts.map(b => {
      const d   = daysUntil(b.date);
      const cat = CATS.find(c => c.n === b.category) || CATS[9];
      const lbl = d === 0 ? 'Vence hoje!' : 'Vence em ' + d + ' dia' + (d !== 1 ? 's' : '');
      return `<div class="alert-item">
        <div class="alert-icon">${cat.e}</div>
        <div><div class="alert-name">${b.name}</div><div class="alert-due">${lbl}</div></div>
        <div class="alert-val">${fmt(b.amount)}</div>
      </div>`;
    }).join('');
  } else {
    $('alertsSection').style.display = 'none';
  }

  renderChart(mb);
}

function renderChart(mb) {
  const agg = {};
  mb.forEach(b => {
    const cat = b.category || 'Outros';
    agg[cat] = (agg[cat] || 0) + b.amount;
  });

  const labels = Object.keys(agg);
  const data   = Object.values(agg);
  const colors = labels.map(l => {
    const idx = CATS.findIndex(c => c.n === l);
    return CAT_COLORS[idx >= 0 ? idx : 9];
  });
  const total = data.reduce((s, v) => s + v, 0);

  const ctx = $('catChart').getContext('2d');
  if (catChart) catChart.destroy();

  if (!labels.length) {
    $('catLegend').innerHTML = '<div class="chart-empty">Sem contas neste mês.</div>';
    $('chartCenter').innerHTML = '';
    ctx.clearRect(0, 0, 200, 200);
    return;
  }

  catChart = new Chart(ctx, {
    type: 'doughnut',
    data: { labels, datasets: [{ data, backgroundColor: colors, borderWidth: 0, hoverOffset: 10, borderRadius: 4 }] },
    options: {
      responsive: true,
      cutout: '68%',
      animation: { duration: 600, easing: 'easeInOutQuart' },
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ' ' + fmt(ctx.raw) } } },
    },
  });

  $('chartCenter').innerHTML = `<span class="ct-val">${fmt(total)}</span><span class="ct-lbl">total</span>`;

  $('catLegend').innerHTML = labels.map((l, i) => {
    const cat = CATS.find(c => c.n === l) || CATS[9];
    const pct = (data[i] / total * 100).toFixed(0);
    return `<div class="legend-item">
      <span class="leg-dot" style="background:${colors[i]}"></span>
      <span class="leg-emoji">${cat.e}</span>
      <span class="leg-name">${l}</span>
      <span class="leg-val">${fmt(data[i])}</span>
      <span class="leg-pct">${pct}%</span>
    </div>`;
  }).join('');
}

function typeLabel(b) {
  let label = '';
  if (b.type === 'recurring') label = ' · 🔁 recorrente';
  if (b.type === 'installment') label = ` · 💳 ${b.installmentCurrent}/${b.installmentTotal}`;
  if (b.paid && b.paidAt) label += ' · pago em ' + new Date(b.paidAt).toLocaleDateString('pt-BR');
  if (b.deleted && b.deletedAt) label += ' · excluída em ' + new Date(b.deletedAt).toLocaleDateString('pt-BR');
  return label;
}

function renderBills() {
  const listEl = $('list');
  let filtered = activeFilter === 'trash' ? allDeletedBills() : billsForMonth();

  if (activeFilter === 'paid')    filtered = filtered.filter(b => b.paid);
  if (activeFilter === 'pending') filtered = filtered.filter(b => !b.paid && getStatus(b) === 'pending');
  if (activeFilter === 'overdue') filtered = filtered.filter(b => getStatus(b) === 'overdue');

  filtered.sort((a, b) => parseLocalDate(a.date) - parseLocalDate(b.date));

  if (!filtered.length) {
    listEl.innerHTML = activeFilter === 'trash'
      ? '<div class="empty">🗑<br>Lixeira vazia.</div>'
      : '<div class="empty">😊<br>Nenhuma conta aqui!</div>';
    return;
  }

  listEl.innerHTML = '';

  filtered.forEach(b => {
    const st     = getStatus(b);
    const cat    = CATS.find(c => c.n === b.category) || CATS[9];
    const stLbl  = b.deleted ? 'Na lixeira' : st === 'paid' ? 'Pago' : st === 'overdue' ? 'Vencida' : 'Pendente';
    const valClr = b.deleted ? '#9998b8' : st === 'paid' ? '#00d4aa' : st === 'overdue' ? '#ff6b6b' : '#f0eff8';
    const dateStr = parseLocalDate(b.date).toLocaleDateString('pt-BR');

    const wrapper = document.createElement('div');
    wrapper.className = 'bill-wrapper';
    wrapper.innerHTML = `
      <div class="swipe-bg">
        <span class="swipe-del-lbl">${b.deleted ? '❌ Apagar' : '🗑 Excluir'}</span>
        <span class="swipe-pay-lbl">${b.deleted ? '↩ Restaurar' : b.paid ? '↩ Desfazer' : '✅ Pago'}</span>
      </div>
      <div class="bill-item" data-id="${b.id}">
        <div class="bill-cat">${cat.e}</div>
        <div class="bill-info">
          <div class="bill-name">${b.name}</div>
          <div class="bill-meta">📅 ${dateStr}${typeLabel(b)}</div>
        </div>
        <div class="bill-right">
          <div class="bill-val" style="color:${valClr}">${fmt(b.amount)}</div>
          <span class="bst ${b.deleted ? 's-deleted' : 's-' + st}">${stLbl}</span>
        </div>
        <div class="bill-acts">
          ${b.deleted ? '<button class="ibtn restore-ibtn" title="Restaurar">↩️</button><button class="ibtn del-ibtn" title="Excluir definitivamente">❌</button>' : `<button class="ibtn pay-ibtn" title="${b.paid ? 'Desfazer' : 'Marcar pago'}">${b.paid ? '✅' : '⭕'}</button><button class="ibtn edit-ibtn" title="Editar">✏️</button><button class="ibtn del-ibtn" title="Excluir">🗑</button>`}
        </div>
      </div>`;

    const item = wrapper.querySelector('.bill-item');
    listEl.appendChild(wrapper);

    const payBtn = wrapper.querySelector('.pay-ibtn');
    const editBtn = wrapper.querySelector('.edit-ibtn');
    const restoreBtn = wrapper.querySelector('.restore-ibtn');
    const delBtn = wrapper.querySelector('.del-ibtn');
    if (payBtn) payBtn.addEventListener('click', e => { e.stopPropagation(); togglePaid(b.id); });
    if (editBtn) editBtn.addEventListener('click', e => { e.stopPropagation(); openEdit(b.id); });
    if (restoreBtn) restoreBtn.addEventListener('click', e => { e.stopPropagation(); restoreBill(b.id); });
    if (delBtn) delBtn.addEventListener('click', e => { e.stopPropagation(); b.deleted ? permanentlyDeleteBill(b.id) : deleteBill(b.id); });

    setupSwipe(item, wrapper, b.id);
  });
}

// ── SWIPE GESTURES ─────────────────────────────────────────────────────────────
function setupSwipe(item, wrapper, id) {
  let startX = 0, startY = 0, curX = 0, active = false;
  const THRESHOLD = 75;

  item.addEventListener('touchstart', e => {
    startX = e.touches[0].clientX; startY = e.touches[0].clientY; active = true; curX = 0;
    item.style.transition = 'none';
  }, { passive: true });

  item.addEventListener('touchmove', e => {
    if (!active) return;
    const dx = e.touches[0].clientX - startX;
    const dy = e.touches[0].clientY - startY;
    if (Math.abs(dy) > Math.abs(dx) + 5) { active = false; return; }
    curX = dx; item.style.transform = `translateX(${dx}px)`;
    const ratio = Math.min(Math.abs(dx) / THRESHOLD, 1);
    wrapper.style.background = dx > 0 ? `rgba(0,212,170,${ratio * 0.25})` : `rgba(255,107,107,${ratio * 0.25})`;
  }, { passive: true });

  item.addEventListener('touchend', () => {
    if (!active) return;
    active = false; item.style.transition = 'transform .25s ease'; wrapper.style.background = '';
    if (curX > THRESHOLD) {
      item.style.transform = 'translateX(110%)';
      setTimeout(() => {
        const b = bills.find(x => x.id === id);
        if (b && b.deleted) restoreBill(id); else togglePaid(id);
        item.style.transform = '';
      }, 220);
    } else if (curX < -THRESHOLD) {
      item.style.transform = 'translateX(-110%)';
      setTimeout(() => {
        const b = bills.find(x => x.id === id);
        if (b && b.deleted) permanentlyDeleteBill(id); else deleteBill(id);
      }, 220);
    } else item.style.transform = '';
    curX = 0;
  });

  item.addEventListener('touchcancel', () => { active = false; item.style.transform = ''; wrapper.style.background = ''; });
}

// ── BILL ACTIONS ──────────────────────────────────────────────────────────────
function togglePaid(id) {
  const b = bills.find(x => x.id === id);
  if (!b || b.deleted) return;
  b.paid = !b.paid;
  b.paidAt = b.paid ? new Date().toISOString() : null;
  save();
  render();
}

function deleteBill(id) {
  const b = bills.find(x => x.id === id);
  if (!b) return;

  let msg = 'Mover esta conta para a lixeira? Você poderá restaurar depois.';
  if (b.type === 'recurring') msg = 'Mover esta ocorrência recorrente para a lixeira? As próximas continuam sendo geradas.';
  if (b.type === 'installment') msg = 'Mover esta parcela para a lixeira? As outras parcelas serão mantidas.';
  if (!confirm(msg)) return;

  b.deleted = true;
  b.deletedAt = new Date().toISOString();
  save();
  render();
}

function restoreBill(id) {
  const b = bills.find(x => x.id === id);
  if (!b) return;
  b.deleted = false;
  b.deletedAt = null;
  save();
  render();
}

function permanentlyDeleteBill(id) {
  const b = bills.find(x => x.id === id);
  if (!b) return;
  if (!confirm('Excluir definitivamente? Esta ação não poderá ser desfeita.')) return;
  bills = bills.filter(x => x.id !== id);
  save();
  render();
}

// ── MODAL: ADD / EDIT ─────────────────────────────────────────────────────────
function setType(type) {
  selectedType = type;
  $('fType').value = type;
  $('installmentFields').style.display = type === 'installment' ? 'grid' : 'none';
  $('fRec').checked = type === 'recurring';
  document.querySelectorAll('.type-chip').forEach(btn => btn.classList.toggle('active', btn.dataset.type === type));
}

function openAdd() {
  editingId = null;
  selectedCat = 'Outros';
  $('modalTitle').textContent = 'Nova conta';
  $('saveBtn').textContent = '✓  Adicionar conta';
  $('fName').value = '';
  $('fAmount').value = '';
  $('fDate').value = new Date().toISOString().split('T')[0];
  $('fInstallments').value = 2;
  setType('single');
  renderCatGrid();
  $('billModal').style.display = 'flex';
  setTimeout(() => $('fName').focus(), 300);
}

function openEdit(id) {
  const b = bills.find(x => x.id === id);
  if (!b) return;
  editingId = id;
  selectedCat = b.category || 'Outros';
  $('modalTitle').textContent = 'Editar conta';
  $('saveBtn').textContent = '✓  Salvar alterações';
  $('fName').value = b.name;
  $('fAmount').value = b.amount;
  $('fDate').value = b.date;
  $('fInstallments').value = b.installmentTotal || 2;
  setType(b.type || (b.recurring ? 'recurring' : 'single'));
  renderCatGrid();
  $('billModal').style.display = 'flex';
}

function renderCatGrid() {
  $('catGrid').innerHTML = CATS.map(c =>
    `<div class="cat-btn${selectedCat === c.n ? ' active' : ''}" data-cat="${c.n}">${c.e}<span>${c.n}</span></div>`
  ).join('');
  $('catGrid').querySelectorAll('.cat-btn').forEach(el => {
    el.addEventListener('click', () => {
      selectedCat = el.dataset.cat;
      $('catGrid').querySelectorAll('.cat-btn').forEach(x => x.classList.remove('active'));
      el.classList.add('active');
    });
  });
}

function buildInstallments({ name, amount, date, category, total }) {
  const seriesId = uid('inst');
  const count = Math.max(1, Number(total || 1));
  return Array.from({ length: count }, (_, i) => ({
    id: uid('bill'),
    type: 'installment',
    seriesId,
    name,
    amount,
    date: addMonths(date, i),
    category,
    paid: false,
    paidAt: null,
    deleted: false,
    deletedAt: null,
    recurring: false,
    installmentCurrent: i + 1,
    installmentTotal: count,
  }));
}

function saveBill() {
  const name   = $('fName').value.trim();
  const amount = parseFloat($('fAmount').value);
  const date   = $('fDate').value;
  const type   = $('fType').value || 'single';
  const installments = parseInt($('fInstallments').value, 10);

  if (!name || isNaN(amount) || amount <= 0 || !date) {
    alert('Preencha nome, valor e vencimento corretamente.');
    return;
  }
  if (type === 'installment' && (!installments || installments < 2)) {
    alert('Informe pelo menos 2 parcelas.');
    return;
  }

  if (editingId) {
    const b = bills.find(x => x.id === editingId);
    if (b) {
      Object.assign(b, {
        name, amount, date, category: selectedCat, type,
        recurring: type === 'recurring',
        repeatForever: type === 'recurring',
        dayOfMonth: parseLocalDate(date).getDate(),
        baseDate: type === 'recurring' ? (b.baseDate || date) : undefined,
      });
      if (type === 'installment') {
        b.installmentTotal = b.installmentTotal || installments;
        b.installmentCurrent = b.installmentCurrent || 1;
        b.seriesId = b.seriesId || uid('inst');
      }
      if (type === 'recurring') b.seriesId = b.seriesId || uid('rec');
    }
  } else if (type === 'installment') {
    bills.push(...buildInstallments({ name, amount, date, category: selectedCat, total: installments }));
  } else {
    const base = {
      id: uid('bill'), name, amount, date, category: selectedCat,
      type, paid: false, paidAt: null, deleted: false, deletedAt: null, recurring: type === 'recurring',
    };
    if (type === 'recurring') {
      base.seriesId = uid('rec');
      base.baseDate = date;
      base.dayOfMonth = parseLocalDate(date).getDate();
      base.repeatForever = true;
    }
    bills.push(base);
  }

  save();
  closeBillModal();
  render();
}

function closeBillModal() {
  $('billModal').style.display = 'none';
  editingId = null;
}

// ── WHATSAPP ──────────────────────────────────────────────────────────────────
function openWpp() {
  ensureGeneratedForMonth(curYear, curMonth);
  const currentMonthBills = billsForMonth();
  const pend = currentMonthBills.filter(b => !b.deleted && !b.paid).sort((a, b) => parseLocalDate(a.date) - parseLocalDate(b.date));
  const overdue = pend.filter(b => getStatus(b) === 'overdue');
  const upcoming = pend.filter(b => getStatus(b) === 'pending');
  const paidInMonth = currentMonthBills.filter(b => !b.deleted && b.paid);

  let msg = '💰 *FamFinance – Resumo de Contas*\n';
  msg += `📅 ${MONTHS[curMonth]} ${curYear}\n\n`;

  if (overdue.length) {
    msg += '🔴 *Vencidas:*\n';
    overdue.forEach(b => { msg += `• ${b.name}: ${fmt(b.amount)}\n`; });
    msg += '\n';
  }

  if (upcoming.length) {
    msg += '⏳ *Pendentes:*\n';
    upcoming.slice(0, 10).forEach(b => {
      const d = daysUntil(b.date);
      const when = d === 0 ? 'hoje' : d === 1 ? 'amanhã' : 'em ' + d + ' dias';
      msg += `• ${b.name}: ${fmt(b.amount)} (vence ${when})\n`;
    });
    msg += '\n';
  }

  const paidTotal = paidInMonth.reduce((s, b) => s + b.amount, 0);
  const pendTotal = pend.reduce((s, b) => s + b.amount, 0);
  msg += `✅ *Já pago: ${fmt(paidTotal)}*\n`;
  msg += `💳 *Total pendente: ${fmt(pendTotal)}*`;

  const enc = encodeURIComponent(msg);
  const preview = msg.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\*(.*?)\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');

  $('wppContent').innerHTML = `
    <div class="wpp-preview">${preview}</div>
    <p class="wpp-tip">O WhatsApp vai abrir com a mensagem pronta — escolha o contato ou grupo.</p>
    <a class="wpp-open-btn" href="https://wa.me/?text=${enc}" target="_blank" rel="noopener">📱 Abrir no WhatsApp</a>`;

  $('wppModal').style.display = 'flex';
}

// ── EXPORT ────────────────────────────────────────────────────────────────────
function exportData() {
  const blob = new Blob([JSON.stringify(bills, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = 'famfinance-backup.json'; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ── NOTIFICATIONS ────────────────────────────────────────────────────────────
function notificationsSupported() {
  return 'Notification' in window && 'serviceWorker' in navigator;
}

function askNotificationPermission() {
  if (!notificationsSupported()) return;
  if (Notification.permission !== 'default') return;
  if (localStorage.getItem(NOTIFICATION_ASKED_KEY)) return;

  localStorage.setItem(NOTIFICATION_ASKED_KEY, 'yes');
  setTimeout(() => {
    const ok = confirm('Deseja receber lembretes de contas vencendo no celular?');
    if (ok) Notification.requestPermission().then(() => checkDueNotifications());
  }, 1200);
}

function notificationMemory() {
  try { return JSON.parse(localStorage.getItem(NOTIFICATION_KEY) || '{}'); }
  catch(e) { return {}; }
}

function saveNotificationMemory(memory) {
  localStorage.setItem(NOTIFICATION_KEY, JSON.stringify(memory));
}

async function showAppNotification(title, options) {
  if (!notificationsSupported() || Notification.permission !== 'granted') return;
  const registration = await navigator.serviceWorker.ready;
  if (registration && registration.showNotification) {
    registration.showNotification(title, options);
  } else {
    new Notification(title, options);
  }
}

function checkDueNotifications() {
  if (!notificationsSupported() || Notification.permission !== 'granted') return;

  const todayKey = new Date().toISOString().slice(0, 10);
  const memory = notificationMemory();
  const dueBills = bills
    .filter(b => !b.deleted && !b.paid)
    .map(b => ({ bill: b, days: daysUntil(b.date) }))
    .filter(x => x.days === 3 || x.days === 1 || x.days === 0 || x.days < 0)
    .sort((a, b) => a.days - b.days)
    .slice(0, 3);

  dueBills.forEach(({ bill, days }) => {
    const key = `${todayKey}|${bill.id}|${days}`;
    if (memory[key]) return;

    const when = days < 0 ? `venceu há ${Math.abs(days)} dia${Math.abs(days) !== 1 ? 's' : ''}`
      : days === 0 ? 'vence hoje'
      : days === 1 ? 'vence amanhã'
      : 'vence em 3 dias';

    showAppNotification('FamFinance: lembrete de conta', {
      body: `${bill.name} ${when} — ${fmt(bill.amount)}`,
      icon: './manifest.json',
      badge: './manifest.json',
      tag: `famfinance-${bill.id}-${todayKey}`,
      renotify: false,
      data: { url: './index.html' }
    });
    memory[key] = true;
  });

  saveNotificationMemory(memory);
}

// ── PWA UPDATE HANDLER ───────────────────────────────────────────────────────
function setupPwaUpdates() {
  if (!('serviceWorker' in navigator)) return;

  let refreshing = false;

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });

  function activateNewWorker(registration) {
    if (registration && registration.waiting) {
      registration.waiting.postMessage({ type: 'SKIP_WAITING' });
    }
  }

  navigator.serviceWorker.register('sw.js').then(registration => {
    registration.update();
    activateNewWorker(registration);

    registration.addEventListener('updatefound', () => {
      const newWorker = registration.installing;
      if (!newWorker) return;

      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          newWorker.postMessage({ type: 'SKIP_WAITING' });
        }
      });
    });

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') registration.update();
    });

    setInterval(() => registration.update(), 60 * 60 * 1000);
  }).catch(() => {});
}

// ── INIT ──────────────────────────────────────────────────────────────────────
function init() {
  load();
  cleanupOldDeletedBills();

  $('prevMonth').addEventListener('click', () => changeMonth(-1));
  $('nextMonth').addEventListener('click', () => changeMonth(1));

  document.querySelectorAll('.nav-btn').forEach(btn => btn.addEventListener('click', () => setView(btn.dataset.view)));
  $('fabBtn').addEventListener('click', openAdd);

  $('closeBillModal').addEventListener('click', closeBillModal);
  $('saveBtn').addEventListener('click', saveBill);
  $('billModal').addEventListener('click', e => { if (e.target === $('billModal')) closeBillModal(); });

  document.querySelectorAll('.type-chip').forEach(btn => btn.addEventListener('click', () => setType(btn.dataset.type)));
  $('fRec').addEventListener('change', () => setType($('fRec').checked ? 'recurring' : 'single'));

  $('wppBtn').addEventListener('click', openWpp);
  $('closeWpp').addEventListener('click', () => { $('wppModal').style.display = 'none'; });
  $('wppModal').addEventListener('click', e => { if (e.target === $('wppModal')) $('wppModal').style.display = 'none'; });

  $('exportBtn').addEventListener('click', exportData);

  document.querySelectorAll('.fchip').forEach(chip => chip.addEventListener('click', () => {
    document.querySelectorAll('.fchip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active'); activeFilter = chip.dataset.f; renderBills();
  }));

  setupPwaUpdates();
  askNotificationPermission();

  render();
  checkDueNotifications();
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkDueNotifications(); });
  setInterval(checkDueNotifications, 6 * 60 * 60 * 1000);
}

document.addEventListener('DOMContentLoaded', init);
