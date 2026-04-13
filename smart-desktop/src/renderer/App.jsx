// ============================================================
// App.jsx - 메인 앱 루트 (v3 레이아웃)
// ============================================================

import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { AppProvider, useApp } from './AppContext';
import Onboarding from './components/Onboarding';
import SettingsPanel from './components/SettingsPanel';
// CurrentPeriodWidget는 상단바 내장형(CurrentPeriodMini)으로 대체
import TimetableWidget from './components/TimetableWidget';
import CalendarWidget from './components/CalendarWidget';
import WeatherWidget from './components/WeatherWidget';
import MealWidget from './components/MealWidget';
import NoticeboardWidget, { NoticeboardBar, Noticeboard2Widget, useNotices } from './components/NoticeboardWidget';
import AIPlusPanel from './components/AIPlusPanel';
import CommunityPanel from './components/CommunityPanel';
import { FocusWidget, ClipboardPanel } from './components/ProductivityWidgets';
import { startNotificationScheduler, startMailNotificationScheduler } from './services/notificationService';
import { chat as aiChat } from './services/aiService';
import { initFirebase } from './services/communityService';
import DesktopZones from './components/DesktopZones';
import GoogleCallback from './components/GoogleCallback';
import EditableWidget from './components/EditableWidget';
import { LessonTimerWidget, GradingWidget, TeachingLinksWidget } from './components/ExtraWidgets';
import { TimelineWidget, DualTimezoneWidget, EventTemplateWidget, JournalWidget, StickyNoteWidget, DailyChallengeWidget, KanbanWidget, AppLauncherWidget, NoiseMeterWidget, RotationTimerWidget, ScoreboardWidget, StreakWidget, EyeRestWidget, WaterReminderWidget, CurrencyWidget } from './components/NewWidgets';
import { GraphViewWidget, VoiceToTodoWidget, PhotoFrameWidget, RSSFeedWidget, AISummaryWidget, XPBadgeWidget, StretchWidget, ScreenTimeWidget, EmailPreviewWidget, SystemMonitorWidget, CountdownDashWidget, NetworkMonitorWidget, StorageWidget, OCRWidget, LocationReminderWidget, UnitConverterWidget, SeatingChartWidget, MetronomeWidget, QRCodeWidget, ClassVoteWidget, ClassBellWidget } from './components/NewWidgets2';

// ── 위젯 반응형 훅: 컨테이너 크기에 따라 스타일 자동 조절 ───
function useWidgetSize(ref) {
  const [size, setSize] = useState({ w: 300, h: 200, mode: 'normal' });
  useEffect(() => {
    if (!ref?.current) return;
    const el = ref.current;
    const calc = () => {
      const { width: w, height: h } = el.getBoundingClientRect();
      const mode = w < 180 || h < 140 ? 'compact' : w > 400 ? 'large' : 'normal';
      setSize(prev => (prev.w === Math.round(w) && prev.h === Math.round(h)) ? prev : { w: Math.round(w), h: Math.round(h), mode });
    };
    calc();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(calc) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, [ref]);
  return size;
}

// 반응형 스타일 헬퍼: mode에 따라 fontSize/padding/gap 반환
function rs(mode) {
  if (mode === 'compact') return { fs: 10, fsMd: 11, fsLg: 14, pad: 6, gap: 3, iconSize: 16 };
  if (mode === 'large')   return { fs: 13, fsMd: 14, fsLg: 20, pad: 14, gap: 8, iconSize: 28 };
  return                          { fs: 11, fsMd: 12, fsLg: 16, pad: 10, gap: 5, iconSize: 20 };
}

// ── 공통 유틸리티 ─────────────────────────────────────────
// 로컬 시간대 기준 오늘 날짜 키 (YYYY-MM-DD) — toISOString은 UTC라 KST에서 날짜 경계 문제
function getTodayKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
}
// localStorage 안전 읽기 (배열 타입 보장)
function loadLS(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    if (Array.isArray(fallback)) return Array.isArray(parsed) ? parsed : fallback;
    return parsed ?? fallback;
  } catch { return fallback; }
}
// localStorage 안전 쓰기
function saveLS(key, data) {
  try { localStorage.setItem(key, JSON.stringify(data)); } catch (e) { console.warn('[saveLS]', key, e.message); }
}

// ── 테마 기반 색상 헬퍼 ─────────────────────────────────────
const c = (theme, light, dark) => theme.darkMode ? dark : light;

// ── 공통 카드 (v3.2 테마 기반) ────────────────────────────────
const SHADOWS = {
  none: 'none',
  subtle: { light: '0 1px 6px rgba(0,0,0,0.05)', dark: '0 2px 8px rgba(0,0,0,0.3)' },
  medium: { light: '0 2px 12px rgba(0,0,0,0.08)', dark: '0 4px 16px rgba(0,0,0,0.4)' },
  elevated: { light: '0 4px 20px rgba(0,0,0,0.12)', dark: '0 8px 32px rgba(0,0,0,0.5)' },
};

const card = (theme, extra = {}) => {
  const op = (theme.widgetOpacity || 95) / 100;
  const radius = theme.borderRadius ?? 10;
  const bw = theme.borderWidth ?? 1;
  const style = theme.widgetBgStyle || 'solid';
  const shadow = SHADOWS[theme.shadowStyle || 'subtle'];

  // 배경 스타일
  let bg;
  if (style === 'glass') {
    bg = theme.darkMode ? `rgba(30,41,59,${op * 0.7})` : `rgba(255,255,255,${op * 0.6})`;
  } else if (style === 'gradient' && theme.gradientFrom) {
    bg = `linear-gradient(135deg, ${theme.gradientFrom}, ${theme.gradientTo || theme.widgetBg})`;
  } else if (style === 'flat') {
    bg = theme.darkMode ? (theme.widgetBg || '#1e293b') : '#ffffff';
  } else {
    bg = theme.darkMode ? `${theme.widgetBg || '#1e293b'}ee` : `rgba(255,255,255,${op})`;
  }

  return {
    background: bg,
    borderRadius: radius,
    padding: '10px 12px',
    border: bw > 0 ? `${bw}px solid ${theme.borderColor}` : 'none',
    boxShadow: typeof shadow === 'string' ? shadow : (theme.darkMode ? shadow.dark : shadow.light),
    color: theme.textColor || '#2d2d2d',
    ...(theme.backdropBlur > 0 ? { backdropFilter: `blur(${theme.backdropBlur}px)`, WebkitBackdropFilter: `blur(${theme.backdropBlur}px)` } : {}),
    ...extra,
  };
};

// 공통 EmptyState 컴포넌트
function EmptyState({ icon, message, actionLabel, onAction, theme }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '16px 8px', gap: 8, height: '100%' }}>
      <span style={{ fontSize: 28, opacity: 0.6 }}>{icon}</span>
      <span style={{ fontSize: 11, color: theme?.textColor || '#9ca3af', textAlign: 'center', opacity: 0.7, lineHeight: 1.5 }}>{message}</span>
      {actionLabel && (
        <button onClick={onAction} style={{
          background: theme?.accentColor || '#f43f5e', color: '#fff', border: 'none',
          borderRadius: theme?.borderRadiusSm || 6, padding: '5px 14px',
          fontSize: 11, cursor: 'pointer', fontWeight: 600
        }}>{actionLabel}</button>
      )}
    </div>
  );
}

// ── 시계 (상단바 내장) ──────────────────────────────────────
function TopBarClock({ theme }) {
  const [time, setTime] = React.useState(new Date());
  React.useEffect(() => { const t = setInterval(() => setTime(new Date()), 1000); return () => clearInterval(t); }, []);
  const pad = n => String(n).padStart(2, '0');
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ fontSize: 18, fontWeight: 700, color: c(theme, '#1f2937', '#f1f5f9'), fontVariantNumeric: 'tabular-nums' }}>
        {pad(time.getHours())}:{pad(time.getMinutes())}
      </span>
      <span style={{ fontSize: 11, color: c(theme, '#9ca3af', '#64748b') }}>
        {time.getMonth()+1}/{time.getDate()} ({days[time.getDay()]})
      </span>
    </div>
  );
}

// ── 현재 교시 미니 (상단바용) ────────────────────────────────
function CurrentPeriodMini({ theme, schedule, timetable }) {
  const [now, setNow] = React.useState(new Date());
  React.useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);

  const periods = schedule?.periods || [];
  if (!periods.length) {
    return <span style={{ fontSize: 11, color: c(theme, '#9ca3af', '#64748b') }}>일과 시간표를 설정해 주세요</span>;
  }

  const mins = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
  const toMin = (t) => { if (!t || !t.includes(':')) return 0; const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  const current = periods.find(p => toMin(p.start) <= mins && mins < toMin(p.end));
  const next = periods.find(p => toMin(p.start) > mins);
  const pad = n => String(Math.floor(n)).padStart(2, '0');

  // 오늘 요일 → 시간표 키 (일/토 = null)
  const dayKeys = ['', 'mon', 'tue', 'wed', 'thu', 'fri'];
  const todayKey = dayKeys[now.getDay()] || null;
  const rawTT = (timetable && todayKey) ? (timetable[todayKey] || []) : [];
  const todayTT = Array.isArray(rawTT) ? rawTT : [];

  // 교시명 → 시간표 행 id 매핑 (1~3, 4A, 4B, 5~7)
  const getPeriodId = (name) => {
    if (!name) return null;
    if (name.includes('4교시A')) return '4A';
    if (name.includes('4교시B')) return '4B';
    const m = name.match(/^(\d)교시/);
    return m ? parseInt(m[1]) : null;
  };

  if (!current) {
    // 다음 교시가 있으면 "N분 후 OO" 표시
    const next = periods.find(p => toMin(p.start) > mins);
    if (next) {
      const untilMin = Math.ceil(toMin(next.start) - mins);
      return <span style={{ fontSize: 11, color: c(theme, '#9ca3af', '#64748b') }}>
        {untilMin <= 30 ? `${untilMin}분 후 ${next.name}` : '쉬는 시간'}
      </span>;
    }
    return <span style={{ fontSize: 11, color: c(theme, '#9ca3af', '#64748b') }}>일과 종료</span>;
  }

  const remainSec = Math.max(0, (toMin(current.end) - mins) * 60);
  const typeEmoji = { class: '📚', break: '☕', lunch: '🍽️', event: '📢', extra: '🌅', dinner: '🌙' };

  const periodId = getPeriodId(current.name);
  const currentEntry = periodId !== null ? todayTT.find(e => e?.period === periodId) : null;
  const subject = typeof currentEntry?.subject === 'string' ? currentEntry.subject : '';

  const nextPeriodId = next ? getPeriodId(next.name) : null;
  const nextEntry = nextPeriodId !== null ? todayTT.find(e => e?.period === nextPeriodId) : null;
  const nextSubject = typeof nextEntry?.subject === 'string' ? nextEntry.subject : '';

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: c(theme, '#dbeafe', '#1e3a5f'), borderRadius: 10, padding: '6px 16px' }}>
      <span style={{ fontSize: 16 }}>{typeEmoji[current.type] || '📚'}</span>
      <span style={{ fontSize: 14, fontWeight: 700, color: c(theme, '#1e40af', '#93c5fd') }}>
        {current.name}{subject ? ` · ${subject}` : ''}
      </span>
      <span style={{ fontSize: 12, color: c(theme, '#6b7280', '#94a3b8') }}>{current.start}~{current.end}</span>
      <span style={{ fontSize: 16, fontWeight: 700, color: c(theme, '#dc2626', '#f87171'), fontVariantNumeric: 'tabular-nums' }}>
        {pad(remainSec / 60)}:{pad(remainSec % 60)}
      </span>
      <span style={{ fontSize: 11, color: c(theme, '#9ca3af', '#64748b') }}>남음</span>
      {next && (
        <span style={{ fontSize: 11, color: c(theme, '#6b7280', '#64748b'), marginLeft: 4 }}>
          → {next.name}{nextSubject ? ` · ${nextSubject}` : ''} ({next.start})
        </span>
      )}
    </div>
  );
}

// ── D-Day 위젯 (할일 기한도 통합 표시) ──────────────────────
function DDayWidget() {
  const { state, actions } = useApp();
  const { theme, ddays, todos } = state;
  const [adding, setAdding] = React.useState(false);
  const [editId, setEditId] = React.useState(null);
  const [editLabel, setEditLabel] = React.useState('');
  const [editDate, setEditDate] = React.useState('');
  const wRef = useRef(null);
  const { mode } = useWidgetSize(wRef);
  const s = rs(mode);
  const startDdayEdit = (d) => { setEditId(d.id); setEditLabel(d.label); setEditDate(d.date); };
  const saveDdayEdit = (d) => { actions.updateDday({ ...d, label: editLabel, date: editDate }); setEditId(null); };
  const [form, setForm] = React.useState({ label: '', date: '', color: theme.accentColor });

  const calcDays = (dateStr) => {
    if (!dateStr) return null;
    const diff = new Date(dateStr) - new Date(new Date().toDateString());
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  };

  // D+3 이상 지난 D-Day 자동 삭제 (앱 시작 + 1시간마다)
  React.useEffect(() => {
    const cleanup = () => (ddays || []).forEach(d => {
      const days = calcDays(d.date);
      if (days !== null && days < -2) actions.deleteDday(d.id);
    });
    cleanup();
    const t = setInterval(cleanup, 3600000); // 1시간마다
    return () => clearInterval(t);
  }, [ddays]); // eslint-disable-line react-hooks/exhaustive-deps

  // D-Day + 기한 있는 할일을 합쳐서 날짜순 정렬
  const todosWithDue = (todos || []).filter(t => t.due && !t.done).map(t => ({
    id: 'todo-' + t.id, label: '✅ ' + t.text, date: t.due, color: '#f59e0b', isTodo: true
  }));
  const allItems = [...(ddays || []).filter(d => { const days = calcDays(d.date); return days === null || days >= -2; }), ...todosWithDue].sort((a, b) => {
    const da = calcDays(a.date) ?? 999;
    const db = calcDays(b.date) ?? 999;
    return da - db;
  });

  return (
    <div ref={wRef}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: s.gap }}>
        <span style={{ fontSize: s.fsMd, fontWeight: 600 }}>📅 D-Day</span>
        <button onClick={() => setAdding(true)} style={{ background: theme.accentColor, color: '#fff', border: 'none', borderRadius: 5, padding: `2px ${s.pad}px`, fontSize: s.fs, cursor: 'pointer' }}>+</button>
      </div>
      <div style={{ maxHeight: 200, overflowY: 'auto' }}>
        {allItems.map(d => {
          const days = calcDays(d.date);
          const urgent = days !== null && days >= 0 && days <= 3;
          const isPast = days !== null && days < 0;
          const isToday = days === 0;
          return (
            <div key={d.id} style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '4px 0',
              borderBottom: `0.5px solid ${theme.borderColor}`,
              opacity: isPast ? 0.55 : 1
            }}>
              <span style={{
                fontSize: 12, fontWeight: 700, minWidth: 46,
                color: isToday ? '#dc2626' : urgent ? '#ea580c' : isPast ? '#9ca3af' : (d.color || theme.accentColor),
                background: isToday ? '#fee2e2' : urgent ? '#fff7ed' : 'transparent',
                borderRadius: 4, padding: isToday || urgent ? '1px 4px' : '0'
              }}>
                {days === null ? '?' : isToday ? 'D-Day' : days > 0 ? `D-${days}` : `D+${Math.abs(days)}`}
              </span>
              {editId === d.id && !d.isTodo ? (
                <div style={{ flex: 1, display: 'flex', gap: 3 }}>
                  <input autoFocus value={editLabel} onChange={e => setEditLabel(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') saveDdayEdit(d); if (e.key === 'Escape') setEditId(null); }}
                    style={{ flex: 1, border: `1px solid ${theme.accentColor}`, borderRadius: 4, padding: '1px 4px', fontSize: 10, outline: 'none', fontFamily: 'inherit', background: c(theme,'#fff','#1e293b'), color: theme.textColor }} />
                  <input type="date" value={editDate} onChange={e => setEditDate(e.target.value)}
                    style={{ width: 90, border: `1px solid ${theme.borderColor}`, borderRadius: 4, padding: '1px 2px', fontSize: 9, outline: 'none', background: c(theme,'#fff','#1e293b'), color: theme.textColor }} />
                  <button onClick={() => saveDdayEdit(d)} style={{ background: theme.accentColor, color: '#fff', border: 'none', borderRadius: 3, padding: '1px 5px', fontSize: 9, cursor: 'pointer' }}>✓</button>
                </div>
              ) : (
                <span onClick={() => !d.isTodo && startDdayEdit(d)} title={d.isTodo ? '' : '클릭하여 수정'}
                  style={{
                    flex: 1, fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    textDecoration: isPast ? 'line-through' : 'none',
                    color: isPast ? c(theme, '#9ca3af', '#64748b') : 'inherit',
                    cursor: d.isTodo ? 'default' : 'text'
                  }}>{d.label}</span>
              )}
              {!d.isTodo && editId !== d.id && <button onClick={() => actions.deleteDday(d.id)} style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: 10 }}>✕</button>}
            </div>
          );
        })}
      </div>
      {allItems.length === 0 && !adding && <div style={{ textAlign: 'center', color: '#9ca3af', fontSize: 11, padding: '8px 0' }}>D-Day 또는 기한 있는 할일이 없습니다</div>}
      {adding && (
        <div style={{ marginTop: 6, background: c(theme, '#f9fafb', '#0f172a'), borderRadius: 8, padding: 8 }}>
          <input placeholder="이름 (예: 1차 지필고사)" value={form.label} onChange={e => setForm({ ...form, label: e.target.value })}
            style={{ width: '100%', border: `1px solid ${theme.borderColor}`, borderRadius: 6, padding: '5px 8px', fontSize: 12, marginBottom: 4, fontFamily: 'inherit', outline: 'none', background: c(theme, '#fff', '#1e293b'), color: theme.textColor }} />
          <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })}
            style={{ width: '100%', border: `1px solid ${theme.borderColor}`, borderRadius: 6, padding: '5px 8px', fontSize: 12, marginBottom: 4, fontFamily: 'inherit', outline: 'none', background: c(theme, '#fff', '#1e293b'), color: theme.textColor }} />
          <div style={{ display: 'flex', gap: 4 }}>
            <button onClick={() => { if (form.label && form.date) { actions.addDday(form); setAdding(false); setForm({ label: '', date: '', color: theme.accentColor }); } }}
              style={{ flex: 1, background: theme.accentColor, color: '#fff', border: 'none', borderRadius: 5, padding: '5px', fontSize: 11, cursor: 'pointer' }}>저장</button>
            <button onClick={() => setAdding(false)} style={{ flex: 1, background: c(theme, '#e5e7eb', '#334155'), color: c(theme, '#6b7280', '#94a3b8'), border: 'none', borderRadius: 5, padding: '5px', fontSize: 11, cursor: 'pointer' }}>취소</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── 할 일 위젯 (기한 입력 포함) ─────────────────────────────
function TodoWidget() {
  const { state, actions } = useApp();
  const { theme, todos } = state;
  const [input, setInput] = React.useState('');
  const [due, setDue] = React.useState('');
  const [editId, setEditId] = React.useState(null);
  const [editText, setEditText] = React.useState('');
  const [undoItem, setUndoItem] = React.useState(null); // 삭제 되돌리기
  const wRef = useRef(null);
  const { mode } = useWidgetSize(wRef);
  const s = rs(mode);
  const add = () => { if (!input.trim()) return; actions.addTodo({ text: input.trim(), done: false, due: due || '' }); setInput(''); setDue(''); };
  const deleteTodo = (t) => { setUndoItem(t); actions.deleteTodo(t.id); setTimeout(() => setUndoItem(null), 5000); };
  const undoDelete = () => { if (undoItem) { actions.addTodo(undoItem); setUndoItem(null); } };
  const startEdit = (t) => { setEditId(t.id); setEditText(t.text); };
  const saveEdit = (t) => { actions.updateTodo({ ...t, text: editText }); setEditId(null); };

  return (
    <div ref={wRef}>
      <div style={{ fontSize: s.fsMd, fontWeight: 600, marginBottom: s.gap + 2 }}>
        ✅ 할 일
        {todos.filter(t => !t.done).length > 0 && (
          <span style={{ marginLeft: 6, background: '#fee2e2', color: '#dc2626', fontSize: s.fs - 1, padding: '1px 6px', borderRadius: 8 }}>{todos.filter(t => !t.done).length}</span>
        )}
      </div>
      <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
        <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()}
          placeholder="할 일 입력"
          style={{ flex: 1, border: `1px solid ${theme.borderColor}`, borderRadius: 6, padding: '5px 8px', fontSize: 12, outline: 'none', fontFamily: 'inherit', background: c(theme, '#fff', '#0f172a'), color: theme.textColor }} />
        <input type="date" value={due} onChange={e => setDue(e.target.value)} title="기한 (선택)"
          style={{ width: 110, border: `1px solid ${theme.borderColor}`, borderRadius: 6, padding: '3px 4px', fontSize: 10, outline: 'none', fontFamily: 'inherit', background: c(theme, '#fff', '#0f172a'), color: theme.textColor }} />
        <button onClick={add} style={{ background: theme.accentColor, color: '#fff', border: 'none', borderRadius: 6, padding: '5px 10px', cursor: 'pointer', fontSize: 12 }}>+</button>
      </div>
      <div style={{ maxHeight: 200, overflowY: 'auto' }}>
        {todos.map(t => (
          <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 0', borderBottom: `0.5px solid ${theme.borderColor}` }}>
            <button onClick={() => actions.updateTodo({ ...t, done: !t.done })}
              style={{ width: 15, height: 15, borderRadius: 4, border: `1.5px solid ${t.done ? theme.accentColor : c(theme, '#d1d5db', '#475569')}`, background: t.done ? theme.accentColor : 'transparent', cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>
              {t.done && <span style={{ color: '#fff', fontSize: 9 }}>✓</span>}
            </button>
            {editId === t.id ? (
              <input autoFocus value={editText} onChange={e => setEditText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') saveEdit(t); if (e.key === 'Escape') setEditId(null); }}
                onBlur={() => saveEdit(t)}
                style={{ flex: 1, border: `1px solid ${theme.accentColor}`, borderRadius: 4, padding: '2px 6px', fontSize: 11, outline: 'none', fontFamily: 'inherit', background: c(theme,'#fff','#1e293b'), color: theme.textColor }} />
            ) : (
              <span onDoubleClick={() => startEdit(t)}
                title="더블클릭하여 수정"
                style={{ flex: 1, fontSize: 11, color: t.done ? '#9ca3af' : theme.textColor, textDecoration: t.done ? 'line-through' : 'none', cursor: 'text' }}>{t.text}</span>
            )}
            {t.due && typeof t.due === 'string' && t.due.length >= 5 && <span style={{ fontSize: 9, color: '#f59e0b', background: '#fef3c7', borderRadius: 4, padding: '1px 4px', flexShrink: 0 }}>{t.due.slice(5)}</span>}
            <button onClick={() => deleteTodo(t)} style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: 10 }}>✕</button>
          </div>
        ))}
      </div>
      {/* 삭제 되돌리기 */}
      {undoItem && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#fef3c7', borderRadius: 6, padding: '4px 8px', marginTop: 4, fontSize: 10 }}>
          <span style={{ flex: 1, color: '#92400e' }}>"{undoItem.text}" 삭제됨</span>
          <button onClick={undoDelete} style={{ background: '#f59e0b', color: '#fff', border: 'none', borderRadius: 4, padding: '2px 8px', fontSize: 10, cursor: 'pointer', fontWeight: 600 }}>되돌리기</button>
        </div>
      )}
      {todos.some(t => t.done) && (
        <button onClick={() => todos.filter(t => t.done).forEach(t => actions.deleteTodo(t.id))}
          style={{ width: '100%', background: c(theme,'#f3f4f6','#334155'), border: 'none', borderRadius: 6, padding: '4px', fontSize: 10, cursor: 'pointer', color: c(theme,'#9ca3af','#64748b'), marginTop: 4 }}>
          🗑 완료 항목 정리 ({todos.filter(t => t.done).length}개)
        </button>
      )}
    </div>
  );
}

// ── 메모 위젯 ───────────────────────────────────────────────
function MemoWidget() {
  const { state, actions } = useApp();
  const wRef = useRef(null);
  const { mode } = useWidgetSize(wRef);
  const s = rs(mode);
  const { theme, memos } = state;
  const [activeIdx, setActiveIdx] = React.useState(0);
  const memo = (memos || [])[activeIdx];
  const [text, setText] = React.useState(memo?.text || '');

  // 메모 탭 변경 시 텍스트 동기화
  React.useEffect(() => {
    setText((memos || [])[activeIdx]?.text || '');
  }, [activeIdx, memos]);

  const save = (val) => {
    setText(val);
    if (memo?.id) actions.updateMemo({ id: memo.id, text: val });
    else if (val) { actions.addMemo({ text: val }); }
  };
  const addNew = () => { actions.addMemo({ text: '' }); setActiveIdx((memos || []).length); };
  const deleteCurrent = () => {
    if (memo?.id) actions.deleteMemo(memo.id);
    setActiveIdx(Math.max(0, activeIdx - 1));
  };

  return (
    <div ref={wRef} style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 4, flexShrink: 0, gap: 4 }}>
        <span style={{ fontSize: s.fsMd, fontWeight: 600 }}>📝 메모</span>
        {(memos || []).length > 1 && (memos || []).map((m, i) => (
          <button key={m.id || i} onClick={() => setActiveIdx(i)}
            style={{ width: 18, height: 18, borderRadius: 4, border: `1px solid ${i === activeIdx ? theme.accentColor : theme.borderColor}`, background: i === activeIdx ? theme.accentColor + '20' : 'transparent', fontSize: 9, cursor: 'pointer', color: i === activeIdx ? theme.accentColor : c(theme,'#9ca3af','#64748b') }}>
            {i + 1}
          </button>
        ))}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 2 }}>
          <button onClick={addNew} title="새 메모" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: theme.accentColor }}>+</button>
          {(memos || []).length > 1 && <button onClick={deleteCurrent} title="이 메모 삭제" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 10, color: '#9ca3af' }}>✕</button>}
        </div>
      </div>
      <textarea value={text} onChange={e => save(e.target.value)} placeholder="메모..."
        style={{ width: '100%', flex: 1, minHeight: 60, border: `1px solid ${theme.borderColor}`, borderRadius: 6, padding: '6px 8px', fontSize: s.fs, resize: 'none', fontFamily: 'inherit', outline: 'none', background: c(theme, '#fafafa', '#0f172a'), color: theme.textColor, lineHeight: 1.5, boxSizing: 'border-box' }} />
    </div>
  );
}

// ── 시계 위젯 ──────────────────────────────────────────────
function ClockWidget({ theme }) {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  const h = now.getHours().toString().padStart(2, '0');
  const m = now.getMinutes().toString().padStart(2, '0');
  const s = now.getSeconds().toString().padStart(2, '0');
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  const dateStr = `${now.getMonth() + 1}월 ${now.getDate()}일 (${days[now.getDay()]})`;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 4 }}>
      <div style={{ fontSize: 36, fontWeight: 700, letterSpacing: 2, color: theme.accentColor, fontVariantNumeric: 'tabular-nums' }}>{h}:{m}</div>
      <div style={{ fontSize: 18, fontWeight: 400, color: c(theme, '#9ca3af', '#94a3b8'), letterSpacing: 1 }}>{s}</div>
      <div style={{ fontSize: 12, color: theme.textColor, opacity: 0.7 }}>{dateStr}</div>
    </div>
  );
}

// ── 현재 교시 위젯 ──────────────────────────────────────────
function CurrentPeriodWidget({ theme, schedule }) {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 10000);
    return () => clearInterval(t);
  }, []);
  const hhmm = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
  const toMin = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  const nowMin = toMin(hhmm);
  const periods = schedule?.periods || [];
  const cur = periods.find(p => nowMin >= toMin(p.start) && nowMin < toMin(p.end));
  const next = periods.find(p => toMin(p.start) > nowMin);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '4px 0' }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: theme.accentColor }}>현재 교시</div>
      {cur ? (
        <div style={{ background: theme.accentColor + '20', borderRadius: 8, padding: '8px 12px' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: theme.accentColor }}>{cur.name}</div>
          <div style={{ fontSize: 11, color: theme.textColor, opacity: 0.7 }}>{cur.start} ~ {cur.end}</div>
        </div>
      ) : (
        <div style={{ fontSize: 12, color: '#9ca3af' }}>수업 없음</div>
      )}
      {next && (
        <div style={{ fontSize: 11, color: theme.textColor, opacity: 0.6 }}>다음: {next.name} {next.start}</div>
      )}
    </div>
  );
}

