// ============================================================
// NewWidgets.jsx - 신규 위젯 모음 (#3~#50)
// 모든 새 위젯은 기본 OFF
// ============================================================

import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../AppContext';

// ── 테마 헬퍼 ────────────────────────────────────────────────
const c = (theme, light, dark) => theme.darkMode ? dark : light;

// ============================================================
// #3 타임라인 뷰 위젯 — 오늘 일정을 가로 타임라인으로 표시
// ============================================================
export function TimelineWidget() {
  const { state } = useApp();
  const { theme, cache, schedule } = state;
  const events = cache.calendarEvents || [];
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
  const todayEvents = events.filter(e => e.date === todayStr && e.time);
  const periods = (schedule?.periods || []).filter(p => p.type === 'class');

  const hours = Array.from({ length: 15 }, (_, i) => i + 7); // 7~21시
  const nowH = today.getHours();
  const nowM = today.getMinutes();
  const nowPct = ((nowH - 7) * 60 + nowM) / (14 * 60) * 100;

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>📊 타임라인</div>
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden', minHeight: 60 }}>
        {/* 시간 눈금 */}
        <div style={{ display: 'flex', height: 16 }}>
          {hours.map(h => (
            <div key={h} style={{ flex: 1, fontSize: 8, color: c(theme, '#9ca3af', '#64748b'), textAlign: 'center', borderLeft: `0.5px solid ${theme.borderColor}` }}>
              {h}
            </div>
          ))}
        </div>
        {/* 수업 시간대 */}
        <div style={{ position: 'relative', height: 20, background: c(theme, '#f9fafb', '#0f172a'), borderRadius: 4, overflow: 'hidden' }}>
          {periods.map((p, i) => {
            const [sh, sm] = p.start.split(':').map(Number);
            const [eh, em] = p.end.split(':').map(Number);
            const left = ((sh - 7) * 60 + sm) / (14 * 60) * 100;
            const width = ((eh - sh) * 60 + (em - sm)) / (14 * 60) * 100;
            return <div key={i} style={{ position: 'absolute', left: `${left}%`, width: `${width}%`, height: '100%', background: theme.accentColor + '25', borderRadius: 3 }} title={p.name} />;
          })}
          {/* 현재 시간 표시 */}
          {nowPct >= 0 && nowPct <= 100 && (
            <div style={{ position: 'absolute', left: `${nowPct}%`, top: 0, bottom: 0, width: 2, background: '#ef4444', zIndex: 2 }} />
          )}
        </div>
        {/* 일정 이벤트 */}
        <div style={{ position: 'relative', height: 22, marginTop: 2 }}>
          {todayEvents.map(ev => {
            const [h, m] = ev.time.split(':').map(Number);
            const left = ((h - 7) * 60 + m) / (14 * 60) * 100;
            const dur = ev.endTime ? (() => { const [eh, em] = ev.endTime.split(':').map(Number); return ((eh - h) * 60 + (em - m)) / (14 * 60) * 100; })() : 4;
            return (
              <div key={ev.id} title={`${ev.time} ${ev.title}`}
                style={{ position: 'absolute', left: `${Math.max(0, left)}%`, width: `${Math.max(3, dur)}%`, height: 18, background: ev.color || theme.accentColor, borderRadius: 3, fontSize: 8, color: '#fff', padding: '2px 3px', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                {ev.title}
              </div>
            );
          })}
        </div>
      </div>
      {todayEvents.length === 0 && <div style={{ fontSize: 10, color: '#9ca3af', textAlign: 'center', marginTop: 4 }}>오늘 시간이 지정된 일정이 없습니다</div>}
    </div>
  );
}

// ============================================================
// #4 듀얼 타임존 위젯
// ============================================================
export function DualTimezoneWidget() {
  const { state } = useApp();
  const { theme } = state;
  const [now, setNow] = useState(new Date());
  const [zones, setZones] = useState(() => {
    try { return JSON.parse(localStorage.getItem('dual-tz') || '["Asia/Seoul","America/New_York"]'); } catch { return ['Asia/Seoul', 'America/New_York']; }
  });
  const [editing, setEditing] = useState(false);

  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);

  const ZONE_OPTIONS = [
    { value: 'Asia/Seoul', label: '서울 🇰🇷' },
    { value: 'Asia/Tokyo', label: '도쿄 🇯🇵' },
    { value: 'Asia/Shanghai', label: '상하이 🇨🇳' },
    { value: 'America/New_York', label: '뉴욕 🇺🇸' },
    { value: 'America/Los_Angeles', label: 'LA 🇺🇸' },
    { value: 'Europe/London', label: '런던 🇬🇧' },
    { value: 'Europe/Paris', label: '파리 🇫🇷' },
    { value: 'Europe/Berlin', label: '베를린 🇩🇪' },
    { value: 'Australia/Sydney', label: '시드니 🇦🇺' },
    { value: 'Pacific/Auckland', label: '오클랜드 🇳🇿' },
  ];

  const fmt = (tz) => {
    try {
      return now.toLocaleTimeString('ko', { timeZone: tz, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
    } catch { return '--:--:--'; }
  };
  const fmtDate = (tz) => {
    try {
      return now.toLocaleDateString('ko', { timeZone: tz, month: 'short', day: 'numeric', weekday: 'short' });
    } catch { return ''; }
  };
  const getLabel = (tz) => ZONE_OPTIONS.find(z => z.value === tz)?.label || tz.split('/').pop();

  const updateZone = (idx, val) => {
    const newZones = [...zones]; newZones[idx] = val;
    setZones(newZones); localStorage.setItem('dual-tz', JSON.stringify(newZones));
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 600 }}>🌍 세계 시계</span>
        <button onClick={() => setEditing(!editing)} style={{ background: 'none', border: 'none', fontSize: 10, cursor: 'pointer', color: theme.accentColor }}>{editing ? '완료' : '편집'}</button>
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {zones.map((tz, i) => (
          <div key={i} style={{ background: c(theme, '#f9fafb', '#0f172a'), borderRadius: 8, padding: '8px 10px' }}>
            {editing ? (
              <select value={tz} onChange={e => updateZone(i, e.target.value)}
                style={{ width: '100%', border: `1px solid ${theme.borderColor}`, borderRadius: 6, padding: '4px', fontSize: 11, background: c(theme, '#fff', '#1e293b'), color: theme.textColor }}>
                {ZONE_OPTIONS.map(z => <option key={z.value} value={z.value}>{z.label}</option>)}
              </select>
            ) : (
              <>
                <div style={{ fontSize: 10, color: c(theme, '#6b7280', '#94a3b8') }}>{getLabel(tz)}</div>
                <div style={{ fontSize: 20, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: theme.textColor }}>{fmt(tz)}</div>
                <div style={{ fontSize: 9, color: c(theme, '#9ca3af', '#64748b') }}>{fmtDate(tz)}</div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// #5 이벤트 템플릿 위젯
// ============================================================
export function EventTemplateWidget() {
  const { state, actions } = useApp();
  const { theme, cache } = state;
  const events = cache.calendarEvents || [];
  const [templates, setTemplates] = useState(() => {
    try { return JSON.parse(localStorage.getItem('event-templates') || '[]'); } catch { return []; }
  });
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ title: '', time: '', duration: 60 });

  const defaultTemplates = [
    { id: 'meet', title: '교직원 회의', time: '16:30', duration: 60, emoji: '🤝' },
    { id: 'parent', title: '학부모 상담', time: '14:00', duration: 30, emoji: '👨‍👩‍👧' },
    { id: 'study', title: '교과 연구회', time: '15:00', duration: 90, emoji: '📖' },
    { id: 'class', title: '공개수업', time: '10:00', duration: 50, emoji: '🎓' },
  ];

  const allTemplates = [...defaultTemplates, ...templates];

  const applyTemplate = (t) => {
    const today = new Date();
    const dateStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
    const endH = parseInt(t.time.split(':')[0]) + Math.floor(t.duration / 60);
    const endM = parseInt(t.time.split(':')[1]) + (t.duration % 60);
    const endTime = `${String(endH).padStart(2,'0')}:${String(endM % 60).padStart(2,'0')}`;
    const newEvent = { id: Date.now(), date: dateStr, title: t.title, time: t.time, endTime, color: theme.accentColor };
    actions.setCache({ calendarEvents: [...events, newEvent] });
  };

  const saveTemplate = () => {
    if (!form.title) return;
    const updated = [...templates, { id: Date.now(), ...form, emoji: '📌' }];
    setTemplates(updated); localStorage.setItem('event-templates', JSON.stringify(updated));
    setForm({ title: '', time: '', duration: 60 }); setAdding(false);
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 600 }}>📋 일정 템플릿</span>
        <button onClick={() => setAdding(!adding)} style={{ background: theme.accentColor, color: '#fff', border: 'none', borderRadius: 5, padding: '2px 8px', fontSize: 10, cursor: 'pointer' }}>{adding ? '취소' : '+'}</button>
      </div>
      {adding && (
        <div style={{ background: c(theme, '#f9fafb', '#0f172a'), borderRadius: 8, padding: 8, marginBottom: 6 }}>
          <input placeholder="일정명" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })}
            style={{ width: '100%', border: `1px solid ${theme.borderColor}`, borderRadius: 5, padding: '4px 6px', fontSize: 11, marginBottom: 4, outline: 'none', background: c(theme, '#fff', '#1e293b'), color: theme.textColor }} />
          <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
            <input type="time" value={form.time} onChange={e => setForm({ ...form, time: e.target.value })}
              style={{ flex: 1, border: `1px solid ${theme.borderColor}`, borderRadius: 5, padding: '3px', fontSize: 10, outline: 'none', background: c(theme, '#fff', '#1e293b'), color: theme.textColor }} />
            <input type="number" min={10} max={480} value={form.duration} onChange={e => setForm({ ...form, duration: Number(e.target.value) })}
              style={{ width: 50, border: `1px solid ${theme.borderColor}`, borderRadius: 5, padding: '3px', fontSize: 10, outline: 'none', background: c(theme, '#fff', '#1e293b'), color: theme.textColor }} />
            <span style={{ fontSize: 9, color: '#9ca3af', alignSelf: 'center' }}>분</span>
          </div>
          <button onClick={saveTemplate} style={{ width: '100%', background: theme.accentColor, color: '#fff', border: 'none', borderRadius: 5, padding: '4px', fontSize: 11, cursor: 'pointer' }}>저장</button>
        </div>
      )}
      <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 3 }}>
        {allTemplates.map(t => (
          <button key={t.id} onClick={() => applyTemplate(t)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px', borderRadius: 6, border: 'none', cursor: 'pointer', background: c(theme, '#f9fafb', '#1e293b'), color: theme.textColor, textAlign: 'left', transition: 'background 0.15s' }}>
            <span style={{ fontSize: 16 }}>{t.emoji || '📌'}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, fontWeight: 600 }}>{t.title}</div>
              <div style={{ fontSize: 9, color: c(theme, '#9ca3af', '#64748b') }}>{t.time} · {t.duration}분</div>
            </div>
            <span style={{ fontSize: 9, color: theme.accentColor }}>+ 오늘</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// #9 일일 저널 위젯
// ============================================================
export function JournalWidget() {
  const { state } = useApp();
  const { theme } = state;
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
  const [entries, setEntries] = useState(() => {
    try { return JSON.parse(localStorage.getItem('journal-entries') || '{}'); } catch { return {}; }
  });
  const [text, setText] = useState(entries[todayKey] || '');
  const [viewDate, setViewDate] = useState(todayKey);

  const save = (val) => {
    setText(val);
    const updated = { ...entries, [viewDate]: val };
    setEntries(updated);
    localStorage.setItem('journal-entries', JSON.stringify(updated));
  };

  const navigate = (delta) => {
    const d = new Date(viewDate);
    d.setDate(d.getDate() + delta);
    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    setViewDate(key);
    setText(entries[key] || '');
  };

  const isToday = viewDate === todayKey;
  const dateLabel = (() => {
    const d = new Date(viewDate);
    const days = ['일','월','화','수','목','금','토'];
    return `${d.getMonth()+1}/${d.getDate()} (${days[d.getDay()]})`;
  })();

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 12, fontWeight: 600 }}>📓 일일 저널</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: c(theme, '#6b7280', '#94a3b8') }}>‹</button>
          <span style={{ fontSize: 11, fontWeight: isToday ? 700 : 400, color: isToday ? theme.accentColor : theme.textColor }}>{isToday ? '오늘' : dateLabel}</span>
          <button onClick={() => navigate(1)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: c(theme, '#6b7280', '#94a3b8') }}>›</button>
        </div>
      </div>
      <textarea value={text} onChange={e => save(e.target.value)}
        placeholder={isToday ? '오늘 하루를 기록하세요...' : '이 날의 기록이 없습니다'}
        style={{ flex: 1, width: '100%', border: `1px solid ${theme.borderColor}`, borderRadius: 6, padding: '6px 8px', fontSize: 11, resize: 'none', fontFamily: 'inherit', outline: 'none', background: c(theme, '#fafafa', '#0f172a'), color: theme.textColor, lineHeight: 1.6, boxSizing: 'border-box' }} />
      <div style={{ fontSize: 9, color: '#9ca3af', marginTop: 2, textAlign: 'right' }}>
        {Object.keys(entries).filter(k => entries[k]).length}일 기록됨
      </div>
    </div>
  );
}

