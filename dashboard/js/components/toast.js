var Dash = window.Dash || {};
Dash.components = Dash.components || {};

Dash.components.toast = {
  show(message, type) {
    let container = document.getElementById('toastContainer');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toastContainer';
      container.className = 'toast toast-top toast-end z-[100]';
      document.body.appendChild(container);
    }
    const el = document.createElement('div');
    const typeClass = type === 'success' ? 'alert-success' : type === 'error' ? 'alert-error' : 'alert-info';
    el.innerHTML = message;
    el.className = 'alert ' + typeClass + ' shadow-xl animate-slide-in';
    container.appendChild(el);
    setTimeout(() => {
      el.style.transition = 'opacity 0.3s';
      el.style.opacity = '0';
      setTimeout(() => el.remove(), 300);
    }, 3500);
  },

  success(msg) { this.show(msg, 'success'); },
  error(msg) { this.show(msg, 'error'); },
  info(msg) { this.show(msg, 'info'); },
};

window.Dash = Dash;
