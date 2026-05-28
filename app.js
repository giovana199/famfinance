/* ── FamFinance app.js ── */

const STORAGE_KEY = "famfinance_v2";   // same key → existing data preserved

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
let catChart     = null;

// ── HELPERS ───────────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    bills = raw ? JSON.parse(raw) : [];
    // Migrate old bills that have no category
    bills.forEach(b => { if (!b.category) b.category = 'Outros'; });
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
  const due   = new Date(bill.date + 'T12:00:00');
  const today = new Date(); today.setHours(0,0,0,0);
  return due < today ? 'overdue' : 'pending';
}

function daysUntil(dateStr) {
  const due   = new Date(dateStr + 'T12:00:00');
  const today = new Date(); today.setHours(0,0,0,0);
  return Math.ceil((due - today) / 864e5);
}

function billsForMonth() {
  return bills.filter(b => {
    const d = new Date(b.date + 'T12:00:00');
    return d.getMonth() === curMonth && d.getFullYear() === curYear;
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

  // Alerts: bills due in ≤ 5 days
  const alerts = bills
    .filter(b => { if (b.paid) return false; const d = daysUntil(b.date); return d >= 0 && d <= 5; })
    .sort((a, b) => new Date(a.date) - new Date(b.date))
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
  // Aggregate by category
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
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: colors,
        borderWidth: 0,
        hoverOffset: 10,
        borderRadius: 4,
      }],
    },
    options: {
      responsive: true,
      cutout: '68%',
      animation: { duration: 600, easing: 'easeInOutQuart' },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => ' ' + fmt(ctx.raw),
          },
        },
      },
    },
  });

  $('chartCenter').innerHTML = `
    <span class="ct-val">${fmt(total)}</span>
    <span class="ct-lbl">total</span>
  `;

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

