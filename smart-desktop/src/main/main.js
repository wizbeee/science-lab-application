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
let desktopModeEnabled = false; // store 로드 후 갱신

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
      ddays: [],

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
        schoolCode: '',
        officeCode: '',
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

  // 저장된 바탕화면 모드 상태 반영
  const isDesktop = desktopModeEnabled;

  const winOptions = {
    width: isDesktop ? width : Math.min(width, Math.floor(width * 0.92)),
    height: isDesktop ? height : Math.min(height, Math.floor(height * 0.92)),
    x: 0,
    y: 0,
    frame: false,
    skipTaskbar: isDesktop,   // 바탕화면 모드면 작업표시줄/Alt+Tab에서 숨김
    resizable: !isDesktop,
    movable: !isDesktop,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      webSecurity: !isDev
    }
  };

  if (isDesktop) {
    winOptions.transparent = true;
    winOptions.hasShadow = false;
    winOptions.backgroundColor = '#00000000';
    if (process.platform === 'darwin') {
      winOptions.type = 'desktop';
    }
  } else if (!isDev) {
    winOptions.transparent = true;
    winOptions.hasShadow = false;
    winOptions.backgroundColor = '#00000000';
  } else {
    winOptions.backgroundColor = '#fff5f7';
  }

  mainWindow = new BrowserWindow(winOptions);

  // ── Win+D / 최소화 시 자동 복원 ────────────────────────────
  mainWindow.on('minimize', () => {
    if (desktopModeEnabled) {
      // 바탕화면 모드: Win+D 최소화 즉시 복원
      setImmediate(() => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.restore();
          mainWindow.setAlwaysOnTop(true, 'screen-saver');
          setTimeout(() => {
            if (mainWindow && !mainWindow.isDestroyed()) mainWindow.setAlwaysOnTop(false);
          }, 100);
        }
      });
    } else {
      // 일반 모드: Win+D로 최소화되면 300ms 후 복원 (바탕화면 역할)
      setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isMinimized()) {
          mainWindow.restore();
          mainWindow.show();
          mainWindow.focus();
        }
      }, 300);
    }
  });

  // 바탕화면 모드로 시작하면 창을 다른 창들 뒤로 보냄
  if (isDesktop) {
    mainWindow.once('ready-to-show', () => {
      mainWindow.show();
      mainWindow.setSkipTaskbar(true);
      if (process.platform === 'win32') {
        mainWindow.setAlwaysOnTop(true, 'screen-saver');
        setTimeout(() => mainWindow.setAlwaysOnTop(false), 150);
      }
    });
  }

  // ── Google OAuth 팝업 허용 ────────────────────────────────
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://accounts.google.com') ||
        url.startsWith('https://oauth2.googleapis.com')) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 520, height: 640,
          title: 'Google 로그인',
          webPreferences: { nodeIntegration: false, contextIsolation: true }
        }
      };
    }
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // 개발: 3001 (OAuth 콜백 서버가 3000을 사용하므로 분리), 프로덕션: 빌드 파일
  const url = isDev
    ? 'http://localhost:3001'
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

  // 창이 먼저 닫혀도 즉시 배열에서 제거 (메모리 누수 방지)
  popup.once('closed', () => {
    overlayWindows = overlayWindows.filter(w => w !== popup);
  });

  setTimeout(() => {
    overlayWindows = overlayWindows.filter(w => w !== popup);
    if (!popup.isDestroyed()) popup.close();
  }, duration);
}

// ── 시스템 트레이 ────────────────────────────────────────────
function createTrayIcon() {
  const fs = require('fs');
  // 여러 경로 시도: 개발 모드, 빌드, 패키징
  const iconPaths = [
    path.join(__dirname, '..', '..', 'public', 'icon.png'),
    path.join(__dirname, '..', '..', 'build', 'icon.png'),
    path.join(process.resourcesPath || '', 'icon.png'),
    path.join(app.getAppPath(), 'build', 'icon.png'),
    path.join(app.getAppPath(), 'public', 'icon.png')
  ];

  for (const p of iconPaths) {
    try {
      if (fs.existsSync(p)) {
        const img = nativeImage.createFromPath(p);
        if (!img.isEmpty()) {
          console.log('[Tray] 아이콘 로드:', p);
          return img.resize({ width: 32, height: 32 });
        }
      }
    } catch {}
  }

  // Fallback: 코드로 간단한 트레이 아이콘 생성 (32x32 파란 원)
  console.warn('[Tray] icon.png를 찾을 수 없어 기본 아이콘을 생성합니다.');
  return nativeImage.createFromDataURL(createTrayIconDataURL());
}

