/**
 * transactions.js — POS simulasi & log transaksi
 */
const TransactionsModule = (function () {
  let selectedProductId = '';

  function formatRM(value) {
    return `RM ${Number(value).toLocaleString('ms-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
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

  function populateProductSelect() {
    const select = document.getElementById('pos-product');
    if (!select) return;

    const products = InventoryApp.getProducts().filter((p) => p.quantity > 0);
    select.innerHTML =
      '<option value="">-- Pilih Produk --</option>' +
      products
        .map(
          (p) =>
            `<option value="${p.id}" data-stock="${p.quantity}" data-price="${p.sellPrice}" data-sku="${escapeHtml(p.sku)}">
              ${escapeHtml(p.sku)} — ${escapeHtml(p.name)} (Stok: ${p.quantity})
            </option>`
        )
        .join('');

    if (selectedProductId && products.some((p) => p.id === selectedProductId)) {
      select.value = selectedProductId;
    } else {
      selectedProductId = '';
    }
    updatePosPreview();
  }

  function updatePosPreview() {
    const select = document.getElementById('pos-product');
    const preview = document.getElementById('pos-preview');
    const qtyInput = document.getElementById('pos-quantity');
    if (!select || !preview) return;

    const option = select.selectedOptions[0];
    if (!option || !option.value) {
      preview.innerHTML = '<p class="text-slate-400 text-sm">Pilih produk untuk melihat butiran.</p>';
      return;
    }

    const stock = parseInt(option.dataset.stock, 10);
    const price = parseFloat(option.dataset.price);
    const qty = parseInt(qtyInput?.value, 10) || 1;
    const total = price * qty;

    preview.innerHTML = `
      <div class="grid grid-cols-2 gap-2 text-sm">
        <span class="text-slate-500">Stok Tersedia:</span>
        <span class="font-semibold ${stock < qty ? 'text-red-600' : 'text-slate-800'}">${stock} unit</span>
        <span class="text-slate-500">Harga Seunit:</span>
        <span class="font-semibold text-slate-800">${formatRM(price)}</span>
        <span class="text-slate-500">Jumlah:</span>
        <span class="font-bold text-emerald-600 text-lg">${formatRM(total)}</span>
      </div>`;
  }

  function processSale() {
    const select = document.getElementById('pos-product');
    const qtyInput = document.getElementById('pos-quantity');
    if (!select || !qtyInput) return;

    const productId = select.value;
    const quantity = parseInt(qtyInput.value, 10);

    if (!productId) {
      InventoryApp.showToast('Sila pilih produk terlebih dahulu.', 'error');
      return;
    }
    if (!quantity || quantity <= 0) {
      InventoryApp.showToast('Kuantiti jualan mesti lebih daripada 0.', 'error');
      return;
    }

    const products = InventoryApp.getProducts();
    const product = products.find((p) => p.id === productId);
    if (!product) {
      InventoryApp.showToast('Produk tidak dijumpai.', 'error');
      return;
    }

    if (product.quantity < quantity) {
      InventoryApp.addTransaction({
        id: InventoryApp.generateId('tx'),
        date: new Date().toISOString(),
        sku: product.sku,
        productName: product.name,
        quantity,
        totalPrice: product.sellPrice * quantity,
        status: 'Gagal — Stok Tidak Mencukupi'
      });
      InventoryApp.showToast(
        `Stok tidak mencukupi! Tersedia: ${product.quantity}, Diminta: ${quantity}`,
        'error'
      );
      renderTransactionLog();
      return;
    }

    const newQty = product.quantity - quantity;
    const totalPrice = product.sellPrice * quantity;

    InventoryApp.updateProduct(productId, { quantity: newQty });

    InventoryApp.addTransaction({
      id: InventoryApp.generateId('tx'),
      date: new Date().toISOString(),
      sku: product.sku,
      productName: product.name,
      quantity,
      totalPrice,
      status: 'Berjaya'
    });

    InventoryApp.showToast(
      `Jualan berjaya! ${quantity}x ${product.name} — ${formatRM(totalPrice)}`,
      'success'
    );

    qtyInput.value = '1';
    select.value = '';
    selectedProductId = '';
    populateProductSelect();
    renderTransactionLog();
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
        const jenis = tx.jobNo
          ? `<span class="text-orange-600 font-mono text-xs">${escapeHtml(tx.jobNo)}</span>`
          : '<span class="text-slate-400 text-xs">Kaunter</span>';
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
    document.getElementById('pos-product')?.addEventListener('change', (e) => {
      selectedProductId = e.target.value;
      updatePosPreview();
    });
    document.getElementById('pos-quantity')?.addEventListener('input', updatePosPreview);
    document.getElementById('btn-confirm-sale')?.addEventListener('click', processSale);
  }

  function render() {
    populateProductSelect();
    renderTransactionLog();
  }

  function init() {
    bindEvents();
  }

  document.addEventListener('DOMContentLoaded', init);

  return { render, processSale };
})();

window.TransactionsModule = TransactionsModule;
