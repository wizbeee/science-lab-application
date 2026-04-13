// ============================================================
// TimetableWidget.jsx - 주간 시간표 위젯
// 셀 클릭 → 즉시 편집, 오늘 열 강조
// ============================================================

import React, { useState } from 'react';
import { useApp } from '../AppContext';

const DAYS = [
  { key: 'mon', label: '월' },
  { key: 'tue', label: '화' },
  { key: 'wed', label: '수' },
  { key: 'thu', label: '목' },
  { key: 'fri', label: '금' }
];

const CLASS_PERIODS = [1, 2, 3, 5, 6, 7]; // 수업 교시 (4교시는 점심 분리)

const CLASS_COLORS = [
  '#fce7f3', '#dbeafe', '#dcfce7', '#fef9c3', '#ede9fe', '#ffedd5',
  '#d1fae5', '#e0f2fe', '#fdf4ff', '#fef3c7'
];

// 색상 팔레트 (학급별 자동 배정)
function getClassColor(className, colorMap) {
  if (!className) return null;
  if (colorMap[className]) return colorMap[className];
  const idx = Object.keys(colorMap).length % CLASS_COLORS.length;
  colorMap[className] = CLASS_COLORS[idx];
  return colorMap[className];
}

export default function TimetableWidget() {
  const { state, actions } = useApp();
  const { theme, timetable, schedule } = state;

  const [editing, setEditing] = useState(null); // { day, period }
  const [editValue, setEditValue] = useState({ subject: '', class: '', room: '' });
  const colorMap = {};

  const todayIdx = new Date().getDay(); // 0=일, 1=월...
  const todayKey = ['', 'mon', 'tue', 'wed', 'thu', 'fri'][todayIdx] || null;

  // 셀 클릭 → 편집 시작
  const startEdit = (day, period, current) => {
    setEditing({ day, period });
    setEditValue({
      subject: current?.subject || '',
      class: current?.class || '',
      room: current?.room || ''
    });
  };

  // 편집 저장
  const saveEdit = () => {
    if (!editing) return;
    const { day, period } = editing;
    const arr = [...(timetable[day] || [])];
    const idx = arr.findIndex(c => c.period === period);
    if (editValue.subject || editValue.class) {
      const entry = { period, ...editValue };
      if (idx >= 0) arr[idx] = entry;
      else arr.push(entry);
      arr.sort((a, b) => a.period - b.period);
    } else {
      if (idx >= 0) arr.splice(idx, 1);
    }
    actions.setTimetable({ [day]: arr });
    setEditing(null);
  };

  // 편집 취소
  const cancelEdit = () => setEditing(null);

  // 셀 데이터 조회
  const getCell = (day, period) =>
    (timetable[day] || []).find(c => c.period === period);

  return (
    <div style={{ fontFamily: "inherit" }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>📋 주간 시간표</div>
        <div style={{ fontSize: 11, color: '#9ca3af' }}>셀 클릭하여 편집</div>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr>
              <th style={{ width: 44, padding: '6px 4px', color: '#9ca3af', fontWeight: 500, textAlign: 'center', borderBottom: '1.5px solid #f3f4f6' }}>교시</th>
              {DAYS.map(d => (
                <th key={d.key} style={{
                  padding: '6px 4px',
                  textAlign: 'center',
                  fontWeight: d.key === todayKey ? 700 : 500,
                  color: d.key === todayKey ? (theme.accentColor) : '#6b7280',
                  borderBottom: `1.5px solid ${d.key === todayKey ? theme.accentColor : '#f3f4f6'}`,
                  background: d.key === todayKey ? theme.accentColor + '10' : 'transparent'
                }}>
                  {d.label}
                  {d.key === todayKey && <div style={{ fontSize: 9, fontWeight: 400, color: theme.accentColor }}>오늘</div>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {CLASS_PERIODS.map(period => {
              const periodInfo = schedule.periods.find(p => p.id === period * 2 - 1) ||
                schedule.periods.find(p => p.name === `${period}교시`);

              return (
                <tr key={period}>
                  <td style={{ padding: '4px', textAlign: 'center', borderBottom: '0.5px solid #f9fafb' }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>{period}</div>
                    <div style={{ fontSize: 10, color: '#d1d5db' }}>교시</div>
                  </td>
                  {DAYS.map(d => {
                    const cell = getCell(d.key, period);
                    const isEditing = editing?.day === d.key && editing?.period === period;
                    const isToday = d.key === todayKey;
                    const bg = cell ? getClassColor(cell.class, colorMap) : null;

                    return (
                      <td key={d.key} style={{
                        padding: 3,
                        borderBottom: '0.5px solid #f9fafb',
                        background: isToday ? theme.accentColor + '08' : 'transparent'
                      }}>
                        {isEditing ? (
                          // 편집 팝업
                          <div style={{
                            position: 'fixed', zIndex: 1000,
                            background: '#fff',
                            border: '1.5px solid #e5e7eb',
                            borderRadius: 12,
                            padding: 14,
                            boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                            width: 220,
                            transform: 'translateX(-50%)',
                            left: '50%'
                          }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 10 }}>
                              {d.label}요일 {period}교시
                            </div>
                            {[
                              { key: 'subject', placeholder: '과목 (예: 화학I)', label: '과목' },
                              { key: 'class', placeholder: '학급 (예: 2-3)', label: '학급' },
                              { key: 'room', placeholder: '장소 (예: 과학실1)', label: '장소' }
                            ].map(f => (
                              <div key={f.key} style={{ marginBottom: 8 }}>
                                <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 3 }}>{f.label}</div>
                                <input
                                  value={editValue[f.key]}
                                  onChange={e => setEditValue({ ...editValue, [f.key]: e.target.value })}
                                  placeholder={f.placeholder}
                                  style={{
                                    width: '100%', border: '1px solid #e5e7eb', borderRadius: 7,
                                    padding: '7px 10px', fontSize: 13, outline: 'none', fontFamily: 'inherit'
                                  }}
                                  onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') cancelEdit(); }}
                                  autoFocus={f.key === 'subject'}
                                />
                              </div>
                            ))}
                            <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                              <button onClick={saveEdit} style={{
                                flex: 1, background: theme.accentColor, color: '#fff',
                                border: 'none', borderRadius: 7, padding: '8px', fontSize: 12, cursor: 'pointer', fontWeight: 600
                              }}>저장</button>
                              <button onClick={cancelEdit} style={{
                                flex: 1, background: '#f3f4f6', color: '#6b7280',
                                border: 'none', borderRadius: 7, padding: '8px', fontSize: 12, cursor: 'pointer'
                              }}>취소</button>
                              {cell && <button onClick={() => { setEditValue({ subject: '', class: '', room: '' }); saveEdit(); }}
                                style={{ background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: 7, padding: '8px 10px', fontSize: 12, cursor: 'pointer' }}>
                                삭제
                              </button>}
                            </div>
                          </div>
                        ) : (
                          <div
                            onClick={() => startEdit(d.key, period, cell)}
                            style={{
                              minHeight: 44,
                              borderRadius: 8,
                              background: bg || (isToday ? theme.accentColor + '15' : '#f9fafb'),
                              border: `1px solid ${bg ? bg + '80' : (isToday ? theme.accentColor + '30' : '#f0f0f0')}`,
                              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                              cursor: 'pointer', padding: '4px 2px',
                              transition: 'all 0.15s'
                            }}
                          >
                            {cell ? (
                              <>
                                <div style={{ fontSize: 11, fontWeight: 700, color: '#1f2937', textAlign: 'center' }}>{cell.class}</div>
                                {cell.subject && <div style={{ fontSize: 10, color: '#6b7280', textAlign: 'center' }}>{cell.subject}</div>}
                              </>
                            ) : (
                              <div style={{ fontSize: 16, color: '#d1d5db' }}>+</div>
                            )}
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 점심 행 표시 */}
      <div style={{
        marginTop: 8, padding: '8px 12px',
        background: '#fef9c3', borderRadius: 8,
        fontSize: 12, color: '#92400e', textAlign: 'center'
      }}>
        🍽️ 점심 11:30~13:30 (4교시 A/B조 순환)
      </div>
    </div>
  );
}
