var Dash = window.Dash || {};
Dash.components = Dash.components || {};

Dash.components.sidebar = {
  isOpen: false,
  items: [
    { id: 'overview', label: 'Tổng quan', icon: '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/></svg>' },
    { id: 'models', label: 'Models', icon: '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>' },
    { id: 'providers', label: 'Providers', icon: '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01"/></svg>' },
    { id: 'breakers', label: 'Circuit Breakers', icon: '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>' },
    { id: 'health', label: 'Health Check', icon: '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>' },
    { id: 'logs', label: 'Request Logs', icon: '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"/></svg>' },
    { id: 'routing', label: 'Model Routing', icon: '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16l2.879-2.879m0 0a3 3 0 104.243-4.242 3 3 0 00-4.243 4.242zM21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>' },
    { id: 'memories', label: 'Memory', icon: '🧠', hash: '#memories' },
    { id: 'settings', label: 'Settings', icon: '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>' },
  ],

  render(container) {
    // Create overlay
    let overlay = document.getElementById('sidebarOverlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'sidebarOverlay';
      overlay.className = 'sidebar-overlay';
      overlay.addEventListener('click', () => this.close());
      document.body.appendChild(overlay);
    }

    container.innerHTML = '<div class="flex flex-col h-full bg-base-200 relative">' +
      '<div class="flex items-center gap-3 px-4 py-5 border-b border-base-300 bg-base-300/30">' +
        '<button id="sidebarToggle" class="btn btn-ghost btn-sm btn-square md:hidden flex-shrink-0">' +
          '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" class="w-5 h-5"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>' +
        '</button>' +
        '<svg viewBox="0 0 100 100" class="w-8 h-8 flex-shrink-0" xmlns="http://www.w3.org/2000/svg">' +
          '<defs><linearGradient id="logoSidebar" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#FF6B00"/><stop offset="100%" stop-color="#FFB800"/></linearGradient></defs>' +
          '<path d="M10 30 L25 70 L40 40 L50 55 L60 40 L75 70 L90 30 L75 70 L60 55 L50 70 L40 55 L25 70 Z" fill="url(#logoSidebar)" stroke="none"/>' +
          '<circle cx="50" cy="85" r="5" fill="url(#logoSidebar)"/>' +
          '<circle cx="35" cy="80" r="3.5" fill="url(#logoSidebar)"/>' +
          '<circle cx="65" cy="80" r="3.5" fill="url(#logoSidebar)"/>' +
        '</svg>' +
        '<div><div class="font-semibold text-sm text-base-content">AIProxy</div><div class="text-xs text-base-content/50">Dashboard</div></div>' +
      '</div>' +
      '<div class="px-3 pt-4 pb-1"><div class="text-xs font-semibold uppercase tracking-wider text-base-content/40 px-3">Navigation</div></div>' +
      '<ul class="menu menu-sm px-3 flex-1 gap-0.5">' +
        this.items.map(item => '<li><a class="sidebar-link" data-page="' + item.id + '">' + item.icon + '<span>' + (Dash.i18n ? Dash.i18n.t('nav.' + item.id) : item.label) + '</span></a></li>').join('') +
      '</ul>' +
      '<div class="p-3 border-t border-base-300 mt-2 space-y-1">' +
        '<div class="flex items-center justify-between px-3 py-1.5">' +
          '<span class="text-xs text-base-content/40">Language</span>' +
          '<select id="localeSwitcher" class="text-xs bg-base-300/50 border border-base-300 rounded px-1.5 py-0.5 cursor-pointer">' +
            '<option value="vi"' + (Dash.i18n && Dash.i18n.locale === 'vi' ? ' selected' : '') + '>🇻🇳 VI</option>' +
            '<option value="en"' + (Dash.i18n && Dash.i18n.locale === 'en' ? ' selected' : '') + '>🇺🇸 EN</option>' +
          '</select>' +
        '</div>' +
        '<ul class="menu menu-sm"><li><a class="sidebar-link" id="logoutBtn"><svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/></svg><span class="text-error">' + (Dash.i18n ? Dash.i18n.t('common.logout') : 'Đăng xuất') + '</span></a></li></ul>' +
      '</div>' +
    '</div>';

    container.querySelectorAll('.sidebar-link[data-page]').forEach(el => {
      el.addEventListener('click', () => { Dash.app.navigate(el.dataset.page); this.close(); });
    });

    document.getElementById('logoutBtn').addEventListener('click', async () => {
      await Dash.api.post('/logout');
      window.location.href = '/dashboard/index.html';
    });

    document.getElementById('sidebarToggle').addEventListener('click', () => this.close());

    const localeSelect = document.getElementById('localeSwitcher');
    if (localeSelect) {
      localeSelect.addEventListener('change', function() {
        const l = this.value;
        localStorage.setItem('dashboard_locale', l);
        window.location.reload();
      });
    }
  },

  toggle() {
    const el = document.querySelector('.sidebar');
    if (!el) return;
    el.classList.toggle('open');
    const overlay = document.getElementById('sidebarOverlay');
    if (overlay) overlay.classList.toggle('open');
    this.isOpen = el.classList.contains('open');
  },

  close() {
    const el = document.querySelector('.sidebar');
    if (el) el.classList.remove('open');
    const overlay = document.getElementById('sidebarOverlay');
    if (overlay) overlay.classList.remove('open');
    this.isOpen = false;
  },

  setActive(pageId) {
    document.querySelectorAll('.sidebar-link').forEach(el => el.classList.remove('active'));
    document.querySelector('.sidebar-link[data-page="' + pageId + '"]')?.classList.add('active');
  },
};

window.Dash = Dash;
