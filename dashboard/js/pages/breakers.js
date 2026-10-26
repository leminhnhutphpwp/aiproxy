var Dash = window.Dash || {};
Dash.pages = Dash.pages || {};

Dash.pages.breakers = {
  async render(container) {
    container.innerHTML = '<div class="space-y-5 p-8"><div class="skeleton-pulse h-8 w-48 rounded"></div><div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5"><div class="skeleton-pulse h-24 rounded-xl"></div><div class="skeleton-pulse h-24 rounded-xl"></div><div class="skeleton-pulse h-24 rounded-xl"></div><div class="skeleton-pulse h-24 rounded-xl"></div></div><div class="skeleton-pulse h-40 rounded-xl mt-5"></div></div>';
    await this.load(container);
  },

  async load(container) {
    const data = await Dash.api.get('/breakers');
    if (!data) { container.innerHTML = '<div class="text-center py-12 text-error">Không thể tải dữ liệu</div>'; return; }

    const breakers = Array.isArray(data) ? data : [];
    const cols = [
      { key: 'key', label: 'Key', render: (r) => '<span class="font-medium text-base-content text-sm">' + Dash.util.escapeHtml(r.key) + '</span>' },
      { key: 'reason', label: 'Lý do', render: (r) => '<span class="text-base-content/80">' + Dash.util.escapeHtml(r.reason || '—') + '</span>' },
      { key: 'scope', label: 'Scope', render: (r) => '<span class="text-xs bg-base-200 text-base-content/80 px-2 py-0.5 rounded-full">' + (r.scope || 'candidate') + '</span>' },
      { key: 'expiresIn', label: 'Còn lại', render: (r) => {
        if (!r.expiresIn) return '<span class="text-base-content/50">—</span>';
        const s = Math.ceil(r.expiresIn / 1000);
        return '<span class="text-base-content/80">' + s + 's</span>';
      }},
      { key: '', label: '', render: (r) => '<button onclick="Dash.pages.breakers.reset(\'' + Dash.util.escapeHtml(r.key).replace(/'/g, "\\'") + '\')" class="text-xs text-warning hover:text-warning font-medium">Reset</button>' },
    ];

    container.innerHTML =
      '<div class="mb-5 flex items-center justify-between">' +
        '<div><p class="text-sm text-base-content/50">Trạng thái bảo vệ circuit breaker</p></div>' +
        (breakers.length > 0 ? '<button onclick="Dash.pages.breakers.resetAll()" class="btn btn-outline btn-sm">Reset tất cả</button>' : '') +
      '</div>' +
      '<div class="bg-base-100 rounded-2xl border border-base-200/50 overflow-hidden shadow-sm">' +
        Dash.components.table.render(cols, breakers) +
      '</div>';
  },

  async reset(key) {
    Dash.components.confirm.show(
      'Reset Breaker',
      'Bạn có chắc muốn reset breaker "' + key + '"?',
      async () => {
        const result = await Dash.api.post('/breaker/reset', { key });
        if (result && result.ok) {
          Dash.components.toast.success('Đã reset breaker: ' + key);
          Dash.pages.breakers.load(document.getElementById('pageContent'));
        }
      },
      'Reset', 'Huỷ'
    );
  },

  async resetAll() {
    Dash.components.confirm.show(
      'Reset Tất Cả Breakers',
      'Bạn có chắc muốn reset tất cả circuit breakers? Hành động này không thể hoàn tác.',
      async () => {
        const result = await Dash.api.post('/breaker/reset', { all: true });
        if (result && result.ok) {
          Dash.components.toast.success('Đã reset tất cả breakers');
          Dash.pages.breakers.load(document.getElementById('pageContent'));
        }
      },
      'Reset tất cả', 'Huỷ'
    );
  },
};

window.Dash = Dash;
