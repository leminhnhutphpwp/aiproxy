var Dash = window.Dash || {};
Dash.components = Dash.components || {};

Dash.components.modal = {
  show(title, bodyHtml, buttons) {
    this.close();
    const overlay = document.createElement('div');
    overlay.className = 'modal modal-open';
    overlay.id = 'modalOverlay';
    overlay.onclick = (e) => { if (e.target === overlay) this.close(); };

    const isDom = bodyHtml instanceof HTMLElement;
    const btnHtml = (buttons && buttons.length > 0)
      ? '<div class="modal-action">' +
        buttons.map((b, i) => '<button class="' + b.class + '" id="modalBtn_' + i + '">' + Dash.util.escapeHtml(b.text) + '</button>').join('') +
      '</div>'
      : '';

    overlay.innerHTML = '<div class="modal-box">' +
      '<button onclick="Dash.components.modal.close()" class="btn btn-sm btn-circle btn-ghost absolute right-2 top-2">✕</button>' +
      '<h3 class="font-bold text-lg mb-4">' + Dash.util.escapeHtml(title) + '</h3>' +
      '<div id="modalBody"' + (isDom ? '' : '') + '>' + (isDom ? '' : bodyHtml) + '</div>' +
      btnHtml +
    '</div>';
    document.body.appendChild(overlay);

    if (isDom) {
      const bodyEl = overlay.querySelector('#modalBody');
      bodyEl.appendChild(bodyHtml);
    }

    if (buttons) {
      buttons.forEach((b, i) => {
        const btn = overlay.querySelector('#modalBtn_' + i);
        if (btn && b.action) btn.addEventListener('click', b.action);
      });
    }

    document.body.style.overflow = 'hidden';
  },

  close() {
    const overlay = document.getElementById('modalOverlay');
    if (overlay) { overlay.classList.remove('modal-open'); overlay.remove(); }
    document.body.style.overflow = '';
  },
};

window.Dash = Dash;
