// ============================================================
// main.js - Electron 메인 프로세스
// 스마트 바탕화면 v1.0 | 충남삼성고 / 교사 & 직장인용
// ============================================================

const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage,
        screen, shell, systemPreferences, powerSaveBlocker } = require('electron');
const path = require('path');
const Store = require('electron-store');
const isDev = process.env.NODE_ENV === 'development';

// ── 전역 상태 ───────────────────────────────────────────────
let mainWindow = null;
let tray = null;
let store = null;
let overlayWindows = [];   // 상단 팝업 알림 윈도우들
let powerBlockerId = null;

// ── 설정 스토어 초기화 ───────────────────────────────────────
function initStore() {
  store = new Store({
    name: 'smart-desktop-config',
    defaults: {
      // 사용자 기본 정보
      user: {
        name: '',
        school: '',
        role: 'teacher',       // teacher | office | other
        setupComplete: false
      },

      // 테마 & 디자인
      theme: {
        accentColor: '#e879a0',   // 기본: 핑크 (영상 스크린샷 참고)
        bgColor: '#fff5f7',
        widgetBg: '#ffffff',
        textColor: '#2d2d2d',
        borderColor: '#f0d0da',
        darkMode: false,
        preset: 'pink'            // pink | blue | green | purple | custom
      },

      // 일과표 (충남삼성고 기본값)
      schedule: {
        workStart: '08:30',
        workEnd: '16:30',
        periods: [
          { id: 1, name: '1교시', start: '08:40', end: '09:30', type: 'class' },
          { id: 2, name: '쉬는시간', start: '09:30', end: '09:40', type: 'break' },
          { id: 3, name: '2교시', start: '09:40', end: '10:30', type: 'class' },
          { id: 4, name: '쉬는시간', start: '10:30', end: '10:40', type: 'break' },
          { id: 5, name: '3교시', start: '10:40', end: '11:30', type: 'class' },
          { id: 6, name: '4교시A/점심B', start: '11:30', end: '12:30', type: 'lunch' },
          { id: 7, name: '4교시B/점심A', start: '12:30', end: '13:30', type: 'lunch' },
          { id: 8, name: '5교시', start: '13:30', end: '14:20', type: 'class' },
          { id: 9, name: '쉬는시간', start: '14:20', end: '14:30', type: 'break' },
          { id: 10, name: '6교시', start: '14:30', end: '15:20', type: 'class' },
          { id: 11, name: '쉬는시간', start: '15:20', end: '15:30', type: 'break' },
          { id: 12, name: '7교시', start: '15:30', end: '16:20', type: 'class' },
          { id: 13, name: '종례', start: '16:20', end: '16:30', type: 'event' },
          { id: 14, name: 'ET', start: '16:50', end: '18:10', type: 'extra' },
          { id: 15, name: '석식', start: '18:10', end: '19:10', type: 'dinner' },
          { id: 16, name: 'EP1', start: '19:20', end: '20:50', type: 'extra' },
          { id: 17, name: 'EP2', start: '21:10', end: '22:30', type: 'extra' }
        ]
      },

      // 주간 시간표 (교사 수업 배정)
      timetable: {
        // 형식: { mon: [{period:1, subject:'화학I', class:'2-1', room:'과학실1'}, ...], tue: [...], ... }
        mon: [], tue: [], wed: [], thu: [], fri: []
      },

      // D-Day 항목들
      ddays: [
        { id: 1, label: '1차 지필고사', date: '', color: '#e879a0' },
        { id: 2, label: '여름방학', date: '', color: '#60a5fa' }
      ],

      // 할 일
      todos: [],

      // 메모
      memos: [],

      // 즐겨찾기 앱/파일/링크
      favorites: [],

      // 바탕화면 폴더 구역
      desktopZones: [
        { id: 1, label: '긴급', color: '#ef4444', files: [] },
        { id: 2, label: '진행중 업무', color: '#f97316', files: [] },
        { id: 3, label: '나중에 볼 파일', color: '#8b5cf6', files: [] }
      ],

      // 위젯 배치 설정
      widgets: {
        clock: { visible: true, x: 0, y: 0, w: 300, h: 120 },
        timetable: { visible: true, x: 0, y: 0, w: 260, h: 500 },
        currentPeriod: { visible: true, x: 0, y: 0, w: 400, h: 100 },
        calendar: { visible: true, x: 0, y: 0, w: 320, h: 280 },
        todos: { visible: true, x: 0, y: 0, w: 280, h: 300 },
        weather: { visible: true, x: 0, y: 0, w: 220, h: 160 },
        meal: { visible: true, x: 0, y: 0, w: 220, h: 260 },
        dday: { visible: true, x: 0, y: 0, w: 220, h: 200 },
        mail: { visible: true, x: 0, y: 0, w: 260, h: 300 },
        noticeboard: { visible: true, x: 0, y: 0, w: 400, h: 80 },
        system: { visible: true, x: 0, y: 0, w: 220, h: 120 },
        memo: { visible: true, x: 0, y: 0, w: 260, h: 200 }
      },

      // 알림 설정
      notifications: {
        classReminder: true,      // 수업 5분 전
        scheduleAlert: true,      // 일정 알림
        mailAlert: true,          // 메일 알림
        communityAlert: true,     // 커뮤니티 공지
        silentDuringClass: true,  // 수업 중 무음
        soundEnabled: true
      },

      // Google 연동
      google: {
        connected: false,
        accessToken: null,
        refreshToken: null,
        email: '',
        services: {
          calendar: true,
          gmail: true,
          drive: true,
          classroom: true,
          meet: true,
          tasks: true
        }
      },

      // Microsoft 연동
      microsoft: {
        connected: false,
        accessToken: null,
        email: '',
        services: {
          outlook: true,
          onedrive: true,
          teams: true
        }
      },

      // AI Plus 설정
      ai: {
        enabled: false,
        provider: 'claude',        // claude | openai | gemini
        apiKey: '',
        model: ''
      },

      // 전광판 설정
      noticeboard: {
        enabled: false,
        googleSheetUrl: '',
        refreshInterval: 15        // 초
      },

      // 날씨 설정
      weather: {
        location: '아산',
        lat: 36.7798,
        lon: 127.0043
      },

      // 급식 설정 (NEIS)
        meal: {
        schoolCode: 'J100005773', // 충남삼성고
        officeCode: 'J10',
        enabled: true
      },

      // 커뮤니티
      community: {
        userId: '',
        username: '',
        groups: [],
        serverUrl: ''
      },

      // 포커스 모드
      focus: {
        duration: 25,             // 뽀모도로 기본 25분
        breakTime: 5,
        active: false
      }
    }
  });
}