// 32x32 트레이 아이콘을 코드로 생성 (Canvas 없이 SVG→DataURL)
function createTrayIconDataURL() {
  // SVG 기반 아이콘: 파란 원 + 흰색 "S" 글자
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
    <circle cx="16" cy="16" r="15" fill="#3b82f6"/>
    <circle cx="16" cy="16" r="13" fill="#2563eb"/>
    <text x="16" y="22" font-family="Arial,sans-serif" font-size="18" font-weight="bold" fill="white" text-anchor="middle">S</text>
  </svg>`;
  return 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');
}

function createTray() {
  const icon = createTrayIcon();
  tray = new Tray(icon);

  const version = app.getVersion();
  const contextMenu = Menu.buildFromTemplate([
    { label: `스마트 바탕화면 v${version}`, enabled: false },
    { type: 'separator' },
    { label: '🖥️  앱 열기', click: () => { mainWindow?.show(); mainWindow?.focus(); } },
    { label: '⚙️  설정', click: () => {
      mainWindow?.show();
      mainWindow?.webContents.send('open-settings');
    }},
    { type: 'separator' },
    { label: '📌  항상 위에 표시', type: 'checkbox', checked: false,
      click: (item) => { mainWindow?.setAlwaysOnTop(item.checked); }
    },
    { label: '🖥️  바탕화면 모드', type: 'checkbox', checked: desktopModeEnabled,
      click: async (item) => {
        desktopModeEnabled = item.checked;
        if (store) store.set('desktopMode', desktopModeEnabled);
        if (mainWindow && !mainWindow.isDestroyed()) {
          if (desktopModeEnabled) {
            mainWindow.setSkipTaskbar(true);
            mainWindow.maximize();
          } else {
            mainWindow.setSkipTaskbar(false);
          }
        }
      }
    },
    { type: 'separator' },
    { label: '🎯  포커스 모드', click: () => { mainWindow?.webContents.send('toggle-focus'); } },
    { label: '🔕  무음 모드', click: () => { mainWindow?.webContents.send('toggle-silent'); } },
    { type: 'separator' },
    { label: '🔄  업데이트 확인', click: () => { checkForUpdates(); } },
    { type: 'separator' },
    { label: '❌  종료', click: () => { app.quit(); } }
  ]);

  tray.setToolTip(`스마트 바탕화면 v${version}`);
  tray.setContextMenu(contextMenu);

  // 더블클릭: 앱 표시
  tray.on('double-click', () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

// ── IPC 핸들러 ───────────────────────────────────────────────

// 시스템 설치 폰트 목록
ipcMain.handle('get-system-fonts', () => {
  return new Promise((resolve) => {
    const { execFile } = require('child_process');
    if (process.platform === 'win32') {
      execFile('powershell', [
        '-NoProfile', '-NonInteractive', '-Command',
        'Add-Type -AssemblyName System.Drawing; (New-Object System.Drawing.Text.InstalledFontCollection).Families | ForEach-Object { $_.Name }'
      ], { timeout: 8000 }, (err, stdout) => {
        if (err) { resolve([]); return; }
        resolve(stdout.split('\n').map(f => f.trim()).filter(Boolean).sort());
      });
    } else {
      execFile('fc-list', ['--format=%{family}\n'], { timeout: 5000 }, (err, stdout) => {
        if (err) { resolve([]); return; }
        const names = [...new Set(stdout.split('\n').flatMap(l => l.split(',')).map(f => f.trim()).filter(Boolean))].sort();
        resolve(names);
      });
    }
  });
});

// 설정 읽기/쓰기
ipcMain.handle('store-get', (_, key) => store.get(key));
ipcMain.handle('store-set', (_, key, value) => { store.set(key, value); return true; });
ipcMain.handle('store-delete', (_, key) => { store.delete(key); return true; });
ipcMain.handle('store-get-all', () => store.store);

// 팝업 알림
ipcMain.handle('show-notification', (_, opts) => { showNotificationPopup(opts); return true; });

// 바탕화면 모드 전환
ipcMain.handle('toggle-desktop-mode', (_, enabled) => {
  desktopModeEnabled = enabled;
  store.set('desktopMode', enabled); // 재시작 후에도 유지
  if (!mainWindow) return false;

  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  if (enabled) {
    // 바탕화면 모드: 전체화면, 작업표시줄/Alt+Tab 숨김, 다른 창 뒤로
    mainWindow.setSize(width, height);
    mainWindow.setPosition(0, 0);
    mainWindow.setResizable(false);
    mainWindow.setMovable(false);
    mainWindow.setSkipTaskbar(true);
    if (process.platform === 'win32') {
      mainWindow.setAlwaysOnTop(true, 'screen-saver');
      setTimeout(() => mainWindow.setAlwaysOnTop(false), 150);
    } else {
      mainWindow.setAlwaysOnTop(false);
    }
  } else {
    // 창 모드: 일반 윈도우 (작업표시줄/Alt+Tab 복원)
    mainWindow.setResizable(true);
    mainWindow.setMovable(true);
    mainWindow.setSkipTaskbar(false);
    mainWindow.setSize(Math.floor(width * 0.85), Math.floor(height * 0.85));
    mainWindow.center();
  }
  return desktopModeEnabled;
});

ipcMain.handle('get-desktop-mode', () => desktopModeEnabled);

// 폴더 읽기 (경로 지정 가능)
ipcMain.handle('read-directory', async (_, dirPath) => {
  const fs = require('fs');
  const os = require('os');
  const target = dirPath || path.join(os.homedir(), 'Desktop');
  try {
    const files = fs.readdirSync(target, { withFileTypes: true });
    return {
      path: target,
      parent: path.dirname(target),
      files: files
        .filter(f => !f.name.startsWith('.'))
        .map(f => {
          const full = path.join(target, f.name);
          let size = 0, mtime = 0;
          try {
            const st = fs.statSync(full);
            size = f.isDirectory() ? 0 : st.size;
            mtime = st.mtimeMs;
          } catch {}
          return {
            name: f.name,
            path: full,
            isDir: f.isDirectory(),
            ext: f.isDirectory() ? 'folder' : f.name.split('.').pop()?.toLowerCase() || '',
            size,
            mtime
          };
        })
        .sort((a, b) => (b.isDir - a.isDir) || a.name.localeCompare(b.name))
        .slice(0, 300)
    };
  } catch (e) {
    return { path: target, parent: path.dirname(target), files: [], error: e.message };
  }
});

// ── 파일 작업 (복사/이동/삭제/이름변경/폴더생성) ──────────────
ipcMain.handle('files-copy', async (_, src, dest) => {
  const fs = require('fs');
  try {
    const srcList = Array.isArray(src) ? src : [src];
    for (const s of srcList) {
      const base = path.basename(s);
      let target = path.join(dest, base);
      // 같은 이름 있으면 (2), (3)... 자동 부여
      let i = 2;
      while (fs.existsSync(target)) {
        const ext = path.extname(base);
        const stem = path.basename(base, ext);
        target = path.join(dest, `${stem} (${i})${ext}`);
        i++;
      }
      if (fs.statSync(s).isDirectory()) {
        fs.cpSync(s, target, { recursive: true });
      } else {
        fs.copyFileSync(s, target);
      }
    }
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('files-move', async (_, src, dest) => {
  const fs = require('fs');
  try {
    const srcList = Array.isArray(src) ? src : [src];
    for (const s of srcList) {
      const base = path.basename(s);
      let target = path.join(dest, base);
      if (path.resolve(s) === path.resolve(target)) continue; // 같은 위치
      let i = 2;
      while (fs.existsSync(target)) {
        const ext = path.extname(base);
        const stem = path.basename(base, ext);
        target = path.join(dest, `${stem} (${i})${ext}`);
        i++;
      }
      fs.renameSync(s, target);
    }
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('files-delete', async (_, p) => {
  try {
    const list = Array.isArray(p) ? p : [p];
    for (const f of list) {
      await shell.trashItem(f); // 휴지통으로 이동 (안전)
    }
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('files-rename', async (_, oldPath, newName) => {
  const fs = require('fs');
  try {
    const newPath = path.join(path.dirname(oldPath), newName);
    if (fs.existsSync(newPath)) return { success: false, error: '같은 이름이 이미 있습니다' };
    fs.renameSync(oldPath, newPath);
    return { success: true, path: newPath };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('files-mkdir', async (_, parent, name) => {
  const fs = require('fs');
  try {
    let target = path.join(parent, name);
    let i = 2;
    while (fs.existsSync(target)) { target = path.join(parent, `${name} (${i})`); i++; }
    fs.mkdirSync(target, { recursive: true });
    return { success: true, path: target };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('files-open', async (_, p) => {
  try { const r = await shell.openPath(p); return { success: !r, error: r }; }
  catch (e) { return { success: false, error: e.message }; }
});

ipcMain.handle('files-show-in-folder', async (_, p) => {
  try { shell.showItemInFolder(p); return { success: true }; }
  catch (e) { return { success: false, error: e.message }; }
});

ipcMain.handle('files-exists', async (_, p) => {
  const fs = require('fs');
  try { return fs.existsSync(p); } catch { return false; }
});

// ── Wifi 관리 (Windows netsh) ──────────────────────────────
ipcMain.handle('wifi-scan', async () => {
  const { exec } = require('child_process');
  return new Promise((resolve) => {
    if (process.platform !== 'win32') return resolve({ networks: [], error: 'Windows 전용' });
    // 먼저 스캔 트리거
    exec('netsh wlan show networks mode=bssid', { encoding: 'buffer', timeout: 6000 }, (err, stdoutBuf) => {
      if (err) return resolve({ networks: [], error: err.message });
      // UTF-8 / CP949 양쪽 디코딩 시도
      let out;
      try { out = stdoutBuf.toString('utf8'); if (!out.includes('SSID')) throw new Error('encoding'); }
      catch {
        try {
          const iconv = require('iconv-lite');
          out = iconv.decode(stdoutBuf, 'cp949');
        } catch { out = stdoutBuf.toString('latin1'); }
      }
      // 파싱: SSID 블록 추출
      const networks = [];
      const blocks = out.split(/\r?\n\s*\r?\n/);
      for (const block of blocks) {
        const ssidMatch = block.match(/SSID\s+\d+\s*:\s*(.+)/);
        if (!ssidMatch) continue;
        const ssid = ssidMatch[1].trim();
        if (!ssid) continue;
        const authMatch = block.match(/(?:인증|Authentication)\s*:\s*(.+)/);
        const signalMatch = block.match(/(?:신호|Signal)\s*:\s*(\d+)%/);
        networks.push({
          ssid,
          auth: authMatch ? authMatch[1].trim() : '',
          signal: signalMatch ? parseInt(signalMatch[1], 10) : 0,
          secured: !(authMatch && /Open|개방/i.test(authMatch[1]))
        });
      }
      // 같은 SSID 중복 제거 (가장 강한 신호 유지)
      const uniq = new Map();
      for (const n of networks) {
        const prev = uniq.get(n.ssid);
        if (!prev || prev.signal < n.signal) uniq.set(n.ssid, n);
      }
      const sorted = Array.from(uniq.values()).sort((a, b) => b.signal - a.signal);
      resolve({ networks: sorted });
    });
  });
});

ipcMain.handle('wifi-current', async () => {
  const { exec } = require('child_process');
  return new Promise((resolve) => {
    if (process.platform !== 'win32') return resolve({ connected: false });
    exec('netsh wlan show interfaces', { encoding: 'buffer', timeout: 5000 }, (err, stdoutBuf) => {
      if (err) return resolve({ connected: false, error: err.message });
      let out;
      try { out = stdoutBuf.toString('utf8'); if (!out.match(/SSID|상태/)) throw new Error('encoding'); }
      catch {
        try { const iconv = require('iconv-lite'); out = iconv.decode(stdoutBuf, 'cp949'); }
        catch { out = stdoutBuf.toString('latin1'); }
      }
      const stateMatch = out.match(/(?:상태|State)\s*:\s*(.+)/);
      const ssidMatch = out.match(/^\s*SSID\s*:\s*(.+)/m);
      const signalMatch = out.match(/(?:신호|Signal)\s*:\s*(\d+)%/);
      const connected = stateMatch && /connected|연결됨/i.test(stateMatch[1]);
      resolve({
        connected: !!connected,
        ssid: ssidMatch ? ssidMatch[1].trim() : '',
        signal: signalMatch ? parseInt(signalMatch[1], 10) : 0
      });
    });
  });
});

ipcMain.handle('wifi-connect', async (_, ssid) => {
  const { exec } = require('child_process');
  return new Promise((resolve) => {
    if (process.platform !== 'win32') return resolve({ success: false, error: 'Windows 전용' });
    // 이미 프로필에 저장된 네트워크만 연결 가능 (비밀번호 입력은 시스템 UI로 위임)
    exec(`netsh wlan connect name="${ssid.replace(/"/g, '')}"`, { timeout: 8000 }, (err, stdout) => {
      if (err) return resolve({ success: false, error: '저장된 프로필이 아닙니다. 시스템 설정에서 연결해 주세요.' });
      resolve({ success: true });
    });
  });
});

