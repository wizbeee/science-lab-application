// modal.js - 모달 컴포넌트
const Modal = {
  show(options = {}) {
    const { title, content, size = 'md', onClose, buttons = [] } = options;
    const sizeClass = { sm: 'max-w-md', md: 'max-w-2xl', lg: 'max-w-4xl', xl: 'max-w-6xl', full: 'max-w-[95vw]' }[size] || 'max-w-2xl';

    const overlay = Utils.createElement('div', {
      className: 'fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 modal-overlay',
      onClick: (e) => { if (e.target === overlay) this.close(); }
    });

    const modal = Utils.createElement('div', {
      className: `bg-white rounded-xl shadow-2xl w-full ${sizeClass} max-h-[90vh] flex flex-col modal-content`
    });

    // Header
    const header = Utils.createElement('div', {
      className: 'flex items-center justify-between px-6 py-4 border-b',
      innerHTML: `<h3 class="text-lg font-semibold text-gray-900">${title || ''}</h3>`
    });
    const closeBtn = Utils.createElement('button', {
      className: 'text-gray-400 hover:text-gray-600 text-xl',
      textContent: '\u00D7',
      onClick: () => this.close()
    });
    header.appendChild(closeBtn);
    modal.appendChild(header);

    // Body
    const body = Utils.createElement('div', {
      className: 'px-6 py-4 overflow-y-auto flex-1'
    });
    if (typeof content === 'string') body.innerHTML = content;
    else if (content instanceof HTMLElement) body.appendChild(content);
    modal.appendChild(body);

    // Footer with buttons
    if (buttons.length) {
      const footer = Utils.createElement('div', {
        className: 'flex justify-end gap-2 px-6 py-4 border-t bg-gray-50 rounded-b-xl'
      });
      for (const btn of buttons) {
        const btnEl = Utils.createElement('button', {
          className: btn.className || 'px-4 py-2 rounded-lg border hover:bg-gray-100',
          textContent: btn.label,
          onClick: btn.onClick || (() => this.close())
        });
        footer.appendChild(btnEl);
      }
      modal.appendChild(footer);
    }

    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    this._current = overlay;
    this._onClose = onClose;

    // ESC to close
    this._escHandler = (e) => { if (e.key === 'Escape') this.close(); };
    document.addEventListener('keydown', this._escHandler);

    return body;
  },

  close() {
    if (this._current) {
      this._current.remove();
      this._current = null;
    }
    if (this._escHandler) {
      document.removeEventListener('keydown', this._escHandler);
      this._escHandler = null;
    }
    if (this._onClose) this._onClose();
  },

  confirm(message, title = '확인') {
    return new Promise(resolve => {
      this.show({
        title,
        content: `<p class="text-gray-700">${message}</p>`,
        size: 'sm',
        buttons: [
          { label: '취소', onClick: () => { this.close(); resolve(false); } },
          { label: '확인', className: 'px-4 py-2 rounded-lg bg-blue-500 text-white hover:bg-blue-600', onClick: () => { this.close(); resolve(true); } }
        ]
      });
    });
  },

  alert(message, title = '알림') {
    return new Promise(resolve => {
      this.show({
        title,
        content: `<p class="text-gray-700">${message}</p>`,
        size: 'sm',
        buttons: [
          { label: '확인', className: 'px-4 py-2 rounded-lg bg-blue-500 text-white hover:bg-blue-600', onClick: () => { this.close(); resolve(); } }
        ]
      });
    });
  }
};

window.Modal = Modal;
