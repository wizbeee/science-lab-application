// ============================================================
// NoticeboardWidget.jsx - 전광판 위젯
// Google Sheets 실시간 연동 (15초 갱신)
// ============================================================

import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../AppContext';
import { NoticeboardManager } from '../services/noticeboardService';

// ── useNotices 훅 ──────────────────────────────────────────────
export function useNotices(url, intervalSec = 15) {
  const [notices, setNotices] = useState([]);
  const mgrRef = useRef(null);
  useEffect(() => {
    if (!url) { setNotices([]); mgrRef.current = null; return; }
    const mgr = new NoticeboardManager(url, intervalSec, setNotices, () => {});
    mgrRef.current = mgr;
    mgr.start();
    return () => { mgr.stop(); mgrRef.current = null; };
  }, [url, intervalSec]);
  // 즉시 새로고침 함수
  const refresh = () => mgrRef.current?.fetch();
  return { notices, refresh };
}

// ── 마퀴 애니메이션 CSS (전역 1회 주입) ─────────────────────
const MARQUEE_STYLE_ID = 'noticeboard-marquee-style';
if (typeof document !== 'undefined' && !document.getElementById(MARQUEE_STYLE_ID)) {
  const s = document.createElement('style');
  s.id = MARQUEE_STYLE_ID;
  s.textContent = `
    @keyframes nb-scroll {
      0%   { transform: translateX(100%); }
      100% { transform: translateX(-100%); }
    }
    .nb-marquee-text {
      display: inline-block;
      white-space: nowrap;
      animation: nb-scroll linear infinite;
    }
    .nb-marquee-text.paused {
      animation-play-state: paused;
    }
  `;
  document.head.appendChild(s);
}

// ── NoticeboardBar — 플로팅 전광판 (어디든 드래그 + 📌 위치 고정) ─
export function NoticeboardBar({ noticeboard, theme, onClose }) {
  const { notices, refresh } = useNotices(noticeboard?.googleSheetUrl, noticeboard?.refreshInterval);
  const [positionPinned, setPositionPinned] = useState(false); // 📌 = 위치 고정 (복귀 안 함)
  const [refreshing, setRefreshing] = useState(false);

  // 드래그 상태
  const [drag, setDrag] = useState(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [returning, setReturning] = useState(false);
  const dragStartPos = useRef(null); // 클릭 vs 드래그 구분용
  const barRef = useRef(null);

  const handleRefresh = async () => {
    setRefreshing(true);
    try { await refresh?.(); } catch {}
    setTimeout(() => setRefreshing(false), 1000);
  };

  // 어디서든 드래그 시작 (클릭/드래그 구분은 mouseup에서)
  const onDragStart = (e) => {
    e.preventDefault();
    setReturning(false);
    dragStartPos.current = { x: e.clientX, y: e.clientY };
    setDrag({
      startX: e.clientX - offset.x,
      startY: e.clientY - offset.y
    });
  };

  // 드래그 중 + mouseup 시 클릭/드래그 판별
  useEffect(() => {
    if (!drag) return;
    let moved = false;
    const onMove = (e) => {
      const dx = e.clientX - dragStartPos.current.x;
      const dy = e.clientY - dragStartPos.current.y;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) moved = true;
      setOffset({
        x: e.clientX - drag.startX,
        y: e.clientY - drag.startY
      });
    };
    const onUp = (e) => {
      setDrag(null);
      if (!moved) {
        // 드래그 안 하고 클릭만 한 경우 → 버튼 클릭 처리
        const target = e.target;
        if (target.closest('[data-action="close"]')) { onClose(); return; }
        if (target.closest('[data-action="pin"]')) { setPositionPinned(p => !p); return; }
        if (target.closest('[data-action="refresh"]')) { handleRefresh(); return; }
        return;
      }
      // 드래그 완료
      if (positionPinned) {
        // 📌 고정 모드: 현재 위치 유지
        return;
      }
      // 비고정: 스프링 복귀
      setReturning(true);
      setOffset({ x: 0, y: 0 });
      setTimeout(() => setReturning(false), 500);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [drag, positionPinned]); // eslint-disable-line react-hooks/exhaustive-deps

  const fullText = notices.map(n => n.text).join('　　　◆　　　');
  const duration = Math.max(12, (fullText.length * 9 + 800) / 80);

  if (!notices.length) return null;

  const accent = theme.accentColor || '#f43f5e';
  const bg     = theme.widgetBg   || '#ffffff';
  const border = theme.borderColor || '#fecdd3';
  const text   = theme.textColor  || '#1f2937';

  return (
    <div
      ref={barRef}
      onMouseDown={onDragStart}
      style={{
        position: 'fixed',
        top: 6,
        left: '50%',
        transform: `translate(calc(-50% + ${offset.x}px), ${offset.y}px)`,
        width: 'calc(100vw - 120px)',
        maxWidth: 1100,
        height: 51,
        zIndex: 9500,
        borderRadius: 26,
        background: bg,
        border: `1.5px solid ${positionPinned ? accent : border}`,
        boxShadow: drag
          ? `0 8px 28px ${accent}40`
          : `0 2px 12px ${accent}30`,
        display: 'flex',
        alignItems: 'center',
        WebkitAppRegion: 'no-drag',
        cursor: drag ? 'grabbing' : 'grab',
        transition: returning
          ? 'transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.3s ease, border-color 0.3s'
          : (drag ? 'none' : 'box-shadow 0.3s ease, border-color 0.3s'),
        userSelect: 'none',
      }}>

      {/* 공지 배지 */}
      <div style={{
        background: accent,
        color: '#fff',
        padding: '0 16px',
        height: '100%',
        display: 'flex', alignItems: 'center',
        fontSize: 13, fontWeight: 700,
        flexShrink: 0,
        borderRadius: '24px 0 0 24px',
        letterSpacing: 1,
        pointerEvents: 'none'
      }}>
        📢 공지
      </div>

      {/* 구분선 */}
      <div style={{ width: 1, height: 26, background: border, flexShrink: 0, pointerEvents: 'none' }} />

      {/* 스크롤 텍스트 영역 — 글자는 항상 흐름 */}
      <div style={{
        flex: 1,
        overflow: 'hidden',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        position: 'relative',
        pointerEvents: 'none'
      }}>
        <span
          className="nb-marquee-text"
          style={{
            fontSize: 14,
            fontWeight: 500,
            color: text,
            letterSpacing: '0.04em',
            animationDuration: `${duration}s`,
            paddingLeft: 16
          }}
        >
          {fullText}
        </span>
      </div>

      {/* 우측 버튼 그룹 — data-action으로 클릭 판별 */}
      <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0, height: '100%' }}>
        {/* 새로고침 */}
        <div data-action="refresh" title="즉시 새로고침"
          style={{
            padding: '0 8px', height: '100%',
            display: 'flex', alignItems: 'center',
            fontSize: 16, color: text + '80',
            transition: 'transform 0.5s ease',
            transform: refreshing ? 'rotate(360deg)' : 'rotate(0deg)'
          }}>↻</div>

        {/* 위치 고정 */}
        <div data-action="pin" title={positionPinned ? '위치 고정 해제 (놓으면 원래 위치로)' : '위치 고정 (이동한 곳에 유지)'}
          style={{
            padding: '0 10px', height: '100%',
            display: 'flex', alignItems: 'center',
            fontSize: 15,
            color: positionPinned ? accent : text + '80',
            background: positionPinned ? accent + '20' : 'transparent',
            transition: 'all 0.15s'
          }}>📌</div>

        {/* 닫기 */}
        <div data-action="close" title="전광판 닫기"
          style={{
            padding: '0 14px 0 6px', height: '100%',
            display: 'flex', alignItems: 'center',
            fontSize: 14, color: text + '60',
            borderRadius: '0 24px 24px 0',
            transition: 'color 0.15s'
          }}>✕</div>
      </div>
    </div>
  );
}

