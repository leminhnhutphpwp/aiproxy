var Dash = window.Dash || {};
Dash.pages = Dash.pages || {};

Dash.pages.routing = {
  families: [],
  filtered: [],
  searchTerm: '',
  editAlias: null,
  allProvidersWithModels: {},  // { providerId: [modelId, ...] }
  connectedProviders: [],

  VENDORS: ['Anthropic', 'DeepSeek', 'Google', 'Meta', 'MiniMax', 'Moonshot AI', 'OpenAI', 'Alibaba Cloud', 'Xiaomi', 'Zhipu AI'],

  getChainFromEntry(f) {
    if (f.chain && f.chain.length > 0) {
      return f.chain.map((e, i) => ({ provider: e.provider, model: e.model || '', isDefault: i === 0 }));
    }
    const seen = new Set();
    const order = [];
    if (f.prefer) { order.push(f.prefer); seen.add(f.prefer); }
    if (f.fallback && !seen.has(f.fallback)) { order.push(f.fallback); seen.add(f.fallback); }
    for (const p of (f.matchProviders || [])) {
      if (!seen.has(p)) { order.push(p); seen.add(p); }
    }
    const models = f.matchModels || [];
    let mi = 0;
    return order.map((p, i) => ({
      provider: p,
      model: mi < models.length ? models[mi++] : '',
      isDefault: i === 0,
    }));
  },

  renderChainRow(entry, idx, allProviders) {
    const isDefault = idx === 0;
    const provOpts = allProviders.map(p =>
      '<option value="' + Dash.util.escapeHtml(p) + '" ' + (entry.provider === p ? 'selected' : '') + '>' + Dash.util.escapeHtml(p) + '</option>'
    ).join('');

    const models = this.allProvidersWithModels[entry.provider] || [];
    const modelOpts = '<option value="">Auto (family match)</option>' +
      models.map(m =>
        '<option value="' + Dash.util.escapeHtml(m) + '" ' + (entry.model === m ? 'selected' : '') + '>' + Dash.util.escapeHtml(m) + '</option>'
      ).join('');

    return '<div class="routing-chain-entry flex items-center gap-2 px-3 py-2 rounded-lg ' +
      (isDefault ? 'bg-[#FF6B00]/10 border border-[#FF6B00]/30' : 'bg-base-200/30 border border-base-300/20') +
      '" data-idx="' + idx + '">' +
      '<span class="text-sm font-bold w-6 text-center ' + (isDefault ? 'text-[#FF6B00]' : 'text-base-content/40') + '">' +
        (isDefault ? '★' : (idx + 1)) +
      '</span>' +
      '<select class="select select-xs select-bordered flex-1 min-w-0 truncate chain-provider" data-idx="' + idx + '">' + provOpts + '</select>' +
      '<span class="text-base-content/30 text-xs">/</span>' +
      '<select class="select select-xs select-bordered flex-1 min-w-0 truncate chain-model font-mono" data-idx="' + idx + '">' + modelOpts + '</select>' +
      '<button class="btn btn-ghost btn-xs btn-square ' + (isDefault ? 'text-[#FF6B00] cursor-default' : 'text-base-content/30 hover:text-[#FF6B00] chain-set-default') + '" data-idx="' + idx + '" title="' + (isDefault ? 'Default' : 'Set as Default') + '">' +
        '<svg fill="currentColor" viewBox="0 0 24 24" class="w-3.5 h-3.5"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>' +
      '</button>' +
      '<button class="btn btn-ghost btn-xs btn-square text-error/50 hover:text-error chain-delete" data-idx="' + idx + '" title="Remove">' +
        '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" class="w-3.5 h-3.5"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>' +
      '</button>' +
    '</div>';
  },

  renderChain(chain, allProviders) {
    if (chain.length === 0) {
      chain = [{ provider: allProviders[0] || '', model: '', isDefault: true }];
    }
    return '<div class="routing-chain space-y-1">' +
      chain.map((e, i) => this.renderChainRow(e, i, allProviders)).join('') +
      '<button class="btn btn-ghost btn-xs text-[#FF6B00] w-full mt-1 chain-add">+ Thêm provider-model</button>' +
    '</div>';
  },

  getChainFromModal() {
    const container = document.querySelector('#modalOverlay .modal-box');
    if (!container) return null;
    const entries = container.querySelectorAll('.routing-chain-entry');
    return Array.from(entries).map(el => ({
      provider: el.querySelector('.chain-provider').value,
      model: el.querySelector('.chain-model').value.trim(),
    }));
  },

  buildChainForSave(chain) {
    return chain;
  },

  buildEditForm(f, isNew) {
    const allProviders = this.getConnectedProviderList();
    const chain = this.getChainFromEntry(f);

    const vendorOptions = this.VENDORS.map(v =>
      '<option value="' + Dash.util.escapeHtml(v) + '" ' + (f.vendor === v ? 'selected' : '') + '>' + Dash.util.escapeHtml(v) + '</option>'
    ).join('');

    const div = document.createElement('div');
    div.innerHTML =
      '<div class="space-y-4">' +
        '<div class="grid grid-cols-2 gap-4">' +
          '<div class="form-control col-span-2">' +
            '<label class="label"><span class="label-text">Alias <span class="text-error">*</span></span></label>' +
            '<input type="text" id="editAlias" class="input input-bordered input-sm w-full font-mono" value="' + Dash.util.escapeHtml(f.id) + '" placeholder="vd: deepseek-v4-flash">' +
            '<label class="label"><span class="label-text-alt text-base-content/40">lowercase, hyphens. Vd: <code>claude-sonnet-4-6</code></span></label>' +
          '</div>' +
        '</div>' +
        '<div>' +
          '<label class="label py-1"><span class="label-text font-semibold">Routing Chain <span class="text-error">*</span></span></label>' +
          '<div class="text-xs text-base-content/40 mb-2">Thứ tự ưu tiên — row đầu = default, các row sau = fallback chain. Chọn model từ dropdown.</div>' +
          '<div class="routing-chain-container">' +
            this.renderChain(chain, allProviders) +
          '</div>' +
        '</div>' +
        '<div class="grid grid-cols-2 gap-4">' +
          '<div class="form-control col-span-2">' +
            '<label class="label"><span class="label-text">Match Family <span class="text-base-content/40 text-xs">(broad fallback, comma-separated)</span></span></label>' +
            '<input type="text" id="editMatchFamily" class="input input-bordered input-sm w-full" value="' + Dash.util.escapeHtml((f.matchFamily || []).join(', ')) + '" placeholder="vd: deepseek-flash, deepseek-flash-free">' +
          '</div>' +
          '<div class="form-control">' +
            '<label class="label"><span class="label-text">Vendor <span class="text-error">*</span></span></label>' +
            '<select id="editVendor" class="select select-sm select-bordered w-full"><option value="">Chọn vendor...</option>' + vendorOptions + '</select>' +
          '</div>' +
          '<div class="form-control">' +
            '<label class="label"><span class="label-text">Display Name</span></label>' +
            '<input type="text" id="editDisplayName" class="input input-bordered input-sm w-full" value="' + Dash.util.escapeHtml(f.displayName || '') + '" placeholder="vd: DeepSeek V4 Flash">' +
          '</div>' +
          '<div class="form-control">' +
            '<label class="label cursor-pointer"><span class="label-text">Show in /v1/models</span>' +
            '<input type="checkbox" id="editShow" class="toggle toggle-sm" ' + (f.show ? 'checked' : '') + '></label>' +
          '</div>' +
          '<div class="form-control">' +
            '<label class="label cursor-pointer"><span class="label-text">Enabled</span>' +
            '<input type="checkbox" id="editEnabled" class="toggle toggle-sm" ' + (f.enabled ? 'checked' : '') + '></label>' +
          '</div>' +
        '</div>' +
        '<div class="bg-base-200/30 rounded-lg p-4 border border-base-300/30" id="candidatePreviewArea">' +
          '<div class="text-sm font-semibold mb-2 text-base-content/70">Candidate Preview</div>' +
          '<div class="text-sm text-base-content/40" id="candidatePreviewContent">Đang tải...</div>' +
        '</div>' +
      '</div>';

    setTimeout(() => this.wireChainEvents(), 0);
    return div;
  },

  wireChainEvents() {
    const container = document.querySelector('#modalOverlay .modal-box');
    if (!container) return;

    container.querySelectorAll('.chain-provider').forEach(el => {
      el.addEventListener('change', () => {
        this.updateModelDropdownForRow(el);
        this.refreshCandidatePreviewDelayed();
      });
    });

    container.querySelectorAll('.chain-model').forEach(el => {
      el.addEventListener('change', () => this.refreshCandidatePreviewDelayed());
    });

    container.querySelectorAll('.chain-set-default').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.idx, 10);
        if (idx === 0) return;
        this.reorderChain(idx, 0);
      });
    });

    container.querySelectorAll('.chain-delete').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.idx, 10);
        this.removeChainEntry(idx);
      });
    });

    const addBtn = container.querySelector('.chain-add');
    if (addBtn) addBtn.addEventListener('click', () => this.addChainEntry());
  },

  updateModelDropdownForRow(providerEl) {
    const idx = providerEl.dataset.idx;
    const provider = providerEl.value;
    const modelSelect = document.querySelector('.chain-model[data-idx="' + idx + '"]');
    if (!modelSelect) return;
    const currentVal = modelSelect.value;
    const models = this.allProvidersWithModels[provider] || [];
    modelSelect.innerHTML = '<option value="">Auto (family match)</option>' +
      models.map(m =>
        '<option value="' + Dash.util.escapeHtml(m) + '" ' + (m === currentVal ? 'selected' : '') + '>' + Dash.util.escapeHtml(m) + '</option>'
      ).join('');
  },

  reorderChain(fromIdx, toIdx) {
    const container = document.querySelector('#modalOverlay .modal-box');
    if (!container) return;
    const chain = this.getChainFromModal();
    if (!chain || fromIdx < 0 || fromIdx >= chain.length) return;
    const [moved] = chain.splice(fromIdx, 1);
    chain.splice(toIdx, 0, moved);
    const allProviders = this.getConnectedProviderList();
    const chainContainer = container.querySelector('.routing-chain-container');
    chainContainer.innerHTML = this.renderChain(chain, allProviders);
    this.wireChainEvents();
    this.refreshCandidatePreviewDelayed();
  },

  removeChainEntry(idx) {
    const container = document.querySelector('#modalOverlay .modal-box');
    if (!container) return;
    const chain = this.getChainFromModal();
    if (!chain || chain.length <= 1) { Dash.components.toast.error('Phải có ít nhất 1 provider-model'); return; }
    chain.splice(idx, 1);
    const allProviders = this.getConnectedProviderList();
    const chainContainer = container.querySelector('.routing-chain-container');
    chainContainer.innerHTML = this.renderChain(chain, allProviders);
    this.wireChainEvents();
    this.refreshCandidatePreviewDelayed();
  },

  addChainEntry() {
    const container = document.querySelector('#modalOverlay .modal-box');
    if (!container) return;
    const allProviders = this.getConnectedProviderList();
    const chain = this.getChainFromModal() || [];
    chain.push({ provider: allProviders[0] || '', model: '', isDefault: false });
    const chainContainer = container.querySelector('.routing-chain-container');
    chainContainer.innerHTML = this.renderChain(chain, allProviders);
    this.wireChainEvents();
    this.refreshCandidatePreviewDelayed();
  },

  refreshCandidatePreviewDelayed: null,

  async refreshCandidatePreview() {
    const alias = document.querySelector('#modalOverlay #editAlias')?.value?.trim();
    if (!alias) return;
    await this.loadCandidatePreview(alias);
  },

  async render(container) {
    container.innerHTML = '<div class="space-y-5 p-8"><div class="skeleton-pulse h-8 w-48 rounded"></div><div class="skeleton-pulse h-96 rounded-xl"></div></div>';

    const [data, provData] = await Promise.all([
      Dash.api.get('/routing'),
      Dash.api.get('/providers/all'),
    ]);
    if (!data || !data.families) {
      container.innerHTML = '<div class="text-center py-12 text-error">Không thể tải model routing</div>';
      return;
    }

    this.allProvidersWithModels = {};
    if (provData) {
      for (const p of [...(provData.opencode || []), ...(provData.direct || [])]) {
        this.allProvidersWithModels[p.id] = (p.models || []).map(m => m.id);
      }
    }

    this.connectedProviders = Object.keys(this.allProvidersWithModels);
    this.families = data.families.sort((a, b) => a.id.localeCompare(b.id));
    this.filtered = [...this.families];

    this.refreshCandidatePreviewDelayed = Dash.util.debounce(() => this.refreshCandidatePreview(), 300);

    const prefillProvider = sessionStorage.getItem('routingPrefillProvider');
    const prefillModel = sessionStorage.getItem('routingPrefillModel');
    if (prefillProvider) {
      sessionStorage.removeItem('routingPrefillProvider');
      sessionStorage.removeItem('routingPrefillModel');
      setTimeout(() => {
        this.openAddModel(prefillProvider, prefillModel || '');
      }, 100);
    }

    container.innerHTML =
      '<div class="mb-6">' +
        '<div class="flex flex-wrap items-center gap-3">' +
          '<div class="form-control flex-1 min-w-[200px] max-w-sm">' +
            '<input type="text" id="routingSearch" class="input input-bordered input-sm w-full" placeholder="Tìm model..." value="' + Dash.util.escapeHtml(this.searchTerm) + '">' +
          '</div>' +
          '<button id="addModelBtn" class="btn btn-primary btn-sm bg-gradient-to-r from-[#FF6B00] to-[#FFB800] border-none text-white">+ Thêm Model</button>' +
          '<span class="text-sm text-base-content/50" id="routingCount">' + this.families.length + ' families</span>' +
        '</div>' +
      '</div>' +
      '<div class="overflow-x-auto rounded-xl border border-base-300/50">' +
        '<table class="table table-sm">' +
          '<thead>' +
            '<tr class="text-xs uppercase text-base-content/40">' +
              '<th>Alias</th>' +
              '<th>Vendor</th>' +
              '<th>Routing Chain</th>' +
              '<th class="text-center">Show</th>' +
              '<th class="text-center">Enabled</th>' +
              '<th class="text-center w-12"></th>' +
            '</tr>' +
          '</thead>' +
          '<tbody id="routingBody"></tbody>' +
        '</table>' +
      '</div>';

    this.renderRows();

    document.getElementById('routingSearch').addEventListener('input', (e) => {
      this.searchTerm = e.target.value;
      this.filterRows();
    });

    document.getElementById('addModelBtn').addEventListener('click', () => this.openAddModel());
  },

  renderRows() {
    const tbody = document.getElementById('routingBody');
    if (!tbody) return;

    tbody.innerHTML = this.filtered.map(f => {
      const chain = this.getChainFromEntry(f);
      const chainStr = chain.map((e, i) =>
        (i === 0 ? '★ ' : '') + Dash.util.escapeHtml(e.provider) + (e.model ? '/' + Dash.util.escapeHtml(e.model) : '')
      ).join(' → ');

      return '<tr class="routing-row cursor-pointer hover:bg-base-200/50" data-alias="' + Dash.util.escapeHtml(f.id) + '">' +
        '<td class="font-medium text-sm">' + Dash.util.escapeHtml(f.id) + '</td>' +
        '<td class="text-sm">' + Dash.util.escapeHtml(f.vendor || '') + '</td>' +
        '<td class="text-xs font-mono text-base-content/60 max-w-[320px] truncate" title="' + Dash.util.escapeHtml(chainStr) + '">' + chainStr + '</td>' +
        '<td class="text-center">' +
          '<input type="checkbox" class="toggle toggle-xs routing-toggle" data-field="show" data-alias="' + Dash.util.escapeHtml(f.id) + '" ' + (f.show ? 'checked' : '') + '>' +
        '</td>' +
        '<td class="text-center">' +
          '<input type="checkbox" class="toggle toggle-xs routing-toggle" data-field="enabled" data-alias="' + Dash.util.escapeHtml(f.id) + '" ' + (f.enabled ? 'checked' : '') + '>' +
        '</td>' +
        '<td class="text-center">' +
          '<button class="btn btn-ghost btn-xs btn-square text-error/60 hover:text-error routing-delete" data-alias="' + Dash.util.escapeHtml(f.id) + '" title="Xoá model">' +
            '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" class="w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>' +
          '</button>' +
        '</td>' +
      '</tr>';
    }).join('');

    tbody.querySelectorAll('.routing-row').forEach(row => {
      row.addEventListener('click', (e) => {
        if (e.target.closest('.routing-toggle')) return;
        if (e.target.closest('.routing-delete')) return;
        this.openEdit(row.dataset.alias);
      });
    });

    tbody.querySelectorAll('.routing-toggle').forEach(toggle => {
      toggle.addEventListener('change', async (e) => {
        e.stopPropagation();
        const alias = toggle.dataset.alias;
        const field = toggle.dataset.field;
        const result = await Dash.api.post('/routing/toggle', { alias, field });
        if (!result || !result.ok) {
          toggle.checked = !toggle.checked;
          Dash.components.toast.error('Lỗi toggle ' + field);
        } else {
          const f = this.families.find(x => x.id === alias);
          if (f) f[field] = result.value;
          Dash.components.toast.success('Đã ' + (result.value ? 'bật' : 'tắt') + ' ' + field);
        }
      });
    });

    tbody.querySelectorAll('.routing-delete').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.openDelete(btn.dataset.alias);
      });
    });
  },

  filterRows() {
    if (!this.searchTerm) {
      this.filtered = [...this.families];
    } else {
      const q = this.searchTerm.toLowerCase();
      this.filtered = this.families.filter(f => {
        const providers = f.chain ? f.chain.map(e => e.provider) : (f.matchProviders || []);
        return f.id.toLowerCase().includes(q) ||
          (f.vendor || '').toLowerCase().includes(q) ||
          providers.some(p => p.toLowerCase().includes(q));
      });
    }
    document.getElementById('routingCount').textContent = this.filtered.length + ' families';
    this.renderRows();
  },

  getConnectedProviderList() {
    return this.connectedProviders.length > 0
      ? this.connectedProviders
      : ['nvidia', 'github-models', 'opencode'];
  },

  async openEdit(alias) {
    const f = this.families.find(x => x.id === alias);
    if (!f) return;
    this.editAlias = alias;

    const content = this.buildEditForm(f, false);

    Dash.components.modal.show(
      'Edit: ' + Dash.util.escapeHtml(f.id),
      content,
      [
        { text: 'Huỷ', class: 'btn btn-ghost btn-sm', action: () => Dash.components.modal.close() },
        { text: 'Lưu', class: 'btn btn-primary btn-sm bg-gradient-to-r from-[#FF6B00] to-[#FFB800] border-none text-white', action: () => this.saveEdit(alias) },
      ]
    );
    setTimeout(() => {
      const mb = document.querySelector('#modalOverlay .modal-box');
      if (mb) mb.classList.add('max-w-3xl');
    }, 0);

    this.loadCandidatePreview(alias);
  },

  openAddModel(prefillProvider, prefillModel) {
    const provider = prefillProvider && this.connectedProviders.includes(prefillProvider) ? prefillProvider : (this.getConnectedProviderList()[0] || 'freemodel');
    const empty = { id: '', vendor: '', displayName: '', matchFamily: [], chain: [{ provider, model: prefillModel || '' }], show: true, enabled: true };
    const content = this.buildEditForm(empty, true);

    Dash.components.modal.show(
      'Thêm Model Mới',
      content,
      [
        { text: 'Huỷ', class: 'btn btn-ghost btn-sm', action: () => Dash.components.modal.close() },
        { text: 'Thêm', class: 'btn btn-primary btn-sm bg-gradient-to-r from-[#FF6B00] to-[#FFB800] border-none text-white', action: () => this.saveEdit(null) },
      ]
    );
    setTimeout(() => {
      const mb = document.querySelector('#modalOverlay .modal-box');
      if (mb) mb.classList.add('max-w-3xl');
    }, 0);
  },

  async loadCandidatePreview(alias) {
    const previewEl = document.getElementById('candidatePreviewContent');
    if (!previewEl) return;
    previewEl.textContent = 'Đang tải...';

    const data = await Dash.api.get('/routing/candidates/' + encodeURIComponent(alias));
    const candidates = (data && data.candidates) || [];
    const resolved = (data && data.resolved) || null;

    if (candidates.length === 0) {
      previewEl.innerHTML = '<span class="text-base-content/40">Không có candidates — có thể do provider chưa kết nối</span>';
      return;
    }
    previewEl.innerHTML = '<div class="space-y-1">' +
      candidates.map((c, i) =>
        '<div class="flex items-center gap-2 text-sm">' +
          '<span class="text-xs text-base-content/30 w-5">#' + (i + 1) + '</span>' +
          '<span class="badge badge-xs ' + (c.matchKind === 'exact' ? 'badge-success' : 'badge-ghost') + '">' + c.matchKind + '</span>' +
          '<span>' + Dash.util.escapeHtml(c.providerID) + '/' + Dash.util.escapeHtml(c.modelID) + '</span>' +
          (resolved && resolved.providerID === c.providerID && resolved.modelID === c.modelID ? '<span class="badge badge-xs badge-warning">★ active</span>' : '') +
        '</div>'
      ).join('') +
    '</div>';
  },

  validateForm() {
    const modalBox = document.querySelector('#modalOverlay .modal-box');
    if (!modalBox) return null;

    const alias = modalBox.querySelector('#editAlias').value.trim();
    const vendor = modalBox.querySelector('#editVendor').value.trim();
    const displayName = modalBox.querySelector('#editDisplayName').value.trim();
    const matchFamily = modalBox.querySelector('#editMatchFamily').value.split(',').map(s => s.trim()).filter(Boolean);
    const show = modalBox.querySelector('#editShow').checked;
    const enabled = modalBox.querySelector('#editEnabled').checked;

    const chain = this.getChainFromModal();

    if (!alias) { Dash.components.toast.error('Alias là bắt buộc'); return null; }
    if (!/^[a-z0-9][a-z0-9.-]*$/.test(alias)) {
      Dash.components.toast.error('Alias chỉ được chứa lowercase, số, dấu gạch ngang và dấu chấm');
      return null;
    }
    if (!vendor) { Dash.components.toast.error('Vendor là bắt buộc'); return null; }
    if (!chain || chain.length === 0 || !chain[0].provider) { Dash.components.toast.error('Ít nhất 1 provider-model trong routing chain'); return null; }

    const providers = chain.map(e => e.provider).filter(Boolean);
    if (providers.length === 0) { Dash.components.toast.error('Phải có ít nhất 1 provider'); return null; }

    return {
      id: alias,
      vendor,
      displayName: displayName || alias,
      matchFamily,
      chain: chain.map(e => ({ provider: e.provider, model: e.model || '' })),
      show,
      enabled,
    };
  },

  async saveEdit(oldAlias) {
    const entry = this.validateForm();
    if (!entry) return;

    if (oldAlias !== entry.id) {
      const exists = this.families.some(f => f.id === entry.id);
      if (exists) {
        Dash.components.toast.error('Alias "' + entry.id + '" đã tồn tại');
        return;
      }
    }

    if (oldAlias && oldAlias !== entry.id) {
      this.families = this.families.filter(f => f.id !== oldAlias);
    }

    const idx = this.families.findIndex(f => f.id === entry.id);
    if (idx >= 0) {
      this.families[idx] = entry;
    } else {
      this.families.push(entry);
    }

    const result = await Dash.api.post('/routing/save', { families: this.families });
    if (result && result.ok) {
      if (result.reloadError) {
        Dash.components.toast.warning('Đã lưu nhưng reload registry lỗi: ' + result.reloadError);
      } else {
        Dash.components.toast.success((oldAlias ? 'Đã lưu' : 'Đã thêm') + ' & reload registry');
      }
      Dash.components.modal.close();
      this.render(document.getElementById('pageContent'));
    } else {
      Dash.components.toast.error('Lỗi lưu: ' + (result?.error || 'unknown'));
    }
  },

  openDelete(alias) {
    Dash.components.confirm.show(
      'Xoá Model',
      'Bạn có chắc muốn xoá model "' + Dash.util.escapeHtml(alias) + '" khỏi danh sách public models?',
      async () => {
        this.families = this.families.filter(f => f.id !== alias);
        const result = await Dash.api.post('/routing/save', { families: this.families });
        if (result && result.ok) {
          Dash.components.toast.success('Đã xoá & reload registry');
          this.render(document.getElementById('pageContent'));
        } else {
          Dash.components.toast.error('Lỗi xoá: ' + (result?.error || 'unknown'));
        }
      },
      'Xoá', 'Huỷ'
    );
  },
};

window.Dash = Dash;
