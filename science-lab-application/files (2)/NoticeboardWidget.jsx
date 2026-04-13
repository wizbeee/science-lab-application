// ============================================================
// NoticeboardWidget.jsx - 전광판 위젯
// Google Sheets 실시간 연동 (15초 갱신)
// ============================================================

import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../AppContext';
import { NoticeboardManager } from '../services/noticeboardService';

export default function NoticeboardWidget() {
  const { state } = useApp();
  const { theme, noticeboard } = state;

  const [notices, setNotices] = useState([]);
  const [current, setCurrent] = useState(null);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const managerRef = useRef(null);

  const typeStyle = {
    info:    { bg: '#dbeafe', color: '#1e40af', icon: 'ℹ️' },
    warning: { bg: '#fef3c7', color: '#92400e', icon: '⚠️' },
    urgent:  { bg: '#fee2e2', color: '#991b1b', icon: '🚨' },
    default: { bg: '#f3f4f6', color: '#374151', icon: '📢' }
  };

  useEffect(() => {
    if (!noticeboard.enabled || !noticeboard.googleSheetUrl) {
      setNotices([]);
      setCurrent(null);
      return;
    }

    const manager = new NoticeboardManager(
      noticeboard.googleSheetUrl,
      noticeboard.refreshInterval || 15,
      (data) => {
        setNotices(data);
        setLastUpdated(new Date());
        setError(null);
        if (data.length > 0) setCurrent(data[0]);
      },
      (err) => setError(err)
    );

    managerRef.current = manager;
    manager.start();

    // 5초마다 다음 공지로 슬라이드
    manager.startRotation((notice, idx) => {
      setCurrent(notice);
      setCurrentIdx(idx);
    }, 5);

    return () => manager.stop();
  }, [noticeboard.enabled, noticeboard.googleSheetUrl, noticeboard.refreshInterval]);

  if (!noticeboard.enabled) return null;

  if (!noticeboard.googleSheetUrl) {
    return (
      <div style={{ background: '#f9fafb', borderRadius: 12, padding: '10px 14px', border: `1px dashed ${theme.borderColor}`, marginBottom: 8 }}>
        <div style={{ fontSize: 12, color: '#9ca3af', textAlign: 'center' }}>
          📡 설정 → 전광판에서 Google Sheets URL을 등록하세요
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ background: '#fee2e2', borderRadius: 12, padding: '10px 14px', marginBottom: 8 }}>
        <div style={{ fontSize: 12, color: '#991b1b' }}>⚠️ 전광판 오류: {error}</div>
      </div>
    );
  }

  if (!current) {
    return (
      <div style={{ background: '#f3f4f6', borderRadius: 12, padding: '10px 14px', marginBottom: 8 }}>
        <div style={{ fontSize: 12, color: '#9ca3af', textAlign: 'center' }}>📡 공지 없음</div>
      </div>
    );
  }

  const style = typeStyle[current.type] || typeStyle.default;

  return (
    <div style={{
      background: style.bg,
      borderRadius: 12,
      padding: '10px 16px',
      marginBottom: 8,
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      border: `1px solid ${style.color}30`,
      transition: 'all 0.3s'
    }}>
      <span style={{ fontSize: 18, flexShrink: 0 }}>{style.icon}</span>
      <div style={{ flex: 1, overflow: 'hidden' }}>
        {current.title && (
          <div style={{ fontSize: 13, fontWeight: 700, color: style.color }}>{current.title}</div>
        )}
        <div style={{ fontSize: 12, color: style.color, opacity: 0.85, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {current.text}
        </div>
      </div>
      {notices.length > 1 && (
        <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
          {notices.slice(0, 5).map((_, i) => (
            <div key={i} style={{
              width: 6, height: 6, borderRadius: '50%',
              background: i === currentIdx ? style.color : style.color + '40'
            }} />
          ))}
        </div>
      )}
    </div>
  );
}
