var Dash = window.Dash || {};
Dash.components = Dash.components || {};

Dash.components.table = {
  currentSortKey: null,
  currentSortDir: 'asc',
  currentPage: 1,
  pageSize: 20,
  searchTerm: '',

  render(cols, rows, options) {
    if (!rows || rows.length === 0) {
      return '<div class="text-center py-16 text-base-content/40 text-sm">' + (options?.emptyMessage || 'Không có dữ liệu') + '</div>';
    }

    let filtered = [...rows];
    const searchable = options?.searchable;
    this.searchTerm = options?.searchTerm || '';
    if (this.searchTerm && searchable) {
      const term = this.searchTerm.toLowerCase();
      filtered = filtered.filter(row => searchable.some(key => String(row[key] || '').toLowerCase().includes(term)));
    }

    if (options?.pageSize) this.pageSize = options.pageSize;

    if (this.currentSortKey) {
      filtered.sort((a, b) => {
        const va = a[this.currentSortKey] || '';
        const vb = b[this.currentSortKey] || '';
        const cmp = typeof va === 'number' ? va - vb : String(va).localeCompare(String(vb));
        return this.currentSortDir === 'asc' ? cmp : -cmp;
      });
    }

    const totalPages = Math.max(1, Math.ceil(filtered.length / this.pageSize));
    if (this.currentPage > totalPages) this.currentPage = totalPages;
    const start = (this.currentPage - 1) * this.pageSize;
    const paged = filtered.slice(start, start + this.pageSize);

    let html = '<div class="overflow-x-auto"><table class="table table-zebra table-sm">' +
      '<thead><tr>' + cols.map(c => '<th class="text-base-content/50 font-semibold text-xs uppercase tracking-wider bg-base-200/50 cursor-pointer hover:text-base-content/80 select-none"' +
        (c.width ? ' style="width:' + c.width + '"' : '') +
        (c.sortKey ? ' onclick="Dash.components.table.sort(\'' + c.sortKey + '\')"' : '') +
        '>' + c.label +
        (this.currentSortKey === c.sortKey ? (this.currentSortDir === 'asc' ? ' ▲' : ' ▼') : '') +
        '</th>').join('') + '</tr></thead>' +
      '<tbody>' + paged.map(row => '<tr class="hover:bg-base-200/30 transition-colors">' + cols.map(c => '<td class="py-3">' + (typeof c.render === 'function' ? c.render(row) : Dash.util.escapeHtml(row[c.key])) + '</td>').join('') + '</tr>').join('') + '</tbody>' +
    '</table></div>';

    if (totalPages > 1) {
      html += '<div class="flex items-center justify-between px-4 py-3 border-t border-base-200/50">' +
        '<span class="text-xs text-base-content/50">' + filtered.length + ' kết quả · Trang ' + this.currentPage + '/' + totalPages + '</span>' +
        '<div class="flex gap-1">' +
          (this.currentPage > 1 ? '<button onclick="Dash.components.table.goPage(' + (this.currentPage - 1) + ')" class="btn btn-ghost btn-xs">‹</button>' : '') +
          (this.currentPage < totalPages ? '<button onclick="Dash.components.table.goPage(' + (this.currentPage + 1) + ')" class="btn btn-ghost btn-xs">›</button>' : '') +
        '</div>' +
      '</div>';
    }

    return html;
  },

  sort(key) {
    if (this.currentSortKey === key) {
      this.currentSortDir = this.currentSortDir === 'asc' ? 'desc' : 'asc';
    } else {
      this.currentSortKey = key;
      this.currentSortDir = 'asc';
    }
    this.currentPage = 1;
    Dash.app.refreshCurrentPage();
  },

  goPage(page) {
    this.currentPage = page;
    Dash.app.refreshCurrentPage();
  },

  filter(term) {
    this.searchTerm = term;
    this.currentPage = 1;
    Dash.app.refreshCurrentPage();
  },
};
window.Dash = Dash;