// ── Noticeboard2Widget — 카드형 전광판 위젯 ──────────────────
export function Noticeboard2Widget() {
  const { state } = useApp();
  const { theme, noticeboard } = state;
  const { notices } = useNotices(noticeboard?.googleSheetUrl, noticeboard?.refreshInterval);
  const cd = (l, d) => theme.darkMode ? d : l;

  if (!noticeboard?.googleSheetUrl) {
    return (
      <div style={{ padding: '12px', fontSize: 12, color: cd('#9ca3af', '#64748b'), textAlign: 'center' }}>
        📡 설정 → 전광판에서 Google Sheets URL을 등록하세요
      </div>
    );
  }
  if (!notices.length) {
    return <div style={{ padding: '12px', fontSize: 12, color: cd('#9ca3af', '#64748b'), textAlign: 'center' }}>📡 공지 없음</div>;
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, overflow: 'auto', height: '100%' }}>
      {notices.map((n, i) => (
        <div key={i} style={{
          background: cd('#f3f4f6','#1e293b'),
          borderRadius: 8, padding: '8px 12px',
          fontSize: 12, color: cd('#374151','#cbd5e1'), lineHeight: 1.5,
          borderLeft: `3px solid #c0392b`
        }}>
          {n.orderRaw && !isNaN(parseInt(n.orderRaw)) && (
            <span style={{ fontSize: 10, color: cd('#9ca3af','#64748b'), marginRight: 6 }}>{parseInt(n.orderRaw)}.</span>
          )}
          {n.text}
        </div>
      ))}
    </div>
  );
}

export default function NoticeboardWidget() {
  const { state } = useApp();
  const { theme, noticeboard } = state;

  const [notices, setNotices] = useState([]);
  const [current, setCurrent] = useState(null);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [error, setError] = useState(null);
  const [, setLastUpdated] = useState(null);
  const managerRef = useRef(null);

  useEffect(() => {
    if (!noticeboard.googleSheetUrl) {
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
  }, [noticeboard.googleSheetUrl, noticeboard.refreshInterval]);

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

  return (
    <div style={{
      background: '#f3f4f6',
      borderRadius: 12,
      padding: '10px 16px',
      marginBottom: 8,
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      border: '1px solid #e5e7eb',
      borderLeft: '4px solid #c0392b',
      transition: 'all 0.3s'
    }}>
      <span style={{ fontSize: 18, flexShrink: 0 }}>📢</span>
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <div style={{ fontSize: 12, color: '#374151', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {current.text}
        </div>
      </div>
      {notices.length > 1 && (
        <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
          {notices.slice(0, 5).map((_, i) => (
            <div key={i} style={{
              width: 6, height: 6, borderRadius: '50%',
              background: i === currentIdx ? '#c0392b' : '#c0392b40'
            }} />
          ))}
        </div>
      )}
    </div>
  );
}
