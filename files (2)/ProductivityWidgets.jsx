// ============================================================
// ProductivityWidgets.jsx - 포커스 모드 & 클립보드 히스토리
// ============================================================

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useApp } from '../AppContext';

// ── 포커스 모드 위젯 ─────────────────────────────────────────
export function FocusWidget() {
  const { state } = useApp();
  const { theme, focus: focusCfg } = state;

  const durationMin = focusCfg.duration || 25;
  const breakMin = focusCfg.breakTime || 5;

  const [phase, setPhase] = useState('idle');
  const [remaining, setRemaining] = useState(durationMin * 60);
  const [session, setSession] = useState(0);
  const intervalRef = useRef(null);

  const totalSec = phase === 'break' ? breakMin * 60 : durationMin * 60;
  const progressPct = phase === 'idle' ? 0 : Math.max(0, ((totalSec - remaining) / totalSec) * 100);
  const pad = n => String(Math.floor(n)).padStart(2, '0');
  const timeStr = `${pad(remaining / 60)}:${pad(remaining % 60)}`;

  const startFocus = () => {
    setPhase('focus');
    setRemaining(durationMin * 60);
    window.electronAPI?.focus?.start();
  };

  const pauseFocus = () => {
    clearInterval(intervalRef.current);
    setPhase('paused');
  };

  const resumeFocus = () => setPhase('focus');

  const resetFocus = () => {
    clearInterval(intervalRef.current);
    setPhase('idle');
    setRemaining(durationMin * 60);
    window.electronAPI?.focus?.stop();
  };

  useEffect(() => {
    if (phase === 'focus' || phase === 'break') {
      intervalRef.current = setInterval(() => {
        setRemaining(r => {
          if (r <= 1) {
            clearInterval(intervalRef.current);
            if (phase === 'focus') {
              setSession(s => s + 1);
              setPhase('break');
              setRemaining(breakMin * 60);
              window.electronAPI?.notification?.show({
                type: 'info', title: '🎉 집중 완료!',
                message: `${durationMin}분 집중 완료! ${breakMin}분 쉬어가세요.`, duration: 8000
              });
            } else {
              setPhase('idle');
              setRemaining(durationMin * 60);
              window.electronAPI?.notification?.show({
                type: 'class', title: '☕ 휴식 완료!',
                message: '다시 집중을 시작해 보세요!', duration: 5000
              });
              window.electronAPI?.focus?.stop();
            }
            return 0;
          }
          return r - 1;
        });
      }, 1000);
    }
    return () => clearInterval(intervalRef.current);
  }, [phase, durationMin, breakMin]);

  const phaseConfig = {
    idle:   { color: '#6b7280', bg: '#f9fafb', label: '집중 모드' },
    focus:  { color: '#ef4444', bg: '#fee2e2', label: '집중 중 🔴' },
    paused: { color: '#f59e0b', bg: '#fef3c7', label: '일시 정지 ⏸' },
    break:  { color: '#10b981', bg: '#d1fae5', label: '휴식 중 ☕' }
  };
  const cfg = phaseConfig[phase];

  return (
    <div style={{ background: '#fff', borderRadius: 16, padding: '14px 18px', border: `1px solid ${theme.borderColor}` }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 10 }}>
        ⏱️ 포커스 모드
        {session > 0 && <span style={{ marginLeft: 8, fontSize: 11, color: theme.accentColor }}>🍅 {session}회</span>}
      </div>

      {/* 원형 타이머 */}
      <div style={{ textAlign: 'center', marginBottom: 12 }}>
        <div style={{ position: 'relative', display: 'inline-block' }}>
          <svg width="100" height="100" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="42" fill={cfg.bg} stroke="#e5e7eb" strokeWidth="6" />
            <circle cx="50" cy="50" r="42" fill="none" stroke={cfg.color}
              strokeWidth="6" strokeLinecap="round"
              strokeDasharray={`${progressPct * 2.638} 263.8`}
              transform="rotate(-90 50 50)"
              style={{ transition: 'stroke-dasharray 1s linear' }}
            />
          </svg>
          <div style={{
            position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center'
          }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: cfg.color, fontVariantNumeric: 'tabular-nums' }}>{timeStr}</div>
            <div style={{ fontSize: 10, color: '#9ca3af' }}>{cfg.label}</div>
          </div>
        </div>
      </div>

      {/* 버튼 */}
      <div style={{ display: 'flex', gap: 6 }}>
        {phase === 'idle' && (
          <button onClick={startFocus} style={{
            flex: 1, background: '#ef4444', color: '#fff',
            border: 'none', borderRadius: 8, padding: '9px', fontSize: 13, fontWeight: 600, cursor: 'pointer'
          }}>▶ 시작 ({durationMin}분)</button>
        )}
        {phase === 'focus' && (
          <>
            <button onClick={pauseFocus} style={{ flex: 1, background: '#fef3c7', color: '#92400e', border: 'none', borderRadius: 8, padding: '9px', fontSize: 13, cursor: 'pointer' }}>⏸ 일시정지</button>
            <button onClick={resetFocus} style={{ background: '#f3f4f6', color: '#6b7280', border: 'none', borderRadius: 8, padding: '9px 12px', fontSize: 13, cursor: 'pointer' }}>↺</button>
          </>
        )}
        {phase === 'paused' && (
          <>
            <button onClick={resumeFocus} style={{ flex: 1, background: '#ef4444', color: '#fff', border: 'none', borderRadius: 8, padding: '9px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>▶ 재개</button>
            <button onClick={resetFocus} style={{ background: '#f3f4f6', color: '#6b7280', border: 'none', borderRadius: 8, padding: '9px 12px', fontSize: 13, cursor: 'pointer' }}>↺</button>
          </>
        )}
        {phase === 'break' && (
          <button onClick={resetFocus} style={{ flex: 1, background: '#d1fae5', color: '#065f46', border: 'none', borderRadius: 8, padding: '9px', fontSize: 13, cursor: 'pointer' }}>⏹ 종료</button>
        )}
      </div>
    </div>
  );
}

