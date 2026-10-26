var Dash = window.Dash || {};
Dash.components = Dash.components || {};

Dash.components.confirm = {
  show(title, message, onConfirm, confirmText, cancelText) {
    Dash.components.modal.show(title,
      '<p class="text-base-content/80 mb-6">' + Dash.util.escapeHtml(message) + '</p>' +
      '<div class="flex gap-3 justify-end">' +
        '<button onclick="Dash.components.modal.close()" class="btn btn-ghost btn-sm">' + (cancelText || 'Huỷ') + '</button>' +
        '<button id="confirmActionBtn" class="btn btn-error btn-sm">' + (confirmText || 'Xác nhận') + '</button>' +
      '</div>'
    );
    document.getElementById('confirmActionBtn')?.addEventListener('click', () => {
      Dash.components.modal.close();
      if (typeof onConfirm === 'function') onConfirm();
    });
  },
};
window.Dash = Dash;
