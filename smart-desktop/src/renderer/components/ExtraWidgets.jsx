// ============================================================
// ExtraWidgets.jsx - 추가 위젯 모음
// 수업 타이머, 채점 계산기, 수업 자료 링크, 알림 센터
// ============================================================

import React, { useState, useEffect } from 'react';
import { useApp } from '../AppContext';

const c = (theme, light, dark) => theme.darkMode ? dark : light;

// ── 수업 타이머 (활동별 시간 배분) ──────────────────────────
export function LessonTimerWidget({ theme }) {
  const [activities, setActivities] = useState([
    { name: '도입', min: 5 },
    { name: '전개', min: 30 },
    { name: '정리', min: 10 },
  ]);
  const [running, setRunning] = useState(false);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(0);

  useEffect(() => {
    if (!running) return;
    if (secondsLeft <= 0) {
      if (currentIdx < activities.length - 1) {
        setCurrentIdx(i => i + 1);
        setSecondsLeft(activities[currentIdx + 1].min * 60);
      } else {
        setRunning(false);
      }
      return;
    }
    const t = setInterval(() => setSecondsLeft(s => s - 1), 1000);
    return () => clearInterval(t);
  }, [running, secondsLeft, currentIdx, activities]);

  const start = () => {
    setCurrentIdx(0);
    setSecondsLeft(activities[0].min * 60);
    setRunning(true);
  };

  const pad = n => String(Math.floor(Math.abs(n))).padStart(2, '0');
  const current = activities[currentIdx];
  const totalMin = activities.reduce((s, a) => s + a.min, 0);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>🎯 수업 타이머</div>

      {!running ? (
        <>
          <div style={{ flex: 1, overflow: 'auto' }}>
            {activities.map((a, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 3 }}>
                <input value={a.name} onChange={e => { const arr = [...activities]; arr[i].name = e.target.value; setActivities(arr); }}
                  style={{ flex: 1, border: `1px solid ${theme.borderColor}`, borderRadius: 4, padding: '3px 5px', fontSize: 10, outline: 'none', background: c(theme, '#fff', '#1e293b'), color: theme.textColor }} />
                <input type="number" min={1} value={a.min} onChange={e => { const arr = [...activities]; arr[i].min = Number(e.target.value); setActivities(arr); }}
                  style={{ width: 35, border: `1px solid ${theme.borderColor}`, borderRadius: 4, padding: '3px', fontSize: 10, textAlign: 'center', outline: 'none', background: c(theme, '#fff', '#1e293b'), color: theme.textColor }} />
                <span style={{ fontSize: 9, color: '#9ca3af' }}>분</span>
                <button onClick={() => setActivities(activities.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', color: '#d1d5db', cursor: 'pointer', fontSize: 10 }}>✕</button>
              </div>
            ))}
            <button onClick={() => setActivities([...activities, { name: '활동', min: 5 }])}
              style={{ width: '100%', background: c(theme, '#f3f4f6', '#334155'), border: 'none', borderRadius: 4, padding: '3px', fontSize: 10, cursor: 'pointer', color: theme.textColor }}>+ 활동 추가</button>
          </div>
          <div style={{ fontSize: 9, color: '#9ca3af', textAlign: 'center', margin: '4px 0' }}>총 {totalMin}분</div>
          <button onClick={start} style={{ background: '#10b981', color: '#fff', border: 'none', borderRadius: 6, padding: '6px', fontSize: 11, cursor: 'pointer', flexShrink: 0 }}>▶ 시작</button>
        </>
      ) : (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ fontSize: 11, color: theme.accentColor, fontWeight: 600, marginBottom: 2 }}>{current?.name}</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: secondsLeft <= 60 ? '#dc2626' : theme.textColor, fontVariantNumeric: 'tabular-nums' }}>
            {pad(secondsLeft / 60)}:{pad(secondsLeft % 60)}
          </div>
          <div style={{ fontSize: 9, color: '#9ca3af', marginTop: 4 }}>{currentIdx + 1} / {activities.length}</div>
          <button onClick={() => setRunning(false)} style={{ marginTop: 8, background: '#ef4444', color: '#fff', border: 'none', borderRadius: 6, padding: '4px 14px', fontSize: 10, cursor: 'pointer' }}>⏹ 중지</button>
        </div>
      )}
    </div>
  );
}

