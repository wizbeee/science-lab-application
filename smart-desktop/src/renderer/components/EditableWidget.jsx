// ============================================================
// EditableWidget.jsx - 편집 모드 드래그 + 리사이즈 + 스냅
// ============================================================

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';

const WIDGET_NAMES = {
  timetable: '📋 시간표', dday: '📅 D-Day', quicklinks: '⭐ 바로가기',
  calendar: '📆 캘린더', todos: '✅ 할 일', mail: '📧 메일/챗',
  recentfiles: '📂 최근 문서', weather: '🌤 날씨', meal: '🍽 급식',
  memo: '📝 메모', music: '🎧 미디어', system: '🖥 시스템', focus: '🎯 포커스',
  quote: '📖 명언', stopwatch: '⏱ 스톱워치', weekschedule: '🗓 주간일정', neisalert: '📋 공문',
  calc: '🔢 계산기', randompick: '🎲 랜덤 뽑기', exam: '📝 고사', progress: '📊 진도표',
  aichat: '🤖 AI', fileexplorer: '📂 탐색기', quickphrases: '💬 문구',
  lessontimer: '🎯 수업타이머', grading: '📊 채점', teachinglinks: '📎 자료',
  clock: '🕐 시계', currentPeriod: '📌 현재교시'
};

// 그리드 스냅 헬퍼
function snapPos(val, cellSize, gap, pad) {
  if (!cellSize) return val;
  const step = cellSize + gap;
  return Math.round((val - pad) / step) * step + pad;
}
function snapSize(val, cellSize, gap) {
  if (!cellSize) return val;
  const step = cellSize + gap;
  const cells = Math.max(1, Math.round((val + gap) / step));
  return cells * cellSize + (cells - 1) * gap;
}

// 8방향 리사이즈 핸들 설정
const HANDLES = [
  { dir: 'se', style: { bottom: 0, right: 0, cursor: 'se-resize', borderRadius: '0 0 8px 0' }, size: 16 },
  { dir: 'sw', style: { bottom: 0, left:  0, cursor: 'sw-resize', borderRadius: '0 0 0 8px' }, size: 16 },
  { dir: 'ne', style: { top:    0, right: 0, cursor: 'ne-resize', borderRadius: '0 8px 0 0' }, size: 16 },
  { dir: 'nw', style: { top:    0, left:  0, cursor: 'nw-resize', borderRadius: '8px 0 0 0'  }, size: 16 },
  { dir: 's',  style: { bottom: 0, left: '50%', transform: 'translateX(-50%)', cursor: 's-resize', borderRadius: 3 }, size: 28 },
  { dir: 'n',  style: { top:    0, left: '50%', transform: 'translateX(-50%)', cursor: 'n-resize', borderRadius: 3 }, size: 28 },
  { dir: 'e',  style: { right:  0, top:  '50%', transform: 'translateY(-50%)', cursor: 'e-resize', borderRadius: 3 }, size: 28 },
  { dir: 'w',  style: { left:   0, top:  '50%', transform: 'translateY(-50%)', cursor: 'w-resize', borderRadius: 3 }, size: 28 },
];

export default function EditableWidget({
  id, editMode, layout, onLayoutChange, onHide, theme, gridInfo, children
}) {
  const [dragging, setDragging] = useState(false);
  const [resizeDir, setResizeDir] = useState(null);
  const startRef = useRef({ mx: 0, my: 0, x: 0, y: 0, w: 0, h: 0 });

  useEffect(() => {
    if (!editMode) { setDragging(false); setResizeDir(null); }
  }, [editMode]);

  if (!editMode) return children;

  const pos = layout || { x: 0, y: 0, w: 300, h: 200 };
  const gi = gridInfo || {};
  const accent = theme?.accentColor || '#3b82f6';
  const name = WIDGET_NAMES[id] || id;
  const isActive = dragging || !!resizeDir;

  const startDrag = (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    setDragging(true);
    startRef.current = { mx: e.clientX, my: e.clientY, x: pos.x, y: pos.y, w: pos.w, h: pos.h };
  };

  const startResize = (dir) => (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    setResizeDir(dir);
    startRef.current = { mx: e.clientX, my: e.clientY, x: pos.x, y: pos.y, w: pos.w, h: pos.h };
  };

  return (
    <WidgetBody
      id={id} pos={pos} gi={gi} accent={accent} name={name}
      isActive={isActive} dragging={dragging} resizeDir={resizeDir}
      setDragging={setDragging} setResizeDir={setResizeDir}
      startRef={startRef} onLayoutChange={onLayoutChange}
      startDrag={startDrag} startResize={startResize} onHide={onHide}
    >
      {children}
    </WidgetBody>
  );
}

