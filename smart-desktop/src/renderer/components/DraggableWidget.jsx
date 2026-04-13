// ============================================================
// DraggableWidget.jsx - 드래그 이동 + 리사이즈 래퍼
// 편집 모드에서만 활성화, 잠금 시 고정
// ============================================================

import React, { useState, useRef, useEffect } from 'react';

export default function DraggableWidget({
  id,
  title,
  icon,
  children,
  editMode,
  position,        // { x, y, w, h }
  onPositionChange, // (id, { x, y, w, h }) => void
  theme,
  minW = 200,
  minH = 100,
  style = {}
}) {
  const ref = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [resizing, setResizing] = useState(false);
  const dragStart = useRef({ mx: 0, my: 0, ox: 0, oy: 0 });
  const resizeStart = useRef({ mx: 0, my: 0, ow: 0, oh: 0 });

  // 드래그 시작
  const handleDragStart = (e) => {
    if (!editMode) return;
    e.preventDefault();
    setDragging(true);
    dragStart.current = {
      mx: e.clientX, my: e.clientY,
      ox: position.x, oy: position.y
    };
  };

  // 리사이즈 시작
  const handleResizeStart = (e) => {
    if (!editMode) return;
    e.preventDefault();
    e.stopPropagation();
    setResizing(true);
    resizeStart.current = {
      mx: e.clientX, my: e.clientY,
      ow: position.w, oh: position.h
    };
  };

  useEffect(() => {
    if (!dragging && !resizing) return;

    const handleMove = (e) => {
      if (dragging) {
        const dx = e.clientX - dragStart.current.mx;
        const dy = e.clientY - dragStart.current.my;
        onPositionChange(id, {
          ...position,
          x: Math.max(0, dragStart.current.ox + dx),
          y: Math.max(0, dragStart.current.oy + dy)
        });
      }
      if (resizing) {
        const dx = e.clientX - resizeStart.current.mx;
        const dy = e.clientY - resizeStart.current.my;
        onPositionChange(id, {
          ...position,
          w: Math.max(minW, resizeStart.current.ow + dx),
          h: Math.max(minH, resizeStart.current.oh + dy)
        });
      }
    };

    const handleUp = () => {
      setDragging(false);
      setResizing(false);
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [dragging, resizing, id, position, onPositionChange, minW, minH]);

  return (
    <div
      ref={ref}
      style={{
        position: editMode ? 'absolute' : 'relative',
        left: editMode ? position.x : undefined,
        top: editMode ? position.y : undefined,
        width: editMode ? position.w : undefined,
        minHeight: editMode ? position.h : undefined,
        zIndex: dragging ? 100 : 1,
        transition: dragging || resizing ? 'none' : 'box-shadow 0.2s',
        ...style
      }}
    >
      {/* 편집 모드 헤더 */}
      {editMode && (
        <div
          onMouseDown={handleDragStart}
          style={{
            position: 'absolute', top: -20, left: 0, right: 0,
            height: 20,
            background: theme.accentColor,
            borderRadius: '8px 8px 0 0',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'grab', userSelect: 'none',
            fontSize: 10, color: '#fff', fontWeight: 600, letterSpacing: '0.5px'
          }}
        >
          {icon} {title} ⠿
        </div>
      )}

      {/* 편집 모드 테두리 */}
      {editMode && (
        <div style={{
          position: 'absolute', inset: -2,
          border: `2px dashed ${theme.accentColor}60`,
          borderRadius: 18, pointerEvents: 'none'
        }} />
      )}

      {/* 콘텐츠 */}
      {children}

      {/* 리사이즈 핸들 */}
      {editMode && (
        <div
          onMouseDown={handleResizeStart}
          style={{
            position: 'absolute', bottom: 0, right: 0,
            width: 16, height: 16,
            cursor: 'se-resize',
            background: theme.accentColor,
            borderRadius: '0 0 14px 0',
            opacity: 0.6
          }}
        />
      )}
    </div>
  );
}
