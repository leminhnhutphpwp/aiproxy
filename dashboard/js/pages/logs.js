var Dash = window.Dash || {};
Dash.pages = Dash.pages || {};

Dash.pages.logs = {
  timer: null,
  filterModel: '',
  filterStatus: '',
  page: 1,
  pageSize: 50,
  total: 0,
  refreshLock: false,

  async render(container) {
    this.filterModel = '';
    this.filterStatus = '';
    this.page = 1;
    container.innerHTML =
      '<div class="space-y-5">' +
        '<div class="mb-5">' +
          '<p class="text-sm text-base-content/50">Lịch sử request gần đây</p>' +
        '</div>' +
        '<div class="flex gap-3 mb-4">' +
          '<input id="logFilterModel" placeholder="Lọc theo model..." class="input input-bordered input-sm w-48" oninput="Dash.pages.logs.filterModel=this.value; Dash.pages.logs.page=1; Dash.pages.logs.refresh()">' +
          '<select id="logFilterStatus" class="select select-bordered select-sm" onchange="Dash.pages.logs.filterStatus=this.value; Dash.pages.logs.page=1; Dash.pages.logs.refresh()">' +
            '<option value="">Tất cả</option>' +
            '<option value="success">Thành công</option>' +
            '<option value="error">Lỗi</option>' +
          '</select>' +
          '<select id="logPageSize" class="select select-bordered select-sm" onchange="Dash.pages.logs.pageSize=parseInt(this.value); Dash.pages.logs.page=1; Dash.pages.logs.refresh()">' +
            '<option value="25">25 / trang</option>' +
            '<option value="50" selected>50 / trang</option>' +
            '<option value="100">100 / trang</option>' +
          '</select>' +
        '</div>' +
        '<div id="logTableWrap" class="bg-base-100 rounded-2xl border border-base-200/50 overflow-hidden shadow-sm">' +
          '<div class="flex items-center justify-center py-20">' +
            '<div class="loading loading-spinner loading-md text-warning"></div>' +
          '</div>' +
        '</div>' +
      '</div>';

    await this.refresh();
    this.startAutoRefresh();
  },

  destroy() {
    this.stopAutoRefresh();
  },

  startAutoRefresh() {
    this.stopAutoRefresh();
    this.timer = setInterval(() => this.refresh(), 10000);
  },

  stopAutoRefresh() {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
  },

  renderPagination(total, page, pageSize) {
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    if (totalPages <= 1) return '';
    const self = this;
    let html = '<div class="flex items-center justify-center gap-1 px-4 py-3 border-t border-base-200 text-xs">';

    // Prev
    html += '<button class="btn btn-xs ' + (page <= 1 ? 'btn-disabled' : '') + '" onclick="Dash.pages.logs.goToPage(' + (page - 1) + ')" ' + (page <= 1 ? 'disabled' : '') + '>‹ Trước</button>';

    // Page numbers
    const startPage = Math.max(1, page - 2);
    const endPage = Math.min(totalPages, page + 2);
    if (startPage > 1) {
      html += '<button class="btn btn-xs" onclick="Dash.pages.logs.goToPage(1)">1</button>';
      if (startPage > 2) html += '<span class="text-base-content/30">...</span>';
    }
    for (let i = startPage; i <= endPage; i++) {
      html += '<button class="btn btn-xs ' + (i === page ? 'btn-primary' : '') + '" onclick="Dash.pages.logs.goToPage(' + i + ')">' + i + '</button>';
    }
    if (endPage < totalPages) {
      if (endPage < totalPages - 1) html += '<span class="text-base-content/30">...</span>';
      html += '<button class="btn btn-xs" onclick="Dash.pages.logs.goToPage(' + totalPages + ')">' + totalPages + '</button>';
    }

    // Next
    html += '<button class="btn btn-xs ' + (page >= totalPages ? 'btn-disabled' : '') + '" onclick="Dash.pages.logs.goToPage(' + (page + 1) + ')" ' + (page >= totalPages ? 'disabled' : '') + '>Sau ›</button>';
    html += '</div>';
    return html;
  },

  goToPage(p) {
    this.page = p;
    this.stopAutoRefresh();
    this.refresh();
  },

  async refresh() {
    if (this.refreshLock) return;
    this.refreshLock = true;
    try {
      const params = new URLSearchParams();
      params.set('limit', String(this.pageSize));
      params.set('offset', String((this.page - 1) * this.pageSize));
      if (this.filterModel) params.set('model', this.filterModel);
      if (this.filterStatus) params.set('status', this.filterStatus);

      const data = await Dash.api.get('/logs?' + params.toString());
      if (!data) return;

      this.total = data.total || 0;
      const entries = data.entries || [];
      const cols = [
        { key: 'ts', label: 'Thời gian', render: (r) => '<span class="text-xs text-base-content/60">' + (r.ts ? new Date(r.ts).toLocaleTimeString('vi-VN') : '—') + '</span>' },
        { key: 'model', label: 'Model', render: (r) => '<span class="text-sm font-medium text-base-content">' + Dash.util.escapeHtml(r.model || r.alias || '—') + '</span>' },
        { key: 'provider', label: 'Provider', render: (r) => '<span class="text-sm text-base-content/80">' + Dash.util.escapeHtml(r.provider || '—') + '</span>' },
        { key: 'user', label: 'User', render: (r) => '<span class="text-sm text-base-content/80">' + Dash.util.escapeHtml(r.userEmail || r.userId || '—') + '</span>' },
        { key: 'statusCode', label: 'Status', render: (r) => {
          const code = r.statusCode;
          if (!code) return '<span class="text-base-content/50">—</span>';
          const c = code < 300 ? 'text-success' : code < 500 ? 'text-warning' : 'text-error';
          return '<span class="font-medium ' + c + '">' + code + '</span>';
        }},
        { key: 'latencyMs', label: 'Latency', render: (r) => {
          if (!r.latencyMs) return '<span class="text-base-content/50">—</span>';
          return '<span class="text-sm text-base-content/80">' + r.latencyMs + 'ms</span>';
        }},
        { key: 'error', label: 'Error', render: (r) => r.error ? '<span class="text-xs text-error max-w-[200px] truncate block" title="' + Dash.util.escapeHtml(r.error || '') + '">' + Dash.util.escapeHtml(r.error) + '</span>' : '<span class="text-base-content/30">—</span>' },
      ];

      const from = (this.page - 1) * this.pageSize + 1;
      const to = Math.min(this.page * this.pageSize, this.total);
      const wrap = document.getElementById('logTableWrap');
      if (wrap) {
        wrap.innerHTML =
          Dash.components.table.render(cols, entries) +
          '<div class="px-4 py-2 border-t border-base-200 flex items-center justify-between text-xs text-base-content/50">' +
            '<span>Trang ' + this.page + '/' + Math.max(1, Math.ceil(this.total / this.pageSize)) + ' · ' + from + '-' + to + '/' + this.total + ' entries</span>' +
          '</div>' +
          this.renderPagination(this.total, this.page, this.pageSize);
      }
    } finally {
      this.refreshLock = false;
    }
  },
};

window.Dash = Dash;