ipcMain.handle('wifi-open-settings', async () => {
  try {
    if (process.platform === 'win32') {
      shell.openExternal('ms-settings:network-wifi');
    } else {
      shell.openExternal('x-apple.systempreferences:com.apple.preference.network');
    }
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// 최근 저장/열었던 문서 (Windows Recent 폴더)
ipcMain.handle('get-desktop-files', async () => {
  const fs = require('fs');
  const os = require('os');

  // Windows: 최근 항목 폴더
  const recentPath = path.join(os.homedir(), 'AppData', 'Roaming', 'Microsoft', 'Windows', 'Recent');
  const docExts = ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'pdf', 'hwp', 'txt', 'csv', 'png', 'jpg'];

  try {
    const files = fs.readdirSync(recentPath);
    const results = [];

    for (const fname of files) {
      if (!fname.endsWith('.lnk')) continue;
      const cleanName = fname.replace('.lnk', '');
      const ext = cleanName.split('.').pop()?.toLowerCase();
      if (!docExts.includes(ext)) continue;

      const fullPath = path.join(recentPath, fname);
      try {
        const stat = fs.statSync(fullPath);
        results.push({
          name: cleanName,
          path: fullPath, // .lnk 파일 경로 (shell.openPath로 열면 원본 파일이 열림)
          isDir: false,
          ext: ext,
          mtime: stat.mtimeMs
        });
      } catch {}
    }

    // 최근 수정순 정렬
    results.sort((a, b) => b.mtime - a.mtime);
    return results.slice(0, 20);
  } catch (e) {
    // fallback: 바탕화면 파일
    const desktopPath = path.join(os.homedir(), 'Desktop');
    try {
      return fs.readdirSync(desktopPath, { withFileTypes: true })
        .filter(f => !f.name.startsWith('.') && !f.isDirectory())
        .map(f => ({ name: f.name, path: path.join(desktopPath, f.name), isDir: false, ext: f.name.split('.').pop()?.toLowerCase() || '' }))
        .slice(0, 20);
    } catch { return []; }
  }
});

// 최근 실행 프로그램 (Windows Recent + 시작 메뉴 바로가기)
ipcMain.handle('get-recent-apps', async () => {
  const fs = require('fs');
  const os = require('os');
  const { exec } = require('child_process');

  const results = [];
  const seen = new Set(); // 중복 방지 (프로그램명 기준)

  // 1) Windows Recent 폴더에서 .exe .lnk 찾기
  try {
    const recentPath = path.join(os.homedir(), 'AppData', 'Roaming', 'Microsoft', 'Windows', 'Recent');
    const files = fs.readdirSync(recentPath);
    for (const fname of files) {
      if (!fname.endsWith('.lnk')) continue;
      const cleanName = fname.replace('.lnk', '');
      const ext = cleanName.split('.').pop()?.toLowerCase();
      // 프로그램 바로가기 또는 실행파일
      if (!['exe', 'msi', 'lnk'].includes(ext) && !cleanName.includes('.exe')) {
        // 문서도 포함 — 프로그램이 아닌 파일도 "최근 사용"으로 표시
      }
      const fullPath = path.join(recentPath, fname);
      try {
        const stat = fs.statSync(fullPath);
        const key = cleanName.toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          results.push({
            name: cleanName,
            path: fullPath,
            ext: ext || '',
            mtime: stat.mtimeMs,
            source: 'recent'
          });
        }
      } catch {}
    }
  } catch {}

  // 2) 시작 메뉴 프로그램 바로가기 (자주 사용하는 앱)
  try {
    const startMenuPaths = [
      path.join(os.homedir(), 'AppData', 'Roaming', 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
      'C:\\ProgramData\\Microsoft\\Windows\\Start Menu\\Programs'
    ];
    for (const smPath of startMenuPaths) {
      if (!fs.existsSync(smPath)) continue;
      const scanDir = (dir, depth = 0) => {
        if (depth > 2) return;
        try {
          const items = fs.readdirSync(dir, { withFileTypes: true });
          for (const item of items) {
            const fp = path.join(dir, item.name);
            if (item.isDirectory()) { scanDir(fp, depth + 1); continue; }
            if (!item.name.endsWith('.lnk')) continue;
            const cleanName = item.name.replace('.lnk', '');
            const key = cleanName.toLowerCase();
            if (seen.has(key)) continue;
            // 언인스톨러, 도움말 등 제외
            if (/uninstall|제거|help|readme|license/i.test(cleanName)) continue;
            try {
              const stat = fs.statSync(fp);
              seen.add(key);
              results.push({
                name: cleanName,
                path: fp,
                ext: 'lnk',
                mtime: stat.mtimeMs,
                source: 'startmenu'
              });
            } catch {}
          }
        } catch {}
      };
      scanDir(smPath);
    }
  } catch {}

  // 최근 수정순 정렬, 상위 30개
  results.sort((a, b) => b.mtime - a.mtime);
  return results.slice(0, 30);
});

// 파일/앱 검색 (Windows Search Index 우선 → fallback: 최근 파일)
ipcMain.handle('search-files', async (_, query) => {
  if (!query || query.length < 2) return [];
  const { exec } = require('child_process');
  const os = require('os');
  const fs = require('fs');

  // Windows Search Index를 OLE DB로 조회 (빠름, 인덱스 기반)
  const safeQuery = query.replace(/'/g, "''").replace(/"/g, '""');
  const sqlQuery = `SELECT System.FileName, System.ItemPathDisplay, System.Size FROM SystemIndex WHERE CONTAINS(System.FileName, '"${safeQuery}*"') AND System.ItemType != 'Directory' ORDER BY System.DateModified DESC`;
  const psCmd = `powershell -NoProfile -Command "
    try {
      $con = New-Object -ComObject ADODB.Connection
      $con.Open('Provider=Search.CollatorDSO;Extended Properties=\\'Application=Windows\\'')
      $rs = $con.Execute('${sqlQuery.replace(/'/g, "''")}')
      $out = @()
      $count = 0
      while (-not $rs.EOF -and $count -lt 20) {
        $out += [PSCustomObject]@{ Name = $rs.Fields[0].Value; Path = $rs.Fields[1].Value; Size = $rs.Fields[2].Value }
        $rs.MoveNext()
        $count++
      }
      $rs.Close(); $con.Close()
      $out | ConvertTo-Json -Compress
    } catch { '[]' }
  "`;

  return new Promise((resolve) => {
    exec(psCmd, { timeout: 3000, encoding: 'utf-8' }, (err, stdout) => {
      if (!err && stdout && stdout.trim() !== '[]') {
        try {
          const raw = JSON.parse(stdout.trim());
          const items = Array.isArray(raw) ? raw : [raw];
          const results = items
            .filter(f => f.Path)
            .map(f => ({
              name: f.Name || path.basename(f.Path),
              path: f.Path,
              size: f.Size || 0,
              ext: (f.Name || '').split('.').pop()?.toLowerCase() || ''
            }));
          return resolve(results);
        } catch {}
      }

      // fallback: 최근 파일(Recent) + 바탕화면 직접 검색 (Depth 1만, 빠름)
      const results = [];
      const lq = query.toLowerCase();

      // 최근 파일에서 검색
      const recentPath = path.join(os.homedir(), 'AppData', 'Roaming', 'Microsoft', 'Windows', 'Recent');
      try {
        fs.readdirSync(recentPath)
          .filter(f => f.endsWith('.lnk') && f.toLowerCase().includes(lq))
          .slice(0, 10)
          .forEach(f => results.push({ name: f.replace('.lnk',''), path: path.join(recentPath, f), size: 0, ext: f.split('.').slice(-2,-1)[0]?.toLowerCase() || '' }));
      } catch {}

      // 주요 폴더 Depth 1 검색
      const searchPaths = [
        path.join(os.homedir(), 'Desktop'),
        path.join(os.homedir(), 'Documents'),
        path.join(os.homedir(), 'Downloads')
      ];
      for (const sp of searchPaths) {
        try {
          fs.readdirSync(sp, { withFileTypes: true })
            .filter(f => !f.isDirectory() && f.name.toLowerCase().includes(lq))
            .slice(0, 8)
            .forEach(f => results.push({ name: f.name, path: path.join(sp, f.name), size: 0, ext: f.name.split('.').pop()?.toLowerCase() || '' }));
        } catch {}
      }

      resolve(results.slice(0, 20));
    });
  });
});

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
  if (process.platform !== 'win32') return;
  const { execFile } = require('child_process');
  // waveOutSetVolume (winmm.dll) 으로 마스터 볼륨 설정 (0~100)
  const v = Math.max(0, Math.min(100, Math.round(level)));
  const psScript = `
$v=[uint32]([math]::Round(${v}/100.0*65535))
$combined=($v -shl 16) -bor $v
try{Add-Type -TypeDefinition 'using System;using System.Runtime.InteropServices;public class WinVol{[DllImport("winmm.dll")]public static extern int waveOutSetVolume(IntPtr h,uint v);}' -ErrorAction SilentlyContinue}catch{}
[WinVol]::waveOutSetVolume([IntPtr]::Zero,$combined)
`;
  const encoded = Buffer.from(psScript, 'utf16le').toString('base64');
  execFile('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-NonInteractive', '-EncodedCommand', encoded]);
});

