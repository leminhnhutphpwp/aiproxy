var Dash = window.Dash || {};
Dash.pages = Dash.pages || {};

Dash.pages.models = {
  timer: null,
  refreshLock: false,
  container: null,
  lastUpdatedAt: null,

  async render(container) {
    const _t = Dash.i18n.t;
    const isVi = Dash.i18n.locale === 'vi';
    this.stopAutoRefresh();
    this.container = container;
    container.innerHTML = '<div class="space-y-5 p-8"><div class="skeleton-pulse h-8 w-48 rounded"></div><div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5"><div class="skeleton-pulse h-24 rounded-xl"></div><div class="skeleton-pulse h-24 rounded-xl"></div><div class="skeleton-pulse h-24 rounded-xl"></div><div class="skeleton-pulse h-24 rounded-xl"></div></div><div class="skeleton-pulse h-40 rounded-xl mt-5"></div></div>';
    await this.refresh(true);
    this.startAutoRefresh();
  },

  destroy() {
    this.stopAutoRefresh();
    this.container = null;
  },

  startAutoRefresh() {
    this.stopAutoRefresh();
    this.timer = setInterval(() => this.refresh(false), 30000);
  },

  stopAutoRefresh() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  },

  formatLastUpdated() {
    return this.lastUpdatedAt ? new Date(this.lastUpdatedAt).toLocaleString('vi-VN') : '—';
  },

  async refresh(showErrorState) {
    if (this.refreshLock) return;
    this.refreshLock = true;
    const container = this.container;
    try {
      const [data, syncData] = await Promise.all([
        Dash.api.get('/status'),
        Dash.api.get('/sync/status'),
      ]);
      if (!data || !data.data) {
        if (showErrorState && container) {
          container.innerHTML = '<div class="text-center py-12 text-error">Không thể tải dữ liệu</div>';
        }
        return;
      }

      const models = data.data;
      const modelPricing = {
        'deepseek-v4-flash': { input: 0.14, output: 0.28 },
        'deepseek-v4-pro': { input: 0.435, output: 0.87 },
        'claude-haiku-4-5': { input: 1, output: 5 },
        'claude-sonnet-4-6': { input: 3, output: 15 },
        'claude-opus-4-6': { input: 5, output: 25 },
        'claude-opus-4-7': { input: 5, output: 25 },
        'claude-opus-4-8': { input: 5, output: 25 },
        'gpt-5.4-mini': { input: 1.25, output: 7.5 },
        'gpt-5.4': { input: 2.5, output: 15 },
        'gpt-5.5': { input: 5, output: 30 },
        'glm-5.1': { input: 0.5, output: 2 },
        'glm-5.2': { input: 0.8, output: 3 },
        'gpt-3.5-turbo': { input: 0.5, output: 1.5 },
        'gpt-4': { input: 0.5, output: 1.5 },
        'gpt-5.2': { input: 1.5, output: 6 },
      };
      const cols = [
        { key: 'id', label: 'Model ID', render: (r) => '<span class="font-medium text-base-content">' + Dash.util.escapeHtml(r.id) + '</span>' },
        { key: 'status', label: _t('common.status'), render: (r) => Dash.components.badge.html(r.status) },
        { key: 'provider', label: _t('models.provider'), render: (r) => '<span class="text-base-content/80">' + Dash.util.escapeHtml(r.provider || '—') + '</span>' },
        { key: 'pricing', label: _t('models.price'), render: (r) => {
          const p = modelPricing[r.id];
          if (!p) return '<span class="text-base-content/50">—</span>';
          return '<span class="text-xs text-base-content/80">$' + p.input + '/' + p.output + '</span>';
        }},
        { key: 'successRate', label: _t('common.success'), render: (r) => {
          const v = r.successRate;
          if (v == null) return '<span class="text-base-content/50">—</span>';
          const c = v >= 95 ? 'text-success' : v >= 80 ? 'text-warning' : 'text-error';
          return '<span class="font-medium ' + c + '">' + v + '%</span>';
        }},
        { key: 'totalTokens', label: _t('models.tokens'), render: (r) => '<span class="text-base-content/80">' + Dash.util.formatNumber(r.totalTokens) + '</span>' },
        { key: '', label: '', render: (r) => '<button onclick="Dash.pages.models.showDetail(\'' + Dash.util.escapeHtml(r.id) + '\')" class="text-xs text-warning hover:text-warning font-medium">' + _t('models.detail') + '</button>' },
        { key: '', label: '', render: (r) => '<button onclick="Dash.pages.models.showMetadataEditor(\'' + Dash.util.escapeHtml(r.id) + '\')" class="text-xs text-info hover:text-info font-medium">' + _t('models.metadata') + '</button>' },
      ];

      const searchInputId = 'modelSearch';
      this.lastUpdatedAt = Date.now();
      if (!container) return;

      let syncBanner = '';
      if (syncData) {
        if (syncData.synced) {
          const driftBadge = syncData.hasDrift
            ? '<span class="badge badge-warning badge-xs ml-2">Drifted</span>'
            : '<span class="badge badge-success badge-xs ml-2">Synced</span>';
          syncBanner = '<div class="mb-4 p-3 rounded-xl bg-base-200/30 border border-base-300/10 flex items-center justify-between text-xs text-base-content/70">' +
            '<div class="flex items-center gap-3">' +
               '<span>Sync v' + (syncData.version || '?') + '</span>' +
              '<span>Last: ' + (syncData.lastSync ? new Date(syncData.lastSync).toLocaleString(isVi ? 'vi-VN' : 'en-US') : '—') + '</span>' +
              '<span>Overrides: ' + (syncData.overrideCount || 0) + '</span>' +
              driftBadge +
            '</div>' +
            '<button class="btn btn-xs btn-ghost" onclick="Dash.pages.models.checkSyncDrift()">Check Drift</button>' +
          '</div>';
        } else {
          syncBanner = '<div class="mb-4 p-3 rounded-xl bg-warning/5 border border-warning/10 text-xs text-warning flex items-center justify-between">' +
            '<span>Catalog sync chưa được chạy. Model metadata có thể không chính xác.</span>' +
            '<button class="btn btn-xs btn-warning" onclick="Dash.pages.models.triggerSync()">Sync Now</button>' +
          '</div>';
        }
      }

      container.innerHTML =
        syncBanner +
        '<div class="mb-5 flex items-center justify-between gap-3">' +
          '<div><p class="text-sm text-base-content/50">Trạng thái tất cả model (' + models.length + ')</p><p class="text-xs text-base-content/40 mt-1">Cập nhật lần cuối: ' + this.formatLastUpdated() + '</p></div>' +
          '<button class="btn btn-sm btn-outline" onclick="Dash.pages.models.refresh(true)">Làm mới</button>' +
        '</div>' +
        '<div class="mb-4"><input id="' + searchInputId + '" type="text" placeholder="Tìm kiếm model..." class="input input-bordered input-sm w-64" oninput="Dash.components.table.filter(this.value)"></div>' +
        '<div class="bg-base-100 rounded-2xl border border-base-200/50 overflow-hidden shadow-sm" id="modelsTableWrap">' +
          Dash.components.table.render(cols, models, { searchable: ['id', 'provider'], searchTerm: Dash.components.table.searchTerm, pageSize: 50 }) +
        '</div>';

      this.detailData = models.reduce((acc, m) => { acc[m.id] = m; return acc; }, {});

      const onSearch = () => {
        const wrap = document.getElementById('modelsTableWrap');
        if (wrap) wrap.innerHTML = Dash.components.table.render(cols, models, { searchable: ['id', 'provider'], searchTerm: Dash.components.table.searchTerm, pageSize: 50 });
      };
      Dash.components.table.filter = function(term) {
        this.searchTerm = term;
        this.currentPage = 1;
        onSearch();
      };
    } finally {
      this.refreshLock = false;
    }
  },

  async showMetadataEditor(modelId) {
    const result = await Dash.api.get('/models/' + encodeURIComponent(modelId) + '/metadata');
    const meta = (result && result.ok && result.metadata) || {};

    const capabilitiesList = ['streaming', 'vision', 'tools', 'code', 'reasoning', 'function-calling'];
    const capCheckboxes = capabilitiesList.map(cap =>
      '<label class="label cursor-pointer justify-start gap-2">' +
        '<input type="checkbox" class="checkbox checkbox-xs" value="' + cap + '"' +
          ((meta.capabilities || []).includes(cap) ? ' checked' : '') + '>' +
        '<span class="label-text text-xs">' + cap + '</span>' +
      '</label>'
    ).join('');

    const div = document.createElement('div');
    div.innerHTML =
      '<div class="space-y-4">' +
        '<div class="form-control">' +
          '<label class="label"><span class="label-text">Description</span></label>' +
          '<textarea id="metaDesc" class="textarea textarea-bordered textarea-sm h-20" placeholder="Mô tả model">' + Dash.util.escapeHtml(meta.description || '') + '</textarea>' +
        '</div>' +
        '<div class="grid grid-cols-2 gap-4">' +
          '<div class="form-control">' +
            '<label class="label"><span class="label-text">Provider Name</span></label>' +
            '<input type="text" id="metaProvider" class="input input-bordered input-sm" value="' + Dash.util.escapeHtml(meta.provider || '') + '" placeholder="e.g. MiniMax">' +
          '</div>' +
          '<div class="form-control">' +
            '<label class="label"><span class="label-text">Pricing Key</span></label>' +
            '<input type="text" id="metaPricingKey" class="input input-bordered input-sm" value="' + Dash.util.escapeHtml(meta.pricingKey || '') + '" placeholder="e.g. minimax-m2">' +
          '</div>' +
          '<div class="form-control">' +
            '<label class="label"><span class="label-text">Context</span></label>' +
            '<input type="text" id="metaContext" class="input input-bordered input-sm" value="' + Dash.util.escapeHtml(typeof meta.context === 'string' ? meta.context : '') + '" placeholder="128K">' +
          '</div>' +
          '<div class="form-control">' +
            '<label class="label"><span class="label-text">Max Output</span></label>' +
            '<input type="text" id="metaMaxOutput" class="input input-bordered input-sm" value="' + Dash.util.escapeHtml(typeof meta.maxOutput === 'string' ? meta.maxOutput : '') + '" placeholder="8K">' +
          '</div>' +
        '</div>' +
        '<div class="form-control">' +
          '<label class="label"><span class="label-text">Capabilities</span></label>' +
          '<div class="grid grid-cols-3 gap-1">' + capCheckboxes + '</div>' +
        '</div>' +
        '<div class="border-t border-base-200/50 pt-3"><h4 class="text-xs font-semibold uppercase tracking-wide text-base-content/50 mb-2">Pricing</h4><div class="grid grid-cols-3 gap-4">' +
          '<div class="form-control">' +
            '<label class="label"><span class="label-text">Input ($/M)</span></label>' +
            '<input type="number" step="0.01" id="metaPriceInput" class="input input-bordered input-sm" value="' + ((meta.pricing && meta.pricing.input) || 0) + '">' +
          '</div>' +
          '<div class="form-control">' +
            '<label class="label"><span class="label-text">Output ($/M)</span></label>' +
            '<input type="number" step="0.01" id="metaPriceOutput" class="input input-bordered input-sm" value="' + ((meta.pricing && meta.pricing.output) || 0) + '">' +
          '</div>' +
          '<div class="form-control">' +
            '<label class="label"><span class="label-text">Cache Read ($/M)</span></label>' +
            '<input type="number" step="0.01" id="metaPriceCache" class="input input-bordered input-sm" value="' + ((meta.pricing && meta.pricing.cacheRead) || 0) + '">' +
          '</div>' +
        '</div></div>' +
      '</div>';

    Dash.components.modal.show('Metadata: ' + Dash.util.escapeHtml(modelId), div, [
      { text: 'Cancel', class: 'btn btn-ghost btn-sm', action: () => Dash.components.modal.close() },
      { text: 'Save', class: 'btn btn-primary btn-sm bg-gradient-to-r from-[#FF6B00] to-[#FFB800] border-none text-white', action: async () => {
        const description = document.getElementById('metaDesc').value.trim();
        const provider = document.getElementById('metaProvider').value.trim();
        const pricingKey = document.getElementById('metaPricingKey').value.trim();
        const context = document.getElementById('metaContext').value.trim();
        const maxOutput = document.getElementById('metaMaxOutput').value.trim();
        const capEls = div.querySelectorAll('input[type="checkbox"]:checked');
        const capabilities = Array.from(capEls).map(el => el.value);
        const priceInput = parseFloat(document.getElementById('metaPriceInput').value) || 0;
        const priceOutput = parseFloat(document.getElementById('metaPriceOutput').value) || 0;
        const priceCache = parseFloat(document.getElementById('metaPriceCache').value) || 0;

        const metadata = {};
        if (description) metadata.description = description;
        if (provider) metadata.provider = provider;
        if (pricingKey) metadata.pricingKey = pricingKey;
        if (context) metadata.context = context;
        if (maxOutput) metadata.maxOutput = maxOutput;
        if (capabilities.length > 0) metadata.capabilities = capabilities;
        metadata.pricing = { input: priceInput, output: priceOutput, cacheRead: priceCache };

        const saveResult = await Dash.api.put('/models/' + encodeURIComponent(modelId) + '/metadata', { metadata });
        if (saveResult && saveResult.ok) {
          Dash.components.toast.success('Metadata saved! Sync triggered.');
          Dash.components.modal.close();
        } else {
          Dash.components.toast.error('Save failed: ' + (saveResult?.error || 'unknown'));
        }
      }},
    ]);
  },

  async showDetail(id) {
    const m = Dash.pages.models.detailData?.[id];
    if (!m) return;

    // Fetch candidate-level data
    let candidateHtml = '<div class="border-t border-base-200/50 pt-4"><h4 class="text-sm font-semibold text-base-content mb-2">Candidates</h4>';
    try {
      const candData = await Dash.api.get('/models/' + encodeURIComponent(id) + '/candidates');
      if (candData && candData.candidates && candData.candidates.length > 0) {
        candidateHtml += '<div class="space-y-2">';
        for (const c of candData.candidates) {
          const statusColor = c.status === 'available' ? 'badge-success' : c.status === 'degraded' ? 'badge-warning' : c.status === 'down' ? 'badge-error' : 'badge-ghost';
          candidateHtml +=
            '<div class="p-3 rounded-xl bg-base-200/30 border border-base-300/10">' +
              '<div class="flex items-center justify-between mb-1">' +
                '<div><span class="text-sm font-medium text-base-content">' + Dash.util.escapeHtml(c.providerID) + '</span>' +
                '<code class="text-xs text-base-content/50 ml-2">' + Dash.util.escapeHtml(c.modelID) + '</code></div>' +
                '<span class="badge badge-sm ' + statusColor + '">' + (c.status || 'unknown') + '</span>' +
              '</div>' +
              '<div class="grid grid-cols-4 gap-2 text-xs text-base-content/60">' +
                '<div>Transport: <span class="font-mono">' + (c.transport || 'opencode') + '</span></div>' +
                '<div>Connected: <span class="' + (c.connected ? 'text-success' : 'text-error') + '">' + (c.connected ? 'yes' : 'no') + '</span></div>' +
                '<div>Probe: <span class="' + (c.lastProbeOk === true ? 'text-success' : c.lastProbeOk === false ? 'text-error' : '') + '">' + (c.lastProbeOk === true ? 'OK' : c.lastProbeOk === false ? 'Fail' : '—') + '</span></div>' +
                '<div>Success: <span>' + (c.consecutiveProbeSuccess || 0) + '</span></div>' +
              '</div>' +
              (c.lastProbeReason ? '<div class="text-xs text-base-content/40 mt-1">Reason: ' + Dash.util.escapeHtml(c.lastProbeReason) + '</div>' : '') +
            '</div>';
        }
        candidateHtml += '</div>';
      } else {
        candidateHtml += '<div class="text-sm text-base-content/40">No candidate data available</div>';
      }
    } catch (e) {
      candidateHtml += '<div class="text-sm text-error">Failed to load candidates</div>';
    }
    candidateHtml += '</div>';

    const _t = Dash.i18n.t;
    const isVi = Dash.i18n.locale === 'vi';
    const time = (ts) => ts ? new Date(ts).toLocaleString(isVi ? 'vi-VN' : 'en-US') : '—';
    const statusLabel = (ok) => ok === true ? '✅ ' + _t('common.success') : ok === false ? '❌ ' + _t('common.failure') : _t('common.no_probe');

    Dash.components.modal.show(_t('models.detail_title') + ': ' + Dash.util.escapeHtml(id),
      '<div class="space-y-4">' +
        '<div class="grid grid-cols-2 gap-4">' +
          '<div><div class="text-xs text-base-content/50 uppercase tracking-wide">' + _t('common.status') + '</div><div class="mt-1">' + Dash.components.badge.html(m.status) + '</div></div>' +
          '<div><div class="text-xs text-base-content/50 uppercase tracking-wide">' + _t('models.provider') + '</div><div class="mt-1 font-medium text-base-content">' + Dash.util.escapeHtml(m.provider || '—') + '</div></div>' +
          '<div><div class="text-xs text-base-content/50 uppercase tracking-wide">' + _t('common.reason') + '</div><div class="mt-1 text-sm text-base-content/80">' + Dash.util.escapeHtml(m.reason || '—') + '</div></div>' +
          '<div><div class="text-xs text-base-content/50 uppercase tracking-wide">' + _t('common.candidates') + '</div><div class="mt-1 text-sm text-base-content/80">' + (m.candidates || 0) + '</div></div>' +
        '</div>' +
        '<div class="border-t border-base-200/50 pt-4"><h4 class="text-sm font-semibold text-base-content mb-2">' + _t('common.probe') + '</h4><div class="grid grid-cols-2 gap-4">' +
          '<div><div class="text-xs text-base-content/50">' + _t('models.probe_last') + '</div><div class="text-sm text-base-content/80">' + time(m.lastProbeAt) + '</div></div>' +
          '<div><div class="text-xs text-base-content/50">' + _t('models.probe_result') + '</div><div class="text-sm text-base-content/80">' + statusLabel(m.lastProbeOk) + '</div></div>' +
          '<div><div class="text-xs text-base-content/50">' + _t('models.probe_consecutive') + '</div><div class="text-sm text-base-content/80">' + (m.consecutiveProbeSuccess || 0) + '</div></div>' +
          '<div><div class="text-xs text-base-content/50">' + _t('models.probe_reason') + '</div><div class="text-sm text-base-content/80">' + Dash.util.escapeHtml(m.lastProbeReason || '—') + '</div></div>' +
        '</div></div>' +
        '<div class="border-t border-base-200/50 pt-4"><h4 class="text-sm font-semibold text-base-content mb-2">' + _t('common.request') + '</h4><div class="grid grid-cols-2 gap-4">' +
          '<div><div class="text-xs text-base-content/50">' + _t('models.request_last') + '</div><div class="text-sm text-base-content/80">' + time(m.lastRequestAt) + '</div></div>' +
          '<div><div class="text-xs text-base-content/50">' + _t('models.request_result') + '</div><div class="text-sm text-base-content/80">' + statusLabel(m.lastRequestOk) + '</div></div>' +
          '<div><div class="text-xs text-base-content/50">' + _t('models.success_count') + '</div><div class="text-sm text-base-content/80">' + (m.successCount || 0) + '</div></div>' +
          '<div><div class="text-xs text-base-content/50">' + _t('models.failure_count') + '</div><div class="text-sm text-base-content/80">' + (m.failureCount || 0) + '</div></div>' +
          '<div><div class="text-xs text-base-content/50">' + _t('models.success_rate') + ' <span class="text-[9px] opacity-50">' + _t('models.success_rate_note') + '</span></div><div class="text-sm font-medium text-base-content/80">' + (m.successRate != null ? m.successRate + '%' : '—') + '</div></div>' +
          '<div><div class="text-xs text-base-content/50">' + _t('models.peak_rps') + '</div><div class="text-sm text-base-content/80">' + (m.peakRps || 0) + '</div></div>' +
        '</div></div>' +
        candidateHtml +
      '</div>'
    );
  },

  async checkSyncDrift() {
    const syncData = await Dash.api.get('/sync/status');
    if (syncData && syncData.hasDrift) {
      Dash.components.toast.warning('Phát hiện drift! Source hash thay đổi. Cần chạy sync lại.');
    } else if (syncData && syncData.synced) {
      Dash.components.toast.success('Không có drift. Source và generated đồng bộ.');
    } else {
      Dash.components.toast.error('Không thể kiểm tra sync status');
    }
  },

  async triggerSync() {
    Dash.components.toast.info('Đang chạy sync...');
    const result = await Dash.api.post('/sync/run');
    if (result && result.ok) {
      Dash.components.toast.success('Sync hoàn tất! Làm mới models page.');
    } else {
      Dash.components.toast.error('Sync thất bại: ' + (result?.error || 'unknown'));
    }
    this.refresh(true);
  },
};

window.Dash = Dash;
