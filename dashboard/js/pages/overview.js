var Dash = window.Dash || {};
Dash.pages = Dash.pages || {};

Dash.pages.overview = {
  timer: null,
  chartData: null,

  async render(container) {
    container.innerHTML =
      '<div class="space-y-6 p-8">' +
        '<div class="skeleton-pulse h-6 w-56 rounded"></div>' +
        '<div class="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">' +
          Array(8).fill('<div class="skeleton-pulse h-20 rounded-xl"></div>').join('') +
        '</div>' +
        '<div class="grid grid-cols-1 lg:grid-cols-2 gap-5">' +
          '<div class="skeleton-pulse h-56 rounded-xl"></div>' +
          '<div class="skeleton-pulse h-56 rounded-xl"></div>' +
        '</div>' +
        '<div class="grid grid-cols-1 sm:grid-cols-3 gap-5">' +
          Array(3).fill('<div class="skeleton-pulse h-48 rounded-xl"></div>').join('') +
        '</div>' +
      '</div>';

    await this.loadData();
    this.startAutoRefresh();
  },

  destroy() {
    this.stopAutoRefresh();
    Dash.components.charts.destroy();
  },

  startAutoRefresh() {
    this.stopAutoRefresh();
    this.timer = setInterval(() => this.loadData(), 30000);
  },

  stopAutoRefresh() {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
  },

  async loadData() {
    const [overview, breakdown, latency] = await Promise.all([
      Dash.api.get('/overview'),
      Dash.api.get('/logs/breakdown?days=1'),
      Dash.api.get('/provider-latency'),
    ]);
    if (!overview) return;
    this.chartData = { overview, breakdown, latency };
    this.renderContent(overview, breakdown, latency);
  },

  renderContent(data, breakdown, latency) {
    const container = document.getElementById('pageContent');
    if (!container) return;

    const topModels = (data.topModels || []).slice(0, 5);
    const recentErrors = (breakdown?.byModel || []).filter(m => m.error > 0).slice(0, 5);

    const _t = Dash.i18n.t;
    const isVi = Dash.i18n.locale === 'vi';
    container.innerHTML =
      '<div class="space-y-6">' +
        '<div class="flex items-center justify-between">' +
          '<p class="text-sm text-base-content/50">' + _t('overview.title') + '</p>' +
          '<button class="btn btn-xs" onclick="Dash.pages.overview.loadData()">' + _t('common.refresh') + '</button>' +
        '</div>' +

        /* Row 1: Stat cards (8) */
        '<div class="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">' +
          this._statCard('🤖', data.totalModels, _t('overview.total_models'), data.available + ' ' + _t('common.available')) +
          this._statCard('✅', data.available, _t('overview.active'), data.degraded > 0 ? data.degraded + ' degraded' : '') +
          this._statCard('📈', Dash.util.formatNumber(data.todayRequests), _t('overview.today'), '+' + Math.round((data.totalRequests || 1) / Math.max(1, data.todayRequests || 1) * 10) / 10 + 'x') +
          this._statCard('📊', Dash.util.formatNumber(data.totalRequests), _t('overview.total_requests'), data.successRate != null ? data.successRate + '% ' + _t('common.success') + ' (' + _t('overview.success_note') + ')' : '') +
          this._statCard('⏱️', data.avgLatency > 0 ? data.avgLatency + 'ms' : '—', _t('overview.latency'), Dash.util.formatUptime(data.uptime) + ' ' + _t('common.uptime')) +
          this._statCard('🔢', Dash.util.formatNumber(data.todayTokens), _t('overview.tokens_today'), data.todayCost > 0 ? '$' + data.todayCost : '') +
          this._statCard('💰', data.todayCost > 0 ? '$' + data.todayCost : '$0', _t('overview.cost_today'), data.todayErrors + ' ' + _t('health.failure')) +
          this._statCard('📋', Dash.util.formatNumber(data.totalTokens), _t('overview.total_tokens'), data.successRate != null ? data.successRate + '%' : '') +
        '</div>' +

        /* Row 2: Charts (2 cols) */
        '<div class="grid grid-cols-1 lg:grid-cols-2 gap-5">' +
          '<div class="bg-base-100 rounded-2xl border border-base-200/50 p-4 shadow-sm">' +
            '<h3 class="text-sm font-semibold text-base-content mb-3">📊 Request Volume (24h)</h3>' +
            '<div class="h-52"><canvas id="chartRequestVolume"></canvas></div>' +
          '</div>' +
          '<div class="bg-base-100 rounded-2xl border border-base-200/50 p-4 shadow-sm">' +
            '<h3 class="text-sm font-semibold text-base-content mb-3">📈 Token Usage (24h)</h3>' +
            '<div class="h-52"><canvas id="chartTokenUsage"></canvas></div>' +
          '</div>' +
        '</div>' +

        /* Row 3: Small charts (3 cols) */
        '<div class="grid grid-cols-1 sm:grid-cols-3 gap-5">' +
          '<div class="bg-base-100 rounded-2xl border border-base-200/50 p-4 shadow-sm">' +
            '<h3 class="text-sm font-semibold text-base-content mb-3">🥧 Model Usage</h3>' +
            '<div class="h-44"><canvas id="chartModelPie"></canvas></div>' +
          '</div>' +
          '<div class="bg-base-100 rounded-2xl border border-base-200/50 p-4 shadow-sm">' +
            '<h3 class="text-sm font-semibold text-base-content mb-3">⚡ Provider Latency</h3>' +
            '<div class="h-44"><canvas id="chartLatency"></canvas></div>' +
          '</div>' +
          '<div class="bg-base-100 rounded-2xl border border-base-200/50 p-4 shadow-sm">' +
            '<h3 class="text-sm font-semibold text-base-content mb-3">🔴 Status Codes</h3>' +
            '<div class="h-44"><canvas id="chartStatusPie"></canvas></div>' +
          '</div>' +
        '</div>' +

        /* Row 4: Tables (2 cols) */
        '<div class="grid grid-cols-1 lg:grid-cols-2 gap-5">' +
          /* Top models */
          '<div class="bg-base-100 rounded-2xl border border-base-200/50 shadow-sm">' +
            '<div class="px-4 py-3 border-b border-base-200/50 flex items-center justify-between">' +
              '<h3 class="text-sm font-semibold">🏆 Top Models</h3>' +
              '<a href="#models" class="text-xs text-warning hover:text-warning font-medium">Xem tất cả →</a>' +
            '</div>' +
            '<div class="overflow-x-auto">' +
              '<table class="table table-xs w-full">' +
                '<thead><tr class="text-base-content/50 text-xs">' +
                  '<th>Model</th><th>Requests</th><th>' + _t('common.success') + '*</th><th>Tokens</th><th>Trend</th>' +
                '</tr></thead><tbody>' +
                (topModels.length > 0 ? topModels.map(m =>
                  '<tr class="hover:bg-base-200/30">' +
                    '<td class="font-medium text-sm">' + Dash.util.escapeHtml(m.id) + '</td>' +
                    '<td>' + Dash.util.formatNumber(m.requests) + '</td>' +
                    '<td class="' + (m.successRate >= 80 ? 'text-success' : m.successRate >= 50 ? 'text-warning' : 'text-error') + '">' + (m.successRate != null ? m.successRate + '%' : '—') + '</td>' +
                    '<td>' + Dash.util.formatNumber(m.tokens) + '</td>' +
                    '<td>' + (m.trendDirection === 'rising' ? '📈' : m.trendDirection === 'declining' ? '📉' : '➡️') + '</td>' +
                  '</tr>'
                ).join('') : '<tr><td colspan="5" class="text-center text-base-content/30 py-4">Chưa có dữ liệu</td></tr>') +
                '</tbody></table>' +
            '</div>' +
          '</div>' +
          /* Recent errors */
          '<div class="bg-base-100 rounded-2xl border border-base-200/50 shadow-sm">' +
            '<div class="px-4 py-3 border-b border-base-200/50 flex items-center justify-between">' +
              '<h3 class="text-sm font-semibold">❌ Models with Errors</h3>' +
              '<a href="#logs?status=error" class="text-xs text-warning hover:text-warning font-medium">Xem logs →</a>' +
            '</div>' +
            '<div class="overflow-x-auto">' +
              '<table class="table table-xs w-full">' +
                '<thead><tr class="text-base-content/50 text-xs">' +
                  '<th>Model</th><th>Success</th><th>Errors</th><th>Total</th><th>Rate</th>' +
                '</tr></thead><tbody>' +
                (recentErrors.length > 0 ? recentErrors.map(m =>
                  '<tr class="hover:bg-base-200/30">' +
                    '<td class="font-medium text-sm">' + Dash.util.escapeHtml(m.model) + '</td>' +
                    '<td class="text-success">' + m.success + '</td>' +
                    '<td class="text-error">' + m.error + '</td>' +
                    '<td>' + m.total + '</td>' +
                    '<td>' + (m.total > 0 ? Math.round(m.success / m.total * 100) + '%' : '—') + '</td>' +
                  '</tr>'
                ).join('') : '<tr><td colspan="5" class="text-center text-base-content/30 py-4">Không có lỗi trong 24h qua</td></tr>') +
                '</tbody></table>' +
          '</div>' +
        '</div>' +
        '</div>' +
        '<div class="text-[10px] text-base-content/30 text-right">* ' + _t('overview.footnote') + '</div>' +

        /* Memory widget */
        '<div id="overviewMemoryWidget"></div>' +
      '</div>';

    this.renderCharts(data, breakdown, latency);
    this.renderMemoryWidget();
  },

  _statCard(icon, value, label, note) {
    return '<div class="stat bg-base-100 border border-base-200/50 rounded-xl p-3 stat-card-hover">' +
      '<div class="text-lg mb-0.5">' + icon + '</div>' +
      '<div class="text-lg font-bold text-base-content leading-tight">' + (value ?? '—') + '</div>' +
      '<div class="text-xs text-base-content/50 mt-0.5">' + Dash.util.escapeHtml(label) + '</div>' +
      (note ? '<div class="text-[10px] text-base-content/30 mt-0.5">' + Dash.util.escapeHtml(note) + '</div>' : '') +
    '</div>';
  },

  async renderCharts(data, breakdown, latency) {
    await Dash.components.charts.loadLib();
    const requests28d = await Dash.api.get('/usage?hours=24');
    const hourly = requests28d?.hourly || [];
    Dash.components.charts.requestVolumeChart('chartRequestVolume', hourly);
    Dash.components.charts.tokenUsageChart('chartTokenUsage', hourly);
    Dash.components.charts.modelPieChart('chartModelPie', data.topModels || []);
    Dash.components.charts.providerLatencyChart('chartLatency', latency || {});
    const statusCodes = breakdown?.statusCodes || {};
    Dash.components.charts.statusPieChart('chartStatusPie', statusCodes);
  },

  async renderMemoryWidget() {
    const statsRes = await Dash.api.get('/memories/stats');
    if (!statsRes || !statsRes.ok || !statsRes.data) {
      const el = document.getElementById('overviewMemoryWidget');
      if (el) el.innerHTML = '';
      return;
    }
    const data = statsRes.data;
    const el = document.getElementById('overviewMemoryWidget');
    if (!el) return;
    el.innerHTML =
      '<div class="bg-base-100 rounded-2xl border border-base-200/50 overflow-hidden shadow-sm p-5">' +
        '<div class="flex items-center justify-between mb-4">' +
          '<h3 class="text-sm font-semibold text-base-content">🧠 Memory Intelligence</h3>' +
          '<a href="#memories" class="text-xs text-warning hover:text-warning font-medium">Chi tiết →</a>' +
        '</div>' +
        '<div class="grid grid-cols-2 sm:grid-cols-4 gap-4">' +
          '<div><div class="text-xs text-base-content/50 uppercase tracking-wide">Users</div><div class="text-lg font-bold text-base-content mt-1">' + (data.totalUsers || 0) + '</div></div>' +
          '<div><div class="text-xs text-base-content/50 uppercase tracking-wide">Memories</div><div class="text-lg font-bold text-base-content mt-1">' + (data.totalMemories || 0) + '</div></div>' +
          '<div><div class="text-xs text-base-content/50 uppercase tracking-wide">Tokens Stored</div><div class="text-lg font-bold text-warning mt-1">' + Dash.util.formatNumber(data.totalTokens || 0) + '</div></div>' +
          '<div><div class="text-xs text-base-content/50 uppercase tracking-wide">Avg/User</div><div class="text-lg font-bold text-info mt-1">' +
            (data.totalUsers > 0 ? Math.round(data.totalMemories / data.totalUsers) : 0) + '</div></div>' +
        '</div>' +
      '</div>';
  },
};

window.Dash = Dash;
