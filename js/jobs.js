/**
 * jobs.js — Kerja bengkel, invois, tolak stok bila job selesai
 */
const JobsModule = (function () {
  const SERVICE_TYPES = [
    'Servis Berkala',
    'Servis Penuh (Major)',
    'Tukar Minyak Enjin',
    'Breks Depan/Belakang',
    'Tayar & Alignment',
    'Elektrik & Bateri',
    'Overhaul Enjin',
    'Pembaikan Kerosakan',
    'Lain-lain'
  ];

  let editingJobId = null;
  let draftItems = [];
  let filterStatus = '';
  let jobProductPicker = null;
  let currentPage = 1;
  const PAGE_SIZE = 15;
  let jobRange = 'last_3_months';
  let jobsCache = [];
  let activeJobsRequest = null;

  function formatRM(value) {
    return `RM ${Number(value).toLocaleString('ms-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str ?? '';
    return div.innerHTML;
  }

  function formatDateTime(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleString('ms-MY', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  }

  function statusBadge(status) {
    const map = {
      draf: 'bg-slate-100 text-slate-600',
      sedang_dijalankan: 'bg-amber-100 text-amber-800',
      selesai: 'bg-emerald-100 text-emerald-700',
      dibatalkan: 'bg-red-100 text-red-600'
    };
    const labels = {
      draf: 'Draf',
      sedang_dijalankan: 'Sedang Dijalankan',
      selesai: 'Selesai',
      dibatalkan: 'Dibatalkan'
    };
    return `<span class="px-2 py-0.5 rounded-full text-xs font-medium ${map[status] || map.draf}">${labels[status] || status}</span>`;
  }

  function calcJobTotals(items, laborCharge) {
    const subtotalParts = items.reduce((s, i) => s + i.lineTotal, 0);
    const labor = Number(laborCharge) || 0;
    return { subtotalParts, laborCharge: labor, totalAmount: subtotalParts + labor };
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

    return {
      startIso: start ? start.toISOString() : null,
      endIso: end ? end.toISOString() : null
    };
  }

  function showJobsLoading() {
    const tbody = document.getElementById('jobs-tbody');
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="7" class="px-4 py-12 text-center text-slate-400">Memuatkan data…</td></tr>`;
    }
    const pagination = document.getElementById('jobs-pagination');
    if (pagination) pagination.innerHTML = '';
  }

  async function fetchAndRenderJobs() {
    showJobsLoading();
    const requestToken = Symbol('jobs-request');
    activeJobsRequest = requestToken;

    const { startIso, endIso } = getRangeBounds(jobRange);
    const jobs = await InventoryApp.queryJobs(startIso, endIso);

    if (activeJobsRequest !== requestToken) return; // filter dah tukar sementara fetch berjalan

    InventoryApp.mergeJobs(jobs); // supaya edit/selesai/padam kekal berfungsi untuk job yang dipaparkan
    jobsCache = jobs;
    currentPage = 1;
    renderJobsList();
  }

  function renderJobsList() {
    const tbody = document.getElementById('jobs-tbody');
    const countEl = document.getElementById('jobs-count');
    if (!tbody) return;

    let jobs = [...jobsCache];
    if (filterStatus) jobs = jobs.filter((j) => j.status === filterStatus);

    jobs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    if (countEl) countEl.textContent = `${jobs.length} kerja`;

    if (!jobs.length) {
      tbody.innerHTML = `<tr><td colspan="7" class="px-4 py-12 text-center text-slate-400">Tiada rekod kerja. Klik "Kerja Baharu" untuk mula.</td></tr>`;
      renderJobsPagination(0, 1);
      return;
    }

    const totalPages = Math.max(1, Math.ceil(jobs.length / PAGE_SIZE));
    if (currentPage > totalPages) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;

    const startIdx = (currentPage - 1) * PAGE_SIZE;
    const pageJobs = jobs.slice(startIdx, startIdx + PAGE_SIZE);

    tbody.innerHTML = pageJobs.map((j) => `
      <tr class="table-row-hover border-b border-slate-100">
        <td class="px-4 py-3 font-mono text-xs font-semibold text-orange-600">${escapeHtml(j.jobNo)}</td>
        <td class="px-4 py-3">
          <p class="font-medium text-slate-800">${escapeHtml(j.customerName)}</p>
          <p class="text-xs text-slate-400">${escapeHtml(j.vehiclePlate)} · ${escapeHtml(j.vehicleModel)}</p>
        </td>
        <td class="px-4 py-3 text-sm text-slate-600">${escapeHtml(j.serviceType)}</td>
        <td class="px-4 py-3 text-center text-sm">${j.items.length} item</td>
        <td class="px-4 py-3 text-right font-semibold text-slate-800">${formatRM(j.totalAmount)}</td>
        <td class="px-4 py-3 text-center">${statusBadge(j.status)}</td>
        <td class="px-4 py-3 text-center whitespace-nowrap">
          <button data-view-invoice="${j.id}" class="text-orange-600 hover:text-orange-800 text-xs font-medium mr-2">Invois</button>
          ${j.status !== 'selesai' && j.status !== 'dibatalkan' ? `
            <button data-edit-job="${j.id}" class="text-indigo-600 hover:text-indigo-800 text-xs font-medium mr-2">Edit</button>
            <button data-complete-job="${j.id}" class="text-emerald-600 hover:text-emerald-800 text-xs font-medium">Selesai</button>
          ` : ''}
          ${j.status === 'draf' ? `<button data-delete-job="${j.id}" class="text-red-500 hover:text-red-700 text-xs font-medium ml-2">Padam</button>` : ''}
        </td>
      </tr>`).join('');

    tbody.querySelectorAll('[data-view-invoice]').forEach((b) =>
      b.addEventListener('click', () => openInvoice(b.dataset.viewInvoice))
    );
    tbody.querySelectorAll('[data-edit-job]').forEach((b) =>
      b.addEventListener('click', () => openJobModal(b.dataset.editJob))
    );
    tbody.querySelectorAll('[data-complete-job]').forEach((b) =>
      b.addEventListener('click', () => completeJob(b.dataset.completeJob))
    );
    tbody.querySelectorAll('[data-delete-job]').forEach((b) =>
      b.addEventListener('click', () => deleteJob(b.dataset.deleteJob))
    );

    renderJobsPagination(jobs.length, totalPages);
  }

  function renderJobsPagination(totalItems, totalPages) {
    const container = document.getElementById('jobs-pagination');
    if (!container) return;

    if (!totalItems) {
      container.innerHTML = '';
      return;
    }

    const startIdx = (currentPage - 1) * PAGE_SIZE + 1;
    const endIdx = Math.min(currentPage * PAGE_SIZE, totalItems);

    container.innerHTML = `
      <span class="text-slate-400">Memaparkan ${startIdx}–${endIdx} daripada ${totalItems} kerja</span>
      <div class="flex items-center gap-2">
        <button id="btn-jobs-prev" ${currentPage <= 1 ? 'disabled' : ''} class="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 text-xs font-medium">‹ Sebelum</button>
        <span class="text-slate-500 text-xs">Muka ${currentPage} / ${totalPages}</span>
        <button id="btn-jobs-next" ${currentPage >= totalPages ? 'disabled' : ''} class="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 text-xs font-medium">Seterusnya ›</button>
      </div>`;

    document.getElementById('btn-jobs-prev')?.addEventListener('click', () => {
      if (currentPage > 1) {
        currentPage--;
        renderJobsList();
      }
    });
    document.getElementById('btn-jobs-next')?.addEventListener('click', () => {
      if (currentPage < totalPages) {
        currentPage++;
        renderJobsList();
      }
    });
  }

  function renderDraftItems() {
    const tbody = document.getElementById('job-items-tbody');
    const summary = document.getElementById('job-items-summary');
    if (!tbody) return;

    const labor = parseFloat(document.getElementById('job-labor')?.value) || 0;
    const totals = calcJobTotals(draftItems, labor);

    if (!draftItems.length) {
      tbody.innerHTML = `<tr><td colspan="5" class="px-3 py-6 text-center text-slate-400 text-xs">Tiada alat ganti ditambah.</td></tr>`;
    } else {
      tbody.innerHTML = draftItems.map((item, idx) => `
        <tr class="border-b border-slate-50">
          <td class="px-3 py-2 text-xs font-mono text-slate-500">${escapeHtml(item.sku)}</td>
          <td class="px-3 py-2 text-sm">${escapeHtml(item.name)}</td>
          <td class="px-3 py-2 text-right">
            <input type="number" min="1" value="${item.quantity}" data-qty-idx="${idx}"
              class="w-16 text-right px-2 py-1 border border-slate-200 rounded text-sm" />
          </td>
          <td class="px-3 py-2 text-right text-sm">${formatRM(item.unitPrice)}</td>
          <td class="px-3 py-2 text-right">
            <span class="text-sm font-medium">${formatRM(item.lineTotal)}</span>
            <button type="button" data-remove-idx="${idx}" class="ml-2 text-red-400 hover:text-red-600 text-xs">✕</button>
          </td>
        </tr>`).join('');

      tbody.querySelectorAll('[data-qty-idx]').forEach((inp) => {
        inp.addEventListener('change', () => updateItemQty(parseInt(inp.dataset.qtyIdx, 10), parseInt(inp.value, 10)));
      });
      tbody.querySelectorAll('[data-remove-idx]').forEach((btn) => {
        btn.addEventListener('click', () => {
          draftItems.splice(parseInt(btn.dataset.removeIdx, 10), 1);
          renderDraftItems();
        });
      });
    }

    if (summary) {
      summary.innerHTML = `
        <div class="flex justify-between text-sm"><span class="text-slate-500">Jumlah Alat Ganti:</span><span class="font-medium">${formatRM(totals.subtotalParts)}</span></div>
        <div class="flex justify-between text-sm"><span class="text-slate-500">Upah Kerja:</span><span class="font-medium">${formatRM(totals.laborCharge)}</span></div>
        <div class="flex justify-between text-base font-bold border-t border-slate-200 pt-2 mt-2"><span>Jumlah Invois:</span><span class="text-orange-600">${formatRM(totals.totalAmount)}</span></div>`;
    }
  }

  function updateItemQty(idx, qty) {
    if (!qty || qty < 1) {
      InventoryApp.showToast('Kuantiti mesti sekurang-kurangnya 1.', 'error');
      renderDraftItems();
      return;
    }
    const item = draftItems[idx];
    const product = InventoryApp.getProducts().find((p) => p.id === item.productId);
    if (product && qty > product.quantity && !editingJobId) {
      InventoryApp.showToast(`Stok tersedia: ${product.quantity} unit`, 'warning');
    }
    item.quantity = qty;
    item.lineTotal = item.unitPrice * qty;
    renderDraftItems();
  }

  function addItemToJob() {
    const hiddenId = document.getElementById('job-add-product-id');
    const qtyInput = document.getElementById('job-add-qty');
    if (!hiddenId || !qtyInput) return;

    const productId = hiddenId.value;
    const quantity = parseInt(qtyInput.value, 10) || 1;
    if (!productId) {
      InventoryApp.showToast('Cari & pilih alat ganti dari inventori.', 'error');
      return;
    }

    const product = InventoryApp.getProducts().find((p) => p.id === productId);
    if (!product) return;

    const existing = draftItems.find((i) => i.productId === productId);
    if (existing) {
      existing.quantity += quantity;
      existing.lineTotal = existing.unitPrice * existing.quantity;
    } else {
      draftItems.push({
        productId: product.id,
        sku: product.sku,
        name: product.name,
        quantity,
        unitPrice: product.sellPrice,
        lineTotal: product.sellPrice * quantity
      });
    }

    qtyInput.value = '1';
    if (jobProductPicker) jobProductPicker.reset();
    renderDraftItems();
    InventoryApp.showToast(`${product.name} ditambah ke senarai kerja.`, 'success');
  }

  function initProductPicker() {
    jobProductPicker = InventoryApp.initProductPicker({
      searchInputId: 'job-product-search',
      hiddenInputId: 'job-add-product-id',
      dropdownId: 'job-product-dropdown'
    });
  }

  function openJobModal(jobId) {
    editingJobId = jobId || null;
    draftItems = [];
    const modal = document.getElementById('job-modal');
    const title = document.getElementById('job-modal-title');
    const form = document.getElementById('job-form');
    if (!modal || !form) return;

    form.reset();
    document.getElementById('job-id').value = '';

    const serviceSelect = document.getElementById('job-service');
    if (serviceSelect) {
      serviceSelect.innerHTML = SERVICE_TYPES.map((s) =>
        `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`
      ).join('');
    }

    if (jobId) {
      const job = InventoryApp.getJobs().find((j) => j.id === jobId);
      if (!job) return;
      title.textContent = 'Edit Kerja Bengkel';
      document.getElementById('job-id').value = job.id;
      document.getElementById('job-customer').value = job.customerName;
      document.getElementById('job-phone').value = job.customerPhone || '';
      document.getElementById('job-vehicle-model').value = job.vehicleModel;
      document.getElementById('job-vehicle-plate').value = job.vehiclePlate;
      document.getElementById('job-service').value = job.serviceType;
      document.getElementById('job-description').value = job.description || '';
      document.getElementById('job-labor').value = job.laborCharge;
      document.getElementById('job-status').value = job.status;
      draftItems = job.items.map((i) => ({ ...i }));
    } else {
      title.textContent = 'Kerja Bengkel Baharu';
      document.getElementById('job-labor').value = '0';
      document.getElementById('job-status').value = 'draf';
    }

    initProductPicker();
    renderDraftItems();
    modal.classList.remove('hidden');
    modal.classList.add('flex');
  }

  function closeJobModal() {
    document.getElementById('job-modal')?.classList.add('hidden');
    document.getElementById('job-modal')?.classList.remove('flex');
    editingJobId = null;
    draftItems = [];
  }

  function saveJob(e) {
    e.preventDefault();

    const id = document.getElementById('job-id').value;
    const customerName = document.getElementById('job-customer').value.trim();
    const vehiclePlate = document.getElementById('job-vehicle-plate').value.trim();
    const vehicleModel = document.getElementById('job-vehicle-model').value.trim();

    if (!customerName || !vehiclePlate || !vehicleModel) {
      InventoryApp.showToast('Nama pelanggan, model motosikal & no. plat diperlukan.', 'error');
      return;
    }

    const laborCharge = parseFloat(document.getElementById('job-labor').value) || 0;
    const totals = calcJobTotals(draftItems, laborCharge);
    const now = new Date().toISOString();

    const jobData = {
      customerName,
      customerPhone: document.getElementById('job-phone').value.trim(),
      vehicleModel,
      vehiclePlate: vehiclePlate.toUpperCase(),
      serviceType: document.getElementById('job-service').value,
      description: document.getElementById('job-description').value.trim(),
      laborCharge,
      items: draftItems.map((i) => ({ ...i })),
      subtotalParts: totals.subtotalParts,
      totalAmount: totals.totalAmount,
      status: document.getElementById('job-status').value,
      updatedAt: now
    };

    if (id) {
      InventoryApp.updateJob(id, jobData);
      InventoryApp.showToast('Kerja berjaya dikemas kini.', 'success');
    } else {
      InventoryApp.addJob({
        ...jobData,
        id: InventoryApp.generateId('job'),
        jobNo: InventoryApp.generateJobNo(),
        stockDeducted: false,
        createdAt: now,
        completedAt: null
      });
      InventoryApp.showToast('Kerja baharu berjaya dicipta.', 'success');
    }

    closeJobModal();
    render();
  }

  function completeJob(jobId) {
    const job = InventoryApp.getJobs().find((j) => j.id === jobId);
    if (!job) return;

    if (job.stockDeducted) {
      InventoryApp.showToast('Stok untuk kerja ini sudah ditolak.', 'warning');
      return;
    }

    if (!job.items.length) {
      InventoryApp.showToast('Tiada alat ganti dalam kerja ini. Tambah item atau batalkan.', 'error');
      return;
    }

    const shortages = [];

    job.items.forEach((item) => {
      const p = InventoryApp.getProducts().find((x) => x.id === item.productId);
      if (!p) shortages.push(`${item.name} (tidak dijumpai)`);
      else if (p.quantity < item.quantity) shortages.push(`${item.name}: perlu ${item.quantity}, stok ${p.quantity}`);
    });

    if (shortages.length) {
      InventoryApp.showToast('Stok tidak mencukupi: ' + shortages.join('; '), 'error');
      return;
    }

    if (!confirm(`Selesaikan kerja ${job.jobNo}?\n\nStok akan ditolak untuk ${job.items.length} item.\nJumlah invois: ${formatRM(job.totalAmount)}`)) {
      return;
    }

    job.items.forEach((item) => {
      const p = InventoryApp.getProducts().find((x) => x.id === item.productId);
      if (p) {
        InventoryApp.updateProduct(p.id, { quantity: p.quantity - item.quantity });
        InventoryApp.addTransaction({
          id: InventoryApp.generateId('tx'),
          date: new Date().toISOString(),
          sku: item.sku,
          productName: item.name,
          quantity: item.quantity,
          totalPrice: item.lineTotal,
          status: 'Berjaya',
          jobNo: job.jobNo,
          type: 'kerja_bengkel'
        });
      }
    });

    InventoryApp.updateJob(jobId, {
      status: 'selesai',
      stockDeducted: true,
      completedAt: new Date().toISOString()
    });

    InventoryApp.showToast(`Kerja ${job.jobNo} selesai. Stok inventori dikemas kini.`, 'success');
    render();
  }

  function deleteJob(jobId) {
    const job = InventoryApp.getJobs().find((j) => j.id === jobId);
    if (!job || job.status !== 'draf') return;
    if (confirm(`Padam kerja ${job.jobNo}?`)) {
      InventoryApp.deleteJob(jobId);
      InventoryApp.showToast('Kerja dipadam.', 'success');
      render();
    }
  }

  function openInvoice(jobId) {
    const job = InventoryApp.getJobs().find((j) => j.id === jobId);
    if (!job) return;

    const subtotalParts = job.items.reduce((s, i) => s + i.lineTotal, 0);
    const totalAmount = subtotalParts + (Number(job.laborCharge) || 0);

    const settings = InventoryApp.getState().settings;
    const workshopName = settings.workshopName || 'Bengkel Motor';
    const workshopPhone = settings.workshopPhone || '';
    const workshopAddress = settings.workshopAddress || '';

    const itemsHtml = job.items.length
      ? job.items.map((i, n) => `
        <tr>
          <td class="border border-slate-200 px-3 py-2 text-center">${n + 1}</td>
          <td class="border border-slate-200 px-3 py-2 font-mono text-xs">${escapeHtml(i.sku)}</td>
          <td class="border border-slate-200 px-3 py-2">${escapeHtml(i.name)}</td>
          <td class="border border-slate-200 px-3 py-2 text-center">${i.quantity}</td>
          <td class="border border-slate-200 px-3 py-2 text-right">${formatRM(i.unitPrice)}</td>
          <td class="border border-slate-200 px-3 py-2 text-right font-medium">${formatRM(i.lineTotal)}</td>
        </tr>`).join('')
      : `<tr><td colspan="6" class="border border-slate-200 px-3 py-4 text-center text-slate-400">Tiada alat ganti</td></tr>`;

    const laborRow = job.laborCharge > 0
      ? `<tr><td colspan="5" class="border border-slate-200 px-3 py-2 text-right font-medium">Upah Kerja</td>
         <td class="border border-slate-200 px-3 py-2 text-right font-medium">${formatRM(job.laborCharge)}</td></tr>`
      : '';

    const content = document.getElementById('invoice-print-area');
    const modal = document.getElementById('invoice-modal');
    if (!content || !modal) return;

    content.innerHTML = `
      <div id="invoice-document" class="bg-white p-8 max-w-3xl mx-auto text-slate-800">
        <div class="flex justify-between items-start border-b-2 border-orange-500 pb-4 mb-6">
          <div>
            <h1 class="text-2xl font-bold text-orange-600">${escapeHtml(workshopName)}</h1>
            ${workshopAddress ? `<p class="text-sm text-slate-500 mt-1">${escapeHtml(workshopAddress)}</p>` : ''}
            ${workshopPhone ? `<p class="text-sm text-slate-500">Tel: ${escapeHtml(workshopPhone)}</p>` : ''}
          </div>
          <div class="text-right">
            <p class="text-xs text-slate-400 uppercase tracking-wide">Invois Kerja</p>
            <p class="text-xl font-bold font-mono text-orange-600">${escapeHtml(job.jobNo)}</p>
            <p class="text-sm text-slate-500 mt-1">${formatDateTime(job.createdAt)}</p>
            ${statusBadge(job.status)}
          </div>
        </div>

        <div class="grid grid-cols-2 gap-6 mb-6 text-sm">
          <div class="bg-slate-50 rounded-lg p-4">
            <p class="text-xs font-semibold text-slate-400 uppercase mb-2">Maklumat Pelanggan</p>
            <p class="font-semibold">${escapeHtml(job.customerName)}</p>
            ${job.customerPhone ? `<p class="text-slate-500">${escapeHtml(job.customerPhone)}</p>` : ''}
          </div>
          <div class="bg-slate-50 rounded-lg p-4">
            <p class="text-xs font-semibold text-slate-400 uppercase mb-2">Maklumat Kenderaan</p>
            <p class="font-semibold">${escapeHtml(job.vehicleModel)}</p>
            <p class="font-mono text-orange-600 font-bold">${escapeHtml(job.vehiclePlate)}</p>
            <p class="text-slate-500 mt-1">Servis: ${escapeHtml(job.serviceType)}</p>
          </div>
        </div>

        ${job.description ? `<p class="text-sm text-slate-600 mb-4"><strong>Nota:</strong> ${escapeHtml(job.description)}</p>` : ''}

        <table class="w-full text-sm mb-4 border-collapse">
          <thead>
            <tr class="bg-orange-50 text-orange-800">
              <th class="border border-slate-200 px-3 py-2 w-8">#</th>
              <th class="border border-slate-200 px-3 py-2">SKU</th>
              <th class="border border-slate-200 px-3 py-2">Alat Ganti / Bahan</th>
              <th class="border border-slate-200 px-3 py-2 w-16">Qty</th>
              <th class="border border-slate-200 px-3 py-2 text-right">Harga/Unit</th>
              <th class="border border-slate-200 px-3 py-2 text-right">Jumlah</th>
            </tr>
          </thead>
          <tbody>${itemsHtml}</tbody>
          <tfoot>
            <tr><td colspan="5" class="border border-slate-200 px-3 py-2 text-right text-slate-500">Subjumlah Alat Ganti</td>
                <td class="border border-slate-200 px-3 py-2 text-right font-medium">${formatRM(subtotalParts)}</td></tr>
            ${laborRow}
            <tr class="bg-orange-100 font-bold">
              <td colspan="5" class="border border-orange-300 px-3 py-3 text-right text-orange-800">JUMLAH KESELURUHAN</td>
              <td class="border border-orange-300 px-3 py-3 text-right text-orange-700 text-lg">${formatRM(totalAmount)}</td>
            </tr>
          </tfoot>
        </table>

        ${job.stockDeducted ? '<p class="text-xs text-emerald-600 font-medium">✓ Stok inventori telah ditolak — kerja selesai</p>' : '<p class="text-xs text-amber-600 font-medium">⚠ Stok belum ditolak — tandakan kerja sebagai selesai untuk tolak inventori</p>'}

        <p class="text-center text-xs text-slate-400 mt-8 border-t pt-4">Terima kasih atas kepercayaan anda. Semoga selamat memandu!</p>
      </div>`;

    modal.classList.remove('hidden');
    modal.classList.add('flex');
  }

  function closeInvoiceModal() {
    document.getElementById('invoice-modal')?.classList.add('hidden');
    document.getElementById('invoice-modal')?.classList.remove('flex');
  }

  function printInvoice() {
    const doc = document.getElementById('invoice-document');
    if (!doc) return;
    const win = window.open('', '_blank');
    win.document.write(`<!DOCTYPE html><html><head><title>Invois</title>
      <script src="https://cdn.tailwindcss.com"><\/script>
      <style>@media print { body { margin: 0; } }</style>
    </head><body class="p-4">${doc.outerHTML}</body></html>`);
    win.document.close();
    win.onload = () => { win.print(); };
  }

  function bindEvents() {
    document.getElementById('btn-new-job')?.addEventListener('click', () => openJobModal(null));
    document.getElementById('btn-close-job-modal')?.addEventListener('click', closeJobModal);
    document.getElementById('btn-cancel-job-modal')?.addEventListener('click', closeJobModal);
    document.getElementById('job-modal')?.addEventListener('click', (e) => {
      if (e.target.id === 'job-modal') closeJobModal();
    });
    document.getElementById('job-form')?.addEventListener('submit', saveJob);
    document.getElementById('btn-add-job-item')?.addEventListener('click', addItemToJob);
    document.getElementById('job-labor')?.addEventListener('input', renderDraftItems);
    document.getElementById('filter-job-status')?.addEventListener('change', (e) => {
      filterStatus = e.target.value;
      currentPage = 1;
      renderJobsList();
    });
    document.getElementById('filter-job-range')?.addEventListener('change', (e) => {
      jobRange = e.target.value;
      fetchAndRenderJobs();
    });
    document.getElementById('btn-close-invoice')?.addEventListener('click', closeInvoiceModal);
    document.getElementById('btn-print-invoice')?.addEventListener('click', printInvoice);
    document.getElementById('invoice-modal')?.addEventListener('click', (e) => {
      if (e.target.id === 'invoice-modal') closeInvoiceModal();
    });
  }

  function render() {
    fetchAndRenderJobs();
  }

  function init() {
    bindEvents();
    document.getElementById('job-labor')?.addEventListener('input', renderDraftItems);
  }

  document.addEventListener('DOMContentLoaded', init);

  return { render, openJobModal, openInvoice, completeJob, SERVICE_TYPES };
})();

window.JobsModule = JobsModule;
