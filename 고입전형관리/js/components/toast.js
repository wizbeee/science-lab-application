// toast.js - 알림 토스트
const Toast = {
  container: null,

  init() {
    if (!this.container) {
      this.container = Utils.createElement('div', {
        className: 'fixed top-4 right-4 z-[100] flex flex-col gap-2',
        id: 'toast-container'
      });
      document.body.appendChild(this.container);
    }
  },

  show(message, type = 'info', duration = 3000) {
    this.init();
    const icons = {
      success: '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>',
      error: '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>',
      info: '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>',
      warning: '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"/></svg>'
    };
    const colors = {
      success: 'bg-green-50 text-green-800 border-green-200',
      error: 'bg-red-50 text-red-800 border-red-200',
      info: 'bg-blue-50 text-blue-800 border-blue-200',
      warning: 'bg-yellow-50 text-yellow-800 border-yellow-200'
    };

    const toast = Utils.createElement('div', {
      className: `flex items-center gap-3 px-4 py-3 rounded-lg border shadow-lg ${colors[type]} transition-all duration-300 transform translate-x-full`,
      innerHTML: `${icons[type] || ''}<span class="text-sm font-medium">${message}</span>`
    });

    this.container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.replace('translate-x-full', 'translate-x-0'));

    setTimeout(() => {
      toast.classList.replace('translate-x-0', 'translate-x-full');
      setTimeout(() => toast.remove(), 300);
    }, duration);
  },

  success(msg, dur) { this.show(msg, 'success', dur); },
  error(msg, dur) { this.show(msg, 'error', dur || 5000); },
  info(msg, dur) { this.show(msg, 'info', dur); },
  warning(msg, dur) { this.show(msg, 'warning', dur); }
};

window.Toast = Toast;