// 작업표시줄 숨기기/보이기 (Windows 10/11 SHAppBarMessage 방식)
ipcMain.handle('system-taskbar', (_, show) => {
  if (process.platform !== 'win32') return;
  const { execFile } = require('child_process');
  // StuckRects3 Settings[8]: 2 = 항상표시, 3 = 자동숨김
  // SHAppBarMessage(ABM_SETSTATE=10) 로 즉시 반영 (UpdatePerUserSystemParameters 불사용 — 타 창 이동 방지)
  const regValue = show ? 2 : 3;
  const lParam   = show ? 0 : 1; // 0=show, 1=ABS_AUTOHIDE
  const psScript = `
$r='HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StuckRects3'
$d=(Get-ItemProperty -Path $r).Settings
$d[8]=${regValue}
Set-ItemProperty -Path $r -Name Settings -Value $d -Force
$src=@'
using System;
using System.Runtime.InteropServices;
public class TBState {
  [DllImport("shell32.dll")] public static extern uint SHAppBarMessage(uint m, ref ABD d);
  [StructLayout(LayoutKind.Sequential)] public struct ABD {
    public uint cbSize; public IntPtr hWnd; public uint uMsg; public uint uEdge;
    public int rcLeft,rcTop,rcRight,rcBottom; public int lParam;
  }
  public static void Set(int lp) {
    var d=new ABD(); d.cbSize=(uint)System.Runtime.InteropServices.Marshal.SizeOf(d); d.lParam=lp;
    SHAppBarMessage(10,ref d);
  }
}
'@
try { Add-Type -TypeDefinition $src -ErrorAction SilentlyContinue } catch {}
[TBState]::Set(${lParam})
`;
  // UTF-16LE Base64 인코딩으로 셸 이스케이프 완전 회피
  const encoded = Buffer.from(psScript, 'utf16le').toString('base64');
  execFile('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-NonInteractive', '-EncodedCommand', encoded],
    (err) => { if (err) console.warn('taskbar toggle error:', err.message); }
  );
});