// ============================================================
// #12 스티커 노트 위젯
// ============================================================
export function StickyNoteWidget() {
  const { state } = useApp();
  const { theme } = state;
  const [notes, setNotes] = useState(() => {
    try { return JSON.parse(localStorage.getItem('sticky-notes') || '[]'); } catch { return []; }
  });
  const [editing, setEditing] = useState(null);

  const colors = ['#fef08a', '#bbf7d0', '#bfdbfe', '#fecaca', '#e9d5ff', '#fed7aa'];

  const save = (updated) => { setNotes(updated); localStorage.setItem('sticky-notes', JSON.stringify(updated)); };
  const addNote = () => {
    const note = { id: Date.now(), text: '', color: colors[notes.length % colors.length], pinned: false };
    save([note, ...notes]); setEditing(note.id);
  };
  const updateNote = (id, data) => save(notes.map(n => n.id === id ? { ...n, ...data } : n));
  const deleteNote = (id) => save(notes.filter(n => n.id !== id));

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 600 }}>📌 스티커 노트</span>
        <button onClick={addNote} style={{ background: theme.accentColor, color: '#fff', border: 'none', borderRadius: 5, padding: '2px 8px', fontSize: 10, cursor: 'pointer' }}>+</button>
      </div>
      <div style={{ flex: 1, overflow: 'auto', display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 4 }}>
        {notes.map(n => (
          <div key={n.id} style={{ background: n.color + (theme.darkMode ? '40' : ''), borderRadius: 6, padding: 6, position: 'relative', minHeight: 50 }}>
            {editing === n.id ? (
              <textarea autoFocus value={n.text} onChange={e => updateNote(n.id, { text: e.target.value })}
                onBlur={() => setEditing(null)}
                style={{ width: '100%', height: '100%', minHeight: 40, background: 'transparent', border: 'none', outline: 'none', resize: 'none', fontSize: 10, fontFamily: 'inherit', color: '#1f2937', lineHeight: 1.4 }} />
            ) : (
              <div onClick={() => setEditing(n.id)} style={{ fontSize: 10, color: '#1f2937', lineHeight: 1.4, cursor: 'text', minHeight: 30, whiteSpace: 'pre-wrap' }}>
                {n.text || '클릭하여 입력...'}
              </div>
            )}
            <button onClick={() => deleteNote(n.id)} style={{ position: 'absolute', top: 2, right: 4, background: 'none', border: 'none', fontSize: 8, cursor: 'pointer', color: '#9ca3af', opacity: 0.6 }}>✕</button>
          </div>
        ))}
      </div>
      {notes.length === 0 && <div style={{ textAlign: 'center', color: '#9ca3af', fontSize: 11, padding: '12px 0' }}>+ 버튼으로 메모 추가</div>}
    </div>
  );
}