// ── 시스템 위젯 ─────────────────────────────────────────────
function SystemWidget() {
  const { state } = useApp();
  const { theme } = state;
  return (
    <div>
      <div style={{ display: 'flex', gap: 4 }}>
        <button onClick={() => window.electronAPI?.system?.lock()} style={{ flex: 1, background: c(theme, '#f3f4f6', '#334155'), border: 'none', borderRadius: 7, padding: '6px', fontSize: 11, cursor: 'pointer', color: theme.textColor }}>🔒 잠금</button>
        <button onClick={() => window.electronAPI?.system?.sleep()} style={{ flex: 1, background: c(theme, '#f3f4f6', '#334155'), border: 'none', borderRadius: 7, padding: '6px', fontSize: 11, cursor: 'pointer', color: theme.textColor }}>💤 절전</button>
      </div>
    </div>
  );
}

// ── 최근 문서 위젯 ──────────────────────────────────────────
function RecentFiles({ theme }) {
  const [files, setFiles] = useState([]);

  useEffect(() => {
    async function load() {
      if (window.electronAPI?.desktop?.getFiles) {
        const all = await window.electronAPI.desktop.getFiles();
        // 폴더 제외, 파일만 표시
        setFiles((all || []).filter(f => !f.isDir).slice(0, 12));
      }
    }
    load();
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, []);

  const getIcon = (name) => {
    const ext = name.split('.').pop()?.toLowerCase();
    const icons = { pdf: '📄', doc: '📝', docx: '📝', xls: '📊', xlsx: '📊', ppt: '📎', pptx: '📎', hwp: '📝', txt: '📃', jpg: '🖼️', png: '🖼️', mp4: '🎬', zip: '📦' };
    return icons[ext] || '📄';
  };

  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>📂 최근 저장된 문서</div>
      {files.length === 0 ? (
        <div style={{ fontSize: 11, color: '#9ca3af', textAlign: 'center', padding: '8px 0' }}>Electron 앱에서 표시됩니다</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(70px, 1fr))', gap: 6 }}>
          {files.map((f, i) => (
            <div key={i} onClick={() => window.electronAPI?.shell?.openPath(f.path)}
              title={f.name}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, padding: '8px 4px', borderRadius: 8, cursor: 'pointer', fontSize: 10, overflow: 'hidden', textAlign: 'center' }}
              onMouseEnter={e => e.currentTarget.style.background = c(theme, '#f3f4f6', '#334155')}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <span style={{ fontSize: 28, flexShrink: 0 }}>{getIcon(f.name)}</span>
              <span style={{ width: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: c(theme, '#374151', '#e2e8f0'), fontSize: 9 }}>{f.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── 오늘의 명언 위젯 ────────────────────────────────────────
const QUOTES = [
  { text: '가르치는 것은 두 번 배우는 것이다.', author: '주베르' },
  { text: '교육은 미래를 위한 가장 강력한 무기이다.', author: '넬슨 만델라' },
  { text: '배움에는 왕도가 없다.', author: '유클리드' },
  { text: '오늘 할 수 있는 일을 내일로 미루지 마라.', author: '벤저민 프랭클린' },
  { text: '천 리 길도 한 걸음부터.', author: '노자' },
  { text: '실패는 성공의 어머니이다.', author: '속담' },
  { text: '꿈을 크게 가져라.', author: '괴테' },
  { text: '좋은 교사는 희망을 불어넣는다.', author: '브래드 헨리' },
  { text: '매일 조금씩 나아지면 된다.', author: '존 우든' },
  { text: '학생의 눈높이에서 생각하라.', author: '교육 격언' },
  { text: '변화를 원한다면 스스로 변화가 되어라.', author: '간디' },
  { text: '행복은 습관이다.', author: '허버드' },
  { text: '노력은 배신하지 않는다.', author: '격언' },
  { text: '시작이 반이다.', author: '아리스토텔레스' },
  { text: '위대한 일은 작은 일들이 모여 이루어진다.', author: '빈센트 반 고흐' },
  { text: '할 수 있다고 믿으면 이미 반은 이룬 것이다.', author: '시어도어 루스벨트' },
  { text: '오늘이 인생에서 가장 젊은 날이다.', author: '격언' },
  { text: '준비된 자에게 기회가 온다.', author: '파스퇴르' },
  { text: '어제보다 나은 오늘을 만들자.', author: '격언' },
  { text: '꾸준함이 천재를 이긴다.', author: '격언' },
  { text: '작은 차이가 큰 결과를 만든다.', author: '격언' },
  { text: '열정 없이 이루어진 위대한 일은 없다.', author: '헤겔' },
  { text: '가장 좋은 시간은 바로 지금이다.', author: '격언' },
  { text: '배움은 끝이 없다.', author: '격언' },
  { text: '성공은 매일 반복한 작은 노력의 합이다.', author: '로버트 콜리어' },
  { text: '실수에서 배우는 자가 현명한 자이다.', author: '키케로' },
  { text: '인내는 쓰지만 그 열매는 달다.', author: '장자크 루소' },
  { text: '지식은 힘이다.', author: '프랜시스 베이컨' },
  { text: '미래는 오늘 우리가 무엇을 하느냐에 달려 있다.', author: '간디' },
  { text: '한 번도 실수한 적 없는 사람은 새로운 것을 시도한 적 없는 사람이다.', author: '아인슈타인' },
  { text: '기회는 일어나는 것이 아니라 만들어가는 것이다.', author: '크리스 그로서' },
  { text: '큰일을 하려면 작은 일부터 시작하라.', author: '격언' },
  { text: '나 자신에 대한 자신감을 잃으면 온 세상이 나의 적이 된다.', author: '에머슨' },
  { text: '습관이 운명을 결정한다.', author: '격언' },
  { text: '오늘 하루도 감사합니다.', author: '격언' },
  { text: '긍정적인 생각이 긍정적인 결과를 만든다.', author: '격언' },
  { text: '교사의 영향은 영원하다.', author: '헨리 애덤스' },
  { text: '진정한 교육은 마음을 여는 것이다.', author: '말콤 포브스' },
  { text: '아이들은 우리가 가르치는 것이 아니라 우리가 되는 것을 배운다.', author: '제임스 볼드윈' },
  { text: '가장 훌륭한 교사는 아이의 마음에서 가르친다.', author: '격언' },
  { text: '교실에서 세상을 바꿀 수 있다.', author: '격언' },
  { text: '칭찬은 고래도 춤추게 한다.', author: '격언' },
  { text: '오늘 읽은 책이 내일의 나를 만든다.', author: '격언' },
  { text: '매일 한 가지씩 새로운 것을 배워라.', author: '격언' },
  { text: '포기만 하지 않으면 된다.', author: '격언' },
  { text: '웃으면 복이 온다.', author: '속담' },
  { text: '느리더라도 꾸준히 가는 자가 이긴다.', author: '이솝' },
  { text: '오늘의 수고가 내일의 열매가 된다.', author: '격언' },
  { text: '사람은 생각하는 대로 된다.', author: '붓다' },
  { text: '작은 친절이 세상을 바꾼다.', author: '격언' },
];

// ── 교사 습관 트래커 위젯 ────────────────────────────────────
const DEFAULT_HABITS = [
  { id: 1, label: '📋 출석 체크', done: false },
  { id: 2, label: '📝 수업 일지 작성', done: false },
  { id: 3, label: '✅ 할 일 정리', done: false },
];
function HabitTrackerWidget({ theme }) {
  const [habits, setHabits] = useState(() => {
    const loaded = loadLS('habit:items', DEFAULT_HABITS);
    return loaded.length ? loaded : DEFAULT_HABITS;
  });
  const [streak, setStreak] = useState(() => {
    const n = parseInt(loadLS('habit:streak', 0), 10);
    return Number.isFinite(n) ? n : 0;
  });
  const [adding, setAdding] = useState(false);
  const [newLabel, setNewLabel] = useState('');

  // 날짜 변경 시 리셋 (로컬 시간대 기준)
  useEffect(() => {
    const todayKey = getTodayKey();
    const lastDate = loadLS('habit:last-date', '');
    if (lastDate && lastDate !== todayKey) {
      setHabits(prev => {
        const allDone = prev.every(h => h.done);
        setStreak(s => {
          const ns = allDone ? s + 1 : 0;
          saveLS('habit:streak', ns);
          return ns;
        });
        const reset = prev.map(h => ({ ...h, done: false }));
        saveLS('habit:items', reset);
        return reset;
      });
    }
    if (lastDate !== todayKey) saveLS('habit:last-date', todayKey);
  }, []); // 마운트 시 1회만

  const updateHabits = (updated) => { setHabits(updated); saveLS('habit:items', updated); };
  const toggle = (id) => updateHabits(habits.map(h => h.id === id ? { ...h, done: !h.done } : h));
  const addHabit = () => {
    if (!newLabel.trim()) return;
    updateHabits([...habits, { id: Date.now(), label: newLabel.trim(), done: false }]);
    setNewLabel(''); setAdding(false);
  };
  const removeHabit = (id) => updateHabits(habits.filter(h => h.id !== id));
  const doneCount = habits.filter(h => h.done).length;

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 600 }}>🔥 오늘의 루틴</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {streak > 0 && <span style={{ fontSize: 10, color: '#f59e0b', fontWeight: 700 }}>{streak}일 연속🔥</span>}
          <span style={{ fontSize: 10, color: c(theme,'#9ca3af','#64748b') }}>{doneCount}/{habits.length}</span>
        </div>
      </div>
      <div style={{ height: 4, background: c(theme,'#f3f4f6','#334155'), borderRadius: 2, marginBottom: 6, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${habits.length ? (doneCount / habits.length) * 100 : 0}%`, background: doneCount === habits.length ? '#10b981' : theme.accentColor, borderRadius: 2, transition: 'width 0.3s' }} />
      </div>
      <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 3 }}>
        {habits.map(h => (
          <div key={h.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 6px', borderRadius: 6, background: h.done ? c(theme,'#d1fae5','#064e3b') + '40' : 'transparent' }}>
            <button onClick={() => toggle(h.id)}
              style={{ width: 16, height: 16, borderRadius: 4, border: `1.5px solid ${h.done ? '#10b981' : c(theme,'#d1d5db','#475569')}`, background: h.done ? '#10b981' : 'transparent', cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>
              {h.done && <span style={{ color: '#fff', fontSize: 9 }}>✓</span>}
            </button>
            <span style={{ flex: 1, fontSize: 11, color: h.done ? '#10b981' : theme.textColor, textDecoration: h.done ? 'line-through' : 'none' }}>{h.label}</span>
            <button onClick={() => removeHabit(h.id)} style={{ background: 'none', border: 'none', color: c(theme,'#9ca3af','#64748b'), cursor: 'pointer', fontSize: 9, opacity: 0.5 }}>✕</button>
          </div>
        ))}
      </div>
      {adding ? (
        <div style={{ display: 'flex', gap: 3, marginTop: 4 }}>
          <input autoFocus value={newLabel} onChange={e => setNewLabel(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') addHabit(); if (e.key === 'Escape') setAdding(false); }}
            placeholder="습관 이름" style={{ flex: 1, border: `1px solid ${theme.borderColor}`, borderRadius: 5, padding: '3px 6px', fontSize: 10, outline: 'none', fontFamily: 'inherit', background: c(theme,'#fff','#0f172a'), color: theme.textColor }} />
          <button onClick={addHabit} style={{ background: theme.accentColor, color: '#fff', border: 'none', borderRadius: 4, padding: '2px 8px', fontSize: 10, cursor: 'pointer' }}>추가</button>
        </div>
      ) : (
        <button onClick={() => setAdding(true)} style={{ width: '100%', background: c(theme,'#f3f4f6','#334155'), border: 'none', borderRadius: 5, padding: '3px', fontSize: 10, cursor: 'pointer', color: c(theme,'#9ca3af','#64748b'), marginTop: 4 }}>+ 습관 추가</button>
      )}
    </div>
  );
}

// ── 출석 빠른 입력 위젯 ──────────────────────────────────────
const ATTENDANCE_STATES = [
  { id: 'present', label: '출석', color: '#10b981', emoji: '✅' },
  { id: 'late', label: '지각', color: '#f59e0b', emoji: '⏰' },
  { id: 'absent', label: '결석', color: '#ef4444', emoji: '❌' },
  { id: 'early', label: '조퇴', color: '#8b5cf6', emoji: '🏃' },
];
function AttendanceWidget({ theme }) {
  const [todayKey, setTodayKey] = useState(getTodayKey);
  const [students, setStudents] = useState(() => loadLS('attendance:students', []));
  const [attendance, setAttendance] = useState(() => loadLS(`attendance:day:${todayKey}`, {}));
  const [adding, setAdding] = useState(false);
  const [input, setInput] = useState('');

  // 날짜 변경 감지 (자정 넘어가면 새 키로 로드) + 90일 전 키 정리
  useEffect(() => {
    const tick = () => {
      const now = getTodayKey();
      if (now !== todayKey) {
        setTodayKey(now);
        setAttendance(loadLS(`attendance:day:${now}`, {}));
      }
    };
    const t = setInterval(tick, 60000);
    // 90일 이상 된 attendance 키 정리 (마운트 시 1회)
    try {
      const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 90);
      const cutoffKey = `${cutoff.getFullYear()}-${String(cutoff.getMonth()+1).padStart(2,'0')}-${String(cutoff.getDate()).padStart(2,'0')}`;
      Object.keys(localStorage).forEach(k => {
        if (k.startsWith('attendance:day:') && k.slice(15) < cutoffKey) localStorage.removeItem(k);
      });
    } catch {}
    return () => clearInterval(t);
  }, [todayKey]);

  const toggleState = (name) => {
    const current = attendance[name] || 'present';
    const idx = Math.max(0, ATTENDANCE_STATES.findIndex(s => s.id === current));
    const next = ATTENDANCE_STATES[(idx + 1) % ATTENDANCE_STATES.length].id;
    const updated = { ...attendance, [name]: next };
    setAttendance(updated);
    saveLS(`attendance:day:${todayKey}`, updated);
  };
  const addStudents = () => {
    if (!input.trim()) return;
    const newNames = input.split(/[,\n]/).map(n => n.trim()).filter(Boolean);
    const updated = [...new Set([...students, ...newNames])];
    setStudents(updated);
    saveLS('attendance:students', updated);
    setInput(''); setAdding(false);
  };
  const clearStudents = () => { setStudents([]); localStorage.removeItem('attendance:students'); };

  const counts = ATTENDANCE_STATES.map(s => ({ ...s, count: Object.values(attendance).filter(v => v === s.id).length }));
  const presentCount = students.length - (counts.find(cs => cs.id === 'absent')?.count || 0);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 600 }}>📋 출석</span>
        <span style={{ fontSize: 10, color: c(theme,'#9ca3af','#64748b') }}>{presentCount}/{students.length}명 출석</span>
      </div>
      {students.length > 0 && (
        <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
          {counts.filter(cs => cs.count > 0).map(cs => (
            <span key={cs.id} style={{ fontSize: 9, color: cs.color, background: cs.color + '15', borderRadius: 4, padding: '1px 5px' }}>{cs.emoji}{cs.count}</span>
          ))}
        </div>
      )}
      {students.length === 0 ? (
        <EmptyState icon="📋" message="학생 명단을 등록하세요" actionLabel="+ 명단 추가" onAction={() => setAdding(true)} theme={theme} />
      ) : (
        <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {students.map(name => {
            const state = ATTENDANCE_STATES.find(s => s.id === (attendance[name] || 'present')) || ATTENDANCE_STATES[0];
            return (
              <div key={name} onClick={() => toggleState(name)}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 6px', borderRadius: 5, cursor: 'pointer', background: state.id !== 'present' ? state.color + '10' : 'transparent' }}>
                <span style={{ fontSize: 11, width: 16 }}>{state.emoji}</span>
                <span style={{ flex: 1, fontSize: 11, color: theme.textColor }}>{name}</span>
                <span style={{ fontSize: 9, color: state.color }}>{state.label}</span>
              </div>
            );
          })}
        </div>
      )}
      {adding && (
        <div style={{ marginTop: 4 }}>
          <textarea value={input} onChange={e => setInput(e.target.value)} placeholder="학생 이름 (쉼표 또는 줄바꿈으로 구분)"
            style={{ width: '100%', height: 50, border: `1px solid ${theme.borderColor}`, borderRadius: 5, padding: '4px 6px', fontSize: 10, resize: 'none', fontFamily: 'inherit', outline: 'none', background: c(theme,'#fff','#0f172a'), color: theme.textColor, boxSizing: 'border-box' }} />
          <div style={{ display: 'flex', gap: 3, marginTop: 3 }}>
            <button onClick={addStudents} style={{ flex: 1, background: theme.accentColor, color: '#fff', border: 'none', borderRadius: 4, padding: '3px', fontSize: 10, cursor: 'pointer' }}>등록</button>
            <button onClick={() => setAdding(false)} style={{ background: c(theme,'#e5e7eb','#334155'), border: 'none', borderRadius: 4, padding: '3px 8px', fontSize: 10, cursor: 'pointer', color: c(theme,'#6b7280','#94a3b8') }}>취소</button>
          </div>
        </div>
      )}
      {students.length > 0 && !adding && (
        <div style={{ display: 'flex', gap: 3, marginTop: 4 }}>
          <button onClick={() => setAdding(true)} style={{ flex: 1, background: c(theme,'#f3f4f6','#334155'), border: 'none', borderRadius: 4, padding: '3px', fontSize: 9, cursor: 'pointer', color: c(theme,'#9ca3af','#64748b') }}>+ 추가</button>
          <button onClick={clearStudents} style={{ background: c(theme,'#f3f4f6','#334155'), border: 'none', borderRadius: 4, padding: '3px 6px', fontSize: 9, cursor: 'pointer', color: c(theme,'#9ca3af','#64748b') }}>초기화</button>
        </div>
      )}
    </div>
  );
}

// ── 수업 준비 체크리스트 위젯 ─────────────────────────────────
function LessonPrepWidget({ theme }) {
  const [todayKey, setTodayKey] = useState(getTodayKey);
  const [items, setItems] = useState(() => loadLS(`lesson-prep:${todayKey}`, []));
  const [input, setInput] = useState('');

  // 날짜 감지 + 오래된 키 정리
  useEffect(() => {
    const tick = () => {
      const now = getTodayKey();
      if (now !== todayKey) {
        setTodayKey(now);
        setItems(loadLS(`lesson-prep:${now}`, []));
      }
    };
    const t = setInterval(tick, 60000);
    try {
      const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 30);
      const cutoffKey = `${cutoff.getFullYear()}-${String(cutoff.getMonth()+1).padStart(2,'0')}-${String(cutoff.getDate()).padStart(2,'0')}`;
      Object.keys(localStorage).forEach(k => {
        if (k.startsWith('lesson-prep:') && k.slice(12) < cutoffKey) localStorage.removeItem(k);
      });
    } catch {}
    return () => clearInterval(t);
  }, [todayKey]);

  const save = (data) => { setItems(data); saveLS(`lesson-prep:${todayKey}`, data); };
  const add = () => { if (!input.trim()) return; save([...items, { id: Date.now(), text: input.trim(), done: false }]); setInput(''); };
  const toggle = (id) => save(items.map(i => i.id === id ? { ...i, done: !i.done } : i));
  const remove = (id) => save(items.filter(i => i.id !== id));
  const doneCount = items.filter(i => i.done).length;

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 600 }}>📦 수업 준비</span>
        {items.length > 0 && <span style={{ fontSize: 10, color: doneCount === items.length ? '#10b981' : c(theme,'#9ca3af','#64748b') }}>{doneCount}/{items.length}</span>}
      </div>
      <div style={{ display: 'flex', gap: 3, marginBottom: 4 }}>
        <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()}
          placeholder="준비물 추가..." style={{ flex: 1, border: `1px solid ${theme.borderColor}`, borderRadius: 5, padding: '3px 6px', fontSize: 10, outline: 'none', fontFamily: 'inherit', background: c(theme,'#fff','#0f172a'), color: theme.textColor }} />
        <button onClick={add} style={{ background: theme.accentColor, color: '#fff', border: 'none', borderRadius: 4, padding: '3px 8px', fontSize: 10, cursor: 'pointer' }}>+</button>
      </div>
      <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
        {items.map(item => (
          <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 4px' }}>
            <button onClick={() => toggle(item.id)}
              style={{ width: 14, height: 14, borderRadius: 3, border: `1.5px solid ${item.done ? '#10b981' : c(theme,'#d1d5db','#475569')}`, background: item.done ? '#10b981' : 'transparent', cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>
              {item.done && <span style={{ color: '#fff', fontSize: 8 }}>✓</span>}
            </button>
            <span style={{ flex: 1, fontSize: 11, color: item.done ? c(theme,'#9ca3af','#64748b') : theme.textColor, textDecoration: item.done ? 'line-through' : 'none' }}>{item.text}</span>
            <button onClick={() => remove(item.id)} style={{ background: 'none', border: 'none', color: c(theme,'#9ca3af','#64748b'), cursor: 'pointer', fontSize: 9 }}>✕</button>
          </div>
        ))}
        {items.length === 0 && <div style={{ textAlign: 'center', color: c(theme,'#9ca3af','#64748b'), fontSize: 10, padding: '8px 0' }}>오늘 수업에 필요한 준비물을 추가하세요</div>}
      </div>
    </div>
  );
}

// ── 학부모 연락 로그 위젯 ────────────────────────────────────
const CONTACT_METHODS = ['전화', '문자', '면담', '기타'];
const PARENT_LOG_MAX = 500; // 무제한 증가 방지
function ParentLogWidget({ theme }) {
  const [logs, setLogs] = useState(() => loadLS('parent:logs', []));
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ student: '', method: CONTACT_METHODS[0], content: '' });
  const [search, setSearch] = useState('');

  const save = (data) => {
    const capped = data.slice(0, PARENT_LOG_MAX);
    setLogs(capped);
    saveLS('parent:logs', capped);
  };
  const addLog = () => {
    if (!form.student.trim() || !form.content.trim()) return;
    save([{ id: Date.now(), date: getTodayKey(), ...form }, ...logs]);
    setForm({ student: '', method: CONTACT_METHODS[0], content: '' }); setAdding(false);
  };
  const removeLog = (id) => save(logs.filter(l => l.id !== id));
  const filtered = search ? logs.filter(l => l.student.includes(search) || l.content.includes(search)) : logs;

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 600 }}>📞 학부모 연락</span>
        <button onClick={() => setAdding(!adding)} style={{ background: theme.accentColor, color: '#fff', border: 'none', borderRadius: 4, padding: '1px 6px', fontSize: 10, cursor: 'pointer' }}>+</button>
      </div>
      {adding && (
        <div style={{ background: c(theme,'#f9fafb','#0f172a'), borderRadius: 6, padding: 6, marginBottom: 4, display: 'flex', flexDirection: 'column', gap: 3 }}>
          <input value={form.student} onChange={e => setForm({ ...form, student: e.target.value })} placeholder="학생 이름"
            style={{ border: `1px solid ${theme.borderColor}`, borderRadius: 4, padding: '3px 6px', fontSize: 10, outline: 'none', fontFamily: 'inherit', background: c(theme,'#fff','#1e293b'), color: theme.textColor }} />
          <div style={{ display: 'flex', gap: 3 }}>
            {CONTACT_METHODS.map(m => (
              <button key={m} onClick={() => setForm({ ...form, method: m })}
                style={{ flex: 1, padding: '2px', borderRadius: 4, border: 'none', cursor: 'pointer', fontSize: 9, background: form.method === m ? theme.accentColor : c(theme,'#e5e7eb','#334155'), color: form.method === m ? '#fff' : c(theme,'#6b7280','#94a3b8') }}>{m}</button>
            ))}
          </div>
          <input value={form.content} onChange={e => setForm({ ...form, content: e.target.value })} placeholder="내용 요약"
            onKeyDown={e => e.key === 'Enter' && addLog()}
            style={{ border: `1px solid ${theme.borderColor}`, borderRadius: 4, padding: '3px 6px', fontSize: 10, outline: 'none', fontFamily: 'inherit', background: c(theme,'#fff','#1e293b'), color: theme.textColor }} />
          <button onClick={addLog} style={{ background: theme.accentColor, color: '#fff', border: 'none', borderRadius: 4, padding: '3px', fontSize: 10, cursor: 'pointer' }}>저장</button>
        </div>
      )}
      {logs.length > 3 && (
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 검색..."
          style={{ border: `1px solid ${theme.borderColor}`, borderRadius: 4, padding: '3px 6px', fontSize: 10, marginBottom: 4, outline: 'none', fontFamily: 'inherit', background: c(theme,'#fff','#0f172a'), color: theme.textColor }} />
      )}
      <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 3 }}>
        {filtered.length === 0 && <div style={{ textAlign: 'center', color: c(theme,'#9ca3af','#64748b'), fontSize: 10, padding: '8px 0' }}>연락 기록이 없습니다</div>}
        {filtered.slice(0, 20).map(l => (
          <div key={l.id} style={{ padding: '4px 6px', borderRadius: 5, background: c(theme,'#f9fafb','#1e293b'), borderLeft: `3px solid ${theme.accentColor}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 10, fontWeight: 600, color: theme.textColor }}>{l.student}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                <span style={{ fontSize: 8, color: c(theme,'#9ca3af','#64748b') }}>{l.date} · {l.method}</span>
                <button onClick={() => removeLog(l.id)} style={{ background: 'none', border: 'none', color: c(theme,'#9ca3af','#64748b'), cursor: 'pointer', fontSize: 8 }}>✕</button>
              </div>
            </div>
            <div style={{ fontSize: 10, color: c(theme,'#6b7280','#94a3b8'), marginTop: 2 }}>{l.content}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── 성적 빠른 입력 위젯 ──────────────────────────────────────
function GradeInputWidget({ theme }) {
  const [exams, setExams] = useState(() => loadLS('grade:exams', []));
  const [activeExamIdx, setActiveExamIdx] = useState(0);
  const [adding, setAdding] = useState(false);
  const [examName, setExamName] = useState('');
  const [addingStudent, setAddingStudent] = useState(false);
  const [newStudentName, setNewStudentName] = useState('');

  const save = (data) => { setExams(data); saveLS('grade:exams', data); };
  const addExam = () => {
    if (!examName.trim()) return;
    save([...exams, { name: examName.trim(), students: [], maxScore: 100 }]);
    setExamName(''); setAdding(false); setActiveExamIdx(exams.length);
  };
  const exam = exams[activeExamIdx];

  // 불변 업데이트 (중첩 객체 안전)
  const updateScore = (studentIdx, score) => {
    save(exams.map((ex, i) => i !== activeExamIdx ? ex : {
      ...ex,
      students: (ex.students || []).map((s, si) => si !== studentIdx ? s : { ...s, score })
    }));
  };
  const addStudent = () => {
    if (!newStudentName.trim()) return;
    save(exams.map((ex, i) => i !== activeExamIdx ? ex : {
      ...ex,
      students: [...(ex.students || []), { name: newStudentName.trim(), score: '' }]
    }));
    setNewStudentName(''); setAddingStudent(false);
  };

  const scores = (Array.isArray(exam?.students) ? exam.students : [])
    .map(s => parseFloat(s.score)).filter(n => Number.isFinite(n));
  const avg = scores.length ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : '-';
  const max = scores.length ? Math.max(...scores) : '-';
  const min = scores.length ? Math.min(...scores) : '-';

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <span style={{ fontSize: 12, fontWeight: 600 }}>📊 성적 입력</span>
        <button onClick={() => setAdding(!adding)} style={{ background: theme.accentColor, color: '#fff', border: 'none', borderRadius: 4, padding: '1px 6px', fontSize: 10, cursor: 'pointer' }}>+</button>
      </div>
      {exams.length > 0 && (
        <div style={{ display: 'flex', gap: 2, marginBottom: 4, overflowX: 'auto' }}>
          {exams.map((ex, i) => (
            <button key={i} onClick={() => setActiveExamIdx(i)}
              style={{ padding: '2px 6px', borderRadius: 4, border: 'none', cursor: 'pointer', fontSize: 9, whiteSpace: 'nowrap', background: activeExamIdx === i ? theme.accentColor : c(theme,'#f3f4f6','#334155'), color: activeExamIdx === i ? '#fff' : c(theme,'#6b7280','#94a3b8') }}>{ex.name}</button>
          ))}
        </div>
      )}
      {adding && (
        <div style={{ display: 'flex', gap: 3, marginBottom: 4 }}>
          <input autoFocus value={examName} onChange={e => setExamName(e.target.value)} onKeyDown={e => e.key === 'Enter' && addExam()} placeholder="시험명 (예: 1차 지필)"
            style={{ flex: 1, border: `1px solid ${theme.borderColor}`, borderRadius: 4, padding: '3px 6px', fontSize: 10, outline: 'none', fontFamily: 'inherit', background: c(theme,'#fff','#0f172a'), color: theme.textColor }} />
          <button onClick={addExam} style={{ background: theme.accentColor, color: '#fff', border: 'none', borderRadius: 4, padding: '2px 8px', fontSize: 10, cursor: 'pointer' }}>생성</button>
        </div>
      )}
      {!exam ? (
        <EmptyState icon="📊" message="시험을 추가하여 성적을 입력하세요" actionLabel="+ 시험 추가" onAction={() => setAdding(true)} theme={theme} />
      ) : (
        <>
          <div style={{ display: 'flex', gap: 6, marginBottom: 4, fontSize: 10 }}>
            <span style={{ color: theme.accentColor, fontWeight: 600 }}>평균 {avg}</span>
            <span style={{ color: c(theme,'#9ca3af','#64748b') }}>최고 {max}</span>
            <span style={{ color: c(theme,'#9ca3af','#64748b') }}>최저 {min}</span>
          </div>
          <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
            {(Array.isArray(exam.students) ? exam.students : []).map((s, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ fontSize: 10, color: theme.textColor, width: 50, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
                <input value={s.score ?? ''} onChange={e => updateScore(i, e.target.value)} placeholder="점수"
                  style={{ width: 45, border: `1px solid ${theme.borderColor}`, borderRadius: 3, padding: '2px 4px', fontSize: 10, textAlign: 'center', outline: 'none', background: c(theme,'#fff','#0f172a'), color: theme.textColor }} />
              </div>
            ))}
          </div>
          {addingStudent ? (
            <div style={{ display: 'flex', gap: 3, marginTop: 4 }}>
              <input autoFocus value={newStudentName} onChange={e => setNewStudentName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addStudent(); if (e.key === 'Escape') setAddingStudent(false); }}
                placeholder="학생 이름" style={{ flex: 1, border: `1px solid ${theme.borderColor}`, borderRadius: 4, padding: '3px 6px', fontSize: 10, outline: 'none', fontFamily: 'inherit', background: c(theme,'#fff','#0f172a'), color: theme.textColor }} />
              <button onClick={addStudent} style={{ background: theme.accentColor, color: '#fff', border: 'none', borderRadius: 4, padding: '2px 8px', fontSize: 10, cursor: 'pointer' }}>추가</button>
            </div>
          ) : (
            <button onClick={() => setAddingStudent(true)} style={{ width: '100%', background: c(theme,'#f3f4f6','#334155'), border: 'none', borderRadius: 4, padding: '3px', fontSize: 9, cursor: 'pointer', color: c(theme,'#9ca3af','#64748b'), marginTop: 4 }}>+ 학생 추가</button>
          )}
        </>
      )}
    </div>
  );
}

// ── 교육과정 진도 맵 위젯 ────────────────────────────────────
function CurriculumMapWidget({ theme }) {
  const [subjects, setSubjects] = useState(() => loadLS('curriculum:map', []));
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: '', units: '' });

  const save = (data) => { setSubjects(data); saveLS('curriculum:map', data); };
  const addSubject = () => {
    if (!form.name.trim() || !form.units.trim()) return;
    const units = form.units.split(/[,\n]/).map(u => u.trim()).filter(Boolean).map(u => ({ name: u, done: false }));
    save([...subjects, { id: Date.now(), name: form.name.trim(), units }]);
    setForm({ name: '', units: '' }); setAdding(false);
  };
  // 불변 업데이트 (중첩 객체 안전)
  const toggleUnit = (subIdx, unitIdx) => {
    save(subjects.map((s, i) => i !== subIdx ? s : {
      ...s,
      units: (s.units || []).map((u, ui) => ui !== unitIdx ? u : { ...u, done: !u.done })
    }));
  };
  const removeSubject = (id) => save(subjects.filter(s => s.id !== id));

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 600 }}>📚 교육과정 진도</span>
        <button onClick={() => setAdding(!adding)} style={{ background: theme.accentColor, color: '#fff', border: 'none', borderRadius: 4, padding: '1px 6px', fontSize: 10, cursor: 'pointer' }}>+</button>
      </div>
      {adding && (
        <div style={{ background: c(theme,'#f9fafb','#0f172a'), borderRadius: 6, padding: 6, marginBottom: 4 }}>
          <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="과목명"
            style={{ width: '100%', border: `1px solid ${theme.borderColor}`, borderRadius: 4, padding: '3px 6px', fontSize: 10, marginBottom: 3, outline: 'none', fontFamily: 'inherit', background: c(theme,'#fff','#1e293b'), color: theme.textColor, boxSizing: 'border-box' }} />
          <textarea value={form.units} onChange={e => setForm({ ...form, units: e.target.value })} placeholder="단원명 (쉼표 또는 줄바꿈)&#10;예: 1단원 물질의 구조, 2단원 화학 반응"
            style={{ width: '100%', height: 40, border: `1px solid ${theme.borderColor}`, borderRadius: 4, padding: '3px 6px', fontSize: 10, resize: 'none', outline: 'none', fontFamily: 'inherit', background: c(theme,'#fff','#1e293b'), color: theme.textColor, boxSizing: 'border-box' }} />
          <button onClick={addSubject} style={{ width: '100%', background: theme.accentColor, color: '#fff', border: 'none', borderRadius: 4, padding: '3px', fontSize: 10, cursor: 'pointer', marginTop: 3 }}>등록</button>
        </div>
      )}
      <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {subjects.length === 0 && !adding && <EmptyState icon="📚" message="과목과 단원을 등록하여&#10;교육과정 진도를 추적하세요" actionLabel="+ 추가" onAction={() => setAdding(true)} theme={theme} />}
        {subjects.map((sub, si) => {
          const units = Array.isArray(sub.units) ? sub.units : [];
          const doneCount = units.filter(u => u.done).length;
          const pct = units.length ? Math.round((doneCount / units.length) * 100) : 0;
          return (
            <div key={sub.id}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 3 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: theme.textColor, flex: 1 }}>{sub.name}</span>
                <span style={{ fontSize: 9, color: pct === 100 ? '#10b981' : theme.accentColor, fontWeight: 600 }}>{pct}%</span>
                <button onClick={() => removeSubject(sub.id)} style={{ background: 'none', border: 'none', color: c(theme,'#9ca3af','#64748b'), cursor: 'pointer', fontSize: 8 }}>✕</button>
              </div>
              <div style={{ height: 4, background: c(theme,'#f3f4f6','#334155'), borderRadius: 2, marginBottom: 4, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${pct}%`, background: pct === 100 ? '#10b981' : theme.accentColor, borderRadius: 2, transition: 'width 0.3s' }} />
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
                {units.map((u, ui) => (
                  <button key={ui} onClick={() => toggleUnit(si, ui)}
                    style={{ padding: '2px 5px', borderRadius: 3, border: 'none', cursor: 'pointer', fontSize: 9, background: u.done ? '#10b981' : c(theme,'#f3f4f6','#334155'), color: u.done ? '#fff' : c(theme,'#6b7280','#94a3b8'), textDecoration: u.done ? 'line-through' : 'none' }}>
                    {u.name}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function QuoteWidget({ theme }) {
  const [allQuotes, setAllQuotes] = useState(QUOTES);
  useEffect(() => {
    // 외부 JSON에서 더 많은 명언 로드
    fetch('/quotes.json').then(r => r.json()).then(data => {
      if (Array.isArray(data) && data.length > 0) setAllQuotes(data);
    }).catch(() => {});
  }, []);
  const today = new Date();
  const idx = allQuotes.length > 0 ? (today.getFullYear() * 366 + today.getMonth() * 31 + today.getDate()) % allQuotes.length : 0;
  const quote = allQuotes[idx] || QUOTES[0];

  const [copied, setCopied] = React.useState(false);
  const copyQuote = () => {
    navigator.clipboard?.writeText(`"${quote.text}" — ${quote.author}`);
    setCopied(true); setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div onClick={copyQuote} title="클릭하여 복사"
      style={{ height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center', padding: '8px', cursor: 'pointer' }}>
      <div style={{ fontSize: 13, lineHeight: 1.6, color: theme.textColor, fontWeight: 500, marginBottom: 8 }}>
        "{quote.text}"
      </div>
      <div style={{ fontSize: 11, color: c(theme, '#9ca3af', '#64748b') }}>— {quote.author}</div>
      {copied && <div style={{ fontSize: 9, color: theme.accentColor, marginTop: 4 }}>✅ 복사됨</div>}
    </div>
  );
}

// ── 스톱워치/타이머 위젯 ────────────────────────────────────
function StopwatchWidget({ theme }) {
  const [seconds, setSeconds] = useState(0);
  const [running, setRunning] = useState(false);
  const [mode, setMode] = useState('stopwatch'); // stopwatch | timer
  const [timerInput, setTimerInput] = useState(10); // 분

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => {
      setSeconds(s => {
        if (mode === 'timer' && s <= 1) {
          setRunning(false);
          // 타이머 완료 알림
          if (window.electronAPI?.notification?.show) {
            window.electronAPI.notification.show({ type: 'warning', title: '⏳ 타이머 완료!', message: `${timerInput}분 타이머가 끝났습니다.`, duration: 8000 });
          }
          return 0;
        }
        return mode === 'stopwatch' ? s + 1 : s - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [running, mode, timerInput]);

  const pad = n => String(Math.floor(Math.abs(n))).padStart(2, '0');
  const mm = pad(seconds / 60);
  const ss = pad(seconds % 60);

  const start = () => {
    if (mode === 'timer' && !running) setSeconds(timerInput * 60);
    setRunning(true);
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', gap: 3, marginBottom: 6, flexShrink: 0 }}>
        <button onClick={() => { setMode('stopwatch'); setSeconds(0); setRunning(false); }}
          style={{ flex: 1, padding: '2px', borderRadius: 5, fontSize: 10, border: 'none', cursor: 'pointer', background: mode === 'stopwatch' ? theme.accentColor : c(theme, '#f3f4f6', '#334155'), color: mode === 'stopwatch' ? '#fff' : c(theme, '#6b7280', '#94a3b8') }}>⏱ 스톱워치</button>
        <button onClick={() => { setMode('timer'); setSeconds(timerInput * 60); setRunning(false); }}
          style={{ flex: 1, padding: '2px', borderRadius: 5, fontSize: 10, border: 'none', cursor: 'pointer', background: mode === 'timer' ? theme.accentColor : c(theme, '#f3f4f6', '#334155'), color: mode === 'timer' ? '#fff' : c(theme, '#6b7280', '#94a3b8') }}>⏳ 타이머</button>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{
          fontSize: 28, fontWeight: 700, fontVariantNumeric: 'tabular-nums',
          color: (mode === 'timer' && seconds <= 60 && seconds > 0) ? '#dc2626' : (mode === 'timer' && seconds === 0 && !running) ? '#10b981' : theme.textColor,
          animation: (mode === 'timer' && seconds === 0 && !running) ? 'timerDone 0.5s ease 3' : 'none'
        }}>
          {mode === 'timer' && seconds === 0 && !running ? '⏰ 완료!' : `${mm}:${ss}`}
        </div>
        <style>{`@keyframes timerDone { 0%,100% { transform: scale(1); } 50% { transform: scale(1.15); } }`}</style>
        {mode === 'timer' && !running && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, marginTop: 4 }}>
            <div style={{ display: 'flex', gap: 3 }}>
              {[1, 3, 5, 10, 15, 20].map(m => (
                <button key={m} onClick={() => { setTimerInput(m); setSeconds(m * 60); }}
                  style={{ padding: '2px 5px', borderRadius: 4, border: 'none', cursor: 'pointer', fontSize: 9, background: timerInput === m ? theme.accentColor : c(theme,'#f3f4f6','#334155'), color: timerInput === m ? '#fff' : c(theme,'#6b7280','#94a3b8') }}>
                  {m}분
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <input type="number" min={1} max={120} value={timerInput} onChange={e => { setTimerInput(Number(e.target.value)); setSeconds(Number(e.target.value) * 60); }}
                style={{ width: 40, border: `1px solid ${theme.borderColor}`, borderRadius: 5, padding: '2px 4px', fontSize: 11, textAlign: 'center', outline: 'none', background: c(theme, '#fff', '#1e293b'), color: theme.textColor }} />
              <span style={{ fontSize: 10, color: c(theme, '#9ca3af', '#64748b') }}>분</span>
            </div>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
        {!running ? (
          <button onClick={start} style={{ flex: 1, background: '#10b981', color: '#fff', border: 'none', borderRadius: 6, padding: '5px', fontSize: 11, cursor: 'pointer' }}>▶ 시작</button>
        ) : (
          <button onClick={() => setRunning(false)} style={{ flex: 1, background: '#f59e0b', color: '#fff', border: 'none', borderRadius: 6, padding: '5px', fontSize: 11, cursor: 'pointer' }}>⏸ 정지</button>
        )}
        <button onClick={() => { setRunning(false); setSeconds(mode === 'timer' ? timerInput * 60 : 0); }}
          style={{ flex: 1, background: c(theme, '#f3f4f6', '#334155'), color: theme.textColor, border: 'none', borderRadius: 6, padding: '5px', fontSize: 11, cursor: 'pointer' }}>↺ 초기화</button>
      </div>
    </div>
  );
}

// ── NEIS 공문 배정 알림 위젯 ────────────────────────────────
function NeisAlertWidget({ theme }) {
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>📋 NEIS 공문</div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: c(theme, '#9ca3af', '#64748b'), fontSize: 11, textAlign: 'center', gap: 6 }}>
        <span style={{ fontSize: 24 }}>📋</span>
        <span>NEIS 공문 알림은<br/>NEIS 연동 후 표시됩니다</span>
        <button onClick={() => {
          if (window.electronAPI) window.electronAPI.shell.openExternal('https://neis.go.kr');
          else window.open('https://neis.go.kr', '_blank');
        }} style={{ background: theme.accentColor, color: '#fff', border: 'none', borderRadius: 6, padding: '4px 12px', fontSize: 10, cursor: 'pointer', marginTop: 4 }}>
          NEIS 접속 →
        </button>
      </div>
    </div>
  );
}

// ── 주간 일정 위젯 ──────────────────────────────────────────
function WeekScheduleWidget({ theme }) {
  const { state } = useApp();
  const { cache, google } = state;
  const events = cache.calendarEvents || [];
  const today = new Date();
  const days = ['일', '월', '화', '수', '목', '금', '토'];

  // 이번 주 7일
  const weekDays = [];
  const dayOfWeek = today.getDay();
  for (let i = -dayOfWeek; i < 7 - dayOfWeek; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    weekDays.push(d);
  }

  const fmt = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>🗓 이번 주</div>
      <div style={{ flex: 1, overflow: 'auto' }}>
        {weekDays.map(d => {
          const dateStr = fmt(d);
          const isToday = dateStr === fmt(today);
          const dayEvents = events.filter(e => e.date === dateStr);
          return (
            <div key={dateStr} style={{ display: 'flex', gap: 6, padding: '3px 0', borderBottom: `0.5px solid ${theme.borderColor}` }}>
              <div style={{ width: 32, flexShrink: 0, fontSize: 10, fontWeight: isToday ? 700 : 400, color: isToday ? theme.accentColor : c(theme, '#6b7280', '#94a3b8') }}>
                {d.getDate()}({days[d.getDay()]})
              </div>
              <div style={{ flex: 1, fontSize: 10, color: theme.textColor }}>
                {dayEvents.length > 0 ? dayEvents.map(e => e.title).join(', ') : <span style={{ color: c(theme, '#d1d5db', '#475569') }}>—</span>}
              </div>
            </div>
          );
        })}
      </div>
      {!google.connected && <div style={{ fontSize: 9, color: '#9ca3af', textAlign: 'center', marginTop: 4 }}>Google 연동 시 일정 표시</div>}
    </div>
  );
}

// ── 고사 일정 위젯 ──────────────────────────────────────────
function ExamWidget({ theme }) {
  const [exams, setExams] = useState(() => {
    try { return JSON.parse(localStorage.getItem('exam-schedules') || '[]'); } catch { return []; }
  });
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ type: '정기고사', name: '', startDate: '', days: [{ date: '', periods: [{ time: '', subject: '', room: '' }] }] });

  const save = (updated) => { setExams(updated); localStorage.setItem('exam-schedules', JSON.stringify(updated)); };

  const addExam = () => {
    if (!form.name || !form.startDate) return;
    save([...exams, { id: Date.now(), ...form }]);
    setForm({ type: '정기고사', name: '', startDate: '', days: [{ date: '', periods: [{ time: '', subject: '', room: '' }] }] });
    setAdding(false);
  };

  const deleteExam = (id) => save(exams.filter(e => e.id !== id));

  const calcDays = (dateStr) => {
    if (!dateStr) return null;
    return Math.ceil((new Date(dateStr) - new Date(new Date().toDateString())) / 86400000);
  };

  // 현재 진행 중인 고사 찾기
  const activeExam = exams.find(e => {
    const d = calcDays(e.startDate);
    return d !== null && d >= -5 && d <= 5;
  });

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 600 }}>📝 고사 일정</span>
        <button onClick={() => setAdding(!adding)} style={{ background: theme.accentColor, color: '#fff', border: 'none', borderRadius: 5, padding: '2px 8px', fontSize: 10, cursor: 'pointer' }}>{adding ? '취소' : '+ 등록'}</button>
      </div>

      {adding && (
        <div style={{ background: c(theme, '#f9fafb', '#0f172a'), borderRadius: 8, padding: 8, marginBottom: 6 }}>
          <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
            {['정기고사', '모의고사'].map(t => (
              <button key={t} onClick={() => setForm({ ...form, type: t })}
                style={{ flex: 1, padding: '3px', borderRadius: 5, fontSize: 10, border: 'none', cursor: 'pointer', background: form.type === t ? theme.accentColor : c(theme, '#e5e7eb', '#334155'), color: form.type === t ? '#fff' : theme.textColor }}>{t}</button>
            ))}
          </div>
          <input placeholder="시험명 (예: 1학기 중간고사)" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
            style={{ width: '100%', border: `1px solid ${theme.borderColor}`, borderRadius: 5, padding: '4px 6px', fontSize: 11, marginBottom: 4, outline: 'none', fontFamily: 'inherit', background: c(theme, '#fff', '#1e293b'), color: theme.textColor }} />
          <input type="date" value={form.startDate} onChange={e => setForm({ ...form, startDate: e.target.value })}
            style={{ width: '100%', border: `1px solid ${theme.borderColor}`, borderRadius: 5, padding: '4px 6px', fontSize: 11, marginBottom: 4, outline: 'none', fontFamily: 'inherit', background: c(theme, '#fff', '#1e293b'), color: theme.textColor }} />

          {/* 교시별 과목/감독실 입력 */}
          <div style={{ fontSize: 10, color: '#9ca3af', marginBottom: 4 }}>교시별 과목 / 감독 교실</div>
          {form.days[0].periods.map((p, i) => (
            <div key={i} style={{ display: 'flex', gap: 3, marginBottom: 3 }}>
              <input placeholder={`${i+1}교시 과목`} value={p.subject} onChange={e => {
                const days = [...form.days]; days[0].periods[i] = { ...p, subject: e.target.value }; setForm({ ...form, days });
              }} style={{ flex: 1, border: `1px solid ${theme.borderColor}`, borderRadius: 4, padding: '3px 5px', fontSize: 10, outline: 'none', background: c(theme, '#fff', '#1e293b'), color: theme.textColor }} />
              <input placeholder="교실" value={p.room} onChange={e => {
                const days = [...form.days]; days[0].periods[i] = { ...p, room: e.target.value }; setForm({ ...form, days });
              }} style={{ width: 50, border: `1px solid ${theme.borderColor}`, borderRadius: 4, padding: '3px 5px', fontSize: 10, outline: 'none', background: c(theme, '#fff', '#1e293b'), color: theme.textColor }} />
            </div>
          ))}
          <button onClick={() => { const days = [...form.days]; days[0].periods.push({ time: '', subject: '', room: '' }); setForm({ ...form, days }); }}
            style={{ width: '100%', background: c(theme, '#f3f4f6', '#334155'), border: 'none', borderRadius: 4, padding: '3px', fontSize: 10, cursor: 'pointer', color: theme.textColor, marginBottom: 4 }}>+ 교시 추가</button>
          <button onClick={addExam} style={{ width: '100%', background: theme.accentColor, color: '#fff', border: 'none', borderRadius: 5, padding: '5px', fontSize: 11, cursor: 'pointer' }}>저장</button>
        </div>
      )}

      <div style={{ flex: 1, overflow: 'auto' }}>
        {exams.length === 0 && !adding && <div style={{ textAlign: 'center', color: '#9ca3af', fontSize: 11, padding: '12px 0' }}>등록된 고사가 없습니다</div>}
        {exams.map(exam => {
          const d = calcDays(exam.startDate);
          return (
            <div key={exam.id} style={{ padding: '6px 0', borderBottom: `0.5px solid ${theme.borderColor}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 10, background: exam.type === '정기고사' ? '#fee2e2' : '#dbeafe', color: exam.type === '정기고사' ? '#dc2626' : '#1e40af', padding: '1px 5px', borderRadius: 4, fontWeight: 600 }}>{exam.type}</span>
                <span style={{ flex: 1, fontSize: 11, fontWeight: 600 }}>{exam.name}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: d <= 3 && d >= 0 ? '#dc2626' : theme.accentColor }}>
                  {d === 0 ? 'D-Day' : d > 0 ? `D-${d}` : `D+${Math.abs(d)}`}
                </span>
                <button onClick={() => deleteExam(exam.id)} style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: 10 }}>✕</button>
              </div>
              {exam.days[0]?.periods?.length > 0 && (
                <div style={{ marginTop: 4, fontSize: 10, color: c(theme, '#6b7280', '#94a3b8') }}>
                  {exam.days[0].periods.filter(p => p.subject).map((p, i) => `${i+1}교시: ${p.subject}${p.room ? `(${p.room})` : ''}`).join(' · ')}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── 수업 진도표 위젯 ────────────────────────────────────────
function ProgressWidget({ theme }) {
  const [subjects, setSubjects] = useState(() => {
    try { return JSON.parse(localStorage.getItem('lesson-progress') || '[]'); } catch { return []; }
  });
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: '', total: 30, done: 0 });
  const [editingNote, setEditingNote] = useState(null);

  const save = (updated) => { setSubjects(updated); localStorage.setItem('lesson-progress', JSON.stringify(updated)); };

  const addSubject = () => {
    if (!form.name) return;
    save([...subjects, { id: Date.now(), ...form, note: '' }]);
    setForm({ name: '', total: 30, done: 0 });
    setAdding(false);
  };

  const updateDone = (id, delta) => {
    save(subjects.map(s => s.id === id ? { ...s, done: Math.max(0, Math.min(s.total, s.done + delta)) } : s));
  };

  const updateNote = (id, note) => {
    save(subjects.map(s => s.id === id ? { ...s, note } : s));
  };

  const deleteSubject = (id) => save(subjects.filter(s => s.id !== id));

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 600 }}>📊 수업 진도표</span>
        <button onClick={() => setAdding(!adding)} style={{ background: theme.accentColor, color: '#fff', border: 'none', borderRadius: 5, padding: '2px 8px', fontSize: 10, cursor: 'pointer' }}>{adding ? '취소' : '+'}</button>
      </div>

      {adding && (
        <div style={{ background: c(theme, '#f9fafb', '#0f172a'), borderRadius: 8, padding: 8, marginBottom: 6 }}>
          <input placeholder="과목명" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
            style={{ width: '100%', border: `1px solid ${theme.borderColor}`, borderRadius: 5, padding: '4px 6px', fontSize: 11, marginBottom: 4, outline: 'none', fontFamily: 'inherit', background: c(theme, '#fff', '#1e293b'), color: theme.textColor }} />
          <div style={{ display: 'flex', gap: 4, marginBottom: 4, alignItems: 'center' }}>
            <span style={{ fontSize: 10, color: '#9ca3af' }}>총 차시:</span>
            <input type="number" min={1} value={form.total} onChange={e => setForm({ ...form, total: Number(e.target.value) })}
              style={{ width: 50, border: `1px solid ${theme.borderColor}`, borderRadius: 5, padding: '3px 5px', fontSize: 11, outline: 'none', background: c(theme, '#fff', '#1e293b'), color: theme.textColor }} />
          </div>
          <button onClick={addSubject} style={{ width: '100%', background: theme.accentColor, color: '#fff', border: 'none', borderRadius: 5, padding: '5px', fontSize: 11, cursor: 'pointer' }}>추가</button>
        </div>
      )}

      <div style={{ flex: 1, overflow: 'auto' }}>
        {subjects.length === 0 && !adding && <EmptyState icon="📊" message="과목을 추가하여 수업 진도를 추적하세요" actionLabel="+ 추가" onAction={() => setAdding(true)} theme={theme} />}
        {subjects.map(s => {
          const pct = Math.round((s.done / s.total) * 100);
          return (
            <div key={s.id} style={{ padding: '5px 0', borderBottom: `0.5px solid ${theme.borderColor}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 3 }}>
                <span style={{ flex: 1, fontSize: 11, fontWeight: 600 }}>{s.name}</span>
                <span style={{ fontSize: 10, color: pct >= 100 ? '#10b981' : theme.accentColor, fontWeight: 700 }}>{pct}%</span>
                <button onClick={() => deleteSubject(s.id)} style={{ background: 'none', border: 'none', color: '#d1d5db', cursor: 'pointer', fontSize: 9 }}>✕</button>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <button onClick={() => updateDone(s.id, -1)} style={{ width: 18, height: 18, borderRadius: 4, border: 'none', background: c(theme, '#f3f4f6', '#334155'), cursor: 'pointer', fontSize: 11, color: theme.textColor }}>-</button>
                <div style={{ flex: 1, height: 8, background: c(theme, '#f3f4f6', '#334155'), borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${pct}%`, background: pct >= 100 ? '#10b981' : theme.accentColor, borderRadius: 4, transition: 'width 0.3s' }} />
                </div>
                <button onClick={() => updateDone(s.id, 1)} style={{ width: 18, height: 18, borderRadius: 4, border: 'none', background: c(theme, '#f3f4f6', '#334155'), cursor: 'pointer', fontSize: 11, color: theme.textColor }}>+</button>
                <span style={{ fontSize: 9, color: '#9ca3af', minWidth: 35 }}>{s.done}/{s.total}</span>
              </div>
              {editingNote === s.id ? (
                <input
                  autoFocus
                  value={s.note || ''}
                  onChange={e => updateNote(s.id, e.target.value)}
                  onBlur={() => setEditingNote(null)}
                  placeholder="어디까지 했는지 메모..."
                  style={{ width: '100%', marginTop: 4, border: `1px solid ${theme.borderColor}`, borderRadius: 5, padding: '3px 6px', fontSize: 10, outline: 'none', fontFamily: 'inherit', background: c(theme, '#fff', '#1e293b'), color: theme.textColor }}
                />
              ) : (
                <div onClick={() => setEditingNote(s.id)} style={{ marginTop: 3, fontSize: 10, color: s.note ? theme.textColor : '#9ca3af', cursor: 'text', padding: '2px 4px', borderRadius: 4, minHeight: 16 }}>
                  {s.note || '진도 메모 클릭하여 입력...'}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── 계산기 위젯 ─────────────────────────────────────────────
function CalcWidget({ theme }) {
  const [display, setDisplay] = useState('0');
  const [prev, setPrev] = useState(null);
  const [op, setOp] = useState(null);
  const [reset, setReset] = useState(false);
  const [history, setHistory] = useState('');

  const input = (n) => {
    if (display === 'Error') { setDisplay(String(n)); return; }
    if (reset) { setDisplay(String(n)); setReset(false); }
    else setDisplay(display === '0' ? String(n) : display + n);
  };
  const operate = (nextOp) => {
    if (display === 'Error') return;
    if (prev !== null && op) {
      const a = parseFloat(prev), b = parseFloat(display);
      let r;
      if (op === '÷' && b === 0) { setDisplay('Error'); setPrev(null); setOp(null); return; }
      r = op === '+' ? a+b : op === '-' ? a-b : op === '×' ? a*b : op === '÷' ? a/b : b;
      const rs = parseFloat(r.toFixed(10));
      setDisplay(String(rs));
      setPrev(String(rs));
      setHistory(`${a} ${op} ${b} = ${rs}`);
    } else { setPrev(display); }
    setOp(nextOp); setReset(true);
  };
  const calc = () => { operate(null); setOp(null); };
  const clear = () => { setDisplay('0'); setPrev(null); setOp(null); setHistory(''); };
  const backspace = () => {
    if (display === 'Error' || display.length <= 1) { setDisplay('0'); return; }
    setDisplay(display.slice(0, -1));
  };

  const calcRef = useRef(null);
  // 키보드 지원
  const onKey = (e) => {
    const k = e.key;
    if (k >= '0' && k <= '9') input(parseInt(k));
    else if (k === '+') operate('+');
    else if (k === '-') operate('-');
    else if (k === '*') operate('×');
    else if (k === '/') { e.preventDefault(); operate('÷'); }
    else if (k === '=' || k === 'Enter') calc();
    else if (k === 'Escape' || k === 'c' || k === 'C') clear();
    else if (k === 'Backspace') backspace();
    else if (k === '.') { if (display !== 'Error' && !display.includes('.')) setDisplay(display + '.'); }
  };

  const btn = (label, onClick, bg) => (
    <button onClick={onClick} style={{ flex: 1, padding: '6px 0', borderRadius: theme.borderRadiusSm || 6, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 500, background: bg || c(theme, '#f3f4f6', '#334155'), color: bg === '#ef4444' || bg === theme.accentColor ? '#fff' : theme.textColor }}>{label}</button>
  );

  return (
    <div ref={calcRef} tabIndex={0} onKeyDown={onKey} style={{ height: '100%', display: 'flex', flexDirection: 'column', outline: 'none' }}
      onFocus={() => {}} /* 클릭 시 자동 포커스 */
    >
      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>🔢 계산기</div>
      {history && <div style={{ fontSize: 9, color: '#9ca3af', textAlign: 'right', marginBottom: 2 }}>{history}</div>}
      <div style={{ background: c(theme, '#f9fafb', '#0f172a'), borderRadius: 6, padding: '6px 8px', marginBottom: 6, textAlign: 'right', fontSize: 18, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: display === 'Error' ? '#ef4444' : theme.textColor, minHeight: 28, overflow: 'hidden' }}>{display}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
        <div style={{ display: 'flex', gap: 4 }}>{btn('C', clear, '#ef4444')} {btn('⌫', backspace)} {btn('×', () => operate('×'))} {btn('−', () => operate('-'))}</div>
        <div style={{ display: 'flex', gap: 4 }}>{btn('7', () => input(7))} {btn('8', () => input(8))} {btn('9', () => input(9))} {btn('+', () => operate('+'))}</div>
        <div style={{ display: 'flex', gap: 4 }}>{btn('4', () => input(4))} {btn('5', () => input(5))} {btn('6', () => input(6))} {btn('÷', () => operate('÷'))}</div>
        <div style={{ display: 'flex', gap: 4 }}>{btn('1', () => input(1))} {btn('2', () => input(2))} {btn('3', () => input(3))} {btn('=', calc, theme.accentColor)}</div>
        <div style={{ display: 'flex', gap: 4 }}>{btn('0', () => input(0))} {btn('.', () => { if (display !== 'Error' && !display.includes('.')) setDisplay(display + '.'); })}</div>
      </div>
    </div>
  );
}

// ── 랜덤 뽑기 위젯 ─────────────────────────────────────────
function RandomPickWidget({ theme }) {
  const [names, setNames] = useState(() => {
    try { return JSON.parse(localStorage.getItem('random-pick-names') || '[]'); } catch { return []; }
  });
  const [input, setInput] = useState('');
  const [picked, setPicked] = useState(null);
  const [spinning, setSpinning] = useState(false);
  const [groups, setGroups] = useState(null); // 조 편성 결과
  const [groupCount, setGroupCount] = useState(4);

  const addName = () => {
    if (!input.trim()) return;
    // 여러 이름 한번에 (쉼표/줄바꿈 구분)
    const newNames = input.split(/[,\n]/).map(n => n.trim()).filter(Boolean);
    const updated = [...names, ...newNames];
    setNames(updated);
    localStorage.setItem('random-pick-names', JSON.stringify(updated));
    setInput('');
  };

  const pick = () => {
    if (names.length === 0) return;
    setSpinning(true);
    setPicked(null);
    let count = 0;
    const t = setInterval(() => {
      setPicked(names[Math.floor(Math.random() * names.length)]);
      count++;
      if (count > 15) { clearInterval(t); setSpinning(false); }
    }, 80);
  };

  const clearAll = () => { setNames([]); localStorage.removeItem('random-pick-names'); setPicked(null); };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>🎲 랜덤 뽑기</div>
      {picked && (
        <div style={{ textAlign: 'center', padding: '8px', background: spinning ? c(theme, '#fefce8', '#1e293b') : theme.accentColor + '15', borderRadius: 8, marginBottom: 4 }}>
          <div style={{ fontSize: spinning ? 16 : 22, fontWeight: 700, color: spinning ? theme.textColor : theme.accentColor }}>{picked}</div>
        </div>
      )}
      <div style={{ display: 'flex', gap: 3, marginBottom: 4 }}>
        <button onClick={() => { pick(); setGroups(null); }} disabled={names.length === 0} style={{ flex: 1, background: theme.accentColor, color: '#fff', border: 'none', borderRadius: 6, padding: '5px', fontSize: 11, cursor: 'pointer', opacity: names.length === 0 ? 0.5 : 1 }}>🎲 뽑기!</button>
        <button onClick={() => {
          if (names.length === 0) return;
          // 셔플 후 N개 조로 분배
          const shuffled = [...names].sort(() => Math.random() - 0.5);
          const gc = Math.min(groupCount, shuffled.length);
          const result = Array.from({ length: gc }, () => []);
          shuffled.forEach((name, i) => result[i % gc].push(name));
          setGroups(result); setPicked(null);
        }} disabled={names.length === 0} style={{ background: c(theme,'#f3f4f6','#334155'), border: 'none', borderRadius: 6, padding: '5px 8px', fontSize: 10, cursor: 'pointer', color: theme.textColor, opacity: names.length === 0 ? 0.5 : 1 }}>
          👥 {groupCount}조
        </button>
        <select value={groupCount} onChange={e => setGroupCount(Number(e.target.value))}
          style={{ width: 36, border: `1px solid ${theme.borderColor}`, borderRadius: 4, fontSize: 9, background: c(theme,'#fff','#1e293b'), color: theme.textColor, outline: 'none' }}>
          {[2,3,4,5,6,7,8].map(n => <option key={n} value={n}>{n}</option>)}
        </select>
        <button onClick={() => { clearAll(); setGroups(null); }} style={{ background: c(theme, '#f3f4f6', '#334155'), border: 'none', borderRadius: 6, padding: '3px 6px', fontSize: 9, cursor: 'pointer', color: '#9ca3af' }}>✕</button>
      </div>
      {/* 조 편성 결과 */}
      {groups && (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(groups.length, 4)}, 1fr)`, gap: 3, marginBottom: 4 }}>
          {groups.map((g, i) => (
            <div key={i} style={{ background: c(theme,'#f9fafb','#1e293b'), borderRadius: 5, padding: '3px 5px', fontSize: 9 }}>
              <div style={{ fontWeight: 700, color: theme.accentColor, marginBottom: 2 }}>{i+1}조</div>
              {g.map((n, j) => <div key={j} style={{ color: theme.textColor }}>{n}</div>)}
            </div>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', gap: 3, marginBottom: 4 }}>
        <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && addName()}
          placeholder="이름 (쉼표로 여러명)" style={{ flex: 1, border: `1px solid ${theme.borderColor}`, borderRadius: 5, padding: '3px 6px', fontSize: 10, outline: 'none', fontFamily: 'inherit', background: c(theme, '#fff', '#0f172a'), color: theme.textColor }} />
        <button onClick={addName} style={{ background: theme.accentColor, color: '#fff', border: 'none', borderRadius: 5, padding: '3px 6px', fontSize: 10, cursor: 'pointer' }}>+</button>
        <button onClick={() => {
          const fi = document.createElement('input'); fi.type = 'file'; fi.accept = '.txt,.csv';
          fi.onchange = (ev) => {
            const reader = new FileReader();
            reader.onload = (r) => {
              const text = r.target.result;
              const parsed = text.split(/[\n,]/).map(n => n.trim()).filter(Boolean);
              const updated = [...names, ...parsed];
              setNames(updated);
              localStorage.setItem('random-pick-names', JSON.stringify(updated));
            };
            reader.readAsText(ev.target.files[0]);
          };
          fi.click();
        }} style={{ background: c(theme, '#f3f4f6', '#334155'), border: 'none', borderRadius: 5, padding: '3px 6px', fontSize: 9, cursor: 'pointer', color: theme.textColor }}>📄</button>
      </div>
      <div style={{ flex: 1, overflow: 'hidden', fontSize: 10, color: c(theme, '#6b7280', '#94a3b8'), textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {names.length > 0 ? `${names.length}명: ${names.slice(0, 10).join(', ')}${names.length > 10 ? ' ...' : ''}` : '이름을 입력하세요'}
      </div>
    </div>
  );
}

// ── AI 채팅 위젯 ────────────────────────────────────────────
function AIChatWidget({ theme }) {
  const { state } = useApp();
  const { ai } = state;
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [localProvider, setLocalProvider] = useState(null); // null = 전역 설정 따름
  const msgEndRef = useRef(null);

  const provider = localProvider || ai.provider || 'gemini';

  const send = async () => {
    if (!input.trim() || (provider !== 'ollama' && !ai.apiKey)) return;
    const userMsg = { role: 'user', text: input.trim() };
    const history = messages.map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.text }));
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);
    try {
      const response = await aiChat({
        provider, apiKey: ai.apiKey, message: userMsg.text,
        history, model: ai.model, ollamaUrl: ai.ollamaUrl
      });
      setMessages(prev => [...prev, { role: 'ai', text: response }]);
    } catch (e) {
      setMessages(prev => [...prev, { role: 'ai', text: '❌ ' + e.message, isError: true }]);
    }
    setLoading(false);
    setTimeout(() => msgEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
  };

  const needsKey = provider !== 'ollama';
  if (!ai.enabled || (needsKey && !ai.apiKey)) {
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', fontSize: 11, textAlign: 'center', gap: 6 }}>
        <span style={{ fontSize: 28 }}>🤖</span>
        <span>설정 → AI Plus에서<br/>{needsKey ? 'API 키를 등록하세요' : 'AI를 활성화하세요'}</span>
        <span style={{ fontSize: 10 }}>Gemini·Groq은 무료!</span>
      </div>
    );
  }

  const providerColors = { gemini: '#4285f4', claude: '#d97706', openai: '#10b981', groq: '#f55036', openrouter: '#6366f1', ollama: '#374151' };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* 헤더: 제목 + provider 선택 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4, flexShrink: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: theme.textColor }}>🤖 AI 채팅</div>
        <div style={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
          {[
            { id: 'gemini', label: 'Gemini' }, { id: 'groq', label: 'Groq' },
            { id: 'claude', label: 'Claude' }, { id: 'openai', label: 'GPT' },
            { id: 'openrouter', label: 'OR' }, { id: 'ollama', label: '🏠' },
          ].map(p => (
            <button key={p.id} onClick={() => setLocalProvider(p.id)}
              title={p.id}
              style={{
                fontSize: 9, padding: '2px 5px', borderRadius: 4, border: 'none', cursor: 'pointer',
                background: provider === p.id ? providerColors[p.id] : c(theme, '#f3f4f6', '#334155'),
                color: provider === p.id ? '#fff' : c(theme, '#6b7280', '#94a3b8'),
                fontWeight: provider === p.id ? 700 : 400,
              }}>
              {p.label}
            </button>
          ))}
        </div>
      </div>
      {/* 메시지 목록 */}
      <div style={{ flex: 1, overflowY: 'auto', marginBottom: 4, display: 'flex', flexDirection: 'column', gap: 4 }}>
        {messages.length === 0 && (
          <div style={{ color: '#9ca3af', fontSize: 10, textAlign: 'center', marginTop: 12 }}>무엇이든 질문하세요</div>
        )}
        {messages.map((m, i) => (
          <div key={i} style={{
            alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
            background: m.isError ? '#fee2e2' : m.role === 'user' ? theme.accentColor : c(theme, '#f3f4f6', '#334155'),
            color: m.isError ? '#991b1b' : m.role === 'user' ? '#fff' : theme.textColor,
            borderRadius: 8, padding: '5px 8px', fontSize: 11, maxWidth: '88%',
            whiteSpace: 'pre-wrap', lineHeight: 1.5,
            fontFamily: "'Malgun Gothic', 'Apple SD Gothic Neo', 'Noto Sans KR', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif"
          }}>{m.text}</div>
        ))}
        {loading && <div style={{ color: '#9ca3af', fontSize: 10 }}>⏳ 생각 중...</div>}
        <div ref={msgEndRef} />
      </div>
      {/* 입력창 */}
      <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
        <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
          placeholder="질문 입력... (Enter)" style={{ flex: 1, border: `1px solid ${theme.borderColor}`, borderRadius: 6, padding: '5px 8px', fontSize: 11, outline: 'none', fontFamily: 'inherit', background: c(theme, '#fff', '#0f172a'), color: theme.textColor }} />
        <button onClick={send} disabled={loading || !input.trim()} style={{ background: theme.accentColor, color: '#fff', border: 'none', borderRadius: 6, padding: '5px 10px', fontSize: 11, cursor: 'pointer', opacity: (loading || !input.trim()) ? 0.5 : 1 }}>→</button>
      </div>
    </div>
  );
}

// ── 자주 쓰는 문구 위젯 ─────────────────────────────────────
function QuickPhrasesWidget({ theme }) {
  const { state, actions } = useApp();
  const phrases = state.quickPhrases || ['확인했습니다.', '감사합니다.'];
  const [copied, setCopied] = useState(null);
  const [adding, setAdding] = useState(false);
  const [newPhrase, setNewPhrase] = useState('');

  const copy = (text, idx) => {
    navigator.clipboard.writeText(text);
    setCopied(idx);
    setTimeout(() => setCopied(null), 1500);
  };
  const addPhrase = () => {
    if (!newPhrase.trim()) return;
    const updated = [...phrases, newPhrase.trim()];
    actions.setUI({ quickPhrases: updated }); // quickPhrases는 UI에 저장
    // PERSIST 가능하도록 직접 store에도 저장
    if (window.electronAPI?.store) window.electronAPI.store.set('quickPhrases', updated);
    setNewPhrase(''); setAdding(false);
  };
  const removePhrase = (idx) => {
    const updated = phrases.filter((_, i) => i !== idx);
    actions.setUI({ quickPhrases: updated });
    if (window.electronAPI?.store) window.electronAPI.store.set('quickPhrases', updated);
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 600 }}>💬 자주 쓰는 문구</span>
        <button onClick={() => setAdding(!adding)} style={{ background: theme.accentColor, color: '#fff', border: 'none', borderRadius: 4, padding: '1px 6px', fontSize: 10, cursor: 'pointer' }}>+</button>
      </div>
      {adding && (
        <div style={{ display: 'flex', gap: 3, marginBottom: 4 }}>
          <input autoFocus value={newPhrase} onChange={e => setNewPhrase(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') addPhrase(); if (e.key === 'Escape') setAdding(false); }}
            placeholder="새 문구 입력"
            style={{ flex: 1, border: `1px solid ${theme.borderColor}`, borderRadius: 5, padding: '3px 6px', fontSize: 10, outline: 'none', fontFamily: 'inherit', background: c(theme,'#fff','#0f172a'), color: theme.textColor }} />
          <button onClick={addPhrase} style={{ background: theme.accentColor, color: '#fff', border: 'none', borderRadius: 4, padding: '2px 6px', fontSize: 10, cursor: 'pointer' }}>저장</button>
        </div>
      )}
      <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 3 }}>
        {phrases.map((p, i) => (
          <div key={i} style={{ display: 'flex', gap: 2 }}>
            <button onClick={() => copy(p, i)}
              style={{
                flex: 1, textAlign: 'left', padding: '5px 8px', borderRadius: 6, border: 'none', cursor: 'pointer',
                background: copied === i ? '#d1fae5' : c(theme, '#f9fafb', '#334155'),
                color: copied === i ? '#059669' : theme.textColor,
                fontSize: 11, transition: 'all 0.15s'
              }}>
              {copied === i ? '✅ 복사됨!' : p}
            </button>
            <button onClick={() => removePhrase(i)} style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: 9, flexShrink: 0 }}>✕</button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── 파일 탐색기 위젯 (큰 아이콘 그리드 + 드래그 복사/이동) ──────
function FileExplorerWidget({ theme }) {
  const [currentPath, setCurrentPath] = useState('');
  const [files, setFiles] = useState([]);
  const [parentPath, setParentPath] = useState('');
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(new Set()); // 선택된 경로 집합
  const [clipboard, setClipboard] = useState(null); // {op: 'copy'|'cut', paths: []}
  const [viewMode, setViewMode] = useState(() => localStorage.getItem('fe:view') || 'grid'); // grid|list
  const [dragOver, setDragOver] = useState(null); // 드래그오버 대상 폴더 경로
  const [ctxMenu, setCtxMenu] = useState(null); // {x, y, target}
  const [renaming, setRenaming] = useState(null); // {path, name}
  const [newFolderPrompt, setNewFolderPrompt] = useState('');
  const [pathHistory, setPathHistory] = useState([]);
  const [historyIdx, setHistoryIdx] = useState(-1);
  const containerRef = useRef(null);

  const loadDir = useCallback(async (dirPath, pushHistory = true) => {
    if (!window.electronAPI?.files) return;
    const result = await window.electronAPI.files.readDir(dirPath || '');
    if (result.error) { setError(result.error); return; }
    setFiles(result.files || []);
    setCurrentPath(result.path);
    setParentPath(result.parent);
    setError(null);
    setSelected(new Set());
    if (pushHistory) {
      setPathHistory(h => {
        const cut = h.slice(0, historyIdx + 1);
        return [...cut, result.path];
      });
      setHistoryIdx(i => i + 1);
    }
  }, [historyIdx]);

  useEffect(() => { loadDir(''); /* eslint-disable-next-line */ }, []);

  useEffect(() => {
    localStorage.setItem('fe:view', viewMode);
  }, [viewMode]);

  // 파일 타입별 아이콘/색상
  const getIcon = (f) => {
    if (f.isDir) return { emoji: '📁', color: '#f59e0b' };
    const m = {
      pdf: { emoji: '📕', color: '#dc2626' },
      doc: { emoji: '📘', color: '#2563eb' }, docx: { emoji: '📘', color: '#2563eb' },
      xls: { emoji: '📗', color: '#16a34a' }, xlsx: { emoji: '📗', color: '#16a34a' }, csv: { emoji: '📗', color: '#16a34a' },
      ppt: { emoji: '📙', color: '#ea580c' }, pptx: { emoji: '📙', color: '#ea580c' },
      hwp: { emoji: '📝', color: '#2563eb' }, hwpx: { emoji: '📝', color: '#2563eb' },
      txt: { emoji: '📄', color: '#6b7280' }, md: { emoji: '📄', color: '#6b7280' },
      jpg: { emoji: '🖼️', color: '#8b5cf6' }, jpeg: { emoji: '🖼️', color: '#8b5cf6' },
      png: { emoji: '🖼️', color: '#8b5cf6' }, gif: { emoji: '🖼️', color: '#8b5cf6' },
      mp4: { emoji: '🎬', color: '#ec4899' }, mov: { emoji: '🎬', color: '#ec4899' }, avi: { emoji: '🎬', color: '#ec4899' },
      mp3: { emoji: '🎵', color: '#06b6d4' }, wav: { emoji: '🎵', color: '#06b6d4' },
      zip: { emoji: '📦', color: '#78716c' }, rar: { emoji: '📦', color: '#78716c' }, '7z': { emoji: '📦', color: '#78716c' },
      exe: { emoji: '⚙️', color: '#475569' }, msi: { emoji: '⚙️', color: '#475569' },
      ai: { emoji: '🎨', color: '#f97316' }, psd: { emoji: '🎨', color: '#2563eb' },
      js: { emoji: '📜', color: '#eab308' }, ts: { emoji: '📜', color: '#3b82f6' },
      html: { emoji: '🌐', color: '#f97316' }, css: { emoji: '🎨', color: '#06b6d4' }
    };
    return m[f.ext] || { emoji: '📄', color: '#9ca3af' };
  };

  const formatSize = (bytes) => {
    if (!bytes) return '';
    if (bytes < 1024) return bytes + 'B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(0) + 'KB';
    if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + 'MB';
    return (bytes / 1073741824).toFixed(1) + 'GB';
  };

  const shortPath = currentPath.length > 35 ? '…' + currentPath.slice(-32) : currentPath;

  // ── 선택 관리 ─────────────────────────
  const toggleSelect = (path, e) => {
    e.stopPropagation();
    const next = new Set(selected);
    if (e.ctrlKey || e.metaKey) {
      next.has(path) ? next.delete(path) : next.add(path);
    } else if (e.shiftKey && selected.size > 0) {
      // 범위 선택
      const idxs = files.map((f, i) => [f.path, i]);
      const lastSelected = Array.from(selected).pop();
      const lastIdx = idxs.find(([p]) => p === lastSelected)?.[1] ?? 0;
      const thisIdx = idxs.find(([p]) => p === path)?.[1] ?? 0;
      const [a, b] = [Math.min(lastIdx, thisIdx), Math.max(lastIdx, thisIdx)];
      for (let i = a; i <= b; i++) next.add(files[i].path);
    } else {
      next.clear();
      next.add(path);
    }
    setSelected(next);
  };

  const selectAll = () => setSelected(new Set(files.map(f => f.path)));
  const clearSelection = () => setSelected(new Set());

  // ── 클립보드 (복사/잘라내기/붙여넣기) ────
  const doCopy = () => {
    if (selected.size === 0) return;
    setClipboard({ op: 'copy', paths: Array.from(selected) });
  };
  const doCut = () => {
    if (selected.size === 0) return;
    setClipboard({ op: 'cut', paths: Array.from(selected) });
  };
  const doPaste = async () => {
    if (!clipboard || clipboard.paths.length === 0) return;
    const api = window.electronAPI.files;
    const fn = clipboard.op === 'cut' ? api.move : api.copy;
    const result = await fn(clipboard.paths, currentPath);
    if (!result.success) { alert('작업 실패: ' + result.error); return; }
    if (clipboard.op === 'cut') setClipboard(null);
    loadDir(currentPath, false);
  };

  // ── 삭제 ────────────────────────────
  const doDelete = async () => {
    if (selected.size === 0) return;
    if (!window.confirm(`${selected.size}개 항목을 휴지통으로 보낼까요?`)) return;
    const result = await window.electronAPI.files.delete(Array.from(selected));
    if (!result.success) { alert('삭제 실패: ' + result.error); return; }
    loadDir(currentPath, false);
  };

  // ── 이름 바꾸기 ─────────────────────
  const startRename = (f) => setRenaming({ path: f.path, name: f.name });
  const commitRename = async () => {
    if (!renaming) return;
    if (renaming.name.trim()) {
      const result = await window.electronAPI.files.rename(renaming.path, renaming.name.trim());
      if (!result.success) alert('이름 변경 실패: ' + result.error);
    }
    setRenaming(null);
    loadDir(currentPath, false);
  };

  // ── 새 폴더 ─────────────────────────
  const doNewFolder = async () => {
    const name = newFolderPrompt.trim() || '새 폴더';
    const result = await window.electronAPI.files.mkdir(currentPath, name);
    if (!result.success) { alert('폴더 생성 실패: ' + result.error); return; }
    setNewFolderPrompt('');
    loadDir(currentPath, false);
  };

  // ── 드래그앤드롭 ─────────────────────
  const onDragStart = (e, f) => {
    // 다중 선택인 경우 전체 이동, 아니면 단일
    const paths = selected.has(f.path) ? Array.from(selected) : [f.path];
    e.dataTransfer.setData('text/plain', JSON.stringify(paths));
    e.dataTransfer.effectAllowed = 'copyMove';
  };
  const onDragOverItem = (e, f) => {
    if (!f.isDir) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = e.ctrlKey ? 'copy' : 'move';
    setDragOver(f.path);
  };
  const onDropItem = async (e, f) => {
    e.preventDefault();
    setDragOver(null);
    if (!f.isDir) return;
    try {
      const paths = JSON.parse(e.dataTransfer.getData('text/plain'));
      if (paths.includes(f.path)) return; // 자기 자신
      const fn = e.ctrlKey ? window.electronAPI.files.copy : window.electronAPI.files.move;
      const result = await fn(paths, f.path);
      if (!result.success) alert('작업 실패: ' + result.error);
      loadDir(currentPath, false);
    } catch (err) { console.warn('[FileExplorer] drop error', err); }
  };
  const onDropContainer = async (e) => {
    e.preventDefault();
    setDragOver(null);
    try {
      // 외부 드롭
      if (e.dataTransfer.files?.length > 0) {
        const ext = Array.from(e.dataTransfer.files).map(f => f.path).filter(Boolean);
        if (ext.length > 0) {
          const result = await window.electronAPI.files.copy(ext, currentPath);
          if (!result.success) alert('복사 실패: ' + result.error);
          loadDir(currentPath, false);
          return;
        }
      }
      // 내부 드롭 (빈 공간 → 현재 폴더로)
      const raw = e.dataTransfer.getData('text/plain');
      if (raw) {
        const paths = JSON.parse(raw);
        const sameParent = paths.every(p => p.replace(/[\/\\][^\/\\]+$/, '') === currentPath);
        if (sameParent) return;
        const fn = e.ctrlKey ? window.electronAPI.files.copy : window.electronAPI.files.move;
        const result = await fn(paths, currentPath);
        if (!result.success) alert('작업 실패: ' + result.error);
        loadDir(currentPath, false);
      }
    } catch (err) { console.warn('[FileExplorer] container drop error', err); }
  };

  // ── 컨텍스트 메뉴 ───────────────────
  const openCtx = (e, target) => {
    e.preventDefault();
    e.stopPropagation();
    if (target && !selected.has(target.path)) {
      setSelected(new Set([target.path]));
    }
    setCtxMenu({ x: e.clientX, y: e.clientY, target });
  };

  useEffect(() => {
    const close = () => setCtxMenu(null);
    window.addEventListener('click', close);
    window.addEventListener('blur', close);
    return () => { window.removeEventListener('click', close); window.removeEventListener('blur', close); };
  }, []);

  // 키보드 단축키
  useEffect(() => {
    const onKey = (e) => {
      if (!containerRef.current?.contains(document.activeElement) && document.activeElement?.tagName === 'INPUT') return;
      if (renaming) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key === 'a') { e.preventDefault(); selectAll(); }
      else if (mod && e.key === 'c') { doCopy(); }
      else if (mod && e.key === 'x') { doCut(); }
      else if (mod && e.key === 'v') { doPaste(); }
      else if (e.key === 'Delete') { doDelete(); }
      else if (e.key === 'F2' && selected.size === 1) {
        const f = files.find(x => x.path === Array.from(selected)[0]);
        if (f) startRename(f);
      }
      else if (e.key === 'Escape') { clearSelection(); setCtxMenu(null); }
    };
    const el = containerRef.current;
    if (el) el.addEventListener('keydown', onKey);
    return () => { if (el) el.removeEventListener('keydown', onKey); };
    // eslint-disable-next-line
  }, [selected, clipboard, files, renaming]);

  // 빠른 이동 경로
  const quickPaths = () => {
    const isWin = navigator.platform.includes('Win');
    const home = isWin
      ? 'C:\\Users\\' + (currentPath.split('\\')[2] || 'user')
      : '/Users/' + (currentPath.split('/')[2] || 'user');
    const sep = isWin ? '\\' : '/';
    return {
      '바탕화면': home + sep + 'Desktop',
      '문서': home + sep + 'Documents',
      '다운로드': home + sep + 'Downloads',
      '사진': home + sep + 'Pictures'
    };
  };

  const goBack = () => {
    if (historyIdx > 0) {
      const p = pathHistory[historyIdx - 1];
      setHistoryIdx(historyIdx - 1);
      loadDir(p, false);
    }
  };
  const goForward = () => {
    if (historyIdx < pathHistory.length - 1) {
      const p = pathHistory[historyIdx + 1];
      setHistoryIdx(historyIdx + 1);
      loadDir(p, false);
    }
  };

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      style={{ height: '100%', display: 'flex', flexDirection: 'column', outline: 'none' }}
      onClick={() => clearSelection()}
      onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = e.ctrlKey ? 'copy' : 'move'; }}
      onDrop={onDropContainer}
    >
      {/* 타이틀 + 뷰 전환 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: theme.textColor }}>📂 파일 탐색기</div>
        <div style={{ display: 'flex', gap: 2 }}>
          <button onClick={e => { e.stopPropagation(); setViewMode('grid'); }}
            title="큰 아이콘"
            style={{ background: viewMode === 'grid' ? theme.accentColor : 'transparent', color: viewMode === 'grid' ? '#fff' : c(theme, '#6b7280', '#94a3b8'), border: 'none', borderRadius: 5, padding: '3px 6px', fontSize: 11, cursor: 'pointer' }}>▦</button>
          <button onClick={e => { e.stopPropagation(); setViewMode('list'); }}
            title="목록"
            style={{ background: viewMode === 'list' ? theme.accentColor : 'transparent', color: viewMode === 'list' ? '#fff' : c(theme, '#6b7280', '#94a3b8'), border: 'none', borderRadius: 5, padding: '3px 6px', fontSize: 11, cursor: 'pointer' }}>≡</button>
        </div>
      </div>

      {/* 툴바: 뒤로/앞으로/위로/새로고침 + 경로 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 3, marginBottom: 4, flexShrink: 0 }}>
        <button onClick={e => { e.stopPropagation(); goBack(); }} disabled={historyIdx <= 0}
          style={{ background: c(theme, '#f3f4f6', '#334155'), border: 'none', borderRadius: 5, width: 22, height: 22, cursor: historyIdx > 0 ? 'pointer' : 'not-allowed', opacity: historyIdx > 0 ? 1 : 0.4, fontSize: 11, color: theme.textColor }}>←</button>
        <button onClick={e => { e.stopPropagation(); goForward(); }} disabled={historyIdx >= pathHistory.length - 1}
          style={{ background: c(theme, '#f3f4f6', '#334155'), border: 'none', borderRadius: 5, width: 22, height: 22, cursor: historyIdx < pathHistory.length - 1 ? 'pointer' : 'not-allowed', opacity: historyIdx < pathHistory.length - 1 ? 1 : 0.4, fontSize: 11, color: theme.textColor }}>→</button>
        <button onClick={e => { e.stopPropagation(); loadDir(parentPath); }}
          title="상위 폴더"
          style={{ background: c(theme, '#f3f4f6', '#334155'), border: 'none', borderRadius: 5, width: 22, height: 22, cursor: 'pointer', fontSize: 11, color: theme.textColor }}>↑</button>
        <div style={{ flex: 1, fontSize: 10, color: c(theme, '#6b7280', '#94a3b8'), background: c(theme, '#f9fafb', '#1e293b'), padding: '3px 7px', borderRadius: 5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={currentPath}>{shortPath}</div>
        <button onClick={e => { e.stopPropagation(); loadDir(currentPath, false); }}
          title="새로고침"
          style={{ background: c(theme, '#f3f4f6', '#334155'), border: 'none', borderRadius: 5, width: 22, height: 22, cursor: 'pointer', fontSize: 10, color: theme.textColor }}>↻</button>
      </div>

      {/* 빠른 이동 */}
      <div style={{ display: 'flex', gap: 3, marginBottom: 4, flexShrink: 0, flexWrap: 'wrap' }}>
        {Object.entries(quickPaths()).map(([label, p]) => (
          <button key={label} onClick={e => { e.stopPropagation(); loadDir(p); }}
            style={{ background: c(theme, '#f3f4f6', '#334155'), border: 'none', borderRadius: 5, padding: '3px 8px', fontSize: 9, cursor: 'pointer', color: c(theme, '#475569', '#cbd5e1'), fontWeight: 600 }}>{label}</button>
        ))}
      </div>

      {/* 액션 바 */}
      <div style={{ display: 'flex', gap: 3, marginBottom: 5, flexShrink: 0 }}>
        <button onClick={e => { e.stopPropagation(); doNewFolder(); }}
          title="새 폴더 만들기"
          style={{ background: theme.accentColor + '20', color: theme.accentColor, border: 'none', borderRadius: 5, padding: '3px 8px', fontSize: 9, cursor: 'pointer', fontWeight: 600 }}>+ 폴더</button>
        <button onClick={e => { e.stopPropagation(); doCopy(); }} disabled={selected.size === 0}
          style={{ background: c(theme, '#f3f4f6', '#334155'), border: 'none', borderRadius: 5, padding: '3px 8px', fontSize: 9, cursor: selected.size > 0 ? 'pointer' : 'not-allowed', opacity: selected.size > 0 ? 1 : 0.4, color: c(theme, '#475569', '#cbd5e1') }}>📋 복사</button>
        <button onClick={e => { e.stopPropagation(); doCut(); }} disabled={selected.size === 0}
          style={{ background: c(theme, '#f3f4f6', '#334155'), border: 'none', borderRadius: 5, padding: '3px 8px', fontSize: 9, cursor: selected.size > 0 ? 'pointer' : 'not-allowed', opacity: selected.size > 0 ? 1 : 0.4, color: c(theme, '#475569', '#cbd5e1') }}>✂️ 잘라내기</button>
        <button onClick={e => { e.stopPropagation(); doPaste(); }} disabled={!clipboard}
          style={{ background: clipboard ? theme.accentColor + '20' : c(theme, '#f3f4f6', '#334155'), color: clipboard ? theme.accentColor : c(theme, '#475569', '#cbd5e1'), border: 'none', borderRadius: 5, padding: '3px 8px', fontSize: 9, cursor: clipboard ? 'pointer' : 'not-allowed', opacity: clipboard ? 1 : 0.4, fontWeight: 600 }}>📌 붙여넣기</button>
        <button onClick={e => { e.stopPropagation(); doDelete(); }} disabled={selected.size === 0}
          style={{ background: selected.size > 0 ? '#fee2e2' : c(theme, '#f3f4f6', '#334155'), color: selected.size > 0 ? '#dc2626' : c(theme, '#475569', '#cbd5e1'), border: 'none', borderRadius: 5, padding: '3px 8px', fontSize: 9, cursor: selected.size > 0 ? 'pointer' : 'not-allowed', opacity: selected.size > 0 ? 1 : 0.4 }}>🗑 삭제</button>
        {selected.size > 0 && (
          <div style={{ fontSize: 9, color: c(theme, '#6b7280', '#94a3b8'), alignSelf: 'center', marginLeft: 'auto' }}>
            {selected.size}개 선택
          </div>
        )}
      </div>

      {/* 파일 목록 */}
      <div
        style={{
          flex: 1, minHeight: 0, overflow: 'auto',
          padding: 4, borderRadius: 6,
          background: c(theme, '#fafafa', '#0f172a'),
          border: `1px dashed ${c(theme, '#e5e7eb', '#334155')}`
        }}
        onContextMenu={e => openCtx(e, null)}
      >
        {error && <div style={{ fontSize: 10, color: '#dc2626', padding: '4px 0' }}>⚠ {error}</div>}
        {files.length === 0 && !error && (
          <div style={{ textAlign: 'center', padding: 20, color: c(theme, '#9ca3af', '#64748b'), fontSize: 11 }}>
            빈 폴더입니다
          </div>
        )}

        {viewMode === 'grid' && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(68px, 1fr))',
            gap: 4
          }}>
            {files.map((f, i) => {
              const isSel = selected.has(f.path);
              const isClippedCut = clipboard?.op === 'cut' && clipboard.paths.includes(f.path);
              const icon = getIcon(f);
              const isDragTarget = dragOver === f.path;
              return (
                <div
                  key={i}
                  draggable
                  onDragStart={e => onDragStart(e, f)}
                  onDragOver={e => onDragOverItem(e, f)}
                  onDragLeave={() => setDragOver(null)}
                  onDrop={e => onDropItem(e, f)}
                  onClick={e => toggleSelect(f.path, e)}
                  onDoubleClick={() => f.isDir ? loadDir(f.path) : window.electronAPI.files.openPath(f.path)}
                  onContextMenu={e => openCtx(e, f)}
                  style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center',
                    padding: '6px 3px', borderRadius: 7,
                    background: isDragTarget ? theme.accentColor + '30' : (isSel ? theme.accentColor + '20' : 'transparent'),
                    border: `1px solid ${isDragTarget ? theme.accentColor : (isSel ? theme.accentColor + '80' : 'transparent')}`,
                    cursor: 'pointer',
                    opacity: isClippedCut ? 0.45 : 1,
                    transition: 'background 0.1s, border 0.1s'
                  }}
                >
                  <div style={{
                    fontSize: 28, lineHeight: 1, marginBottom: 3,
                    filter: f.isDir ? 'drop-shadow(0 2px 2px rgba(251,191,36,0.3))' : 'none'
                  }}>{icon.emoji}</div>
                  {renaming?.path === f.path ? (
                    <input
                      autoFocus
                      value={renaming.name}
                      onChange={e => setRenaming({ ...renaming, name: e.target.value })}
                      onKeyDown={e => {
                        if (e.key === 'Enter') commitRename();
                        if (e.key === 'Escape') setRenaming(null);
                      }}
                      onBlur={commitRename}
                      onClick={e => e.stopPropagation()}
                      style={{
                        width: '95%', fontSize: 9, textAlign: 'center',
                        border: `1.5px solid ${theme.accentColor}`, borderRadius: 4, padding: '1px 3px',
                        outline: 'none', background: c(theme, '#fff', '#1e293b'), color: theme.textColor
                      }}
                    />
                  ) : (
                    <div style={{
                      fontSize: 9, textAlign: 'center',
                      color: c(theme, '#374151', '#e2e8f0'),
                      width: '100%',
                      wordBreak: 'break-all',
                      display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                      overflow: 'hidden', lineHeight: 1.2,
                      fontWeight: isSel ? 700 : 500
                    }}>{f.name}</div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {viewMode === 'list' && (
          <div>
            {files.map((f, i) => {
              const isSel = selected.has(f.path);
              const isClippedCut = clipboard?.op === 'cut' && clipboard.paths.includes(f.path);
              const icon = getIcon(f);
              const isDragTarget = dragOver === f.path;
              return (
                <div
                  key={i}
                  draggable
                  onDragStart={e => onDragStart(e, f)}
                  onDragOver={e => onDragOverItem(e, f)}
                  onDragLeave={() => setDragOver(null)}
                  onDrop={e => onDropItem(e, f)}
                  onClick={e => toggleSelect(f.path, e)}
                  onDoubleClick={() => f.isDir ? loadDir(f.path) : window.electronAPI.files.openPath(f.path)}
                  onContextMenu={e => openCtx(e, f)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '4px 6px', borderRadius: 5, cursor: 'pointer',
                    background: isDragTarget ? theme.accentColor + '30' : (isSel ? theme.accentColor + '20' : 'transparent'),
                    border: `1px solid ${isDragTarget ? theme.accentColor : 'transparent'}`,
                    opacity: isClippedCut ? 0.45 : 1
                  }}
                >
                  <span style={{ fontSize: 16, flexShrink: 0 }}>{icon.emoji}</span>
                  {renaming?.path === f.path ? (
                    <input
                      autoFocus
                      value={renaming.name}
                      onChange={e => setRenaming({ ...renaming, name: e.target.value })}
                      onKeyDown={e => {
                        if (e.key === 'Enter') commitRename();
                        if (e.key === 'Escape') setRenaming(null);
                      }}
                      onBlur={commitRename}
                      onClick={e => e.stopPropagation()}
                      style={{ flex: 1, fontSize: 11, border: `1.5px solid ${theme.accentColor}`, borderRadius: 4, padding: '1px 5px', outline: 'none', background: c(theme, '#fff', '#1e293b'), color: theme.textColor }}
                    />
                  ) : (
                    <span style={{ flex: 1, fontSize: 11, color: theme.textColor, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: isSel ? 700 : 500 }}>{f.name}</span>
                  )}
                  {!f.isDir && f.size > 0 && <span style={{ fontSize: 9, color: c(theme, '#9ca3af', '#64748b'), flexShrink: 0 }}>{formatSize(f.size)}</span>}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 컨텍스트 메뉴 — Portal */}
      {ctxMenu && ReactDOM.createPortal(
        <div style={{
          position: 'fixed', zIndex: 10000,
          left: Math.min(ctxMenu.x, window.innerWidth - 200),
          top: Math.min(ctxMenu.y, window.innerHeight - 280),
          background: c(theme, '#fff', '#1e293b'),
          border: `1px solid ${c(theme, '#e5e7eb', '#475569')}`,
          borderRadius: 10, padding: '6px 0', minWidth: 180,
          boxShadow: '0 12px 32px rgba(0,0,0,0.25)'
        }} onClick={e => e.stopPropagation()}>
          {ctxMenu.target && (
            <>
              <CtxItem theme={theme} icon="📂" label={ctxMenu.target.isDir ? '열기' : '실행'} onClick={() => {
                ctxMenu.target.isDir ? loadDir(ctxMenu.target.path) : window.electronAPI.files.openPath(ctxMenu.target.path);
                setCtxMenu(null);
              }} />
              <CtxItem theme={theme} icon="📁" label="탐색기에서 보기" onClick={() => {
                window.electronAPI.files.showInFolder(ctxMenu.target.path); setCtxMenu(null);
              }} />
              <CtxDivider theme={theme} />
              <CtxItem theme={theme} icon="📋" label="복사" shortcut="Ctrl+C" onClick={() => { doCopy(); setCtxMenu(null); }} />
              <CtxItem theme={theme} icon="✂️" label="잘라내기" shortcut="Ctrl+X" onClick={() => { doCut(); setCtxMenu(null); }} />
              <CtxItem theme={theme} icon="✏️" label="이름 바꾸기" shortcut="F2" onClick={() => { startRename(ctxMenu.target); setCtxMenu(null); }} />
              <CtxDivider theme={theme} />
              <CtxItem theme={theme} icon="🗑" label="휴지통으로" danger onClick={() => { doDelete(); setCtxMenu(null); }} />
            </>
          )}
          {!ctxMenu.target && (
            <>
              <CtxItem theme={theme} icon="📌" label="붙여넣기" shortcut="Ctrl+V" disabled={!clipboard} onClick={() => { doPaste(); setCtxMenu(null); }} />
              <CtxItem theme={theme} icon="➕" label="새 폴더" onClick={() => { doNewFolder(); setCtxMenu(null); }} />
              <CtxItem theme={theme} icon="↻" label="새로고침" onClick={() => { loadDir(currentPath, false); setCtxMenu(null); }} />
              <CtxItem theme={theme} icon="📑" label="모두 선택" shortcut="Ctrl+A" onClick={() => { selectAll(); setCtxMenu(null); }} />
            </>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}

// 컨텍스트 메뉴 헬퍼
function CtxItem({ theme, icon, label, shortcut, onClick, disabled, danger }) {
  return (
    <div onClick={!disabled ? onClick : undefined} style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '7px 14px', fontSize: 12,
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.4 : 1,
      color: danger ? '#dc2626' : c(theme, '#374151', '#e2e8f0'),
      transition: 'background 0.1s'
    }}
      onMouseEnter={e => { if (!disabled) e.currentTarget.style.background = c(theme, '#f3f4f6', '#334155'); }}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
    >
      <span style={{ fontSize: 13 }}>{icon}</span>
      <span style={{ flex: 1 }}>{label}</span>
      {shortcut && <span style={{ fontSize: 10, color: c(theme, '#9ca3af', '#64748b') }}>{shortcut}</span>}
    </div>
  );
}
function CtxDivider({ theme }) {
  return <div style={{ height: 1, background: c(theme, '#f3f4f6', '#334155'), margin: '4px 0' }} />;
}

// ── 디지털 액자 + 음악 위젯 ─────────────────────────────────
function MusicWidget({ theme }) {
  const [photos, setPhotos] = useState(() => {
    try { return JSON.parse(localStorage.getItem('frame-photos') || '[]'); } catch { return []; }
  });
  const [currentIdx, setCurrentIdx] = useState(0);
  const [tab, setTab] = useState(photos.length > 0 ? 'photo' : 'music');

  // 사진 슬라이드 자동 전환 (5초)
  useEffect(() => {
    if (photos.length <= 1) return;
    const t = setInterval(() => setCurrentIdx(i => (i + 1) % photos.length), 5000);
    return () => clearInterval(t);
  }, [photos.length]);

  // 이미지 리사이즈 (최대 800px, localStorage 용량 절약)
  const resizeImage = (dataUrl, maxSize = 800) => new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let { width, height } = img;
      if (width > maxSize || height > maxSize) {
        const ratio = Math.min(maxSize / width, maxSize / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }
      canvas.width = width; canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', 0.7)); // JPEG 70% 품질
    };
    img.onerror = () => resolve(dataUrl); // 실패 시 원본
    img.src = dataUrl;
  });

  const addPhoto = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*,.gif';
    input.multiple = true;
    input.onchange = (e) => {
      const files = Array.from(e.target.files).slice(0, 10); // 최대 10장
      files.forEach(file => {
        const reader = new FileReader();
        reader.onload = async (ev) => {
          const resized = await resizeImage(ev.target.result);
          setPhotos(prev => {
            if (prev.length >= 20) { alert('사진은 최대 20장까지 추가할 수 있습니다.'); return prev; }
            const updated = [...prev, resized];
            try { localStorage.setItem('frame-photos', JSON.stringify(updated)); }
            catch { alert('저장 용량을 초과했습니다. 기존 사진을 삭제해 주세요.'); return prev; }
            setTab('photo');
            return updated;
          });
        };
        reader.readAsDataURL(file);
      });
    };
    input.click();
  };

  const removePhoto = (idx) => {
    const updated = photos.filter((_, i) => i !== idx);
    setPhotos(updated);
    localStorage.setItem('frame-photos', JSON.stringify(updated));
    if (currentIdx >= updated.length) setCurrentIdx(0);
  };

  const open = (url) => {
    if (window.electronAPI) window.electronAPI.shell.openExternal(url);
    else window.open(url, '_blank');
  };

  const services = [
    { name: 'YouTube Music', icon: '🎵', url: 'https://music.youtube.com', color: '#ff0000' },
    { name: 'Spotify', icon: '🟢', url: 'https://open.spotify.com', color: '#1db954' },
    { name: 'Melon', icon: '🍈', url: 'https://www.melon.com', color: '#00cd3c' },
    { name: 'Apple Music', icon: '🍎', url: 'https://music.apple.com', color: '#fc3c44' },
  ];

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* 탭 */}
      <div style={{ display: 'flex', gap: 3, marginBottom: 6, flexShrink: 0 }}>
        <button onClick={() => setTab('photo')} style={{ flex: 1, padding: '3px', borderRadius: 5, fontSize: 10, fontWeight: tab === 'photo' ? 600 : 400, border: 'none', cursor: 'pointer', background: tab === 'photo' ? theme.accentColor : c(theme, '#f3f4f6', '#334155'), color: tab === 'photo' ? '#fff' : c(theme, '#6b7280', '#94a3b8') }}>🖼 액자</button>
        <button onClick={() => setTab('music')} style={{ flex: 1, padding: '3px', borderRadius: 5, fontSize: 10, fontWeight: tab === 'music' ? 600 : 400, border: 'none', cursor: 'pointer', background: tab === 'music' ? theme.accentColor : c(theme, '#f3f4f6', '#334155'), color: tab === 'music' ? '#fff' : c(theme, '#6b7280', '#94a3b8') }}>🎧 음악</button>
      </div>

      {tab === 'photo' ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          {photos.length > 0 ? (
            <div style={{ flex: 1, position: 'relative', borderRadius: 8, overflow: 'hidden', background: '#000', minHeight: 60 }}>
              {photos[currentIdx]?.startsWith('data:video') ? (
                <video src={photos[currentIdx]} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain' }} autoPlay muted loop />
              ) : (
                <img src={photos[currentIdx]} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain' }} />
              )}
              {/* 인디케이터 */}
              {photos.length > 1 && (
                <div style={{ position: 'absolute', bottom: 4, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 3 }}>
                  {photos.map((_, i) => <div key={i} style={{ width: 5, height: 5, borderRadius: '50%', background: i === currentIdx ? '#fff' : 'rgba(255,255,255,0.4)' }} />)}
                </div>
              )}
              {/* 삭제 */}
              <button onClick={() => removePhoto(currentIdx)} style={{ position: 'absolute', top: 3, right: 3, background: 'rgba(0,0,0,0.5)', color: '#fff', border: 'none', borderRadius: 4, padding: '1px 5px', fontSize: 10, cursor: 'pointer' }}>✕</button>
            </div>
          ) : (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', fontSize: 11 }}>
              사진을 추가하세요
            </div>
          )}
          <button onClick={addPhoto} style={{ marginTop: 4, background: c(theme, '#f3f4f6', '#334155'), border: 'none', borderRadius: 6, padding: '4px', fontSize: 10, cursor: 'pointer', color: theme.textColor, flexShrink: 0 }}>📷 사진 추가</button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
          {services.map(s => (
            <button key={s.name} onClick={() => open(s.url)}
              style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 6px', borderRadius: 6, border: 'none', cursor: 'pointer', background: c(theme, '#f9fafb', '#334155'), color: theme.textColor, fontSize: 9, transition: 'background 0.15s' }}
              onMouseEnter={e => e.currentTarget.style.background = s.color + '20'}
              onMouseLeave={e => e.currentTarget.style.background = c(theme, '#f9fafb', '#334155')}
            >
              <span style={{ fontSize: 13 }}>{s.icon}</span>
              <span>{s.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── 커뮤니케이션 허브 (메일 + 구글챗) ────────────────────────
function CommHub({ theme }) {
  const { state } = useApp();
  const { google, microsoft } = state;
  const [tab, setTab] = useState('mail');

  const tabStyle = (active) => ({
    flex: 1, padding: '6px 0', borderRadius: 7, fontSize: 11, fontWeight: active ? 600 : 400,
    border: 'none', cursor: 'pointer',
    background: active ? theme.accentColor : c(theme, '#f3f4f6', '#334155'),
    color: active ? '#fff' : c(theme, '#6b7280', '#94a3b8'),
    transition: 'all 0.15s'
  });

  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <div>
      {/* 탭 헤더 */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
        <button onClick={() => setTab('mail')} style={tabStyle(tab === 'mail')}>📧 받은 메일</button>
        <button onClick={() => setTab('chat')} style={tabStyle(tab === 'chat')}>💬 Google Chat</button>
        <button onClick={() => setRefreshKey(k => k + 1)}
          style={{ width: 28, borderRadius: 7, border: 'none', cursor: 'pointer', background: c(theme, '#f3f4f6', '#334155'), color: c(theme, '#6b7280', '#94a3b8'), fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          title="새로고침">🔄</button>
      </div>

      {tab === 'mail' ? (
        <CommMailTab theme={theme} google={google} microsoft={microsoft} refreshKey={refreshKey} />
      ) : (
        <CommChatTab theme={theme} google={google} />
      )}
    </div>
  );
}

function CommMailTab({ theme, google, microsoft, refreshKey }) {
  const [emails, setEmails] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadEmails() {
      setLoading(true);
      let all = [];

      // 실제 Gmail API 호출
      if (google.connected && google.accessToken) {
        try {
          const { setTokens, getRecentEmails } = await import('./services/googleService');
          // 저장된 토큰을 서비스에 복원
          setTokens(google.accessToken, google.refreshToken, 3600);
          const gmails = await getRecentEmails(5);
          all = [...all, ...gmails.map(e => ({ ...e, source: 'gmail' }))];
        } catch (err) {
          console.error('Gmail fetch failed:', err);
          // 토큰 만료 등 에러 시 안내
          all.push({ id: 'err', subject: '메일을 불러올 수 없습니다 (재로그인 필요)', from: '', date: '', unread: false, source: 'gmail' });
        }
      }

      setEmails(all);
      setLoading(false);
    }
    loadEmails();
  }, [google.connected, google.accessToken, microsoft.connected, refreshKey]);

  if (!google.connected && !microsoft.connected) {
    return (
      <div style={{ textAlign: 'center', color: '#9ca3af', fontSize: 12, padding: '12px 0' }}>
        <div style={{ fontSize: 24, marginBottom: 6 }}>📧</div>
        Google 연동 후 메일이 표시됩니다
        <div style={{ marginTop: 6 }}>
          <button onClick={() => window.dispatchEvent(new CustomEvent('open-settings-tab', { detail: 'google' }))}
            style={{ background: '#4285f4', color: '#fff', border: 'none', borderRadius: 6, padding: '4px 10px', fontSize: 11, cursor: 'pointer' }}>
            🔗 Google 연동하기
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return <div style={{ textAlign: 'center', color: '#9ca3af', fontSize: 12, padding: '12px 0' }}>메일 불러오는 중...</div>;
  }

  const unread = emails.filter(e => e.unread).length;

  return (
    <div>
      {unread > 0 && <div style={{ fontSize: 11, color: theme.accentColor, marginBottom: 6 }}>읽지 않은 메일 {unread}통</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 140, overflowY: 'auto' }}>
        {emails.map(e => (
          <div key={e.id} onClick={() => {
            const url = e.source === 'gmail' ? 'https://mail.google.com' : 'https://outlook.office.com/mail';
            window.electronAPI?.shell?.openExternal(url);
          }} style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 8, cursor: 'pointer',
            background: e.unread ? c(theme, '#fefce8', '#1e293b') : 'transparent',
            border: `0.5px solid ${e.unread ? c(theme, '#fde68a', '#334155') : 'transparent'}`
          }}>
            {e.unread && <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#3b82f6', flexShrink: 0 }} />}
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <div style={{ fontSize: 12, fontWeight: e.unread ? 600 : 400, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.subject}</div>
              <div style={{ fontSize: 10, color: c(theme, '#9ca3af', '#64748b') }}>{e.from}</div>
            </div>
            <div style={{ fontSize: 10, color: c(theme, '#9ca3af', '#64748b'), flexShrink: 0 }}>{e.time}</div>
            <span style={{ fontSize: 9, color: c(theme, '#9ca3af', '#475569'), background: c(theme, '#f3f4f6', '#1e293b'), borderRadius: 4, padding: '1px 4px' }}>
              {e.source === 'gmail' ? 'G' : 'M'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function CommChatTab({ theme, google }) {
  if (!google.connected) {
    return <div style={{ textAlign: 'center', color: '#9ca3af', fontSize: 12, padding: '16px 0' }}>Google 연동 후 Chat을 사용할 수 있습니다</div>;
  }

  const openChat = () => {
    if (window.electronAPI?.shell?.openGoogleChat) window.electronAPI.shell.openGoogleChat();
    else window.open('https://chat.google.com', '_blank');
  };

  return (
    <div style={{ textAlign: 'center', padding: '16px 8px' }}>
      <div style={{ fontSize: 32, marginBottom: 8 }}>💬</div>
      <div style={{ fontSize: 13, fontWeight: 600, color: c(theme, '#1f2937', '#e2e8f0'), marginBottom: 4 }}>Google Chat</div>
      <div style={{ fontSize: 11, color: c(theme, '#6b7280', '#94a3b8'), marginBottom: 12 }}>
        앱 내 창으로 바로 열립니다
      </div>
      <button onClick={openChat} style={{
        background: '#1a73e8', color: '#fff', border: 'none', borderRadius: 8,
        padding: '9px 22px', fontSize: 12, fontWeight: 600, cursor: 'pointer'
      }}>
        Google Chat 열기 →
      </button>
    </div>
  );
}

// ── 오늘/이번 주 일정 위젯 ──────────────────────────────────
function UpcomingEvents({ theme }) {
  const { state } = useApp();
  const { google, cache } = state;
  const [events, setEvents] = useState([]);

  useEffect(() => {
    async function load() {
      if (google.connected && google.accessToken) {
        try {
          const { setTokens, getCalendarEvents } = await import('./services/googleService');
          setTokens(google.accessToken, google.refreshToken, 3600);
          const calIds = google.selectedCalendarIds?.length ? google.selectedCalendarIds : ['primary'];
          const evts = await getCalendarEvents(undefined, undefined, calIds);
          setEvents(evts.slice(0, 3));
        } catch (e) {
          console.log('Calendar fetch failed:', e);
          // 캐시된 이벤트 사용
          setEvents((cache.calendarEvents || []).slice(0, 3));
        }
      } else {
        setEvents((cache.calendarEvents || []).slice(0, 3));
      }
    }
    load();
  }, [google.connected, google.accessToken]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={card(theme, { flex: 1 })}>
      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>📅 다가오는 일정</div>
      {events.length === 0 ? (
        <div style={{ fontSize: 11, color: '#9ca3af', textAlign: 'center', padding: '12px 0' }}>
          {google.connected ? '예정된 일정이 없습니다' : '캘린더에 일정을 추가하세요'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {events.map(ev => (
            <div key={ev.id} style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '4px 6px', borderRadius: 6,
              background: c(theme, '#f9fafb', '#0f172a')
            }}>
              <div style={{ width: 3, height: 24, borderRadius: 2, background: ev.color || theme.accentColor, flexShrink: 0 }} />
              <div style={{ flex: 1, overflow: 'hidden' }}>
                <div style={{ fontSize: 11, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ev.title}</div>
                <div style={{ fontSize: 10, color: c(theme, '#9ca3af', '#64748b') }}>
                  {ev.date?.slice(5)} {ev.time && `· ${ev.time}`}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── 즐겨찾기 바로가기 ────────────────────────────────────────
const DEFAULT_BOOKMARKS = [
  { id: 1, name: 'NEIS', icon: '🏫', url: 'https://neis.go.kr', type: 'web' },
  { id: 2, name: '나이스', icon: '📋', url: 'https://eduro.go.kr', type: 'web' },
  { id: 3, name: 'YouTube', icon: '▶️', url: 'https://youtube.com', type: 'web' },
  { id: 4, name: '클래스룸', icon: '🎓', url: 'https://classroom.google.com', type: 'web' },
  { id: 5, name: '메모장', icon: '📝', url: 'notepad.exe', type: 'app' },
  { id: 6, name: '계산기', icon: '🔢', url: 'calc.exe', type: 'app' },
];

function QuickLinks({ theme }) {
  const { state, actions } = useApp();
  const [bookmarks, setBookmarks] = useState(state.favorites?.length > 0 ? state.favorites : DEFAULT_BOOKMARKS);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: '', url: '', icon: '🔗', type: 'web' });

  const open = (bm) => {
    if (!bm.url) return;
    if (bm.type === 'app') {
      // 프로그램 실행
      if (window.electronAPI) window.electronAPI.shell.openPath(bm.url);
    } else {
      // 웹사이트
      if (window.electronAPI) window.electronAPI.shell.openExternal(bm.url);
      else window.open(bm.url, '_blank');
    }
  };

  const addBookmark = () => {
    if (!form.name) return;
    const newBm = [...bookmarks, { id: Date.now(), ...form }];
    setBookmarks(newBm);
    actions.setFavorites(newBm);
    setForm({ name: '', url: '', icon: '🔗', type: 'web' });
    setAdding(false);
  };

  const removeBookmark = (id) => {
    const newBm = bookmarks.filter(b => b.id !== id);
    setBookmarks(newBm);
    actions.setFavorites(newBm);
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 600 }}>⭐ 바로가기</span>
        <button onClick={() => setAdding(!adding)} style={{ background: theme.accentColor, color: '#fff', border: 'none', borderRadius: 5, padding: '2px 7px', fontSize: 10, cursor: 'pointer' }}>+</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4 }}>
        {bookmarks.map(bm => (
          <div key={bm.id}
            onClick={() => open(bm)}
            onContextMenu={(e) => { e.preventDefault(); removeBookmark(bm.id); }}
            title={`${bm.url || '미설정'} (${bm.type === 'app' ? '프로그램' : '웹'}) · 우클릭 삭제`}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
              padding: '6px 2px', borderRadius: 8, cursor: bm.url ? 'pointer' : 'default',
              transition: 'background 0.15s',
              opacity: bm.url ? 1 : 0.5
            }}
            onMouseEnter={e => e.currentTarget.style.background = c(theme, '#f3f4f6', '#334155')}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            <span style={{ fontSize: 20 }}>{bm.icon}</span>
            <span style={{ fontSize: 9, color: c(theme, '#6b7280', '#94a3b8'), textAlign: 'center', lineHeight: 1.2 }}>{bm.name}</span>
          </div>
        ))}
      </div>

      {adding && (
        <div style={{ marginTop: 6, background: c(theme, '#f9fafb', '#0f172a'), borderRadius: 8, padding: 8 }}>
          {/* 웹/앱 선택 */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
            {[{ key: 'web', label: '🌐 웹사이트' }, { key: 'app', label: '💻 프로그램' }].map(t => (
              <button key={t.key} onClick={() => setForm({ ...form, type: t.key })}
                style={{ flex: 1, padding: '4px', borderRadius: 6, fontSize: 10, fontWeight: form.type === t.key ? 600 : 400, border: 'none', cursor: 'pointer', background: form.type === t.key ? theme.accentColor : c(theme, '#e5e7eb', '#334155'), color: form.type === t.key ? '#fff' : c(theme, '#6b7280', '#94a3b8') }}>
                {t.label}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
            <input value={form.icon} onChange={e => setForm({ ...form, icon: e.target.value })}
              style={{ width: 36, border: `1px solid ${theme.borderColor}`, borderRadius: 6, padding: '4px', fontSize: 16, textAlign: 'center', outline: 'none', background: c(theme, '#fff', '#1e293b'), color: theme.textColor }}
              placeholder="📌" />
            <input placeholder="이름" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
              style={{ flex: 1, border: `1px solid ${theme.borderColor}`, borderRadius: 6, padding: '4px 8px', fontSize: 11, outline: 'none', fontFamily: 'inherit', background: c(theme, '#fff', '#1e293b'), color: theme.textColor }} />
          </div>
          <input
            placeholder={form.type === 'web' ? 'https://example.com' : 'C:\\Program Files\\...\\app.exe'}
            value={form.url} onChange={e => setForm({ ...form, url: e.target.value })}
            style={{ width: '100%', border: `1px solid ${theme.borderColor}`, borderRadius: 6, padding: '4px 8px', fontSize: 11, marginBottom: 4, outline: 'none', fontFamily: 'inherit', background: c(theme, '#fff', '#1e293b'), color: theme.textColor }} />
          <div style={{ display: 'flex', gap: 4 }}>
            <button onClick={addBookmark} style={{ flex: 1, background: theme.accentColor, color: '#fff', border: 'none', borderRadius: 5, padding: '4px', fontSize: 11, cursor: 'pointer' }}>추가</button>
            <button onClick={() => setAdding(false)} style={{ flex: 1, background: c(theme, '#e5e7eb', '#334155'), color: c(theme, '#6b7280', '#94a3b8'), border: 'none', borderRadius: 5, padding: '4px', fontSize: 11, cursor: 'pointer' }}>취소</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── 바탕화면 모드 토글 ──────────────────────────────────────
function DesktopModeToggle({ theme, onModeChange }) {
  const [desktopMode, setDesktopMode] = useState(false);
  const [hover, setHover] = useState(false);

  const toggle = async () => {
    const newMode = !desktopMode;
    if (window.electronAPI?.desktop) {
      await window.electronAPI.desktop.toggle(newMode);
    }
    setDesktopMode(newMode);
    onModeChange?.(newMode);
  };

  // 초기 상태 로드
  useEffect(() => {
    if (window.electronAPI?.desktop) {
      window.electronAPI.desktop.getMode().then(mode => setDesktopMode(mode));
    }
  }, []);

  return (
    <button
      onClick={toggle}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 5,
        background: desktopMode ? theme.accentColor : c(theme, '#f3f4f6', '#334155'),
        color: desktopMode ? '#fff' : theme.textColor,
        border: `1px solid ${desktopMode ? theme.accentColor : theme.borderColor}`,
        borderRadius: 7, padding: '4px 10px', fontSize: 11,
        cursor: 'pointer', transition: 'all 0.2s',
        transform: hover ? 'scale(1.03)' : 'scale(1)'
      }}
      title={desktopMode ? '창 모드로 전환' : '바탕화면 모드로 전환'}
    >
      {desktopMode ? '🖥️ 바탕화면' : '🪟 창 모드'}
    </button>
  );
}

// ── 하단 통합 검색 ──────────────────────────────────────────
function DockSearch({ theme, ext }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [show, setShow] = useState(false);

  const search = async (q) => {
    setQuery(q);
    if (q.length < 2) { setResults([]); setShow(false); return; }
    setShow(true);
    // 파일 검색
    if (window.electronAPI?.files?.search) {
      const files = await window.electronAPI.files.search(q);
      setResults(files || []);
    }
  };

  const getIcon = (name) => {
    const ext = name?.split('.').pop()?.toLowerCase();
    const icons = { pdf: '📄', doc: '📝', docx: '📝', xls: '📊', xlsx: '📊', ppt: '📎', hwp: '📝', txt: '📃', jpg: '🖼️', png: '🖼️', exe: '⚙️' };
    return icons[ext] || '📄';
  };

  return (
    <div style={{ position: 'relative', marginRight: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: c(theme, '#f3f4f6', '#1e293b'), borderRadius: 8, padding: '3px 8px' }}>
        <span style={{ fontSize: 12 }}>🔍</span>
        <input value={query} onChange={e => search(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && query.trim()) {
              ext(`https://www.google.com/search?q=${encodeURIComponent(query)}`)();
              setQuery(''); setShow(false);
            }
            if (e.key === 'Escape') { setQuery(''); setShow(false); }
          }}
          onFocus={() => query.length >= 2 && setShow(true)}
          onBlur={() => setTimeout(() => setShow(false), 200)}
          placeholder="파일·웹 검색..."
          style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: 11, width: 180, color: theme.textColor, fontFamily: 'inherit' }} />
      </div>

      {/* 검색 결과 드롭다운 */}
      {show && (
        <div style={{
          position: 'absolute', bottom: '110%', left: 0, width: 280,
          background: c(theme, '#fff', '#1e293b'), borderRadius: 10,
          boxShadow: '0 8px 32px rgba(0,0,0,0.15)', border: `1px solid ${theme.borderColor}`,
          padding: '6px 0', maxHeight: 250, overflow: 'auto', zIndex: 9999
        }}>
          {results.length > 0 && (
            <div style={{ padding: '2px 10px 4px', fontSize: 9, color: '#9ca3af', fontWeight: 600 }}>파일 ({results.length})</div>
          )}
          {results.map((f, i) => (
            <div key={i} onClick={() => { window.electronAPI?.shell?.openPath(f.path); setShow(false); setQuery(''); }}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', cursor: 'pointer', fontSize: 11 }}
              onMouseEnter={e => e.currentTarget.style.background = c(theme, '#f3f4f6', '#334155')}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <span style={{ fontSize: 13 }}>{getIcon(f.name)}</span>
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: theme.textColor }}>{f.name}</span>
            </div>
          ))}
          {results.length === 0 && query.length >= 2 && (
            <div style={{ padding: '8px 10px', fontSize: 10, color: '#9ca3af', textAlign: 'center' }}>파일을 찾을 수 없습니다</div>
          )}
          <div style={{ borderTop: `1px solid ${theme.borderColor}`, margin: '4px 0' }} />
          <div onClick={() => { ext(`https://www.google.com/search?q=${encodeURIComponent(query)}`)(); setShow(false); setQuery(''); }}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', cursor: 'pointer', fontSize: 11, color: '#3b82f6' }}>
            <span>🌐</span> <span>"{query}" 웹에서 검색</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ── 와이파이 상태 표시기 + 네트워크 팝업 ────────────────────
function WifiIndicator({ theme }) {
  const [online, setOnline] = useState(navigator.onLine);
  const [info, setInfo] = useState(null);
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState(false);
  const [current, setCurrent] = useState(null);   // { connected, ssid, signal }
  const [networks, setNetworks] = useState([]);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState(null);
  const btnRef = useRef(null);

  useEffect(() => {
    const onOn = () => setOnline(true);
    const onOff = () => setOnline(false);
    window.addEventListener('online', onOn);
    window.addEventListener('offline', onOff);

    const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    const updateInfo = () => {
      if (conn) {
        setInfo({
          type: conn.effectiveType || conn.type || '',
          downlink: conn.downlink || 0,
          rtt: conn.rtt || 0
        });
      }
    };
    updateInfo();
    conn?.addEventListener?.('change', updateInfo);

    return () => {
      window.removeEventListener('online', onOn);
      window.removeEventListener('offline', onOff);
      conn?.removeEventListener?.('change', updateInfo);
    };
  }, []);

  const doScan = useCallback(async () => {
    if (!window.electronAPI?.wifi) return;
    setScanning(true); setScanError(null);
    try {
      const [cur, scan] = await Promise.all([
        window.electronAPI.wifi.current(),
        window.electronAPI.wifi.scan()
      ]);
      setCurrent(cur);
      if (scan.error) setScanError(scan.error);
      setNetworks(scan.networks || []);
    } catch (e) {
      setScanError(e.message);
    }
    setScanning(false);
  }, []);

  useEffect(() => {
    if (open) doScan();
  }, [open, doScan]);

  // 신호 세기 바 (0~100 → 4 bars)
  const getBars = (signal) => {
    if (signal >= 75) return 4;
    if (signal >= 50) return 3;
    if (signal >= 25) return 2;
    if (signal > 0) return 1;
    return 0;
  };

  const getLabel = () => {
    if (!online) return '오프라인';
    if (current?.connected && current.ssid) return `${current.ssid} · ${current.signal}%`;
    if (info?.downlink) return `${info.type.toUpperCase()} · ${info.downlink}Mbps`;
    return '연결됨';
  };

  const handleConnect = async (ssid) => {
    if (!window.confirm(`"${ssid}"에 연결할까요?\n\n(저장된 프로필이 아닐 경우 Windows 설정 창이 열립니다)`)) return;
    const result = await window.electronAPI.wifi.connect(ssid);
    if (!result.success) {
      // 저장된 프로필이 아니면 시스템 설정 열기
      window.electronAPI.wifi.openSettings();
    } else {
      setTimeout(doScan, 1500);
    }
  };

  return (
    <>
      <div
        ref={btnRef}
        style={{ position: 'relative' }}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
      >
        {hover && !open && (
          <div style={{
            position: 'absolute', bottom: '115%', left: '50%', transform: 'translateX(-50%)',
            background: 'rgba(0,0,0,0.85)', color: '#fff', fontSize: 10, padding: '4px 10px',
            borderRadius: 6, whiteSpace: 'nowrap', pointerEvents: 'none', zIndex: 1000
          }}>
            {getLabel()}
          </div>
        )}
        <div
          onClick={() => setOpen(o => !o)}
          style={{
            width: 32, height: 32, borderRadius: 8,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 15, cursor: 'pointer',
            color: online ? (theme.darkMode ? '#34d399' : '#10b981') : (theme.darkMode ? '#f87171' : '#ef4444'),
            opacity: online ? 1 : 0.6,
            transition: 'all 0.2s',
            background: open ? (theme.darkMode ? '#334155' : '#e5e7eb') : 'transparent'
          }}
          onMouseEnter={e => { if (!open) e.currentTarget.style.background = theme.darkMode ? '#334155' : '#f3f4f6'; }}
          onMouseLeave={e => { if (!open) e.currentTarget.style.background = 'transparent'; }}
        >
          {online ? '📶' : '❌'}
        </div>
      </div>

      {/* 팝업 — Portal */}
      {open && ReactDOM.createPortal(
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 9998 }} />
          <div style={{
            position: 'fixed', zIndex: 9999,
            bottom: 60, right: 20,
            width: 320, maxHeight: 440,
            background: theme.darkMode ? '#1e293b' : '#fff',
            border: `1px solid ${theme.darkMode ? '#475569' : '#e5e7eb'}`,
            borderRadius: 14,
            boxShadow: '0 20px 50px rgba(0,0,0,0.3)',
            overflow: 'hidden',
            display: 'flex', flexDirection: 'column'
          }}>
            {/* 헤더 */}
            <div style={{
              padding: '12px 16px',
              borderBottom: `1px solid ${theme.darkMode ? '#334155' : '#f3f4f6'}`,
              display: 'flex', alignItems: 'center', gap: 10
            }}>
              <div style={{ fontSize: 18 }}>{online ? '📶' : '📡'}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: theme.darkMode ? '#e2e8f0' : '#1f2937' }}>
                  {current?.connected && current.ssid ? current.ssid : (online ? '네트워크 연결됨' : '오프라인')}
                </div>
                <div style={{ fontSize: 10, color: theme.darkMode ? '#94a3b8' : '#6b7280' }}>
                  {current?.connected ? `신호 ${current.signal}% · 연결됨` : getLabel()}
                </div>
              </div>
              <button onClick={doScan} disabled={scanning}
                title="다시 검색"
                style={{
                  background: theme.darkMode ? '#334155' : '#f3f4f6',
                  border: 'none', borderRadius: 7, padding: '6px 8px',
                  cursor: scanning ? 'wait' : 'pointer',
                  fontSize: 13, color: theme.darkMode ? '#cbd5e1' : '#475569'
                }}>
                {scanning ? '⏳' : '↻'}
              </button>
            </div>

            {/* 네트워크 목록 */}
            <div style={{ flex: 1, overflow: 'auto', padding: '6px 0', minHeight: 120 }}>
              {scanError && (
                <div style={{ padding: '12px 16px', fontSize: 11, color: '#f59e0b' }}>
                  ⚠ {scanError}
                </div>
              )}
              {!scanning && networks.length === 0 && !scanError && (
                <div style={{ padding: '20px 16px', textAlign: 'center', fontSize: 11, color: theme.darkMode ? '#64748b' : '#9ca3af' }}>
                  주변 네트워크가 없습니다
                </div>
              )}
              {scanning && networks.length === 0 && (
                <div style={{ padding: '20px 16px', textAlign: 'center', fontSize: 11, color: theme.darkMode ? '#64748b' : '#9ca3af' }}>
                  네트워크 검색 중…
                </div>
              )}
              {networks.map((n, i) => {
                const bars = getBars(n.signal);
                const isCurrent = current?.connected && current.ssid === n.ssid;
                return (
                  <div key={i}
                    onClick={() => !isCurrent && handleConnect(n.ssid)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '9px 16px',
                      cursor: isCurrent ? 'default' : 'pointer',
                      background: isCurrent ? (theme.darkMode ? '#334155' : '#f0f9ff') : 'transparent',
                      borderLeft: isCurrent ? `3px solid ${theme.accentColor}` : '3px solid transparent',
                      transition: 'background 0.1s'
                    }}
                    onMouseEnter={e => { if (!isCurrent) e.currentTarget.style.background = theme.darkMode ? '#334155' : '#f9fafb'; }}
                    onMouseLeave={e => { if (!isCurrent) e.currentTarget.style.background = 'transparent'; }}
                  >
                    {/* 신호 바 */}
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 1, width: 16, height: 14 }}>
                      {[1, 2, 3, 4].map(b => (
                        <div key={b} style={{
                          width: 3, height: b * 3 + 2,
                          background: b <= bars ? (isCurrent ? theme.accentColor : (theme.darkMode ? '#94a3b8' : '#6b7280')) : (theme.darkMode ? '#475569' : '#e5e7eb'),
                          borderRadius: 1
                        }} />
                      ))}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: 12, fontWeight: isCurrent ? 700 : 500,
                        color: theme.darkMode ? '#e2e8f0' : '#1f2937',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                      }}>
                        {n.ssid}
                      </div>
                      <div style={{ fontSize: 10, color: theme.darkMode ? '#64748b' : '#9ca3af' }}>
                        {isCurrent ? '✓ 연결됨' : (n.secured ? '🔒 보안' : '열림')} · {n.signal}%
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* 푸터 */}
            <div style={{
              padding: '10px 16px',
              borderTop: `1px solid ${theme.darkMode ? '#334155' : '#f3f4f6'}`,
              display: 'flex', gap: 6
            }}>
              <button onClick={() => { window.electronAPI.wifi.openSettings(); setOpen(false); }}
                style={{
                  flex: 1,
                  background: theme.darkMode ? '#334155' : '#f3f4f6',
                  color: theme.darkMode ? '#cbd5e1' : '#374151',
                  border: 'none', borderRadius: 7,
                  padding: '7px 10px', fontSize: 11,
                  cursor: 'pointer', fontWeight: 600
                }}>
                ⚙ 네트워크 설정 열기
              </button>
            </div>
          </div>
        </>,
        document.body
      )}
    </>
  );
}