function WidgetBody({
  id, pos, gi, accent, name,
  isActive, dragging, resizeDir,
  setDragging, setResizeDir,
  startRef, onLayoutChange,
  startDrag, startResize, onHide, children
}) {
  // 드래그/리사이즈 중에는 자유 이동 (스냅 없음), 놓을 때만 스냅
  const onMove = useCallback((e) => {
    const s = startRef.current;
    const dx = e.clientX - s.mx;
    const dy = e.clientY - s.my;

    if (dragging) {
      const nx = Math.max(0, s.x + dx);
      const ny = Math.max(0, s.y + dy);
      onLayoutChange(id, { ...pos, x: nx, y: ny });
      return;
    }
    if (resizeDir) {
      const mw = (gi.cellW || 80);
      const mh = (gi.cellH || 60);
      let nx = s.x, ny = s.y, nw = s.w, nh = s.h;
      if (resizeDir.includes('e')) nw = Math.max(mw, s.w + dx);
      if (resizeDir.includes('s')) nh = Math.max(mh, s.h + dy);
      if (resizeDir.includes('w')) { nw = Math.max(mw, s.w - dx); nx = s.x + s.w - nw; }
      if (resizeDir.includes('n')) { nh = Math.max(mh, s.h - dy); ny = s.y + s.h - nh; }
      onLayoutChange(id, { x: nx, y: ny, w: nw, h: nh });
    }
  }, [dragging, resizeDir, id, pos, gi, onLayoutChange, startRef]); // eslint-disable-line react-hooks/exhaustive-deps

  // 놓을 때 그리드에 스냅 (부드러운 애니메이션)
  const onUp = useCallback(() => {
    const g = gi.gap || 6;
    const p = gi.pad || 6;
    const cw = gi.cellW;
    const ch = gi.cellH;
    if (cw && (dragging || resizeDir)) {
      // 현재 위치를 그리드에 스냅
      let { x, y, w, h } = pos;
      x = snapPos(Math.max(0, x), cw, g, p);
      y = snapPos(Math.max(0, y), ch, g, p);
      w = snapSize(w, cw, g);
      h = snapSize(h, ch, g);
      onLayoutChange(id, { x, y, w, h });
    }
    setDragging(false);
    setResizeDir(null);
  }, [setDragging, setResizeDir, gi, pos, dragging, resizeDir, id, onLayoutChange]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!isActive) return;
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [isActive, onMove, onUp]);

  return (
    <div style={{
      position: 'absolute',
      left: pos.x, top: pos.y,
      width: pos.w, height: pos.h,
      zIndex: isActive ? 9000 : 10,
      borderRadius: 10,
      overflow: 'hidden',  // 내용이 위젯 밖으로 넘치지 않도록
      boxShadow: isActive
        ? `0 12px 36px rgba(0,0,0,0.22), 0 0 0 2px ${accent}`
        : `0 0 0 1.5px ${accent}60`,
      transition: isActive ? 'none' : 'left 0.25s cubic-bezier(0.4,0,0.2,1), top 0.25s cubic-bezier(0.4,0,0.2,1), width 0.25s cubic-bezier(0.4,0,0.2,1), height 0.25s cubic-bezier(0.4,0,0.2,1), box-shadow 0.15s',
      userSelect: 'none',
    }}>

      {/* ── 드래그 핸들 헤더 바 ─────────────────────────────── */}
      <div
        onMouseDown={startDrag}
        title="드래그로 이동"
        style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 28,
          zIndex: 4,
          cursor: dragging ? 'grabbing' : 'grab',
          background: isActive ? `${accent}28` : `${accent}14`,
          borderRadius: '9px 9px 0 0',
          borderBottom: `1px solid ${accent}25`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 6px 0 8px',
          transition: 'background 0.15s',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, pointerEvents: 'none', overflow: 'hidden' }}>
          {/* 그랩 아이콘 */}
          <svg width="10" height="14" viewBox="0 0 10 14" fill={accent} opacity="0.6">
            <circle cx="2" cy="3" r="1.5"/><circle cx="8" cy="3" r="1.5"/>
            <circle cx="2" cy="7" r="1.5"/><circle cx="8" cy="7" r="1.5"/>
            <circle cx="2" cy="11" r="1.5"/><circle cx="8" cy="11" r="1.5"/>
          </svg>
          <span style={{ fontSize: 10, fontWeight: 700, color: accent, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {name}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {isActive && (
            <span style={{ fontSize: 9, color: accent, opacity: 0.65, fontVariantNumeric: 'tabular-nums', pointerEvents: 'none' }}>
              {pos.w}×{pos.h}
            </span>
          )}
          {/* 숨기기 버튼 */}
          <button
            onMouseDown={e => e.stopPropagation()}
            onClick={e => { e.stopPropagation(); onHide?.(id); }}
            style={{
              width: 18, height: 18, borderRadius: 4,
              background: '#ef4444cc', color: '#fff',
              border: 'none', cursor: 'pointer',
              fontSize: 10, lineHeight: 1,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }} title="위젯 숨기기"
          >✕</button>
        </div>
      </div>

      {/* ── 위젯 콘텐츠 (비상호작용 미리보기) ─────────────── */}
      <div style={{
        position: 'absolute',
        top: 28, left: 0, right: 0, bottom: 0,
        overflow: 'hidden',
        borderRadius: '0 0 9px 9px',
        pointerEvents: 'none',
        opacity: dragging ? 0.6 : 1,
        transition: 'opacity 0.1s',
      }}>
        {children}
      </div>

      {/* ── 8방향 리사이즈 핸들 ────────────────────────────── */}
      {HANDLES.map(({ dir, style, size }) => {
        const isCorner = dir.length === 2;
        return (
          <div
            key={dir}
            onMouseDown={startResize(dir)}
            style={{
              position: 'absolute',
              width:  isCorner ? size : (dir === 'e' || dir === 'w' ? 8 : size),
              height: isCorner ? size : (dir === 'n' || dir === 's' ? 8 : size),
              ...style,
              zIndex: 5,
              background: resizeDir === dir ? accent : `${accent}80`,
              opacity: resizeDir === dir ? 1 : 0.75,
              transition: 'opacity 0.12s, background 0.12s',
            }}
            title={`${dir} 방향으로 크기 조절`}
          />
        );
      })}
    </div>
  );
}
