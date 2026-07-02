/**
 * product-report.js — Laporan Produk: paling laris, revenue tertinggi, prestasi kategori
 */
const ProductReportModule = (function () {
  let categoryChart = null;
  let currentRange = 'this_month';
  let activeRequest = null;

  function formatRM(value) {
    return `RM ${Number(value).toLocaleString('ms-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str ?? '';
    return div.innerHTML;
  }

  function getRangeBounds(rangeKey) {
    const now = new Date();
    let start = null;
    let end = null;

    switch (rangeKey) {
      case 'this_month':
        start = new Date(now.getFullYear(), now.getMonth(), 1);
        end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        break;
      case 'last_month':
        start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        end = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case 'last_3_months':
        start = new Date(now.getFullYear(), now.getMonth() - 2, 1);
        end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        break;
      case 'this_year':
        start = new Date(now.getFullYear(), 0, 1);
        end = new Date(now.getFullYear() + 1, 0, 1);
        break;
      default:
        start = null;
        end = null;
    }

    return { start, end };
  }

  function getRangeLabel(rangeKey) {
    const labels = {
      this_month: 'Bulan Ini',
      last_month: 'Bulan Lepas',
      last_3_months: '3 Bulan Terakhir',
      this_year: 'Tahun Ini',
      all: 'Semua Masa'
    };
    return labels[rangeKey] || rangeKey;
  }

  function getRangeIso(rangeKey) {
    const { start, end } = getRangeBounds(rangeKey);
    return {
      startIso: start ? start.toISOString() : null,
      endIso: end ? end.toISOString() : null
    };
  }

  async function getFilteredTransactions(rangeKey) {
    const { startIso, endIso } = getRangeIso(rangeKey);
    return InventoryApp.queryTransactions(startIso, endIso);
  }

  function aggregateByProduct(transactions) {
    const map = new Map();
    transactions.forEach((t) => {
      const key = t.sku;
      if (!map.has(key)) {
        map.set(key, { sku: t.sku, name: t.productName, quantity: 0, revenue: 0 });
      }
      const entry = map.get(key);
      entry.quantity += t.quantity;
      entry.revenue += t.totalPrice;
    });
    return Array.from(map.values());
  }

  function aggregateByCategory(transactions) {
    const products = InventoryApp.getProducts();
    const skuToCategory = new Map(products.map((p) => [p.sku, p.category]));
    const map = new Map();

    transactions.forEach((t) => {
      const category = skuToCategory.get(t.sku) || 'Tidak Diketahui';
      if (!map.has(category)) {
        map.set(category, { category, quantity: 0, revenue: 0 });
      }
      const entry = map.get(category);
      entry.quantity += t.quantity;
      entry.revenue += t.totalPrice;
    });

    return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue);
  }

  function renderTopList(containerId, items, valueKey, valueFormatter, emptyMsg) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (!items.length) {
      container.innerHTML = `<p class="text-sm text-slate-400 text-center py-6">${emptyMsg}</p>`;
      return;
    }

    container.innerHTML = items
      .slice(0, 10)
      .map(
        (item, idx) => `
      <div class="flex items-center justify-between gap-3 py-2 ${idx !== 0 ? 'border-t border-slate-100' : ''}">
        <div class="flex items-center gap-3 min-w-0">
          <span class="w-6 h-6 shrink-0 rounded-full bg-slate-100 text-slate-500 text-xs font-bold flex items-center justify-center">${idx + 1}</span>
          <div class="min-w-0">
            <p class="text-sm font-medium text-slate-700 truncate">${escapeHtml(item.name)}</p>
            <p class="text-xs text-slate-400 font-mono">${escapeHtml(item.sku)}</p>
          </div>
        </div>
        <span class="text-sm font-semibold text-slate-800 shrink-0">${valueFormatter(item[valueKey])}</span>
      </div>`
      )
      .join('');
  }

  function renderCategoryTable(categoryData) {
    const container = document.getElementById('report-category-table');
    if (!container) return;

    if (!categoryData.length) {
      container.innerHTML = `<p class="text-sm text-slate-400 text-center py-6">Tiada data untuk tempoh ini.</p>`;
      return;
    }

    const totalRevenue = categoryData.reduce((s, c) => s + c.revenue, 0);

    container.innerHTML = `
      <table class="w-full text-sm">
        <thead class="text-xs text-slate-400 uppercase">
          <tr>
            <th class="text-left py-2">Kategori</th>
            <th class="text-right py-2">Kuantiti</th>
            <th class="text-right py-2">Jualan (RM)</th>
            <th class="text-right py-2">% Jualan</th>
          </tr>
        </thead>
        <tbody>
          ${categoryData
            .map(
              (c) => `
            <tr class="border-t border-slate-100">
              <td class="py-2 text-slate-700">${escapeHtml(c.category)}</td>
              <td class="py-2 text-right text-slate-600">${c.quantity}</td>
              <td class="py-2 text-right font-medium text-slate-800">${formatRM(c.revenue)}</td>
              <td class="py-2 text-right text-slate-500">${totalRevenue ? ((c.revenue / totalRevenue) * 100).toFixed(1) : '0.0'}%</td>
            </tr>`
            )
            .join('')}
        </tbody>
      </table>`;
  }

  function renderCategoryChart(categoryData) {
    const canvas = document.getElementById('report-category-chart');
    if (!canvas || typeof Chart === 'undefined') return;

    if (categoryChart) {
      categoryChart.destroy();
      categoryChart = null;
    }

    if (!categoryData.length) return;

    const colors = [
      'rgba(99, 102, 241, 0.8)',
      'rgba(16, 185, 129, 0.8)',
      'rgba(245, 158, 11, 0.8)',
      'rgba(239, 68, 68, 0.8)',
      'rgba(59, 130, 246, 0.8)',
      'rgba(139, 92, 246, 0.8)',
      'rgba(236, 72, 153, 0.8)'
    ];

    categoryChart = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels: categoryData.map((c) => c.category),
        datasets: [
          {
            data: categoryData.map((c) => c.revenue),
            backgroundColor: categoryData.map((_, i) => colors[i % colors.length]),
            borderWidth: 1
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'right', labels: { boxWidth: 12, font: { size: 11 }, color: '#475569' } }
        }
      }
    });
  }

  function renderSummary(transactions) {
    const el = document.getElementById('report-summary');
    if (!el) return;
    const totalRevenue = transactions.reduce((s, t) => s + t.totalPrice, 0);
    const totalQty = transactions.reduce((s, t) => s + t.quantity, 0);
    const uniqueProducts = new Set(transactions.map((t) => t.sku)).size;

    el.innerHTML = `
      <div class="grid grid-cols-3 gap-3">
        <div class="bg-emerald-50 rounded-lg p-3 text-center">
          <p class="text-xs text-emerald-600 font-medium">Jumlah Jualan</p>
          <p class="text-lg font-bold text-emerald-700">${formatRM(totalRevenue)}</p>
        </div>
        <div class="bg-indigo-50 rounded-lg p-3 text-center">
          <p class="text-xs text-indigo-600 font-medium">Unit Terjual</p>
          <p class="text-lg font-bold text-indigo-700">${totalQty}</p>
        </div>
        <div class="bg-amber-50 rounded-lg p-3 text-center">
          <p class="text-xs text-amber-600 font-medium">Produk Terlibat</p>
          <p class="text-lg font-bold text-amber-700">${uniqueProducts}</p>
        </div>
      </div>`;
  }

  function showLoading() {
    const loadingHtml = `<p class="text-sm text-slate-400 text-center py-6">Memuatkan data…</p>`;
    const summaryEl = document.getElementById('report-summary');
    if (summaryEl) summaryEl.innerHTML = loadingHtml;
    const qtyEl = document.getElementById('report-top-qty');
    if (qtyEl) qtyEl.innerHTML = loadingHtml;
    const revEl = document.getElementById('report-top-revenue');
    if (revEl) revEl.innerHTML = loadingHtml;
    const catEl = document.getElementById('report-category-table');
    if (catEl) catEl.innerHTML = loadingHtml;
  }

  async function renderAll() {
    const rangeLabelEl = document.getElementById('report-range-label');
    if (rangeLabelEl) rangeLabelEl.textContent = getRangeLabel(currentRange);

    showLoading();
    const requestToken = Symbol('report-request');
    activeRequest = requestToken;

    const transactions = await getFilteredTransactions(currentRange);

    // Kalau user dah tukar filter semasa fetch masih berjalan, buang hasil lapuk ni.
    if (activeRequest !== requestToken) return;

    const byProduct = aggregateByProduct(transactions);
    const byCategory = aggregateByCategory(transactions);

    renderSummary(transactions);
    renderTopList(
      'report-top-qty',
      [...byProduct].sort((a, b) => b.quantity - a.quantity),
      'quantity',
      (v) => `${v} unit`,
      'Tiada jualan dalam tempoh ini.'
    );
    renderTopList(
      'report-top-revenue',
      [...byProduct].sort((a, b) => b.revenue - a.revenue),
      'revenue',
      formatRM,
      'Tiada jualan dalam tempoh ini.'
    );
    renderCategoryTable(byCategory);
    renderCategoryChart(byCategory);
  }

  function openModal() {
    const modal = document.getElementById('product-report-modal');
    if (!modal) return;
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    renderAll();
  }

  function closeModal() {
    const modal = document.getElementById('product-report-modal');
    if (modal) {
      modal.classList.add('hidden');
      modal.classList.remove('flex');
    }
  }

  function bindEvents() {
    document.getElementById('btn-open-product-report')?.addEventListener('click', openModal);
    document.getElementById('btn-close-product-report')?.addEventListener('click', closeModal);
    document.getElementById('product-report-modal')?.addEventListener('click', (e) => {
      if (e.target.id === 'product-report-modal') closeModal();
    });
    document.getElementById('report-range-select')?.addEventListener('change', (e) => {
      currentRange = e.target.value;
      renderAll();
    });
  }

  function init() {
    bindEvents();
  }

  document.addEventListener('DOMContentLoaded', init);

  return { openModal };
})();

window.ProductReportModule = ProductReportModule;
