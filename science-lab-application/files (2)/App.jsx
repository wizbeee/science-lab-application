// ============================================================
// App.jsx - 메인 앱 루트
// ============================================================

import React, { useEffect, useState } from 'react';
import { AppProvider, useApp } from './AppContext';
import Onboarding from './components/Onboarding';
import SettingsPanel from './components/SettingsPanel';
import CurrentPeriodWidget from './components/CurrentPeriodWidget';
import TimetableWidget from './components/TimetableWidget';
import CalendarWidget from './components/CalendarWidget';
import WeatherWidget from './components/WeatherWidget';
import MealWidget from './components/MealWidget';
import NoticeboardWidget from './components/NoticeboardWidget';
import AIPlusPanel from './components/AIPlusPanel';
import CommunityPanel from './components/CommunityPanel';
import { FocusWidget, ClipboardPanel } from './components/ProductivityWidgets';

// ── 시계 위젯 ───────────────────────────────────────────────
function ClockWidget() {
  const { state } = useApp();
  const { theme, user } = state;
  const [time, setTime] = React.useState(new Date());

  React.useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const days = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];
  const pad = n => String(n).padStart(2, '0');

  return (
    <div style={{ background: '#fff', borderRadius: 16, padding: '18px 22px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)', border: `1px solid ${theme.borderColor}` }}>
      <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 2 }}>현재 시각</div>
      <div style={{ fontSize: 38, fontWeight: 700, color: '#1f2937', letterSpacing: '-1px', lineHeight: 1 }}>
        {pad(time.getHours())}:{pad(time.getMinutes())}
        <span style={{ fontSize: 22, color: '#9ca3af' }}>:{pad(time.getSeconds())}</span>
      </div>
      <div style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>
        {time.getFullYear()}년 {time.getMonth() + 1}월 {time.getDate()}일 {days[time.getDay()]}
      </div>
      {user.name && <div style={{ fontSize: 12, color: theme.accentColor, marginTop: 6, fontWeight: 600 }}>👋 {user.name} 선생님</div>}
    </div>
  );
}

