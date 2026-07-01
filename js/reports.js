/**
 * reports.js — Dashboard, analitik, carta Chart.js
 */
const ReportsModule = (function () {
  let stockChart = null;

  function formatRM(value) {
    return `RM ${Number(value).toLocaleString('ms-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function computeMetrics(products) {
    let totalQty = 0;
    let totalCostValue = 0;
    let totalSellValue = 0;
    const uniqueSku = products.length;

    products.forEach((p) => {
      totalQty += p.quantity;
      totalCostValue += p.costPrice * p.quantity;
      totalSellValue += p.sellPrice * p.quantity;
    });

    return { uniqueSku, totalQty, totalCostValue, totalSellValue };
  }

  function getCriticalStock(products) {
    return products
      .filter((p) => p.quantity < p.minStock)
      .sort((a, b) => a.quantity - b.quantity);
  }

  function getCategoryQuantities(products) {
    const map = {};
    products.forEach((p) => {
      map[p.category] = (map[p.category] || 0) + p.quantity;
    });
    return map;
  }

  function renderSummaryCards(metrics, jobs) {
    const activeJobs = jobs.filter((j) => j.status === 'sedang_dijalankan' || j.status === 'draf').length;
    const cards = [
      { label: 'Alat Ganti (SKU)', value: metrics.uniqueSku, icon: '🔧', color: 'from-orange-500 to-orange-600' },
      { label: 'Jumlah Unit Stok', value: metrics.totalQty.toLocaleString('ms-MY'), icon: '📦', color: 'from-blue-500 to-blue-600' },
      { label: 'Nilai Kos Inventori', value: formatRM(metrics.totalCostValue), icon: '💰', color: 'from-amber-500 to-amber-600' },
      { label: 'Kerja Aktif', value: activeJobs, icon: '🏍️', color: 'from-indigo-500 to-indigo-600' },
      { label: 'Potensi Jualan Stok', value: formatRM(metrics.totalSellValue), icon: '🏷️', color: 'from-emerald-500 to-emerald-600' }
    ];

    const container = document.getElementById('dashboard-cards');
    if (!container) return;

    container.innerHTML = cards
      .map(
        (c) => `
      <div class="fade-in bg-gradient-to-br ${c.color} rounded-xl p-5 text-white shadow-lg">
        <div class="flex items-start justify-between">
          <div>
            <p class="text-white/80 text-xs font-medium uppercase tracking-wide">${c.label}</p>
            <p class="text-2xl font-bold mt-1">${c.value}</p>
          </div>
          <span class="text-2xl opacity-80">${c.icon}</span>
        </div>
      </div>`
      )
      .join('');
  }

  function renderCriticalAlerts(critical) {
    const container = document.getElementById('critical-stock-list');
    if (!container) return;

    if (!critical.length) {
      container.innerHTML = `
        <div class="flex items-center gap-2 text-emerald-600 bg-emerald-50 rounded-lg p-4">
          <span class="text-xl">✓</span>
          <p class="text-sm font-medium">Semua stok berada pada paras selamat.</p>
        </div>`;
      return;
    }

    container.innerHTML = critical
      .map(
        (p) => `
      <div class="critical-stock flex items-center justify-between bg-red-50 border border-red-200 rounded-lg px-4 py-3">
        <div>
          <p class="font-medium text-red-800 text-sm">${escapeHtml(p.name)}</p>
          <p class="text-xs text-red-600 font-mono">${escapeHtml(p.sku)} · ${escapeHtml(p.category)}</p>
        </div>
        <div class="text-right">
          <p class="text-red-600 font-bold text-lg">${p.quantity}</p>
          <p class="text-xs text-red-500">Min: ${p.minStock}</p>
        </div>
      </div>`
      )
      .join('');
  }

  function renderStockChart(categoryMap) {
    const canvas = document.getElementById('stock-chart');
    if (!canvas || typeof Chart === 'undefined') return;

    const labels = Object.keys(categoryMap);
    const data = Object.values(categoryMap);

    if (stockChart) {
      stockChart.destroy();
      stockChart = null;
    }

    if (!labels.length) {
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }

    const colors = [
      'rgba(99, 102, 241, 0.8)',
      'rgba(59, 130, 246, 0.8)',
      'rgba(16, 185, 129, 0.8)',
      'rgba(245, 158, 11, 0.8)',
      'rgba(239, 68, 68, 0.8)',
      'rgba(139, 92, 246, 0.8)',
      'rgba(236, 72, 153, 0.8)'
    ];

    stockChart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Kuantiti Stok',
            data,
            backgroundColor: labels.map((_, i) => colors[i % colors.length]),
            borderColor: labels.map((_, i) => colors[i % colors.length].replace('0.8', '1')),
            borderWidth: 1,
            borderRadius: 6
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          title: {
            display: true,
            text: 'Kuantiti Stok Mengikut Kategori',
            font: { size: 14, weight: '600' },
            color: '#334155'
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: { stepSize: 1, color: '#64748b' },
            grid: { color: '#f1f5f9' }
          },
          x: {
            ticks: { color: '#64748b', maxRotation: 45 },
            grid: { display: false }
          }
        }
      }
    });
  }

  function renderRecentActivity() {
    const container = document.getElementById('recent-activity');
    if (!container) return;

    const recent = InventoryApp.getTransactions().slice(0, 5);
    if (!recent.length) {
      container.innerHTML = '<p class="text-slate-400 text-sm">Tiada aktiviti terkini.</p>';
      return;
    }

    container.innerHTML = recent
      .map((tx) => {
        const ok = tx.status === 'Berjaya';
        const ref = tx.jobNo ? `Kerja ${tx.jobNo}` : (tx.receiptNo ? `Resit ${tx.receiptNo}` : 'Kaunter');
        return `
        <div class="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
          <div>
            <p class="text-sm font-medium text-slate-700">${escapeHtml(tx.productName)}</p>
            <p class="text-xs text-slate-400">${escapeHtml(ref)} · ${tx.quantity} unit</p>
          </div>
          <span class="text-xs font-medium ${ok ? 'text-emerald-600' : 'text-red-500'}">${ok ? formatRM(tx.totalPrice) : 'Gagal'}</span>
        </div>`;
      })
      .join('');
  }

  function renderSyncInfo() {
    const el = document.getElementById('last-sync');
    if (!el) return;
    const sync = InventoryApp.getState().settings?.lastSync;
    el.textContent = sync
      ? `Penyelarasan terakhir: ${new Date(sync).toLocaleString('ms-MY')}`
      : 'Belum diselaraskan';
  }

  function renderDashboard() {
    const products = InventoryApp.getProducts();
    const jobs = InventoryApp.getJobs();
    const metrics = computeMetrics(products);
    const critical = getCriticalStock(products);
    const categoryMap = getCategoryQuantities(products);

    renderSummaryCards(metrics, jobs);
    renderCriticalAlerts(critical);
    renderStockChart(categoryMap);
    renderRecentActivity();
    renderSyncInfo();

    const alertBadge = document.getElementById('nav-alert-badge');
    if (alertBadge) {
      if (critical.length) {
        alertBadge.textContent = critical.length;
        alertBadge.classList.remove('hidden');
      } else {
        alertBadge.classList.add('hidden');
      }
    }
  }

  return { renderDashboard };
})();

window.ReportsModule = ReportsModule;