// ============================================================
// #13 습관 트래커 위젯
// ============================================================
export function HabitTrackerWidget() {
  const { state } = useApp();
  const { theme } = state;
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;

  const [habits, setHabits] = useState(() => {
    try { return JSON.parse(localStorage.getItem('habits') || '[]'); } catch { return []; }
  });
  const [adding, setAdding] = useState(false);
  const [input, setInput] = useState('');

  const save = (updated) => { setHabits(updated); localStorage.setItem('habits', JSON.stringify(updated)); };

  const addHabit = () => {
    if (!input.trim()) return;
    save([...habits, { id: Date.now(), name: input.trim(), log: {} }]);
    setInput(''); setAdding(false);
  };

  const toggle = (id) => {
    save(habits.map(h => {
      if (h.id !== id) return h;
      const log = { ...h.log };
      log[todayStr] = !log[todayStr];
      return { ...h, log };
    }));
  };

  const getStreak = (habit) => {
    let streak = 0;
    const d = new Date(today);
    while (true) {
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      if (!habit.log[key]) break;
      streak++; d.setDate(d.getDate() - 1);
    }
    return streak;
  };

  // 최근 7일
  const last7 = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today); d.setDate(d.getDate() - (6 - i));
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  });
  const days = ['일','월','화','수','목','금','토'];

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 600 }}>🔥 습관 트래커</span>
        <button onClick={() => setAdding(!adding)} style={{ background: theme.accentColor, color: '#fff', border: 'none', borderRadius: 5, padding: '2px 8px', fontSize: 10, cursor: 'pointer' }}>{adding ? '취소' : '+'}</button>
      </div>
      {adding && (
        <div style={{ display: 'flex', gap: 3, marginBottom: 6 }}>
          <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && addHabit()}
            placeholder="습관 이름 (예: 물 8잔)" style={{ flex: 1, border: `1px solid ${theme.borderColor}`, borderRadius: 5, padding: '4px 6px', fontSize: 11, outline: 'none', background: c(theme, '#fff', '#0f172a'), color: theme.textColor }} />
          <button onClick={addHabit} style={{ background: theme.accentColor, color: '#fff', border: 'none', borderRadius: 5, padding: '4px 8px', fontSize: 10, cursor: 'pointer' }}>추가</button>
        </div>
      )}
      {/* 요일 헤더 */}
      <div style={{ display: 'flex', gap: 2, marginBottom: 4, paddingLeft: '40%' }}>
        {last7.map(d => {
          const day = new Date(d);
          return <div key={d} style={{ flex: 1, fontSize: 8, textAlign: 'center', color: d === todayStr ? theme.accentColor : c(theme, '#9ca3af', '#64748b'), fontWeight: d === todayStr ? 700 : 400 }}>{days[day.getDay()]}</div>;
        })}
      </div>
      <div style={{ flex: 1, overflow: 'auto' }}>
        {habits.map(h => {
          const streak = getStreak(h);
          return (
            <div key={h.id} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 0', borderBottom: `0.5px solid ${theme.borderColor}` }}>
              <div style={{ width: '38%', display: 'flex', alignItems: 'center', gap: 3 }}>
                <span style={{ fontSize: 11, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.name}</span>
                {streak > 0 && <span style={{ fontSize: 9, color: '#f59e0b', fontWeight: 700 }}>🔥{streak}</span>}
              </div>
              <div style={{ flex: 1, display: 'flex', gap: 2 }}>
                {last7.map(d => (
                  <button key={d} onClick={() => { if (d === todayStr) toggle(h.id); }}
                    style={{ flex: 1, height: 16, borderRadius: 3, border: 'none', cursor: d === todayStr ? 'pointer' : 'default',
                      background: h.log[d] ? '#10b981' : c(theme, '#f3f4f6', '#334155'),
                      opacity: d === todayStr ? 1 : 0.7 }} />
                ))}
              </div>
              <button onClick={() => save(habits.filter(hh => hh.id !== h.id))} style={{ background: 'none', border: 'none', fontSize: 8, cursor: 'pointer', color: '#9ca3af' }}>✕</button>
            </div>
          );
        })}
      </div>
      {habits.length === 0 && !adding && <div style={{ textAlign: 'center', color: '#9ca3af', fontSize: 11, padding: '12px 0' }}>습관을 추가하세요</div>}
    </div>
  );
}

