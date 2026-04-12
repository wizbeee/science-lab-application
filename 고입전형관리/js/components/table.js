// table.js - 재사용 가능한 데이터 테이블 컴포넌트
class DataTable {
  constructor(container, options = {}) {
    this.container = typeof container === 'string' ? document.querySelector(container) : container;
    if (!this.container) return;
    this.columns = options.columns || [];
    this.data = [];
    this.filteredData = [];
    this.pageSize = options.pageSize || 50;
    this.currentPage = 1;
    this.sortKey = options.defaultSort || null;
    this.sortAsc = true;
    this.onRowClick = options.onRowClick || null;
    this.selectable = options.selectable || false;
    this.selectedIds = new Set();
    this.idField = options.idField || '접수번호';
    this.render();
  }

  setData(data) {
    if (!this.container) return;
    this.data = data;
    this.filteredData = [...data];
    this.currentPage = 1;
    this.selectedIds.clear();
    if (this.sortKey) this.doSort();
    this.renderTable();
  }

  doSort() {
    this.filteredData = Utils.sortBy(this.filteredData, this.sortKey, this.sortAsc);
  }

  getPage() {
    const start = (this.currentPage - 1) * this.pageSize;
    return this.filteredData.slice(start, start + this.pageSize);
  }

  getTotalPages() {
    return Math.max(1, Math.ceil(this.filteredData.length / this.pageSize));
  }

  render() {
    this.container.innerHTML = `
      <div class="table-wrapper">
        <div class="overflow-x-auto border border-gray-200 rounded-lg">
          <table class="min-w-full divide-y divide-gray-200">
            <thead class="bg-gray-50 sticky top-0"></thead>
            <tbody class="bg-white divide-y divide-gray-200"></tbody>
          </table>
        </div>
        <div class="table-pagination flex items-center justify-between mt-3 text-sm text-gray-600"></div>
      </div>
    `;
    this.thead = this.container.querySelector('thead');
    this.tbody = this.container.querySelector('tbody');
    this.pagination = this.container.querySelector('.table-pagination');
  }

  renderTable() {
    this.renderHeader();
    this.renderBody();
    this.renderPagination();
  }

  renderHeader() {
    let html = '<tr>';
    if (this.selectable) {
      html += `<th class="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase w-10">
        <input type="checkbox" class="select-all rounded border-gray-300">
      </th>`;
    }
    for (const col of this.columns) {
      const sortable = col.sortable !== false;
      const arrow = this.sortKey === col.key
        ? (this.sortAsc ? ' <span class="text-blue-500">&#9650;</span>' : ' <span class="text-blue-500">&#9660;</span>')
        : '';
      html += `<th class="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider ${sortable ? 'cursor-pointer hover:bg-gray-100' : ''} whitespace-nowrap"
        ${sortable ? `data-sort-key="${col.key}"` : ''}>
        ${col.label}${arrow}
      </th>`;
    }
    html += '</tr>';
    this.thead.innerHTML = html;

    // Sort handlers
    this.thead.querySelectorAll('[data-sort-key]').forEach(th => {
      th.addEventListener('click', () => {
        const key = th.dataset.sortKey;
        if (this.sortKey === key) this.sortAsc = !this.sortAsc;
        else { this.sortKey = key; this.sortAsc = true; }
        this.doSort();
        this.renderTable();
      });
    });

    // Select all handler
    const selectAll = this.thead.querySelector('.select-all');
    if (selectAll) {
      selectAll.addEventListener('change', (e) => {
        const page = this.getPage();
        if (e.target.checked) page.forEach(r => this.selectedIds.add(r[this.idField]));
        else page.forEach(r => this.selectedIds.delete(r[this.idField]));
        this.renderBody();
      });
    }
  }