// ── 메인 윈도우 생성 ─────────────────────────────────────────
function createMainWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  mainWindow = new BrowserWindow({
    width,
    height,
    x: 0,
    y: 0,
    frame: false,              // 프레임 없음 (바탕화면 오버레이)
    transparent: true,         // 투명 배경
    alwaysOnTop: false,        // 다른 앱 위에 표시하지 않음 (바탕화면처럼)
    skipTaskbar: false,
    resizable: false,
    movable: false,
    hasShadow: false,
    backgroundColor: '#00000000',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      webSecurity: !isDev
    },
    type: 'desktop'            // 바탕화면 레벨 (macOS)
  });

  // Windows: 바탕화면 뒤로 보내기
  if (process.platform === 'win32') {
    mainWindow.setAlwaysOnTop(false);
  }

  // 개발/프로덕션 URL 로드
  const url = isDev
    ? 'http://localhost:3000'
    : `file://${path.join(__dirname, '../../build/index.html')}`;

  mainWindow.loadURL(url);

  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ── 상단 팝업 알림 윈도우 ────────────────────────────────────
function showNotificationPopup({ type = 'info', title, message, duration = 5000 }) {
  const { width } = screen.getPrimaryDisplay().workAreaSize;

  const popup = new BrowserWindow({
    width: 380,
    height: 80,
    x: Math.floor(width / 2 - 190),
    y: 20,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    movable: false,
    focusable: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
    <meta charset="UTF-8">
    <style>
      * { margin:0; padding:0; box-sizing:border-box; font-family: 'Malgun Gothic', sans-serif; }
      body { background: transparent; overflow: hidden; }
      .popup {
        margin: 8px;
        padding: 12px 18px;
        border-radius: 12px;
        display: flex;
        align-items: center;
        gap: 12px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.18);
        animation: slideDown 0.3s ease;
        background: ${type === 'class' ? '#d1fae5' : type === 'warning' ? '#fef3c7' : type === 'danger' ? '#fee2e2' : '#dbeafe'};
        border-left: 4px solid ${type === 'class' ? '#10b981' : type === 'warning' ? '#f59e0b' : type === 'danger' ? '#ef4444' : '#3b82f6'};
      }
      @keyframes slideDown { from { opacity:0; transform:translateY(-20px); } to { opacity:1; transform:translateY(0); } }
      .icon { font-size: 20px; flex-shrink: 0; }
      .content { flex: 1; }
      .title { font-size: 13px; font-weight: 600; color: #1f2937; }
      .message { font-size: 12px; color: #4b5563; margin-top: 2px; }
    </style>
    </head>
    <body>
      <div class="popup">
        <div class="icon">${type === 'class' ? '📚' : type === 'warning' ? '⚠️' : type === 'danger' ? '🔴' : 'ℹ️'}</div>
        <div class="content">
          <div class="title">${title}</div>
          <div class="message">${message}</div>
        </div>
      </div>
    </body>
    </html>
  `;

  popup.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  overlayWindows.push(popup);

  setTimeout(() => {
    if (!popup.isDestroyed()) {
      popup.close();
      overlayWindows = overlayWindows.filter(w => w !== popup);
    }
  }, duration);
}

// ── 시스템 트레이 ────────────────────────────────────────────
function createTray() {
  // 간단한 트레이 아이콘 (실제 배포 시 아이콘 파일 사용)
  const icon = nativeImage.createEmpty();
  tray = new Tray(icon);

  const contextMenu = Menu.buildFromTemplate([
    { label: '스마트 바탕화면', enabled: false },
    { type: 'separator' },
    { label: '설정 열기', click: () => { mainWindow?.webContents.send('open-settings'); } },
    { label: '항상 위에 표시', type: 'checkbox', checked: false,
      click: (item) => { mainWindow?.setAlwaysOnTop(item.checked); }
    },
    { type: 'separator' },
    { label: '포커스 모드', click: () => { mainWindow?.webContents.send('toggle-focus'); } },
    { label: '무음 모드', click: () => { mainWindow?.webContents.send('toggle-silent'); } },
    { type: 'separator' },
    { label: '종료', click: () => { app.quit(); } }
  ]);

  tray.setToolTip('스마트 바탕화면');
  tray.setContextMenu(contextMenu);
  tray.on('double-click', () => { mainWindow?.show(); });
}

// ── IPC 핸들러 ───────────────────────────────────────────────

// 설정 읽기/쓰기
ipcMain.handle('store-get', (_, key) => store.get(key));
ipcMain.handle('store-set', (_, key, value) => { store.set(key, value); return true; });
ipcMain.handle('store-delete', (_, key) => { store.delete(key); return true; });
ipcMain.handle('store-get-all', () => store.store);

// 팝업 알림
ipcMain.handle('show-notification', (_, opts) => { showNotificationPopup(opts); return true; });

// 시스템 제어
ipcMain.handle('system-lock', () => {
  if (process.platform === 'win32') {
    require('child_process').exec('rundll32.exe user32.dll,LockWorkStation');
  } else if (process.platform === 'darwin') {
    require('child_process').exec('pmset displaysleepnow');
  }
});

ipcMain.handle('system-sleep', () => {
  if (process.platform === 'win32') {
    require('child_process').exec('rundll32.exe powrprof.dll,SetSuspendState 0,1,0');
  }
});

ipcMain.handle('system-set-volume', (_, level) => {
  if (process.platform === 'win32') {
    // nircmd 활용 또는 PowerShell
    const ps = `[audio]::Volume = ${level / 100}`;
    require('child_process').exec(`powershell -c "${ps}"`);
  }
});

// 외부 링크 열기
ipcMain.handle('open-external', (_, url) => { shell.openExternal(url); });

// 파일/앱 실행
ipcMain.handle('open-path', (_, filePath) => { shell.openPath(filePath); });

// 스크린샷
ipcMain.handle('take-screenshot', async () => {
  const sources = await require('electron').desktopCapturer.getSources({
    types: ['screen'], thumbnailSize: { width: 1920, height: 1080 }
  });
  if (sources[0]) {
    return sources[0].thumbnail.toDataURL();
  }
  return null;
});

// 클립보드
ipcMain.handle('clipboard-read', () => {
  return require('electron').clipboard.readText();
});
ipcMain.handle('clipboard-write', (_, text) => {
  require('electron').clipboard.writeText(text);
});

// 포커스 모드 - 절전 방지
ipcMain.handle('focus-start', () => {
  if (!powerBlockerId) {
    powerBlockerId = powerSaveBlocker.start('prevent-display-sleep');
  }
});
ipcMain.handle('focus-stop', () => {
  if (powerBlockerId !== null) {
    powerSaveBlocker.stop(powerBlockerId);
    powerBlockerId = null;
  }
});

// ── 앱 이벤트 ────────────────────────────────────────────────
app.whenReady().then(() => {
  initStore();
  createMainWindow();
  createTray();

  // 자동 시작 등록 (프로덕션)
  if (!isDev) {
    app.setLoginItemSettings({
      openAtLogin: true,
      name: '스마트 바탕화면'
    });
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (!mainWindow) createMainWindow();
});

// 모든 인스턴스 단일 실행
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    mainWindow?.focus();
  });
}