// ============================================================
// #14 일일 미니 챌린지 위젯
// ============================================================
export function DailyChallengeWidget() {
  const { state } = useApp();
  const { theme } = state;
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;

  const CHALLENGES = [
    '동료에게 칭찬 1회 하기', '5분간 정리정돈', '물 3잔 마시기', '10분 독서하기',
    '새로운 수업 방법 1개 찾기', '학생에게 격려 메시지 쓰기', '5분 스트레칭',
    '감사한 일 3가지 적기', '1시간 SNS 안 보기', '복도에서 학생에게 인사하기',
    '점심 천천히 먹기', '오늘의 목표 1개 세우기', '퇴근 전 책상 정리',
    '새로운 음악 듣기', '동료에게 간식 나누기', '3분 명상하기',
  ];

  const [completed, setCompleted] = useState(() => {
    try { return JSON.parse(localStorage.getItem('daily-challenge') || '{}'); } catch { return {}; }
  });

  const idx = (today.getFullYear() * 366 + today.getMonth() * 31 + today.getDate()) % CHALLENGES.length;
  const challenge = CHALLENGES[idx];
  const isDone = completed[todayStr];

  const toggleDone = () => {
    const updated = { ...completed, [todayStr]: !isDone };
    setCompleted(updated);
    localStorage.setItem('daily-challenge', JSON.stringify(updated));
  };

  // 연속 완료일
  let streak = 0;
  const d = new Date(today);
  while (true) {
    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    if (!completed[key]) break;
    streak++; d.setDate(d.getDate() - 1);
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', gap: 8, padding: 8 }}>
      <div style={{ fontSize: 12, fontWeight: 600 }}>🎯 오늘의 챌린지</div>
      <div style={{ fontSize: 24 }}>{isDone ? '🎉' : '💪'}</div>
      <div style={{ fontSize: 13, fontWeight: 500, lineHeight: 1.5, color: isDone ? '#10b981' : theme.textColor, textDecoration: isDone ? 'line-through' : 'none' }}>
        {challenge}
      </div>
      <button onClick={toggleDone} style={{
        background: isDone ? '#10b981' : theme.accentColor, color: '#fff',
        border: 'none', borderRadius: 8, padding: '6px 16px', fontSize: 12, cursor: 'pointer'
      }}>{isDone ? '✅ 완료!' : '도전하기'}</button>
      {streak > 0 && <div style={{ fontSize: 10, color: '#f59e0b' }}>🔥 {streak}일 연속 달성!</div>}
    </div>
  );
}

