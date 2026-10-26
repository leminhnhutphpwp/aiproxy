var Dash = window.Dash || {};
Dash.pages = Dash.pages || {};

Dash.pages.health = {
  async render(container) {
    container.innerHTML = '<div class="space-y-5 p-8"><div class="skeleton-pulse h-8 w-48 rounded"></div><div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5"><div class="skeleton-pulse h-24 rounded-xl"></div><div class="skeleton-pulse h-24 rounded-xl"></div><div class="skeleton-pulse h-24 rounded-xl"></div><div class="skeleton-pulse h-24 rounded-xl"></div></div><div class="skeleton-pulse h-40 rounded-xl mt-5"></div></div>';
    const data = await Dash.api.get('/health');
    if (!data) { container.innerHTML = '<div class="text-center py-12 text-error">Không thể tải dữ liệu</div>'; return; }

    const _t = Dash.i18n.t;
    const isVi = Dash.i18n.locale === 'vi';
    container.innerHTML =
      '<div class="mb-5"><p class="text-sm text-base-content/50">' + _t('health.title') + '</p></div>' +
      '<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-6">' +
        '<div class="stat bg-base-100 border border-base-200/50 rounded-xl p-5 stat-card-hover"><div class="stat-title text-xs text-base-content/50 font-medium uppercase tracking-wider">' + _t('health.total_probes') + '</div><div class="stat-value text-xl text-base-content mt-0.5">' + (data.totalProbes || 0).toLocaleString(isVi ? 'vi-VN' : 'en-US') + '</div></div>' +
        '<div class="stat bg-base-100 border border-base-200/50 rounded-xl p-5 stat-card-hover"><div class="stat-title text-xs text-base-content/50 font-medium uppercase tracking-wider">' + _t('health.success') + '</div><div class="stat-value text-xl text-success mt-0.5">' + (data.successes || 0).toLocaleString(isVi ? 'vi-VN' : 'en-US') + '</div></div>' +
        '<div class="stat bg-base-100 border border-base-200/50 rounded-xl p-5 stat-card-hover"><div class="stat-title text-xs text-base-content/50 font-medium uppercase tracking-wider">' + _t('health.failure') + '</div><div class="stat-value text-xl text-error mt-0.5">' + (data.failures || 0).toLocaleString(isVi ? 'vi-VN' : 'en-US') + '</div></div>' +
        '<div class="stat bg-base-100 border border-base-200/50 rounded-xl p-5 stat-card-hover"><div class="stat-title text-xs text-base-content/50 font-medium uppercase tracking-wider">' + _t('health.success_rate') + '</div><div class="stat-value text-xl text-base-content mt-0.5">' +
          (data.totalProbes > 0 ? Math.round(data.successes / data.totalProbes * 100) + '%' : '—') +
        '</div></div>' +
      '</div>' +
      '<div class="grid grid-cols-1 sm:grid-cols-3 gap-5">' +
        '<div class="bg-base-100 rounded-xl border border-base-200/50 p-5 stat-card-hover"><div class="text-xs uppercase tracking-wider text-base-content/50 font-medium">' + _t('health.last_cycle') + '</div><div class="text-sm font-medium text-base-content mt-1">' + Dash.util.escapeHtml(data.lastCycle ? new Date(data.lastCycle).toLocaleString(isVi ? 'vi-VN' : 'en-US') : '—') + '</div></div>' +
        '<div class="bg-base-100 rounded-xl border border-base-200/50 p-5 stat-card-hover"><div class="text-xs uppercase tracking-wider text-base-content/50 font-medium">' + _t('health.running') + '</div><div class="text-sm font-medium text-base-content mt-1">' + Dash.util.escapeHtml(data.running ? _t('health.running_yes') : _t('health.running_no')) + '</div></div>' +
        '<div class="bg-base-100 rounded-xl border border-base-200/50 p-5 stat-card-hover"><div class="text-xs uppercase tracking-wider text-base-content/50 font-medium">' + _t('health.sweep') + '</div><div class="text-sm font-medium text-base-content mt-1">' + (data.sweepDone ? '✅ ' + _t('health.sweep_done') : '⏳ ' + _t('health.sweep_running')) + '</div></div>' +
      '</div>';
  },
};

window.Dash = Dash;