// 외부 링크 열기
ipcMain.handle('open-external', (_, url) => { shell.openExternal(url); });

// Google Chat 인앱 창
let chatWindow = null;
ipcMain.handle('open-google-chat', () => {
  if (chatWindow && !chatWindow.isDestroyed()) {
    chatWindow.focus();
    return;
  }
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  chatWindow = new BrowserWindow({
    width: Math.min(1000, Math.floor(width * 0.6)),
    height: Math.min(800, Math.floor(height * 0.85)),
    title: 'Google Chat',
    autoHideMenuBar: true,
    webPreferences: { nodeIntegration: false, contextIsolation: true }
  });
  chatWindow.loadURL('https://chat.google.com');
  chatWindow.on('closed', () => { chatWindow = null; });
});

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

// ── Google OAuth 콜백 서버 ────────────────────────────────────
// 렌더러에서 window.open()으로 Google 인증 팝업을 열면
// Google이 이 서버로 콜백. 코드를 받아 렌더러로 전달.
const OAUTH_PORT = 3000; // Google Cloud Console 등록 URI: http://localhost:3000/auth/google/callback
let oauthCallbackServer = null;

async function startOAuthCallbackServer() {
  if (oauthCallbackServer?.listening) return true;
  const http = require('http');
  return new Promise((resolve) => {
    oauthCallbackServer = http.createServer((req, res) => {
      try {
        const urlObj = new URL(req.url, `http://localhost:${OAUTH_PORT}`);
        if (urlObj.pathname === '/auth/google/callback') {
          const code = urlObj.searchParams.get('code');
          const error = urlObj.searchParams.get('error');
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(`<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="font-family:'Malgun Gothic',sans-serif;text-align:center;padding:48px;background:#f0fdf4">
${error
  ? `<div style="font-size:48px">❌</div><h2 style="color:#dc2626">로그인 실패</h2><p style="color:#6b7280">${error}</p>`
  : `<div style="font-size:48px">✅</div><h2 style="color:#065f46">Google 로그인 성공!</h2><p style="color:#6b7280">이 창은 자동으로 닫힙니다...</p>`
}
<script>setTimeout(()=>window.close(),1200)</script>
</body></html>`);
          if (code) {
            mainWindow?.webContents.send('oauth-code', code);
          } else {
            mainWindow?.webContents.send('oauth-error', error || '인증 실패');
          }
        } else {
          res.writeHead(404); res.end('Not found');
        }
      } catch (e) {
        res.writeHead(500); res.end('Error');
      }
    });
    oauthCallbackServer.listen(OAUTH_PORT, 'localhost', () => {
      console.log(`[OAuth] 콜백 서버 시작 port:${OAUTH_PORT}`);
      resolve(true);
    });
    oauthCallbackServer.on('error', (err) => {
      console.warn('[OAuth] 서버 오류:', err.message);
      oauthCallbackServer = null;
      resolve(false);
    });
  });
}

