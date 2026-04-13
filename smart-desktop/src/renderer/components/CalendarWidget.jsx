// ============================================================
// CalendarWidget.jsx - 일정 관리
// 더블클릭 등록, 우클릭 삭제, 공유 일정 지원
// ============================================================

import React, { useState, useRef, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { useApp } from '../AppContext';

const DAYS_KO = ['일', '월', '화', '수', '목', '금', '토'];

// 대한민국 공휴일 (고정 + 음력 변환 근사)
const HOLIDAYS = {
  '01-01': '새해', '03-01': '삼일절', '05-05': '어린이날',
  '06-06': '현충일', '08-15': '광복절', '10-03': '개천절',
  '10-09': '한글날', '12-25': '성탄절',
};
// 연도별 음력 공휴일 (설날, 석가탄신일, 추석 — 매년 날짜가 다름)
const LUNAR_HOLIDAYS = {
  2025: { '01-28': '설날', '01-29': '설날', '01-30': '설날', '05-05': '석가탄신일', '10-05': '추석', '10-06': '추석', '10-07': '추석' },
  2026: { '02-16': '설날', '02-17': '설날', '02-18': '설날', '05-24': '석가탄신일', '09-24': '추석', '09-25': '추석', '09-26': '추석' },
  2027: { '02-06': '설날', '02-07': '설날', '02-08': '설날', '05-13': '석가탄신일', '10-13': '추석', '10-14': '추석', '10-15': '추석' },
};
function getHoliday(year, month, day) {
  const mmdd = `${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
  return HOLIDAYS[mmdd] || (LUNAR_HOLIDAYS[year] || {})[mmdd] || null;
}

function formatDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// 이벤트 색상 카테고리
const EVENT_COLORS = [
  { id: 'blue', label: '수업', color: '#3b82f6' },
  { id: 'red', label: '회의', color: '#ef4444' },
  { id: 'green', label: '행사', color: '#10b981' },
  { id: 'purple', label: '개인', color: '#8b5cf6' },
  { id: 'orange', label: '기타', color: '#f97316' },
];

export default function CalendarWidget() {
  const { state, actions } = useApp();
  const { theme, cache, google, ddays, todos } = state;
  const [hideGoogleBanner, setHideGoogleBanner] = useState(false);
  const localEvents = (cache.calendarEvents || []).filter(e => e.source !== 'google');
  const [googleEvents, setGoogleEvents] = useState([]);
  const selectedIds = google.selectedCalendarIds || [];
  const filteredGoogleEvents = googleEvents.filter(e => selectedIds.includes(e.calendarId));
  const events = [...localEvents, ...filteredGoogleEvents];

  const [viewDate, setViewDate] = useState(new Date());
  const [viewMode, setViewMode] = useState('month'); // month | agenda
  const [quickForm, setQuickForm] = useState(null);
  const [quickData, setQuickData] = useState({ title: '', time: '', endTime: '', color: '#3b82f6', reminder: 0, shared: false, sharedWith: 'all' });
  const [editingEvent, setEditingEvent] = useState(null); // 인라인 편집 중인 이벤트
  const [contextMenu, setContextMenu] = useState(null);
  const [cellMenu, setCellMenu] = useState(null);
  const containerRef = useRef();

  const cd = (light, dark) => theme.darkMode ? dark : light;
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

  // Google Calendar 이벤트 fetch (선택한 캘린더만)
  useEffect(() => {
    let cancelled = false; // 언마운트/deps 변경 시 stale setState 방지
    if (!google.connected || !google.accessToken) { setGoogleEvents([]); return; }
    const ids = google.selectedCalendarIds || [];
    if (!ids.length) { setGoogleEvents([]); return; }
    const fd = new Date(year, month, 1);
    const ld = new Date(year, month + 1, 0, 23, 59, 59);
    import('../services/googleService')
      .then(async ({ setTokens, getCalendarEvents }) => {
        try {
          setTokens(google.accessToken, google.refreshToken, 3600);
          const evts = await getCalendarEvents(fd.toISOString(), ld.toISOString(), ids);
          if (!cancelled) setGoogleEvents(evts);
        } catch (err) {
          if (!cancelled) setGoogleEvents([]); // 오류 시 빈 목록 유지
          if (err?.message && !err.message.includes('취소')) {
            console.warn('[CalendarWidget] Google 일정 로드 실패:', err.message);
          }
        }
      })
      .catch(err => {
        if (!cancelled) console.warn('[CalendarWidget] googleService 모듈 로드 실패:', err?.message);
      });
    return () => { cancelled = true; };
  }, [google.connected, google.accessToken, google.selectedCalendarIds, year, month]); // eslint-disable-line react-hooks/exhaustive-deps

  // 해당 날 이벤트
  const getEvents = (d) => {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    return events.filter(e => e.date === dateStr);
  };

  // 더블클릭 → 빠른 일정 등록 팝업
  const handleCellDblClick = (d, e) => {
    if (!d) return;
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

  // 일정 저장 (신규 + 편집)
  const saveEvent = () => {
    if (!quickData.title.trim()) return;
    if (editingEvent) {
      // 기존 이벤트 수정
      const updated = localEvents.map(e => e.id === editingEvent.id ? { ...e, title: quickData.title, time: quickData.time, endTime: quickData.endTime, color: quickData.color } : e);
      actions.setCache({ calendarEvents: updated });
      setEditingEvent(null);
    } else {
      // 신규 이벤트
      const newEvent = {
        id: Date.now(), date: quickForm.date,
        title: quickData.title, time: quickData.time, endTime: quickData.endTime,
        color: quickData.color || '#3b82f6', reminder: quickData.reminder || 0,
        shared: quickData.shared, sharedWith: quickData.sharedWith
      };
      actions.setCache({ calendarEvents: [...localEvents, newEvent] });
    }
    setQuickForm(null);
  };

  // 이벤트 클릭 → 인라인 편집
  const startEditEvent = (ev) => {
    if (ev.source === 'google') return; // Google 이벤트는 편집 불가
    setEditingEvent(ev);
    setQuickData({ title: ev.title, time: ev.time || '', endTime: ev.endTime || '', color: ev.color || '#3b82f6', shared: false, sharedWith: 'all' });
    setQuickForm({ date: ev.date });
  };

  // 할일/D-Day가 있는 날짜 목록
  const getDayMarkers = (dateStr) => {
    const markers = [];
    if ((ddays || []).some(d => d.date === dateStr)) markers.push('dday');
    if ((todos || []).some(t => t.due === dateStr && !t.done)) markers.push('todo');
    return markers;
  };

  // 일정 숨기기/삭제 (Google 이벤트: 현재 뷰에서만 숨김, 재fetch 시 복구 / 로컬 이벤트: 실제 삭제)
  const deleteEvent = (eventId) => {
    if (googleEvents.find(e => e.id === eventId)) {
      setGoogleEvents(prev => prev.filter(e => e.id !== eventId));
    } else {
      actions.setCache({ calendarEvents: localEvents.filter(e => e.id !== eventId) });
    }
    setContextMenu(null);
  };

  const prevMonth = () => setViewDate(new Date(year, month - 1, 1));
  const nextMonth = () => setViewDate(new Date(year, month + 1, 1));

  return (
    <div ref={containerRef} style={{ position: 'relative', height: '100%', display: 'flex', flexDirection: 'column' }}
      onClick={() => { setContextMenu(null); setCellMenu(null); }}
    >
      {/* 헤더 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button onClick={prevMonth} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: cd('#6b7280','#94a3b8'), padding: '2px 4px' }}>‹</button>
          <div style={{ fontWeight: 700, fontSize: 13, color: cd('#1f2937','#e2e8f0'), minWidth: 80, textAlign: 'center' }}>
            {year}년 {month + 1}월
          </div>
          <button onClick={nextMonth} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: cd('#6b7280','#94a3b8'), padding: '2px 4px' }}>›</button>
          {(year !== today.getFullYear() || month !== today.getMonth()) && (
            <button onClick={() => setViewDate(new Date())}
              style={{ background: theme.accentColor + '20', border: 'none', borderRadius: 5, padding: '1px 6px', fontSize: 9, cursor: 'pointer', color: theme.accentColor, fontWeight: 600 }}>
              오늘
            </button>
          )}
        </div>
        {/* 월간/어젠다 뷰 전환 */}
        <div style={{ display: 'flex', gap: 2 }}>
          {[{ id: 'month', label: '월' }, { id: 'agenda', label: '일정' }].map(v => (
            <button key={v.id} onClick={() => setViewMode(v.id)}
              style={{ padding: '2px 8px', borderRadius: 5, border: 'none', cursor: 'pointer', fontSize: 10, fontWeight: viewMode === v.id ? 600 : 400, background: viewMode === v.id ? theme.accentColor : cd('#f3f4f6','#334155'), color: viewMode === v.id ? '#fff' : cd('#6b7280','#94a3b8') }}>
              {v.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── 어젠다 뷰 ── */}
      {viewMode === 'agenda' && (() => {
        // 오늘부터 7일간 일정
        const agendaDays = [];
        for (let i = 0; i < 7; i++) {
          const d = new Date(); d.setDate(d.getDate() + i);
          const ds = formatDate(d);
          const dayEvts = events.filter(e => e.date === ds);
          const dayDdays = (ddays || []).filter(dd => dd.date === ds);
          const dayTodos = (todos || []).filter(t => t.due === ds && !t.done);
          if (dayEvts.length || dayDdays.length || dayTodos.length) {
            agendaDays.push({ date: d, dateStr: ds, events: dayEvts, ddays: dayDdays, todos: dayTodos });
          }
        }
        return (
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {agendaDays.length === 0 && (
              <div style={{ textAlign: 'center', color: cd('#9ca3af','#64748b'), fontSize: 11, padding: '20px 0' }}>
                이번 주 예정된 일정이 없습니다
              </div>
            )}
            {agendaDays.map(day => (
              <div key={day.dateStr} style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: day.dateStr === todayStr ? theme.accentColor : cd('#374151','#cbd5e1'), marginBottom: 4 }}>
                  {day.date.getMonth()+1}/{day.date.getDate()} ({DAYS_KO[day.date.getDay()]})
                  {day.dateStr === todayStr && <span style={{ marginLeft: 4, fontSize: 9, background: theme.accentColor, color: '#fff', borderRadius: 4, padding: '1px 5px' }}>오늘</span>}
                </div>
                {day.events.map(ev => (
                  <div key={ev.id} onClick={() => startEditEvent(ev)}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px', borderRadius: 6, marginBottom: 2, cursor: 'pointer', background: cd('#f9fafb','#1e293b'), borderLeft: `3px solid ${ev.color || theme.accentColor}` }}>
                    <span style={{ fontSize: 11, color: cd('#374151','#e2e8f0'), flex: 1 }}>{ev.title}</span>
                    {ev.time && <span style={{ fontSize: 9, color: cd('#9ca3af','#64748b') }}>{ev.time}</span>}
                  </div>
                ))}
                {day.ddays.map(dd => (
                  <div key={dd.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 8px', fontSize: 10, color: '#ef4444' }}>
                    📅 {dd.label}
                  </div>
                ))}
                {day.todos.map(t => (
                  <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 8px', fontSize: 10, color: '#f59e0b' }}>
                    ✅ {t.text}
                  </div>
                ))}
              </div>
            ))}
          </div>
        );
      })()}

      {/* ── 월간 뷰 ── */}
      {viewMode === 'month' && <>
      {/* Google 미연결 안내 배너 */}
      {!google.connected && !hideGoogleBanner && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: cd('#fef3c7','#292524'), borderRadius: 8, padding: '7px 10px', marginBottom: 8, fontSize: 11 }}>
          <span>📅</span>
          <span style={{ flex: 1, color: cd('#92400e','#fbbf24') }}>Google 캘린더를 연동하면 일정이 자동으로 표시됩니다.</span>
          <button onClick={() => actions.setUI({ settingsOpen: true, settingsTab: 'google' })}
            style={{ background: '#f59e0b', color: '#fff', border: 'none', borderRadius: 6, padding: '3px 8px', fontSize: 10, cursor: 'pointer', fontWeight: 600, whiteSpace: 'nowrap' }}>
            연동하기
          </button>
          <button onClick={() => setHideGoogleBanner(true)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: cd('#9ca3af','#64748b'), padding: '0 2px' }}>✕</button>
        </div>
      )}

      {/* 요일 헤더 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', marginBottom: 4 }}>
        {DAYS_KO.map((d, i) => (
          <div key={d} style={{
            textAlign: 'center', fontSize: 11, fontWeight: 600, padding: '3px 0',
            color: i === 0 ? '#ef4444' : i === 6 ? '#3b82f6' : cd('#9ca3af','#64748b')
          }}>{d}</div>
        ))}
      </div>

      {/* 날짜 셀 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gridAutoRows: '1fr', gap: 2, flex: 1, overflow: 'hidden' }}>
        {cells.map((d, idx) => {
          if (!d) return <div key={idx} />;
          const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
          const isToday = dateStr === todayStr;
          const dayEvents = getEvents(d);
          const dayOfWeek = (idx) % 7;
          const holiday = getHoliday(year, month + 1, d);

          return (
            <div key={idx}
              onClick={(e) => { if (!quickForm) handleCellDblClick(d, e); }}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setCellMenu({ date: dateStr, x: e.clientX, y: e.clientY, mode: 'menu', input: '' });
                setContextMenu(null);
              }}
              title="클릭: 일정 추가 / 우클릭: D-Day·할일"
              style={{
                overflow: 'hidden', borderRadius: 8, padding: '2px 3px',
                background: isToday ? theme.accentColor : holiday ? '#fee2e220' : 'transparent',
                cursor: 'pointer',
                transition: 'background 0.15s'
              }}
            >
              <div style={{
                textAlign: 'center', fontSize: 11,
                fontWeight: isToday ? 700 : holiday ? 600 : 400,
                color: isToday ? '#fff' : holiday ? '#ef4444' : (dayOfWeek % 7 === 0 ? '#ef4444' : dayOfWeek % 7 === 6 ? '#3b82f6' : cd('#374151','#e2e8f0'))
              }}>
                {d}
                {holiday && <div style={{ fontSize: 7, color: '#ef4444', lineHeight: 1, marginTop: 1 }}>{holiday}</div>}
              </div>

              {dayEvents.slice(0, 2).map(ev => (
                <div key={ev.id}
                  onClick={(e) => { e.stopPropagation(); startEditEvent(ev); }}
                  onContextMenu={(e) => handleEventRightClick(ev, e)}
                  title={`${ev.title}${ev.time ? ' ' + ev.time : ''} — 클릭: 편집 / 우클릭: 삭제`}
                  style={{
                    fontSize: 9, padding: '1px 3px', borderRadius: 3, marginTop: 1,
                    background: ev.color ? ev.color + '30' : (ev.shared ? cd('#dbeafe','#1e3a5f') : theme.accentColor + '30'),
                    borderLeft: `2px solid ${ev.color || theme.accentColor}`,
                    color: isToday ? '#fff' : cd('#374151','#e2e8f0'),
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    cursor: 'pointer'
                  }}>
                  {ev.title}
                </div>
              ))}
              {/* 할일/D-Day 마커 */}
              {(() => {
                const markers = getDayMarkers(dateStr);
                if (!markers.length && dayEvents.length <= 2) return null;
                return (
                  <div style={{ display: 'flex', justifyContent: 'center', gap: 2, marginTop: 1 }}>
                    {dayEvents.length > 2 && <span style={{ fontSize: 8, color: isToday ? '#fff' : cd('#9ca3af','#64748b') }}>+{dayEvents.length - 2}</span>}
                    {markers.includes('dday') && <span style={{ width: 4, height: 4, borderRadius: '50%', background: '#ef4444', display: 'inline-block' }} />}
                    {markers.includes('todo') && <span style={{ width: 4, height: 4, borderRadius: '50%', background: '#f59e0b', display: 'inline-block' }} />}
                  </div>
                );
              })()}
            </div>
          );
        })}
      </div>

      </>}

      {/* 빠른 일정 등록 팝업 — Portal로 body에 렌더링 (CSS containment 문제 해결) */}
      {quickForm && ReactDOM.createPortal(
        <div style={{
          position: 'fixed', zIndex: 2000,
          background: cd('#fff','#1e293b'), borderRadius: 14, padding: 18,
          boxShadow: '0 12px 40px rgba(0,0,0,0.3)',
          border: `1.5px solid ${cd('#f0f0f0','#475569')}`,
          width: 280,
          left: '50%', top: '50%',
          transform: 'translate(-50%, -50%)'
        }} onClick={e => e.stopPropagation()}>
          <div style={{ fontWeight: 700, fontSize: 14, color: cd('#1f2937','#e2e8f0'), marginBottom: 10 }}>
            {editingEvent ? '✏️ 일정 수정' : '📅 일정 추가'} · {quickForm.date?.slice(5)}
          </div>

          {/* 색상 카테고리 */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
            {EVENT_COLORS.map(ec => (
              <button key={ec.id} onClick={() => setQuickData({ ...quickData, color: ec.color })}
                style={{
                  flex: 1, padding: '3px 0', borderRadius: 5, border: quickData.color === ec.color ? `2px solid ${ec.color}` : '2px solid transparent',
                  background: ec.color + '20', color: ec.color, fontSize: 10, fontWeight: 600, cursor: 'pointer'
                }}>{ec.label}</button>
            ))}
          </div>

          <input
            autoFocus
            placeholder="일정 제목 *"
            value={quickData.title}
            onChange={e => setQuickData({ ...quickData, title: e.target.value })}
            onKeyDown={e => { if (e.key === 'Enter') saveEvent(); if (e.key === 'Escape') setQuickForm(null); }}
            style={{ width: '100%', border: `1.5px solid ${cd('#e5e7eb','#475569')}`, borderRadius: 8, padding: '10px 12px', fontSize: 14, marginBottom: 10, fontFamily: 'inherit', outline: 'none', background: cd('#fff','#0f172a'), color: cd('#1f2937','#e2e8f0') }}
          />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
            <div>
              <div style={{ fontSize: 11, color: cd('#9ca3af','#64748b'), marginBottom: 4 }}>시작 시간</div>
              <input type="time" value={quickData.time}
                onChange={e => setQuickData({ ...quickData, time: e.target.value })}
                style={{ width: '100%', border: `1.5px solid ${cd('#e5e7eb','#475569')}`, borderRadius: 8, padding: '8px', fontSize: 13, fontFamily: 'inherit', outline: 'none', background: cd('#fff','#0f172a'), color: cd('#1f2937','#e2e8f0') }}
              />
            </div>
            <div>
              <div style={{ fontSize: 11, color: cd('#9ca3af','#64748b'), marginBottom: 4 }}>종료 시간</div>
              <input type="time" value={quickData.endTime}
                onChange={e => setQuickData({ ...quickData, endTime: e.target.value })}
                style={{ width: '100%', border: `1.5px solid ${cd('#e5e7eb','#475569')}`, borderRadius: 8, padding: '8px', fontSize: 13, fontFamily: 'inherit', outline: 'none', background: cd('#fff','#0f172a'), color: cd('#1f2937','#e2e8f0') }}
              />
            </div>
          </div>

          {/* 알림 설정 */}
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 11, color: cd('#9ca3af','#64748b'), marginBottom: 4 }}>🔔 알림</div>
            <select value={quickData.reminder || 0} onChange={e => setQuickData({ ...quickData, reminder: Number(e.target.value) })}
              style={{ width: '100%', border: `1.5px solid ${cd('#e5e7eb','#475569')}`, borderRadius: 8, padding: '8px', fontSize: 12, fontFamily: 'inherit', outline: 'none', background: cd('#fff','#0f172a'), color: cd('#1f2937','#e2e8f0'), cursor: 'pointer' }}>
              <option value={0}>알림 없음</option>
              <option value={5}>5분 전</option>
              <option value={10}>10분 전</option>
              <option value={30}>30분 전</option>
              <option value={60}>1시간 전</option>
            </select>
          </div>

          {/* 공유 설정 */}
          <div style={{ background: cd('#f9fafb','#0f172a'), borderRadius: 10, padding: '10px 14px', marginBottom: 14 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: quickData.shared ? 8 : 0 }}>
              <input type="checkbox" checked={quickData.shared}
                onChange={e => setQuickData({ ...quickData, shared: e.target.checked })}
                style={{ width: 16, height: 16, cursor: 'pointer' }}
              />
              <span style={{ fontSize: 13, fontWeight: 600, color: cd('#374151','#cbd5e1') }}>👥 공유 일정으로 등록</span>
            </label>
            {quickData.shared && (
              <select value={quickData.sharedWith}
                onChange={e => setQuickData({ ...quickData, sharedWith: e.target.value })}
                style={{ width: '100%', border: `1px solid ${cd('#e5e7eb','#475569')}`, borderRadius: 7, padding: '7px 10px', fontSize: 12, fontFamily: 'inherit', outline: 'none', marginTop: 4, background: cd('#fff','#1e293b'), color: cd('#1f2937','#e2e8f0') }}>
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
              flex: 1, background: cd('#f3f4f6','#334155'), color: cd('#6b7280','#94a3b8'),
              border: 'none', borderRadius: 9, padding: '11px', fontSize: 14, cursor: 'pointer'
            }}>취소</button>
          </div>
        </div>,
        document.body
      )}

      {/* 날짜 우클릭 메뉴 (D-Day / 할일 등록) — Portal로 body에 렌더 */}
      {cellMenu && ReactDOM.createPortal(
        <div style={{
          position: 'fixed', zIndex: 3000,
          background: cd('#fff','#1e293b'), borderRadius: 10, padding: cellMenu.mode === 'menu' ? '6px 0' : '12px 14px',
          boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
          border: `0.5px solid ${cd('#e5e7eb','#475569')}`,
          minWidth: 200, maxWidth: 280,
          // 화면 밖으로 안 나가게 보정
          left: Math.min(cellMenu.x, window.innerWidth - 290),
          top: Math.min(cellMenu.y, window.innerHeight - 300)
        }} onClick={e => e.stopPropagation()}>

          {cellMenu.mode === 'menu' && (<>
            <div style={{ padding: '6px 14px 8px', borderBottom: `0.5px solid ${cd('#f3f4f6','#334155')}` }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: cd('#374151','#e2e8f0') }}>📅 {cellMenu.date}</div>
            </div>
            <button onClick={() => setCellMenu({ ...cellMenu, mode: 'dday', input: '' })} style={{ width: '100%', padding: '10px 14px', background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer', fontSize: 13, color: cd('#374151','#e2e8f0'), display: 'flex', alignItems: 'center', gap: 8 }}>
              📌 D-Day 등록
            </button>
            <button onClick={() => setCellMenu({ ...cellMenu, mode: 'todo', input: '' })} style={{ width: '100%', padding: '10px 14px', background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer', fontSize: 13, color: cd('#374151','#e2e8f0'), display: 'flex', alignItems: 'center', gap: 8 }}>
              ✅ 할 일 등록
            </button>
          </>)}

          {cellMenu.mode === 'dday' && (<>
            <div style={{ fontSize: 13, fontWeight: 600, color: cd('#1f2937','#e2e8f0'), marginBottom: 10 }}>📌 D-Day 등록</div>
            <div style={{ fontSize: 11, color: cd('#9ca3af','#64748b'), marginBottom: 4 }}>{cellMenu.date}</div>
            <input
              autoFocus
              placeholder="D-Day 이름 (예: 수능, 시험)"
              value={cellMenu.input}
              onChange={e => setCellMenu({ ...cellMenu, input: e.target.value })}
              onKeyDown={e => {
                if (e.key === 'Enter' && cellMenu.input.trim()) {
                  actions.addDday({ title: cellMenu.input.trim(), date: cellMenu.date });
                  setCellMenu(null);
                }
                if (e.key === 'Escape') setCellMenu(null);
              }}
              style={{ width: '100%', border: `1.5px solid ${cd('#e5e7eb','#475569')}`, borderRadius: 8, padding: '8px 10px', fontSize: 13, fontFamily: 'inherit', outline: 'none', background: cd('#fff','#0f172a'), color: cd('#1f2937','#e2e8f0'), marginBottom: 10 }}
            />
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={() => { if (cellMenu.input.trim()) { actions.addDday({ title: cellMenu.input.trim(), date: cellMenu.date }); setCellMenu(null); } }} style={{ flex: 1, background: theme.accentColor, color: '#fff', border: 'none', borderRadius: 7, padding: '8px', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>등록</button>
              <button onClick={() => setCellMenu(null)} style={{ flex: 1, background: cd('#f3f4f6','#334155'), color: cd('#6b7280','#94a3b8'), border: 'none', borderRadius: 7, padding: '8px', fontSize: 12, cursor: 'pointer' }}>취소</button>
            </div>
          </>)}

          {cellMenu.mode === 'todo' && (<>
            <div style={{ fontSize: 13, fontWeight: 600, color: cd('#1f2937','#e2e8f0'), marginBottom: 10 }}>✅ 할 일 등록</div>
            <div style={{ fontSize: 11, color: cd('#9ca3af','#64748b'), marginBottom: 4 }}>{cellMenu.date} 마감</div>
            <input
              autoFocus
              placeholder="할 일 내용"
              value={cellMenu.input}
              onChange={e => setCellMenu({ ...cellMenu, input: e.target.value })}
              onKeyDown={e => {
                if (e.key === 'Enter' && cellMenu.input.trim()) {
                  actions.addTodo({ text: cellMenu.input.trim(), done: false, due: cellMenu.date });
                  setCellMenu(null);
                }
                if (e.key === 'Escape') setCellMenu(null);
              }}
              style={{ width: '100%', border: `1.5px solid ${cd('#e5e7eb','#475569')}`, borderRadius: 8, padding: '8px 10px', fontSize: 13, fontFamily: 'inherit', outline: 'none', background: cd('#fff','#0f172a'), color: cd('#1f2937','#e2e8f0'), marginBottom: 10 }}
            />
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={() => { if (cellMenu.input.trim()) { actions.addTodo({ text: cellMenu.input.trim(), done: false, due: cellMenu.date }); setCellMenu(null); } }} style={{ flex: 1, background: '#10b981', color: '#fff', border: 'none', borderRadius: 7, padding: '8px', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>등록</button>
              <button onClick={() => setCellMenu(null)} style={{ flex: 1, background: cd('#f3f4f6','#334155'), color: cd('#6b7280','#94a3b8'), border: 'none', borderRadius: 7, padding: '8px', fontSize: 12, cursor: 'pointer' }}>취소</button>
            </div>
          </>)}
        </div>,
        document.body
      )}

      {/* 우클릭 컨텍스트 메뉴 — Portal로 body에 렌더 */}
      {contextMenu && ReactDOM.createPortal(
        <div style={{
          position: 'fixed', zIndex: 3000,
          background: cd('#fff','#1e293b'), borderRadius: 10, padding: '6px 0',
          boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
          border: `0.5px solid ${cd('#e5e7eb','#475569')}`,
          minWidth: 180,
          left: Math.min(contextMenu.x, window.innerWidth - 200),
          top: Math.min(contextMenu.y, window.innerHeight - 200)
        }} onClick={e => e.stopPropagation()}>
          <div style={{ padding: '6px 14px 10px', borderBottom: `0.5px solid ${cd('#f3f4f6','#334155')}` }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: cd('#1f2937','#e2e8f0') }}>{contextMenu.event.title}</div>
            <div style={{ fontSize: 11, color: cd('#9ca3af','#64748b') }}>{contextMenu.event.date}</div>
          </div>
          <button onClick={() => deleteEvent(contextMenu.event.id)} style={{
            width: '100%', padding: '10px 14px', background: 'none', border: 'none',
            textAlign: 'left', cursor: 'pointer', fontSize: 13, color: '#6b7280',
            display: 'flex', alignItems: 'center', gap: 8
          }}>🙈 위젯에서 숨기기</button>
          {contextMenu.event.source !== 'google' && (
            <button onClick={() => {
              actions.setCache({ calendarEvents: localEvents.filter(e => e.id !== contextMenu.event.id) });
              setContextMenu(null);
            }} style={{
              width: '100%', padding: '10px 14px', background: 'none', border: 'none',
              textAlign: 'left', cursor: 'pointer', fontSize: 13, color: '#dc2626',
              display: 'flex', alignItems: 'center', gap: 8
            }}>🗑️ 완전히 삭제</button>
          )}
          <button onClick={() => setContextMenu(null)} style={{
            width: '100%', padding: '10px 14px', background: 'none', border: 'none',
            textAlign: 'left', cursor: 'pointer', fontSize: 13, color: '#6b7280'
          }}>닫기</button>
        </div>,
        document.body
      )}
    </div>
  );
}
