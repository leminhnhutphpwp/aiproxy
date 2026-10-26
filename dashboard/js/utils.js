var Dash = window.Dash || {};

Dash.util = {
  escapeHtml(str) {
    if (str == null) return '';
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(String(str)));
    return div.innerHTML;
  },
  formatNumber(n) {
    const raw = (typeof n === 'number' && Number.isFinite(n)) ? n : (parseFloat(n) || 0);
    const num = Math.abs(raw);
    if (num === 0) return '0';
    const units = ['', 'K', 'M', 'B', 'T'];
    let val = num;
    let idx = 0;
    while (val >= 1000 && idx < units.length - 1) { val /= 1000; idx++; }
    if (val >= 10000) return raw.toExponential(2);
    const formatted = val.toFixed(1).replace(/\.0$/, '');
    return formatted + units[idx];
  },
  timeAgo(ts) {
    if (!ts) return '—';
    const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
    if (diff < 60) return 'Vài giây trước';
    if (diff < 3600) return Math.floor(diff / 60) + ' phút trước';
    if (diff < 86400) return Math.floor(diff / 3600) + ' giờ trước';
    if (diff < 604800) return Math.floor(diff / 86400) + ' ngày trước';
    return new Date(ts).toLocaleDateString('vi-VN');
  },
  formatUptime(seconds) {
    if (!seconds) return '—';
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const parts = [];
    if (d > 0) parts.push(d + ' ngày');
    if (h > 0) parts.push(h + ' giờ');
    parts.push(m + ' phút');
    return parts.join(' ');
  },
  debounce(fn, delay) {
    let timer;
    return function(...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), delay);
    };
  },
};
window.Dash = Dash;