// ── 자동 업데이트 (electron-updater) ──────────────────────────
const { autoUpdater } = require('electron-updater');
const CURRENT_VERSION = app.getVersion();

// autoUpdater 설정
autoUpdater.autoDownload = false;         // 자동 다운로드 OFF → 사용자 확인 후 다운로드
autoUpdater.autoInstallOnAppQuit = true;  // 앱 종료 시 자동 설치
autoUpdater.logger = null;                // 기본 로거 비활성화

function setupAutoUpdater() {
  // 새 버전 발견
  autoUpdater.on('update-available', (info) => {
    console.log('[AutoUpdater] 새 버전 발견:', info.version);
    mainWindow?.webContents.send('update-available', {
      current: CURRENT_VERSION,
      latest: info.version,
      notes: info.releaseNotes || '',
      url: `https://github.com/wizbeee/smart-teacher-desktop/releases/tag/v${info.version}`
    });
  });

  // 최신 상태 (업데이트 없음)
  autoUpdater.on('update-not-available', () => {
    console.log('[AutoUpdater] 최신 버전입니다.');
  });

  // 다운로드 진행률
  autoUpdater.on('download-progress', (progress) => {
    mainWindow?.webContents.send('update-download-progress', {
      percent: Math.round(progress.percent),
      transferred: progress.transferred,
      total: progress.total
    });
  });

  // 다운로드 완료 → 설치 준비
  autoUpdater.on('update-downloaded', (info) => {
    console.log('[AutoUpdater] 다운로드 완료:', info.version);
    mainWindow?.webContents.send('update-downloaded', {
      version: info.version
    });
  });

  // 오류
  autoUpdater.on('error', (err) => {
    console.warn('[AutoUpdater] 오류:', err.message);
    // 자동 업데이트 실패 시 fallback: GitHub Releases 수동 안내
    checkForUpdatesFallback();
  });
}