// ── 배터리 상태 (노트북만 표시) ──────────────────────────────
function BatteryIndicator({ theme }) {
  const [battery, setBattery] = useState(null); // { level, charging }

  useEffect(() => {
    let batt = null;
    const update = () => {
      if (batt) setBattery({ level: Math.round(batt.level * 100), charging: batt.charging });
    };
    if (navigator.getBattery) {
      navigator.getBattery().then(b => {
        batt = b;
        update();
        b.addEventListener('levelchange', update);
        b.addEventListener('chargingchange', update);
      }).catch(() => {});
    }
    return () => {
      if (batt) {
        batt.removeEventListener('levelchange', update);
        batt.removeEventListener('chargingchange', update);
      }
    };
  }, []);

  // 배터리 API 미지원 또는 데스크톱(배터리 없음) → 숨김
  if (!battery) return null;

  const lv = battery.level;
  const icon = battery.charging ? '⚡' : lv > 80 ? '🔋' : lv > 20 ? '🪫' : '🪫';
  const color = battery.charging ? '#10b981' : lv > 50 ? (theme.darkMode ? '#e2e8f0' : '#374151') : lv > 20 ? '#f59e0b' : '#ef4444';

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 3,
      fontSize: 12, color, fontWeight: 600,
      padding: '0 4px', cursor: 'default',
      fontVariantNumeric: 'tabular-nums'
    }} title={battery.charging ? `충전 중 ${lv}%` : `배터리 ${lv}%`}>
      <span style={{ fontSize: 14 }}>{icon}</span>
      <span>{lv}%</span>
    </div>
  );
}

