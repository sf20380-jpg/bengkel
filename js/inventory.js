/**
 * inventory.js — CRUD produk, jadual, carian, penapisan, sorting
 */
const InventoryModule = (function () {
  let sortField = 'name';
  let sortDir = 'asc';
  let searchQuery = '';
  let filterCategory = '';
  let editingId = null;

  function formatRM(value) {
    return `RM ${Number(value).toLocaleString('ms-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function getFilteredProducts() {
    let list = [...InventoryApp.getProducts()];

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.sku.toLowerCase().includes(q) ||
          p.category.toLowerCase().includes(q)
      );
    }

    if (filterCategory) {
      list = list.filter((p) => p.category === filterCategory);
    }

    list.sort((a, b) => {
      let va, vb;
      switch (sortField) {
        case 'quantity':
          va = a.quantity;
          vb = b.quantity;
          break;
        case 'sku':
          va = a.sku.toLowerCase();
          vb = b.sku.toLowerCase();
          break;
        default:
          va = a.name.toLowerCase();
          vb = b.name.toLowerCase();
      }
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });

    return list;
  }

  function renderCategoryOptions(selected) {
    const categories = InventoryApp.getCategories();
    return categories
      .map(
        (c) =>
          `<option value="${escapeHtml(c)}" ${c === selected ? 'selected' : ''}>${escapeHtml(c)}</option>`
      )
      .join('');
  }

  function renderTable() {
    const tbody = document.getElementById('inventory-tbody');
    const countEl = document.getElementById('inventory-count');
    if (!tbody) return;

    const products = getFilteredProducts();
    if (countEl) countEl.textContent = `${products.length} produk`;

    if (!products.length) {
      tbody.innerHTML = `
        <tr>
          <td colspan="8" class="px-4 py-12 text-center text-slate-400">
            Tiada produk dijumpai. Tambah produk baharu atau gunakan data contoh.
          </td>
        </tr>`;
      return;
    }

    tbody.innerHTML = products
      .map((p) => {
        const isLow = p.quantity < p.minStock;
        const qtyClass = isLow ? 'text-red-600 font-bold' : 'text-slate-800';
        const rowClass = isLow ? 'bg-red-50' : '';
        return `
        <tr class="table-row-hover border-b border-slate-100 ${rowClass}">
          <td class="px-4 py-3 font-mono text-xs text-indigo-600">${escapeHtml(p.sku)}</td>
          <td class="px-4 py-3 font-medium text-slate-800">${escapeHtml(p.name)}</td>
          <td class="px-4 py-3"><span class="px-2 py-0.5 rounded-full text-xs bg-slate-100 text-slate-600">${escapeHtml(p.category)}</span></td>
          <td class="px-4 py-3 text-right text-slate-600">${formatRM(p.costPrice)}</td>
          <td class="px-4 py-3 text-right text-emerald-700 font-medium">${formatRM(p.sellPrice)}</td>
          <td class="px-4 py-3 text-right ${qtyClass}">${p.quantity}</td>
          <td class="px-4 py-3 text-right text-slate-500">${p.minStock}</td>
          <td class="px-4 py-3 text-center">
            <button data-edit="${p.id}" class="text-indigo-600 hover:text-indigo-800 text-sm font-medium mr-2">Edit</button>
            <button data-delete="${p.id}" class="text-red-500 hover:text-red-700 text-sm font-medium">Padam</button>
          </td>
        </tr>`;
      })
      .join('');

    tbody.querySelectorAll('[data-edit]').forEach((btn) => {
      btn.addEventListener('click', () => openModal(btn.dataset.edit));
    });
    tbody.querySelectorAll('[data-delete]').forEach((btn) => {
      btn.addEventListener('click', () => confirmDelete(btn.dataset.delete));
    });
  }

  function updateSortIndicators() {
    document.querySelectorAll('[data-sort]').forEach((th) => {
      const field = th.dataset.sort;
      const icon = th.querySelector('.sort-icon');
      if (!icon) return;
      if (field === sortField) {
        icon.textContent = sortDir === 'asc' ? '↑' : '↓';
        icon.classList.remove('opacity-0');
      } else {
        icon.textContent = '↕';
        icon.classList.add('opacity-30');
      }
    });
  }

  function openModal(productId) {
    editingId = productId || null;
    const modal = document.getElementById('product-modal');
    const title = document.getElementById('modal-title');
    const form = document.getElementById('product-form');

    if (!modal || !form) return;

    form.reset();
    document.getElementById('product-id').value = '';

    if (productId) {
      const product = InventoryApp.getProducts().find((p) => p.id === productId);
      if (!product) return;
      title.textContent = 'Edit Produk';
      document.getElementById('product-id').value = product.id;
      document.getElementById('product-name').value = product.name;
      document.getElementById('product-name').placeholder = 'cth: Minyak Enjin 10W-40 1L';
      document.getElementById('product-sku').value = product.sku;
      document.getElementById('product-category').innerHTML = renderCategoryOptions(product.category);
      document.getElementById('product-cost').value = product.costPrice;
      document.getElementById('product-sell').value = product.sellPrice;
      document.getElementById('product-qty').value = product.quantity;
      document.getElementById('product-min').value = product.minStock;
    } else {
      title.textContent = 'Tambah Produk Baharu';
      document.getElementById('product-category').innerHTML = renderCategoryOptions('');
      document.getElementById('product-sku').placeholder = 'Auto: ' + InventoryApp.generateSku();
    }

    modal.classList.remove('hidden');
    modal.classList.add('flex');
  }

  function closeModal() {
    const modal = document.getElementById('product-modal');
    if (modal) {
      modal.classList.add('hidden');
      modal.classList.remove('flex');
    }
    editingId = null;
  }

  function validateForm(data) {
    if (!data.name.trim()) {
      InventoryApp.showToast('Nama produk diperlukan.', 'error');
      return false;
    }
    if (data.costPrice < 0 || data.sellPrice < 0 || data.quantity < 0 || data.minStock < 0) {
      InventoryApp.showToast('Nilai negatif tidak dibenarkan.', 'error');
      return false;
    }
    if (data.sellPrice < data.costPrice) {
      InventoryApp.showToast('Amaran: Harga jual lebih rendah daripada harga kos.', 'warning');
    }
    const sku = data.sku.trim() || InventoryApp.generateSku();
    if (!InventoryApp.isSkuUnique(sku, data.id || null)) {
      InventoryApp.showToast('SKU sudah wujud. Sila gunakan SKU lain.', 'error');
      return false;
    }
    data.sku = sku;
    return true;
  }

  function handleSubmit(e) {
    e.preventDefault();

    const id = document.getElementById('product-id').value;
    const data = {
      id: id || undefined,
      name: document.getElementById('product-name').value.trim(),
      sku: document.getElementById('product-sku').value.trim(),
      category: document.getElementById('product-category').value,
      costPrice: parseFloat(document.getElementById('product-cost').value) || 0,
      sellPrice: parseFloat(document.getElementById('product-sell').value) || 0,
      quantity: parseInt(document.getElementById('product-qty').value, 10) || 0,
      minStock: parseInt(document.getElementById('product-min').value, 10) || 0
    };

    if (!validateForm(data)) return;

    const now = new Date().toISOString();

    if (id) {
      InventoryApp.updateProduct(id, {
        name: data.name,
        sku: data.sku.toUpperCase(),
        category: data.category,
        costPrice: data.costPrice,
        sellPrice: data.sellPrice,
        quantity: data.quantity,
        minStock: data.minStock
      });
      InventoryApp.showToast('Produk berjaya dikemas kini.', 'success');
    } else {
      InventoryApp.addProduct({
        id: InventoryApp.generateId('prod'),
        name: data.name,
        sku: data.sku.toUpperCase(),
        category: data.category,
        costPrice: data.costPrice,
        sellPrice: data.sellPrice,
        quantity: data.quantity,
        minStock: data.minStock,
        createdAt: now,
        updatedAt: now
      });
      InventoryApp.showToast('Produk baharu berjaya ditambah.', 'success');
    }

    closeModal();
    render();
  }

  function confirmDelete(id) {
    const product = InventoryApp.getProducts().find((p) => p.id === id);
    if (!product) return;
    if (confirm(`Padam produk "${product.name}" (${product.sku})?`)) {
      InventoryApp.deleteProduct(id);
      InventoryApp.showToast('Produk telah dipadam.', 'success');
      render();
    }
  }

  function renderCategoryList() {
    const container = document.getElementById('category-list');
    if (!container) return;

    const categories = InventoryApp.getCategories();

    container.innerHTML = categories
      .map((c) => {
        const count = InventoryApp.categoryUsageCount(c);
        return `
        <div class="flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-slate-200" data-cat-row="${escapeHtml(c)}">
          <div class="min-w-0">
            <p class="text-sm font-medium text-slate-700 truncate">${escapeHtml(c)}</p>
            <p class="text-xs text-slate-400">${count} produk</p>
          </div>
          <div class="flex items-center gap-2 shrink-0">
            <button data-rename-cat="${escapeHtml(c)}" class="text-indigo-600 hover:text-indigo-800 text-xs font-medium">Namakan Semula</button>
            <button data-delete-cat="${escapeHtml(c)}" class="text-red-500 hover:text-red-700 text-xs font-medium">Padam</button>
          </div>
        </div>`;
      })
      .join('');

    container.querySelectorAll('[data-rename-cat]').forEach((btn) => {
      btn.addEventListener('click', () => handleRenameCategory(btn.dataset.renameCat));
    });
    container.querySelectorAll('[data-delete-cat]').forEach((btn) => {
      btn.addEventListener('click', () => handleDeleteCategory(btn.dataset.deleteCat));
    });
  }

  function refreshAfterCategoryChange() {
    renderCategoryList();
    populateFilterDropdown();
    if (!editingId) {
      const categorySelect = document.getElementById('product-category');
      if (categorySelect) categorySelect.innerHTML = renderCategoryOptions('');
    }
    renderTable();
    if (window.ReportsModule) ReportsModule.renderDashboard();
    if (window.JobsModule) JobsModule.render();
  }

  function handleAddCategory(e) {
    e.preventDefault();
    const input = document.getElementById('new-category-input');
    if (!input) return;
    const result = InventoryApp.addCategory(input.value);
    if (!result.ok) {
      InventoryApp.showToast(result.msg, 'error');
      return;
    }
    input.value = '';
    InventoryApp.showToast('Kategori baharu ditambah.', 'success');
    refreshAfterCategoryChange();
  }

  function handleRenameCategory(oldName) {
    const newName = prompt('Nama baharu untuk kategori:', oldName);
    if (newName === null) return;
    const result = InventoryApp.renameCategory(oldName, newName);
    if (!result.ok) {
      InventoryApp.showToast(result.msg, 'error');
      return;
    }
    InventoryApp.showToast('Kategori dinamakan semula.', 'success');
    refreshAfterCategoryChange();
  }

  function handleDeleteCategory(name) {
    let result = InventoryApp.deleteCategory(name);
    if (!result.ok && result.inUseCount) {
      const others = InventoryApp.getCategories().filter((c) => c !== name);
      if (!others.length) {
        InventoryApp.showToast('Tidak boleh padam kategori terakhir.', 'error');
        return;
      }
      const target = prompt(
        `${result.msg}\n\nTaip nama kategori gantian (contoh: ${others[0]}):`,
        others[0]
      );
      if (target === null) return;
      if (!others.some((c) => c.toLowerCase() === target.trim().toLowerCase())) {
        InventoryApp.showToast('Kategori gantian tidak sah.', 'error');
        return;
      }
      result = InventoryApp.deleteCategory(name, target.trim());
    }
    if (!result.ok) {
      InventoryApp.showToast(result.msg, 'error');
      return;
    }
    InventoryApp.showToast('Kategori dipadam.', 'success');
    refreshAfterCategoryChange();
  }

  function openCategoryModal() {
    const modal = document.getElementById('category-modal');
    if (!modal) return;
    renderCategoryList();
    modal.classList.remove('hidden');
    modal.classList.add('flex');
  }

  function closeCategoryModal() {
    const modal = document.getElementById('category-modal');
    if (modal) {
      modal.classList.add('hidden');
      modal.classList.remove('flex');
    }
  }

  function populateFilterDropdown() {
    const select = document.getElementById('filter-category');
    if (!select) return;
    const cats = InventoryApp.getCategories();
    select.innerHTML =
      '<option value="">Semua Kategori</option>' +
      cats.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
    select.value = filterCategory;
  }

  function bindEvents() {
    document.getElementById('btn-add-product')?.addEventListener('click', () => openModal(null));
    document.getElementById('btn-close-modal')?.addEventListener('click', closeModal);
    document.getElementById('btn-cancel-modal')?.addEventListener('click', closeModal);
    document.getElementById('product-modal')?.addEventListener('click', (e) => {
      if (e.target.id === 'product-modal') closeModal();
    });
    document.getElementById('product-form')?.addEventListener('submit', handleSubmit);

    document.getElementById('btn-manage-categories')?.addEventListener('click', openCategoryModal);
    document.getElementById('btn-close-category-modal')?.addEventListener('click', closeCategoryModal);
    document.getElementById('category-modal')?.addEventListener('click', (e) => {
      if (e.target.id === 'category-modal') closeCategoryModal();
    });
    document.getElementById('category-add-form')?.addEventListener('submit', handleAddCategory);

    document.getElementById('search-inventory')?.addEventListener('input', (e) => {
      searchQuery = e.target.value;
      renderTable();
    });

    document.getElementById('filter-category')?.addEventListener('change', (e) => {
      filterCategory = e.target.value;
      renderTable();
    });

    document.querySelectorAll('[data-sort]').forEach((th) => {
      th.addEventListener('click', () => {
        const field = th.dataset.sort;
        if (sortField === field) {
          sortDir = sortDir === 'asc' ? 'desc' : 'asc';
        } else {
          sortField = field;
          sortDir = 'asc';
        }
        updateSortIndicators();
        renderTable();
      });
    });
  }

  function render() {
    populateFilterDropdown();
    const categorySelect = document.getElementById('product-category');
    if (categorySelect && !editingId) {
      categorySelect.innerHTML = renderCategoryOptions('');
    }
    renderTable();
    updateSortIndicators();
  }

  function init() {
    bindEvents();
  }

  document.addEventListener('DOMContentLoaded', init);

  return { render, openModal, getFilteredProducts };
})();

window.InventoryModule = InventoryModule;