// Fallback: electron-updater 실패 시 GitHub API로 수동 체크
async function checkForUpdatesFallback() {
  try {
    const https = require('https');
    const data = await new Promise((resolve, reject) => {
      https.get('https://api.github.com/repos/wizbeee/smart-teacher-desktop/releases/latest', {
        headers: { 'User-Agent': 'smart-desktop' }
      }, res => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => resolve(JSON.parse(body)));
      }).on('error', reject);
    });

    if (data.tag_name) {
      const latest = data.tag_name.replace('v', '');
      if (latest !== CURRENT_VERSION) {
        mainWindow?.webContents.send('update-available', {
          current: CURRENT_VERSION,
          latest: latest,
          url: data.html_url,
          notes: data.body || ''
        });
      }
    }
  } catch (e) {
    console.log('[AutoUpdater] Fallback check failed:', e.message);
  }
}

function checkForUpdates() {
  try {
    autoUpdater.checkForUpdates().catch(() => checkForUpdatesFallback());
  } catch {
    checkForUpdatesFallback();
  }
}

// 앱 버전 조회 (동기)
ipcMain.on('get-app-version', (e) => { e.returnValue = app.getVersion(); });

// 업데이트 체크 IPC
ipcMain.handle('check-update', async () => {
  checkForUpdates();
  return true;
});

