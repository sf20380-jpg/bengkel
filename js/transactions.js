/**
 * transactions.js — POS kaunter (troli multi-item macam invois) & log transaksi
 */
const TransactionsModule = (function () {
  let cartItems = [];
  let picker = null;

  function formatRM(value) {
    return `RM ${Number(value).toLocaleString('ms-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str ?? '';
    return div.innerHTML;
  }

  function formatDateTime(iso) {
    const d = new Date(iso);
    return d.toLocaleString('ms-MY', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  }

  function calcCartTotal() {
    return cartItems.reduce((s, i) => s + i.lineTotal, 0);
  }

  function renderCart() {
    const tbody = document.getElementById('pos-cart-tbody');
    const summary = document.getElementById('pos-cart-summary');
    if (!tbody) return;

    if (!cartItems.length) {
      tbody.innerHTML = `<tr><td colspan="5" class="px-3 py-6 text-center text-slate-400 text-xs">Troli kosong. Cari & tambah produk di atas.</td></tr>`;
    } else {
      tbody.innerHTML = cartItems
        .map((item, idx) => {
          const product = InventoryApp.getProducts().find((p) => p.id === item.productId);
          const overStock = product && item.quantity > product.quantity;
          return `
        <tr class="border-b border-slate-50 ${overStock ? 'bg-red-50' : ''}">
          <td class="px-3 py-2 text-xs font-mono text-slate-500">${escapeHtml(item.sku)}</td>
          <td class="px-3 py-2 text-sm">${escapeHtml(item.name)}${overStock ? `<span class="block text-[11px] text-red-500">Stok tinggal ${product.quantity}</span>` : ''}</td>
          <td class="px-3 py-2 text-right">
            <input type="number" min="1" value="${item.quantity}" data-cart-qty-idx="${idx}"
              class="w-16 text-right px-2 py-1 border border-slate-200 rounded text-sm" />
          </td>
          <td class="px-3 py-2 text-right text-sm">${formatRM(item.unitPrice)}</td>
          <td class="px-3 py-2 text-right">
            <span class="text-sm font-medium">${formatRM(item.lineTotal)}</span>
            <button type="button" data-cart-remove-idx="${idx}" class="ml-2 text-red-400 hover:text-red-600 text-xs">✕</button>
          </td>
        </tr>`;
        })
        .join('');

      tbody.querySelectorAll('[data-cart-qty-idx]').forEach((inp) => {
        inp.addEventListener('change', () =>
          updateCartQty(parseInt(inp.dataset.cartQtyIdx, 10), parseInt(inp.value, 10))
        );
      });
      tbody.querySelectorAll('[data-cart-remove-idx]').forEach((btn) => {
        btn.addEventListener('click', () => {
          cartItems.splice(parseInt(btn.dataset.cartRemoveIdx, 10), 1);
          renderCart();
        });
      });
    }

    if (summary) {
      const total = calcCartTotal();
      const itemCount = cartItems.reduce((s, i) => s + i.quantity, 0);
      summary.innerHTML = `
        <div class="flex justify-between text-sm"><span class="text-slate-500">Jumlah Item:</span><span class="font-medium">${itemCount} unit</span></div>
        <div class="flex justify-between text-base font-bold border-t border-slate-200 pt-2 mt-2"><span>Jumlah Keseluruhan:</span><span class="text-emerald-600">${formatRM(total)}</span></div>`;
    }
  }

  function updateCartQty(idx, qty) {
    if (!qty || qty < 1) {
      InventoryApp.showToast('Kuantiti mesti sekurang-kurangnya 1.', 'error');
      renderCart();
      return;
    }
    const item = cartItems[idx];
    const product = InventoryApp.getProducts().find((p) => p.id === item.productId);
    if (product && qty > product.quantity) {
      InventoryApp.showToast(`Stok tersedia untuk ${item.name}: ${product.quantity} unit`, 'warning');
    }
    item.quantity = qty;
    item.lineTotal = item.unitPrice * qty;
    renderCart();
  }

  function addCartItem() {
    const hiddenId = document.getElementById('pos-product-id');
    const qtyInput = document.getElementById('pos-add-qty');
    if (!hiddenId || !qtyInput) return;

    const productId = hiddenId.value;
    const quantity = parseInt(qtyInput.value, 10) || 1;

    if (!productId) {
      InventoryApp.showToast('Cari & pilih produk terlebih dahulu.', 'error');
      return;
    }

    const product = InventoryApp.getProducts().find((p) => p.id === productId);
    if (!product) {
      InventoryApp.showToast('Produk tidak dijumpai.', 'error');
      return;
    }

    const existing = cartItems.find((i) => i.productId === productId);
    const totalRequested = (existing ? existing.quantity : 0) + quantity;
    if (totalRequested > product.quantity) {
      InventoryApp.showToast(`Stok tersedia untuk ${product.name}: ${product.quantity} unit`, 'warning');
    }

    if (existing) {
      existing.quantity += quantity;
      existing.lineTotal = existing.unitPrice * existing.quantity;
    } else {
      cartItems.push({
        productId: product.id,
        sku: product.sku,
        name: product.name,
        quantity,
        unitPrice: product.sellPrice,
        lineTotal: product.sellPrice * quantity
      });
    }

    qtyInput.value = '1';
    if (picker) picker.reset();
    renderCart();
    InventoryApp.showToast(`${product.name} ditambah ke troli.`, 'success');
  }

  function confirmSale() {
    if (!cartItems.length) {
      InventoryApp.showToast('Troli kosong. Tambah produk dahulu.', 'error');
      return;
    }

    const shortages = [];
    cartItems.forEach((item) => {
      const p = InventoryApp.getProducts().find((x) => x.id === item.productId);
      if (!p) shortages.push(`${item.name} (tidak dijumpai)`);
      else if (p.quantity < item.quantity) shortages.push(`${item.name}: perlu ${item.quantity}, stok ${p.quantity}`);
    });

    if (shortages.length) {
      InventoryApp.showToast('Stok tidak mencukupi: ' + shortages.join('; '), 'error');
      return;
    }

    const total = calcCartTotal();
    const itemCount = cartItems.length;
    if (!confirm(`Sahkan jualan kaunter?\n\n${itemCount} jenis produk · Jumlah: ${formatRM(total)}`)) {
      return;
    }

    const receiptNo = InventoryApp.generateReceiptNo();
    const date = new Date().toISOString();
    const soldItems = cartItems.map((i) => ({ ...i }));

    soldItems.forEach((item) => {
      const p = InventoryApp.getProducts().find((x) => x.id === item.productId);
      if (!p) return;
      InventoryApp.updateProduct(p.id, { quantity: p.quantity - item.quantity });
      InventoryApp.addTransaction({
        id: InventoryApp.generateId('tx'),
        date,
        sku: item.sku,
        productName: item.name,
        quantity: item.quantity,
        totalPrice: item.lineTotal,
        status: 'Berjaya',
        receiptNo,
        type: 'kaunter'
      });
    });

    InventoryApp.showToast(`Jualan berjaya! Resit ${receiptNo} — ${formatRM(total)}`, 'success');

    cartItems = [];
    renderCart();
    initPicker();
    renderTransactionLog();
    openReceipt(receiptNo, soldItems, total, date);
  }

  function openReceipt(receiptNo, items, total, dateIso) {
    const content = document.getElementById('invoice-print-area');
    const modal = document.getElementById('invoice-modal');
    if (!content || !modal) return;

    const settings = InventoryApp.getState().settings;
    const workshopName = settings.workshopName || 'Bengkel Motor';
    const workshopPhone = settings.workshopPhone || '';
    const workshopAddress = settings.workshopAddress || '';

    const itemsHtml = items
      .map(
        (i, n) => `
        <tr>
          <td class="border border-slate-200 px-3 py-2 text-center">${n + 1}</td>
          <td class="border border-slate-200 px-3 py-2 font-mono text-xs">${escapeHtml(i.sku)}</td>
          <td class="border border-slate-200 px-3 py-2">${escapeHtml(i.name)}</td>
          <td class="border border-slate-200 px-3 py-2 text-center">${i.quantity}</td>
          <td class="border border-slate-200 px-3 py-2 text-right">${formatRM(i.unitPrice)}</td>
          <td class="border border-slate-200 px-3 py-2 text-right font-medium">${formatRM(i.lineTotal)}</td>
        </tr>`
      )
      .join('');

    content.innerHTML = `
      <div id="invoice-document" class="bg-white p-8 max-w-3xl mx-auto text-slate-800">
        <div class="flex justify-between items-start border-b-2 border-emerald-500 pb-4 mb-6">
          <div>
            <h1 class="text-2xl font-bold text-emerald-600">${escapeHtml(workshopName)}</h1>
            ${workshopAddress ? `<p class="text-sm text-slate-500 mt-1">${escapeHtml(workshopAddress)}</p>` : ''}
            ${workshopPhone ? `<p class="text-sm text-slate-500">Tel: ${escapeHtml(workshopPhone)}</p>` : ''}
          </div>
          <div class="text-right">
            <p class="text-xs text-slate-400 uppercase tracking-wide">Resit Jualan Kaunter</p>
            <p class="text-xl font-bold font-mono text-emerald-600">${escapeHtml(receiptNo)}</p>
            <p class="text-sm text-slate-500 mt-1">${formatDateTime(dateIso)}</p>
            <span class="inline-block mt-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">Berjaya</span>
          </div>
        </div>

        <table class="w-full text-sm mb-4 border-collapse">
          <thead>
            <tr class="bg-emerald-50 text-emerald-800">
              <th class="border border-slate-200 px-3 py-2 w-8">#</th>
              <th class="border border-slate-200 px-3 py-2">SKU</th>
              <th class="border border-slate-200 px-3 py-2">Produk</th>
              <th class="border border-slate-200 px-3 py-2 w-16">Qty</th>
              <th class="border border-slate-200 px-3 py-2 text-right">Harga/Unit</th>
              <th class="border border-slate-200 px-3 py-2 text-right">Jumlah</th>
            </tr>
          </thead>
          <tbody>${itemsHtml}</tbody>
          <tfoot>
            <tr class="bg-emerald-100 font-bold">
              <td colspan="5" class="border border-emerald-300 px-3 py-3 text-right text-emerald-800">JUMLAH KESELURUHAN</td>
              <td class="border border-emerald-300 px-3 py-3 text-right text-emerald-700 text-lg">${formatRM(total)}</td>
            </tr>
          </tfoot>
        </table>

        <p class="text-xs text-emerald-600 font-medium">✓ Stok inventori telah ditolak secara automatik</p>
        <p class="text-center text-xs text-slate-400 mt-8 border-t pt-4">Terima kasih atas pembelian anda. Semoga selamat memandu!</p>
      </div>`;

    modal.classList.remove('hidden');
    modal.classList.add('flex');
  }

  function initPicker() {
    picker = InventoryApp.initProductPicker({
      searchInputId: 'pos-product-search',
      hiddenInputId: 'pos-product-id',
      dropdownId: 'pos-product-dropdown',
      filterFn: (p) => p.quantity > 0
    });
  }

  function renderTransactionLog() {
    const tbody = document.getElementById('transactions-tbody');
    const countEl = document.getElementById('transactions-count');
    if (!tbody) return;

    const transactions = InventoryApp.getTransactions();
    if (countEl) countEl.textContent = `${transactions.length} rekod`;

    if (!transactions.length) {
      tbody.innerHTML = `
        <tr>
          <td colspan="8" class="px-4 py-12 text-center text-slate-400">
            Tiada transaksi direkodkan lagi.
          </td>
        </tr>`;
      return;
    }

    tbody.innerHTML = transactions
      .map((tx) => {
        const isSuccess = tx.status === 'Berjaya';
        const statusClass = isSuccess
          ? 'bg-emerald-100 text-emerald-700'
          : 'bg-red-100 text-red-700';
        let jenis;
        if (tx.jobNo) {
          jenis = `<span class="text-orange-600 font-mono text-xs">${escapeHtml(tx.jobNo)}</span>`;
        } else if (tx.receiptNo) {
          jenis = `<span class="text-emerald-600 font-mono text-xs">${escapeHtml(tx.receiptNo)}</span>`;
        } else {
          jenis = '<span class="text-slate-400 text-xs">Kaunter</span>';
        }
        return `
        <tr class="table-row-hover border-b border-slate-100">
          <td class="px-4 py-3 font-mono text-xs text-slate-500">${escapeHtml(tx.id.slice(0, 16))}…</td>
          <td class="px-4 py-3 text-sm text-slate-600 whitespace-nowrap">${formatDateTime(tx.date)}</td>
          <td class="px-4 py-3">${jenis}</td>
          <td class="px-4 py-3 font-mono text-xs text-indigo-600">${escapeHtml(tx.sku)}</td>
          <td class="px-4 py-3 text-slate-800">${escapeHtml(tx.productName)}</td>
          <td class="px-4 py-3 text-right font-medium">${tx.quantity}</td>
          <td class="px-4 py-3 text-right text-emerald-700 font-medium">${formatRM(tx.totalPrice)}</td>
          <td class="px-4 py-3 text-center">
            <span class="px-2 py-0.5 rounded-full text-xs font-medium ${statusClass}">${escapeHtml(tx.status)}</span>
          </td>
        </tr>`;
      })
      .join('');
  }

  function bindEvents() {
    document.getElementById('btn-add-pos-item')?.addEventListener('click', addCartItem);
    document.getElementById('btn-confirm-sale')?.addEventListener('click', confirmSale);
  }

  function render() {
    initPicker();
    renderCart();
    renderTransactionLog();
  }

  function init() {
    bindEvents();
  }

  document.addEventListener('DOMContentLoaded', init);

  return { render, confirmSale };
})();

window.TransactionsModule = TransactionsModule;
