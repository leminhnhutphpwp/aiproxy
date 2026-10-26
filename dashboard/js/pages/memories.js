var Dash = window.Dash || {};
Dash.pages = Dash.pages || {};

Dash.pages.memories = {
  currentUserId: null,
  memories: [],
  stats: null,

  async render(container) {
    container.innerHTML = '<div class="space-y-5 p-8"><div class="skeleton-pulse h-8 w-48 rounded"></div><div class="skeleton-pulse h-40 rounded-xl"></div></div>';

    const statsRes = await Dash.api.get('/memories/stats');
    this.stats = (statsRes && statsRes.ok && statsRes.data) || null;

    const userIds = this.stats?.byUser?.map(u => u.userId) || [];
    this.currentUserId = userIds[0] || '';

    await this.loadMemories();
    this.renderLayout(container);
  },

  async loadMemories() {
    if (!this.currentUserId) {
      this.memories = [];
      return;
    }
    const res = await Dash.api.get('/memories?user_id=' + encodeURIComponent(this.currentUserId));
    this.memories = (res && res.ok && res.data) || [];
  },

  renderLayout(container) {
    let statsHtml = '';
    const totalMemories = this.memories.length;
    const activeMemories = this.memories.filter(m => m.is_active).length;
    const totalTokens = this.memories.filter(m => m.is_active).reduce((s, m) => s + (m.token_count || 0), 0);
    const topCategory = this.getTopCategory();

    statsHtml =
      '<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">' +
        '<div class="stat bg-base-200/40 rounded-xl border border-base-300/20 p-4">' +
          '<div class="stat-title text-xs text-base-content/50 uppercase tracking-wide">Tổng Memories</div>' +
          '<div class="stat-value text-2xl font-bold mt-1 text-base-content">' + totalMemories + '</div>' +
        '</div>' +
        '<div class="stat bg-base-200/40 rounded-xl border border-base-300/20 p-4">' +
          '<div class="stat-title text-xs text-base-content/50 uppercase tracking-wide">Đang hoạt động</div>' +
          '<div class="stat-value text-2xl font-bold mt-1 text-success">' + activeMemories + '</div>' +
        '</div>' +
        '<div class="stat bg-base-200/40 rounded-xl border border-base-300/20 p-4">' +
          '<div class="stat-title text-xs text-base-content/50 uppercase tracking-wide">Tokens trong bộ nhớ</div>' +
          '<div class="stat-value text-2xl font-bold mt-1 text-warning">' + totalTokens + '</div>' +
        '</div>' +
        '<div class="stat bg-base-200/40 rounded-xl border border-base-300/20 p-4">' +
          '<div class="stat-title text-xs text-base-content/50 uppercase tracking-wide">Danh mục nhiều nhất</div>' +
          '<div class="stat-value text-2xl font-bold mt-1 text-info">' + Dash.util.escapeHtml(topCategory) + '</div>' +
        '</div>' +
      '</div>';

    const userIds = this.getUserIds();
    let userSelectHtml = '';
    if (userIds.length > 1) {
      userSelectHtml = '<select id="memoryUserFilter" class="select select-bordered select-sm w-48" onchange="Dash.pages.memories.switchUser(this.value)">' +
        userIds.map(uid =>
          '<option value="' + Dash.util.escapeHtml(uid) + '"' + (uid === this.currentUserId ? ' selected' : '') + '>' +
            Dash.util.escapeHtml(uid) +
          '</option>'
        ).join('') +
      '</select>';
    }

    const cats = ['all', 'preference', 'fact', 'context', 'instruction'];
    const catLabels = { all: 'Tất cả', preference: 'Preferences', fact: 'Facts', context: 'Context', instruction: 'Instructions' };

    let memoriesHtml = '';
    if (this.memories.length === 0) {
      memoriesHtml = '<div class="text-center py-16 text-base-content/40">' +
        '<div class="text-4xl mb-3">🧠</div>' +
        '<p>Chưa có memory nào. Memory sẽ tự động được trích xuất từ các cuộc hội thoại.</p>' +
        '</div>';
    } else {
      memoriesHtml = this.memories.map(m => this.renderMemoryCard(m)).join('');
    }

    let catBreakdownHtml = '';
    const breakdown = this.getCategoryBreakdown();
    if (Object.keys(breakdown).length > 0) {
      catBreakdownHtml = '<div class="flex flex-wrap gap-2 mb-4">' +
        Object.entries(breakdown).map(([cat, count]) =>
          '<span class="badge badge-sm badge-ghost gap-1">' + Dash.util.escapeHtml(catLabels[cat] || cat) +
            ' <span class="badge badge-xs">' + count + '</span></span>'
        ).join('') +
      '</div>';
    }

    container.innerHTML =
      '<div class="space-y-5 p-8">' +
        '<div class="flex items-center justify-between">' +
          '<div>' +
            '<h2 class="text-lg font-semibold text-base-content">Memory Intelligence</h2>' +
            '<p class="text-sm text-base-content/50 mt-1">Bộ nhớ cho AI Agent — tự động lưu và sử dụng thông tin qua các phiên làm việc</p>' +
          '</div>' +
          '<div class="flex items-center gap-2">' +
            userSelectHtml +
            '<button class="btn btn-sm btn-outline" onclick="Dash.pages.memories.refresh()">Làm mới</button>' +
          '</div>' +
        '</div>' +
        statsHtml +
        '<div class="bg-base-100 rounded-2xl border border-base-200/50 overflow-hidden shadow-sm p-5">' +
          '<div class="flex items-center justify-between mb-4">' +
            '<h3 class="text-sm font-semibold text-base-content">Danh sách Memories' +
              ' <span class="text-base-content/40 font-normal">(' + this.memories.length + ')</span>' +
            '</h3>' +
            '<div class="flex items-center gap-2">' +
              '<input id="memorySearchInput" type="text" placeholder="Tìm kiếm..." class="input input-bordered input-xs w-40" oninput="Dash.pages.memories.filterMemories(this.value)">' +
              '<button class="btn btn-ghost btn-xs text-error" onclick="Dash.pages.memories.clearAll()">Xoá tất cả</button>' +
            '</div>' +
          '</div>' +
          catBreakdownHtml +
          '<div class="space-y-2" id="memoryList">' + memoriesHtml + '</div>' +
        '</div>' +
      '</div>';
  },

  renderMemoryCard(m) {
    const catLabels = { preference: 'preference', fact: 'fact', context: 'context', instruction: 'instruction' };
    const catColors = { preference: 'badge-info', fact: 'badge-success', context: 'badge-warning', instruction: 'badge-primary' };
    const catColor = catColors[m.category] || 'badge-ghost';
    const tokens = m.token_count || m.content.split(/\s+/).length;
    return '<div class="memory-card flex items-start gap-3 p-3 rounded-xl bg-base-200/30 border border-base-300/10 hover:border-base-300/30 transition-all" data-id="' + Dash.util.escapeHtml(m.id) + '">' +
      '<div class="mt-0.5">' +
        '<div class="w-2 h-2 rounded-full ' + (m.is_active ? 'bg-success' : 'bg-base-300') + '"></div>' +
      '</div>' +
      '<div class="flex-1 min-w-0">' +
        '<div class="text-sm text-base-content mb-1">' + Dash.util.escapeHtml(m.content) + '</div>' +
        '<div class="flex items-center gap-2 text-xs text-base-content/50 flex-wrap">' +
          '<span class="badge badge-xs ' + catColor + '">' + (catLabels[m.category] || m.category) + '</span>' +
          '<span>' + tokens + ' tokens</span>' +
          '<span>·</span>' +
          '<span>Dùng ' + (m.use_count || 0) + ' lần</span>' +
          '<span>·</span>' +
          '<span>' + (m.last_used_at ? 'Lần cuối: ' + new Date(m.last_used_at).toLocaleDateString('vi-VN') : 'Chưa dùng') + '</span>' +
          '<span>·</span>' +
          '<span class="' + (m.confidence >= 0.8 ? 'text-success' : m.confidence >= 0.5 ? 'text-warning' : 'text-error') + '">' +
            Math.round(m.confidence * 100) + '% tin cậy' +
          '</span>' +
        '</div>' +
        (m.tags && m.tags.length > 0
          ? '<div class="flex gap-1 mt-1">' + m.tags.map(t => '<span class="badge badge-xs badge-ghost">#' + Dash.util.escapeHtml(t) + '</span>').join('') + '</div>'
          : '') +
      '</div>' +
      '<div class="flex gap-1 flex-shrink-0">' +
        '<button class="btn btn-ghost btn-xs btn-square text-base-content/30 hover:text-info" title="Sửa" onclick="Dash.pages.memories.showEditModal(\'' + Dash.util.escapeHtml(m.id) + '\')">' +
          '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" class="w-3.5 h-3.5"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>' +
        '</button>' +
        '<button class="btn btn-ghost btn-xs btn-square text-base-content/30 hover:text-error" title="Xoá" onclick="Dash.pages.memories.deleteMemory(\'' + Dash.util.escapeHtml(m.id) + '\')">' +
          '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" class="w-3.5 h-3.5"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>' +
        '</button>' +
      '</div>' +
    '</div>';
  },

  getCategoryBreakdown() {
    const breakdown = {};
    for (const m of this.memories) {
      breakdown[m.category] = (breakdown[m.category] || 0) + 1;
    }
    return breakdown;
  },

  getTopCategory() {
    const breakdown = this.getCategoryBreakdown();
    const max = Object.entries(breakdown).sort((a, b) => b[1] - a[1]);
    return max.length > 0 ? max[0][0] : '—';
  },

  getUserIds() {
    const fromMemories = [...new Set(this.memories.map(m => m.user_id))];
    const fromStats = this.stats?.byUser?.map(u => u.userId) || [];
    const all = [...new Set([...fromMemories, ...fromStats])];
    return all.length > 0 ? all : [this.currentUserId].filter(Boolean);
  },

  async switchUser(userId) {
    this.currentUserId = userId;
    await this.loadMemories();
    const container = document.getElementById('pageContent');
    if (container) this.renderLayout(container);
  },

  async refresh() {
    const statsRes = await Dash.api.get('/memories/stats');
    this.stats = (statsRes && statsRes.ok && statsRes.data) || null;
    await this.loadMemories();
    const container = document.getElementById('pageContent');
    if (container) this.renderLayout(container);
    Dash.components.toast.success('Đã làm mới');
  },

  filterMemories(query) {
    const cards = document.querySelectorAll('.memory-card');
    const q = query.toLowerCase();
    cards.forEach(card => {
      const text = card.textContent.toLowerCase();
      card.style.display = text.includes(q) ? '' : 'none';
    });
  },

  async showEditModal(id) {
    const m = this.memories.find(x => x.id === id);
    if (!m) return;

    const categoryLabels = { preference: 'Preference', fact: 'Fact', context: 'Context', instruction: 'Instruction' };
    const catOptions = Object.entries(categoryLabels)
      .map(([val, label]) => '<option value="' + val + '"' + (val === m.category ? ' selected' : '') + '>' + label + '</option>')
      .join('');

    const div = document.createElement('div');
    div.innerHTML =
      '<div class="space-y-4">' +
        '<div class="form-control">' +
          '<label class="label"><span class="label-text">Nội dung</span></label>' +
          '<textarea id="editMemContent" class="textarea textarea-bordered textarea-sm h-20">' + Dash.util.escapeHtml(m.content) + '</textarea>' +
        '</div>' +
        '<div class="form-control">' +
          '<label class="label"><span class="label-text">Danh mục</span></label>' +
          '<select id="editMemCategory" class="select select-bordered select-sm">' + catOptions + '</select>' +
        '</div>' +
        '<div class="form-control">' +
          '<label class="label cursor-pointer justify-start gap-2">' +
            '<input type="checkbox" id="editMemActive" class="checkbox checkbox-sm"' + (m.is_active ? ' checked' : '') + '>' +
            '<span class="label-text">Hoạt động</span>' +
          '</label>' +
        '</div>' +
      '</div>';

    Dash.components.modal.show('Sửa Memory', div, [
      { text: 'Hủy', class: 'btn btn-ghost btn-sm', action: () => Dash.components.modal.close() },
      {
        text: 'Lưu', class: 'btn btn-primary btn-sm bg-gradient-to-r from-[#FF6B00] to-[#FFB800] border-none text-white',
        action: async () => {
          const content = document.getElementById('editMemContent').value.trim();
          const category = document.getElementById('editMemCategory').value;
          const is_active = document.getElementById('editMemActive').checked;
          if (!content) { Dash.components.toast.error('Nội dung không được để trống'); return; }

          const result = await Dash.api.put('/memories/' + id, {
            user_id: m.user_id,
            content,
            category,
            is_active,
          });
          if (result && result.ok) {
            Dash.components.toast.success('Đã cập nhật');
            Dash.components.modal.close();
            await this.refresh();
          } else {
            Dash.components.toast.error('Lỗi: ' + (result?.error || 'unknown'));
          }
        }
      },
    ]);
  },

  async deleteMemory(id) {
    const m = this.memories.find(x => x.id === id);
    if (!m) return;
    Dash.components.confirm.show(
      'Xoá Memory',
      'Xoá memory này? Hành động này không thể hoàn tác.',
      async () => {
        const result = await Dash.api.del('/memories/' + id + '?user_id=' + encodeURIComponent(m.user_id));
        if (result && result.ok) {
          Dash.components.toast.success('Đã xoá');
          await this.refresh();
        } else {
          Dash.components.toast.error('Lỗi: ' + (result?.error || 'unknown'));
        }
      },
      'Xoá', 'Hủy'
    );
  },

  async clearAll() {
    if (!this.currentUserId) return;
    Dash.components.confirm.show(
      'Xoá tất cả',
      'Xoá toàn bộ memories cho user này? Hành động này không thể hoàn tác.',
      async () => {
        const result = await Dash.api.post('/memories/clear', { user_id: this.currentUserId });
        if (result && result.ok) {
          Dash.components.toast.success('Đã xoá tất cả');
          await this.refresh();
        } else {
          Dash.components.toast.error('Lỗi: ' + (result?.error || 'unknown'));
        }
      },
      'Xoá tất cả', 'Hủy'
    );
  },
};

window.Dash = Dash;
