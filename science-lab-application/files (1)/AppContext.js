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
    accentColor: '#e879a0',
    bgColor: '#fff5f7',
    widgetBg: '#ffffff',
    textColor: '#2d2d2d',
    borderColor: '#f0d0da',
    darkMode: false,
    preset: 'pink'
  },

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

  // D-Day
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
  google: { connected: false, email: '', services: {} },
  microsoft: { connected: false, email: '', services: {} },
  ai: { enabled: false, provider: 'claude', apiKey: '', model: '' },
  noticeboard: { enabled: false, googleSheetUrl: '', refreshInterval: 15 },
  weather: { location: '아산', lat: 36.7798, lon: 127.0043 },
  meal: { schoolCode: 'J100005773', officeCode: 'J10', enabled: true },
  community: { userId: '', username: '', groups: [], serverUrl: '' },
  focus: { duration: 25, breakTime: 5, active: false },

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

    case 'INIT': return { ...state, ...action.payload };

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

    case 'SET_UI':
      return { ...state, ui: { ...state.ui, ...action.payload } };

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

    default: return state;
  }
}

// ── 저장 키 목록 (로컬 저장 대상) ───────────────────────────
const PERSIST_KEYS = [
  'user', 'theme', 'schedule', 'timetable', 'ddays',
  'todos', 'memos', 'favorites', 'desktopZones',
  'notifications', 'google', 'microsoft', 'ai',
  'noticeboard', 'weather', 'meal', 'community', 'focus'
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

  // 상태 변경 시 자동 저장
  useEffect(() => {
    const persist = {};
    PERSIST_KEYS.forEach(k => { persist[k] = state[k]; });

    if (window.electronAPI) {
      PERSIST_KEYS.forEach(k => {
        window.electronAPI.store.set(k, state[k]);
      });
    } else {
      try {
        localStorage.setItem('smart-desktop', JSON.stringify(persist));
      } catch {}
    }
  }, [state]);

  // Electron 이벤트 수신
  useEffect(() => {
    if (!window.electronAPI) return;
    window.electronAPI.on('open-settings', () => dispatch({ type: 'SET_UI', payload: { settingsOpen: true } }));
    window.electronAPI.on('toggle-focus', () => dispatch({ type: 'SET_UI', payload: { focusMode: !state.ui.focusMode } }));
    window.electronAPI.on('toggle-silent', () => dispatch({ type: 'SET_UI', payload: { silentMode: !state.ui.silentMode } }));
  }, []);

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
    setCache: useCallback((data) => dispatch({ type: 'SET_CACHE', payload: data }), []),
    setGoogle: useCallback((data) => dispatch({ type: 'SET_GOOGLE', payload: data }), []),
    setMicrosoft: useCallback((data) => dispatch({ type: 'SET_MICROSOFT', payload: data }), []),
    setAI: useCallback((data) => dispatch({ type: 'SET_AI', payload: data }), []),
    setNotifications: useCallback((data) => dispatch({ type: 'SET_NOTIFICATIONS', payload: data }), []),
    setCommunity: useCallback((data) => dispatch({ type: 'SET_COMMUNITY', payload: data }), []),

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
