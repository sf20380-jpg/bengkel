/**
 * app.js — State utama, LocalStorage, router SPA, notifikasi
 */
const InventoryApp = (function () {
  const STORAGE_KEY = 'bengkel_motor_inventory_v2';
  const VERSION = 2;

  const DEFAULT_CATEGORIES = [
    'Minyak & Pelincir',
    'Penapis (Filter)',
    'Breks & Kopling',
    'Tayar & Tiub',
    'Bateri & Elektrik',
    'Rantai & Gear',
    'Bolt & Skru',
    'Alat Ganti Enjin',
    'Aksesori & Lain-lain'
  ];

  const DEFAULT_SETTINGS = {
    lastSync: null,
    workshopName: 'Bengkel Motor Pro',
    workshopPhone: '012-345 6789',
    workshopAddress: 'No. 1, Jalan Kilang, 43000 Kajang, Selangor'
  };

  let state = {
    products: [],
    transactions: [],
    jobs: [],
    categories: [...DEFAULT_CATEGORIES],
    settings: { ...DEFAULT_SETTINGS }
  };

  let currentView = 'dashboard';
  let listeners = [];

  function loadState() {
    try {
      let raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        const legacy = localStorage.getItem('enterprise_inventory_v1');
        if (legacy) {
          localStorage.setItem(STORAGE_KEY, legacy);
          raw = legacy;
        } else {
          persist();
          return;
        }
      }
      const parsed = JSON.parse(raw);
      if (parsed) {
        state.products = Array.isArray(parsed.products) ? parsed.products : [];
        state.transactions = Array.isArray(parsed.transactions) ? parsed.transactions : [];
        state.jobs = Array.isArray(parsed.jobs) ? parsed.jobs : [];
        state.categories = Array.isArray(parsed.categories) && parsed.categories.length
          ? parsed.categories
          : [...DEFAULT_CATEGORIES];
        state.settings = { ...DEFAULT_SETTINGS, ...(parsed.settings || {}) };
        if (!parsed.jobs && parsed.version === 1) {
          persist();
        }
      }
    } catch (e) {
      console.error('Gagal memuat data:', e);
      resetState();
    }
  }

  function resetState() {
    state = {
      products: [],
      transactions: [],
      jobs: [],
      categories: [...DEFAULT_CATEGORIES],
      settings: { ...DEFAULT_SETTINGS }
    };
  }

  function persist() {
    state.settings.lastSync = new Date().toISOString();
    const payload = {
      version: VERSION,
      products: state.products,
      transactions: state.transactions,
      jobs: state.jobs,
      categories: state.categories,
      settings: state.settings
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      notify('sync');
    } catch (e) {
      showToast('Ralat: Tidak dapat menyimpan data. Storan penuh?', 'error');
      console.error(e);
    }
  }

  function getState() {
    return state;
  }

  function getProducts() {
    return state.products;
  }

  function getTransactions() {
    return state.transactions;
  }

  function getCategories() {
    return state.categories;
  }

  function getJobs() {
    return state.jobs;
  }

  function addJob(job) {
    state.jobs.unshift(job);
    if (state.jobs.length > 300) state.jobs = state.jobs.slice(0, 300);
    persist();
  }

  function updateJob(id, updates) {
    const idx = state.jobs.findIndex((j) => j.id === id);
    if (idx === -1) return false;
    const merged = { ...state.jobs[idx], ...updates };
    const items = merged.items || [];
    const labor = Number(merged.laborCharge) || 0;
    merged.subtotalParts = items.reduce((s, i) => s + (i.lineTotal || 0), 0);
    merged.totalAmount = merged.subtotalParts + labor;
    merged.updatedAt = new Date().toISOString();
    state.jobs[idx] = merged;
    persist();
    return true;
  }

  function deleteJob(id) {
    state.jobs = state.jobs.filter((j) => j.id !== id);
    persist();
  }

  function generateJobNo() {
    const d = new Date();
    const dateStr = d.toISOString().slice(0, 10).replace(/-/g, '');
    const todayJobs = state.jobs.filter((j) => j.jobNo && j.jobNo.includes(dateStr));
    const seq = String(todayJobs.length + 1).padStart(3, '0');
    return `JOB-${dateStr}-${seq}`;
  }

  function generateReceiptNo() {
    const d = new Date();
    const dateStr = d.toISOString().slice(0, 10).replace(/-/g, '');
    const todayReceipts = new Set(
      state.transactions
        .filter((t) => t.receiptNo && t.receiptNo.includes(dateStr))
        .map((t) => t.receiptNo)
    );
    const seq = String(todayReceipts.size + 1).padStart(3, '0');
    return `RCT-${dateStr}-${seq}`;
  }

  function setProducts(products) {
    state.products = products;
    persist();
  }

  function addProduct(product) {
    state.products.push(product);
    persist();
  }

  function updateProduct(id, updates) {
    const idx = state.products.findIndex((p) => p.id === id);
    if (idx === -1) return false;
    state.products[idx] = { ...state.products[idx], ...updates, updatedAt: new Date().toISOString() };
    persist();
    return true;
  }

  function deleteProduct(id) {
    state.products = state.products.filter((p) => p.id !== id);
    persist();
  }

  function addTransaction(tx) {
    state.transactions.unshift(tx);
    if (state.transactions.length > 500) {
      state.transactions = state.transactions.slice(0, 500);
    }
    persist();
  }

  function generateId(prefix) {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }

  function generateSku() {
    const num = String(state.products.length + 1).padStart(4, '0');
    let sku = `SKU-${num}`;
    let counter = 1;
    while (state.products.some((p) => p.sku.toUpperCase() === sku.toUpperCase())) {
      sku = `SKU-${String(state.products.length + counter).padStart(4, '0')}`;
      counter++;
    }
    return sku;
  }

  function pickerEscapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str ?? '';
    return div.innerHTML;
  }

  /**
   * initProductPicker — komponen carian produk boleh guna semula (kaunter & kerja bengkel)
   * opts: { searchInputId, hiddenInputId, dropdownId, filterFn(product), onSelect(product) }
   */
  function initProductPicker(opts) {
    const searchInput = document.getElementById(opts.searchInputId);
    const hiddenInput = document.getElementById(opts.hiddenInputId);
    const dropdown = document.getElementById(opts.dropdownId);
    if (!searchInput || !hiddenInput || !dropdown) return;

    function getFiltered(query) {
      let products = [...state.products];
      if (opts.filterFn) products = products.filter(opts.filterFn);
      const q = (query || '').trim().toLowerCase();
      if (q) {
        products = products.filter(
          (p) =>
            p.name.toLowerCase().includes(q) ||
            p.sku.toLowerCase().includes(q) ||
            p.category.toLowerCase().includes(q)
        );
      }
      return products.slice(0, 30);
    }

    function renderList(query) {
      const products = getFiltered(query);
      if (!products.length) {
        dropdown.innerHTML = `<div class="px-4 py-3 text-sm text-slate-400">Tiada produk dijumpai.</div>`;
      } else {
        dropdown.innerHTML = products
          .map(
            (p) => `
          <button type="button" data-pick-product="${p.id}" class="w-full text-left px-4 py-2 hover:bg-orange-50 flex items-center justify-between gap-3 border-b border-slate-50 last:border-0">
            <span class="min-w-0">
              <span class="block text-sm font-medium text-slate-700 truncate">${pickerEscapeHtml(p.name)}</span>
              <span class="block text-xs text-slate-400 font-mono">${pickerEscapeHtml(p.sku)} · ${pickerEscapeHtml(p.category)}</span>
            </span>
            <span class="text-xs text-right shrink-0">
              <span class="block font-semibold text-emerald-600">RM ${Number(p.sellPrice).toFixed(2)}</span>
              <span class="block text-slate-400">Stok: ${p.quantity}</span>
            </span>
          </button>`
          )
          .join('');
      }
      dropdown.classList.remove('hidden');

      dropdown.querySelectorAll('[data-pick-product]').forEach((btn) => {
        btn.addEventListener('mousedown', (e) => {
          e.preventDefault();
          const product = state.products.find((p) => p.id === btn.dataset.pickProduct);
          if (!product) return;
          hiddenInput.value = product.id;
          searchInput.value = `${product.sku} — ${product.name}`;
          dropdown.classList.add('hidden');
          if (opts.onSelect) opts.onSelect(product);
        });
      });
    }

    searchInput.addEventListener('focus', () => {
      renderList(hiddenInput.value ? '' : searchInput.value);
    });

    searchInput.addEventListener('input', () => {
      hiddenInput.value = '';
      renderList(searchInput.value);
    });

    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') dropdown.classList.add('hidden');
    });

    document.addEventListener('click', (e) => {
      if (!searchInput.contains(e.target) && !dropdown.contains(e.target)) {
        dropdown.classList.add('hidden');
      }
    });

    return {
      reset: () => {
        hiddenInput.value = '';
        searchInput.value = '';
        dropdown.classList.add('hidden');
      }
    };
  }

  function isSkuUnique(sku, excludeId) {
    const normalized = sku.trim().toUpperCase();
    return !state.products.some(
      (p) => p.sku.toUpperCase() === normalized && p.id !== excludeId
    );
  }

  function categoryUsageCount(name) {
    return state.products.filter((p) => p.category === name).length;
  }

  function addCategory(name) {
    const trimmed = (name || '').trim();
    if (!trimmed) return { ok: false, msg: 'Nama kategori tidak boleh kosong.' };
    if (state.categories.some((c) => c.toLowerCase() === trimmed.toLowerCase())) {
      return { ok: false, msg: 'Kategori ini sudah wujud.' };
    }
    state.categories.push(trimmed);
    persist();
    return { ok: true };
  }

  function renameCategory(oldName, newName) {
    const trimmed = (newName || '').trim();
    if (!trimmed) return { ok: false, msg: 'Nama kategori tidak boleh kosong.' };
    if (
      state.categories.some(
        (c) => c.toLowerCase() === trimmed.toLowerCase() && c !== oldName
      )
    ) {
      return { ok: false, msg: 'Kategori ini sudah wujud.' };
    }
    const idx = state.categories.indexOf(oldName);
    if (idx === -1) return { ok: false, msg: 'Kategori tidak dijumpai.' };
    state.categories[idx] = trimmed;
    state.products.forEach((p) => {
      if (p.category === oldName) p.category = trimmed;
    });
    persist();
    return { ok: true };
  }

  function deleteCategory(name, reassignTo) {
    if (state.categories.length <= 1) {
      return { ok: false, msg: 'Mesti ada sekurang-kurangnya satu kategori.' };
    }
    const usage = categoryUsageCount(name);
    if (usage && !reassignTo) {
      return {
        ok: false,
        msg: `Kategori ini digunakan oleh ${usage} produk. Pilih kategori gantian dahulu.`,
        inUseCount: usage
      };
    }
    if (usage && reassignTo) {
      state.products.forEach((p) => {
        if (p.category === name) p.category = reassignTo;
      });
    }
    state.categories = state.categories.filter((c) => c !== name);
    persist();
    return { ok: true };
  }

  function subscribe(fn) {
    listeners.push(fn);
    return () => {
      listeners = listeners.filter((l) => l !== fn);
    };
  }

  function notify(event) {
    listeners.forEach((fn) => fn(event, state));
  }

  function showToast(message, type) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const colors = {
      success: 'bg-emerald-600',
      error: 'bg-red-600',
      warning: 'bg-amber-500',
      info: 'bg-slate-700'
    };

    const el = document.createElement('div');
    el.className = `fade-in ${colors[type] || colors.info} text-white px-4 py-3 rounded-lg shadow-lg text-sm font-medium max-w-sm`;
    el.textContent = message;
    container.appendChild(el);

    setTimeout(() => {
      el.style.opacity = '0';
      el.style.transition = 'opacity 0.3s';
      setTimeout(() => el.remove(), 300);
    }, 3500);
  }

  function navigate(view) {
    currentView = view;
    document.querySelectorAll('[data-view]').forEach((section) => {
      section.classList.toggle('hidden', section.dataset.view !== view);
    });
    document.querySelectorAll('[data-nav]').forEach((btn) => {
      const active = btn.dataset.nav === view;
      btn.classList.toggle('bg-orange-600', active);
      btn.classList.toggle('text-white', active);
      btn.classList.toggle('text-slate-300', !active);
      btn.classList.toggle('hover:bg-slate-700', !active);
    });
    document.getElementById('page-title').textContent = getPageTitle(view);

    switch (view) {
      case 'dashboard':
        if (window.ReportsModule) ReportsModule.renderDashboard();
        break;
      case 'inventory':
        if (window.InventoryModule) InventoryModule.render();
        break;
      case 'transactions':
        if (window.TransactionsModule) TransactionsModule.render();
        break;
      case 'jobs':
        if (window.JobsModule) JobsModule.render();
        break;
    }
  }

  function getPageTitle(view) {
    const titles = {
      dashboard: 'Dashboard Bengkel',
      inventory: 'Inventori Alat Ganti',
      jobs: 'Kerja & Invois',
      transactions: 'Jualan Kaunter'
    };
    return titles[view] || 'Bengkel Motor';
  }

  function closeSidebar() {
    document.getElementById('sidebar')?.classList.add('-translate-x-full');
    document.getElementById('sidebar-overlay')?.classList.add('hidden');
  }

  function openSidebar() {
    document.getElementById('sidebar')?.classList.remove('-translate-x-full');
    document.getElementById('sidebar-overlay')?.classList.remove('hidden');
  }

  function initRouter() {
    document.querySelectorAll('[data-nav]').forEach((btn) => {
      btn.addEventListener('click', () => {
        navigate(btn.dataset.nav);
        closeSidebar();
      });
    });
    document.getElementById('btn-menu')?.addEventListener('click', openSidebar);
    document.getElementById('sidebar-overlay')?.addEventListener('click', closeSidebar);
  }

  function generateDummyData() {
    const samples = [
      { name: 'Minyak Enjin 4T SAE 10W-40 (1L)', category: 'Minyak & Pelincir', costPrice: 18, sellPrice: 32, quantity: 24, minStock: 6 },
      { name: 'Penapis Minyak Honda Wave', category: 'Penapis (Filter)', costPrice: 8, sellPrice: 18, quantity: 15, minStock: 5 },
      { name: 'Pad Brek Depan Wave 125', category: 'Breks & Kopling', costPrice: 22, sellPrice: 45, quantity: 8, minStock: 4 },
      { name: 'Tayar Belakang 90/90-14', category: 'Tayar & Tiub', costPrice: 65, sellPrice: 110, quantity: 6, minStock: 2 },
      { name: 'Bateri YTX5L-BS', category: 'Bateri & Elektrik', costPrice: 55, sellPrice: 95, quantity: 4, minStock: 2 },
      { name: 'Rantai 428H-118L', category: 'Rantai & Gear', costPrice: 35, sellPrice: 65, quantity: 5, minStock: 2 },
      { name: 'Coolant Radiator (500ml)', category: 'Minyak & Pelincir', costPrice: 12, sellPrice: 22, quantity: 10, minStock: 3 },
      { name: 'Plug NGK CR8E', category: 'Alat Ganti Enjin', costPrice: 6, sellPrice: 14, quantity: 20, minStock: 8 },
      { name: 'Minyak Brek DOT 3 (300ml)', category: 'Breks & Kopling', costPrice: 9, sellPrice: 18, quantity: 12, minStock: 4 },
      { name: 'Bolt Set Cover Enjin M6', category: 'Bolt & Skru', costPrice: 5, sellPrice: 12, quantity: 30, minStock: 10 }
    ];

    const now = new Date().toISOString();
    const productIds = [];
    samples.forEach((s, i) => {
      const sku = `BM-${String(i + 1).padStart(3, '0')}`;
      if (!isSkuUnique(sku)) return;
      const id = generateId('prod');
      productIds.push(id);
      state.products.push({
        id,
        name: s.name,
        sku,
        category: s.category,
        costPrice: s.costPrice,
        sellPrice: s.sellPrice,
        quantity: s.quantity,
        minStock: s.minStock,
        createdAt: now,
        updatedAt: now
      });
    });

    const p0 = state.products.find((p) => p.sku === 'BM-001');
    const p1 = state.products.find((p) => p.sku === 'BM-002');
    const p2 = state.products.find((p) => p.sku === 'BM-003');

    if (p0 && p1 && p2) {
      const jobItems = [
        { productId: p0.id, sku: p0.sku, name: p0.name, quantity: 1, unitPrice: p0.sellPrice, lineTotal: p0.sellPrice },
        { productId: p1.id, sku: p1.sku, name: p1.name, quantity: 1, unitPrice: p1.sellPrice, lineTotal: p1.sellPrice },
        { productId: p2.id, sku: p2.sku, name: p2.name, quantity: 1, unitPrice: p2.sellPrice, lineTotal: p2.sellPrice }
      ];
      const labor = 35;
      const sub = jobItems.reduce((s, i) => s + i.lineTotal, 0);
      state.jobs.push({
        id: generateId('job'),
        jobNo: generateJobNo(),
        customerName: 'Ahmad bin Hassan',
        customerPhone: '012-111 2233',
        vehicleModel: 'Honda Wave 125',
        vehiclePlate: 'BKA 1234',
        serviceType: 'Servis Berkala',
        description: 'Servis 5000km — tukar minyak, penapis & semak brek',
        laborCharge: labor,
        items: jobItems,
        subtotalParts: sub,
        totalAmount: sub + labor,
        status: 'sedang_dijalankan',
        stockDeducted: false,
        createdAt: now,
        completedAt: null,
        updatedAt: now
      });
    }

    persist();
    showToast('Data contoh bengkel motor dimasukkan!', 'success');
    navigate(currentView);
  }

  function exportInventoryCSV() {
    const products = state.products;
    if (!products.length) {
      showToast('Tiada produk untuk dieksport.', 'warning');
      return;
    }

    const headers = ['ID', 'SKU', 'Nama Produk', 'Kategori', 'Harga Kos (RM)', 'Harga Jual (RM)', 'Kuantiti', 'Min Stok', 'Nilai Kos (RM)', 'Nilai Jualan (RM)'];
    const rows = products.map((p) => [
      p.id,
      p.sku,
      `"${p.name.replace(/"/g, '""')}"`,
      p.category,
      p.costPrice.toFixed(2),
      p.sellPrice.toFixed(2),
      p.quantity,
      p.minStock,
      (p.costPrice * p.quantity).toFixed(2),
      (p.sellPrice * p.quantity).toFixed(2)
    ]);

    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `inventori_bengkel_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Fail CSV berjaya dimuat turun.', 'success');
  }

  function bindGlobalActions() {
    document.getElementById('btn-export-csv')?.addEventListener('click', exportInventoryCSV);

    let dummyClickCount = 0;
    document.getElementById('btn-dummy-secret')?.addEventListener('click', () => {
      dummyClickCount++;
      if (dummyClickCount >= 3) {
        dummyClickCount = 0;
        if (confirm('Masukkan 10 data contoh ke sistem? Data sedia ada tidak akan dipadam.')) {
          generateDummyData();
        }
      }
    });

    document.getElementById('btn-dummy-visible')?.addEventListener('click', () => {
      if (confirm('Masukkan 10 data contoh ke sistem?')) {
        generateDummyData();
      }
    });
  }

  function init() {
    loadState();
    initRouter();
    bindGlobalActions();
    subscribe((event) => {
      if (event === 'sync' && currentView === 'dashboard' && window.ReportsModule) {
        ReportsModule.renderDashboard();
      }
    });
    navigate('dashboard');
  }

  return {
    init,
    getState,
    getProducts,
    getTransactions,
    getJobs,
    getCategories,
    setProducts,
    addProduct,
    updateProduct,
    deleteProduct,
    addJob,
    updateJob,
    deleteJob,
    addTransaction,
    generateId,
    generateSku,
    generateJobNo,
    generateReceiptNo,
    initProductPicker,
    isSkuUnique,
    categoryUsageCount,
    addCategory,
    renameCategory,
    deleteCategory,
    showToast,
    navigate,
    subscribe,
    persist,
    exportInventoryCSV,
    DEFAULT_CATEGORIES
  };
})();

document.addEventListener('DOMContentLoaded', () => InventoryApp.init());