// ── 하단 독 ─────────────────────────────────────────────────
function DockBtn({ icon, label, theme, onClick, large }) {
  const [hover, setHover] = useState(false);
  const sz = large ? 42 : 34;
  const fs = large ? 18 : 15;
  return (
    <div style={{ position: 'relative' }}>
      {hover && <div style={{ position: 'absolute', bottom: '115%', left: '50%', transform: 'translateX(-50%)', background: 'rgba(0,0,0,0.8)', color: '#fff', fontSize: 10, padding: '2px 7px', borderRadius: 5, whiteSpace: 'nowrap', pointerEvents: 'none' }}>{label}</div>}
      <button onClick={onClick} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
        style={{ width: sz, height: sz, borderRadius: large ? 11 : 9, fontSize: fs, background: c(theme, 'rgba(255,255,255,0.9)', '#1e293b'), border: `1px solid ${theme.borderColor}`, cursor: 'pointer', transform: hover ? 'scale(1.12) translateY(-2px)' : 'scale(1)', transition: 'all 0.15s', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{icon}</button>
    </div>
  );
}

// ── 숨겨진 위젯 패널 (편집 모드, 접이식 + 드래그 이동) ───────
function HiddenWidgetsPanel({ theme, widgets, actions, defaultLayout, widgetLayout, updateLayout }) {
  const [open, setOpen] = useState(false);
  const ALL_WIDGETS = [
    { id: 'clock', label: '🕐 시계' }, { id: 'focus', label: '🎯 집중' },
    { id: 'currentPeriod', label: '📚 교시' }, { id: 'timetable', label: '📋 시간표' },
    { id: 'dday', label: '📅 D-Day' }, { id: 'quicklinks', label: '⭐ 바로가기' },
    { id: 'calendar', label: '📆 캘린더' }, { id: 'todos', label: '✅ 할 일' },
    { id: 'mail', label: '📧 메일' }, { id: 'recentfiles', label: '📂 파일' },
    { id: 'weather', label: '🌤️ 날씨' }, { id: 'meal', label: '🍽️ 급식' },
    { id: 'memo', label: '📝 메모' }, { id: 'music', label: '🎵 음악' },
    { id: 'system', label: '💻 시스템' }, { id: 'quote', label: '💭 명언' },
    { id: 'stopwatch', label: '⏱ 워치' }, { id: 'weekschedule', label: '📅 주간' },
    { id: 'neisalert', label: '🏫 NEIS' }, { id: 'calc', label: '🔢 계산기' },
    { id: 'randompick', label: '🎲 뽑기' }, { id: 'exam', label: '📝 고사' },
    { id: 'progress', label: '📊 진도' }, { id: 'aichat', label: '✦ AI' },
    { id: 'fileexplorer', label: '🗂 탐색기' }, { id: 'quickphrases', label: '💬 문구' },
    { id: 'lessontimer', label: '⏰ 타이머' }, { id: 'grading', label: '📊 성적' },
    { id: 'teachinglinks', label: '🔗 자료' },
    { id: 'habits', label: '🔥 습관' }, { id: 'attendance', label: '📋 출석' },
    { id: 'lessonprep', label: '📦 수업준비' }, { id: 'parentlog', label: '📞 학부모' },
    { id: 'gradeinput', label: '📊 성적입력' }, { id: 'curriculum', label: '📚 진도맵' },
    { id: 'noticeboard1', label: '📡 전광판1' }, { id: 'noticeboard2', label: '📡 전광판2' },
  ];
  const hiddenWidgets = ALL_WIDGETS.filter(w => widgets[w.id] !== true);
  if (!hiddenWidgets.length) return null;

  return (
    <>
      {/* 토글 버튼 — 항상 보임, 클릭 시 패널 열기/닫기 */}
      <button onClick={() => setOpen(o => !o)}
        style={{
          position: 'absolute', top: 32, right: 8, zIndex: 210,
          background: open ? theme.accentColor : c(theme,'rgba(255,255,255,0.95)','rgba(30,41,59,0.95)'),
          color: open ? '#fff' : theme.accentColor,
          border: `1px solid ${theme.accentColor}40`, borderRadius: 10,
          padding: '4px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)', transition: 'all 0.2s'
        }}>
        🙈 숨김 {hiddenWidgets.length}
      </button>

      {/* 펼친 패널 */}
      {open && (
        <div style={{
          position: 'absolute', top: 58, right: 8, zIndex: 200,
          background: c(theme,'rgba(255,255,255,0.97)','rgba(30,41,59,0.97)'),
          border: `1px solid ${theme.borderColor}`, borderRadius: 12,
          padding: '8px', boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
          width: 200, maxHeight: 260, overflowY: 'auto',
          display: 'flex', flexWrap: 'wrap', gap: 4
        }}>
          {hiddenWidgets.map(w => (
            <button key={w.id}
              onClick={() => {
                actions.setWidgets({ [w.id]: true });
                if (!(widgetLayout || defaultLayout)[w.id]) updateLayout(w.id, defaultLayout[w.id]);
              }}
              style={{
                background: theme.accentColor + '12', border: `1px solid ${theme.accentColor}25`,
                color: theme.accentColor, borderRadius: 8, padding: '4px 8px', fontSize: 11,
                cursor: 'pointer', fontWeight: 500, whiteSpace: 'nowrap', transition: 'all 0.15s'
              }}
              onMouseEnter={e => e.currentTarget.style.background = theme.accentColor + '30'}
              onMouseLeave={e => e.currentTarget.style.background = theme.accentColor + '12'}
            >{w.label}</button>
          ))}
        </div>
      )}
    </>
  );
}

// ── 최근 실행 프로그램 (하단 독) ─────────────────────────────
const APP_ICONS = {
  // 확장자/이름 기반 이모지 매핑
  'chrome': '🌐', 'edge': '🌐', 'firefox': '🦊', 'brave': '🦁',
  'word': '📝', 'excel': '📊', 'powerpoint': '📊', 'outlook': '📧',
  'hwp': '📄', 'pdf': '📕', 'notepad': '📋', 'code': '💻', 'vscode': '💻',
  'discord': '💬', 'slack': '💬', 'teams': '👥', 'zoom': '📹',
  'kakaotalk': '💛', 'telegram': '✈️', 'line': '💚',
  'explorer': '📂', 'calculator': '🔢', 'paint': '🎨', 'photos': '🖼️',
  'spotify': '🎵', 'music': '🎵', 'vlc': '▶️',
  'steam': '🎮', 'default': '🔹'
};

function getAppIcon(name) {
  const lower = (name || '').toLowerCase();
  for (const [key, icon] of Object.entries(APP_ICONS)) {
    if (lower.includes(key)) return icon;
  }
  // 확장자 기반
  if (lower.endsWith('.xlsx') || lower.endsWith('.xls') || lower.endsWith('.csv')) return '📊';
  if (lower.endsWith('.docx') || lower.endsWith('.doc')) return '📝';
  if (lower.endsWith('.pptx') || lower.endsWith('.ppt')) return '📊';
  if (lower.endsWith('.pdf')) return '📕';
  if (lower.endsWith('.hwp')) return '📄';
  if (lower.endsWith('.txt')) return '📋';
  if (lower.endsWith('.png') || lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return '🖼️';
  if (lower.endsWith('.mp3') || lower.endsWith('.wav')) return '🎵';
  if (lower.endsWith('.mp4') || lower.endsWith('.mkv')) return '🎬';
  if (lower.endsWith('.exe')) return '⚙️';
  return '🔹';
}

function RecentAppsBar({ theme, large }) {
  const [apps, setApps] = useState([]);
  const [showAll, setShowAll] = useState(false);

  // 앱 내에서 실행한 기록 로드
  const [inAppHistory, setInAppHistory] = useState(() => {
    try { return JSON.parse(localStorage.getItem('recent-launched-apps') || '[]'); } catch { return []; }
  });

  // Windows 최근 프로그램 + 앱 내 기록 통합
  useEffect(() => {
    const load = async () => {
      let sysApps = [];
      if (window.electronAPI?.files?.recentApps) {
        try { sysApps = await window.electronAPI.files.recentApps(); } catch {}
      }
      // 앱 내 실행 기록과 병합 (앱 내 기록 우선)
      const merged = new Map();
      for (const a of inAppHistory) {
        merged.set(a.name.toLowerCase(), { ...a, source: 'inapp' });
      }
      for (const a of sysApps) {
        const key = a.name.toLowerCase();
        if (!merged.has(key)) merged.set(key, a);
      }
      // 최근순 정렬
      const sorted = [...merged.values()].sort((a, b) => (b.mtime || 0) - (a.mtime || 0));
      setApps(sorted);
    };
    load();
    // 30초마다 갱신
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [inAppHistory]);

  // 앱 내 실행 기록 추가 함수 (전역 이벤트로)
  useEffect(() => {
    const handler = (e) => {
      const { name, path: appPath } = e.detail || {};
      if (!name) return;
      setInAppHistory(prev => {
        const filtered = prev.filter(a => a.name.toLowerCase() !== name.toLowerCase());
        const updated = [{ name, path: appPath || '', mtime: Date.now(), source: 'inapp' }, ...filtered].slice(0, 20);
        localStorage.setItem('recent-launched-apps', JSON.stringify(updated));
        return updated;
      });
    };
    window.addEventListener('app-launched', handler);
    return () => window.removeEventListener('app-launched', handler);
  }, []);

  const visible = showAll ? apps.slice(0, 15) : apps.slice(0, 5);

  if (!apps.length) return null;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: large ? 3 : 2, position: 'relative' }}>
      {visible.map((app, i) => (
        <DockBtn
          key={app.name + i}
          icon={getAppIcon(app.name)}
          label={app.name}
          theme={theme}
          large={large}
          onClick={() => {
            if (window.electronAPI?.shell?.openPath) {
              window.electronAPI.shell.openPath(app.path);
            }
            // 실행 기록 이벤트
            window.dispatchEvent(new CustomEvent('app-launched', { detail: { name: app.name, path: app.path } }));
          }}
        />
      ))}
      {apps.length > 5 && (
        <button
          onClick={() => setShowAll(p => !p)}
          title={showAll ? '접기' : `최근 프로그램 ${apps.length}개 더 보기`}
          style={{
            width: large ? 28 : 22, height: large ? 28 : 22, borderRadius: 6,
            background: showAll ? theme.accentColor + '20' : 'transparent',
            border: `1px solid ${showAll ? theme.accentColor + '40' : 'transparent'}`,
            cursor: 'pointer', fontSize: 10, color: theme.darkMode ? '#64748b' : '#9ca3af',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all 0.15s'
          }}
        >
          {showAll ? '◂' : '▸'}
        </button>
      )}
    </div>
  );
}

// ── 전광판 데이터 변경 감지 → 자동 표시 + 바탕화면 알림 ─────
function NoticeboardAutoShow() {
  const { state, actions } = useApp();
  const { noticeboard } = state;
  const { notices } = useNotices(noticeboard?.googleSheetUrl, noticeboard?.refreshInterval);
  const prevHashRef = useRef(null);

  useEffect(() => {
    if (notices.length === 0) return;
    const hash = notices.map(n => n.text).join('|');
    const prev = prevHashRef.current;

    if (prev !== null && prev !== hash) {
      const firstText = notices[0]?.text || '새 공지사항';

      // 1) 전광판 바 자동으로 켜기
      actions.setWidgets({ noticeboard: true });

      // 2) Electron 네이티브 바탕화면 알림 (앱이 뒤에 있어도 보임)
      if (window.electronAPI?.notification?.show) {
        window.electronAPI.notification.show({
          type: 'info',
          title: `📡 전광판 업데이트 (${notices.length}건)`,
          message: firstText,
          duration: 6000
        });
      }
    }
    prevHashRef.current = hash;
  }, [notices]); // eslint-disable-line react-hooks/exhaustive-deps

  return null; // 렌더링 없음 — 로직만 담당
}

// ── 메인 대시보드 ────────────────────────────────────────────
function Dashboard() {
  const { state, actions } = useApp();
  const { theme: rawTheme, user, ai } = state;
  // 안전 기본값: 첫 실행 직후 state가 불완전할 수 있음
  const ui = state.ui || {};
  const widgets = state.widgets || {};
  // 다크모드 켤 때 라이트 기본 텍스트색(#1f2937)이면 자동으로 밝은 색으로 보정
  const theme = (rawTheme.darkMode && rawTheme.textColor === '#1f2937')
    ? { ...rawTheme, textColor: '#e2e8f0' }
    : rawTheme;
  const [showAI, setShowAI] = useState(false);
  const [showCommunity, setShowCommunity] = useState(false);
  const [showClipboard, setShowClipboard] = useState(false);
  const [googleCallback, setGoogleCallback] = useState(false);
  const [showNoticeboard, setShowNoticeboard] = useState(false);
  const [showNotifPanel, setShowNotifPanel] = useState(false);
  const [showVolume, setShowVolume] = useState(false);
  const [volume, setVolume] = useState(70);
  // Google 토큰 만료 토스트
  const [tokenExpiredToast, setTokenExpiredToast] = useState(false);
  // 바탕화면 모드 전환 안내 토스트
  const [desktopModeToast, setDesktopModeToast] = useState(null); // 'on' | 'off' | null
  // 첫 실행 가이드
  const [showGuide, setShowGuide] = useState(() => { try { return !localStorage.getItem('guide-dismissed'); } catch { return true; } });
  // 작업표시줄 숨김 상태 (상단바/하단바 두께 조정용)
  const [taskbarHidden, setTaskbarHidden] = useState(() => { try { return localStorage.getItem('taskbar-hidden') === 'true'; } catch { return false; } });
  // SettingsPanel에서 토글할 때 동기화
  useEffect(() => {
    const handler = () => setTaskbarHidden(localStorage.getItem('taskbar-hidden') === 'true');
    window.addEventListener('storage', handler);
    // 커스텀 이벤트로도 동기화 (같은 창 내 localStorage 변경은 storage 이벤트 안 뜸)
    window.addEventListener('taskbar-toggled', handler);
    return () => { window.removeEventListener('storage', handler); window.removeEventListener('taskbar-toggled', handler); };
  }, []);

  // ── 그리드 레이아웃 (24열 × 16행, 세밀한 조정 가능) ──
  const COLS = 24, ROWS = 16;
  const GRID_PAD = 6, GRID_GAP = 6;
  const widgetContainerRef = useRef(null);

  // 작업표시줄 숨김 상태에 따른 상/하단 바 높이 (초기 추정)
  // - 일반: topbar ~38 + dock ~38 = 76
  // - 숨김: topbar ~52 + dock ~54 = 106
  const estChromeHeight = taskbarHidden ? 106 : 76;

  // 실제 컨테이너 크기를 기반으로 그리드 치수 계산
  const [gridDims, setGridDims] = useState(() => {
    const w = window.innerWidth;
    const h = window.innerHeight - estChromeHeight;
    return { w, h };
  });

  useEffect(() => {
    const calcDims = () => {
      if (widgetContainerRef.current) {
        const rect = widgetContainerRef.current.getBoundingClientRect();
        // 서브픽셀 오차는 floor로 제거 (그리드라인과 위젯 정렬 정확도 개선)
        const w = Math.floor(rect.width);
        const h = Math.floor(rect.height);
        setGridDims(d => (d.w === w && d.h === h ? d : { w, h }));
      }
    };
    // 즉시 + 다음 프레임(레이아웃 확정 후) + 100ms 후(폰트/그림자 확정 후)
    calcDims();
    const raf = requestAnimationFrame(calcDims);
    const t = setTimeout(calcDims, 100);
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(calcDims) : null;
    if (ro && widgetContainerRef.current) ro.observe(widgetContainerRef.current);
    window.addEventListener('resize', calcDims);
    return () => {
      cancelAnimationFrame(raf); clearTimeout(t);
      ro?.disconnect(); window.removeEventListener('resize', calcDims);
    };
  }, [taskbarHidden]); // ⚡ 작업표시줄 상태 변경 시 재계산

  // CELL 크기: 정수 floor로 pixel-perfect, 남는 여유는 GRID_PAD 뒤쪽에 흡수
  const GRID_W = gridDims.w - GRID_PAD * 2;
  const GRID_H = gridDims.h - GRID_PAD * 2;
  const CELL_W = Math.max(40, Math.floor((GRID_W - GRID_GAP * (COLS - 1)) / COLS));
  const CELL_H = Math.max(30, Math.floor((GRID_H - GRID_GAP * (ROWS - 1)) / ROWS));

  // 그리드 좌표 → 픽셀 변환 (useMemo로 안정화)
  const g2px = useCallback((col, row, cspan, rspan) => ({
    x: GRID_PAD + col * (CELL_W + GRID_GAP),
    y: GRID_PAD + row * (CELL_H + GRID_GAP),
    w: cspan * CELL_W + (cspan - 1) * GRID_GAP,
    h: rspan * CELL_H + (rspan - 1) * GRID_GAP,
  }), [CELL_W, CELL_H]); // eslint-disable-line react-hooks/exhaustive-deps

  // 기본 배치: 첨부 스크린샷과 동일한 4컬럼 구조 (24열 × 16행)
  // 그리드 좌표(col,row,colspan,rowspan)를 g2px가 실제 화면 크기에 맞게 변환
  // → 모든 해상도에서 같은 비율로 표시됨
  const defaultLayout = useMemo(() => ({
    // ─── 좌측 열 (col 0-3): 시간표 + D-Day + 바로가기 ────
    timetable:     g2px(0,  0,  4, 9),
    dday:          g2px(0,  9,  4, 3),
    quicklinks:    g2px(0,  12, 4, 4),

    // ─── 중앙 (col 4-12): 캘린더 + 메일 + 진도표 ──────────
    calendar:      g2px(4,  0,  9, 9),
    mail:          g2px(4,  9,  5, 7),
    progress:      g2px(9,  9,  4, 7),

    // ─── 중앙우 (col 13-18): 할일 + 메모 + AI + 스톱워치 ──
    todos:         g2px(13, 0,  3, 8),
    memo:          g2px(16, 0,  3, 8),
    aichat:        g2px(13, 8,  6, 4),
    stopwatch:     g2px(13, 12, 6, 4),

    // ─── 우측 열 (col 19-23): 날씨 + 급식 + 유틸 ──────────
    weather:       g2px(19, 0,  5, 3),
    meal:          g2px(19, 3,  5, 4),
    randompick:    g2px(19, 7,  3, 3),
    music:         g2px(22, 7,  2, 3),
    calc:          g2px(19, 10, 5, 4),
    teachinglinks: g2px(19, 14, 3, 2),
    quote:         g2px(22, 14, 2, 2),

    // ─── 비활성 위젯 기본 위치 (켜면 여기에 배치, ON 위젯과 겹치지 않게) ─
    // 화면 중앙 상단에 겹쳐서 배치 (사용자가 편집 모드에서 이동)
    clock:         g2px(7,  2,  4, 3),
    currentPeriod: g2px(6,  1,  6, 2),
    system:        g2px(8,  3,  4, 3),
    recentfiles:   g2px(6,  4,  6, 3),
    focus:         g2px(7,  2,  5, 4),
    weekschedule:  g2px(6,  1,  6, 4),
    neisalert:     g2px(7,  2,  5, 3),
    exam:          g2px(6,  1,  6, 5),
    fileexplorer:  g2px(6,  1,  6, 5),
    quickphrases:  g2px(7,  3,  5, 3),
    lessontimer:   g2px(7,  3,  5, 3),
    grading:       g2px(7,  3,  5, 3),
    habits:        g2px(7,  2,  5, 4),
    attendance:    g2px(7,  2,  5, 5),
    lessonprep:    g2px(7,  2,  5, 4),
    parentlog:     g2px(7,  2,  5, 5),
    gradeinput:    g2px(7,  2,  5, 5),
    curriculum:    g2px(7,  2,  5, 5),
    noticeboard1:  g2px(7,  2,  5, 3),
    noticeboard2:  g2px(6,  1,  6, 5),
    // ── 신규 위젯 ──
    timeline:      g2px(4,  0,  9, 3),
    dualtz:        g2px(19, 0,  5, 5),
    eventtemplate: g2px(13, 0,  6, 6),
    journal:       g2px(13, 0,  6, 8),
    stickynote:    g2px(13, 0,  6, 6),
    habit:         g2px(13, 0,  6, 6),
    challenge:     g2px(19, 0,  5, 5),
    kanban:        g2px(13, 0,  6, 8),
    applauncher:   g2px(19, 0,  5, 5),
    attendance:    g2px(13, 0,  6, 8),
    noisemeter:    g2px(19, 0,  5, 5),
    rotationtimer: g2px(13, 0,  6, 5),
    scoreboard:    g2px(13, 0,  6, 5),
    streak:        g2px(13, 0,  6, 6),
    eyerest:       g2px(19, 0,  5, 5),
    water:         g2px(19, 0,  5, 5),
    currency:      g2px(19, 0,  5, 6),
    graphview:     g2px(4,  0,  9, 6),
    voicetodo:     g2px(13, 0,  6, 4),
    photoframe:    g2px(4,  0,  9, 8),
    rssfeed:       g2px(13, 0,  6, 8),
    aisummary:     g2px(13, 0,  6, 6),
    xpbadge:       g2px(19, 0,  5, 6),
    stretch:       g2px(19, 0,  5, 5),
    screentime:    g2px(19, 0,  5, 5),
    emailpreview:  g2px(19, 0,  5, 4),
    sysmonitor:    g2px(19, 0,  5, 5),
    countdown:     g2px(13, 0,  6, 6),
    network:       g2px(19, 0,  5, 5),
    storageinfo:   g2px(19, 0,  5, 4),
    ocr:           g2px(13, 0,  6, 6),
    locreminder:   g2px(13, 0,  6, 6),
    unitconverter: g2px(19, 0,  5, 5),
    seatingchart:  g2px(4,  0,  9, 8),
    metronome:     g2px(19, 0,  5, 5),
    qrcode:        g2px(19, 0,  5, 6),
    classvote:     g2px(13, 0,  6, 8),
    classbell:     g2px(13, 0,  6, 6),
  }), [g2px]); // eslint-disable-line react-hooks/exhaustive-deps

  const [widgetLayout, setWidgetLayout] = useState(() => {
    try { const saved = localStorage.getItem('widget-layout'); return saved ? JSON.parse(saved) : null; } catch { return null; }
  });
  // 컨테이너 크기가 실제로 측정된 뒤 저장된 레이아웃이 없으면 defaultLayout 적용
  useEffect(() => {
    if (!widgetLayout && gridDims.h > 100) setWidgetLayout(defaultLayout);
  }, [defaultLayout, gridDims]); // eslint-disable-line react-hooks/exhaustive-deps

  // 저장된 레이아웃이 현재 화면보다 훨씬 작거나 벗어난 경우 재검증 → defaultLayout으로 초기화
  useEffect(() => {
    if (!widgetLayout || gridDims.h <= 100) return;
    const maxX = gridDims.w, maxY = gridDims.h;
    const isInvalid = Object.values(widgetLayout).some(pos =>
      pos && (pos.x > maxX * 1.8 || pos.y > maxY * 1.8 || pos.w < 10 || pos.h < 10)
    );
    if (isInvalid) {
      console.warn('[Layout] 저장된 레이아웃이 현재 화면에 맞지 않습니다. 기본 배치로 초기화합니다.');
      setWidgetLayout(defaultLayout);
      localStorage.removeItem('widget-layout');
    }
  }, [gridDims]); // eslint-disable-line react-hooks/exhaustive-deps
  const [layoutEdited, setLayoutEdited] = useState(() => { try { return !!localStorage.getItem('widget-layout'); } catch { return false; } });
  const updateLayout = (id, pos) => {
    const newLayout = { ...(widgetLayout || defaultLayout), [id]: pos };
    setWidgetLayout(newLayout);
    setLayoutEdited(true);
    localStorage.setItem('widget-layout', JSON.stringify(newLayout));
  };
  const resetLayout = () => {
    setWidgetLayout(defaultLayout);
    setLayoutEdited(false);
    localStorage.removeItem('widget-layout');
    actions.setUI({ editMode: false });
  };
  const W = (id, title, children) => (
    <EditableWidget id={id} title={title} editMode={ui.editMode} layout={(widgetLayout || defaultLayout)[id]} onLayoutChange={updateLayout} theme={theme}>
      {children}
    </EditableWidget>
  );

  // Google OAuth 콜백 감지 (URL에 code= 파라미터가 있으면)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    if (code) {
      setGoogleCallback(true);
    }
  }, []);

  const [updateInfo, setUpdateInfo] = useState(null);
  const [updateProgress, setUpdateProgress] = useState(null); // { percent }
  const [updateReady, setUpdateReady] = useState(false); // 다운로드 완료, 설치 준비

  useEffect(() => {
    if (!window.electronAPI) return;
    window.electronAPI.on('open-settings', () => actions.setUI({ settingsOpen: true }));
    window.electronAPI.on('update-available', (data) => setUpdateInfo(data));
    window.electronAPI.on('update-download-progress', (data) => setUpdateProgress(data));
    window.electronAPI.on('update-downloaded', () => { setUpdateProgress(null); setUpdateReady(true); });
  }, [actions]);

  // 다크모드 자동 전환
  useEffect(() => {
    // 시스템 따라가기
    if (theme.autoDarkMode === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      const handler = (e) => actions.setTheme({
        darkMode: e.matches,
        textColor: e.matches ? '#e2e8f0' : '#1f2937',
        bgColor: e.matches ? '#0f172a' : (rawTheme.bgColor && rawTheme.bgColor !== '#0f172a' ? rawTheme.bgColor : '#fff1f2'),
        widgetBg: e.matches ? '#1e293b' : '#ffffff',
        borderColor: e.matches ? '#334155' : (rawTheme.borderColor && rawTheme.borderColor !== '#334155' ? rawTheme.borderColor : '#fecdd3')
      });
      handler(mq); // 초기 적용
      mq.addEventListener('change', handler);
      return () => mq.removeEventListener('change', handler);
    }
    // 시간별 (18시~6시)
    if (theme.autoDarkMode === true || theme.autoDarkMode === 'time') {
      const check = () => {
        const h = new Date().getHours();
        const shouldDark = h >= 18 || h < 6;
        if (shouldDark !== rawTheme.darkMode) actions.setTheme({
          darkMode: shouldDark,
          textColor: shouldDark ? '#e2e8f0' : '#1f2937',
          bgColor: shouldDark ? '#0f172a' : (rawTheme.bgColor && rawTheme.bgColor !== '#0f172a' ? rawTheme.bgColor : '#fff1f2'),
          widgetBg: shouldDark ? '#1e293b' : '#ffffff',
          borderColor: shouldDark ? '#334155' : (rawTheme.borderColor && rawTheme.borderColor !== '#334155' ? rawTheme.borderColor : '#fecdd3')
        });
      };
      check();
      const t = setInterval(check, 60000);
      return () => clearInterval(t);
    }
  }, [theme.autoDarkMode]); // eslint-disable-line react-hooks/exhaustive-deps

  // 할일 자동 정리 (매일 자정에 완료 항목 정리)
  useEffect(() => {
    const check = () => {
      const now = new Date();
      if (now.getHours() === 0 && now.getMinutes() === 0) {
        const active = (state.todos || []).filter(t => !t.done);
        if (active.length !== state.todos.length) {
          // 완료된 할일 제거
        }
      }
    };
    const t = setInterval(check, 60000);
    return () => clearInterval(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 알림 스케줄러 — ref로 최신 state 참조 (stale closure 방지)
  const scheduleRef = useRef(state.schedule);
  const notifRef = useRef(state.notifications);
  const timetableRef = useRef(state.timetable);
  useEffect(() => { scheduleRef.current = state.schedule; }, [state.schedule]);
  useEffect(() => { notifRef.current = state.notifications; }, [state.notifications]);
  useEffect(() => { timetableRef.current = state.timetable; }, [state.timetable]);

  useEffect(() => {
    const cleanup = startNotificationScheduler(
      () => scheduleRef.current,
      () => notifRef.current,
      actions.showNotification,
      actions.setUI,
      () => timetableRef.current
    );
    return cleanup;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Gmail 새 메일 알림 스케줄러
  const googleRef = useRef(state.google);
  useEffect(() => { googleRef.current = state.google; }, [state.google]);

  useEffect(() => {
    const cleanup = startMailNotificationScheduler(
      () => googleRef.current,
      () => notifRef.current,
      actions.showNotification
    );
    return cleanup;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 앱 시작 시 Google 토큰 1회 초기화 (refresh token으로 새 access token 확보)
  useEffect(() => {
    if (state.google?.connected && state.google?.refreshToken) {
      import('./services/googleService').then(async ({ initTokens }) => {
        const ok = await initTokens(state.google.accessToken, state.google.refreshToken);
        if (ok) console.log('[App] Google 토큰 초기화 완료');
      }).catch(() => {});
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Google 토큰 자동 갱신 성공 시 state에 반영
  useEffect(() => {
    const onRefreshed = (e) => {
      const { accessToken: newToken } = e.detail || {};
      if (newToken) {
        actions.setGoogle({ accessToken: newToken });
        console.log('[Google] 토큰 자동 갱신 완료');
      }
    };
    window.addEventListener('google-token-refreshed', onRefreshed);
    return () => window.removeEventListener('google-token-refreshed', onRefreshed);
  }, [actions]);

  // Google 토큰 만료 (refresh도 실패) → 토스트 표시
  useEffect(() => {
    const handler = () => {
      setTokenExpiredToast(true);
      setTimeout(() => setTokenExpiredToast(false), 12000);
    };
    window.addEventListener('google-token-expired', handler);
    return () => window.removeEventListener('google-token-expired', handler);
  }, []);

  // Firebase 자동 초기화 (저장된 config 있으면 앱 시작 시 연결)
  useEffect(() => {
    const fb = state.community?.firebaseConfig;
    const userId = state.community?.userId;
    if (fb?.apiKey && fb?.projectId) {
      initFirebase(fb, userId || 'user').catch(() => {});
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Google 콜백 처리가 온보딩보다 우선
  if (googleCallback) {
    return <GoogleCallback
      onSuccess={(data) => {
        actions.setGoogle({ connected: true, email: data.email, accessToken: data.accessToken, refreshToken: data.refreshToken });
        setGoogleCallback(false);
        // URL에서 code 제거
        window.history.replaceState({}, '', '/');
      }}
      onError={() => {
        setGoogleCallback(false);
        window.history.replaceState({}, '', '/');
      }}
    />;
  }

  if (!user.setupComplete) {
    return <Onboarding onComplete={() => actions.setUser({ setupComplete: true })} />;
  }

  const ext = (url) => () => window.electronAPI?.shell?.openExternal(url);

  return (
    <>
      {/* ══ 전광판 마퀴 바 — position:fixed 오버레이 ══ */}
      {widgets.noticeboard && (
        <NoticeboardBar noticeboard={state.noticeboard} theme={theme} onClose={() => actions.setWidgets({ noticeboard: false })} />
      )}
      {/* 전광판 데이터 변경 감지 → 자동 표시 */}
      <NoticeboardAutoShow />

      {/* ═══ 위젯 반응형 CSS (Container Query) + 스크롤바 완전 숨김 ═══ */}
      <style>{`
        .widget-card {
          container-type: size;
          overflow: hidden !important;  /* 카드 자체는 절대 스크롤 안 함 */
          scrollbar-width: none;
          -ms-overflow-style: none;
        }
        .widget-card::-webkit-scrollbar { width: 0 !important; height: 0 !important; display: none !important; }

        /* 카드 내부 모든 스크롤 영역의 스크롤바 숨김 — 기능은 유지 */
        .widget-card *::-webkit-scrollbar { width: 0 !important; height: 0 !important; display: none !important; }
        .widget-card * { scrollbar-width: none; -ms-overflow-style: none; }

        /* 위젯 카드 직속 자식은 항상 높이 100% 차지 */
        .widget-card > div { max-height: 100%; box-sizing: border-box; }

        /* ───── 반응형 스케일 (Container Query) ───── */
        /* 매우 작음 */
        @container (max-height: 140px), (max-width: 180px) {
          .widget-card { font-size: 9px; }
          .widget-card button { font-size: 9px !important; padding: 2px 4px !important; }
          .widget-card input, .widget-card select, .widget-card textarea {
            font-size: 9px !important; padding: 2px 5px !important;
          }
          .widget-card h1, .widget-card h2, .widget-card h3 { font-size: 11px !important; }
        }
        /* 작음 */
        @container (min-height: 141px) and (max-height: 220px) {
          .widget-card { font-size: 10px; }
          .widget-card button { font-size: 10px !important; padding: 3px 6px !important; }
        }
        /* 보통 */
        @container (min-height: 221px) and (max-height: 340px) {
          .widget-card { font-size: 11px; }
        }
        /* 큼 */
        @container (min-width: 500px) {
          .widget-card { font-size: 12px; }
        }
        /* 매우 큼 */
        @container (min-width: 700px) and (min-height: 500px) {
          .widget-card { font-size: 13px; }
        }
      `}</style>

      {/* Google 토큰 만료 토스트 */}
      {tokenExpiredToast && (
        <div style={{
          position: 'fixed', bottom: 70, right: 20, zIndex: 99998,
          background: '#fef3c7', border: '1px solid #fcd34d',
          color: '#92400e', borderRadius: 12,
          padding: '12px 16px',
          boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
          display: 'flex', alignItems: 'center', gap: 12,
          maxWidth: 340, WebkitAppRegion: 'no-drag',
        }}>
          <span style={{ fontSize: 18 }}>⚠️</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 2 }}>Google 인증 만료</div>
            <div style={{ fontSize: 11, opacity: 0.85 }}>Google 서비스 연동을 다시 설정해 주세요.</div>
          </div>
          <button onClick={() => { actions.setUI({ settingsOpen: true, settingsTab: 'google' }); setTokenExpiredToast(false); }}
            style={{ background: '#f59e0b', color: '#fff', border: 'none', borderRadius: 7, padding: '5px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
            다시 연결
          </button>
          <button onClick={() => setTokenExpiredToast(false)}
            style={{ background: 'none', border: 'none', color: '#92400e', fontSize: 16, cursor: 'pointer', padding: '0 2px', opacity: 0.6 }}>✕</button>
        </div>
      )}

      {/* 바탕화면 모드 전환 안내 토스트 */}
      {desktopModeToast && (
        <div style={{
          position: 'fixed', bottom: 70, left: '50%', transform: 'translateX(-50%)',
          zIndex: 99997, background: c(theme, '#1f2937', '#f1f5f9'),
          color: c(theme, '#fff', '#1f2937'), borderRadius: 20,
          padding: '9px 20px', fontSize: 12, fontWeight: 600,
          boxShadow: '0 4px 20px rgba(0,0,0,0.25)',
          display: 'flex', alignItems: 'center', gap: 8,
          WebkitAppRegion: 'no-drag',
        }}>
          {desktopModeToast === 'on'
            ? '🖥️ 바탕화면 모드 켜짐 — Win+D를 눌러도 앱이 유지됩니다'
            : '🪟 창 모드로 전환됐습니다'}
        </div>
      )}

      {/* 첫 실행 빠른 시작 가이드 */}
      {showGuide && (
        <div style={{
          position: 'fixed', bottom: 70, left: 20, zIndex: 99996,
          background: c(theme, '#fff', '#1e293b'),
          border: `1.5px solid ${theme.accentColor}40`,
          borderRadius: 14, padding: '14px 16px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
          maxWidth: 280, WebkitAppRegion: 'no-drag',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: theme.accentColor }}>🚀 빠른 시작 가이드</span>
            <button onClick={() => { setShowGuide(false); localStorage.setItem('guide-dismissed', '1'); }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: c(theme, '#9ca3af', '#64748b') }}>✕</button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {[
              { icon: '⚙️', text: '설정 → 일과에서 수업 시간표 등록', tab: 'schedule' },
              { icon: '🍽️', text: '설정 → 급식에서 학교 코드 등록', tab: 'meal' },
              { icon: '🔗', text: '설정 → Google에서 캘린더/Gmail 연동', tab: 'google' },
              { icon: '✦', text: '설정 → AI Plus에서 AI API 키 등록', tab: 'ai' },
            ].map((item, i) => (
              <div key={i} onClick={() => { actions.setUI({ settingsOpen: true, settingsTab: item.tab }); setShowGuide(false); localStorage.setItem('guide-dismissed', '1'); }}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', borderRadius: 8, cursor: 'pointer', background: c(theme, '#f9fafb', '#0f172a') }}
                onMouseEnter={e => e.currentTarget.style.background = theme.accentColor + '15'}
                onMouseLeave={e => e.currentTarget.style.background = c(theme, '#f9fafb', '#0f172a')}>
                <span style={{ fontSize: 14 }}>{item.icon}</span>
                <span style={{ fontSize: 11, color: c(theme, '#374151', '#cbd5e1') }}>{item.text}</span>
              </div>
            ))}
          </div>
        </div>
      )}

    <div style={{
      width: '100vw', height: '100vh',
      boxSizing: 'border-box',
      background: theme.bgImage ? `url(${theme.bgImage}) center/cover no-repeat` : (theme.bgColor || (theme.darkMode ? '#0f172a' : '#fff1f2')),
      fontFamily: `'${theme.fontFamily || 'Malgun Gothic'}', 'Apple SD Gothic Neo', 'Noto Sans KR', 'Segoe UI Emoji', 'Noto Color Emoji', 'Apple Color Emoji', sans-serif`,
      fontSize: theme.fontSize || 13,
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden', color: theme.textColor
    }}>

      {/* ═══ 상단바 ═══ */}
      <div style={{
        position: 'relative',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: taskbarHidden ? '10px 20px' : '5px 16px',
        minHeight: taskbarHidden ? 52 : 38,
        background: c(theme, 'rgba(255,255,255,0.95)', 'rgba(15,23,42,0.95)'),
        borderBottom: `1px solid ${theme.borderColor}`,
        WebkitAppRegion: 'drag',
        transition: 'min-height 0.3s ease, padding 0.3s ease'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, WebkitAppRegion: 'no-drag' }}>
          <TopBarClock theme={theme} />
          <span style={{ fontSize: 11, color: c(theme, '#6b7280', '#64748b') }}>|</span>
          {user.name && <span style={{ fontSize: 11, color: theme.accentColor, fontWeight: 600 }}>{user.name}</span>}
          {user.school && <span style={{ fontSize: 10, color: c(theme, '#9ca3af', '#64748b'), background: c(theme, '#f3f4f6', '#1e293b'), borderRadius: 5, padding: '1px 7px' }}>{user.school}</span>}
        </div>
        <div style={{ WebkitAppRegion: 'no-drag' }}>
          <CurrentPeriodMini theme={theme} schedule={state.schedule || { periods: [] }} timetable={state.timetable || {}} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, WebkitAppRegion: 'no-drag' }}>
          <DesktopModeToggle theme={theme} onModeChange={(on) => {
            setDesktopModeToast(on ? 'on' : 'off');
            setTimeout(() => setDesktopModeToast(null), 5000);
          }} />
          <button onClick={() => actions.setUI({ editMode: !ui.editMode })}
            style={{
              background: ui.editMode ? '#ef4444' : c(theme, '#f3f4f6', '#334155'),
              color: ui.editMode ? '#fff' : theme.textColor,
              border: 'none', borderRadius: 7, padding: '4px 10px', fontSize: 11, cursor: 'pointer'
            }}>
            {ui.editMode ? '✅ 편집 완료' : '✏️ 화면 편집'}
          </button>
          <button onClick={() => actions.setUI({ settingsOpen: true })}
            style={{ background: c(theme, '#f3f4f6', '#334155'), border: 'none', borderRadius: 7, padding: '4px 10px', fontSize: 11, cursor: 'pointer', color: theme.textColor }}>
            ⚙️ 설정
          </button>
        </div>
      </div>

      {/* ═══ 메인 영역 (항상 절대 위치) ═══ */}
      <div ref={widgetContainerRef} style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        {/* 편집 모드: 그리드 선 */}
        {ui.editMode && (
          <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0 }}>
            {Array.from({ length: COLS + 1 }, (_, i) => (
              <div key={`c${i}`} style={{ position: 'absolute', left: GRID_PAD + i * (CELL_W + GRID_GAP) - 1, top: 0, width: 1, height: '100%', background: i % 4 === 0 ? '#d1d5db40' : '#e5e7eb20' }} />
            ))}
            {Array.from({ length: ROWS + 1 }, (_, i) => (
              <div key={`r${i}`} style={{ position: 'absolute', top: GRID_PAD + i * (CELL_H + GRID_GAP) - 1, left: 0, width: '100%', height: 1, background: i % 4 === 0 ? '#d1d5db40' : '#e5e7eb20' }} />
            ))}
          </div>
        )}
        {ui.editMode && (
          <div style={{ position: 'absolute', top: 4, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 8, zIndex: 200, alignItems: 'center' }}>
            <div style={{ background: '#ef4444', color: '#fff', borderRadius: 8, padding: '3px 14px', fontSize: 11, fontWeight: 600 }}>
              ✏️ 드래그로 이동 · 모서리로 크기 조절
            </div>
            <button onClick={resetLayout} style={{ background: '#f3f4f6', border: 'none', borderRadius: 8, padding: '3px 12px', fontSize: 11, cursor: 'pointer', color: '#374151' }}>
              🔄 기본 배치로 초기화
            </button>
          </div>
        )}
        {/* 편집 모드: 숨겨진 위젯 복원 — 접이식 토글 버튼 */}
        {ui.editMode && <HiddenWidgetsPanel theme={theme} widgets={widgets} actions={actions} defaultLayout={defaultLayout} widgetLayout={widgetLayout} updateLayout={updateLayout} />}

        {/* 위젯들 (편집/일반 모드 동일 구성) */}
        {[
          { id: 'clock', el: <ClockWidget theme={theme} /> },
          { id: 'focus', el: <FocusWidget /> },
          { id: 'currentPeriod', el: <CurrentPeriodWidget theme={theme} schedule={state.schedule} /> },
          { id: 'timetable', el: <TimetableWidget /> },
          { id: 'dday', el: <DDayWidget /> },
          { id: 'quicklinks', el: <QuickLinks theme={theme} /> },
          { id: 'calendar', el: <CalendarWidget /> },
          { id: 'todos', el: <TodoWidget /> },
          { id: 'mail', el: <CommHub theme={theme} /> },
          { id: 'recentfiles', el: <RecentFiles theme={theme} /> },
          { id: 'weather', el: <WeatherWidget /> },
          { id: 'meal', el: <MealWidget /> },
          { id: 'memo', el: <MemoWidget /> },
          { id: 'music', el: <MusicWidget theme={theme} /> },
          { id: 'system', el: <SystemWidget /> },
          { id: 'quote', el: <QuoteWidget theme={theme} /> },
          { id: 'stopwatch', el: <StopwatchWidget theme={theme} /> },
          { id: 'weekschedule', el: <WeekScheduleWidget theme={theme} /> },
          { id: 'neisalert', el: <NeisAlertWidget theme={theme} /> },
          { id: 'calc', el: <CalcWidget theme={theme} /> },
          { id: 'randompick', el: <RandomPickWidget theme={theme} /> },
          { id: 'exam', el: <ExamWidget theme={theme} /> },
          { id: 'progress', el: <ProgressWidget theme={theme} /> },
          { id: 'aichat', el: <AIChatWidget theme={theme} /> },
          { id: 'fileexplorer', el: <FileExplorerWidget theme={theme} /> },
          { id: 'quickphrases', el: <QuickPhrasesWidget theme={theme} /> },
          { id: 'lessontimer', el: <LessonTimerWidget theme={theme} /> },
          { id: 'grading', el: <GradingWidget theme={theme} /> },
          { id: 'teachinglinks', el: <TeachingLinksWidget theme={theme} /> },
          { id: 'habits', el: <HabitTrackerWidget theme={theme} /> },
          { id: 'attendance', el: <AttendanceWidget theme={theme} /> },
          { id: 'lessonprep', el: <LessonPrepWidget theme={theme} /> },
          { id: 'parentlog', el: <ParentLogWidget theme={theme} /> },
          { id: 'gradeinput', el: <GradeInputWidget theme={theme} /> },
          { id: 'curriculum', el: <CurriculumMapWidget theme={theme} /> },
          { id: 'noticeboard1', el: <NoticeboardWidget /> },
          { id: 'noticeboard2', el: <Noticeboard2Widget /> },
          // ── 신규 위젯 ──
          { id: 'timeline', el: <TimelineWidget /> },
          { id: 'dualtz', el: <DualTimezoneWidget /> },
          { id: 'eventtemplate', el: <EventTemplateWidget /> },
          { id: 'journal', el: <JournalWidget /> },
          { id: 'stickynote', el: <StickyNoteWidget /> },
          /* habit → 기존 habits 위젯 사용 */
          { id: 'challenge', el: <DailyChallengeWidget /> },
          { id: 'kanban', el: <KanbanWidget /> },
          { id: 'applauncher', el: <AppLauncherWidget /> },
          /* attendance → 기존 attendance 위젯 사용 */
          { id: 'noisemeter', el: <NoiseMeterWidget /> },
          { id: 'rotationtimer', el: <RotationTimerWidget /> },
          { id: 'scoreboard', el: <ScoreboardWidget /> },
          { id: 'streak', el: <StreakWidget /> },
          { id: 'eyerest', el: <EyeRestWidget /> },
          { id: 'water', el: <WaterReminderWidget /> },
          { id: 'currency', el: <CurrencyWidget /> },
          { id: 'graphview', el: <GraphViewWidget /> },
          { id: 'voicetodo', el: <VoiceToTodoWidget /> },
          { id: 'photoframe', el: <PhotoFrameWidget /> },
          { id: 'rssfeed', el: <RSSFeedWidget /> },
          { id: 'aisummary', el: <AISummaryWidget /> },
          { id: 'xpbadge', el: <XPBadgeWidget /> },
          { id: 'stretch', el: <StretchWidget /> },
          { id: 'screentime', el: <ScreenTimeWidget /> },
          { id: 'emailpreview', el: <EmailPreviewWidget /> },
          { id: 'sysmonitor', el: <SystemMonitorWidget /> },
          { id: 'countdown', el: <CountdownDashWidget /> },
          { id: 'network', el: <NetworkMonitorWidget /> },
          { id: 'storageinfo', el: <StorageWidget /> },
          { id: 'ocr', el: <OCRWidget /> },
          { id: 'locreminder', el: <LocationReminderWidget /> },
          { id: 'unitconverter', el: <UnitConverterWidget /> },
          { id: 'seatingchart', el: <SeatingChartWidget /> },
          { id: 'metronome', el: <MetronomeWidget /> },
          { id: 'qrcode', el: <QRCodeWidget /> },
          { id: 'classvote', el: <ClassVoteWidget /> },
          { id: 'classbell', el: <ClassBellWidget /> },
        ].map(w => {
          const pos = (widgetLayout || defaultLayout)[w.id] || defaultLayout[w.id];
          if (!pos) return null;
          // 설정에서 꺼진 위젯은 숨김 (undefined도 OFF 취급)
          if (widgets[w.id] !== true) return null;
          const inner = <div className="widget-card" style={card(theme, { height: '100%', overflow: 'hidden', boxSizing: 'border-box', containerType: 'size' })}>
            <WidgetErrorBoundary id={w.id} theme={theme}>{w.el}</WidgetErrorBoundary>
          </div>;
          return ui.editMode ? (
            <EditableWidget key={w.id} id={w.id} editMode={true} layout={pos} onLayoutChange={updateLayout} theme={theme} allLayouts={widgetLayout}
              gridInfo={{ cellW: CELL_W, cellH: CELL_H, gap: GRID_GAP, pad: GRID_PAD }}
              onHide={(wid) => actions.setWidgets({ [wid]: false })}>
              {inner}
            </EditableWidget>
          ) : (
            <div key={w.id} style={{ position: 'absolute', left: pos.x, top: pos.y, width: pos.w, height: pos.h, overflow: 'hidden', borderRadius: theme.borderRadius ?? 10 }}>
              {inner}
            </div>
          );
        })}
      </div>

      {/* ═══ 하단 독 ═══ */}
      <div style={{
        display: 'flex', alignItems: 'center',
        gap: taskbarHidden ? 5 : 3,
        padding: taskbarHidden ? '8px 18px 10px' : '4px 14px 5px',
        minHeight: taskbarHidden ? 54 : 'auto',
        background: c(theme, 'rgba(255,255,255,0.9)', 'rgba(15,23,42,0.95)'),
        borderTop: `1px solid ${theme.borderColor}`,
        transition: 'min-height 0.3s ease, padding 0.3s ease, gap 0.3s ease'
      }}>
        {/* 통합 검색 (파일 + 웹) */}
        <DockSearch theme={theme} ext={ext} />

        {/* 파일 탐색기 버튼 */}
        <DockBtn icon="📂" label="파일 탐색기" theme={theme} large={taskbarHidden} onClick={() => {
          if (window.electronAPI?.shell) {
            // Windows 파일 탐색기 열기
            window.electronAPI.shell.openPath('');
          }
        }} />

        {/* 앱 바로가기 */}
        {[
          { icon: '🌐', label: 'Google', url: 'https://www.google.com' },
          { icon: '📅', label: '캘린더', url: 'https://calendar.google.com' },
          { icon: '📧', label: 'Gmail', url: 'https://mail.google.com' },
          { icon: '💬', label: 'Chat', url: 'https://chat.google.com' },
          { icon: '☁️', label: 'Drive', url: 'https://drive.google.com' },
          { icon: '🎓', label: 'Classroom', url: 'https://classroom.google.com' },
          { icon: '🏫', label: 'NEIS', url: 'https://neis.go.kr' },
        ].map(item => <DockBtn key={item.label} {...item} theme={theme} large={taskbarHidden} onClick={ext(item.url)} />)}

        <div style={{ width: 1, height: 22, background: theme.borderColor, margin: '0 4px' }} />

        {/* 최근 실행 프로그램 */}
        <RecentAppsBar theme={theme} large={taskbarHidden} />

        <div style={{ width: 1, height: 22, background: theme.borderColor, margin: '0 4px' }} />

        {/* 기능 버튼 */}
        <DockBtn icon="✦" label="AI Plus" theme={theme} large={taskbarHidden} onClick={() => setShowAI(true)} />
        <DockBtn icon="👥" label="커뮤니티" theme={theme} large={taskbarHidden} onClick={() => setShowCommunity(true)} />
        <DockBtn icon="📋" label="클립보드" theme={theme} large={taskbarHidden} onClick={() => setShowClipboard(true)} />

        {/* 우측: 와이파이 + 볼륨 + 알림벨 + 시스템 상태 */}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
          {/* 와이파이 상태 */}
          <WifiIndicator theme={theme} />
          {/* 배터리 상태 (노트북) */}
          <BatteryIndicator theme={theme} />
          {/* 볼륨 조절 */}
          <div style={{ position: 'relative' }}>
            <button onClick={() => setShowVolume(v => !v)} title="볼륨 조절"
              style={{ width: 32, height: 32, borderRadius: 8, background: showVolume ? theme.accentColor : 'transparent', border: `1px solid ${showVolume ? theme.accentColor : 'transparent'}`, cursor: 'pointer', fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center', color: showVolume ? '#fff' : theme.textColor }}>
              {volume === 0 ? '🔇' : volume < 30 ? '🔈' : volume < 70 ? '🔉' : '🔊'}
            </button>
            {showVolume && (
              <div style={{ position: 'absolute', bottom: '110%', right: 0, background: c(theme,'#fff','#1e293b'), border: `1px solid ${theme.borderColor}`, borderRadius: 12, boxShadow: '0 8px 24px rgba(0,0,0,0.2)', padding: '14px 16px', minWidth: 160, zIndex: 9999 }}
                onClick={e => e.stopPropagation()}>
                <div style={{ fontSize: 12, fontWeight: 600, color: theme.textColor, marginBottom: 10, display: 'flex', justifyContent: 'space-between' }}>
                  🔊 볼륨 <span style={{ color: theme.accentColor }}>{volume}%</span>
                </div>
                <input type="range" min={0} max={100} value={volume}
                  onChange={e => {
                    const v = parseInt(e.target.value);
                    setVolume(v);
                    window.electronAPI?.system?.setVolume?.(v);
                  }}
                  style={{ width: '100%', accentColor: theme.accentColor, cursor: 'pointer' }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: c(theme,'#9ca3af','#64748b'), marginTop: 4 }}>
                  <span>0</span><span>50</span><span>100</span>
                </div>
              </div>
            )}
          </div>
          {/* 알림 벨 */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setShowNotifPanel(v => !v)}
              style={{
                width: 32, height: 32, borderRadius: 8,
                background: showNotifPanel ? theme.accentColor : 'transparent',
                border: `1px solid ${showNotifPanel ? theme.accentColor : 'transparent'}`,
                cursor: 'pointer', fontSize: 16,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'all 0.2s', color: showNotifPanel ? '#fff' : theme.textColor
              }}
              title="알림"
            >🔔</button>
            {/* 읽지 않은 메일 배지 */}
            {(state.cache?.gmailUnread || 0) > 0 && (
              <div style={{
                position: 'absolute', top: 1, right: 1,
                minWidth: 14, height: 14, borderRadius: 7,
                background: '#ef4444', color: '#fff',
                fontSize: 8, fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: '0 2px', border: '1.5px solid transparent', pointerEvents: 'none'
              }}>{state.cache?.gmailUnread > 99 ? '99+' : state.cache?.gmailUnread}</div>
            )}
            {/* 알림 패널 */}
            {showNotifPanel && (
              <div style={{
                position: 'absolute', bottom: '110%', right: 0, width: 280,
                background: c(theme, '#fff', '#1e293b'),
                border: `1px solid ${theme.borderColor}`,
                borderRadius: 12, boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
                padding: '12px 14px', maxHeight: 360, overflowY: 'auto', zIndex: 9999
              }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: theme.textColor }}>🔔 알림</span>
                <button onClick={() => setShowNotifPanel(false)}
                  style={{ background: 'none', border: 'none', fontSize: 14, cursor: 'pointer', color: '#9ca3af' }}>✕</button>
              </div>
            {/* 미읽은 메일 */}
            {state.google.connected && (state.cache?.gmailUnread || 0) > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 8, background: c(theme, '#fefce8', '#1e293b'), marginBottom: 6 }}>
                <span style={{ fontSize: 16 }}>📧</span>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: theme.textColor }}>읽지 않은 Gmail</div>
                  <div style={{ fontSize: 11, color: c(theme, '#6b7280', '#94a3b8') }}>{state.cache?.gmailUnread}통의 새 메일</div>
                </div>
              </div>
            )}
            {/* 가까운 D-Day */}
            {(state.ddays || []).filter(d => {
              const diff = Math.ceil((new Date(d.date) - new Date(new Date().toDateString())) / 86400000);
              return diff >= 0 && diff <= 7;
            }).slice(0, 3).map(d => {
              const diff = Math.ceil((new Date(d.date) - new Date(new Date().toDateString())) / 86400000);
              return (
                <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 8, background: c(theme, '#f9fafb', '#0f172a'), marginBottom: 4 }}>
                  <span style={{ fontSize: 16 }}>📅</span>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: theme.textColor }}>{d.label}</div>
                    <div style={{ fontSize: 11, color: diff === 0 ? '#dc2626' : c(theme, '#6b7280', '#94a3b8') }}>
                      {diff === 0 ? '오늘!' : `D-${diff}`} · {d.date}
                    </div>
                  </div>
                </div>
              );
            })}
            {/* 오늘 미완료 할일 */}
            {(state.todos || []).filter(t => !t.done).slice(0, 3).map(t => (
              <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 8, background: c(theme, '#f9fafb', '#0f172a'), marginBottom: 4 }}>
                <span style={{ fontSize: 16 }}>✅</span>
                <div style={{ fontSize: 12, color: theme.textColor, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.text}</div>
              </div>
            ))}
            {/* 알림 없음 */}
            {(state.cache?.gmailUnread || 0) === 0
              && (state.ddays || []).filter(d => {
                  const diff = Math.ceil((new Date(d.date) - new Date(new Date().toDateString())) / 86400000);
                  return diff >= 0 && diff <= 7;
                }).length === 0
              && (state.todos || []).filter(t => !t.done).length === 0 && (
              <div style={{ textAlign: 'center', color: '#9ca3af', fontSize: 12, padding: '16px 0' }}>새 알림이 없습니다</div>
            )}
              </div>
            )}
          </div>
          <span style={{ fontSize: 10, color: c(theme, '#9ca3af', '#64748b'), fontVariantNumeric: 'tabular-nums' }}>
            {new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
      </div>

      {/* 오버레이 */}
      {ui.settingsOpen && <SettingsPanel />}
      {showAI && <AIPlusPanel onClose={() => setShowAI(false)} />}
      {showCommunity && <CommunityPanel onClose={() => setShowCommunity(false)} />}
      {showClipboard && <ClipboardPanel onClose={() => setShowClipboard(false)} />}

      {/* 업데이트 알림 */}
      {(updateInfo || updateProgress || updateReady) && (
        <div style={{ position: 'fixed', bottom: 60, right: 20, zIndex: 99998, background: c(theme,'#fff','#1e293b'), borderRadius: 14, padding: '16px 20px', boxShadow: '0 8px 32px rgba(0,0,0,0.15)', border: `2px solid ${theme.accentColor}`, maxWidth: 320 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 20 }}>{updateReady ? '✅' : updateProgress ? '⏳' : '🎉'}</span>
            <div style={{ fontSize: 14, fontWeight: 700, color: c(theme,'#1f2937','#e2e8f0') }}>
              {updateReady ? '업데이트 준비 완료!' : updateProgress ? '다운로드 중...' : '새 버전이 있습니다!'}
            </div>
          </div>

          {/* 다운로드 진행 바 */}
          {updateProgress && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ background: c(theme,'#e5e7eb','#334155'), borderRadius: 6, height: 6, overflow: 'hidden', marginBottom: 4 }}>
                <div style={{ background: theme.accentColor, height: '100%', width: `${updateProgress.percent}%`, borderRadius: 6, transition: 'width 0.3s' }} />
              </div>
              <div style={{ fontSize: 11, color: c(theme,'#9ca3af','#64748b'), textAlign: 'right' }}>{updateProgress.percent}%</div>
            </div>
          )}

          {updateInfo && !updateProgress && !updateReady && (
            <>
              <div style={{ fontSize: 12, color: c(theme,'#6b7280','#94a3b8'), marginBottom: 10 }}>
                현재: v{updateInfo.current} → 최신: v{updateInfo.latest}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={async () => {
                  // 자동 다운로드 시도
                  if (window.electronAPI?.update?.download) {
                    const ok = await window.electronAPI.update.download();
                    if (!ok) {
                      // 자동 다운로드 실패 → GitHub 페이지로 이동
                      const url = updateInfo.url || 'https://github.com/wizbeee/smart-teacher-desktop/releases';
                      if (window.electronAPI?.shell) window.electronAPI.shell.openExternal(url);
                      setUpdateInfo(null);
                    }
                  } else {
                    const url = updateInfo.url || 'https://github.com/wizbeee/smart-teacher-desktop/releases';
                    if (window.electronAPI?.shell) window.electronAPI.shell.openExternal(url);
                    else window.open(url, '_blank');
                    setUpdateInfo(null);
                  }
                }} style={{ flex: 1, background: theme.accentColor, color: '#fff', border: 'none', borderRadius: 8, padding: '8px', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>
                  📥 다운로드
                </button>
                <button onClick={() => setUpdateInfo(null)} style={{ background: c(theme,'#f3f4f6','#334155'), border: 'none', borderRadius: 8, padding: '8px 12px', fontSize: 12, cursor: 'pointer', color: c(theme,'#6b7280','#94a3b8') }}>
                  나중에
                </button>
              </div>
            </>
          )}

          {updateReady && (
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={() => {
                if (window.electronAPI?.update?.install) window.electronAPI.update.install();
              }} style={{ flex: 1, background: '#10b981', color: '#fff', border: 'none', borderRadius: 8, padding: '8px', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>
                🔄 지금 설치 & 재시작
              </button>
              <button onClick={() => { setUpdateReady(false); setUpdateInfo(null); }} style={{ background: c(theme,'#f3f4f6','#334155'), border: 'none', borderRadius: 8, padding: '8px 12px', fontSize: 12, cursor: 'pointer', color: c(theme,'#6b7280','#94a3b8') }}>
                종료 시 설치
              </button>
            </div>
          )}
        </div>
      )}
    </div>
    </>
  );
}

