// ============================================================
// CurrentPeriodWidget.jsx - 지금 이 시간 + 타이머 위젯
// ============================================================

import React, { useState, useEffect } from 'react';
import { useApp } from '../AppContext';

function timeToMinutes(t) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function pad(n) { return String(Math.floor(n)).padStart(2, '0'); }

export default function CurrentPeriodWidget() {
  const { state } = useApp();
  const { schedule } = state;
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const mins = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;

  // 현재 교시 찾기
  const current = schedule.periods.find(p =>
    timeToMinutes(p.start) <= mins && mins < timeToMinutes(p.end)
  );

  // 다음 교시 찾기
  const next = schedule.periods.find(p => timeToMinutes(p.start) > mins);

  // 타이머: 현재 교시 종료까지 남은 시간 (초)
  let remainSec = 0;
  let totalSec = 0;
  let progressPct = 0;

  if (current) {
    const endMins = timeToMinutes(current.end);
    remainSec = Math.max(0, (endMins - mins) * 60);
    totalSec = (timeToMinutes(current.end) - timeToMinutes(current.start)) * 60;
    progressPct = Math.min(100, ((totalSec - remainSec) / totalSec) * 100);
  }

  const typeConfig = {
    class:  { emoji: '📚', label: '수업 중', bg: '#d1fae5', bar: '#10b981', text: '#065f46' },
    break:  { emoji: '☕', label: '쉬는 시간', bg: '#fef3c7', bar: '#f59e0b', text: '#92400e' },
    lunch:  { emoji: '🍽️', label: '점심시간', bg: '#fce7f3', bar: '#ec4899', text: '#9d174d' },
    event:  { emoji: '📢', label: '종례', bg: '#ede9fe', bar: '#8b5cf6', text: '#5b21b6' },
    extra:  { emoji: '🌅', label: '방과후', bg: '#e0f2fe', bar: '#0284c7', text: '#075985' },
    dinner: { emoji: '🌙', label: '석식', bg: '#fdf4ff', bar: '#c026d3', text: '#86198f' }
  };

  const cfg = current ? (typeConfig[current.type] || typeConfig.class) : null;

  // 출근 전 / 퇴근 후
  const workStart = timeToMinutes(schedule.workStart);
  const workEnd   = timeToMinutes(schedule.workEnd);
  const isBeforeWork = mins < workStart;
  const isAfterWork  = mins >= workEnd;

  return (
    <div style={{
      background: cfg ? cfg.bg : (isAfterWork ? '#f9fafb' : '#eff6ff'),
      borderRadius: 14,
      padding: '14px 18px',
      border: `1.5px solid ${cfg ? cfg.bar + '40' : '#e5e7eb'}`,
      transition: 'all 0.3s'
    }}>

      {current ? (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <span style={{ fontSize: 26 }}>{cfg.emoji}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, color: cfg.text, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                지금 이 시간
              </div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#1f2937' }}>
                {current.name}
              </div>
              <div style={{ fontSize: 12, color: '#6b7280' }}>
                {current.start} ~ {current.end}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 11, color: cfg.text }}>남은 시간</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: cfg.bar, fontVariantNumeric: 'tabular-nums' }}>
                {pad(remainSec / 60)}:{pad(remainSec % 60)}
              </div>
            </div>
          </div>

          {/* 진행 바 */}
          <div style={{ height: 6, background: cfg.bar + '25', borderRadius: 4, overflow: 'hidden', marginBottom: 8 }}>
            <div style={{
              height: '100%', borderRadius: 4,
              background: cfg.bar,
              width: `${progressPct}%`,
              transition: 'width 1s linear'
            }} />
          </div>

          {/* 다음 교시 */}
          {next && (
            <div style={{ fontSize: 12, color: '#6b7280' }}>
              다음 → <strong style={{ color: '#374151' }}>{next.name}</strong> ({next.start})
            </div>
          )}
        </>
      ) : isBeforeWork ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 26 }}>🌅</span>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#1f2937' }}>출근 전</div>
            <div style={{ fontSize: 12, color: '#6b7280' }}>출근 시각: {schedule.workStart}</div>
          </div>
        </div>
      ) : isAfterWork ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 26 }}>🏠</span>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#1f2937' }}>퇴근 시간</div>
            <div style={{ fontSize: 12, color: '#6b7280' }}>수고하셨습니다!</div>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 26 }}>⏰</span>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#1f2937' }}>일과 외 시간</div>
          </div>
        </div>
      )}
    </div>
  );
}
