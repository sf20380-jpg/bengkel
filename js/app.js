/**
 * app.js — State utama, Supabase + Optimistic Update, router SPA, notifikasi
 */
const InventoryApp = (function () {
  // Inisialisasi client Supabase menggunakan pemboleh ubah global
  const supabase = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);

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

  // ---------- Mapping Data: Baris Supabase (snake_case) <-> Objek Aplikasi (camelCase) ----------

  function rowToProduct(r) {
    return {
      id: r.id,
      name: r.name,
      sku: r.sku,
      category: r.category,
      costPrice: Number(r.cost_price),
      sellPrice: Number(r.sell_price),
      quantity: Number(r.quantity),
      minStock: Number(r.min_stock),
      createdAt: r.created_at,
      updatedAt: r.updated_at
    };
  }

  function productToRow(p) {
    return {
      id: p.id,
      name: p.name,
      sku: p.sku,
      category: p.category,
      cost_price: p.costPrice,
      sell_price: p.sellPrice,
      quantity: p.quantity,
      min_stock: p.minStock,
      created_at: p.createdAt,
      updated_at: p.updatedAt
    };
  }

  function rowToJob(r) {
    return {
      id: r.id,
      jobNo: r.job_no,
      customerName: r.customer_name,
      customerPhone: r.customer_phone,
      vehicleModel: r.vehicle_model,
      vehiclePlate: r.vehicle_plate,
      serviceType: r.service_type,
      description: r.description,
      laborCharge: Number(r.labor_charge) || 0,
      items: r.items || [],
      subtotalParts: Number(r.subtotal_parts) || 0,
      totalAmount: Number(r.total_amount) || 0,
      status: r.status,
      stockDeducted: !!r.stock_deducted,
      createdAt: r.created_at,
      completedAt: r.completed_at,
      updatedAt: r.updated_at
    };
  }

  function jobToRow(j) {
    return {
      id: j.id,
      job_no: j.jobNo,
      customer_name: j.customerName,
      customer_phone: j.customerPhone,
      vehicle_model: j.vehicleModel,
      vehicle_plate: j.vehiclePlate,
      service_type: j.serviceType,
      description: j.description,
      labor_charge: j.laborCharge,
      items: j.items,
      subtotal_parts: j.subtotalParts,
      total_amount: j.totalAmount,
      status: j.status,
      stock_deducted: j.stockDeducted,
      created_at: j.createdAt,
      completed_at: j.completedAt,
      updated_at: j.updatedAt
    };
  }

  function rowToTx(r) {
    return {
      id: r.id,
      date: r.date,
      sku: r.sku,
      productName: r.product_name,
      quantity: Number(r.quantity),
      totalPrice: Number(r.total_price),
      status: r.status,
      jobNo: r.job_no,
      type: r.type,
      receiptNo: r.receipt_no || null
    };
  }

  function txToRow(t) {
    return {
      id: t.id,
      date: t.date,
      sku: t.sku,
      product_name: t.productName,
      quantity: t.quantity,
      total_price: t.totalPrice,
      status: t.status,
      job_no: t.jobNo || null,
      type: t.type || null,
      receipt_no: t.receiptNo || null
    };
  }

  // ---------- Memuatkan Data & Penyamaan (Sync) ----------

  async function loadState() {
    const [productsRes, jobsRes, txRes, settingsRes] = await Promise.all([
      supabase.from('products').select('*').order('name'),
      supabase.from('jobs').select('*').order('created_at', { ascending: false }),
      supabase.from('transactions').select('*').order('date', { ascending: false }).limit(500),
      supabase.from('settings').select('*').eq('id', 1).maybeSingle()
    ]);

    if (productsRes.error) console.error('Ralat load products:', productsRes.error);
    if (jobsRes.error) console.error('Ralat load jobs:', jobsRes.error);
    if (txRes.error) console.error('Ralat load transactions:', txRes.error);
    if (settingsRes.error) console.error('Ralat load settings:', settingsRes.error);

    state.products = (productsRes.data || []).map(rowToProduct);
    state.jobs = (jobsRes.data || []).map(rowToJob);
    state.transactions = (txRes.data || []).map(rowToTx);

    if (settingsRes.data) {
      state.categories = settingsRes.data.categories && settingsRes.data.categories.length
        ? settingsRes.data.categories
        : [...DEFAULT_CATEGORIES];
      state.settings = {
        lastSync: settingsRes.data.last_sync,
        workshopName: settingsRes.data.workshop_name || DEFAULT_SETTINGS.workshopName,
        workshopPhone: settingsRes.data.workshop_phone || DEFAULT_SETTINGS.workshopPhone,
        workshopAddress: settingsRes.data.workshop_address || DEFAULT_SETTINGS.workshopAddress
      };
    }

    if (productsRes.error || jobsRes.error || txRes.error || settingsRes.error) {
      showToast('Sebahagian data gagal dimuatkan dari Supabase. Semak konsol.', 'error');
    }
  }

  function touchSync() {
    state.settings.lastSync = new Date().toISOString();
    supabase
      .from('settings')
      .update({
        last_sync: state.settings.lastSync,
        categories: state.categories,
        workshop_name: state.settings.workshopName,
        workshop_phone: state.settings.workshopPhone,
        workshop_address: state.settings.workshopAddress
      })
      .eq('id', 1)
      .then(({ error }) => { 
        if (error) console.error('Ralat sync settings:', error); 
      });
    notify('sync');
  }

  function getState() { return state; }
  function getProducts() { return state.products; }
  function getTransactions() { return state.transactions; }
  function getCategories() { return state.categories; }
  function getJobs() { return state.jobs; }

  // ---------- Operasi CRUD: Produk (Products) ----------

  function setProducts(products) {
    state.products = products;
    touchSync();
  }

  function addProduct(product) {
    state.products.push(product);
    touchSync();
    supabase.from('products').insert(productToRow(product)).then(({ error }) => {
      if (error) {
        console.error(error);
        state.products = state.products.filter((p) => p.id !== product.id);
        showToast('Gagal simpan produk ke Supabase.', 'error');
        touchSync();
      }
    });
  }

  function updateProduct(id, updates) {
    const idx = state.products.findIndex((p) => p.id === id);
    if (idx === -1) return false;
    const previous = state.products[idx];
    const merged = { ...previous, ...updates, updatedAt: new Date().toISOString() };
    state.products[idx] = merged;
    touchSync();
    supabase.from('products').update(productToRow(merged)).eq('id', id).then(({ error }) => {
      if (error) {
        console.error(error);
        state.products[idx] = previous;
        showToast('Gagal kemas kini produk di Supabase.', 'error');
        touchSync();
      }
    });
    return true;
  }

  function deleteProduct(id) {
    const removed = state.products.find((p) => p.id === id);
    state.products = state.products.filter((p) => p.id !== id);
    touchSync();
    supabase.from('products').delete().eq('id', id).then(({ error }) => {
      if (error) {
        console.error(error);
        if (removed) state.products.push(removed);
        showToast('Gagal padam produk di Supabase.', 'error');
        touchSync();
      }
    });
  }

  // ---------- Operasi CRUD: Kerja Bengkel (Jobs) ----------

  function addJob(job) {
    state.jobs.unshift(job);
    if (state.jobs.length > 300) state.jobs = state.jobs.slice(0, 300);
    touchSync();
    supabase.from('jobs').insert(jobToRow(job)).then(({ error }) => {
      if (error) {
        console.error(error);
        state.jobs = state.jobs.filter((j) => j.id !== job.id);
        showToast('Gagal simpan kerja ke Supabase.', 'error');
        touchSync();
      }
    });
  }

  function updateJob(id, updates) {
    const idx = state.jobs.findIndex((j) => j.id === id);
    if (idx === -1) return false;
    const previous = state.jobs[idx];
    const merged = { ...previous, ...updates };
    const items = merged.items || [];
    const labor = Number(merged.laborCharge) || 0;
    merged.subtotalParts = items.reduce((s, i) => s + (i.lineTotal || 0), 0);
    merged.totalAmount = merged.subtotalParts + labor;
    merged.updatedAt = new Date().toISOString();
    
    state.jobs[idx] = merged;
    touchSync();
    supabase.from('jobs').update(jobToRow(merged)).eq('id', id).then(({ error }) => {
      if (error) {
        console.error(error);
        state.jobs[idx] = previous;
        showToast('Gagal kemas kini kerja di Supabase.', 'error');
        touchSync();
      }
    });
    return true;
  }

  function deleteJob(id) {
    const removed = state.jobs.find((j) => j.id === id);
    state.jobs = state.jobs.filter((j) => j.id !== id);
    touchSync();
    supabase.from('jobs').delete().eq('id', id).then(({ error }) => {
      if (error) {
        console.error(error);
        if (removed) state.jobs.unshift(removed);
        showToast('Gagal padam kerja di Supabase.', 'error');
        touchSync();
      }
    });
  }

  // ---------- Operasi CRUD: Transaksi Kaunter (Transactions) ----------

  function addTransaction(tx) {
    state.transactions.unshift(tx);
    if (state.transactions.length > 500) {
      state.transactions = state.transactions.slice(0, 500);
    }
    touchSync();
    supabase.from('transactions').insert(txToRow(tx)).then(({ error }) => {
      if (error) {
        console.error(error);
        state.transactions = state.transactions.filter((t) => t.id !== tx.id);
        showToast('Gagal simpan transaksi ke Supabase.', 'error');
        touchSync();
      }
    });
  }

  // ---------- Pengurusan Kategori (Categories) ----------

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
    touchSync();
    return { ok: true };
  }

  function renameCategory(oldName, newName) {
    const trimmed = (newName || '').trim();
    if (!trimmed) return { ok: false, msg: 'Nama kategori tidak boleh kosong.' };
    if (state.categories.some((c) => c.toLowerCase() === trimmed.toLowerCase() && c !== oldName)) {
      return { ok: false, msg: 'Kategori ini sudah wujud.' };
    }
    const idx = state.categories.indexOf(oldName);
    if (idx === -1) return { ok: false, msg: 'Kategori tidak dijumpai.' };
    
    state.categories[idx] = trimmed;
    state.products.forEach((p) => {
      if (p.category === oldName) p.category = trimmed;
    });
    touchSync();
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
    touchSync();
    return { ok: true };
  }

  // ---------- Penjana Logik Utiliti (Helpers) ----------

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

  // ---------- Komponen Carian Produk Picker ----------

  function isSkuUnique(sku, excludeId) {
    const normalized = sku.trim().toUpperCase();
    return !state.products.some((p) => p.sku.toUpperCase() === normalized && p.id !== excludeId);
  }

  function pickerEscapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str ?? '';
    return div.innerHTML;
  }

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

  // ---------- Pengurusan Event Listener & UI Router ----------

  function subscribe(fn) {
    listeners.push(fn);
    return () => { listeners = listeners.filter((l) => l !== fn); };
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

    // Memastikan pemanggilan modul menggunakan window.* untuk mengelakkan ralat global undefined
    switch (view) {
      case 'dashboard':
        if (window.ReportsModule) window.ReportsModule.renderDashboard();
        break;
      case 'inventory':
        if (window.InventoryModule) window.InventoryModule.render();
        break;
      case 'transactions':
        if (window.TransactionsModule) window.TransactionsModule.render();
        break;
      case 'jobs':
        if (window.JobsModule) window.JobsModule.render();
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

  // ---------- Penyediaan Data Contoh (Dummy Data) ----------

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
    const created = [];
    
    samples.forEach((s, i) => {
      const sku = `BM-${String(i + 1).padStart(3, '0')}`;
      if (!isSkuUnique(sku)) return;
      const product = {
        id: generateId('prod'),
        name: s.name,
        sku,
        category: s.category,
        costPrice: s.costPrice,
        sellPrice: s.sellPrice,
        quantity: s.quantity,
        minStock: s.minStock,
        createdAt: now,
        updatedAt: now
      };
      created.push(product);
      addProduct(product);
    });

    const p0 = created.find((p) => p.sku === 'BM-001');
    const p1 = created.find((p) => p.sku === 'BM-002');
    const p2 = created.find((p) => p.sku === 'BM-003');

    if (p0 && p1 && p2) {
      const jobItems = [
        { productId: p0.id, sku: p0.sku, name: p0.name, quantity: 1, unitPrice: p0.sellPrice, lineTotal: p0.sellPrice },
        { productId: p1.id, sku: p1.sku, name: p1.name, quantity: 1, unitPrice: p1.sellPrice, lineTotal: p1.sellPrice },
        { productId: p2.id, sku: p2.sku, name: p2.name, quantity: 1, unitPrice: p2.sellPrice, lineTotal: p2.sellPrice }
      ];
      const labor = 35;
      const sub = jobItems.reduce((s, i) => s + i.lineTotal, 0);

      addJob({
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

    showToast('Data contoh bengkel motor dimasukkan!', 'success');
    navigate(currentView);
  }

  function bindGlobalActions() {
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

  // ---------- Fungsi Permulaan (Initialization) ----------

  async function init() {
    initRouter();
    bindGlobalActions();
    
    try {
      // Tunggu data dimuatkan sepenuhnya dari Supabase
      await loadState();
    } catch (e) {
      console.error('Gagal memuat data dari Supabase:', e);
      showToast('Gagal sambung ke Supabase. Semak js/config.js.', 'error');
    }

    // Melanggan sebarang perubahan sinkronisasi masa hadapan
    subscribe((event) => {
      if (event === 'sync' && currentView === 'dashboard' && window.ReportsModule) {
        window.ReportsModule.renderDashboard();
      }
    });

    // HALAMAN UTAMA: Paparkan dashboard dan panggil fungsi render pertamanya serta-merta
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
    addCategory,
    renameCategory,
    deleteCategory,
    subscribe,
    navigate,
    showToast
  };
})();
