var Dash = window.Dash || {};

Dash.app = {
  currentPage: null,

  async init() {
    const me = await Dash.api.get('/me');
    if (!me) return;

    const savedTheme = localStorage.getItem('aiproxyTheme');
    if (savedTheme) {
      const body = document.querySelector('[data-theme]');
      if (body) body.setAttribute('data-theme', savedTheme);
      tailwind.config = savedTheme === 'aiproxy-light' ? window.aiproxyLightTheme : window.aiproxyTheme;
    }

    this.renderShell(me);
    this.navigate(this.getPageFromHash() || 'overview');
    window.addEventListener('hashchange', () => this.navigate(this.getPageFromHash()));
    this.setupKeyboardShortcuts();
    document.getElementById('userMenuBtn')?.addEventListener('click', async () => {
      await Dash.api.post('/logout');
      window.location.href = '/dashboard/index.html';
    });
  },

  getPageFromHash() {
    return window.location.hash.slice(1) || null;
  },

  navigate(page) {
    if (!page) page = 'overview';
    const previousPage = this.currentPage;
    this.currentPage = page;
    window.location.hash = page;
    Dash.components.sidebar.setActive(page);

    const titleEl = document.getElementById('pageTitle');
    if (titleEl) {
      const pageNames = { overview: 'Tổng quan', models: 'Models', providers: 'Providers', breakers: 'Circuit Breakers', health: 'Health Check', logs: 'Request Logs', routing: 'Model Routing', memories: 'Memory', settings: 'Settings' };
      titleEl.textContent = pageNames[page] || page;
    }

    const container = document.getElementById('pageContent');
    if (!container) return;

    if (previousPage && Dash.pages[previousPage]?.destroy) {
      Dash.pages[previousPage].destroy();
    }

    container.innerHTML = '';
    if (Dash.pages[page]?.render) {
      Dash.pages[page].render(container);
    } else {
      container.innerHTML = '<div class="text-center py-20 text-base-content/50">Trang không tồn tại</div>';
    }
  },

  refreshCurrentPage() {
    const container = document.getElementById('pageContent');
    if (!container) return;
    if (Dash.pages[this.currentPage]?.destroy) {
      Dash.pages[this.currentPage].destroy();
    }
    container.innerHTML = '';
    if (Dash.pages[this.currentPage]?.render) {
      Dash.pages[this.currentPage].render(container);
    }
  },

  renderShell(me) {
    const firstChar = me?.username ? me.username.charAt(0).toUpperCase() : 'A';
    document.body.innerHTML =
      '<div class="flex h-screen overflow-hidden" data-theme="aiproxy">' +
        '<aside class="sidebar bg-base-200 border-r border-base-300/50 flex flex-col shadow-xl shadow-black/10 z-10" id="sidebarContainer"></aside>' +
        '<main class="flex-1 flex flex-col overflow-hidden bg-base-100">' +
          '<div class="topbar sticky top-0 z-20 bg-base-100/80 backdrop-blur-sm">' +
            '<div class="flex items-center gap-3">' +
              '<button id="mobileMenuBtn" class="btn btn-ghost btn-sm btn-square md:hidden" onclick="Dash.components.sidebar.toggle()">' +
                '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" class="w-5 h-5"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"/></svg>' +
              '</button>' +
              '<h1 class="text-base font-semibold text-base-content" id="pageTitle">Tổng quan</h1>' +
            '</div>' +
            '<div class="flex items-center gap-2" id="topbarRight">' +
              '<button id="themeToggle" class="btn btn-ghost btn-sm btn-square" onclick="Dash.app.toggleTheme()" title="Đổi theme">' +
                '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" class="w-5 h-5"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"/></svg>' +
              '</button>' +
              '<div class="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-base-200/50 cursor-pointer" id="userMenuBtn">' +
                '<div class="w-7 h-7 rounded-full bg-gradient-to-br from-[#FF6B00] to-[#FFB800] text-white text-xs font-bold flex items-center justify-center">' + firstChar + '</div>' +
                '<span class="text-sm text-base-content/80 hidden sm:inline">' + Dash.util.escapeHtml(me?.username || '') + '</span>' +
              '</div>' +
            '</div>' +
          '</div>' +
          '<div class="flex-1 overflow-y-auto px-8 py-6" id="pageContent"></div>' +
        '</main>' +
      '</div>';

    Dash.components.sidebar.render(document.getElementById('sidebarContainer'));
  },

  toggleTheme() {
    const body = document.querySelector('[data-theme]');
    const isDark = body?.getAttribute('data-theme') === 'aiproxy';
    const newTheme = isDark ? 'aiproxy-light' : 'aiproxy';
    if (body) body.setAttribute('data-theme', newTheme);
    tailwind.config = isDark ? window.aiproxyLightTheme : window.aiproxyTheme;
    localStorage.setItem('aiproxyTheme', newTheme);
  },

  setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        const overlay = document.getElementById('modalOverlay');
        if (overlay) Dash.components.modal.close();
      }
      if (e.key === 'r' && !e.ctrlKey && !e.metaKey && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
        this.refreshCurrentPage();
        Dash.components.toast.info('Đã làm mới');
      }
    });
  },
};

document.addEventListener('DOMContentLoaded', () => Dash.app.init());

window.Dash = Dash;
