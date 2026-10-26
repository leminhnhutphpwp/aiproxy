var Dash = window.Dash || {};
Dash.pages = Dash.pages || {};

Dash.pages.providers = {
  opencodeProviders: [],
  directProviders: [],
  keyPoolData: [],
  opencodeModelsStatus: [],
  routingTraces: [],
  selectedId: null,
  editingType: null,
  opencodeStatus: null,

  async render(container) {
    container.innerHTML = '<div class="space-y-5 p-8"><div class="skeleton-pulse h-8 w-56 rounded"></div><div class="flex gap-5"><div class="w-72 space-y-2"><div class="skeleton-pulse h-10 rounded-xl"></div><div class="skeleton-pulse h-10 rounded-xl"></div><div class="skeleton-pulse h-10 rounded-xl"></div></div><div class="flex-1 space-y-2"><div class="skeleton-pulse h-64 rounded-xl"></div></div></div></div>';
    await this.loadData();
    this.renderLayout(container);
  },

  async loadData() {
    const [allData, statusData, keyPoolRes, opencodeProvRes, traceRes] = await Promise.all([
      Dash.api.get('/providers/all'),
      Dash.api.get('/providers/opencode/status'),
      Dash.api.get('/key-pools'),
      Dash.api.get('/providers/opencode'),
      Dash.api.get('/routing/traces'),
    ]);
    this.opencodeProviders = (allData && allData.opencode) || [];
    this.directProviders = (allData && allData.direct) || [];
    this.opencodeStatus = statusData;
    this.keyPoolData = (keyPoolRes && keyPoolRes.data) || [];
    this.opencodeModelsStatus = (opencodeProvRes) || [];
    this.routingTraces = (traceRes && traceRes.data) || [];
  },

  getPoolForProvider(providerId) {
    return this.keyPoolData.find(p => p.providerId === providerId) || null;
  },

  getModelsForOpenCodeProvider(id) {
    return this.opencodeModelsStatus.find(p => p.id === id) || null;
  },

  renderLayout(container) {
    container.innerHTML =
      '<div class="mb-6">' +
        '<div class="flex items-center justify-between">' +
          '<div>' +
            '<h2 class="text-lg font-semibold text-base-content">Provider & Model Management</h2>' +
            '<p class="text-sm text-base-content/50 mt-1">Quản lý providers và models</p>' +
          '</div>' +
          '<div class="flex items-center gap-2">' +
            '<button id="reloadProvidersBtn" class="btn btn-ghost btn-sm" title="Làm mới dữ liệu providers (không restart OpenCode)">⟳ Reload</button>' +
            '<button id="autoDetectBtn" class="btn btn-ghost btn-sm">🔍 Auto Detect</button>' +
            '<button id="addProviderBtn" class="btn btn-primary btn-sm bg-gradient-to-r from-[#FF6B00] to-[#FFB800] border-none text-white">+ Provider</button>' +
            '<span class="badge badge-ghost badge-sm" id="opencodeStatusBadge">OpenCode: checking...</span>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="flex gap-5">' +
        '<div class="w-72 flex-shrink-0 space-y-3" id="providerListPanel"></div>' +
        '<div class="flex-1 min-w-0 space-y-4" id="providerDetailPanel">' +
          '<div class="text-center py-20 text-base-content/40">Chọn provider để xem chi tiết</div>' +
        '</div>' +
      '</div>';

    this.renderProviderList();
    this.updateOpenCodeStatus();

    document.getElementById('addProviderBtn').addEventListener('click', () => this.showAddModal());
    document.getElementById('autoDetectBtn').addEventListener('click', () => this.showAutoDetectModal());
    document.getElementById('reloadProvidersBtn').addEventListener('click', (e) => {
      e.preventDefault();
      Dash.components.toast.info('Đang làm mới dữ liệu providers...');
      this.loadData().then(() => {
        const container = document.getElementById('pageContent');
        if (container) this.renderLayout(container);
        if (this.selectedId) this.selectProvider(this.selectedId, this.editingType);
        Dash.components.toast.success('Đã làm mới');
      });
    });
  },

  updateOpenCodeStatus() {
    const badge = document.getElementById('opencodeStatusBadge');
    if (!badge) return;
    if (this.opencodeStatus && this.opencodeStatus.ok) {
      badge.className = 'badge badge-sm badge-success';
      badge.textContent = 'OpenCode: running (' + (this.opencodeStatus.providers || '?') + ' providers)';
    } else {
      badge.className = 'badge badge-sm badge-error';
      badge.textContent = 'OpenCode: down';
    }
  },

  renderProviderList() {
    const panel = document.getElementById('providerListPanel');
    if (!panel) return;

    let html = '<div class="text-xs font-semibold uppercase tracking-wider text-base-content/40 px-3 mb-2">OpenCode Providers</div>';

    if (this.opencodeProviders.length === 0) {
      html += '<div class="text-sm text-base-content/40 px-3">No OpenCode providers</div>';
    } else {
      for (const p of this.opencodeProviders) {
        html += this.renderProviderItem(p);
      }
    }

    html += '<div class="mt-4 text-xs font-semibold uppercase tracking-wider text-base-content/40 px-3 mb-2">Direct Providers</div>';

    if (this.directProviders.length === 0) {
      html += '<div class="text-sm text-base-content/40 px-3">Chưa có direct provider</div>';
    } else {
      for (const p of this.directProviders) {
        html += this.renderProviderItem(p);
      }
    }

    html += '<button id="addProviderBtn2" class="btn btn-ghost btn-xs text-[#FF6B00] w-full mt-2">+ Add Direct Provider</button>';

    panel.innerHTML = html;

    panel.querySelectorAll('.prov-item').forEach(el => {
      el.addEventListener('click', () => this.selectProvider(el.dataset.id, el.dataset.type));
    });

    panel.querySelectorAll('.prov-del').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        this.deleteDirectProvider(el.dataset.id);
      });
    });

    const addBtn2 = document.getElementById('addProviderBtn2');
    if (addBtn2) addBtn2.addEventListener('click', () => this.showAddModal());

    const btn1 = document.getElementById('addProviderBtn');
    if (btn1) btn1.addEventListener('click', () => this.showAddModal());
  },

  renderProviderItem(p) {
    const isOpenCode = p.type === 'opencode';
    const isSelected = this.selectedId === p.id;
    const statusDot = isOpenCode
      ? (p.connected ? 'bg-success' : 'bg-error')
      : 'bg-info';

    let subInfo = Dash.util.escapeHtml(p.id) + ' · ' + (p.modelCount || 0) + ' models';
    const pool = this.getPoolForProvider(p.id);
    if (pool && pool.totalKeys > 1) {
      subInfo += ' · ' + pool.totalKeys + ' keys';
      const healthyCount = pool.keyPoolStatus.filter(k => k.state === 'closed' || k.state === 'probation').length;
      const cooldownCount = pool.keyPoolStatus.filter(k => k.state === 'open').length;
      if (cooldownCount > 0) {
        subInfo += ' <span class="text-warning">(' + healthyCount + ' ✓, ' + cooldownCount + ' ●)</span>';
      } else {
        subInfo += ' <span class="text-success">(' + healthyCount + ' ✓)</span>';
      }
    }

    return '<div class="prov-item flex items-center gap-2 px-3 py-2 rounded-xl cursor-pointer transition-all hover:bg-base-200/50 ' +
      (isSelected ? 'bg-[#FF6B00]/10 border border-[#FF6B00]/30' : 'border border-transparent') +
      '" data-id="' + Dash.util.escapeHtml(p.id) + '" data-type="' + p.type + '">' +
      '<span class="w-2 h-2 rounded-full flex-shrink-0 ' + statusDot + '"></span>' +
      '<div class="flex-1 min-w-0">' +
        '<div class="text-sm font-medium truncate">' + Dash.util.escapeHtml(p.name || p.id) + '</div>' +
        '<div class="text-xs text-base-content/40">' + subInfo + '</div>' +
      '</div>' +
      (isOpenCode ? '' :
        '<button class="btn btn-ghost btn-xs btn-square text-base-content/30 hover:text-error prov-del" data-id="' + Dash.util.escapeHtml(p.id) + '" title="Xoá">' +
          '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" class="w-3.5 h-3.5"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>' +
        '</button>'
      ) +
    '</div>';
  },

  async selectProvider(id, type) {
    this.selectedId = id;
    this.editingType = type;
    this.renderProviderList();
    if (type === 'opencode') {
      this.renderOpenCodeDetail(id);
    } else {
      this.renderDirectDetail(id);
    }
  },

  renderOpenCodeDetail(id) {
    const p = this.opencodeProviders.find(x => x.id === id);
    if (!p) return;
    const panel = document.getElementById('providerDetailPanel');
    if (!panel) return;

    const models = (p.models || []).map(m =>
      '<div class="flex items-center justify-between px-3 py-2 rounded-lg bg-base-200/30 border border-base-300/10">' +
        '<div class="flex items-center gap-2">' +
          '<span class="w-1.5 h-1.5 rounded-full bg-success"></span>' +
          '<div><code class="text-xs font-mono">' + Dash.util.escapeHtml(m.id) + '</code>' +
          (m.name && m.name !== m.id ? '<div class="text-xs text-base-content/40">' + Dash.util.escapeHtml(m.name) + '</div>' : '') +
          '</div>' +
        '</div>' +
      '</div>'
    ).join('');

    const isConfigProvider = p.source === 'config';
    const envVars = p.env || [];
    let envSection = '';
    if (envVars.length > 0) {
      envSection = '<div class="mb-4 p-3 bg-warning/5 rounded-xl border border-warning/10 text-xs text-base-content/70">' +
        '<div class="font-semibold text-warning mb-1">Environment Variables Required:</div>' +
        '<ul class="list-disc list-inside font-mono">' +
          envVars.map(v => '<li>' + Dash.util.escapeHtml(v) + '</li>').join('') +
        '</ul>' +
        '<p class="mt-2 text-base-content/40">Cấu hình các biến môi trường này trong file service OpenCode để kích hoạt provider.</p>' +
      '</div>';
    }

    const healthSection = this.renderProviderHealthSection(id);
    const traceSection = this.renderRoutingTracesSection();

    panel.innerHTML =
      '<div class="rounded-2xl border border-base-300/50 overflow-hidden">' +
        '<div class="bg-base-200/40 px-5 py-4 border-b border-base-300/30 flex items-center justify-between">' +
          '<div>' +
            '<h3 class="font-semibold text-base-content">' + Dash.util.escapeHtml(p.id) + '</h3>' +
            '<p class="text-xs text-base-content/50">OpenCode Provider · Source: ' + Dash.util.escapeHtml(p.source || 'api') + '</p>' +
          '</div>' +
          '<span class="badge badge-sm ' + (p.connected ? 'badge-success' : 'badge-error') + '">' + (p.connected ? 'Connected' : 'Disconnected') + '</span>' +
        '</div>' +
        '<div class="p-5 space-y-5">' +
          envSection +
          healthSection +
          traceSection +
          '<div class="mb-4">' +
            '<label class="label-text text-xs font-semibold uppercase tracking-wider text-base-content/50 mb-2">Models (' + (p.models || []).length + ')</label>' +
            '<div class="space-y-1 max-h-64 overflow-y-auto">' + models + '</div>' +
          '</div>' +
          '<div class="flex gap-2 pt-3 border-t border-base-300/20">' +
            (isConfigProvider
              ? '<button id="editOpenCodeConfigBtn" class="btn btn-outline btn-xs">Edit Config (opencode.jsonc)</button>'
              : '<button id="editOpenCodeConfigBtn" class="btn btn-outline btn-xs btn-disabled" disabled title="Provider này được quản lý bởi hệ thống, không qua file config">Config in opencode.jsonc</button>'
            ) +
            '<button id="restartOpenCodeBtn" class="btn btn-outline btn-xs text-warning border-warning/30 hover:border-warning">Restart OpenCode</button>' +
          '</div>' +
        '</div>' +
      '</div>';

    if (isConfigProvider) {
      document.getElementById('editOpenCodeConfigBtn').addEventListener('click', () => this.showOpenCodeConfigModal());
    }
    document.getElementById('restartOpenCodeBtn').addEventListener('click', () => this.restartOpenCode());
  },

  renderDirectDetail(id) {
    const p = this.directProviders.find(x => x.id === id);
    if (!p) return;
    const panel = document.getElementById('providerDetailPanel');
    if (!panel) return;

    const models = (p.models || []).map(m =>
      '<div class="flex items-center justify-between px-3 py-2 rounded-lg bg-base-200/30 border border-base-300/10">' +
        '<code class="text-xs font-mono">' + Dash.util.escapeHtml(m.id) + '</code>' +
        '<button class="btn btn-ghost btn-xs btn-square text-base-content/20 hover:text-error del-model-btn" data-model="' + Dash.util.escapeHtml(m.id) + '">' +
          '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" class="w-3 h-3"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>' +
        '</button>' +
      '</div>'
    ).join('');

    let authBadge = '';
    if (p.authSource === 'env') {
      authBadge = '<span class="badge badge-success badge-sm ml-2">ENV</span>';
    } else if (p.authSource === 'inline') {
      authBadge = '<span class="badge badge-warning badge-sm ml-2">inline (deprecated)</span>';
    } else {
      authBadge = '<span class="badge badge-error badge-sm ml-2">none</span>';
    }

    let warningBanner = '';
    if (p.authSource === 'inline') {
      warningBanner = '<div class="p-3 bg-warning/10 text-warning text-xs rounded-xl border border-warning/20 mb-4">' +
        '<strong>Security Warning:</strong> This provider is using an inline API Key. Inline API keys are deprecated. Please migrate to using an Environment Variable (e.g. <code>OPENAI_API_KEY</code>) for better security.' +
      '</div>';
    }

    const keyPoolSection = this.renderKeyPoolSection(id);
    const traceSection = this.renderRoutingTracesSection();

    panel.innerHTML =
      '<div class="rounded-2xl border border-base-300/50 overflow-hidden">' +
        '<div class="bg-base-200/40 px-5 py-4 border-b border-base-300/30 flex items-center justify-between">' +
          '<div>' +
            '<h3 class="font-semibold text-base-content flex items-center">' + Dash.util.escapeHtml(p.name || p.id) + authBadge + '</h3>' +
            '<p class="text-xs text-base-content/50">Direct Provider · ' + Dash.util.escapeHtml(p.id) + '</p>' +
          '</div>' +
          '<span class="badge badge-sm badge-info">Direct</span>' +
        '</div>' +
        '<div class="p-5 space-y-4">' +
          warningBanner +
          keyPoolSection +
          '<div class="grid grid-cols-2 gap-4">' +
            '<div class="form-control">' +
              '<label class="label-text text-xs text-base-content/50 mb-1">Display Name</label>' +
              '<input type="text" id="editDirName" class="input input-bordered input-sm" value="' + Dash.util.escapeHtml(p.name || p.id) + '">' +
            '</div>' +
            '<div class="form-control">' +
              '<label class="label-text text-xs text-base-content/50 mb-1">Provider ID</label>' +
              '<input type="text" id="editDirId" class="input input-bordered input-sm" value="' + Dash.util.escapeHtml(p.id) + '">' +
            '</div>' +
            '<div class="form-control col-span-2">' +
              '<label class="label-text text-xs text-base-content/50 mb-1">Base URL</label>' +
              '<input type="text" id="editDirBaseUrl" class="input input-bordered input-sm" value="' + Dash.util.escapeHtml(p.baseURL || '') + '">' +
            '</div>' +
            '<div class="form-control col-span-2">' +
              '<label class="label-text text-xs text-base-content/50 mb-1">API Key Environment Variable</label>' +
              '<input type="text" id="editDirApiKeyEnv" class="input input-bordered input-sm" value="' + Dash.util.escapeHtml(p.apiKeyEnv || '') + '" placeholder="e.g. OPENAI_API_KEY">' +
            '</div>' +
            '<div class="form-control col-span-2">' +
              '<label class="label-text text-xs text-base-content/50 mb-1">API Key (Deprecated)</label>' +
              '<div class="flex gap-2">' +
                '<input type="password" id="editDirApiKey" class="input input-bordered input-sm flex-1" value="' + Dash.util.escapeHtml(p.hasApiKey && p.authSource === 'inline' ? '********' : '') + '" placeholder="sk-...">' +
                '<button id="toggleKeyBtn" class="btn btn-ghost btn-sm btn-square" title="Show/Hide">👁️</button>' +
              '</div>' +
            '</div>' +
          '</div>' +
          '<div class="flex gap-2">' +
            '<button id="saveDirProviderBtn" class="btn btn-primary btn-xs bg-gradient-to-r from-[#FF6B00] to-[#FFB800] border-none text-white">Save</button>' +
            '<button id="testDirProviderBtn" class="btn btn-outline btn-xs">Test Connection</button>' +
            '<button id="deleteDirProviderBtn" class="btn btn-ghost btn-xs text-error/60 hover:text-error ml-auto">Delete</button>' +
          '</div>' +
          traceSection +
          '<div class="pt-3 border-t border-base-300/20">' +
            '<label class="label-text text-xs font-semibold uppercase tracking-wider text-base-content/50 mb-2">Models (' + (p.models || []).length + ')</label>' +
            '<div class="space-y-1 max-h-48 overflow-y-auto mb-2" id="dirModelList">' +
              (models || '<div class="text-sm text-base-content/40">Chưa có model</div>') +
            '</div>' +
            '<button id="addModelBtn" class="btn btn-ghost btn-xs text-[#FF6B00]">+ Add Model</button>' +
          '</div>' +
        '</div>' +
      '</div>';

    document.getElementById('saveDirProviderBtn').addEventListener('click', () => this.saveDirectProvider(id));
    document.getElementById('testDirProviderBtn').addEventListener('click', () => this.testDirectProvider(id));
    document.getElementById('deleteDirProviderBtn').addEventListener('click', () => this.deleteDirectProvider(id));
    document.getElementById('toggleKeyBtn').addEventListener('click', () => {
      const inp = document.getElementById('editDirApiKey');
      inp.type = inp.type === 'password' ? 'text' : 'password';
    });
    document.getElementById('addModelBtn').addEventListener('click', () => this.showAddModelModal(id));

    panel.querySelectorAll('.del-model-btn').forEach(btn => {
      btn.addEventListener('click', () => this.deleteDirectModel(id, btn.dataset.model));
    });
  },

  renderKeyPoolSection(providerId) {
    const pool = this.getPoolForProvider(providerId);
    if (!pool || !pool.keyPoolStatus || pool.keyPoolStatus.length === 0) {
      return '<div class="p-4 rounded-xl border border-base-300/20">' +
        '<div class="flex items-center justify-between mb-3">' +
          '<h4 class="text-xs font-semibold uppercase tracking-wider text-base-content/50">API Key Pool</h4>' +
          '<button class="btn btn-ghost btn-xs text-[#FF6B00] hover:text-[#FF6B00]" onclick="Dash.pages.providers.showAddKeyModal(\'' + Dash.util.escapeHtml(providerId) + '\')">+ Add Key</button>' +
        '</div>' +
        '<div class="p-3 bg-base-200/20 rounded-xl border border-base-300/10 text-xs text-base-content/40 text-center">No key pool configured. Click "+ Add Key" to create one, or use single API key.</div>' +
      '</div>';
    }

    const totalHealthy = pool.keyPoolStatus.filter(k => k.state === 'closed' || k.state === 'probation').length;
    const totalCooldown = pool.keyPoolStatus.filter(k => k.state === 'open').length;
    const totalHalfOpen = pool.keyPoolStatus.filter(k => k.state === 'half_open').length;

    let statusSummary = totalHealthy + ' healthy';
    if (totalCooldown > 0) statusSummary += ', ' + totalCooldown + ' cooldown';
    if (totalHalfOpen > 0) statusSummary += ', ' + totalHalfOpen + ' probing';

    let keysHtml = '';
    for (const k of pool.keyPoolStatus) {
      const stateColor = k.state === 'closed' ? 'badge-success' : k.state === 'probation' ? 'badge-warning' : k.state === 'half_open' ? 'badge-info' : 'badge-error';
      const stateLabel = k.state === 'closed' ? 'Healthy' : k.state === 'probation' ? 'Probation' : k.state === 'half_open' ? 'Probing' : 'Cooldown';
      const dotColor = k.state === 'closed' ? 'bg-success' : k.state === 'probation' ? 'bg-warning' : k.state === 'half_open' ? 'bg-info' : 'bg-error';
      const stateSuccessRate = { closed: 100, probation: 75, half_open: 40, open: 10 };
      const successRate = stateSuccessRate[k.state] ?? 50;
      const barWidth = Math.max(5, successRate);

      const openUntilStr = k.openUntil ? new Date(k.openUntil).toLocaleTimeString('vi-VN') : null;

      keysHtml +=
        '<div class="flex items-center gap-3 p-3 rounded-xl bg-base-200/30 border border-base-300/10">' +
          '<span class="w-2 h-2 rounded-full flex-shrink-0 ' + dotColor + '"></span>' +
          '<div class="flex-1 min-w-0">' +
            '<div class="flex items-center justify-between">' +
              '<code class="text-xs font-medium text-base-content">' + Dash.util.escapeHtml(k.id) + '</code>' +
              '<div class="flex items-center gap-1">' +
                '<span class="badge badge-sm ' + stateColor + ' text-[9px]">' + stateLabel + '</span>' +
                '<button class="btn btn-ghost btn-xs btn-square text-base-content/30 hover:text-info" title="Edit" onclick="Dash.pages.providers.showEditKeyModal(\'' + Dash.util.escapeHtml(providerId) + '\',\'' + Dash.util.escapeHtml(k.id) + '\',' + (k.weight || 100) + ',' + (k.rpm || 500) + ')">' +
                  '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" class="w-3 h-3"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>' +
                '</button>' +
                '<button class="btn btn-ghost btn-xs btn-square text-base-content/30 hover:text-error" title="Remove" onclick="Dash.pages.providers.deleteKey(\'' + Dash.util.escapeHtml(providerId) + '\',\'' + Dash.util.escapeHtml(k.id) + '\')">' +
                  '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" class="w-3 h-3"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>' +
                '</button>' +
              '</div>' +
            '</div>' +
            '<div class="flex items-center gap-2 mt-1 text-[10px] text-base-content/50">' +
              '<span>w:' + (k.weight || 100) + '</span>' +
              '<span>·</span>' +
              '<span>active: ' + (k.activeRequests || 0) + '</span>' +
              '<span>·</span>' +
              '<span>failures: ' + (k.failures || 0) + '</span>' +
              '<span>·</span>' +
              '<span>source: ' + (k.source || 'none') + '</span>' +
              (openUntilStr ? '<span>· cooldown until ' + openUntilStr + '</span>' : '') +
            '</div>' +
            '<div class="mt-1.5 h-1.5 rounded-full bg-base-300/30 overflow-hidden">' +
              '<div class="h-full rounded-full ' + (successRate >= 80 ? 'bg-success' : successRate >= 50 ? 'bg-warning' : 'bg-error') + '" style="width:' + barWidth + '%"></div>' +
            '</div>' +
          '</div>' +
        '</div>';
    }

    return '<div class="p-4 rounded-xl border border-base-300/20">' +
      '<div class="flex items-center justify-between mb-3">' +
        '<h4 class="text-xs font-semibold uppercase tracking-wider text-base-content/50">API Key Pool (' + pool.totalKeys + ' keys · ' + statusSummary + ')</h4>' +
        '<div class="flex items-center gap-2">' +
          '<button class="btn btn-ghost btn-xs text-[#FF6B00] hover:text-[#FF6B00]" onclick="Dash.pages.providers.showAddKeyModal(\'' + Dash.util.escapeHtml(providerId) + '\')">+ Add Key</button>' +
          '<button class="btn btn-ghost btn-xs text-base-content/30 hover:text-warning" onclick="Dash.pages.providers.resetKeyPool(\'' + Dash.util.escapeHtml(providerId) + '\')" title="Reset pool states">↻ Reset</button>' +
        '</div>' +
      '</div>' +
      '<div class="space-y-2">' + keysHtml + '</div>' +
    '</div>';
  },

  renderProviderHealthSection(providerId) {
    const provStatus = this.getModelsForOpenCodeProvider(providerId);
    if (!provStatus) return '';

    const models = provStatus.models || [];
    const modelBreakdown = { available: 0, degraded: 0, overloaded: 0, down: 0, unknown: 0 };
    const modelsWithIssues = [];

    for (const m of models) {
      if (modelBreakdown[m.status] !== undefined) modelBreakdown[m.status]++;
      if (m.status !== 'available') {
        modelsWithIssues.push(m);
      }
    }

    const statusBadge = provStatus.connected
      ? '<span class="badge badge-sm badge-success">Connected</span>'
      : '<span class="badge badge-sm badge-error">Disconnected</span>';

    let breakdownHtml =
      '<div class="flex flex-wrap gap-1.5 mb-3">' +
        (modelBreakdown.available > 0 ? '<span class="badge badge-xs badge-success gap-1">✓ ' + modelBreakdown.available + ' available</span>' : '') +
        (modelBreakdown.degraded > 0 ? '<span class="badge badge-xs badge-warning gap-1">⚠ ' + modelBreakdown.degraded + ' degraded</span>' : '') +
        (modelBreakdown.overloaded > 0 ? '<span class="badge badge-xs badge-warning gap-1">⚡ ' + modelBreakdown.overloaded + ' overloaded</span>' : '') +
        (modelBreakdown.down > 0 ? '<span class="badge badge-xs badge-error gap-1">✕ ' + modelBreakdown.down + ' down</span>' : '') +
        (modelBreakdown.unknown > 0 ? '<span class="badge badge-xs badge-ghost gap-1">? ' + modelBreakdown.unknown + ' unknown</span>' : '') +
      '</div>';

    let issuesHtml = '';
    if (modelsWithIssues.length > 0) {
      issuesHtml = '<div class="space-y-1 mt-2">' +
        '<div class="text-[10px] font-semibold uppercase tracking-wider text-base-content/40 mb-1">Models with issues:</div>' +
        modelsWithIssues.map(m =>
          '<div class="flex items-center justify-between px-2 py-1.5 rounded-lg bg-base-200/20 text-xs">' +
            '<code class="text-xs text-base-content/80">' + Dash.util.escapeHtml(m.id) + '</code>' +
            '<span class="badge badge-sm ' + (m.status === 'down' ? 'badge-error' : m.status === 'degraded' ? 'badge-warning' : m.status === 'overloaded' ? 'badge-warning' : 'badge-ghost') + ' text-[9px]">' + m.status + '</span>' +
          '</div>'
        ).join('') +
      '</div>';
    }

    return '<div class="p-4 rounded-xl border border-base-300/20">' +
      '<div class="flex items-center justify-between mb-2">' +
        '<h4 class="text-xs font-semibold uppercase tracking-wider text-base-content/50">Provider Health</h4>' +
        statusBadge +
      '</div>' +
      breakdownHtml +
      issuesHtml +
    '</div>';
  },

  renderRoutingTracesSection() {
    const traces = this.routingTraces;
    if (traces.length === 0) return '';

      const recentTraces = traces.slice(0, 5);
      let traceHtml = '';
      for (const t of recentTraces) {
        const isOk = t.reason === 'primary';
        const icon = isOk ? '<span class="text-success">✓</span>' : '<span class="text-error">✕</span>';
        const selected = t.selectedCandidate ? Dash.util.escapeHtml(t.selectedCandidate.provider + '/' + (t.selectedCandidate.model || '')) : '—';
        const timeAgo = t.timestamp ? Math.round((Date.now() - t.timestamp) / 60000) + 'm ago' : '';
        traceHtml +=
          '<div class="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-base-200/20 text-xs">' +
            icon +
            '<code class="text-xs text-base-content/80 flex-1 truncate">' + Dash.util.escapeHtml(t.modelId) + '</code>' +
            '<code class="text-[10px] text-base-content/40 truncate max-w-[120px]">→ ' + selected + '</code>' +
            '<span class="text-[10px] text-base-content/40">' + (t.reason || '') + '</span>' +
            '<span class="text-[9px] text-base-content/30">' + timeAgo + '</span>' +
          '</div>';
      }

      return '<div class="p-4 rounded-xl border border-base-300/20">' +
        '<div class="flex items-center justify-between mb-2">' +
          '<h4 class="text-xs font-semibold uppercase tracking-wider text-base-content/50">Recent Routing (' + traces.length + ' traces)</h4>' +
          '<a href="#breakers" class="text-[10px] text-warning hover:text-warning font-medium">View all →</a>' +
        '</div>' +
        '<div class="space-y-0.5">' + traceHtml + '</div>' +
      '</div>';
  },

  async resetKeyPool(providerId) {
    const pool = this.getPoolForProvider(providerId);
    if (!pool) return;
    const result = await Dash.api.post('/key-pools/reset');
    if (result && result.ok) {
      Dash.components.toast.success('Key pool states reset');
      await this.loadData();
      const container = document.getElementById('pageContent');
      if (container) {
        this.renderLayout(container);
        this.selectProvider(providerId, 'direct');
      }
    } else {
      Dash.components.toast.error('Reset failed: ' + (result?.error || 'unknown'));
    }
  },

  async saveDirectProvider(origId) {
    const name = document.getElementById('editDirName').value.trim();
    const id = document.getElementById('editDirId').value.trim();
    const baseURL = document.getElementById('editDirBaseUrl').value.trim();
    const apiKeyEnv = document.getElementById('editDirApiKeyEnv').value.trim();
    let apiKey = document.getElementById('editDirApiKey').value.trim();

    if (!id || !baseURL) { Dash.components.toast.error('ID and Base URL are required'); return; }

    if (apiKey === '********') apiKey = undefined;

    const body = { id, name, baseURL, apiKeyEnv };
    if (apiKey !== undefined) body.apiKey = apiKey;

    const result = await Dash.api.put('/providers/direct/' + encodeURIComponent(origId), body);
    if (result && result.ok) {
      Dash.components.toast.success('Saved direct provider');
      await this.loadData();
      this.renderLayout(document.getElementById('pageContent'));
      this.selectProvider(result.id || id, 'direct');
    } else {
      Dash.components.toast.error('Save failed: ' + (result?.error || 'unknown'));
    }
  },

  async deleteDirectProvider(id) {
    Dash.components.confirm.show(
      'Delete Provider',
      'Delete "' + Dash.util.escapeHtml(id) + '"?',
      async () => {
        const result = await Dash.api.del('/providers/direct/' + encodeURIComponent(id));
        if (result && result.ok) {
          Dash.components.toast.success('Deleted');
          this.selectedId = null;
          await this.loadData();
          this.renderLayout(document.getElementById('pageContent'));
        } else {
          Dash.components.toast.error('Delete failed');
        }
      },
      'Delete', 'Cancel'
    );
  },

  async testDirectProvider(id) {
    Dash.components.toast.info('Testing connection...');
    const result = await Dash.api.post('/providers/direct/' + encodeURIComponent(id) + '/test');
    if (result && result.ok) {
      Dash.components.toast.success('Connection OK');
    } else {
      Dash.components.toast.error('Connection failed: ' + (result?.error || 'unknown'));
    }
  },

  showAutoDetectModal() {
    let detectedFormat = '';
    let detectedPath = '';
    let availableModels = [];
    let selectedModels = new Set();

    const FORMATS = {
      openai: { path: '/v1/chat/completions', label: 'OpenAI Chat' },
      anthropic: { path: '/v1/messages', label: 'Anthropic Messages' },
    };

    const formatOptions = Object.entries(FORMATS).map(([key, f]) =>
      '<option value="' + key + '" data-path="' + Dash.util.escapeHtml(f.path) + '">' + Dash.util.escapeHtml(f.label) + ' (' + Dash.util.escapeHtml(f.path) + ')</option>'
    ).join('');

    const div = document.createElement('div');
    div.innerHTML =
      '<div class="space-y-4">' +
        '<div class="form-control">' +
          '<label class="label"><span class="label-text">Provider Name / ID</span></label>' +
          '<input type="text" id="adProvId" class="input input-bordered input-sm" placeholder="e.g. my-provider">' +
        '</div>' +
        '<div class="form-control">' +
          '<label class="label"><span class="label-text">Base URL <span class="text-error">*</span></span></label>' +
          '<input type="text" id="adBaseUrl" class="input input-bordered input-sm" placeholder="https://api.provider.com/v1">' +
        '</div>' +
        '<div class="form-control">' +
          '<label class="label"><span class="label-text">API Key <span class="text-error">*</span></span></label>' +
          '<input type="password" id="adApiKey" class="input input-bordered input-sm" placeholder="sk-...">' +
        '</div>' +
        '<button id="adDetectBtn" class="btn btn-primary btn-sm w-full bg-gradient-to-r from-[#FF6B00] to-[#FFB800] border-none text-white">🔍 Detect API Format & Models</button>' +
        '<div id="adResult" class="hidden"></div>' +
        '<div id="adFormatGroup" class="hidden space-y-2">' +
          '<label class="label"><span class="label-text">API Format</span></label>' +
          '<select id="adFormatSelect" class="select select-bordered select-sm w-full">' + formatOptions + '</select>' +
        '</div>' +
      '</div>';

    Dash.components.modal.show('🔍 Auto Detect Provider', div, [
      { text: 'Cancel', class: 'btn btn-ghost btn-sm', action: () => Dash.components.modal.close() },
      { text: 'Import Provider', class: 'btn btn-primary btn-sm bg-gradient-to-r from-[#FF6B00] to-[#FFB800] border-none text-white', action: async () => {
        const id = document.getElementById('adProvId').value.trim();
        const baseURL = document.getElementById('adBaseUrl').value.trim();
        if (!id || !baseURL) { Dash.components.toast.error('Provider ID and Base URL are required'); return; }
        if (!detectedFormat) { Dash.components.toast.error('Run auto-detect first'); return; }

        const formatSelect = document.getElementById('adFormatSelect');
        const selectedFormat = formatSelect.value;
        const path = FORMATS[selectedFormat] ? FORMATS[selectedFormat].path : detectedPath;
        Dash.components.toast.info('Importing provider with format: ' + selectedFormat.toUpperCase() + ' (' + path + ')');

        const result = await Dash.api.post('/providers/import', {
          id, name: id, baseURL,
          apiKey: document.getElementById('adApiKey').value.trim(),
          format: selectedFormat,
          path: path,
          models: Array.from(selectedModels).map(mid => ({ id: mid })),
          addToChain: true,
        });
        if (result && result.ok) {
          Dash.components.toast.success('Provider imported successfully!');
          Dash.components.modal.close();
          await this.loadData();
          const container = document.getElementById('pageContent');
          if (container) this.renderLayout(container);
          if (result.chainUpdated) {
            Dash.components.toast.info('Models added to routing chains. Check #routing tab.');
          }
        } else {
          Dash.components.toast.error('Import failed: ' + (result?.error || 'unknown'));
        }
      }},
    ]);

    // Auto-detect handler
    setTimeout(() => {
      const btn = document.getElementById('adDetectBtn');
      if (!btn) return;
      btn.addEventListener('click', async () => {
        const baseURL = document.getElementById('adBaseUrl').value.trim();
        const apiKey = document.getElementById('adApiKey').value.trim();
        if (!baseURL || !apiKey) { Dash.components.toast.error('Base URL and API Key are required'); return; }

        btn.disabled = true;
        btn.innerHTML = '<span class="loading loading-spinner loading-xs"></span> Detecting...';

        const result = await Dash.api.post('/providers/auto-detect', { baseURL, apiKey });
        if (!result || !result.ok) {
          Dash.components.toast.error('Detection failed: ' + (result?.error || 'no response'));
          btn.disabled = false;
          btn.innerHTML = '🔍 Detect API Format & Models';
          return;
        }

        detectedFormat = result.format;
        detectedPath = result.path;
        availableModels = result.models || [];
        selectedModels = new Set();

        const resultDiv = document.getElementById('adResult');
        resultDiv.className = 'mt-2 p-3 rounded-lg border text-sm space-y-2';
        resultDiv.innerHTML =
          '<div class="flex items-center gap-2">' +
            '<span class="badge badge-success badge-sm">' + result.format.toUpperCase() + '</span>' +
            '<code class="text-xs text-base-content/60">' + Dash.util.escapeHtml(result.path) + '</code>' +
          '</div>' +
          '<div class="text-xs font-semibold text-base-content/70 mt-1">Available Models: ' + result.modelCount + '</div>' +
          '<div class="max-h-40 overflow-y-auto space-y-1 mt-1" id="adModelList">' +
            (availableModels.map(m =>
              '<label class="flex items-center gap-2 px-2 py-1 rounded hover:bg-base-200/30 cursor-pointer">' +
                '<input type="checkbox" class="checkbox checkbox-xs ad-model-cb" data-mid="' + Dash.util.escapeHtml(m.id) + '"' +
                  (m.id.includes('deepseek') || m.id.includes('gpt') ? ' checked' : '') + '>' +
                '<code class="text-xs">' + Dash.util.escapeHtml(m.name || m.id) + '</code>' +
              '</label>'
            ).join('')) +
          '</div>';

        // Show + select format selector
        const formatGroup = document.getElementById('adFormatGroup');
        formatGroup.className = 'mt-2 space-y-2';
        const formatSelect = document.getElementById('adFormatSelect');
        formatSelect.value = result.format;

        // Track checkbox changes
        resultDiv.querySelectorAll('.ad-model-cb').forEach(cb => {
          cb.addEventListener('change', () => {
            if (cb.checked) selectedModels.add(cb.dataset.mid);
            else selectedModels.delete(cb.dataset.mid);
          });
          if (cb.checked) selectedModels.add(cb.dataset.mid);
        });

        btn.disabled = false;
        btn.innerHTML = '🔍 Re-detect';
      });
    }, 100);
  },

  showAddModal() {
    const div = document.createElement('div');
    div.innerHTML =
      '<div class="space-y-4">' +
        '<div class="form-control">' +
          '<label class="label"><span class="label-text">Provider ID <span class="text-error">*</span></span></label>' +
          '<input type="text" id="newProvId" class="input input-bordered input-sm" placeholder="my-custom-provider">' +
          '<label class="label"><span class="label-text-alt text-base-content/40">lowercase, hyphens, underscores</span></label>' +
        '</div>' +
        '<div class="form-control">' +
          '<label class="label"><span class="label-text">Display Name</span></label>' +
          '<input type="text" id="newProvName" class="input input-bordered input-sm" placeholder="My Custom Provider">' +
        '</div>' +
        '<div class="form-control">' +
          '<label class="label"><span class="label-text">Base URL <span class="text-error">*</span></span></label>' +
          '<input type="text" id="newProvBaseUrl" class="input input-bordered input-sm" placeholder="https://api.myprovider.com/v1">' +
        '</div>' +
        '<div class="form-control">' +
          '<label class="label"><span class="label-text">API Key Environment Variable</span></label>' +
          '<input type="text" id="newProvApiKeyEnv" class="input input-bordered input-sm" placeholder="e.g. OPENAI_API_KEY">' +
        '</div>' +
        '<div class="form-control">' +
          '<label class="label"><span class="label-text">API Key</span></label>' +
          '<input type="password" id="newProvApiKey" class="input input-bordered input-sm" placeholder="sk-...">' +
        '</div>' +
      '</div>';

    Dash.components.modal.show('Add Direct Provider', div, [
      { text: 'Cancel', class: 'btn btn-ghost btn-sm', action: () => Dash.components.modal.close() },
      { text: 'Add', class: 'btn btn-primary btn-sm bg-gradient-to-r from-[#FF6B00] to-[#FFB800] border-none text-white', action: async () => {
        const id = document.getElementById('newProvId').value.trim();
        const name = document.getElementById('newProvName').value.trim();
        const baseURL = document.getElementById('newProvBaseUrl').value.trim();
        const apiKeyEnv = document.getElementById('newProvApiKeyEnv').value.trim();
        const apiKey = document.getElementById('newProvApiKey').value.trim();

        if (!id || !baseURL) { Dash.components.toast.error('ID and Base URL are required'); return; }

        const result = await Dash.api.post('/providers/direct', { id, name, baseURL, apiKey, apiKeyEnv });
        if (result && result.ok) {
          Dash.components.toast.success('Added direct provider');
          Dash.components.modal.close();
          await this.loadData();
          this.renderLayout(document.getElementById('pageContent'));
          this.selectProvider(id, 'direct');
        } else {
          Dash.components.toast.error('Add failed: ' + (result?.error || 'unknown'));
        }
      }},
    ]);
  },

  showAddModelModal(providerId) {
    const div = document.createElement('div');
    div.innerHTML =
      '<div class="space-y-4">' +
        '<div class="form-control">' +
          '<label class="label"><span class="label-text">Model ID <span class="text-error">*</span></span></label>' +
          '<input type="text" id="newModelId" class="input input-bordered input-sm" placeholder="my-model-v1">' +
        '</div>' +
        '<div class="form-control">' +
          '<label class="label"><span class="label-text">Model Name</span></label>' +
          '<input type="text" id="newModelName" class="input input-bordered input-sm" placeholder="My Model V1">' +
        '</div>' +
      '</div>';

    Dash.components.modal.show('Add Model', div, [
      { text: 'Cancel', class: 'btn btn-ghost btn-sm', action: () => Dash.components.modal.close() },
      { text: 'Add', class: 'btn btn-primary btn-sm bg-gradient-to-r from-[#FF6B00] to-[#FFB800] border-none text-white', action: async () => {
        const modelId = document.getElementById('newModelId').value.trim();
        const name = document.getElementById('newModelName').value.trim();
        if (!modelId) { Dash.components.toast.error('Model ID is required'); return; }

        const result = await Dash.api.post('/providers/direct/' + encodeURIComponent(providerId) + '/models', { modelId, name });
        if (result && result.ok) {
          sessionStorage.setItem('routingPrefillProvider', providerId);
          sessionStorage.setItem('routingPrefillModel', modelId);
          Dash.components.modal.close();
          Dash.components.toast.success(
            '<div class="flex items-center gap-2">' +
              '<span>Model added</span>' +
              '<button class="btn btn-xs btn-primary bg-gradient-to-r from-[#FF6B00] to-[#FFB800] border-none text-white" onclick="window.location.hash=\'#routing\'">Add to routing →</button>' +
            '</div>'
          );
          await this.loadData();
          this.renderLayout(document.getElementById('pageContent'));
          this.selectProvider(providerId, 'direct');
        } else {
          Dash.components.toast.error('Add failed: ' + (result?.error || 'unknown'));
        }
      }},
    ]);
  },

  async deleteDirectModel(providerId, modelId) {
    const result = await Dash.api.del('/providers/direct/' + encodeURIComponent(providerId) + '/models/' + encodeURIComponent(modelId));
    if (result && result.ok) {
      Dash.components.toast.success('Model deleted');
      await this.loadData();
      this.renderLayout(document.getElementById('pageContent'));
      this.selectProvider(providerId, 'direct');
    } else {
      Dash.components.toast.error('Delete failed');
    }
  },

  async showOpenCodeConfigModal() {
    const result = await Dash.api.get('/providers/opencode/config');
    if (!result || !result.ok) {
      Dash.components.toast.error('Cannot read config: ' + (result?.error || 'unknown'));
      return;
    }

    const div = document.createElement('div');
    div.innerHTML =
      '<div class="space-y-4">' +
        '<div class="form-control">' +
          '<label class="label"><span class="label-text">opencode.jsonc</span></label>' +
          '<textarea id="opencodeConfigEditor" class="textarea textarea-bordered font-mono text-xs h-64" spellcheck="false">' + Dash.util.escapeHtml(result.raw) + '</textarea>' +
        '</div>' +
        '<div class="text-xs text-base-content/40">Sau khi save, OpenCode sẽ được restart. Downtime ~7s.</div>' +
      '</div>';

    Dash.components.modal.show('OpenCode Config Editor', div, [
      { text: 'Cancel', class: 'btn btn-ghost btn-sm', action: () => Dash.components.modal.close() },
      { text: 'Save & Restart', class: 'btn btn-warning btn-sm', action: async () => {
        const raw = document.getElementById('opencodeConfigEditor').value;
        const saveResult = await Dash.api.post('/providers/opencode/config', { raw });
        if (!saveResult || !saveResult.ok) {
          Dash.components.toast.error('Save failed: ' + (saveResult?.error || 'unknown'));
          return;
        }
        Dash.components.toast.info('Config saved, restarting OpenCode...');
        const restartResult = await Dash.api.post('/providers/opencode/restart');
        if (restartResult && restartResult.ok) {
          Dash.components.toast.success('OpenCode restart initiated (~7s)');
          Dash.components.modal.close();
          setTimeout(() => this.refreshAfterRestart(), 10000);
        } else {
          Dash.components.toast.error('Restart failed: ' + (restartResult?.error || 'unknown'));
        }
      }},
    ]);
  },

  async restartOpenCode() {
    Dash.components.confirm.show(
      'Restart OpenCode',
      'Restart OpenCode? Downtime ~7s. Active requests may fail and retry.',
      async () => {
        Dash.components.toast.info('Restarting OpenCode...');
        const result = await Dash.api.post('/providers/opencode/restart');
        if (result && result.ok) {
          Dash.components.toast.success('Restart initiated (~7s)');
          setTimeout(() => this.refreshAfterRestart(), 10000);
        } else {
          Dash.components.toast.error('Restart failed: ' + (result?.error || 'unknown'));
        }
      },
      'Restart', 'Cancel'
    );
  },

  async refreshAfterRestart() {
    const status = await Dash.api.get('/providers/opencode/status');
    if (status && status.ok) {
      this.opencodeStatus = status;
      Dash.components.toast.success('OpenCode is running');
    } else {
      Dash.components.toast.warning('OpenCode not responding yet');
    }
    await this.loadData();
    this.renderLayout(document.getElementById('pageContent'));
  },
  async showAddKeyModal(providerId) {
    const div = document.createElement('div');
    div.innerHTML =
      '<div class="space-y-4">' +
        '<div class="form-control">' +
          '<label class="label"><span class="label-text">Env Var Name <span class="text-error">*</span></span></label>' +
          '<input type="text" id="newKeyEnv" class="input input-bordered input-sm" placeholder="e.g. MY_PROVIDER_API_KEY_2">' +
          '<label class="label"><span class="label-text-alt text-base-content/40">Tên biến môi trường chứa API key</span></label>' +
        '</div>' +
        '<div class="grid grid-cols-2 gap-4">' +
          '<div class="form-control">' +
            '<label class="label"><span class="label-text">Weight</span></label>' +
            '<input type="number" id="newKeyWeight" class="input input-bordered input-sm" value="100" min="1" max="1000">' +
            '<label class="label"><span class="label-text-alt text-base-content/40">1-1000</span></label>' +
          '</div>' +
          '<div class="form-control">' +
            '<label class="label"><span class="label-text">RPM</span></label>' +
            '<input type="number" id="newKeyRpm" class="input input-bordered input-sm" value="500" min="1" max="10000">' +
            '<label class="label"><span class="label-text-alt text-base-content/40">1-10000</span></label>' +
          '</div>' +
        '</div>' +
        '<div class="p-3 bg-warning/5 border border-warning/10 rounded-xl text-xs text-warning">' +
          'Env var phải tồn tại trong file <code>.env</code> hoặc environment. Nếu chưa có, key sẽ không hoạt động cho đến khi bạn thêm nó.' +
        '</div>' +
      '</div>';

    Dash.components.modal.show('Add API Key to Pool', div, [
      { text: 'Cancel', class: 'btn btn-ghost btn-sm', action: () => Dash.components.modal.close() },
      { text: 'Add Key', class: 'btn btn-primary btn-sm bg-gradient-to-r from-[#FF6B00] to-[#FFB800] border-none text-white', action: async () => {
        const env = document.getElementById('newKeyEnv').value.trim();
        const weight = parseInt(document.getElementById('newKeyWeight').value) || 100;
        const rpm = parseInt(document.getElementById('newKeyRpm').value) || 500;
        if (!env) { Dash.components.toast.error('Env var name is required'); return; }

        const result = await Dash.api.post('/providers/' + encodeURIComponent(providerId) + '/keys', { env, weight, rpm });
        if (result && result.ok) {
          Dash.components.toast.success('Key added! ' + (result.warning || ''));
          Dash.components.modal.close();
          await this.loadData();
          const container = document.getElementById('pageContent');
          if (container) {
            this.renderLayout(container);
            this.selectProvider(providerId, 'direct');
          }
        } else {
          Dash.components.toast.error('Failed: ' + (result?.error || 'unknown'));
        }
      }},
    ]);
  },

  async showEditKeyModal(providerId, keyEnv, currentWeight, currentRpm) {
    const div = document.createElement('div');
    div.innerHTML =
      '<div class="space-y-4">' +
        '<div class="form-control">' +
          '<label class="label"><span class="label-text">Key</span></label>' +
          '<input type="text" class="input input-bordered input-sm" value="' + Dash.util.escapeHtml(keyEnv) + '" disabled>' +
        '</div>' +
        '<div class="grid grid-cols-2 gap-4">' +
          '<div class="form-control">' +
            '<label class="label"><span class="label-text">Weight</span></label>' +
            '<input type="number" id="editKeyWeight" class="input input-bordered input-sm" value="' + (currentWeight || 100) + '" min="1" max="1000">' +
          '</div>' +
          '<div class="form-control">' +
            '<label class="label"><span class="label-text">RPM</span></label>' +
            '<input type="number" id="editKeyRpm" class="input input-bordered input-sm" value="' + (currentRpm || 500) + '" min="1" max="10000">' +
          '</div>' +
        '</div>' +
      '</div>';

    Dash.components.modal.show('Edit Key: ' + Dash.util.escapeHtml(keyEnv), div, [
      { text: 'Cancel', class: 'btn btn-ghost btn-sm', action: () => Dash.components.modal.close() },
      { text: 'Save', class: 'btn btn-primary btn-sm bg-gradient-to-r from-[#FF6B00] to-[#FFB800] border-none text-white', action: async () => {
        const weight = parseInt(document.getElementById('editKeyWeight').value) || 100;
        const rpm = parseInt(document.getElementById('editKeyRpm').value) || 500;
        const result = await Dash.api.put('/providers/' + encodeURIComponent(providerId) + '/keys/' + encodeURIComponent(keyEnv), { weight, rpm });
        if (result && result.ok) {
          Dash.components.toast.success('Key updated');
          Dash.components.modal.close();
          await this.loadData();
          const container = document.getElementById('pageContent');
          if (container) {
            this.renderLayout(container);
            this.selectProvider(providerId, 'direct');
          }
        } else {
          Dash.components.toast.error('Update failed: ' + (result?.error || 'unknown'));
        }
      }},
    ]);
  },

  async deleteKey(providerId, keyEnv) {
    const pool = this.getPoolForProvider(providerId);
    if (!pool || pool.totalKeys <= 1) {
      Dash.components.toast.error('Cannot remove the last key. Use standard API key configuration instead.');
      return;
    }
    Dash.components.confirm.show(
      'Remove Key',
      'Remove key "' + Dash.util.escapeHtml(keyEnv) + '" from the pool? This action cannot be undone.',
      async () => {
        const result = await Dash.api.del('/providers/' + encodeURIComponent(providerId) + '/keys/' + encodeURIComponent(keyEnv));
        if (result && result.ok) {
          Dash.components.toast.success('Key removed');
          await this.loadData();
          const container = document.getElementById('pageContent');
          if (container) {
            this.renderLayout(container);
            this.selectProvider(providerId, 'direct');
          }
        } else {
          Dash.components.toast.error('Remove failed: ' + (result?.error || 'unknown'));
        }
      },
      'Xoá', 'Cancel'
    );
  },
};

window.Dash = Dash;