// ── 채점 계산기 ─────────────────────────────────────────────
export function GradingWidget({ theme }) {
  const [items, setItems] = useState([{ score: 0, total: 100 }]);
  const [showResult, setShowResult] = useState(false);

  const addItem = () => setItems([...items, { score: 0, total: 100 }]);
  const totalScore = items.reduce((s, i) => s + Number(i.score), 0);
  const totalMax = items.reduce((s, i) => s + Number(i.total), 0);
  const pct = totalMax > 0 ? Math.round((totalScore / totalMax) * 100) : 0;

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>📊 채점 계산기</div>
      <div style={{ flex: 1, overflow: 'auto' }}>
        {items.map((item, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 3, marginBottom: 3 }}>
            <span style={{ fontSize: 9, color: '#9ca3af', width: 15 }}>{i+1}.</span>
            <input type="number" value={item.score} onChange={e => { const arr = [...items]; arr[i].score = e.target.value; setItems(arr); }}
              style={{ width: 40, border: `1px solid ${theme.borderColor}`, borderRadius: 4, padding: '3px', fontSize: 11, textAlign: 'center', outline: 'none', background: c(theme, '#fff', '#1e293b'), color: theme.textColor }} />
            <span style={{ fontSize: 10, color: '#9ca3af' }}>/</span>
            <input type="number" value={item.total} onChange={e => { const arr = [...items]; arr[i].total = e.target.value; setItems(arr); }}
              style={{ width: 40, border: `1px solid ${theme.borderColor}`, borderRadius: 4, padding: '3px', fontSize: 11, textAlign: 'center', outline: 'none', background: c(theme, '#fff', '#1e293b'), color: theme.textColor }} />
            <button onClick={() => setItems(items.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', color: '#d1d5db', cursor: 'pointer', fontSize: 10 }}>✕</button>
          </div>
        ))}
        <button onClick={addItem} style={{ width: '100%', background: c(theme, '#f3f4f6', '#334155'), border: 'none', borderRadius: 4, padding: '3px', fontSize: 10, cursor: 'pointer', color: theme.textColor }}>+ 문항 추가</button>
      </div>
      <div style={{ borderTop: `1px solid ${theme.borderColor}`, paddingTop: 6, marginTop: 4, textAlign: 'center', flexShrink: 0 }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: pct >= 90 ? '#10b981' : pct >= 60 ? theme.accentColor : '#dc2626' }}>{totalScore} / {totalMax}</div>
        <div style={{ fontSize: 11, color: '#9ca3af' }}>{pct}점</div>
      </div>
    </div>
  );
}

// ── 수업 자료 링크 ──────────────────────────────────────────
export function TeachingLinksWidget({ theme }) {
  const [links, setLinks] = useState(() => {
    try { return JSON.parse(localStorage.getItem('teaching-links') || '[]'); } catch { return []; }
  });
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: '', url: '', subject: '' });

  const save = (arr) => { setLinks(arr); localStorage.setItem('teaching-links', JSON.stringify(arr)); };

  const addLink = () => {
    if (!form.name || !form.url) return;
    save([...links, { id: Date.now(), ...form }]);
    setForm({ name: '', url: '', subject: '' });
    setAdding(false);
  };

  const open = (url) => {
    if (window.electronAPI) window.electronAPI.shell.openExternal(url);
    else window.open(url, '_blank');
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <span style={{ fontSize: 12, fontWeight: 600 }}>📎 수업 자료</span>
        <button onClick={() => setAdding(!adding)} style={{ background: theme.accentColor, color: '#fff', border: 'none', borderRadius: 5, padding: '2px 8px', fontSize: 10, cursor: 'pointer' }}>{adding ? '취소' : '+'}</button>
      </div>
      {adding && (
        <div style={{ background: c(theme, '#f9fafb', '#0f172a'), borderRadius: 6, padding: 6, marginBottom: 4 }}>
          <input placeholder="자료명" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
            style={{ width: '100%', border: `1px solid ${theme.borderColor}`, borderRadius: 4, padding: '3px 5px', fontSize: 10, marginBottom: 3, outline: 'none', background: c(theme, '#fff', '#1e293b'), color: theme.textColor }} />
          <input placeholder="https://..." value={form.url} onChange={e => setForm({ ...form, url: e.target.value })}
            style={{ width: '100%', border: `1px solid ${theme.borderColor}`, borderRadius: 4, padding: '3px 5px', fontSize: 10, marginBottom: 3, outline: 'none', background: c(theme, '#fff', '#1e293b'), color: theme.textColor }} />
          <button onClick={addLink} style={{ width: '100%', background: theme.accentColor, color: '#fff', border: 'none', borderRadius: 4, padding: '4px', fontSize: 10, cursor: 'pointer' }}>추가</button>
        </div>
      )}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {links.length === 0 && <div style={{ fontSize: 10, color: '#9ca3af', textAlign: 'center', padding: '8px 0' }}>수업 자료 링크를 추가하세요</div>}
        {links.map(l => (
          <div key={l.id} onClick={() => open(l.url)}
            style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 0', cursor: 'pointer', borderBottom: `0.5px solid ${theme.borderColor}` }}
            onMouseEnter={e => e.currentTarget.style.background = c(theme, '#f3f4f6', '#334155')}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            <span style={{ fontSize: 12 }}>🔗</span>
            <span style={{ flex: 1, fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.name}</span>
            <button onClick={(e) => { e.stopPropagation(); save(links.filter(x => x.id !== l.id)); }}
              style={{ background: 'none', border: 'none', color: '#d1d5db', cursor: 'pointer', fontSize: 9 }}>✕</button>
          </div>
        ))}
      </div>
    </div>
  );
}
