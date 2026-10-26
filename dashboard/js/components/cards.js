var Dash = window.Dash || {};
Dash.components = Dash.components || {};

Dash.components.cards = {
  stat(items) {
    return '<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">' +
      items.map(item => '<div class="stat bg-base-100 border border-base-200/50 rounded-xl p-5 stat-card-hover">' +
        '<div class="stat-figure text-2xl">' + (item.icon || '') + '</div>' +
        '<div class="stat-title text-xs text-base-content/50 font-medium uppercase tracking-wider">' + item.label + '</div>' +
        '<div class="stat-value text-2xl text-base-content mt-0.5">' + item.value + '</div>' +
      '</div>').join('') +
    '</div>';
  },
};

window.Dash = Dash;
