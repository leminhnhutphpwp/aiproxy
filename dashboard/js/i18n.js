(function() {
  const messages = {
    vi: {
      // Common
      'common.loading': 'Đang tải...',
      'common.error': 'Không thể tải dữ liệu',
      'common.refresh': '⟳ Làm mới',
      'common.no_data': 'Chưa có dữ liệu',
      'common.available': 'Đang hoạt động',
      'common.success': 'Thành công',
      'common.failure': 'Thất bại',
      'common.reason': 'Lý do',
      'common.status': 'Trạng thái',
      'common.all': 'Tất cả',
      'common.probe': 'Probe',
      'common.request': 'Request',
      'common.candidates': 'Candidates',
      'common.no_probe': '—',
      'common.uptime': 'Uptime',
      'common.logout': 'Đăng xuất',

      // Navigation / Sidebar
      'nav.overview': 'Tổng quan',
      'nav.models': 'Models',
      'nav.providers': 'Providers',
      'nav.breakers': 'Circuit Breakers',
      'nav.health': 'Health',
      'nav.logs': 'Logs',
      'nav.settings': 'Cài đặt',
      'nav.routing': 'Routing',
      'nav.memories': 'Memories',

      // Health page
      'health.title': 'Thông tin health probe',
      'health.total_probes': 'Tổng probes',
      'health.success': 'Thành công',
      'health.failure': 'Thất bại',
      'health.success_rate': 'Tỉ lệ thành công',
      'health.last_cycle': 'Lần chạy cuối',
      'health.running': 'Đang chạy',
      'health.running_yes': 'Đang chạy',
      'health.running_no': 'Đang chờ',
      'health.sweep': 'Sweep ban đầu',
      'health.sweep_done': 'Hoàn thành',
      'health.sweep_running': 'Đang chạy',

      // Overview page
      'overview.title': 'Thông tin tổng hợp hệ thống AI Proxy',
      'overview.total_models': 'Tổng Models',
      'overview.active': 'Đang hoạt động',
      'overview.today': 'Hôm nay',
      'overview.total_requests': 'Tổng requests',
      'overview.latency': 'Latency (avg)',
      'overview.tokens_today': 'Tokens hôm nay',
      'overview.cost_today': 'Chi phí hôm nay',
      'overview.total_tokens': 'Tổng Tokens',
      'overview.top_models': 'Top Models',
      'overview.models_error': 'Models with Errors',
      'overview.view_all': 'Xem tất cả →',
      'overview.view_logs': 'Xem logs →',
      'overview.success_note': '* Không gồm probe traffic',
      'overview.footnote': '* Tỉ lệ success chỉ tính real request, không gồm probe',

      // Models page
      'models.status': 'Status',
      'models.provider': 'Provider',
      'models.price': 'Price ($/M)',
      'models.success': 'Success',
      'models.tokens': 'Tokens',
      'models.detail': 'Chi tiết',
      'models.metadata': 'Metadata',
      'models.detail_title': 'Chi tiết model',
      'models.probe_last': 'Lần cuối',
      'models.probe_result': 'Kết quả',
      'models.probe_consecutive': 'Liên tiếp thành công',
      'models.probe_reason': 'Lý do',
      'models.request_last': 'Gần nhất',
      'models.request_result': 'Kết quả',
      'models.success_count': 'Thành công',
      'models.failure_count': 'Thất bại',
      'models.success_rate': 'Tỉ lệ thành công',
      'models.success_rate_note': '(real)',
      'models.peak_rps': 'Peak RPS',
      'models.no_drift': 'Không có drift. Source và generated đồng bộ.',
      'models.drift_found': 'Phát hiện drift! Source hash thay đổi. Cần chạy sync lại.',
      'models.syncing': 'Đang chạy sync...',
      'models.sync_done': 'Sync hoàn tất! Làm mới models page.',
      'models.sync_failed': 'Sync thất bại:',

      // Breakers page
      'breakers.title': 'Circuit Breaker',
      'breakers.total_keys': 'Tổng keys',

      // Providers page
      'providers.healthy': 'healthy',
      'providers.cooldown': 'cooldown',
      'providers.probing': 'probing',

      // Settings page
      'settings.title': 'Cài đặt hệ thống',
    },
    en: {
      // Common
      'common.loading': 'Loading...',
      'common.error': 'Unable to load data',
      'common.refresh': '⟳ Refresh',
      'common.no_data': 'No data yet',
      'common.available': 'Available',
      'common.success': 'Success',
      'common.failure': 'Failure',
      'common.reason': 'Reason',
      'common.status': 'Status',
      'common.all': 'All',
      'common.probe': 'Probe',
      'common.request': 'Request',
      'common.candidates': 'Candidates',
      'common.no_probe': '—',
      'common.uptime': 'Uptime',

      // Navigation
      'nav.overview': 'Overview',
      'nav.models': 'Models',
      'nav.providers': 'Providers',
      'nav.breakers': 'Circuit Breakers',
      'nav.health': 'Health',
      'nav.logs': 'Logs',
      'nav.settings': 'Settings',
      'nav.routing': 'Routing',
      'nav.memories': 'Memories',

      // Health page
      'health.title': 'Health Probe Info',
      'health.total_probes': 'Total Probes',
      'health.success': 'Success',
      'health.failure': 'Failure',
      'health.success_rate': 'Success Rate',
      'health.last_cycle': 'Last Cycle',
      'health.running': 'Running',
      'health.running_yes': 'Running',
      'health.running_no': 'Waiting',
      'health.sweep': 'Initial Sweep',
      'health.sweep_done': 'Completed',
      'health.sweep_running': 'In Progress',

      // Overview page
      'overview.title': 'AI Proxy System Overview',
      'overview.total_models': 'Total Models',
      'overview.active': 'Active',
      'overview.today': 'Today',
      'overview.total_requests': 'Total Requests',
      'overview.latency': 'Latency (avg)',
      'overview.tokens_today': "Today's Tokens",
      'overview.cost_today': "Today's Cost",
      'overview.total_tokens': 'Total Tokens',
      'overview.top_models': 'Top Models',
      'overview.models_error': 'Models with Errors',
      'overview.view_all': 'View All →',
      'overview.view_logs': 'View Logs →',
      'overview.success_note': '* Excludes probe traffic',
      'overview.footnote': '* Success rate counts real requests only, excludes probe traffic',

      // Models page
      'models.status': 'Status',
      'models.provider': 'Provider',
      'models.price': 'Price ($/M)',
      'models.success': 'Success',
      'models.tokens': 'Tokens',
      'models.detail': 'Details',
      'models.metadata': 'Metadata',
      'models.detail_title': 'Model Details',
      'models.probe_last': 'Last Probe',
      'models.probe_result': 'Result',
      'models.probe_consecutive': 'Consecutive Success',
      'models.probe_reason': 'Reason',
      'models.request_last': 'Last Request',
      'models.request_result': 'Result',
      'models.success_count': 'Success',
      'models.failure_count': 'Failure',
      'models.success_rate': 'Success Rate',
      'models.success_rate_note': '(real)',
      'models.peak_rps': 'Peak RPS',
      'models.no_drift': 'No drift. Source and generated are synced.',
      'models.drift_found': 'Drift detected! Source hash changed. Run sync.',
      'models.syncing': 'Running sync...',
      'models.sync_done': 'Sync complete! Refreshing models page.',
      'models.sync_failed': 'Sync failed:',

      // Breakers page
      'breakers.title': 'Circuit Breaker',
      'breakers.total_keys': 'Total keys',

      // Providers page
      'providers.healthy': 'healthy',
      'providers.cooldown': 'cooldown',
      'providers.probing': 'probing',

      // Settings page
      'settings.title': 'System Settings',
    },
  };

  function detectLocale() {
    try {
      const saved = localStorage.getItem('dashboard_locale');
      if (saved === 'en' || saved === 'vi') return saved;
      const m = document.cookie.match(/aiproxy_locale=([^;]+)/);
      if (m && (m[1] === 'en' || m[1] === 'vi')) return m[1];
    } catch {}
    return navigator.language?.startsWith('vi') ? 'vi' : 'en';
  }

  let locale = detectLocale();

  function setLocale(l) {
    if (l !== 'vi' && l !== 'en') return;
    locale = l;
    localStorage.setItem('dashboard_locale', l);
    document.cookie = 'aiproxy_locale=' + l + '; path=/; max-age=31536000';
  }

  function t(key) {
    const val = messages[locale]?.[key];
    return val !== undefined ? val : messages['en']?.[key] || key;
  }

  window.Dash = window.Dash || {};
  window.Dash.i18n = { t, locale, setLocale, messages };
})();