// ============================================================
// #15 칸반 보드 위젯
// ============================================================
export function KanbanWidget() {
  const { state } = useApp();
  const { theme } = state;
  const [columns, setColumns] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('kanban') || 'null');
      if (saved) return saved;
    } catch {}
    return { todo: { label: '할 일', items: [] }, doing: { label: '진행 중', items: [] }, done: { label: '완료', items: [] } };
  });
  const [input, setInput] = useState('');
  const [dragItem, setDragItem] = useState(null);

  const save = (updated) => { setColumns(updated); localStorage.setItem('kanban', JSON.stringify(updated)); };

  const addItem = () => {
    if (!input.trim()) return;
    const updated = { ...columns };
    updated.todo.items.push({ id: Date.now(), text: input.trim() });
    save(updated); setInput('');
  };

  const moveItem = (fromCol, itemId, toCol) => {
    const updated = { ...columns };
    const item = updated[fromCol].items.find(i => i.id === itemId);
    if (!item) return;
    updated[fromCol] = { ...updated[fromCol], items: updated[fromCol].items.filter(i => i.id !== itemId) };
    updated[toCol] = { ...updated[toCol], items: [...updated[toCol].items, item] };
    save(updated);
  };

  const deleteItem = (col, itemId) => {
    const updated = { ...columns };
    updated[col] = { ...updated[col], items: updated[col].items.filter(i => i.id !== itemId) };
    save(updated);
  };

  const colColors = { todo: '#3b82f6', doing: '#f59e0b', done: '#10b981' };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>📋 칸반 보드</div>
      <div style={{ display: 'flex', gap: 3, marginBottom: 4 }}>
        <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && addItem()}
          placeholder="새 항목" style={{ flex: 1, border: `1px solid ${theme.borderColor}`, borderRadius: 5, padding: '3px 6px', fontSize: 10, outline: 'none', background: c(theme, '#fff', '#0f172a'), color: theme.textColor }} />
        <button onClick={addItem} style={{ background: theme.accentColor, color: '#fff', border: 'none', borderRadius: 5, padding: '3px 6px', fontSize: 10, cursor: 'pointer' }}>+</button>
      </div>
      <div style={{ flex: 1, display: 'flex', gap: 3, overflow: 'hidden' }}>
        {Object.entries(columns).map(([colKey, col]) => (
          <div key={colKey}
            onDragOver={e => e.preventDefault()}
            onDrop={() => { if (dragItem && dragItem.col !== colKey) { moveItem(dragItem.col, dragItem.id, colKey); setDragItem(null); } }}
            style={{ flex: 1, display: 'flex', flexDirection: 'column', background: c(theme, '#f9fafb', '#0f172a'), borderRadius: 6, padding: 4, overflow: 'hidden' }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: colColors[colKey], textAlign: 'center', marginBottom: 3 }}>
              {col.label} ({col.items.length})
            </div>
            <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
              {col.items.map(item => (
                <div key={item.id} draggable
                  onDragStart={() => setDragItem({ col: colKey, id: item.id })}
                  style={{ padding: '3px 5px', borderRadius: 4, background: c(theme, '#fff', '#1e293b'), border: `0.5px solid ${theme.borderColor}`, fontSize: 9, cursor: 'grab', display: 'flex', alignItems: 'center', gap: 3 }}>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.text}</span>
                  <button onClick={() => deleteItem(colKey, item.id)} style={{ background: 'none', border: 'none', fontSize: 7, cursor: 'pointer', color: '#9ca3af', flexShrink: 0 }}>✕</button>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// #22 앱 런처 위젯
// ============================================================
export function AppLauncherWidget() {
  const { state } = useApp();
  const { theme } = state;
  const [apps, setApps] = useState(() => {
    try { return JSON.parse(localStorage.getItem('app-launcher') || '[]'); } catch { return []; }
  });

  const defaultApps = [
    { id: 'hwp', name: '한글', icon: '📝', url: '' },
    { id: 'ppt', name: 'PPT', icon: '📊', url: '' },
    { id: 'excel', name: '엑셀', icon: '📗', url: '' },
    { id: 'word', name: '워드', icon: '📘', url: '' },
    { id: 'chrome', name: 'Chrome', icon: '🌐', url: 'https://google.com' },
    { id: 'neis', name: 'NEIS', icon: '🏫', url: 'https://neis.go.kr' },
    { id: 'classroom', name: 'Classroom', icon: '🎓', url: 'https://classroom.google.com' },
    { id: 'drive', name: 'Drive', icon: '📁', url: 'https://drive.google.com' },
  ];

  const allApps = [...defaultApps, ...apps];
  const open = (app) => {
    if (app.url) {
      if (window.electronAPI?.shell) window.electronAPI.shell.openExternal(app.url);
      else window.open(app.url, '_blank');
    }
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>🚀 앱 런처</div>
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4, alignContent: 'start' }}>
        {allApps.map(app => (
          <button key={app.id} onClick={() => open(app)}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, padding: '6px 2px', borderRadius: 8, border: 'none', cursor: 'pointer', background: 'transparent', color: theme.textColor, fontSize: 9, transition: 'background 0.15s' }}
            onMouseEnter={e => e.currentTarget.style.background = c(theme, '#f3f4f6', '#334155')}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
            <span style={{ fontSize: 22 }}>{app.icon}</span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%', textAlign: 'center' }}>{app.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// #28 학급 출석 체커 위젯
// ============================================================
export function AttendanceWidget() {
  const { state } = useApp();
  const { theme } = state;
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;

  const [students, setStudents] = useState(() => {
    try { return JSON.parse(localStorage.getItem('attendance-students') || '[]'); } catch { return []; }
  });
  const [attendance, setAttendance] = useState(() => {
    try { return JSON.parse(localStorage.getItem('attendance-log') || '{}'); } catch { return {}; }
  });
  const [input, setInput] = useState('');

  const todayLog = attendance[todayStr] || {};

  const saveStudents = (updated) => { setStudents(updated); localStorage.setItem('attendance-students', JSON.stringify(updated)); };
  const saveAttendance = (updated) => { setAttendance(updated); localStorage.setItem('attendance-log', JSON.stringify(updated)); };

  const addStudents = () => {
    if (!input.trim()) return;
    const names = input.split(/[,\n]/).map(n => n.trim()).filter(Boolean);
    saveStudents([...students, ...names.map(n => ({ id: Date.now() + Math.random(), name: n }))]);
    setInput('');
  };

  const setStatus = (studentId, status) => {
    const updated = { ...attendance, [todayStr]: { ...todayLog, [studentId]: status } };
    saveAttendance(updated);
  };

  const STATUS = { present: { label: '출석', color: '#10b981', emoji: '✅' }, late: { label: '지각', color: '#f59e0b', emoji: '⏰' }, absent: { label: '결석', color: '#ef4444', emoji: '❌' } };

  const counts = { present: 0, late: 0, absent: 0 };
  students.forEach(s => { const st = todayLog[s.id] || 'present'; counts[st]++; });

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <span style={{ fontSize: 12, fontWeight: 600 }}>📋 출석 체크</span>
        <div style={{ display: 'flex', gap: 4, fontSize: 9 }}>
          {Object.entries(STATUS).map(([k, v]) => (
            <span key={k} style={{ color: v.color }}>{v.emoji}{counts[k]}</span>
          ))}
        </div>
      </div>
      {students.length === 0 ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <div style={{ fontSize: 10, color: '#9ca3af' }}>학생 이름을 입력하세요 (쉼표 구분)</div>
          <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && addStudents()}
            placeholder="김철수, 이영희, 박민수..."
            style={{ width: '100%', border: `1px solid ${theme.borderColor}`, borderRadius: 6, padding: '6px 8px', fontSize: 11, outline: 'none', background: c(theme, '#fff', '#0f172a'), color: theme.textColor }} />
          <button onClick={addStudents} style={{ background: theme.accentColor, color: '#fff', border: 'none', borderRadius: 6, padding: '4px 12px', fontSize: 11, cursor: 'pointer' }}>등록</button>
        </div>
      ) : (
        <div style={{ flex: 1, overflow: 'auto' }}>
          {students.map(s => {
            const status = todayLog[s.id] || 'present';
            return (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 0', borderBottom: `0.5px solid ${theme.borderColor}` }}>
                <span style={{ flex: 1, fontSize: 11 }}>{s.name}</span>
                {Object.entries(STATUS).map(([k, v]) => (
                  <button key={k} onClick={() => setStatus(s.id, k)}
                    style={{ padding: '2px 5px', borderRadius: 4, border: 'none', cursor: 'pointer', fontSize: 9,
                      background: status === k ? v.color : c(theme, '#f3f4f6', '#334155'),
                      color: status === k ? '#fff' : c(theme, '#6b7280', '#94a3b8') }}>
                    {v.emoji}
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ============================================================
// #30 소음 측정기 위젯
// ============================================================
export function NoiseMeterWidget() {
  const { state } = useApp();
  const { theme } = state;
  const [level, setLevel] = useState(0);
  const [active, setActive] = useState(false);
  const [peak, setPeak] = useState(0);
  const analyserRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef = useRef(null);

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const ctx = new AudioContext();
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      src.connect(analyser);
      analyserRef.current = analyser;
      setActive(true);
      setPeak(0);
      const data = new Uint8Array(analyser.frequencyBinCount);
      const loop = () => {
        analyser.getByteFrequencyData(data);
        const avg = data.reduce((a, b) => a + b, 0) / data.length;
        const normalized = Math.min(100, Math.round(avg * 1.5));
        setLevel(normalized);
        setPeak(p => Math.max(p, normalized));
        rafRef.current = requestAnimationFrame(loop);
      };
      loop();
    } catch { alert('마이크 접근 권한이 필요합니다'); }
  };

  const stop = () => {
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    setActive(false); setLevel(0);
  };

  useEffect(() => () => { stop(); }, []); // eslint-disable-line

  const getColor = (l) => l < 30 ? '#10b981' : l < 60 ? '#f59e0b' : '#ef4444';
  const getLabel = (l) => l < 30 ? '조용함 🤫' : l < 60 ? '보통 🔈' : l < 80 ? '시끄러움 🔊' : '매우 시끄러움 📢';

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
      <div style={{ fontSize: 12, fontWeight: 600 }}>🎙 소음 측정기</div>
      <div style={{ width: '80%', height: 16, background: c(theme, '#f3f4f6', '#334155'), borderRadius: 8, overflow: 'hidden', position: 'relative' }}>
        <div style={{ height: '100%', width: `${level}%`, background: getColor(level), borderRadius: 8, transition: 'width 0.1s, background 0.3s' }} />
        {peak > 0 && <div style={{ position: 'absolute', left: `${peak}%`, top: 0, bottom: 0, width: 2, background: '#ef4444' }} />}
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, color: active ? getColor(level) : c(theme, '#9ca3af', '#64748b'), fontVariantNumeric: 'tabular-nums' }}>
        {active ? level : '--'}
      </div>
      <div style={{ fontSize: 11, color: c(theme, '#6b7280', '#94a3b8') }}>{active ? getLabel(level) : '측정 시작을 누르세요'}</div>
      <button onClick={active ? stop : start} style={{
        background: active ? '#ef4444' : theme.accentColor, color: '#fff',
        border: 'none', borderRadius: 8, padding: '6px 16px', fontSize: 12, cursor: 'pointer'
      }}>{active ? '⏹ 정지' : '▶ 측정 시작'}</button>
    </div>
  );
}

// ============================================================
// #36 모둠 활동 순환 타이머 위젯
// ============================================================
export function RotationTimerWidget() {
  const { state } = useApp();
  const { theme } = state;
  const [groups, setGroups] = useState(4);
  const [duration, setDuration] = useState(5); // 분
  const [current, setCurrent] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => {
      setSeconds(s => {
        if (s <= 0) {
          setCurrent(c => {
            if (c + 1 >= groups) { setRunning(false); return 0; }
            return c + 1;
          });
          return duration * 60;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [running, groups, duration]);

  const start = () => { setCurrent(0); setSeconds(duration * 60); setRunning(true); };
  const pad = n => String(Math.floor(Math.abs(n))).padStart(2, '0');

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
      <div style={{ fontSize: 12, fontWeight: 600 }}>🔄 모둠 활동 타이머</div>
      {!running ? (
        <>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 9, color: '#9ca3af' }}>모둠 수</div>
              <input type="number" min={2} max={10} value={groups} onChange={e => setGroups(Number(e.target.value))}
                style={{ width: 40, border: `1px solid ${theme.borderColor}`, borderRadius: 5, padding: '3px', fontSize: 14, textAlign: 'center', outline: 'none', background: c(theme, '#fff', '#1e293b'), color: theme.textColor }} />
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 9, color: '#9ca3af' }}>시간(분)</div>
              <input type="number" min={1} max={30} value={duration} onChange={e => setDuration(Number(e.target.value))}
                style={{ width: 40, border: `1px solid ${theme.borderColor}`, borderRadius: 5, padding: '3px', fontSize: 14, textAlign: 'center', outline: 'none', background: c(theme, '#fff', '#1e293b'), color: theme.textColor }} />
            </div>
          </div>
          <button onClick={start} style={{ background: theme.accentColor, color: '#fff', border: 'none', borderRadius: 8, padding: '6px 20px', fontSize: 12, cursor: 'pointer' }}>▶ 시작</button>
        </>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 4 }}>
            {Array.from({ length: groups }, (_, i) => (
              <div key={i} style={{ width: 24, height: 24, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700,
                background: i === current ? theme.accentColor : i < current ? '#10b981' : c(theme, '#f3f4f6', '#334155'),
                color: i <= current ? '#fff' : theme.textColor }}>
                {i + 1}
              </div>
            ))}
          </div>
          <div style={{ fontSize: 32, fontWeight: 700, color: seconds <= 30 ? '#ef4444' : theme.textColor, fontVariantNumeric: 'tabular-nums' }}>
            {pad(seconds / 60)}:{pad(seconds % 60)}
          </div>
          <div style={{ fontSize: 11, color: theme.accentColor }}>모둠 {current + 1} / {groups}</div>
          <button onClick={() => setRunning(false)} style={{ background: '#ef4444', color: '#fff', border: 'none', borderRadius: 6, padding: '4px 12px', fontSize: 11, cursor: 'pointer' }}>⏹ 정지</button>
        </>
      )}
    </div>
  );
}

// ============================================================
// #37 팀 점수판 위젯
// ============================================================
export function ScoreboardWidget() {
  const { state } = useApp();
  const { theme } = state;
  const [teams, setTeams] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('scoreboard') || 'null');
      if (saved) return saved;
    } catch {}
    return [
      { id: 1, name: '1모둠', score: 0, color: '#ef4444' },
      { id: 2, name: '2모둠', score: 0, color: '#3b82f6' },
      { id: 3, name: '3모둠', score: 0, color: '#10b981' },
      { id: 4, name: '4모둠', score: 0, color: '#f59e0b' },
    ];
  });

  const save = (updated) => { setTeams(updated); localStorage.setItem('scoreboard', JSON.stringify(updated)); };
  const updateScore = (id, delta) => save(teams.map(t => t.id === id ? { ...t, score: Math.max(0, t.score + delta) } : t));
  const reset = () => save(teams.map(t => ({ ...t, score: 0 })));
  const maxScore = Math.max(...teams.map(t => t.score), 1);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 600 }}>🏆 팀 점수판</span>
        <button onClick={reset} style={{ background: c(theme, '#f3f4f6', '#334155'), border: 'none', borderRadius: 5, padding: '2px 6px', fontSize: 9, cursor: 'pointer', color: theme.textColor }}>초기화</button>
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
        {teams.map(t => (
          <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 40, fontSize: 10, fontWeight: 600, color: t.color }}>{t.name}</span>
            <div style={{ flex: 1, height: 20, background: c(theme, '#f3f4f6', '#334155'), borderRadius: 4, overflow: 'hidden', position: 'relative' }}>
              <div style={{ height: '100%', width: `${(t.score / maxScore) * 100}%`, background: t.color, borderRadius: 4, transition: 'width 0.3s' }} />
              <span style={{ position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)', fontSize: 10, fontWeight: 700, color: t.score > maxScore * 0.5 ? '#fff' : theme.textColor }}>{t.score}</span>
            </div>
            <button onClick={() => updateScore(t.id, -1)} style={{ width: 20, height: 20, borderRadius: 4, border: 'none', cursor: 'pointer', fontSize: 11, background: c(theme, '#fee2e2', '#4c1d1d'), color: '#ef4444' }}>-</button>
            <button onClick={() => updateScore(t.id, 1)} style={{ width: 20, height: 20, borderRadius: 4, border: 'none', cursor: 'pointer', fontSize: 11, background: c(theme, '#dcfce7', '#14532d'), color: '#10b981' }}>+</button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// #41 연속기록(Streak) 카운터 위젯
// ============================================================
export function StreakWidget() {
  const { state } = useApp();
  const { theme } = state;
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;

  const [streaks, setStreaks] = useState(() => {
    try { return JSON.parse(localStorage.getItem('streaks') || '[]'); } catch { return []; }
  });
  const [input, setInput] = useState('');

  const save = (updated) => { setStreaks(updated); localStorage.setItem('streaks', JSON.stringify(updated)); };

  const addStreak = () => {
    if (!input.trim()) return;
    save([...streaks, { id: Date.now(), name: input.trim(), log: {} }]);
    setInput('');
  };

  const toggle = (id) => {
    save(streaks.map(s => {
      if (s.id !== id) return s;
      const log = { ...s.log }; log[todayStr] = !log[todayStr];
      return { ...s, log };
    }));
  };

  const getStreak = (s) => {
    let count = 0;
    const d = new Date(today);
    while (true) {
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      if (!s.log[key]) break;
      count++; d.setDate(d.getDate() - 1);
    }
    return count;
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>🔥 연속기록</div>
      <div style={{ display: 'flex', gap: 3, marginBottom: 4 }}>
        <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && addStreak()}
          placeholder="기록 이름" style={{ flex: 1, border: `1px solid ${theme.borderColor}`, borderRadius: 5, padding: '3px 6px', fontSize: 10, outline: 'none', background: c(theme, '#fff', '#0f172a'), color: theme.textColor }} />
        <button onClick={addStreak} style={{ background: theme.accentColor, color: '#fff', border: 'none', borderRadius: 5, padding: '3px 6px', fontSize: 10, cursor: 'pointer' }}>+</button>
      </div>
      <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
        {streaks.map(s => {
          const streak = getStreak(s);
          const done = s.log[todayStr];
          return (
            <div key={s.id} onClick={() => toggle(s.id)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px', borderRadius: 8, cursor: 'pointer', background: done ? theme.accentColor + '15' : c(theme, '#f9fafb', '#1e293b') }}>
              <span style={{ fontSize: 18 }}>{done ? '🔥' : '⭕'}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, fontWeight: 600 }}>{s.name}</div>
                <div style={{ fontSize: 9, color: c(theme, '#9ca3af', '#64748b') }}>{streak > 0 ? `${streak}일 연속!` : '오늘 시작하세요'}</div>
              </div>
              {streak >= 7 && <span style={{ fontSize: 14 }}>⭐</span>}
              {streak >= 30 && <span style={{ fontSize: 14 }}>👑</span>}
            </div>
          );
        })}
      </div>
      {streaks.length === 0 && <div style={{ textAlign: 'center', color: '#9ca3af', fontSize: 11, padding: '12px 0' }}>연속기록을 추가하세요</div>}
    </div>
  );
}