// ── D-Day 위젯 ──────────────────────────────────────────────
function DDayWidget() {
  const { state, actions } = useApp();
  const { theme, ddays } = state;
  const [adding, setAdding] = React.useState(false);
  const [form, setForm] = React.useState({ label: '', date: '', color: theme.accentColor });

  const calcDays = (dateStr) => {
    if (!dateStr) return null;
    const diff = new Date(dateStr) - new Date(new Date().toDateString());
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  };

  return (
    <div style={{ background: '#fff', borderRadius: 16, padding: '16px 18px', border: `1px solid ${theme.borderColor}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>📅 D-Day</div>
        <button onClick={() => setAdding(true)} style={{ background: theme.accentColor, color: '#fff', border: 'none', borderRadius: 7, padding: '4px 10px', fontSize: 12, cursor: 'pointer' }}>+ 추가</button>
      </div>

      {ddays.length === 0 && !adding && (
        <div style={{ textAlign: 'center', color: '#d1d5db', fontSize: 13, padding: '12px 0' }}>+ 추가를 눌러 D-Day를 등록하세요</div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {ddays.map(d => {
          const days = calcDays(d.date);
          return (
            <div key={d.id} style={{ background: d.color + '15', borderRadius: 10, padding: '10px 12px', position: 'relative' }}>
              <button onClick={() => actions.deleteDday(d.id)}
                style={{ position: 'absolute', top: 4, right: 6, background: 'none', border: 'none', color: '#d1d5db', cursor: 'pointer', fontSize: 12 }}>✕</button>
              <div style={{ fontSize: 20, fontWeight: 700, color: d.color }}>
                {days === null ? '?' : days === 0 ? 'D-Day' : days > 0 ? `D-${days}` : `D+${Math.abs(days)}`}
              </div>
              <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>{d.label}</div>
            </div>
          );
        })}
      </div>

      {adding && (
        <div style={{ marginTop: 12, background: '#f9fafb', borderRadius: 10, padding: 12 }}>
          <input placeholder="이름 (예: 1차 지필고사)" value={form.label}
            onChange={e => setForm({ ...form, label: e.target.value })}
            style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: 7, padding: '8px 10px', fontSize: 13, marginBottom: 8, fontFamily: 'inherit', outline: 'none' }}
          />
          <input type="date" value={form.date}
            onChange={e => setForm({ ...form, date: e.target.value })}
            style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: 7, padding: '8px 10px', fontSize: 13, marginBottom: 8, fontFamily: 'inherit', outline: 'none' }}
          />
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => { if (form.label && form.date) { actions.addDday(form); setAdding(false); setForm({ label: '', date: '', color: theme.accentColor }); } }}
              style={{ flex: 1, background: theme.accentColor, color: '#fff', border: 'none', borderRadius: 7, padding: '8px', fontSize: 13, cursor: 'pointer' }}>저장</button>
            <button onClick={() => setAdding(false)}
              style={{ flex: 1, background: '#e5e7eb', color: '#6b7280', border: 'none', borderRadius: 7, padding: '8px', fontSize: 13, cursor: 'pointer' }}>취소</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── 할 일 위젯 ──────────────────────────────────────────────
function TodoWidget() {
  const { state, actions } = useApp();
  const { theme, todos } = state;
  const [input, setInput] = React.useState('');

  const add = () => {
    if (!input.trim()) return;
    actions.addTodo({ text: input.trim(), done: false, tag: '', priority: 'normal' });
    setInput('');
  };

  return (
    <div style={{ background: '#fff', borderRadius: 16, padding: '16px 18px', border: `1px solid ${theme.borderColor}` }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 12 }}>
        ✅ 할 일
        {todos.filter(t => !t.done).length > 0 && (
          <span style={{ marginLeft: 6, background: '#fee2e2', color: '#dc2626', fontSize: 11, padding: '2px 7px', borderRadius: 10 }}>
            {todos.filter(t => !t.done).length}개
          </span>
        )}
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        <input value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && add()}
          placeholder="할 일 추가 후 Enter"
          style={{ flex: 1, border: '1.5px solid #e5e7eb', borderRadius: 8, padding: '8px 12px', fontSize: 13, outline: 'none', fontFamily: 'inherit' }}
        />
        <button onClick={add} style={{ background: theme.accentColor, color: '#fff', border: 'none', borderRadius: 8, padding: '8px 14px', cursor: 'pointer', fontSize: 14 }}>+</button>
      </div>

      <div style={{ maxHeight: 200, overflowY: 'auto' }}>
        {todos.map(t => (
          <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '0.5px solid #f9fafb' }}>
            <button onClick={() => actions.updateTodo({ ...t, done: !t.done })}
              style={{ width: 18, height: 18, borderRadius: 5, border: `2px solid ${t.done ? theme.accentColor : '#d1d5db'}`, background: t.done ? theme.accentColor : '#fff', cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>
              {t.done && <span style={{ color: '#fff', fontSize: 11 }}>✓</span>}
            </button>
            <span style={{ flex: 1, fontSize: 13, color: t.done ? '#9ca3af' : '#374151', textDecoration: t.done ? 'line-through' : 'none' }}>{t.text}</span>
            <button onClick={() => actions.deleteTodo(t.id)}
              style={{ background: 'none', border: 'none', color: '#d1d5db', cursor: 'pointer', fontSize: 14, padding: '0 2px' }}>✕</button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── 메모 위젯 ───────────────────────────────────────────────
function MemoWidget() {
  const { state, actions } = useApp();
  const { theme, memos } = state;
  const [text, setText] = React.useState(memos[0]?.text || '');
  const memoId = memos[0]?.id;

  const save = (val) => {
    setText(val);
    if (memoId) actions.updateMemo({ id: memoId, text: val });
    else if (val) actions.addMemo({ text: val });
  };

  return (
    <div style={{ background: '#fff', borderRadius: 16, padding: '16px 18px', border: `1px solid ${theme.borderColor}` }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 10 }}>📝 메모</div>
      <textarea value={text} onChange={e => save(e.target.value)}
        placeholder="자유롭게 메모하세요..."
        style={{ width: '100%', height: 120, border: '1px solid #f0f0f0', borderRadius: 8, padding: '10px', fontSize: 13, resize: 'none', fontFamily: 'inherit', outline: 'none', color: '#374151', lineHeight: 1.6 }}
      />
    </div>
  );
}

// ── 시스템 제어 위젯 ────────────────────────────────────────
function SystemWidget() {
  const { state } = useApp();
  const { theme } = state;
  const [vol, setVol] = React.useState(60);
  const [bright, setBright] = React.useState(80);

  return (
    <div style={{ background: '#fff', borderRadius: 16, padding: '16px 18px', border: `1px solid ${theme.borderColor}` }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 12 }}>🖥️ 시스템</div>
      {[
        { label: '🔊', value: vol, setter: setVol },
        { label: '☀️', value: bright, setter: setBright }
      ].map(s => (
        <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <span style={{ fontSize: 16, width: 24 }}>{s.label}</span>
          <input type="range" min={0} max={100} value={s.value}
            onChange={e => s.setter(Number(e.target.value))}
            style={{ flex: 1, accentColor: theme.accentColor }}
          />
          <span style={{ fontSize: 12, color: '#9ca3af', width: 28, textAlign: 'right' }}>{s.value}</span>
        </div>
      ))}
      <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
        <button onClick={() => window.electronAPI?.system.lock()}
          style={{ flex: 1, background: '#f3f4f6', border: 'none', borderRadius: 8, padding: '8px', fontSize: 12, cursor: 'pointer', color: '#374151' }}>🔒 잠금</button>
        <button onClick={() => window.electronAPI?.system.sleep()}
          style={{ flex: 1, background: '#f3f4f6', border: 'none', borderRadius: 8, padding: '8px', fontSize: 12, cursor: 'pointer', color: '#374151' }}>💤 절전</button>
      </div>
    </div>
  );
}

// ── 메인 레이아웃 ────────────────────────────────────────────
function Dashboard() {
  const { state, actions } = useApp();
  const { theme, user, ui, ai } = state;

  const [showAI, setShowAI] = useState(false);
  const [showCommunity, setShowCommunity] = useState(false);
  const [showClipboard, setShowClipboard] = useState(false);

  // Electron 이벤트
  useEffect(() => {
    if (!window.electronAPI) return;
    window.electronAPI.on('open-settings', () => actions.setUI({ settingsOpen: true }));
  }, []);

  if (!user.setupComplete) {
    return <Onboarding onComplete={() => actions.setUser({ setupComplete: true })} />;
  }

  return (
    <div style={{
      width: '100vw', minHeight: '100vh',
      background: theme.bgColor,
      fontFamily: "'Malgun Gothic', 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif",
      boxSizing: 'border-box',
      display: 'flex', flexDirection: 'column'
    }}>
      {/* 전광판 */}
      <div style={{ padding: '10px 16px 0' }}>
        <NoticeboardWidget />
      </div>

      {/* 메인 3단 그리드 */}
      <div style={{
        flex: 1, padding: '10px 16px',
        display: 'grid',
        gridTemplateColumns: '260px 1fr 220px',
        gap: 10, alignItems: 'start'
      }}>

        {/* ── 좌측 ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <ClockWidget />
          <div style={{ background: '#fff', borderRadius: 16, padding: '14px 16px', border: `1px solid ${theme.borderColor}` }}>
            <TimetableWidget />
          </div>
          <DDayWidget />
          <FocusWidget />
        </div>

        {/* ── 중앙 ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <CurrentPeriodWidget />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <TodoWidget />
            <div style={{ background: '#fff', borderRadius: 16, padding: '14px 16px', border: `1px solid ${theme.borderColor}` }}>
              <CalendarWidget />
            </div>
          </div>
          <MemoWidget />

          {/* 빠른 실행 바 */}
          <div style={{
            background: '#fff', borderRadius: 14, padding: '10px 16px',
            border: `1px solid ${theme.borderColor}`,
            display: 'flex', gap: 7, alignItems: 'center', flexWrap: 'wrap'
          }}>
            <span style={{ fontSize: 11, color: '#9ca3af', flexShrink: 0 }}>빠른 실행</span>
            {[
              { label: '📋 클립보드', action: () => setShowClipboard(true) },
              { label: '👥 커뮤니티', action: () => setShowCommunity(true) },
              { label: '📸 캡처', action: async () => { await window.electronAPI?.screenshot?.take(); } },
              { label: '🔒 잠금', action: () => window.electronAPI?.system?.lock() }
            ].map(b => (
              <button key={b.label} onClick={b.action} style={{
                background: theme.accentColor + '12',
                border: `1px solid ${theme.accentColor}25`,
                borderRadius: 8, padding: '6px 11px',
                fontSize: 12, color: theme.accentColor,
                cursor: 'pointer', fontWeight: 500
              }}>{b.label}</button>
            ))}
            {ai.enabled && (
              <button onClick={() => setShowAI(true)} style={{
                marginLeft: 'auto',
                background: '#f3e8ff', border: '1px solid #c084fc50',
                borderRadius: 8, padding: '6px 12px',
                fontSize: 12, color: '#7c3aed', cursor: 'pointer', fontWeight: 600
              }}>✦ AI Plus</button>
            )}
            {!ai.enabled && (
              <button onClick={() => actions.setUI({ settingsOpen: true, settingsTab: 'ai' })} style={{
                marginLeft: 'auto',
                background: '#f9fafb', border: '1px solid #e5e7eb',
                borderRadius: 8, padding: '6px 12px',
                fontSize: 11, color: '#9ca3af', cursor: 'pointer'
              }}>✦ AI Plus 활성화</button>
            )}
          </div>
        </div>

        {/* ── 우측 ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <WeatherWidget />
          <MealWidget />
          <div style={{ background: '#fff', borderRadius: 16, padding: '14px 18px', border: `1px solid ${theme.borderColor}` }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 10 }}>📧 받은 메일</div>
            <div style={{ fontSize: 13, color: '#9ca3af', textAlign: 'center', padding: '16px 0' }}>
              {state.google.connected ? '메일 동기화 중...' : 'Google 연동 후\n메일이 표시됩니다'}
            </div>
          </div>
          <SystemWidget />
        </div>
      </div>

      {/* 하단 독 */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        gap: 6, padding: '8px 16px 12px',
        background: 'rgba(255,255,255,0.7)',
        backdropFilter: 'blur(8px)',
        borderTop: `0.5px solid ${theme.borderColor}`
      }}>
        {[
          { icon: '🌐', label: 'Google', action: () => window.electronAPI?.shell?.openExternal('https://www.google.com') },
          { icon: '📅', label: '캘린더', action: () => window.electronAPI?.shell?.openExternal('https://calendar.google.com') },
          { icon: '📧', label: 'Gmail', action: () => window.electronAPI?.shell?.openExternal('https://mail.google.com') },
          { icon: '📁', label: 'Drive', action: () => window.electronAPI?.shell?.openExternal('https://drive.google.com') },
          { icon: '🎓', label: 'Classroom', action: () => window.electronAPI?.shell?.openExternal('https://classroom.google.com') }
        ].map(item => (
          <DockItem key={item.label} {...item} theme={theme} />
        ))}
        <div style={{ width: 0.5, height: 28, background: theme.borderColor, margin: '0 4px' }} />
        {[
          { icon: '📝', label: '세특', action: () => setShowAI(true) },
          { icon: '📡', label: '커뮤니티', action: () => setShowCommunity(true) },
          { icon: '📋', label: '클립보드', action: () => setShowClipboard(true) }
        ].map(item => (
          <DockItem key={item.label} {...item} theme={theme} />
        ))}
        <div style={{ width: 0.5, height: 28, background: theme.borderColor, margin: '0 4px' }} />
        <DockItem icon="⚙" label="설정" action={() => actions.setUI({ settingsOpen: true })} theme={theme} active />
      </div>

      {/* 오버레이 패널들 */}
      {ui.settingsOpen && <SettingsPanel />}
      {showAI && <AIPlusPanel onClose={() => setShowAI(false)} />}
      {showCommunity && <CommunityPanel onClose={() => setShowCommunity(false)} />}
      {showClipboard && <ClipboardPanel onClose={() => setShowClipboard(false)} />}
    </div>
  );
}

function DockItem({ icon, label, action, theme, active }) {
  const [hover, setHover] = useState(false);
  return (
    <div style={{ position: 'relative', textAlign: 'center' }}>
      {hover && (
        <div style={{
          position: 'absolute', bottom: '110%', left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(0,0,0,0.75)', color: '#fff',
          fontSize: 11, padding: '3px 8px', borderRadius: 6,
          whiteSpace: 'nowrap', pointerEvents: 'none'
        }}>{label}</div>
      )}
      <button
        onClick={action}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{
          width: 38, height: 38, borderRadius: 10, fontSize: 18,
          background: active ? theme.accentColor + '20' : 'rgba(255,255,255,0.8)',
          border: `1px solid ${active ? theme.accentColor + '40' : theme.borderColor}`,
          cursor: 'pointer',
          transform: hover ? 'scale(1.15) translateY(-3px)' : 'scale(1)',
          transition: 'all 0.15s',
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
        {icon}
      </button>
    </div>
  );
}

// ── 루트 ────────────────────────────────────────────────────
export default function App() {
  return (
    <AppProvider>
      <Dashboard />
    </AppProvider>
  );
}