// ── 위젯별 에러 바운더리: 1개 위젯 오류가 전체를 죽이지 않음 ──
class WidgetErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { hasError: false }; }
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(err) { console.error(`[Widget ${this.props.id}]`, err); }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 6, opacity: 0.6 }}>
          <span style={{ fontSize: 20 }}>⚠️</span>
          <span style={{ fontSize: 10, color: '#9ca3af' }}>위젯 로드 실패</span>
          <button onClick={() => this.setState({ hasError: false })}
            style={{ fontSize: 9, background: this.props.theme?.accentColor || '#3b82f6', color: '#fff', border: 'none', borderRadius: 4, padding: '2px 8px', cursor: 'pointer' }}>
            다시 시도
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ── 에러 바운더리: 크래시 시 빈 화면 방지 ──────────────────
class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { hasError: false, error: null }; }
  static getDerivedStateFromError(error) { return { hasError: true, error }; }
  componentDidCatch(error, info) { console.error('[ErrorBoundary]', error, info); }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#fff1f2', fontFamily: 'Malgun Gothic, sans-serif' }}>
          <div style={{ textAlign: 'center', maxWidth: 400 }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
            <h2 style={{ color: '#991b1b', marginBottom: 8 }}>화면 로드 중 오류 발생</h2>
            <p style={{ color: '#6b7280', fontSize: 13, marginBottom: 16, lineHeight: 1.6 }}>
              {this.state.error?.message || '알 수 없는 오류'}
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
              <button onClick={() => { localStorage.removeItem('widget-layout'); window.location.reload(); }}
                style={{ background: '#f43f5e', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 20px', fontSize: 14, cursor: 'pointer' }}>
                🔄 레이아웃 초기화 & 새로고침
              </button>
              <button onClick={() => window.location.reload()}
                style={{ background: '#e5e7eb', color: '#374151', border: 'none', borderRadius: 10, padding: '10px 20px', fontSize: 14, cursor: 'pointer' }}>
                새로고침
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  return <AppProvider><ErrorBoundary><Dashboard /></ErrorBoundary></AppProvider>;
}
