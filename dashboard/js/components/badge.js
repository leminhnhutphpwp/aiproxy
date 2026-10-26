var Dash = window.Dash || {};
Dash.components = Dash.components || {};

Dash.components.badge = {
  html(status) {
    const cls = status === 'available' ? 'badge badge-success badge-sm' :
                status === 'degraded' ? 'badge badge-warning badge-sm' :
                status === 'overloaded' ? 'badge badge-error badge-sm' :
                status === 'down' ? 'badge badge-error badge-sm' :
                'badge badge-ghost badge-sm';
    return '<span class="' + cls + '">' + this.label(status) + '</span>';
  },

  label(status) {
    const map = {
      available: 'Hoạt động',
      degraded: 'Phục hồi',
      overloaded: 'Quá tải',
      down: 'Ngừng hoạt động',
      unknown: 'Chưa xác định',
    };
    return map[status] || status;
  },
};

window.Dash = Dash;