// ============================================================
// #44 20-20-20 눈 휴식 알림 위젯
// ============================================================
export function EyeRestWidget() {
  const { state } = useApp();
  const { theme } = state;
  const [active, setActive] = useState(false);
  const [seconds, setSeconds] = useState(20 * 60); // 20분
  const [resting, setResting] = useState(false);
  const [restSeconds, setRestSeconds] = useState(20);
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => {
      if (resting) {
        setRestSeconds(s => {
          if (s <= 0) { setResting(false); setSeconds(20 * 60); setCount(c => c + 1); return 20; }
          return s - 1;
        });
      } else {
        setSeconds(s => {
          if (s <= 0) { setResting(true); return 0; }
          return s - 1;
        });
      }
    }, 1000);
    return () => clearInterval(t);
  }, [active, resting]);

  const pad = n => String(Math.floor(Math.abs(n))).padStart(2, '0');

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, textAlign: 'center' }}>
      <div style={{ fontSize: 12, fontWeight: 600 }}>👁 눈 휴식 (20-20-20)</div>
      {resting ? (
        <>
          <div style={{ fontSize: 36 }}>👀</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#10b981' }}>20초간 먼 곳을 보세요!</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#10b981', fontVariantNumeric: 'tabular-nums' }}>{restSeconds}</div>
        </>
      ) : (
        <>
          <div style={{ fontSize: 24 }}>{active ? '🖥️' : '👁'}</div>
          <div style={{ fontSize: 20, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: active && seconds < 60 ? '#f59e0b' : theme.textColor }}>
            {active ? `${pad(seconds / 60)}:${pad(seconds % 60)}` : '20:00'}
          </div>
          <div style={{ fontSize: 10, color: c(theme, '#9ca3af', '#64748b') }}>
            {active ? '다음 휴식까지' : '20분마다 20초간 먼 곳 보기'}
          </div>
        </>
      )}
      <button onClick={() => { setActive(!active); if (!active) { setSeconds(20 * 60); setResting(false); } }}
        style={{ background: active ? '#ef4444' : theme.accentColor, color: '#fff', border: 'none', borderRadius: 8, padding: '5px 14px', fontSize: 11, cursor: 'pointer' }}>
        {active ? '⏹ 중지' : '▶ 시작'}
      </button>
      {count > 0 && <div style={{ fontSize: 9, color: '#10b981' }}>오늘 {count}회 휴식 완료</div>}
    </div>
  );
}

