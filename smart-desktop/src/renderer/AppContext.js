// ============================================================
// AppContext.js - 전역 상태 관리
// ============================================================

import React, { createContext, useContext, useReducer, useEffect, useCallback } from 'react';

const AppContext = createContext(null);

// ── 기본 상태 (Electron 없는 환경 fallback) ─────────────────
const DEFAULT_STATE = {
  // 사용자
  user: { name: '', school: '', role: 'teacher', setupComplete: false },

  // 테마
  theme: {
    accentColor: '#f43f5e',
    bgColor: '#fff1f2',
    widgetBg: '#ffffff',
    textColor: '#1f2937',
    borderColor: '#fecdd3',
    darkMode: false,
    preset: 'rose',
    fontSize: 13,
    fontFamily: 'Malgun Gothic',
    bgImage: '',
    widgetOpacity: 95,
    autoDarkMode: false,
    // ── v3.2 확장 테마 속성 ──
    borderRadius: 10,       // 위젯 카드 모서리
    borderRadiusSm: 6,      // 버튼/입력
    borderWidth: 1,          // 테두리 두께 (0=없음)
    shadowStyle: 'subtle',   // none | subtle | medium | elevated
    widgetBgStyle: 'solid',  // solid | glass | gradient | flat
    surfaceColor: '',        // 입력 배경
    gradientFrom: '',        // 위젯 그래디언트 시작
    gradientTo: '',          // 위젯 그래디언트 끝
    backdropBlur: 0,         // 글래스모피즘 blur (px)
  },

  // 자주 쓰는 문구
  quickPhrases: [
    '확인했습니다.',
    '감사합니다.',
    '수고하셨습니다.',
    '검토 부탁드립니다.',
    '내일까지 제출해 주세요.'
  ],

  // 위젯 프리셋
  layoutPresets: {},

  // 일과표 (충남삼성고)
  schedule: {
    workStart: '08:30', workEnd: '16:30',
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

  // 시간표
  timetable: { mon: [], tue: [], wed: [], thu: [], fri: [] },

  // D-Day (기본값 없음 — 사용자가 직접 추가)
  ddays: [],

  // 할 일
  todos: [],

  // 메모
  memos: [],

  // 즐겨찾기
  favorites: [],

  // 바탕화면 폴더 구역
  desktopZones: [
    { id: 1, label: '긴급', color: '#ef4444', files: [] },
    { id: 2, label: '진행중 업무', color: '#f97316', files: [] },
    { id: 3, label: '나중에 볼 파일', color: '#8b5cf6', files: [] }
  ],

  // 알림 설정
  notifications: {
    classReminder: true,
    scheduleAlert: true,
    mailAlert: true,
    communityAlert: true,
    silentDuringClass: true,
    soundEnabled: true
  },

  // 연동 상태
  google: { connected: false, email: '', clientSecret: '', services: {}, selectedCalendarIds: [], calendarList: [] },
  microsoft: { connected: false, email: '', services: {} },
  ai: { enabled: true, provider: 'gemini', apiKey: '', model: '', ollamaUrl: 'http://localhost:11434' },
  noticeboard: { enabled: true, googleSheetUrl: '', refreshInterval: 15 },
  weather: { location: '서울', lat: 37.5665, lon: 126.9780 },
  meal: { schoolCode: '', officeCode: '', enabled: true },
  community: { userId: '', username: '', groups: [], serverUrl: '', firebaseConfig: {} },
  focus: { duration: 25, breakTime: 5, active: false },

  // 위젯 표시 설정 (스크린샷 기본 레이아웃 기준)
  widgets: {
    // ── 기본 ON ─────────────────────────────────────────
    timetable: true,    // 시간표
    dday: true,         // D-Day
    quicklinks: true,   // 바로가기
    calendar: true,     // 캘린더
    mail: true,         // 받은 메일
    progress: true,     // 수업 진도표
    todos: true,        // 할 일
    memo: true,         // 메모
    aichat: true,       // AI Plus
    stopwatch: true,    // 스톱워치
    weather: true,      // 날씨
    meal: true,         // 급식
    randompick: true,   // 랜덤 뽑기
    music: true,        // 음악
    calc: true,         // 계산기
    teachinglinks: true,// 수업 자료
    quote: true,        // 명언
    // ── 기본 OFF ────────────────────────────────────────
    clock: false,
    currentPeriod: false,
    noticeboard: false,
    noticeboard1: false,
    noticeboard2: false,
    system: false,
    focus: false,
    recentfiles: false,
    weekschedule: false,
    neisalert: false,
    exam: false,
    fileexplorer: false,
    quickphrases: false,
    lessontimer: false,
    grading: false,
    // ── 신규 위젯 (기본 OFF) ────────────────────────────────
    timeline: false,        // 타임라인 뷰
    dualtz: false,          // 세계 시계
    eventtemplate: false,   // 이벤트 템플릿
    journal: false,         // 일일 저널
    stickynote: false,      // 스티커 노트
    habit: false,           // 습관 트래커
    challenge: false,       // 일일 미니 챌린지
    kanban: false,          // 칸반 보드
    applauncher: false,     // 앱 런처
    attendance: false,      // 학급 출석 체커
    noisemeter: false,      // 소음 측정기
    rotationtimer: false,   // 모둠 활동 순환 타이머
    scoreboard: false,      // 팀 점수판
    streak: false,          // 연속기록 카운터
    eyerest: false,         // 눈 휴식 알림
    water: false,           // 수분 섭취 리마인더
    currency: false,        // 환율 변환기
    graphview: false,       // 그래프 뷰
    voicetodo: false,       // 음성→할일
    photoframe: false,      // 사진 프레임
    rssfeed: false,         // RSS 피드
    aisummary: false,       // AI 문서 요약
    xpbadge: false,         // 업적 배지 & XP
    stretch: false,         // 스트레칭 가이드
    screentime: false,      // 스크린타임
    emailpreview: false,    // 이메일 미리보기
    sysmonitor: false,      // 시스템 모니터
    countdown: false,       // 카운트다운 대시보드
    network: false,         // 네트워크 속도
    storageinfo: false,     // 스토리지 분석
    ocr: false,             // OCR 텍스트 추출
    locreminder: false,     // 위치 기반 리마인더
    unitconverter: false,   // 단위 변환기
    seatingchart: false,    // 학급 좌석표
    metronome: false,       // 메트로놈
    qrcode: false,          // QR코드 생성
    classvote: false,       // 학급 투표
    classbell: false,       // 수업 종소리
  },

  // UI 상태
  ui: {
    settingsOpen: false,
    settingsTab: 'design',
    onboardingOpen: false,
    onboardingStep: 1,
    silentMode: false,
    focusMode: false,
    editMode: false    // 위젯 편집 모드
  },

  // 실시간 데이터 (캐시)
  cache: {
    weatherData: null,
    mealData: null,
    calendarEvents: [],
    gmailUnread: 0,
    noticeboardText: '',
    communityMessages: []
  }
};

// ── 리듀서 ──────────────────────────────────────────────────
function appReducer(state, action) {
  switch (action.type) {

    case 'INIT': {
      const p = action.payload;
      // 저장된 bgColor가 빈 값이면 기본값으로 복구 (투명화 방지)
      // v3.2 테마 마이그레이션: 없는 속성은 기본값으로 채움
      const themeDefs = state.theme; // DEFAULT_STATE.theme
      const safeTheme = p.theme ? {
        ...themeDefs,  // 기본값 먼저
        ...p.theme,    // 저장된 값 덮어쓰기
        bgColor: p.theme.bgColor || (p.theme.darkMode ? '#0f172a' : '#fff1f2'),
        widgetBg: p.theme.widgetBg || (p.theme.darkMode ? '#1e293b' : '#ffffff'),
        textColor: p.theme.textColor || (p.theme.darkMode ? '#e2e8f0' : '#1f2937'),
        // v3.2 신규 속성 — 저장된 값 없으면 기본값 유지
        borderRadius: p.theme.borderRadius ?? themeDefs.borderRadius,
        borderRadiusSm: p.theme.borderRadiusSm ?? themeDefs.borderRadiusSm,
        borderWidth: p.theme.borderWidth ?? themeDefs.borderWidth,
        shadowStyle: p.theme.shadowStyle || themeDefs.shadowStyle,
        widgetBgStyle: p.theme.widgetBgStyle || themeDefs.widgetBgStyle,
        backdropBlur: p.theme.backdropBlur ?? themeDefs.backdropBlur,
        gradientFrom: p.theme.gradientFrom ?? themeDefs.gradientFrom,
        gradientTo: p.theme.gradientTo ?? themeDefs.gradientTo,
        surfaceColor: p.theme.surfaceColor ?? themeDefs.surfaceColor,
      } : state.theme;
      // 구버전 기본값 마이그레이션: selectedCalendarIds가 ['primary']만 있으면 빈 배열로 초기화
      // (사용자가 명시적으로 선택하지 않은 경우)
      const savedIds = Array.isArray(p.google?.selectedCalendarIds) ? p.google.selectedCalendarIds : [];
      const safeGoogle = p.google ? {
        ...p.google,
        selectedCalendarIds: (savedIds.length === 1 && savedIds[0] === 'primary' && !p.google?.calendarList?.length)
          ? []
          : savedIds
      } : state.google;
      return { ...state, ...p, theme: safeTheme, google: safeGoogle };
    }

    case 'SET_USER': return { ...state, user: { ...state.user, ...action.payload } };

    case 'SET_THEME': return { ...state, theme: { ...state.theme, ...action.payload } };

    case 'SET_SCHEDULE':
      return { ...state, schedule: { ...state.schedule, ...action.payload } };

    case 'SET_TIMETABLE':
      return { ...state, timetable: { ...state.timetable, ...action.payload } };

    case 'ADD_TODO':
      return { ...state, todos: [...state.todos, action.payload] };
    case 'UPDATE_TODO':
      return { ...state, todos: state.todos.map(t => t.id === action.payload.id ? { ...t, ...action.payload } : t) };
    case 'DELETE_TODO':
      return { ...state, todos: state.todos.filter(t => t.id !== action.payload) };

    case 'ADD_DDAY':
      return { ...state, ddays: [...state.ddays, action.payload] };
    case 'DELETE_DDAY':
      return { ...state, ddays: state.ddays.filter(d => d.id !== action.payload) };
    case 'UPDATE_DDAY':
      return { ...state, ddays: state.ddays.map(d => d.id === action.payload.id ? { ...d, ...action.payload } : d) };

    case 'ADD_MEMO':
      return { ...state, memos: [...state.memos, action.payload] };
    case 'DELETE_MEMO':
      return { ...state, memos: state.memos.filter(m => m.id !== action.payload) };
    case 'UPDATE_MEMO':
      return { ...state, memos: state.memos.map(m => m.id === action.payload.id ? { ...m, ...action.payload } : m) };

    case 'SET_WIDGETS':
      return { ...state, widgets: { ...state.widgets, ...action.payload } };

    case 'SET_UI':
      return { ...state, ui: { ...state.ui, ...action.payload } };

    // 포커스/무음 토글 (함수형 updater 대신 reducer 내에서 처리)
    case 'TOGGLE_FOCUS':
      return { ...state, ui: { ...state.ui, focusMode: !state.ui?.focusMode } };
    case 'TOGGLE_SILENT':
      return { ...state, ui: { ...state.ui, silentMode: !state.ui?.silentMode } };

    case 'SET_FAVORITES':
      return { ...state, favorites: action.payload };

    case 'SET_CACHE':
      return { ...state, cache: { ...state.cache, ...action.payload } };

    case 'SET_GOOGLE':
      return { ...state, google: { ...state.google, ...action.payload } };
    case 'SET_MICROSOFT':
      return { ...state, microsoft: { ...state.microsoft, ...action.payload } };
    case 'SET_AI':
      return { ...state, ai: { ...state.ai, ...action.payload } };
    case 'SET_NOTIFICATIONS':
      return { ...state, notifications: { ...state.notifications, ...action.payload } };
    case 'SET_COMMUNITY':
      return { ...state, community: { ...state.community, ...action.payload } };
    case 'SET_MEAL':
      return { ...state, meal: { ...state.meal, ...action.payload } };
    case 'SET_WEATHER':
      return { ...state, weather: { ...state.weather, ...action.payload } };

    case 'SET_NOTICEBOARD':
      return { ...state, noticeboard: { ...state.noticeboard, ...action.payload } };

    default: return state;
  }
}

// ── 저장 키 목록 (로컬 저장 대상) ───────────────────────────
const PERSIST_KEYS = [
  'user', 'theme', 'schedule', 'timetable', 'ddays',
  'todos', 'memos', 'favorites', 'desktopZones',
  'notifications', 'google', 'microsoft', 'ai',
  'noticeboard', 'weather', 'meal', 'community', 'focus', 'widgets', 'quickPhrases', 'layoutPresets'
];

// ── 프로바이더 ───────────────────────────────────────────────
export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(appReducer, DEFAULT_STATE);

  // Electron 스토어에서 초기 데이터 로드
  useEffect(() => {
    async function loadStore() {
      if (window.electronAPI) {
        const stored = await window.electronAPI.store.getAll();
        if (stored) {
          dispatch({ type: 'INIT', payload: stored });
        }
      } else {
        // 브라우저 개발 환경: localStorage 사용
        try {
          const saved = localStorage.getItem('smart-desktop');
          if (saved) {
            dispatch({ type: 'INIT', payload: JSON.parse(saved) });
          }
        } catch {}
      }
    }
    loadStore();
  }, []);

  // 상태 변경 시 자동 저장 (2초 디바운스 — 멈춤 방지)
  useEffect(() => {
    const timer = setTimeout(() => {
      const persist = {};
      PERSIST_KEYS.forEach(k => { persist[k] = state[k]; });

      if (window.electronAPI) {
        try {
          PERSIST_KEYS.forEach(k => {
            window.electronAPI.store.set(k, state[k]);
          });
        } catch (e) {
          console.warn('[AppContext] 설정 저장 실패:', e?.message || e);
        }
      } else {
        try {
          localStorage.setItem('smart-desktop', JSON.stringify(persist));
        } catch (e) {
          console.warn('[AppContext] localStorage 저장 실패:', e?.message || e);
        }
      }
    }, 2000);
    return () => clearTimeout(timer);
  }, [state]);

  // Electron 이벤트 수신 (한 번만 등록 + 언마운트 시 정리)
  useEffect(() => {
    if (!window.electronAPI) return;
    const onSettings = () => dispatch({ type: 'SET_UI', payload: { settingsOpen: true } });
    // TOGGLE_FOCUS/TOGGLE_SILENT: reducer 내부에서 현재 state를 읽어 토글 (함수형 updater 미지원)
    const onFocus  = () => dispatch({ type: 'TOGGLE_FOCUS' });
    const onSilent = () => dispatch({ type: 'TOGGLE_SILENT' });
    window.electronAPI.on('open-settings', onSettings);
    window.electronAPI.on('toggle-focus',  onFocus);
    window.electronAPI.on('toggle-silent', onSilent);
    return () => {
      window.electronAPI.off?.('open-settings', onSettings);
      window.electronAPI.off?.('toggle-focus',  onFocus);
      window.electronAPI.off?.('toggle-silent', onSilent);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 편의 액션 함수들 ──────────────────────────────────────
  const actions = {
    setUser: useCallback((data) => dispatch({ type: 'SET_USER', payload: data }), []),
    setTheme: useCallback((data) => dispatch({ type: 'SET_THEME', payload: data }), []),
    setSchedule: useCallback((data) => dispatch({ type: 'SET_SCHEDULE', payload: data }), []),
    setTimetable: useCallback((data) => dispatch({ type: 'SET_TIMETABLE', payload: data }), []),

    addTodo: useCallback((todo) => dispatch({ type: 'ADD_TODO', payload: { ...todo, id: Date.now(), createdAt: new Date().toISOString() } }), []),
    updateTodo: useCallback((todo) => dispatch({ type: 'UPDATE_TODO', payload: todo }), []),
    deleteTodo: useCallback((id) => dispatch({ type: 'DELETE_TODO', payload: id }), []),

    addDday: useCallback((dday) => dispatch({ type: 'ADD_DDAY', payload: { ...dday, id: Date.now() } }), []),
    updateDday: useCallback((dday) => dispatch({ type: 'UPDATE_DDAY', payload: dday }), []),
    deleteDday: useCallback((id) => dispatch({ type: 'DELETE_DDAY', payload: id }), []),

    addMemo: useCallback((memo) => dispatch({ type: 'ADD_MEMO', payload: { ...memo, id: Date.now(), createdAt: new Date().toISOString() } }), []),
    updateMemo: useCallback((memo) => dispatch({ type: 'UPDATE_MEMO', payload: memo }), []),
    deleteMemo: useCallback((id) => dispatch({ type: 'DELETE_MEMO', payload: id }), []),

    setUI: useCallback((data) => dispatch({ type: 'SET_UI', payload: data }), []),
    setFavorites: useCallback((data) => dispatch({ type: 'SET_FAVORITES', payload: data }), []),
    setCache: useCallback((data) => dispatch({ type: 'SET_CACHE', payload: data }), []),
    setGoogle: useCallback((data) => dispatch({ type: 'SET_GOOGLE', payload: data }), []),
    setMicrosoft: useCallback((data) => dispatch({ type: 'SET_MICROSOFT', payload: data }), []),
    setAI: useCallback((data) => dispatch({ type: 'SET_AI', payload: data }), []),
    setNotifications: useCallback((data) => dispatch({ type: 'SET_NOTIFICATIONS', payload: data }), []),
    setCommunity: useCallback((data) => dispatch({ type: 'SET_COMMUNITY', payload: data }), []),
    setMeal: useCallback((data) => dispatch({ type: 'SET_MEAL', payload: data }), []),
    setWeather: useCallback((data) => dispatch({ type: 'SET_WEATHER', payload: data }), []),
    setNoticeboard: useCallback((data) => dispatch({ type: 'SET_NOTICEBOARD', payload: data }), []),
    dispatch,
    setWidgets: useCallback((data) => dispatch({ type: 'SET_WIDGETS', payload: data }), []),

    // 알림 팝업 발송
    showNotification: useCallback((opts) => {
      if (window.electronAPI) {
        window.electronAPI.notification.show(opts);
      }
    }, [])
  };

  return (
    <AppContext.Provider value={{ state, actions }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
