// ============================================================
// TimetableWidget.jsx - 주간 시간표 위젯
// 셀 클릭 → 즉시 편집, 오늘 열 강조
// 4교시A/B + 점심 자동 분리
// ============================================================

import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { useApp } from '../AppContext';

const DAYS = [
  { key: 'mon', label: '월' },
  { key: 'tue', label: '화' },
  { key: 'wed', label: '수' },
  { key: 'thu', label: '목' },
  { key: 'fri', label: '금' }
];

// 시간표 행 정의: 1~3교시, 4A, 4B, 5~7교시
const TIMETABLE_ROWS = [
  { id: 1, label: '1', type: 'class' },
  { id: 2, label: '2', type: 'class' },
  { id: 3, label: '3', type: 'class' },
  { id: '4A', label: '4A', type: 'split', time: '11:30~12:20' },
  { id: '4B', label: '4B', type: 'split', time: '12:30~13:20' },
  { id: 5, label: '5', type: 'class' },
  { id: 6, label: '6', type: 'class' },
  { id: 7, label: '7', type: 'class' }
];

// 채도는 낮추고 대비는 유지한 파스텔 팔레트 (bg / accent 쌍)
const CLASS_PALETTE = [
  { bg: '#fde7ef', accent: '#ec4899' }, // rose
  { bg: '#e0eaff', accent: '#6366f1' }, // indigo
  { bg: '#d8f5e3', accent: '#10b981' }, // emerald
  { bg: '#fff4cc', accent: '#f59e0b' }, // amber
  { bg: '#ece3fd', accent: '#8b5cf6' }, // violet
  { bg: '#ffe4cc', accent: '#f97316' }, // orange
  { bg: '#d0f0fa', accent: '#06b6d4' }, // cyan
  { bg: '#fce7f3', accent: '#d946ef' }, // fuchsia
  { bg: '#dcfce7', accent: '#22c55e' }, // green
  { bg: '#e0f2fe', accent: '#0ea5e9' }  // sky
];

function getClassColor(className, colorMap) {
  if (!className) return null;
  if (colorMap[className]) return colorMap[className];
  const idx = Object.keys(colorMap).length % CLASS_PALETTE.length;
  colorMap[className] = CLASS_PALETTE[idx];
  return colorMap[className];
}

