var Dash = window.Dash || {};
Dash.pages = Dash.pages || {};

Dash.pages.settings = {
  currentTab: 'healthCheck',
  settings: null,

  tabs: [
    { id: 'healthCheck', label: 'Health Check', icon: '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" class="w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>' },
    { id: 'circuitBreaker', label: 'Circuit Breaker', icon: '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" class="w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>' },
    { id: 'errorCooldowns', label: 'Error Cooldowns', icon: '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" class="w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>' },
    { id: 'logging', label: 'Logging', icon: '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" class="w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>' },
    { id: 'auth', label: 'Authentication', icon: '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" class="w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"/></svg>' },
    { id: 'infra', label: 'Infrastructure', icon: '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" class="w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>' },
    { id: 'statusCompute', label: 'Status Compute', icon: '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" class="w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>' },
    { id: 'rateLimit', label: 'Rate Limiting', icon: '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" class="w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>' },
  ],

  fieldLabels: {
    healthCheck: {
      intervalMs: 'Chu kỳ kiểm tra (ms)',
      providerCooldownMs: 'Cooldown giữa các provider (ms)',
      probeTimeoutMs: 'Timeout probe (ms)',
      sweepProbeTimeoutMs: 'Timeout sweep probe (ms)',
      probeCleanupTimeoutMs: 'Timeout cleanup probe (ms)',
      interProbeDelayMs: 'Delay giữa các probe (ms)',
      sweepInterProbeDelayMs: 'Delay sweep probe (ms)',
      firstCheckDelayMs: 'Delay kiểm tra đầu tiên (ms)',
      probeMessage: 'Nội dung probe',
      probeMaxTokens: 'Max tokens probe',
      probeStaleHealthyMs: 'Thời gian stale cho model healthy (ms)',
    },
    circuitBreaker: {
      threshold: 'Ngưỡng lỗi trước khi mở',
      cooldownMs: 'Cooldown mặc định (ms)',
      requestTimeoutMs: 'Timeout request (ms)',
    },
    errorCooldowns: {
      authCooldownMs: 'Cooldown lỗi Auth (ms)',
      quotaCooldownMs: 'Cooldown lỗi Quota (ms)',
      rateLimitCooldownMs: 'Cooldown Rate Limit (ms)',
      timeoutCooldownMs: 'Cooldown Timeout (ms)',
      providerUnavailableCooldownMs: 'Cooldown Provider Unavailable (ms)',
    },
    logging: {
      maxEntries: 'Số log tối đa',
      defaultLimit: 'Default query limit',
    },
    auth: {
      sessionMaxAgeDefault: 'Session TTL mặc định (s)',
      sessionMaxAgeRemember: 'Session TTL remember (s)',
      sessionMaxAgeStandard: 'Session TTL standard (s)',
    },
    infra: {
      corsOrigin: 'CORS Origin',
      discoveryRefreshMs: 'Discovery refresh (ms)',
      staticCacheMaxAge: 'Static cache max-age (s)',
      streamingChunkSize: 'Streaming chunk size',
    },
    statusCompute: {
      degradedWindowMs: 'Cửa sổ xuống cấp (ms)',
      recentSuccessWindowMs: 'Cửa sổ thành công gần đây (ms)',
      probeConfidenceThreshold: 'Ngưỡng probe tin cậy',
      recoveryWindowMs: 'Cửa sổ phục hồi (ms)',
    },
    rateLimit: {
      chat: 'Chat Completions',
      'models-read': 'Models Read',
      'dashboard-login': 'Dashboard Login',
      'dashboard-read': 'Dashboard Read',
      'dashboard-write': 'Dashboard Write',
      memories: 'Memories',
      cleanupIntervalMs: 'Cleanup Interval (ms)',
    },
  },

  async render(container) {
    container.innerHTML = '<div class="space-y-5 p-8"><div class="skeleton-pulse h-8 w-48 rounded"></div><div class="skeleton-pulse h-96 rounded-xl"></div></div>';

    const data = await Dash.api.get('/settings');
    if (!data) { container.innerHTML = '<div class="text-center py-12 text-error">Không thể tải settings</div>'; return; }
    this.settings = data;

    if (this.rateLimitStatsInterval) {
      clearInterval(this.rateLimitStatsInterval);
      this.rateLimitStatsInterval = null;
    }

    const isRateLimit = this.currentTab === 'rateLimit';

    container.innerHTML =
      '<div class="mb-6"><p class="text-sm text-base-content/50">Quản lý cấu hình hệ thống</p></div>' +
      this.renderTabs() +
      '<div class="mt-5">' +
        (isRateLimit ? '' : this.renderSection(this.currentTab)) +
      '</div>' +
      (isRateLimit
        ? '<div id="rateLimitSection" class="mt-5"></div>'
        : ''
      ) +
      '<div class="flex gap-3 justify-end mt-6">' +
        '<button onclick="Dash.pages.settings.resetDefaults()" class="btn btn-ghost btn-sm">Reset mặc định</button>' +
        '<button onclick="Dash.pages.settings.save()" class="btn btn-primary btn-sm bg-gradient-to-r from-[#FF6B00] to-[#FFB800] border-none text-white">Lưu thay đổi</button>' +
      '</div>';

    container.querySelectorAll('.settings-tab').forEach(el => {
      el.addEventListener('click', () => {
        this.currentTab = el.dataset.tab;
        this.render(document.getElementById('pageContent'));
      });
    });

    container.querySelectorAll('.settings-input').forEach(el => {
      el.addEventListener('input', () => {
        const section = el.dataset.section;
        const key = el.dataset.key;
        let val = el.value;
        if (el.type === 'number') val = parseInt(val) || 0;
        if (!this.settings[section]) this.settings[section] = {};
        this.settings[section][key] = val;
      });
    });

    if (isRateLimit) {
      this.renderRateLimitSection();
      this.startStatsAutoRefresh();
    }
  },

  renderTabs() {
    return '<div class="flex flex-wrap gap-2 border-b border-base-300/50 pb-3">' +
      this.tabs.map(t =>
        '<button class="settings-tab flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ' +
          (this.currentTab === t.id ? 'bg-[#FF6B00]/10 text-[#FF6B00]' : 'text-base-content/60 hover:bg-base-200/50 hover:text-base-content') +
          '" data-tab="' + t.id + '">' + t.icon + t.label + '</button>'
      ).join('') +
    '</div>';
  },

  renderSection(section) {
    const labels = this.fieldLabels[section] || {};
    const data = this.settings[section] || {};

    const fields = Object.entries(data).map(([key, value]) => {
      const label = labels[key] || key;
      const isNumber = typeof value === 'number';
      const inputType = isNumber ? 'number' : 'text';
      return '<div class="form-control">' +
        '<label class="label pb-1"><span class="label-text text-xs text-base-content/60 font-medium">' + Dash.util.escapeHtml(label) + '</span></label>' +
        '<input type="' + inputType + '" class="settings-input input input-bordered input-sm w-full" data-section="' + section + '" data-key="' + key + '" value="' + Dash.util.escapeHtml(String(value)) + '"' + (isNumber ? ' min="0"' : '') + '>' +
        '<label class="label"><span class="label-text-alt text-xs text-base-content/40">' + key + '</span></label>' +
      '</div>';
    }).join('');

    return '<div class="bg-base-200/30 rounded-xl p-5 border border-base-300/30">' +
      '<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">' + fields + '</div>' +
    '</div>';
  },

  async save() {
    try {
      const result = await Dash.api.post('/settings', this.settings);
      if (result && result.ok) {
        this.settings = result.settings;
        Dash.components.toast.success('Đã lưu settings');
      }
    } catch (e) {
      Dash.components.toast.error('Lỗi lưu settings');
    }
  },

  async resetDefaults() {
    Dash.components.confirm.show(
      'Reset Settings',
      'Bạn có chắc muốn reset tất cả settings về mặc định? Thay đổi hiện tại sẽ bị mất.',
      async () => {
        const result = await Dash.api.post('/settings/reset');
        if (result && result.ok) {
          this.settings = result.settings;
          this.render(document.getElementById('pageContent'));
          Dash.components.toast.success('Đã reset settings');
        }
      },
      'Reset', 'Huỷ'
    );
  },

  renderRateLimitSection: async function () {
    const container = document.getElementById('rateLimitSection');
    if (!container) return;

    const rateData = this.settings.rateLimit || {};
    const groupLabels = this.fieldLabels.rateLimit || {};
    const groupKeys = ['chat', 'models-read', 'dashboard-login', 'dashboard-read', 'dashboard-write', 'memories'];

    let statsHtml = '';
    try {
      const stats = await Dash.api.get('/rate-limiter/stats');
      statsHtml = this.buildStatsPanel(stats);
    } catch (e) {
      statsHtml = '<div class="bg-base-200/30 rounded-xl p-5 border border-base-300/30" id="rateLimitStatsPanel"><p class="text-sm text-base-content/50">Không thể tải thống kê</p></div>';
    }

    const groupCardsHtml = groupKeys.map(key => {
      const data = rateData[key] || {};
      const label = groupLabels[key] || key;
      const enabled = data.enabled !== false;
      return '' +
        '<div class="bg-base-200/30 rounded-xl p-5 border border-base-300/30">' +
          '<div class="flex items-center justify-between mb-3">' +
            '<h3 class="text-sm font-semibold text-base-content/70">' + Dash.util.escapeHtml(label) + '</h3>' +
            '<label class="flex items-center gap-2 cursor-pointer">' +
              '<input type="checkbox" class="toggle toggle-sm rate-limit-toggle" data-group="' + key + '" ' + (enabled ? 'checked' : '') + '>' +
              '<span class="text-xs text-base-content/50">Bật</span>' +
            '</label>' +
          '</div>' +
          '<div class="grid grid-cols-2 gap-3">' +
            '<div class="form-control">' +
              '<label class="label pb-1"><span class="label-text text-xs text-base-content/60 font-medium">Limit (requests)</span></label>' +
              '<input type="number" class="rate-limit-input input input-bordered input-sm w-full" data-group="' + key + '" data-field="limit" value="' + (data.limit || '') + '" min="0">' +
            '</div>' +
            '<div class="form-control">' +
              '<label class="label pb-1"><span class="label-text text-xs text-base-content/60 font-medium">Window (ms)</span></label>' +
              '<input type="number" class="rate-limit-input input input-bordered input-sm w-full" data-group="' + key + '" data-field="windowMs" value="' + (data.windowMs || '') + '" min="0">' +
            '</div>' +
          '</div>' +
        '</div>';
    }).join('');

    container.innerHTML =
      '<div class="space-y-4">' +
        '<div class="bg-base-200/30 rounded-xl p-5 border border-base-300/30">' +
          '<div class="flex items-center justify-between">' +
            '<h3 class="text-sm font-semibold text-base-content/70">Global Settings</h3>' +
            '<label class="flex items-center gap-2 cursor-pointer">' +
              '<input type="checkbox" class="toggle toggle-sm rate-limit-toggle" data-group="__global__" data-field="enabled" ' + (rateData.enabled !== false ? 'checked' : '') + '>' +
              '<span class="text-xs text-base-content/50">Bật rate limiting</span>' +
            '</label>' +
          '</div>' +
          '<div class="mt-3">' +
            '<div class="form-control w-full sm:w-64">' +
              '<label class="label pb-1"><span class="label-text text-xs text-base-content/60 font-medium">Cleanup Interval (ms)</span></label>' +
              '<input type="number" class="rate-limit-input input input-bordered input-sm w-full" data-group="__global__" data-field="cleanupIntervalMs" value="' + (rateData.cleanupIntervalMs || 300000) + '" min="10000">' +
            '</div>' +
          '</div>' +
        '</div>' +
        (statsHtml || '<div class="bg-base-200/30 rounded-xl p-5 border border-base-300/30"><p class="text-sm text-base-content/50">Không thể tải thống kê</p></div>') +
        groupCardsHtml +
      '</div>';

    container.querySelectorAll('.rate-limit-toggle').forEach(el => {
      el.addEventListener('change', () => {
        const group = el.dataset.group;
        if (group === '__global__') {
          this.settings.rateLimit.enabled = el.checked;
        } else {
          if (!this.settings.rateLimit[group]) this.settings.rateLimit[group] = {};
          this.settings.rateLimit[group].enabled = el.checked;
        }
      });
    });

    container.querySelectorAll('.rate-limit-input').forEach(el => {
      el.addEventListener('input', () => {
        const group = el.dataset.group;
        const field = el.dataset.field;
        let val = el.value;
        if (el.type === 'number') val = parseInt(val) || 0;
        if (group === '__global__') {
          this.settings.rateLimit[field] = val;
        } else {
          if (!this.settings.rateLimit[group]) this.settings.rateLimit[group] = {};
          this.settings.rateLimit[group][field] = val;
        }
      });
    });

    const resetBtn = document.getElementById('resetStatsBtn');
    if (resetBtn) {
      resetBtn.addEventListener('click', async () => {
        const result = await Dash.api.post('/rate-limiter/reset-stats');
        if (result && result.ok) {
          await this.refreshStatsPanel();
          Dash.components.toast.success('Đã reset stats');
        }
      });
    }
  },

  buildStatsPanel: function (stats) {
    if (!stats) return '';
    const groupLabels = this.fieldLabels.rateLimit || {};
    const byGroupHtml = Object.entries(stats.byGroup || {})
      .map(([g, c]) => '<span class="badge badge-sm badge-ghost">' + Dash.util.escapeHtml(groupLabels[g] || g) + ': <strong>' + c + '</strong></span>')
      .join(' ');
    return '' +
      '<div class="bg-base-200/30 rounded-xl p-5 border border-base-300/30" id="rateLimitStatsPanel">' +
        '<div class="flex items-center justify-between mb-3">' +
          '<h3 class="text-sm font-semibold text-base-content/70">📊 Thống kê</h3>' +
          '<button id="resetStatsBtn" class="btn btn-ghost btn-xs text-error">Reset stats</button>' +
        '</div>' +
        '<div class="flex flex-wrap gap-4 text-sm">' +
          '<span class="text-base-content/60">🔴 Blocked: <strong id="statsBlocked">' + (stats.totalBlocked || 0) + '</strong></span>' +
          '<span class="text-base-content/60">🌐 Active IPs: <strong id="statsActiveIps">' + (stats.activeIps || 0) + '</strong></span>' +
        '</div>' +
        '<div class="flex flex-wrap gap-1.5 mt-3" id="statsByGroup">' + byGroupHtml + '</div>' +
      '</div>';
  },

  refreshStatsPanel: async function () {
    try {
      const stats = await Dash.api.get('/rate-limiter/stats');
      if (!stats) return;
      const blockedEl = document.getElementById('statsBlocked');
      if (blockedEl) blockedEl.textContent = stats.totalBlocked || 0;
      const activeEl = document.getElementById('statsActiveIps');
      if (activeEl) activeEl.textContent = stats.activeIps || 0;
      const byGroupEl = document.getElementById('statsByGroup');
      if (byGroupEl) {
        const groupLabels = this.fieldLabels.rateLimit || {};
        byGroupEl.innerHTML = Object.entries(stats.byGroup || {})
          .map(([g, c]) => '<span class="badge badge-sm badge-ghost">' + Dash.util.escapeHtml(groupLabels[g] || g) + ': <strong>' + c + '</strong></span>')
          .join(' ');
      }
    } catch (e) {}
  },

  startStatsAutoRefresh: function () {
    if (this.rateLimitStatsInterval) clearInterval(this.rateLimitStatsInterval);
    this.rateLimitStatsInterval = setInterval(() => {
      if (this.currentTab === 'rateLimit') {
        this.refreshStatsPanel();
      }
    }, 5000);
  },

  destroy: function () {
    if (this.rateLimitStatsInterval) {
      clearInterval(this.rateLimitStatsInterval);
      this.rateLimitStatsInterval = null;
    }
  },
};

window.Dash = Dash;
