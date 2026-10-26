var Dash = window.Dash || {};

Dash.api = {
  async get(path) {
    try {
      const res = await fetch('/dashboard/api' + path, { credentials: 'same-origin' });
      if (res.status === 401) {
        window.location.href = '/dashboard/index.html';
        return null;
      }
      return await res.json();
    } catch (err) {
      Dash.components.toast.error('Lỗi kết nối: ' + Dash.util.escapeHtml(err.message));
      return null;
    }
  },

  async post(path, body) {
    return this._fetch('POST', path, body);
  },

  async put(path, body) {
    return this._fetch('PUT', path, body);
  },

  async del(path) {
    return this._fetch('DELETE', path);
  },

  async _fetch(method, path, body) {
    try {
      const opts = {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
      };
      if (body !== undefined) opts.body = JSON.stringify(body);
      const res = await fetch('/dashboard/api' + path, opts);
      if (res.status === 401) {
        window.location.href = '/dashboard/index.html';
        return null;
      }
      return await res.json();
    } catch (err) {
      Dash.components.toast.error('Lỗi kết nối: ' + Dash.util.escapeHtml(err.message));
      return null;
    }
  },
};

window.Dash = Dash;
