// ============================================================
// CalendarWidget.jsx - 일정 관리
// 더블클릭 등록, 우클릭 삭제, 공유 일정 지원
// ============================================================

import React, { useState, useRef } from 'react';
import { useApp } from '../AppContext';

const DAYS_KO = ['일', '월', '화', '수', '목', '금', '토'];

function formatDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function CalendarWidget() {
  const { state, actions } = useApp();
  const { theme, cache } = state;
  const events = cache.calendarEvents || [];

  const [viewDate, setViewDate] = useState(new Date());
  const [quickForm, setQuickForm] = useState(null); // { date, x, y }
  const [quickData, setQuickData] = useState({ title: '', time: '', endTime: '', shared: false, sharedWith: 'all' });
  const [contextMenu, setContextMenu] = useState(null); // { event, x, y }
  const containerRef = useRef();

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const today = new Date();
  const todayStr = formatDate(today);

  // 월 첫째 날, 마지막 날
  const firstDay = new Date(year, month, 1);
  const lastDay  = new Date(year, month + 1, 0);
  const startOffset = firstDay.getDay(); // 0=일

  // 달력 날짜 배열
  const cells = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= lastDay.getDate(); d++) cells.push(d);

  // 해당 날 이벤트
  const getEvents = (d) => {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    return events.filter(e => e.date === dateStr);
  };

  // 더블클릭 → 빠른 일정 등록 팝업
  const handleCellDblClick = (d, e) => {
    if (!d) return;
    const rect = containerRef.current.getBoundingClientRect();
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    setQuickForm({ date: dateStr });
    setQuickData({ title: '', time: '', endTime: '', shared: false, sharedWith: 'all' });
    setContextMenu(null);
  };

  // 일정 우클릭 → 빠른 삭제 메뉴
  const handleEventRightClick = (event, e) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ event, x: e.clientX, y: e.clientY });
    setQuickForm(null);
  };

  // 일정 저장
  const saveEvent = () => {
    if (!quickData.title.trim()) return;
    const newEvent = {
      id: Date.now(),
      date: quickForm.date,
      title: quickData.title,
      time: quickData.time,
      endTime: quickData.endTime,
      shared: quickData.shared,
      sharedWith: quickData.sharedWith,
      color: theme.accentColor
    };
    actions.setCache({ calendarEvents: [...events, newEvent] });
    setQuickForm(null);
  };

  // 일정 삭제
  const deleteEvent = (eventId, deleteForAll = false) => {
    actions.setCache({ calendarEvents: events.filter(e => e.id !== eventId) });
    setContextMenu(null);
  };

  const prevMonth = () => setViewDate(new Date(year, month - 1, 1));
  const nextMonth = () => setViewDate(new Date(year, month + 1, 1));

  return (
    <div ref={containerRef} style={{ position: 'relative' }}
      onClick={() => { setContextMenu(null); }}
    >
      {/* 헤더 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <button onClick={prevMonth} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: '#6b7280' }}>‹</button>
        <div style={{ fontWeight: 700, fontSize: 14, color: '#1f2937' }}>
          {year}년 {month + 1}월
        </div>
        <button onClick={nextMonth} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: '#6b7280' }}>›</button>
      </div>

      {/* 요일 헤더 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', marginBottom: 4 }}>
        {DAYS_KO.map((d, i) => (
          <div key={d} style={{
            textAlign: 'center', fontSize: 11, fontWeight: 600, padding: '3px 0',
            color: i === 0 ? '#ef4444' : i === 6 ? '#3b82f6' : '#9ca3af'
          }}>{d}</div>
        ))}
      </div>

      {/* 날짜 셀 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
        {cells.map((d, idx) => {
          if (!d) return <div key={idx} />;
          const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
          const isToday = dateStr === todayStr;
          const dayEvents = getEvents(d);
          const dayOfWeek = (idx) % 7;

          return (
            <div key={idx}
              onDoubleClick={(e) => handleCellDblClick(d, e)}
              title="더블클릭하여 일정 추가"
              style={{
                minHeight: 40, borderRadius: 8, padding: '4px 3px',
                background: isToday ? theme.accentColor : 'transparent',
                cursor: 'pointer',
                transition: 'background 0.15s'
              }}
            >
              <div style={{
                textAlign: 'center', fontSize: 12,
                fontWeight: isToday ? 700 : 400,
                color: isToday ? '#fff' : (dayOfWeek % 7 === 0 ? '#ef4444' : dayOfWeek % 7 === 6 ? '#3b82f6' : '#374151')
              }}>{d}</div>

              {dayEvents.slice(0, 2).map(ev => (
                <div key={ev.id}
                  onContextMenu={(e) => handleEventRightClick(ev, e)}
                  title={`${ev.title} - 우클릭하여 삭제`}
                  style={{
                    fontSize: 10, padding: '1px 3px', borderRadius: 3, marginTop: 1,
                    background: ev.shared ? '#dbeafe' : (ev.color + '30'),
                    color: ev.shared ? '#1e40af' : (isToday ? '#fff' : '#374151'),
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    cursor: 'context-menu'
                  }}>
                  {ev.shared && '👥 '}{ev.title}
                </div>
              ))}
              {dayEvents.length > 2 && (
                <div style={{ fontSize: 9, color: isToday ? '#fff' : '#9ca3af', textAlign: 'center' }}>+{dayEvents.length - 2}</div>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ fontSize: 11, color: '#9ca3af', textAlign: 'center', marginTop: 8 }}>
        💡 날짜 더블클릭 → 일정 추가 · 일정 우클릭 → 삭제
      </div>

      {/* 빠른 일정 등록 팝업 */}
      {quickForm && (
        <div style={{
          position: 'fixed', zIndex: 2000,
          background: '#fff', borderRadius: 14, padding: 18,
          boxShadow: '0 12px 40px rgba(0,0,0,0.16)',
          border: '1.5px solid #f0f0f0',
          width: 280,
          left: '50%', top: '50%',
          transform: 'translate(-50%, -50%)'
        }} onClick={e => e.stopPropagation()}>
          <div style={{ fontWeight: 700, fontSize: 14, color: '#1f2937', marginBottom: 14 }}>
            📅 {quickForm.date} 일정 추가
          </div>

          <input
            autoFocus
            placeholder="일정 제목 *"
            value={quickData.title}
            onChange={e => setQuickData({ ...quickData, title: e.target.value })}
            onKeyDown={e => { if (e.key === 'Enter') saveEvent(); if (e.key === 'Escape') setQuickForm(null); }}
            style={{ width: '100%', border: '1.5px solid #e5e7eb', borderRadius: 8, padding: '10px 12px', fontSize: 14, marginBottom: 10, fontFamily: 'inherit', outline: 'none' }}
          />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
            <div>
              <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 4 }}>시작 시간</div>
              <input type="time" value={quickData.time}
                onChange={e => setQuickData({ ...quickData, time: e.target.value })}
                style={{ width: '100%', border: '1.5px solid #e5e7eb', borderRadius: 8, padding: '8px', fontSize: 13, fontFamily: 'inherit', outline: 'none' }}
              />
            </div>
            <div>
              <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 4 }}>종료 시간</div>
              <input type="time" value={quickData.endTime}
                onChange={e => setQuickData({ ...quickData, endTime: e.target.value })}
                style={{ width: '100%', border: '1.5px solid #e5e7eb', borderRadius: 8, padding: '8px', fontSize: 13, fontFamily: 'inherit', outline: 'none' }}
              />
            </div>
          </div>

          {/* 공유 설정 */}
          <div style={{ background: '#f9fafb', borderRadius: 10, padding: '10px 14px', marginBottom: 14 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: quickData.shared ? 8 : 0 }}>
              <input type="checkbox" checked={quickData.shared}
                onChange={e => setQuickData({ ...quickData, shared: e.target.checked })}
                style={{ width: 16, height: 16, cursor: 'pointer' }}
              />
              <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>👥 공유 일정으로 등록</span>
            </label>
            {quickData.shared && (
              <select value={quickData.sharedWith}
                onChange={e => setQuickData({ ...quickData, sharedWith: e.target.value })}
                style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: 7, padding: '7px 10px', fontSize: 12, fontFamily: 'inherit', outline: 'none', marginTop: 4 }}>
                <option value="all">전체 공유</option>
                <option value="group">내 그룹</option>
                <option value="select">특정 사용자 선택</option>
              </select>
            )}
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={saveEvent} style={{
              flex: 1, background: theme.accentColor, color: '#fff',
              border: 'none', borderRadius: 9, padding: '11px', fontSize: 14, fontWeight: 600, cursor: 'pointer'
            }}>저장</button>
            <button onClick={() => setQuickForm(null)} style={{
              flex: 1, background: '#f3f4f6', color: '#6b7280',
              border: 'none', borderRadius: 9, padding: '11px', fontSize: 14, cursor: 'pointer'
            }}>취소</button>
          </div>
        </div>
      )}

      {/* 우클릭 컨텍스트 메뉴 */}
      {contextMenu && (
        <div style={{
          position: 'fixed', zIndex: 3000,
          background: '#fff', borderRadius: 10, padding: '6px 0',
          boxShadow: '0 8px 24px rgba(0,0,0,0.14)',
          border: '0.5px solid #e5e7eb',
          minWidth: 180,
          left: contextMenu.x, top: contextMenu.y
        }} onClick={e => e.stopPropagation()}>
          <div style={{ padding: '6px 14px 10px', borderBottom: '0.5px solid #f3f4f6' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#1f2937' }}>{contextMenu.event.title}</div>
            <div style={{ fontSize: 11, color: '#9ca3af' }}>{contextMenu.event.date}</div>
          </div>
          <button onClick={() => deleteEvent(contextMenu.event.id)} style={{
            width: '100%', padding: '10px 14px', background: 'none', border: 'none',
            textAlign: 'left', cursor: 'pointer', fontSize: 13, color: '#dc2626',
            display: 'flex', alignItems: 'center', gap: 8
          }}>🗑️ 내 일정 삭제</button>
          {contextMenu.event.shared && (
            <button onClick={() => deleteEvent(contextMenu.event.id, true)} style={{
              width: '100%', padding: '10px 14px', background: 'none', border: 'none',
              textAlign: 'left', cursor: 'pointer', fontSize: 13, color: '#b91c1c',
              display: 'flex', alignItems: 'center', gap: 8
            }}>🗑️ 공유된 일정 전체 삭제</button>
          )}
          <button onClick={() => setContextMenu(null)} style={{
            width: '100%', padding: '10px 14px', background: 'none', border: 'none',
            textAlign: 'left', cursor: 'pointer', fontSize: 13, color: '#6b7280'
          }}>닫기</button>
        </div>
      )}
    </div>
  );
}
