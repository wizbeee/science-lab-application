// ============================================================
// preload.js - 렌더러 ↔ 메인 프로세스 안전 브릿지
// ============================================================

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // ── 앱 버전 ─────────────────────────────────────
  appVersion: ipcRenderer.sendSync('get-app-version'),

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
    setVolume: (level) => ipcRenderer.invoke('system-set-volume', level),
    taskbar: (show) => ipcRenderer.invoke('system-taskbar', show)
  },

  // ── 파일/앱/링크 ──────────────────────────────────
  shell: {
    openExternal: (url) => ipcRenderer.invoke('open-external', url),
    openPath: (filePath) => ipcRenderer.invoke('open-path', filePath),
    openGoogleChat: () => ipcRenderer.invoke('open-google-chat')
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

  // ── 바탕화면 모드 ──────────────────────────────────
  desktop: {
    toggle: (enabled) => ipcRenderer.invoke('toggle-desktop-mode', enabled),
    getMode: () => ipcRenderer.invoke('get-desktop-mode'),
    getFiles: () => ipcRenderer.invoke('get-desktop-files')
  },

  // ── 파일 탐색기 ───────────────────────────────────
  files: {
    readDir: (path) => ipcRenderer.invoke('read-directory', path),
    search: (query) => ipcRenderer.invoke('search-files', query),
    recentApps: () => ipcRenderer.invoke('get-recent-apps'),
    copy: (src, dest) => ipcRenderer.invoke('files-copy', src, dest),
    move: (src, dest) => ipcRenderer.invoke('files-move', src, dest),
    delete: (p) => ipcRenderer.invoke('files-delete', p),
    rename: (oldPath, newName) => ipcRenderer.invoke('files-rename', oldPath, newName),
    mkdir: (parent, name) => ipcRenderer.invoke('files-mkdir', parent, name),
    openPath: (p) => ipcRenderer.invoke('files-open', p),
    showInFolder: (p) => ipcRenderer.invoke('files-show-in-folder', p),
    exists: (p) => ipcRenderer.invoke('files-exists', p)
  },

  // ── 와이파이 ────────────────────────────────────
  wifi: {
    scan: () => ipcRenderer.invoke('wifi-scan'),
    current: () => ipcRenderer.invoke('wifi-current'),
    connect: (ssid, password) => ipcRenderer.invoke('wifi-connect', ssid, password),
    openSettings: () => ipcRenderer.invoke('wifi-open-settings')
  },

  // ── AI API 프록시 ─────────────────────────────────────────
  ai: {
    call: (opts) => ipcRenderer.invoke('ai-api-call', opts)
  },

  // ── OAuth 서버 시작 ───────────────────────────────
  oauth: {
    startServer: () => ipcRenderer.invoke('start-oauth-server'),
    getPort: () => ipcRenderer.invoke('get-oauth-port')
  },

  // ── 업데이트 ────────────────────────────────────────
  update: {
    check: () => ipcRenderer.invoke('check-update'),
    download: () => ipcRenderer.invoke('download-update'),
    install: () => ipcRenderer.invoke('install-update')
  },

  // ── 시스템 폰트 ────────────────────────────────────
  fonts: {
    getSystem: () => ipcRenderer.invoke('get-system-fonts')
  },

  // ── 온보딩 초기화 ────────────────────────────────────
  resetOnboarding: () => ipcRenderer.invoke('reset-onboarding'),

  // ── 메인→렌더러 이벤트 수신 ───────────────────────
  on: (channel, callback) => {
    const allowed = ['open-settings', 'toggle-focus', 'toggle-silent',
                     'notification-received', 'community-message', 'update-available',
                     'update-download-progress', 'update-downloaded',
                     'force-save-before-quit', 'oauth-code', 'oauth-error'];
    if (allowed.includes(channel)) {
      ipcRenderer.on(channel, (_, ...args) => callback(...args));
    }
  },
  off: (channel, callback) => {
    ipcRenderer.removeListener(channel, callback);
  }
});