  renderBody() {
    const page = this.getPage();
    if (!page.length) {
      this.tbody.innerHTML = `<tr><td colspan="${this.columns.length + (this.selectable ? 1 : 0)}" class="px-4 py-8 text-center text-gray-400">데이터가 없습니다</td></tr>`;
      return;
    }

    let html = '';
    for (const row of page) {
      const id = row[this.idField];
      const selected = this.selectedIds.has(id);
      html += `<tr class="${this.onRowClick ? 'cursor-pointer hover:bg-blue-50' : ''} ${selected ? 'bg-blue-50' : ''}" data-id="${id}">`;

      if (this.selectable) {
        html += `<td class="px-3 py-2"><input type="checkbox" class="row-select rounded border-gray-300" data-id="${id}" ${selected ? 'checked' : ''}></td>`;
      }

      for (const col of this.columns) {
        const value = col.render ? col.render(row[col.key], row) : (row[col.key] ?? '-');
        html += `<td class="px-3 py-2 text-sm ${col.className || ''} whitespace-nowrap">${value}</td>`;
      }
      html += '</tr>';
    }
    this.tbody.innerHTML = html;

    // Row click handlers
    if (this.onRowClick) {
      this.tbody.querySelectorAll('tr[data-id]').forEach(tr => {
        tr.addEventListener('click', (e) => {
          if (e.target.type === 'checkbox') return;
          this.onRowClick(tr.dataset.id);
        });
      });
    }

    // Checkbox handlers
    this.tbody.querySelectorAll('.row-select').forEach(cb => {
      cb.addEventListener('change', (e) => {
        if (e.target.checked) this.selectedIds.add(e.target.dataset.id);
        else this.selectedIds.delete(e.target.dataset.id);
      });
    });
  }

  renderPagination() {
    const total = this.filteredData.length;
    const totalPages = this.getTotalPages();
    const start = (this.currentPage - 1) * this.pageSize + 1;
    const end = Math.min(this.currentPage * this.pageSize, total);

    this.pagination.innerHTML = `
      <span>${total}명 중 ${total > 0 ? start : 0}-${end}명</span>
      <div class="flex gap-1">
        <button class="page-btn px-3 py-1 rounded border ${this.currentPage <= 1 ? 'text-gray-300 cursor-not-allowed' : 'hover:bg-gray-100'}" data-page="prev" ${this.currentPage <= 1 ? 'disabled' : ''}>&#8249;</button>
        ${this.getPageButtons(totalPages)}
        <button class="page-btn px-3 py-1 rounded border ${this.currentPage >= totalPages ? 'text-gray-300 cursor-not-allowed' : 'hover:bg-gray-100'}" data-page="next" ${this.currentPage >= totalPages ? 'disabled' : ''}>&#8250;</button>
      </div>
    `;

    this.pagination.querySelectorAll('.page-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const p = btn.dataset.page;
        if (p === 'prev') this.currentPage = Math.max(1, this.currentPage - 1);
        else if (p === 'next') this.currentPage = Math.min(totalPages, this.currentPage + 1);
        else this.currentPage = parseInt(p);
        this.renderTable();
      });
    });
  }

  getPageButtons(totalPages) {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, i) => i + 1)
        .map(p => `<button class="page-btn px-3 py-1 rounded border ${p === this.currentPage ? 'bg-blue-500 text-white' : 'hover:bg-gray-100'}" data-page="${p}">${p}</button>`)
        .join('');
    }
    const pages = [1];
    if (this.currentPage > 3) pages.push('...');
    for (let i = Math.max(2, this.currentPage - 1); i <= Math.min(totalPages - 1, this.currentPage + 1); i++) pages.push(i);
    if (this.currentPage < totalPages - 2) pages.push('...');
    pages.push(totalPages);
    return pages.map(p => p === '...'
      ? '<span class="px-2 py-1">...</span>'
      : `<button class="page-btn px-3 py-1 rounded border ${p === this.currentPage ? 'bg-blue-500 text-white' : 'hover:bg-gray-100'}" data-page="${p}">${p}</button>`
    ).join('');
  }

  getSelectedIds() {
    return [...this.selectedIds];
  }
}

window.DataTable = DataTable;