// ============================================================
// #47 수분 섭취 리마인더 위젯
// ============================================================
export function WaterReminderWidget() {
  const { state } = useApp();
  const { theme } = state;
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;

  const [data, setData] = useState(() => {
    try { return JSON.parse(localStorage.getItem('water-tracker') || '{}'); } catch { return {}; }
  });
  const goal = 8;
  const cups = data[todayStr] || 0;

  const setCups = (val) => {
    const updated = { ...data, [todayStr]: Math.max(0, val) };
    setData(updated);
    localStorage.setItem('water-tracker', JSON.stringify(updated));
  };

  const pct = Math.min(100, Math.round((cups / goal) * 100));

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, textAlign: 'center' }}>
      <div style={{ fontSize: 12, fontWeight: 600 }}>💧 수분 섭취</div>
      <div style={{ fontSize: 32 }}>{cups >= goal ? '🎉' : '💧'}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: cups >= goal ? '#10b981' : theme.accentColor }}>
        {cups} / {goal}잔
      </div>
      <div style={{ width: '80%', height: 10, background: c(theme, '#f3f4f6', '#334155'), borderRadius: 5, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: cups >= goal ? '#10b981' : '#3b82f6', borderRadius: 5, transition: 'width 0.3s' }} />
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={() => setCups(cups - 1)} style={{ width: 32, height: 32, borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 16, background: c(theme, '#fee2e2', '#4c1d1d'), color: '#ef4444' }}>-</button>
        <button onClick={() => setCups(cups + 1)} style={{ width: 32, height: 32, borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 16, background: c(theme, '#dcfce7', '#14532d'), color: '#10b981' }}>+</button>
      </div>
      <div style={{ fontSize: 9, color: c(theme, '#9ca3af', '#64748b') }}>{pct}% 달성</div>
    </div>
  );
}