// 다운로드 시작 IPC (사용자가 "다운로드" 버튼 클릭 시)
ipcMain.handle('download-update', async () => {
  try {
    await autoUpdater.downloadUpdate();
    return true;
  } catch (e) {
    console.warn('[AutoUpdater] 다운로드 실패:', e.message);
    return false;
  }
});

// 설치 & 재시작 IPC (사용자가 "지금 설치" 버튼 클릭 시)
ipcMain.handle('install-update', () => {
  autoUpdater.quitAndInstall(false, true); // isSilent=false, isForceRunAfter=true
});

// OAuth 서버 수동 시작 IPC (렌더러에서 로그인 버튼 클릭 시 호출)
ipcMain.handle('start-oauth-server', async () => {
  return await startOAuthCallbackServer();
});

// OAuth 포트 조회
ipcMain.handle('get-oauth-port', () => OAUTH_PORT);

// 온보딩 초기화 (스토어에서 setupComplete 제거)
ipcMain.handle('reset-onboarding', () => {
  store.set('user.setupComplete', false);
  return true;
});

// AI API 프록시 (CORS 우회 - 메인 프로세스에서 직접 호출)
ipcMain.handle('ai-api-call', async (_, { url, headers, body }) => {
  const https = require('https');
  const urlObj = new URL(url);
  const bodyStr = JSON.stringify(body);

  return new Promise((resolve, reject) => {
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + (urlObj.search || ''),
      method: 'POST',
      headers: {
        ...headers,
        'Content-Length': Buffer.byteLength(bodyStr)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, data: JSON.parse(data) });
        } catch (e) {
          resolve({ ok: false, status: res.statusCode, data: null, raw: data });
        }
      });
    });

    req.on('error', (e) => reject(e));
    req.write(bodyStr);
    req.end();
  });
});

// ── 앱 이벤트 ────────────────────────────────────────────────
app.whenReady().then(async () => {
  initStore();
  // 저장된 바탕화면 모드 복원 (창 생성 전에 로드해야 skipTaskbar 적용)
  desktopModeEnabled = store.get('desktopMode', false);
  // OAuth 콜백 서버를 앱 시작 시 항상 기동 (window.open 방식 지원)
  await startOAuthCallbackServer();
  createMainWindow();
  createTray();

  // 자동 시작 등록 (프로덕션)
  if (!isDev) {
    app.setLoginItemSettings({
      openAtLogin: true,
      name: '스마트 바탕화면'
    });
  }

  // 자동 업데이트 초기화
  setupAutoUpdater();
  // 시작 시 업데이트 체크 (30초 후)
  setTimeout(checkForUpdates, 30000);
  // 이후 6시간마다 체크
  setInterval(checkForUpdates, 6 * 60 * 60 * 1000);
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