export default function TimetableWidget() {
  const { state, actions } = useApp();
  const { theme, timetable } = state;

  const [mode, setMode] = useState('normal'); // normal | exam | lesson
  const [examData, setExamData] = useState(() => {
    try { return JSON.parse(localStorage.getItem('exam-timetable') || 'null'); } catch(e) { console.warn('[TimetableWidget] exam-timetable 파싱 실패:', e.message); return null; }
  });
  const [examForm, setExamForm] = useState({ name: '', type: '정기고사', startDate: '', endDate: '', days: [] });
  const [showExamForm, setShowExamForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [editValue, setEditValue] = useState({ subject: '', class: '', room: '' });
  const colorMap = {};

  // ── 수업 차시 기록 상태 ──────────────────────────────────
  const [lessonProgress, setLessonProgress] = useState(() => {
    try { return JSON.parse(localStorage.getItem('lesson-progress') || '{}'); } catch(e) { console.warn('[TimetableWidget] lesson-progress 파싱 실패:', e.message); return {}; }
  });
  // CSV import toast 상태
  const [csvToast, setCsvToast] = useState(null); // { type: 'success'|'error', msg: string }
  useEffect(() => {
    if (!csvToast) return;
    const t = setTimeout(() => setCsvToast(null), 4000);
    return () => clearTimeout(t);
  }, [csvToast]);
  const [lessonNote, setLessonNote] = useState({});    // 편집 중인 메모 {subject: text}
  const [editingLesson, setEditingLesson] = useState(null);  // 현재 편집 중인 과목
  const [editingTotal, setEditingTotal] = useState(null);   // 총 차시 입력 중인 과목
  const [totalInput, setTotalInput] = useState({});

  const saveLessonProgress = (updated) => {
    setLessonProgress(updated);
    localStorage.setItem('lesson-progress', JSON.stringify(updated));
  };

  const updateLessonNum = (subject, delta) => {
    const current = lessonProgress[subject] || { num: 1, note: '' };
    const newNum = Math.max(1, (current.num || 1) + delta);
    saveLessonProgress({ ...lessonProgress, [subject]: { ...current, num: newNum, lastDate: new Date().toLocaleDateString('ko-KR') } });
  };

  // 오늘 해당 과목의 교시 찾기
  const getTodayPeriodLabel = (subject) => {
    if (!todayKey) return '';
    const cell = (timetable?.[todayKey] || []).find(c => c.subject === subject);
    if (!cell) return '';
    return `${cell.period}교시`;
  };

  const saveLessonNote = (subject) => {
    const current = lessonProgress[subject] || { num: 1, note: '' };
    saveLessonProgress({ ...lessonProgress, [subject]: { ...current, note: lessonNote[subject] || '', lastDate: new Date().toLocaleDateString('ko-KR') } });
    setEditingLesson(null);
  };

  const saveTotal = (subject) => {
    const val = parseInt(totalInput[subject]);
    const current = lessonProgress[subject] || { num: 1, note: '' };
    saveLessonProgress({ ...lessonProgress, [subject]: { ...current, total: isNaN(val) || val < 1 ? undefined : val } });
    setEditingTotal(null);
  };

  const cd = (light, dark) => theme.darkMode ? dark : light;

  const todayIdx = new Date().getDay();
  const todayKey = ['', 'mon', 'tue', 'wed', 'thu', 'fri'][todayIdx] || null;

  const startEdit = (day, period, current) => {
    setEditing({ day, period });
    setEditValue({
      subject: current?.subject || '',
      class: current?.class || '',
      room: current?.room || ''
    });
  };

  const saveEdit = () => {
    if (!editing) return;
    const { day, period } = editing;
    const arr = [...(timetable[day] || [])];
    const idx = arr.findIndex(c => c.period === period);
    if (editValue.subject || editValue.class) {
      const entry = { period, ...editValue };
      if (idx >= 0) arr[idx] = entry;
      else arr.push(entry);
    } else {
      if (idx >= 0) arr.splice(idx, 1);
    }
    actions.setTimetable({ [day]: arr });
    setEditing(null);
  };

  const cancelEdit = () => setEditing(null);

  // 셀 삭제
  const deleteCell = () => {
    if (!editing) return;
    const { day, period } = editing;
    const arr = [...(timetable[day] || [])].filter(c => c.period !== period);
    actions.setTimetable({ [day]: arr });
    setEditing(null);
  };

  const getCell = (day, period) =>
    (timetable[day] || []).find(c => c.period === period);

  // 4A/4B 점심 판단: 해당 요일에 4A 수업이 있으면 4B가 점심, 4B 수업이 있으면 4A가 점심
  // 4A/4B 점심 판단:
  // - 4A에 수업 등록됨 → 4B는 점심 표시
  // - 4B에 수업 등록됨 → 4A는 점심 표시
  // - 둘 다 비어있으면 → 둘 다 빈 셀 (수업 등록 가능)
  const getLunchInfo = (day, rowId) => {
    const has4A = getCell(day, '4A');
    const has4B = getCell(day, '4B');

    if (rowId === '4A') {
      if (has4A) return null;              // 4A에 수업 있음 → 수업 표시
      return { isLunch: true };            // 수업 없으면 항상 점심 표시
    }
    if (rowId === '4B') {
      if (has4B) return null;              // 4B에 수업 있음 → 수업 표시
      return { isLunch: true };            // 수업 없으면 항상 점심 표시
    }
    return null;
  };

  return (
    <div style={{ fontFamily: "inherit", height: '100%', display: 'flex', flexDirection: 'column', position: 'relative' }}>
      {/* CSV import 토스트 알림 */}
      {csvToast && (
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, zIndex: 100,
          background: csvToast.type === 'success' ? '#d1fae5' : '#fee2e2',
          color: csvToast.type === 'success' ? '#065f46' : '#991b1b',
          borderRadius: 8, padding: '8px 12px', fontSize: 11, lineHeight: 1.5,
          boxShadow: '0 4px 12px rgba(0,0,0,0.1)', whiteSpace: 'pre-line'
        }}>
          {csvToast.msg}
        </div>
      )}
      {/* 모드 전환 탭 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 8 }}>
        <button onClick={() => setMode('normal')} style={{ flex: 1, padding: '4px', borderRadius: 6, fontSize: 11, fontWeight: mode === 'normal' ? 600 : 400, border: 'none', cursor: 'pointer', background: mode === 'normal' ? theme.accentColor : cd('#f3f4f6','#334155'), color: mode === 'normal' ? '#fff' : cd('#6b7280','#94a3b8') }}>📋 시간표</button>
        <button onClick={() => setMode('exam')} style={{ flex: 1, padding: '4px', borderRadius: 6, fontSize: 11, fontWeight: mode === 'exam' ? 600 : 400, border: 'none', cursor: 'pointer', background: mode === 'exam' ? '#ef4444' : cd('#f3f4f6','#334155'), color: mode === 'exam' ? '#fff' : cd('#6b7280','#94a3b8') }}>📝 고사</button>
        <button onClick={() => {
          const fi = document.createElement('input'); fi.type = 'file'; fi.accept = '.csv,.txt,.xls,.xlsx';
          fi.onchange = (ev) => {
            const file = ev.target.files[0];
            if (!file) return;
            const ext = file.name.split('.').pop().toLowerCase();
            const isExcel = ext === 'xls' || ext === 'xlsx';

            // 공통 파싱 로직: 2D 배열(allLines) → 시간표 객체
            const parseRows = (allLines) => {
              const DAY_NAMES = ['월','화','수','목','금'];
              let headerIdx = 0;
              for (let i = 0; i < Math.min(allLines.length, 20); i++) {
                const cols = allLines[i];
                if (cols.filter(c => DAY_NAMES.includes(String(c || '').trim())).length >= 3) { headerIdx = i; break; }
              }
              const header = (allLines[headerIdx] || []).map(c => String(c || '').trim());
              const dayColIdx = DAY_NAMES.map((d) => { const idx = header.indexOf(d); return idx >= 0 ? idx : DAY_NAMES.indexOf(d) + 1; });
              const dataLines = allLines.slice(headerIdx + 1);
              const PERIOD_IDS = [1, 2, 3, '4A', '4B', 5, 6, 7];
              const LUNCH_RE = /^(점심|점심시간|lunch)$/i;
              const parsePeriodId = (firstCol, fallbackIdx) => {
                const t = String(firstCol || '').trim().replace(/교시$/, '');
                if (/4A/i.test(t)) return '4A';
                if (/4B/i.test(t)) return '4B';
                const n = parseInt(t);
                if (!isNaN(n) && n >= 1 && n <= 9) return n;
                return PERIOD_IDS[fallbackIdx] !== undefined ? PERIOD_IDS[fallbackIdx] : fallbackIdx + 1;
              };
              const tt = { mon: [], tue: [], wed: [], thu: [], fri: [] };
              const days = ['mon','tue','wed','thu','fri'];
              const nonBlank = dataLines.filter(r => r.some(c => String(c || '').trim()));
              const periodNumCount = nonBlank.filter(r => /^\d+$/.test(String(r[0] || '').trim())).length;
              const isMultiRow = periodNumCount > 0 && nonBlank.length / periodNumCount >= 2;
              if (isMultiRow) {
                let pIdx = 0;
                for (let i = 0; i < dataLines.length; i += 3) {
                  const cols = (dataLines[i] || []).map(c => String(c || '').trim());
                  if (LUNCH_RE.test(cols[0])) continue;
                  const pid = parsePeriodId(cols[0], pIdx++);
                  days.forEach((d, di) => {
                    const s = (cols[dayColIdx[di]] || '').trim();
                    if (s && !LUNCH_RE.test(s)) tt[d].push({ period: pid, subject: s, class: '', room: '' });
                  });
                }
              } else {
                let pIdx = 0;
                nonBlank.forEach(row => {
                  const cols = row.map(c => String(c || '').trim());
                  if (LUNCH_RE.test(cols[0])) return;
                  const pid = parsePeriodId(cols[0], pIdx++);
                  days.forEach((d, di) => {
                    const s = (cols[dayColIdx[di]] || '').trim();
                    if (s && !LUNCH_RE.test(s)) tt[d].push({ period: pid, subject: s, class: '', room: '' });
                  });
                });
              }
              return { tt, days };
            };

            if (isExcel) {
              // Excel 파일 (xls/xlsx)
              const reader = new FileReader();
              reader.onload = async (r) => {
                try {
                  const XLSX = await import('xlsx');
                  const wb = XLSX.read(r.target.result, { type: 'array' });
                  const ws = wb.Sheets[wb.SheetNames[0]];
                  const allLines = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
                  const { tt, days } = parseRows(allLines);
                  actions.setTimetable(tt);
                  const maxPeriods = Math.max(...days.map(d => tt[d].length));
                  setCsvToast({ type: 'success', msg: `✅ 엑셀 시간표 적용 완료! (${maxPeriods}교시, ${file.name})` });
                } catch(e) {
                  console.warn('[TimetableWidget] Excel 파싱 오류:', e);
                  setCsvToast({ type: 'error', msg: `❌ 엑셀 오류: ${e.message}\n▸ 형식: 헤더(교시,월,화,수,목,금), 행=교시별 과목명` });
                }
              };
              reader.readAsArrayBuffer(file);
              return;
            }

            // CSV/TXT 파일
            const reader = new FileReader();
            reader.onload = (r) => {
              try {
                const text = r.target.result.replace(/^\uFEFF/, '').trim();
                const parseLine = line => line.split(',').map(c => c.trim().replace(/^"|"$/g, ''));
                const allLines = text.split(/\r?\n/).map(parseLine);
                const { tt, days } = parseRows(allLines);
                actions.setTimetable(tt);
                const maxPeriods = Math.max(...days.map(d => tt[d].length));
                setCsvToast({ type: 'success', msg: `✅ 시간표 적용 완료! (${maxPeriods}교시 인식)` });
              } catch(e) {
                console.warn('[TimetableWidget] CSV 파싱 오류:', e);
                setCsvToast({ type: 'error', msg: `❌ 파일 오류: ${e.message}\n▸ 형식: 헤더(교시,월,화,수,목,금), 행=교시별 과목명` });
              }
            };
            reader.readAsText(file, 'utf-8');
          };
          fi.click();
        }} style={{ padding: '4px 8px', borderRadius: 6, fontSize: 11, border: 'none', cursor: 'pointer', background: cd('#f3f4f6','#334155'), color: cd('#374151','#94a3b8') }}>📂 가져오기</button>
      </div>

      {/* 수업 차시 기록 모드 */}
      {mode === 'lesson' && (() => {
        // 전체 시간표에서 고유 과목 목록 추출
        const allSubjects = new Map();
        const dayKeys = ['mon','tue','wed','thu','fri'];
        dayKeys.forEach(day => {
          (timetable[day] || []).forEach(cell => {
            if (cell.subject) {
              const key = `${cell.subject}|${cell.class || ''}`;
              if (!allSubjects.has(key)) allSubjects.set(key, { subject: cell.subject, class: cell.class || '' });
            }
          });
        });
        const subjects = Array.from(allSubjects.values());

        // 오늘 수업 목록
        const todaySubjects = (timetable[todayKey] || [])
          .filter(c => c.subject)
          .map(c => c.subject);

        if (subjects.length === 0) return (
          <div style={{ textAlign: 'center', color: cd('#9ca3af','#64748b'), fontSize: 12, padding: '20px 0' }}>
            <div style={{ fontSize: 24, marginBottom: 8 }}>📋</div>
            시간표를 먼저 입력해 주세요
          </div>
        );

        return (
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {todaySubjects.length > 0 && (
              <div style={{ fontSize: 10, color: theme.accentColor, fontWeight: 600, marginBottom: 6 }}>
                ⚡ 오늘 수업
              </div>
            )}
            {subjects.map(({ subject, class: cls }) => {
              const progress = lessonProgress[subject] || { num: 1, note: '' };
              const isToday = todaySubjects.includes(subject);
              const isEditing = editingLesson === subject;
              return (
                <div key={subject + cls} style={{
                  border: `1px solid ${isToday ? theme.accentColor + '60' : cd('#f3f4f6','#334155')}`,
                  borderRadius: 8, marginBottom: 6, padding: '8px 10px',
                  background: isToday ? theme.accentColor + '0a' : cd('#fafafa','#1e293b')
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                    <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: cd('#1f2937','#e2e8f0') }}>
                      {subject} {cls && <span style={{ fontSize: 10, color: cd('#9ca3af','#64748b'), fontWeight: 400 }}>{cls}</span>}
                    </span>
                    {/* 차시 조절 */}
                    <button onClick={() => updateLessonNum(subject, -1)} style={{ background: cd('#f3f4f6','#334155'), border: 'none', borderRadius: 4, width: 20, height: 20, cursor: 'pointer', fontSize: 12, lineHeight: 1, color: cd('#374151','#cbd5e1') }}>−</button>
                    {/* 현재차시 / 총차시 */}
                    <span style={{ fontSize: 12, fontWeight: 700, color: theme.accentColor, textAlign: 'center', minWidth: 40 }}>
                      {progress.num || 1}
                      {editingTotal === subject ? (
                        <span>/
                          <input autoFocus value={totalInput[subject] ?? (progress.total || '')} onChange={e => setTotalInput(t => ({...t, [subject]: e.target.value}))}
                            onBlur={() => saveTotal(subject)} onKeyDown={e => { if(e.key==='Enter') saveTotal(subject); if(e.key==='Escape') setEditingTotal(null); }}
                            style={{ width: 28, border: 'none', borderBottom: `1px solid ${theme.accentColor}`, background: 'transparent', color: theme.accentColor, fontSize: 12, fontWeight: 700, outline: 'none', textAlign: 'center' }}
                          />
                        </span>
                      ) : (
                        <span onClick={() => { setEditingTotal(subject); setTotalInput(t => ({...t, [subject]: progress.total || ''})); }} style={{ cursor: 'pointer' }} title="총 차시 설정">
                          /{progress.total ? progress.total : <span style={{ fontSize: 10, color: cd('#d1d5db','#475569') }}>?</span>}
                        </span>
                      )}
                      <span style={{ fontSize: 9, fontWeight: 400 }}>차시</span>
                    </span>
                    <button onClick={() => updateLessonNum(subject, 1)} style={{ background: theme.accentColor, border: 'none', borderRadius: 4, width: 20, height: 20, cursor: 'pointer', fontSize: 12, lineHeight: 1, color: '#fff' }}>+</button>
                    <button onClick={() => {
                      const isNowEditing = editingLesson === subject;
                      setEditingLesson(isNowEditing ? null : subject);
                      if (!isNowEditing) {
                        // 오늘 날짜 + 교시 자동 입력
                        const today = new Date().toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' });
                        const periodLabel = getTodayPeriodLabel(subject);
                        const prefix = `[${today}${periodLabel ? ' ' + periodLabel : ''}] `;
                        setLessonNote(n => ({ ...n, [subject]: prefix }));
                      }
                    }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: cd('#9ca3af','#64748b'), padding: '0 2px' }}>
                      ✏️
                    </button>
                  </div>
                  {/* 진행률 바 */}
                  {progress.total > 0 && (
                    <div style={{ height: 3, background: cd('#f3f4f6','#334155'), borderRadius: 2, marginBottom: 4, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${Math.min(100, Math.round(((progress.num||1)/progress.total)*100))}%`, background: theme.accentColor, borderRadius: 2, transition: 'width 0.3s' }} />
                    </div>
                  )}
                  {progress.note && !isEditing && (
                    <div style={{ fontSize: 11, color: cd('#6b7280','#94a3b8'), paddingTop: 4, borderTop: `0.5px solid ${cd('#e5e7eb','#334155')}` }}>
                      📝 {progress.note}
                    </div>
                  )}
                  {isEditing && (
                    <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                      <input
                        autoFocus
                        value={lessonNote[subject] || ''}
                        onChange={e => setLessonNote(n => ({ ...n, [subject]: e.target.value }))}
                        onKeyDown={e => e.key === 'Enter' && saveLessonNote(subject)}
                        placeholder="수업 메모 (진도, 과제 등)"
                        style={{ flex: 1, border: `1px solid ${cd('#e5e7eb','#475569')}`, borderRadius: 6, padding: '4px 8px', fontSize: 11, outline: 'none', background: cd('#fff','#1e293b'), color: cd('#1f2937','#e2e8f0') }}
                      />
                      <button onClick={() => saveLessonNote(subject)} style={{ background: theme.accentColor, border: 'none', borderRadius: 6, padding: '4px 8px', color: '#fff', fontSize: 11, cursor: 'pointer' }}>저장</button>
                    </div>
                  )}
                  {progress.lastDate && (
                    <div style={{ fontSize: 10, color: cd('#9ca3af','#64748b'), marginTop: 2 }}>마지막 수정: {progress.lastDate}</div>
                  )}
                </div>
              );
            })}
          </div>
        );
      })()}

      {/* 고사 모드 */}
      {mode === 'exam' && (
        <div style={{ flex: 1, overflow: 'auto' }}>
          {!examData && !showExamForm && (
            <div style={{ textAlign: 'center', padding: '16px 0' }}>
              <div style={{ color: cd('#9ca3af','#64748b'), fontSize: 11, marginBottom: 8 }}>등록된 고사 시간표가 없습니다</div>
              <button onClick={() => setShowExamForm(true)} style={{ background: '#ef4444', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 14px', fontSize: 11, cursor: 'pointer' }}>📝 고사 시간표 등록</button>
            </div>
          )}
          {showExamForm && (
            <div style={{ fontSize: 11 }}>
              <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
                {['정기고사', '모의고사'].map(t => (
                  <button key={t} onClick={() => setExamForm({ ...examForm, type: t })} style={{ flex: 1, padding: '3px', borderRadius: 5, fontSize: 10, border: 'none', cursor: 'pointer', background: examForm.type === t ? '#ef4444' : cd('#f3f4f6','#334155'), color: examForm.type === t ? '#fff' : cd('#6b7280','#94a3b8') }}>{t}</button>
                ))}
              </div>
              <input placeholder="시험명 (예: 1학기 중간고사)" value={examForm.name} onChange={e => setExamForm({ ...examForm, name: e.target.value })}
                style={{ width: '100%', border: `1px solid ${cd('#e5e7eb','#475569')}`, borderRadius: 5, padding: '4px 6px', fontSize: 11, marginBottom: 3, outline: 'none', fontFamily: 'inherit', background: cd('#fff','#1e293b'), color: cd('#1f2937','#e2e8f0') }} />
              <div style={{ display: 'flex', gap: 4, marginBottom: 3 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 9, color: cd('#9ca3af','#64748b'), marginBottom: 2 }}>시작일</div>
                  <input type="date" value={examForm.startDate} onChange={e => setExamForm({ ...examForm, startDate: e.target.value })}
                    style={{ width: '100%', border: `1px solid ${cd('#e5e7eb','#475569')}`, borderRadius: 5, padding: '3px 4px', fontSize: 10, outline: 'none', background: cd('#fff','#1e293b'), color: cd('#1f2937','#e2e8f0') }} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 9, color: cd('#9ca3af','#64748b'), marginBottom: 2 }}>종료일</div>
                  <input type="date" value={examForm.endDate} onChange={e => setExamForm({ ...examForm, endDate: e.target.value })}
                    style={{ width: '100%', border: `1px solid ${cd('#e5e7eb','#475569')}`, borderRadius: 5, padding: '3px 4px', fontSize: 10, outline: 'none', background: cd('#fff','#1e293b'), color: cd('#1f2937','#e2e8f0') }} />
                </div>
              </div>
              <div style={{ fontSize: 9, color: cd('#9ca3af','#64748b'), marginBottom: 2 }}>교시별 과목 / 감독 교실</div>
              {(examForm.days.length === 0 ? [{ periods: [{ subject: '', room: '' }] }] : examForm.days).map((day, di) => (
                <div key={di} style={{ marginBottom: 4, background: cd('#f9fafb','#1e293b'), borderRadius: 6, padding: 4 }}>
                  <div style={{ fontSize: 9, fontWeight: 600, color: cd('#6b7280','#94a3b8'), marginBottom: 2 }}>{di + 1}일차</div>
                  {day.periods.map((p, pi) => (
                    <div key={pi} style={{ display: 'flex', gap: 3, marginBottom: 2 }}>
                      <span style={{ fontSize: 9, color: cd('#9ca3af','#64748b'), width: 28, flexShrink: 0, lineHeight: '22px' }}>{pi+1}교시</span>
                      <input placeholder="과목" value={p.subject} onChange={e => {
                        const days = [...(examForm.days.length ? examForm.days : [{ periods: [{ subject: '', room: '' }] }])];
                        if (!days[di]) days[di] = { periods: [{ subject: '', room: '' }] };
                        days[di].periods[pi] = { ...p, subject: e.target.value };
                        setExamForm({ ...examForm, days });
                      }} style={{ flex: 1, border: `1px solid ${cd('#e5e7eb','#475569')}`, borderRadius: 4, padding: '2px 4px', fontSize: 10, outline: 'none', background: cd('#fff','#0f172a'), color: cd('#1f2937','#e2e8f0') }} />
                      <input placeholder="교실" value={p.room} onChange={e => {
                        const days = [...(examForm.days.length ? examForm.days : [{ periods: [{ subject: '', room: '' }] }])];
                        if (!days[di]) days[di] = { periods: [{ subject: '', room: '' }] };
                        days[di].periods[pi] = { ...p, room: e.target.value };
                        setExamForm({ ...examForm, days });
                      }} style={{ width: 40, border: `1px solid ${cd('#e5e7eb','#475569')}`, borderRadius: 4, padding: '2px 4px', fontSize: 10, outline: 'none', background: cd('#fff','#0f172a'), color: cd('#1f2937','#e2e8f0') }} />
                    </div>
                  ))}
                  <button onClick={() => {
                    const days = [...(examForm.days.length ? examForm.days : [{ periods: [{ subject: '', room: '' }] }])];
                    if (!days[di]) days[di] = { periods: [] };
                    days[di].periods.push({ subject: '', room: '' });
                    setExamForm({ ...examForm, days });
                  }} style={{ width: '100%', background: cd('#e5e7eb','#334155'), border: 'none', borderRadius: 4, padding: '2px', fontSize: 9, cursor: 'pointer', color: cd('#6b7280','#94a3b8') }}>+ 교시</button>
                </div>
              ))}
              <button onClick={() => {
                const days = [...(examForm.days.length ? examForm.days : [{ periods: [{ subject: '', room: '' }] }])];
                days.push({ periods: [{ subject: '', room: '' }] });
                setExamForm({ ...examForm, days });
              }} style={{ width: '100%', background: cd('#f3f4f6','#334155'), border: 'none', borderRadius: 5, padding: '3px', fontSize: 10, cursor: 'pointer', color: cd('#6b7280','#94a3b8'), marginBottom: 4 }}>+ 일차 추가</button>
              <div style={{ display: 'flex', gap: 4 }}>
                <button onClick={() => {
                  const data = { ...examForm, days: examForm.days.length ? examForm.days : [{ periods: [{ subject: '', room: '' }] }] };
                  setExamData(data); localStorage.setItem('exam-timetable', JSON.stringify(data)); setShowExamForm(false);
                }} style={{ flex: 1, background: '#ef4444', color: '#fff', border: 'none', borderRadius: 5, padding: '5px', fontSize: 11, cursor: 'pointer' }}>저장</button>
                <button onClick={() => setShowExamForm(false)} style={{ flex: 1, background: '#e5e7eb', border: 'none', borderRadius: 5, padding: '5px', fontSize: 11, cursor: 'pointer', color: '#6b7280' }}>취소</button>
              </div>
            </div>
          )}
          {examData && !showExamForm && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <div>
                  <span style={{ fontSize: 10, background: examData.type === '정기고사' ? '#fee2e2' : '#dbeafe', color: examData.type === '정기고사' ? '#dc2626' : '#1e40af', padding: '1px 5px', borderRadius: 4, fontWeight: 600 }}>{examData.type}</span>
                  <span style={{ fontSize: 12, fontWeight: 600, marginLeft: 6 }}>{examData.name}</span>
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button onClick={() => setShowExamForm(true)} style={{ background: cd('#f3f4f6','#334155'), border: 'none', borderRadius: 4, padding: '2px 6px', fontSize: 9, cursor: 'pointer', color: cd('#374151','#cbd5e1') }}>수정</button>
                  <button onClick={() => { setExamData(null); localStorage.removeItem('exam-timetable'); }} style={{ background: '#fee2e2', border: 'none', borderRadius: 4, padding: '2px 6px', fontSize: 9, cursor: 'pointer', color: '#dc2626' }}>삭제</button>
                </div>
              </div>
              <div style={{ fontSize: 10, color: cd('#6b7280','#94a3b8'), marginBottom: 6 }}>{examData.startDate} ~ {examData.endDate}</div>
              {examData.days?.map((day, di) => (
                <div key={di} style={{ marginBottom: 6 }}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: cd('#374151','#cbd5e1'), marginBottom: 2 }}>{di+1}일차</div>
                  {day.periods?.filter(p => p.subject).map((p, pi) => (
                    <div key={pi} style={{ display: 'flex', gap: 6, padding: '2px 0', fontSize: 11 }}>
                      <span style={{ color: cd('#9ca3af','#64748b'), width: 30 }}>{pi+1}교시</span>
                      <span style={{ fontWeight: 500 }}>{p.subject}</span>
                      {p.room && <span style={{ color: cd('#9ca3af','#64748b') }}>({p.room})</span>}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 일반 시간표 — 재디자인 */}
      {mode === 'normal' && (() => {
        const editingCell = editing ? getCell(editing.day, editing.period) : null;
        const editingRow = editing ? TIMETABLE_ROWS.find(r => r.id === editing.period) : null;
        const editingDay = editing ? DAYS.find(d => d.key === editing.day) : null;

        return (
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {/* 요일 헤더 */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '34px repeat(5, 1fr)',
            gap: 4,
            padding: '2px 0 4px',
            borderBottom: `1px solid ${cd('#f1f5f9','#334155')}`
          }}>
            <div style={{ fontSize: 9, color: cd('#9ca3af','#64748b'), fontWeight: 600, textAlign: 'center', letterSpacing: '0.5px' }}>교시</div>
            {DAYS.map(d => {
              const isToday = d.key === todayKey;
              return (
                <div key={d.key} style={{
                  textAlign: 'center',
                  position: 'relative',
                  padding: '2px 0'
                }}>
                  <div style={{
                    fontSize: 12,
                    fontWeight: isToday ? 800 : 600,
                    color: isToday ? theme.accentColor : cd('#475569','#cbd5e1'),
                    letterSpacing: '0.5px'
                  }}>{d.label}</div>
                  {isToday && (
                    <div style={{
                      width: 16, height: 2, margin: '2px auto 0',
                      background: theme.accentColor, borderRadius: 2
                    }} />
                  )}
                </div>
              );
            })}
          </div>

          {/* 수업 그리드 */}
          <div style={{
            flex: 1, minHeight: 0,
            display: 'grid',
            gridTemplateRows: `repeat(${TIMETABLE_ROWS.length}, 1fr)`,
            gap: 3
          }}>
            {TIMETABLE_ROWS.map(row => (
              <div key={row.id} style={{
                display: 'grid',
                gridTemplateColumns: '34px repeat(5, 1fr)',
                gap: 4,
                minHeight: 0
              }}>
                {/* 교시 레이블 */}
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 700,
                  color: cd('#94a3b8','#64748b')
                }}>{row.label}</div>

                {DAYS.map(d => {
                  const cell = getCell(d.key, row.id);
                  const lunchInfo = row.type === 'split' ? getLunchInfo(d.key, row.id) : null;
                  const isToday = d.key === todayKey;
                  // ⚠️ class가 비어있으면 subject 기준으로 팔레트 할당 (팔레트는 항상 객체)
                  const paletteKey = cell ? (cell.class || cell.subject || '_empty') : null;
                  const palette = cell ? (getClassColor(paletteKey, colorMap) || CLASS_PALETTE[0]) : null;

                  // 점심 표시
                  if (lunchInfo?.isLunch && !cell) {
                    return (
                      <div key={d.key}
                        onClick={() => startEdit(d.key, row.id, null)}
                        style={{
                          borderRadius: 8,
                          background: cd('linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)', 'linear-gradient(135deg, #422006 0%, #78350f 100%)'),
                          border: `1px dashed ${cd('#fcd34d','#92400e')}`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3,
                          cursor: 'pointer', minHeight: 0,
                          opacity: isToday ? 1 : 0.85
                        }}
                      >
                        <span style={{ fontSize: 10 }}>🍱</span>
                        <span style={{ fontSize: 9, fontWeight: 700, color: cd('#a16207','#fbbf24'), letterSpacing: '0.3px' }}>점심</span>
                      </div>
                    );
                  }

                  // 셀 스타일
                  const cellBg = palette
                    ? `linear-gradient(135deg, ${palette.bg} 0%, ${palette.bg}dd 100%)`
                    : (isToday ? theme.accentColor + '0c' : cd('#fafbfc','#161f2e'));
                  const cellBorder = palette
                    ? `${palette.accent}40`
                    : (isToday ? theme.accentColor + '25' : cd('#f1f5f9','#1e293b'));
                  const accent = palette?.accent || theme.accentColor;

                  return (
                    <div key={d.key}
                      onClick={() => startEdit(d.key, row.id, cell)}
                      style={{
                        position: 'relative',
                        borderRadius: 8,
                        background: cellBg,
                        border: `1px solid ${cellBorder}`,
                        display: 'flex', flexDirection: 'column',
                        alignItems: 'center', justifyContent: 'center',
                        cursor: 'pointer', padding: '3px 4px',
                        overflow: 'hidden',
                        transition: 'transform 0.12s, box-shadow 0.12s',
                        boxShadow: cell ? `0 1px 3px ${accent}20` : 'none'
                      }}
                      onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = cell ? `0 3px 8px ${accent}35` : `0 2px 4px rgba(0,0,0,0.06)`; }}
                      onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = cell ? `0 1px 3px ${accent}20` : 'none'; }}
                    >
                      {cell ? (
                        <>
                          {/* 좌측 액센트 바 */}
                          <div style={{
                            position: 'absolute', left: 0, top: '20%', bottom: '20%',
                            width: 2, borderRadius: 2, background: accent
                          }} />
                          {cell.class && (
                            <div style={{
                              fontSize: 10, fontWeight: 800,
                              color: accent,
                              lineHeight: 1.2, width: '100%',
                              textAlign: 'center',
                              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                            }}>{cell.class}</div>
                          )}
                          {cell.subject && (
                            <div style={{
                              fontSize: 9, fontWeight: 500,
                              color: cell.class ? cd('#475569','#e2e8f0') : accent,
                              lineHeight: 1.2, width: '100%', marginTop: 1,
                              textAlign: 'center',
                              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                            }}>{cell.subject}</div>
                          )}
                        </>
                      ) : (
                        <div style={{
                          fontSize: 14, lineHeight: 1,
                          color: cd('#e2e8f0','#334155'),
                          fontWeight: 300, userSelect: 'none'
                        }}>+</div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          {/* 인라인 편집 팝업 — Portal */}
          {editing && ReactDOM.createPortal(
            <>
              <div onClick={cancelEdit} style={{
                position: 'fixed', inset: 0, zIndex: 9998,
                background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(2px)'
              }} />
              <div style={{
                position: 'fixed', zIndex: 9999,
                left: '50%', top: '50%', transform: 'translate(-50%, -50%)',
                width: 260,
                background: cd('#fff','#1e293b'),
                border: `1px solid ${cd('#e5e7eb','#475569')}`,
                borderRadius: 14,
                padding: 16,
                boxShadow: '0 20px 50px rgba(0,0,0,0.35)'
              }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: cd('#1f2937','#e2e8f0'), marginBottom: 12 }}>
                  📚 {editingDay?.label}요일 {editingRow?.label}{editingRow?.type === 'split' ? '' : '교시'}
                </div>
                {editingRow?.type === 'split' && (
                  <div style={{ fontSize: 11, color: cd('#92400e','#fbbf24'), background: cd('#fef9c3','#422006'), borderRadius: 8, padding: '6px 10px', marginBottom: 10 }}>
                    💡 수업 등록 시 반대편이 자동으로 점심이 됩니다
                  </div>
                )}
                {[
                  { key: 'subject', placeholder: '예: 화학I', label: '과목' },
                  { key: 'class', placeholder: '예: 2-3', label: '학급' },
                  { key: 'room', placeholder: '예: 과학실1', label: '장소' }
                ].map(f => (
                  <div key={f.key} style={{ marginBottom: 8 }}>
                    <div style={{ fontSize: 10, color: cd('#9ca3af','#64748b'), marginBottom: 3, fontWeight: 600 }}>{f.label}</div>
                    <input
                      value={editValue[f.key]}
                      onChange={e => setEditValue({ ...editValue, [f.key]: e.target.value })}
                      placeholder={f.placeholder}
                      style={{
                        width: '100%', boxSizing: 'border-box',
                        border: `1px solid ${cd('#e5e7eb','#475569')}`, borderRadius: 8,
                        padding: '8px 10px', fontSize: 13, outline: 'none', fontFamily: 'inherit',
                        background: cd('#fff','#0f172a'), color: cd('#1f2937','#e2e8f0')
                      }}
                      onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') cancelEdit(); }}
                      autoFocus={f.key === 'subject'}
                    />
                  </div>
                ))}
                <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                  <button onClick={saveEdit} style={{
                    flex: 1, background: theme.accentColor, color: '#fff',
                    border: 'none', borderRadius: 8, padding: '9px', fontSize: 12, cursor: 'pointer', fontWeight: 700
                  }}>저장</button>
                  <button onClick={cancelEdit} style={{
                    flex: 1, background: cd('#f3f4f6','#334155'), color: cd('#6b7280','#94a3b8'),
                    border: 'none', borderRadius: 8, padding: '9px', fontSize: 12, cursor: 'pointer'
                  }}>취소</button>
                  {editingCell && <button onClick={deleteCell}
                    style={{ background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: 8, padding: '9px 12px', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>
                    삭제
                  </button>}
                </div>
              </div>
            </>,
            document.body
          )}
        </div>
        );
      })()}
    </div>
  );
}