// ============================================================
// #48 세계 시계 (멀티) — #4와 합쳐서 DualTimezoneWidget으로 제공
// ============================================================
// → DualTimezoneWidget에 통합

// ============================================================
// #49 실시간 환율 변환기 위젯
// ============================================================
export function CurrencyWidget() {
  const { state } = useApp();
  const { theme } = state;
  const [amount, setAmount] = useState(1000);
  const [rates, setRates] = useState({ USD: 1350, JPY: 9.1, EUR: 1480, CNY: 186 });
  const [lastUpdate, setLastUpdate] = useState('샘플 데이터');

  useEffect(() => {
    // 실제 환율 API (무료)
    fetch('https://open.er-api.com/v6/latest/KRW')
      .then(r => r.json())
      .then(data => {
        if (data.rates) {
          setRates({
            USD: Math.round(1 / data.rates.USD),
            JPY: Math.round(100 / data.rates.JPY * 100) / 100,
            EUR: Math.round(1 / data.rates.EUR),
            CNY: Math.round(1 / data.rates.CNY),
          });
          setLastUpdate(new Date().toLocaleTimeString('ko', { hour: '2-digit', minute: '2-digit' }));
        }
      }).catch(() => {});
  }, []);

  const currencies = [
    { code: 'USD', label: '미국 달러', flag: '🇺🇸' },
    { code: 'JPY', label: '일본 엔(100)', flag: '🇯🇵' },
    { code: 'EUR', label: '유로', flag: '🇪🇺' },
    { code: 'CNY', label: '중국 위안', flag: '🇨🇳' },
  ];

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>💱 환율 변환</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 6 }}>
        <span style={{ fontSize: 11 }}>🇰🇷</span>
        <input type="number" value={amount} onChange={e => setAmount(Number(e.target.value))}
          style={{ flex: 1, border: `1px solid ${theme.borderColor}`, borderRadius: 6, padding: '4px 6px', fontSize: 12, outline: 'none', fontFamily: 'inherit', background: c(theme, '#fff', '#0f172a'), color: theme.textColor, textAlign: 'right' }} />
        <span style={{ fontSize: 10, color: '#9ca3af' }}>원</span>
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
        {currencies.map(cur => {
          const rate = rates[cur.code] || 0;
          const converted = cur.code === 'JPY' ? (amount / rate * 100).toFixed(0) : (amount / rate).toFixed(2);
          return (
            <div key={cur.code} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 0', borderBottom: `0.5px solid ${theme.borderColor}` }}>
              <span style={{ fontSize: 14 }}>{cur.flag}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10, color: c(theme, '#9ca3af', '#64748b') }}>{cur.label}</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: theme.textColor }}>{converted}</div>
              </div>
              <div style={{ fontSize: 9, color: c(theme, '#9ca3af', '#64748b') }}>1{cur.code === 'JPY' ? '00¥' : cur.code}={rate.toLocaleString()}원</div>
            </div>
          );
        })}
      </div>
      <div style={{ fontSize: 8, color: '#9ca3af', textAlign: 'center', marginTop: 2 }}>업데이트: {lastUpdate}</div>
    </div>
  );
}