function renderBills() {
  const listEl = $('list');
  let filtered = billsForMonth();

  if (activeFilter === 'paid')    filtered = filtered.filter(b => b.paid);
  if (activeFilter === 'pending') filtered = filtered.filter(b => !b.paid && getStatus(b) === 'pending');
  if (activeFilter === 'overdue') filtered = filtered.filter(b => getStatus(b) === 'overdue');

  filtered.sort((a, b) => new Date(a.date) - new Date(b.date));

  if (!filtered.length) {
    listEl.innerHTML = '<div class="empty">😊<br>Nenhuma conta aqui!</div>';
    return;
  }

  listEl.innerHTML = '';

  filtered.forEach(b => {
    const st     = getStatus(b);
    const cat    = CATS.find(c => c.n === b.category) || CATS[9];
    const stLbl  = st === 'paid' ? 'Pago' : st === 'overdue' ? 'Vencida' : 'Pendente';
    const valClr = st === 'paid' ? '#00d4aa' : st === 'overdue' ? '#ff6b6b' : '#f0eff8';
    const dateStr = new Date(b.date + 'T12:00:00').toLocaleDateString('pt-BR');

    const wrapper = document.createElement('div');
    wrapper.className = 'bill-wrapper';

    wrapper.innerHTML = `
      <div class="swipe-bg">
        <span class="swipe-del-lbl">🗑 Excluir</span>
        <span class="swipe-pay-lbl">${b.paid ? '↩ Desfazer' : '✅ Pago'}</span>
      </div>
      <div class="bill-item" data-id="${b.id}">
        <div class="bill-cat">${cat.e}</div>
        <div class="bill-info">
          <div class="bill-name">${b.name}</div>
          <div class="bill-meta">📅 ${dateStr}</div>
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

    // Button events
    wrapper.querySelector('.pay-ibtn').addEventListener('click', e => { e.stopPropagation(); togglePaid(b.id); });
    wrapper.querySelector('.edit-ibtn').addEventListener('click', e => { e.stopPropagation(); openEdit(b.id); });
    wrapper.querySelector('.del-ibtn').addEventListener('click', e => { e.stopPropagation(); deleteBill(b.id); });

    // Swipe-to-action
    setupSwipe(item, wrapper, b.id, b.paid);
  });
}

// ── SWIPE GESTURES ─────────────────────────────────────────────────────────────
function setupSwipe(item, wrapper, id, isPaid) {
  let startX = 0, startY = 0, curX = 0, active = false;
  const THRESHOLD = 75;

  item.addEventListener('touchstart', e => {
    startX  = e.touches[0].clientX;
    startY  = e.touches[0].clientY;
    active  = true;
    curX    = 0;
    item.style.transition = 'none';
  }, { passive: true });

  item.addEventListener('touchmove', e => {
    if (!active) return;
    const dx = e.touches[0].clientX - startX;
    const dy = e.touches[0].clientY - startY;
    if (Math.abs(dy) > Math.abs(dx) + 5) { active = false; return; } // vertical scroll
    curX = dx;
    item.style.transform = `translateX(${dx}px)`;

    // Tint the background based on direction
    const ratio = Math.min(Math.abs(dx) / THRESHOLD, 1);
    if (dx > 0) wrapper.style.background = `rgba(0,212,170,${ratio * 0.25})`;  // green = pay
    else        wrapper.style.background = `rgba(255,107,107,${ratio * 0.25})`; // red  = delete
  }, { passive: true });

  item.addEventListener('touchend', () => {
    if (!active) return;
    active = false;
    item.style.transition = 'transform .25s ease';
    wrapper.style.background = '';

    if (curX > THRESHOLD) {
      // Swipe right → mark paid
      item.style.transform = 'translateX(110%)';
      setTimeout(() => { togglePaid(id); item.style.transform = ''; }, 220);
    } else if (curX < -THRESHOLD) {
      // Swipe left → delete
      item.style.transform = 'translateX(-110%)';
      setTimeout(() => { deleteBill(id); }, 220);
    } else {
      item.style.transform = '';
    }
    curX = 0;
  });

  item.addEventListener('touchcancel', () => {
    active = false;
    item.style.transform = '';
    wrapper.style.background = '';
  });
}

// ── BILL ACTIONS ──────────────────────────────────────────────────────────────
function togglePaid(id) {
  const b = bills.find(x => x.id === id);
  if (b) { b.paid = !b.paid; save(); render(); }
}

function deleteBill(id) {
  if (!confirm('Excluir esta conta?')) return;
  bills = bills.filter(x => x.id !== id);
  save(); render();
}

// ── MODAL: ADD / EDIT ─────────────────────────────────────────────────────────
function openAdd() {
  editingId   = null;
  selectedCat = 'Outros';
  $('modalTitle').textContent = 'Nova conta';
  $('saveBtn').textContent    = '✓  Adicionar conta';
  $('fName').value    = '';
  $('fAmount').value  = '';
  $('fDate').value    = new Date().toISOString().split('T')[0];
  $('fRec').checked   = false;
  renderCatGrid();
  $('billModal').style.display = 'flex';
  setTimeout(() => $('fName').focus(), 300);
}

function openEdit(id) {
  const b = bills.find(x => x.id === id);
  if (!b) return;
  editingId   = id;
  selectedCat = b.category || 'Outros';
  $('modalTitle').textContent = 'Editar conta';
  $('saveBtn').textContent    = '✓  Salvar alterações';
  $('fName').value    = b.name;
  $('fAmount').value  = b.amount;
  $('fDate').value    = b.date;
  $('fRec').checked   = b.recurring || false;
  renderCatGrid();
  $('billModal').style.display = 'flex';
}

function renderCatGrid() {
  $('catGrid').innerHTML = CATS.map(c =>
    `<div class="cat-btn${selectedCat === c.n ? ' active' : ''}" data-cat="${c.n}">
       ${c.e}<span>${c.n}</span>
     </div>`
  ).join('');
  $('catGrid').querySelectorAll('.cat-btn').forEach(el => {
    el.addEventListener('click', () => {
      selectedCat = el.dataset.cat;
      $('catGrid').querySelectorAll('.cat-btn').forEach(x => x.classList.remove('active'));
      el.classList.add('active');
    });
  });
}

function saveBill() {
  const name   = $('fName').value.trim();
  const amount = parseFloat($('fAmount').value);
  const date   = $('fDate').value;
  const rec    = $('fRec').checked;

  if (!name || isNaN(amount) || amount <= 0 || !date) {
    alert('Preencha nome, valor e vencimento corretamente.');
    return;
  }

  if (editingId) {
    const b = bills.find(x => x.id === editingId);
    if (b) Object.assign(b, { name, amount, date, category: selectedCat, recurring: rec });
  } else {
    bills.push({ id: Date.now(), name, amount, date, category: selectedCat, recurring: rec, paid: false });
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
  const pend   = bills.filter(b => !b.paid).sort((a, b) => new Date(a.date) - new Date(b.date));
  const overdue = pend.filter(b => getStatus(b) === 'overdue');
  const upcoming = pend.filter(b => getStatus(b) === 'pending');
  const paidInMonth = bills.filter(b => {
    const d = new Date(b.date + 'T12:00:00');
    return b.paid && d.getMonth() === curMonth && d.getFullYear() === curYear;
  });

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

  // Render preview (escaping HTML but keeping bold markers visual)
  const preview = msg
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\*(.*?)\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br>');

  $('wppContent').innerHTML = `
    <div class="wpp-preview">${preview}</div>
    <p class="wpp-tip">O WhatsApp vai abrir com a mensagem pronta — escolha o contato ou grupo.</p>
    <a class="wpp-open-btn" href="https://wa.me/?text=${enc}" target="_blank" rel="noopener">
      📱 Abrir no WhatsApp
    </a>`;

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

  // Month navigation
  $('prevMonth').addEventListener('click', () => changeMonth(-1));
  $('nextMonth').addEventListener('click', () => changeMonth(1));

  // Bottom nav
  document.querySelectorAll('.nav-btn').forEach(btn =>
    btn.addEventListener('click', () => setView(btn.dataset.view))
  );

  // FAB → open add modal
  $('fabBtn').addEventListener('click', openAdd);

  // Bill modal
  $('closeBillModal').addEventListener('click', closeBillModal);
  $('saveBtn').addEventListener('click', saveBill);
  $('billModal').addEventListener('click', e => { if (e.target === $('billModal')) closeBillModal(); });

  // WhatsApp modal
  $('wppBtn').addEventListener('click', openWpp);
  $('closeWpp').addEventListener('click', () => { $('wppModal').style.display = 'none'; });
  $('wppModal').addEventListener('click', e => { if (e.target === $('wppModal')) $('wppModal').style.display = 'none'; });

  // Export
  $('exportBtn').addEventListener('click', exportData);

  // Filter chips
  document.querySelectorAll('.fchip').forEach(chip =>
    chip.addEventListener('click', () => {
      document.querySelectorAll('.fchip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      activeFilter = chip.dataset.f;
      renderBills();
    })
  );

  // Service Worker (PWA)
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');

  // Initial render
  render();
}

document.addEventListener('DOMContentLoaded', init);
