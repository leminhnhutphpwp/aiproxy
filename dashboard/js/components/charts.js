var Dash = window.Dash || {};
Dash.components = Dash.components || {};

Dash.components.charts = {
  loaded: false,
  instances: {},

  async loadLib() {
    if (this.loaded) return;
    return new Promise((resolve) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js';
      s.onload = () => { this.loaded = true; resolve(); };
      document.head.appendChild(s);
    });
  },

  _get(id) { return this.instances[id]; },
  _set(id, chart) { if (this.instances[id]) this.instances[id].destroy(); this.instances[id] = chart; },

  destroy(id) {
    if (id && this.instances[id]) { this.instances[id].destroy(); delete this.instances[id]; return; }
    Object.keys(this.instances).forEach(k => { this.instances[k].destroy(); delete this.instances[k]; });
  },

  _colors(count) {
    const palette = ['#3b82f6','#22c55e','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#ec4899','#14b8a6','#f97316','#6366f1'];
    const result = [];
    for (let i = 0; i < count; i++) result.push(palette[i % palette.length]);
    return result;
  },

  _canvas(id) {
    const el = document.getElementById(id);
    return el ? el.getContext('2d') : null;
  },

  async bar(id, labels, values, opts) {
    await this.loadLib(); if (!window.Chart) return;
    const ctx = this._canvas(id); if (!ctx) return;
    const theme = document.documentElement.getAttribute('data-theme');
    const gridColor = theme === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
    this._set(id, new window.Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: opts?.label || '',
          data: values,
          backgroundColor: opts?.colors || this._colors(values.length),
          borderRadius: 4,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: opts?.legend !== false, labels: { boxWidth: 12, padding: 12 } } },
        scales: {
          y: { beginAtZero: true, grid: { color: gridColor }, ticks: { font: { size: 10 } } },
          x: { grid: { display: false }, ticks: { font: { size: 10 } } },
        },
      },
    }));
  },

  async line(id, labels, values, opts) {
    await this.loadLib(); if (!window.Chart) return;
    const ctx = this._canvas(id); if (!ctx) return;
    const theme = document.documentElement.getAttribute('data-theme');
    const gridColor = theme === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
    const mainColor = opts?.color || '#3b82f6';
    const datasets = Array.isArray(values) && Array.isArray(values[0]) ? values : [values];
    const dsLabels = opts?.datasetLabels || [];
    this._set(id, new window.Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: datasets.map((d, i) => ({
          label: dsLabels[i] || '',
          data: d,
          borderColor: opts?.colors?.[i] || mainColor,
          backgroundColor: opts?.colors?.[i] ? opts.colors[i] + '20' : mainColor + '20',
          fill: opts?.fill !== false,
          tension: 0.3,
          pointRadius: 0,
          borderWidth: 2,
        })),
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: opts?.legend !== false && dsLabels.length > 1, labels: { boxWidth: 12, padding: 12 } } },
        scales: {
          y: { beginAtZero: opts?.beginAtZero !== false, grid: { color: gridColor }, ticks: { font: { size: 10 } } },
          x: { grid: { display: false }, ticks: { font: { size: 10 } } },
        },
      },
    }));
  },

  async doughnut(id, labels, values, opts) {
    await this.loadLib(); if (!window.Chart) return;
    const ctx = this._canvas(id); if (!ctx) return;
    this._set(id, new window.Chart(ctx, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{
          data: values,
          backgroundColor: opts?.colors || this._colors(values.length),
          borderWidth: 0,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        cutout: opts?.cutout || '65%',
        plugins: { legend: { position: 'right', labels: { boxWidth: 12, padding: 10, font: { size: 10 } } } },
      },
    }));
  },

  async requestVolumeChart(id, hourlyData) {
    if (!hourlyData || hourlyData.length === 0) return;
    const labels = hourlyData.map(h => h.hour.slice(11, 13) + 'h');
    await this.bar(id, labels, hourlyData.map(h => h.requests || 0), { label: 'Requests', color: '#3b82f6', legend: false });
  },

  async tokenUsageChart(id, hourlyData) {
    if (!hourlyData || hourlyData.length === 0) return;
    const labels = hourlyData.map(h => h.hour.slice(11, 13) + 'h');
    await this.line(id, labels, hourlyData.map(h => Math.round((h.totalTokens || 0) / 1000)), { label: 'Tokens (K)', color: '#22c55e', legend: false });
  },

  async modelPieChart(id, models) {
    if (!models || models.length === 0) return;
    const top = models.slice(0, 6);
    const labels = top.map(m => m.id || m.model || '?');
    const values = top.map(m => m.requests || m.total || 0);
    await this.doughnut(id, labels, values);
  },

  async providerLatencyChart(id, providers) {
    if (!providers || Object.keys(providers).length === 0) return;
    const entries = Object.entries(providers).slice(0, 8);
    const labels = entries.map(([k]) => k);
    await this.bar(id, labels, entries.map(([, v]) => Math.round(v.avg || 0)), {
      label: 'Avg Latency (ms)', colors: '#f59e0b', legend: false,
    });
  },

  async statusPieChart(id, statusCodes) {
    if (!statusCodes || Object.keys(statusCodes).length === 0) return;
    const labels = Object.keys(statusCodes).map(c => 'HTTP ' + c);
    const values = Object.values(statusCodes);
    await this.doughnut(id, labels, values);
  },
};
window.Dash = Dash;
