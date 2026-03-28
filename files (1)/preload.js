// ============================================================
// preload.js - 렌더러 ↔ 메인 프로세스 안전 브릿지
// ============================================================

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // ── 설정 ─────────────────────────────────────────
  store: {
    get: (key) => ipcRenderer.invoke('store-get', key),
    set: (key, value) => ipcRenderer.invoke('store-set', key, value),
    delete: (key) => ipcRenderer.invoke('store-delete', key),
    getAll: () => ipcRenderer.invoke('store-get-all')
  },

  // ── 알림 팝업 ─────────────────────────────────────
  notification: {
    show: (opts) => ipcRenderer.invoke('show-notification', opts)
    // opts: { type: 'info'|'class'|'warning'|'danger', title, message, duration? }
  },

  // ── 시스템 제어 ───────────────────────────────────
  system: {
    lock: () => ipcRenderer.invoke('system-lock'),
    sleep: () => ipcRenderer.invoke('system-sleep'),
    setVolume: (level) => ipcRenderer.invoke('system-set-volume', level)
  },

  // ── 파일/앱/링크 ──────────────────────────────────
  shell: {
    openExternal: (url) => ipcRenderer.invoke('open-external', url),
    openPath: (filePath) => ipcRenderer.invoke('open-path', filePath)
  },

  // ── 스크린샷 ──────────────────────────────────────
  screenshot: {
    take: () => ipcRenderer.invoke('take-screenshot')
  },

  // ── 클립보드 ──────────────────────────────────────
  clipboard: {
    read: () => ipcRenderer.invoke('clipboard-read'),
    write: (text) => ipcRenderer.invoke('clipboard-write', text)
  },

  // ── 포커스 모드 ───────────────────────────────────
  focus: {
    start: () => ipcRenderer.invoke('focus-start'),
    stop: () => ipcRenderer.invoke('focus-stop')
  },

  // ── 메인→렌더러 이벤트 수신 ───────────────────────
  on: (channel, callback) => {
    const allowed = ['open-settings', 'toggle-focus', 'toggle-silent',
                     'notification-received', 'community-message'];
    if (allowed.includes(channel)) {
      ipcRenderer.on(channel, (_, ...args) => callback(...args));
    }
  },
  off: (channel, callback) => {
    ipcRenderer.removeListener(channel, callback);
  }
});