// ── 클립보드 히스토리 패널 ────────────────────────────────────
export function ClipboardPanel({ onClose }) {
  const { state } = useApp();
  const { theme } = state;

  const [history, setHistory] = useState([]);
  const [search, setSearch] = useState('');
  const [copied, setCopied] = useState(null);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('clipboard-history') || '[]');
      setHistory(saved);
    } catch {}
  }, []);

  // 실시간 클립보드 감시
  useEffect(() => {
    let lastText = '';
    const poll = async () => {
      try {
        let text = '';
        if (window.electronAPI?.clipboard) {
          text = await window.electronAPI.clipboard.read();
        }
        if (text && text !== lastText && text.trim().length > 0) {
          lastText = text;
          setHistory(prev => {
            const filtered = prev.filter(h => h.text !== text);
            const next = [{ id: Date.now(), text, createdAt: new Date().toISOString() }, ...filtered].slice(0, 50);
            localStorage.setItem('clipboard-history', JSON.stringify(next));
            return next;
          });
        }
      } catch {}
    };
    const t = setInterval(poll, 1500);
    return () => clearInterval(t);
  }, []);

  const copyItem = async (text, id) => {
    try {
      if (window.electronAPI?.clipboard) await window.electronAPI.clipboard.write(text);
      else await navigator.clipboard.writeText(text);
      setCopied(id);
      setTimeout(() => setCopied(null), 1500);
    } catch {}
  };

  const removeItem = (id) => {
    setHistory(prev => {
      const next = prev.filter(h => h.id !== id);
      localStorage.setItem('clipboard-history', JSON.stringify(next));
      return next;
    });
  };

  const clearAll = () => {
    setHistory([]);
    localStorage.removeItem('clipboard-history');
  };

  const filtered = history.filter(h => h.text.toLowerCase().includes(search.toLowerCase()));

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 8000, fontFamily: "'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif"
    }} onClick={onClose}>
      <div style={{
        background: '#fff', borderRadius: 18, width: 480, maxHeight: '80vh',
        display: 'flex', flexDirection: 'column',
        boxShadow: '0 20px 50px rgba(0,0,0,0.18)'
      }} onClick={e => e.stopPropagation()}>

        <div style={{ padding: '18px 20px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#1f2937' }}>📋 클립보드 히스토리</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {history.length > 0 && (
              <button onClick={clearAll} style={{ background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: 7, padding: '5px 10px', fontSize: 12, cursor: 'pointer' }}>전체 삭제</button>
            )}
            <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: '#9ca3af' }}>✕</button>
          </div>
        </div>

        <div style={{ padding: '12px 20px' }}>
          <input placeholder="검색..." value={search} onChange={e => setSearch(e.target.value)}
            style={{ width: '100%', border: '1.5px solid #e5e7eb', borderRadius: 9, padding: '9px 13px', fontSize: 13, outline: 'none', fontFamily: 'inherit' }}
          />
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: '0 20px 20px' }}>
          {filtered.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#d1d5db', fontSize: 13, padding: '30px 0' }}>
              {history.length === 0 ? '복사한 내용이 여기 쌓입니다' : '검색 결과 없음'}
            </div>
          ) : filtered.map(h => (
            <div key={h.id} style={{
              background: '#f9fafb', borderRadius: 10, padding: '10px 14px', marginBottom: 6,
              display: 'flex', gap: 10, alignItems: 'flex-start',
              border: `1px solid ${copied === h.id ? theme.accentColor : '#e5e7eb'}`,
              transition: 'border-color 0.2s'
            }}>
              <div style={{ flex: 1, fontSize: 13, color: '#374151', lineHeight: 1.5,
                maxHeight: 60, overflow: 'hidden', textOverflow: 'ellipsis',
                display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical'
              }}>
                {h.text}
              </div>
              <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                <button onClick={() => copyItem(h.text, h.id)} style={{
                  background: copied === h.id ? '#d1fae5' : '#fff',
                  color: copied === h.id ? '#065f46' : '#6b7280',
                  border: '1px solid #e5e7eb', borderRadius: 6, padding: '4px 9px', fontSize: 12, cursor: 'pointer'
                }}>{copied === h.id ? '✓' : '복사'}</button>
                <button onClick={() => removeItem(h.id)} style={{
                  background: '#fff', color: '#d1d5db',
                  border: '1px solid #e5e7eb', borderRadius: 6, padding: '4px 7px', fontSize: 12, cursor: 'pointer'
                }}>✕</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
