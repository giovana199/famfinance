/* ── FamFinance app.js ── */

const STORAGE_KEY = "famfinance_v3";
const LEGACY_KEYS = ["famfinance_v2"];

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
    b.recurrenceDisabled = Boolean(b.recurrenceDisabled);
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
  if (b.paid && !b.paidAt) b.paidAt = new Date().toISOString();
  if (!b.deleted) { b.deleted = false; b.deletedAt = null; }
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
  bills.filter(b => b.type === 'recurring' && !b.recurrenceDisabled).forEach(b => {
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
    if (src.recurrenceEndDate && ymKey(year, month) > src.recurrenceEndDate) return;
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

function billsForMonth() {
  ensureGeneratedForMonth(curYear, curMonth);
  return bills.filter(b => {
    const d = parseLocalDate(b.date);
    return !b.deleted && d.getMonth() === curMonth && d.getFullYear() === curYear;
  });
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


function getBillsFor(year, month) {
  const oldYear = curYear;
  const oldMonth = curMonth;
  curYear = year;
  curMonth = month;
  const result = billsForMonth().slice();
  curYear = oldYear;
  curMonth = oldMonth;
  return result;
}

function monthStats(year, month) {
  const items = getBillsFor(year, month);
  const total = items.reduce((s, b) => s + b.amount, 0);
  const paidItems = items.filter(b => b.paid);
  const pendingItems = items.filter(b => !b.paid);
  const paid = paidItems.reduce((s, b) => s + b.amount, 0);
  const pending = pendingItems.reduce((s, b) => s + b.amount, 0);
  const biggest = items.slice().sort((a, b) => b.amount - a.amount)[0] || null;
  const byCat = {};
  items.forEach(b => { byCat[b.category || 'Outros'] = (byCat[b.category || 'Outros'] || 0) + b.amount; });
  const topCatName = Object.keys(byCat).sort((a, b) => byCat[b] - byCat[a])[0] || null;
  return { items, total, paid, pending, paidItems, pendingItems, biggest, topCatName, topCatValue: topCatName ? byCat[topCatName] : 0 };
}

function previousMonthOf(year, month) {
  return month === 0 ? { year: year - 1, month: 11 } : { year, month: month - 1 };
}

function monthlyInsight(cur, prev) {
  if (!cur.items.length) return 'Cadastre contas neste mês para gerar insights automáticos.';
  if (!prev.items.length && cur.pending === 0) return '🎉 Todas as contas cadastradas deste mês já estão pagas.';
  if (!prev.items.length) return `Você tem ${cur.pendingItems.length} conta${cur.pendingItems.length !== 1 ? 's' : ''} pendente${cur.pendingItems.length !== 1 ? 's' : ''} neste mês.`;
  const diff = cur.total - prev.total;
  if (Math.abs(diff) < 0.01) return 'Seus gastos previstos estão estáveis em relação ao mês anterior.';
  if (diff < 0) return `🎉 Você reduziu ${fmt(Math.abs(diff))} em relação ao mês anterior.`;
  return `⚠️ Seus gastos previstos aumentaram ${fmt(diff)} em relação ao mês anterior.`;
}

function monthlySummaryMessage() {
  const cur = monthStats(curYear, curMonth);
  const prevInfo = previousMonthOf(curYear, curMonth);
  const prev = monthStats(prevInfo.year, prevInfo.month);
  const insight = monthlyInsight(cur, prev);
  const biggest = cur.biggest ? `${cur.biggest.name} — ${fmt(cur.biggest.amount)}` : 'Sem contas';
  const cat = cur.topCatName ? `${cur.topCatName} — ${fmt(cur.topCatValue)}` : 'Sem categoria';

  let msg = `📊 *FamFinance – Resumo Mensal*\n`;
  msg += `📅 ${MONTHS[curMonth]} ${curYear}\n\n`;
  msg += `💰 Total previsto: *${fmt(cur.total)}*\n`;
  msg += `✅ Pago: *${fmt(cur.paid)}*\n`;
  msg += `⏳ Pendente: *${fmt(cur.pending)}*\n\n`;
  msg += `🏆 Maior gasto: ${biggest}\n`;
  msg += `📌 Categoria principal: ${cat}\n\n`;
  msg += `${insight}`;
  return msg;
}

function renderMonthlySummary() {
  const el = $('monthlySummaryCard');
  if (!el) return;
  const cur = monthStats(curYear, curMonth);
  const prevInfo = previousMonthOf(curYear, curMonth);
  const prev = monthStats(prevInfo.year, prevInfo.month);
  const insight = monthlyInsight(cur, prev);
  const biggest = cur.biggest ? cur.biggest.name : 'Sem contas';
  const biggestValue = cur.biggest ? fmt(cur.biggest.amount) : 'R$ 0,00';
  const cat = cur.topCatName || 'Sem categoria';
  const catValue = cur.topCatName ? fmt(cur.topCatValue) : 'R$ 0,00';
  const diff = cur.total - prev.total;
  const badge = !prev.items.length ? 'Novo mês' : diff < 0 ? 'Economia' : diff > 0 ? 'Atenção' : 'Estável';

  el.innerHTML = `
    <div class="ms-head">
      <div>
        <div class="ms-title">${MONTHS[curMonth]} ${curYear}</div>
        <div class="ms-sub">Resumo automático com base nas contas cadastradas.</div>
      </div>
      <span class="ms-badge">${badge}</span>
    </div>
    <div class="ms-grid">
      <div class="ms-mini"><span>Maior gasto</span><strong title="${biggest}">${biggestValue}</strong><div class="card-sub">${biggest}</div></div>
      <div class="ms-mini"><span>Categoria top</span><strong title="${cat}">${catValue}</strong><div class="card-sub">${cat}</div></div>
      <div class="ms-mini"><span>Pago</span><strong>${fmt(cur.paid)}</strong><div class="card-sub">${cur.paidItems.length} conta${cur.paidItems.length !== 1 ? 's' : ''}</div></div>
      <div class="ms-mini"><span>Pendente</span><strong>${fmt(cur.pending)}</strong><div class="card-sub">${cur.pendingItems.length} conta${cur.pendingItems.length !== 1 ? 's' : ''}</div></div>
    </div>
    <div class="ms-insight">${insight}</div>
    <button class="ms-share-btn" id="shareMonthlySummaryBtn">📱 Compartilhar resumo mensal</button>
  `;
  const btn = $('shareMonthlySummaryBtn');
  if (btn) btn.addEventListener('click', openMonthlySummaryWpp);
}

function openMonthlySummaryWpp() {
  const msg = monthlySummaryMessage();
  const enc = encodeURIComponent(msg);
  const preview = msg.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\*(.*?)\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');
  $('wppContent').innerHTML = `
    <div class="wpp-preview">${preview}</div>
    <p class="wpp-tip">O WhatsApp vai abrir com o resumo mensal pronto para envio.</p>
    <a class="wpp-open-btn" href="https://wa.me/?text=${enc}" target="_blank" rel="noopener">📱 Abrir no WhatsApp</a>`;
  $('wppModal').style.display = 'flex';
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

  renderMonthlySummary();

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
  if (b.type === 'recurring') return ' · 🔁 recorrente';
  if (b.type === 'installment') return ` · 💳 ${b.installmentCurrent}/${b.installmentTotal}`;
  return '';
}

function renderBills() {
  const listEl = $('list');
  let filtered;
  const showingTrash = activeFilter === 'trash';

  if (showingTrash) {
    filtered = bills.filter(b => b.deleted);
  } else {
    filtered = billsForMonth();
    if (activeFilter === 'paid')    filtered = filtered.filter(b => b.paid);
    if (activeFilter === 'pending') filtered = filtered.filter(b => !b.paid && getStatus(b) === 'pending');
    if (activeFilter === 'overdue') filtered = filtered.filter(b => getStatus(b) === 'overdue');
  }

  filtered.sort((a, b) => parseLocalDate(a.date) - parseLocalDate(b.date));

  if (!filtered.length) {
    listEl.innerHTML = showingTrash
      ? '<div class="empty">🗑<br>Lixeira vazia!</div>'
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
    const deletedInfo = b.deletedAt ? `<div class="bill-meta trash-meta">🗑 excluída em ${new Date(b.deletedAt).toLocaleDateString('pt-BR')} · fica por 7 dias</div>` : '';

    const wrapper = document.createElement('div');
    wrapper.className = 'bill-wrapper';

    if (showingTrash) {
      wrapper.innerHTML = `
        <div class="bill-item trash-item" data-id="${b.id}">
          <div class="bill-cat">${cat.e}</div>
          <div class="bill-info">
            <div class="bill-name">${b.name}</div>
            <div class="bill-meta">📅 ${dateStr}${typeLabel(b)}</div>
            ${deletedInfo}
          </div>
          <div class="bill-right">
            <div class="bill-val" style="color:${valClr}">${fmt(b.amount)}</div>
            <span class="bst s-pending">${stLbl}</span>
          </div>
          <div class="bill-acts">
            <button class="ibtn restore-ibtn" title="Restaurar">↩️</button>
            <button class="ibtn hard-del-ibtn" title="Excluir definitivamente">🧨</button>
          </div>
        </div>`;

      listEl.appendChild(wrapper);
      wrapper.querySelector('.restore-ibtn').addEventListener('click', e => { e.stopPropagation(); restoreBill(b.id); });
      wrapper.querySelector('.hard-del-ibtn').addEventListener('click', e => { e.stopPropagation(); permanentDeleteBill(b.id); });
      return;
    }

    wrapper.innerHTML = `
      <div class="swipe-bg">
        <span class="swipe-del-lbl">🗑 Excluir</span>
        <span class="swipe-pay-lbl">${b.paid ? '↩ Desfazer' : '✅ Pago'}</span>
      </div>
      <div class="bill-item" data-id="${b.id}">
        <div class="bill-cat">${cat.e}</div>
        <div class="bill-info">
          <div class="bill-name">${b.name}</div>
          <div class="bill-meta">📅 ${dateStr}${typeLabel(b)}</div>
        </div>
        <div class="bill-right">
          <div class="bill-val" style="color:${valClr}">${fmt(b.amount)}</div>
          <span class="bst s-${st}">${stLbl}</span>
        </div>
        <div class="bill-acts">
          <button class="ibtn pay-ibtn" title="${b.paid ? 'Desfazer' : 'Marcar pago'}">${b.paid ? '✅' : '⭕'}</button>
          <button class="ibtn edit-ibtn" title="Editar">✏️</button>
          <button class="ibtn del-ibtn" title="Excluir">🗑</button>
        </div>
      </div>`;

    const item = wrapper.querySelector('.bill-item');
    listEl.appendChild(wrapper);

    wrapper.querySelector('.pay-ibtn').addEventListener('click', e => { e.stopPropagation(); togglePaid(b.id); });
    wrapper.querySelector('.edit-ibtn').addEventListener('click', e => { e.stopPropagation(); openEdit(b.id); });
    wrapper.querySelector('.del-ibtn').addEventListener('click', e => { e.stopPropagation(); deleteBill(b.id); });

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
      setTimeout(() => { togglePaid(id); item.style.transform = ''; }, 220);
    } else if (curX < -THRESHOLD) {
      item.style.transform = 'translateX(-110%)';
      setTimeout(() => { deleteBill(id); }, 220);
    } else item.style.transform = '';
    curX = 0;
  });

  item.addEventListener('touchcancel', () => { active = false; item.style.transform = ''; wrapper.style.background = ''; });
}

// ── BILL ACTIONS ──────────────────────────────────────────────────────────────
function togglePaid(id) {
  const b = bills.find(x => x.id === id);
  if (b) { b.paid = !b.paid; b.paidAt = b.paid ? new Date().toISOString() : null; save(); render(); }
}

function softDeleteBill(b) {
  b.deleted = true;
  b.deletedAt = new Date().toISOString();
}

function cleanupTrash() {
  const limit = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const before = bills.length;
  bills = bills.filter(b => !b.deletedAt || new Date(b.deletedAt).getTime() >= limit);
  if (bills.length !== before) save();
}


function restoreBill(id) {
  const b = bills.find(x => x.id === id);
  if (!b) return;
  b.deleted = false;
  b.deletedAt = null;
  save();
  render();
}

function permanentDeleteBill(id) {
  const b = bills.find(x => x.id === id);
  if (!b) return;
  if (!confirm('Excluir definitivamente esta conta? Essa ação não poderá ser desfeita.')) return;
  bills = bills.filter(x => x.id !== id);
  save();
  render();
}

function deleteBill(id) {
  const b = bills.find(x => x.id === id);
  if (!b) return;

  if (b.type === 'recurring') {
    const choice = prompt(
      'Esta conta é recorrente. O que deseja fazer?\n\n' +
      '1 - Excluir somente este mês\n' +
      '2 - Encerrar recorrência a partir deste mês\n' +
      '3 - Excluir toda a recorrência\n\n' +
      'Digite 1, 2 ou 3:'
    );

    if (choice === '1') {
      softDeleteBill(b);
    } else if (choice === '2') {
      const currentKey = ymKey(parseLocalDate(b.date).getFullYear(), parseLocalDate(b.date).getMonth());
      bills.forEach(x => {
        if (x.seriesId === b.seriesId && x.type === 'recurring') {
          x.recurrenceEndDate = currentKey;
          const xKey = ymKey(parseLocalDate(x.date).getFullYear(), parseLocalDate(x.date).getMonth());
          if (xKey >= currentKey) softDeleteBill(x);
        }
      });
    } else if (choice === '3') {
      bills.forEach(x => { if (x.seriesId === b.seriesId && x.type === 'recurring') { x.recurrenceDisabled = true; softDeleteBill(x); } });
    } else {
      return;
    }
  } else {
    const msg = b.type === 'installment'
      ? 'Mover esta parcela para a lixeira? Ela será removida definitivamente em 7 dias.'
      : 'Mover esta conta para a lixeira? Ela será removida definitivamente em 7 dias.';
    if (!confirm(msg)) return;
    softDeleteBill(b);
  }

  cleanupTrash();
  save(); render();
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
      type, paid: false, recurring: type === 'recurring',
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
  const pend = currentMonthBills.filter(b => !b.paid).sort((a, b) => parseLocalDate(a.date) - parseLocalDate(b.date));
  const overdue = pend.filter(b => getStatus(b) === 'overdue');
  const upcoming = pend.filter(b => getStatus(b) === 'pending');
  const paidInMonth = currentMonthBills.filter(b => b.paid);

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

// ── INIT ──────────────────────────────────────────────────────────────────────
function init() {
  load();
  if (typeof cleanupTrash === 'function') cleanupTrash();

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

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js?v=8').then(reg => reg.update()).catch(() => {});
  }

  render();
}

document.addEventListener('DOMContentLoaded', init);
