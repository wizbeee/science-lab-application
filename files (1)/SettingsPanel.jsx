// ============================================================
// SettingsPanel.jsx - 설정 패널 (탭 구조)
// 색상 커스텀, Google/MS 연동, AI, 일과 등 전체 설정
// ============================================================

import React, { useState } from 'react';
import { useApp } from '../AppContext';

const THEME_PRESETS = [
  { id: 'pink',   label: '핑크', accent: '#e879a0', bg: '#fff5f7', border: '#f0d0da' },
  { id: 'blue',   label: '파랑', accent: '#3b82f6', bg: '#eff6ff', border: '#bfdbfe' },
  { id: 'green',  label: '초록', accent: '#10b981', bg: '#f0fdf4', border: '#bbf7d0' },
  { id: 'purple', label: '보라', accent: '#8b5cf6', bg: '#faf5ff', border: '#ddd6fe' },
  { id: 'orange', label: '오렌지', accent: '#f97316', bg: '#fff7ed', border: '#fed7aa' },
  { id: 'dark',   label: '다크', accent: '#6366f1', bg: '#1e1e2e', border: '#313244' }
];

const TABS = [
  { id: 'design',   label: '🎨 디자인', },
  { id: 'schedule', label: '🕐 일과' },
  { id: 'google',   label: '🔗 Google' },
  { id: 'microsoft',label: '🪟 Microsoft' },
  { id: 'ai',       label: '✦ AI Plus' },
  { id: 'noticeboard', label: '📡 전광판' },
  { id: 'notifications', label: '🔔 알림' },
  { id: 'community',label: '👥 커뮤니티' },
  { id: 'weather',  label: '🌤️ 날씨' },
  { id: 'meal',     label: '🍽️ 급식' },
  { id: 'profile',  label: '👤 내 정보' }
];

export default function SettingsPanel() {
  const { state, actions } = useApp();
  const { theme, schedule, google, microsoft, ai, noticeboard, notifications, community, weather, meal, user } = state;

  const [activeTab, setActiveTab] = useState(state.ui.settingsTab || 'design');
  const [customAccent, setCustomAccent] = useState(theme.accentColor);
  const [customBg, setCustomBg] = useState(theme.bgColor);

  const close = () => actions.setUI({ settingsOpen: false });

  const inputStyle = {
    width: '100%', border: '1.5px solid #e5e7eb', borderRadius: 9,
    padding: '10px 14px', fontSize: 14, outline: 'none', fontFamily: 'inherit',
    color: '#1f2937', background: '#fff'
  };

  const toggleStyle = (on) => ({
    width: 44, height: 24, borderRadius: 12, cursor: 'pointer',
    background: on ? theme.accentColor : '#d1d5db',
    position: 'relative', border: 'none', transition: 'background 0.2s', flexShrink: 0
  });

  const Toggle = ({ value, onChange }) => (
    <button onClick={() => onChange(!value)} style={toggleStyle(value)}>
      <div style={{
        width: 18, height: 18, borderRadius: '50%', background: '#fff',
        position: 'absolute', top: 3, left: value ? 23 : 3,
        transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
      }} />
    </button>
  );

  const Row = ({ label, desc, children }) => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderBottom: '0.5px solid #f3f4f6' }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 500, color: '#1f2937' }}>{label}</div>
        {desc && <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>{desc}</div>}
      </div>
      <div style={{ marginLeft: 16 }}>{children}</div>
    </div>
  );

  const SectionTitle = ({ children }) => (
    <div style={{ fontSize: 12, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.8px', margin: '20px 0 8px' }}>
      {children}
    </div>
  );

  // ── 탭별 컨텐츠 ─────────────────────────────────────────
  const renderTabContent = () => {
    switch (activeTab) {

      case 'design': return (
        <div>
          <SectionTitle>테마 프리셋</SectionTitle>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 20 }}>
            {THEME_PRESETS.map(t => (
              <button key={t.id} onClick={() => {
                actions.setTheme({ preset: t.id, accentColor: t.accent, bgColor: t.bg, borderColor: t.border, darkMode: t.id === 'dark' });
                setCustomAccent(t.accent); setCustomBg(t.bg);
              }} style={{
                border: `2px solid ${theme.preset === t.id ? t.accent : '#e5e7eb'}`,
                borderRadius: 12, padding: '12px 6px', background: t.bg,
                cursor: 'pointer', textAlign: 'center'
              }}>
                <div style={{ width: 24, height: 24, borderRadius: '50%', background: t.accent, margin: '0 auto 6px' }} />
                <div style={{ fontSize: 12, fontWeight: 600, color: t.id === 'dark' ? '#fff' : '#1f2937' }}>{t.label}</div>
              </button>
            ))}
          </div>

          <SectionTitle>직접 색상 설정</SectionTitle>
          <Row label="강조 색상" desc="버튼, 헤더, 현재 교시 표시">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="color" value={customAccent}
                onChange={e => { setCustomAccent(e.target.value); actions.setTheme({ accentColor: e.target.value, preset: 'custom' }); }}
                style={{ width: 40, height: 40, border: 'none', borderRadius: 8, cursor: 'pointer', padding: 0 }}
              />
              <span style={{ fontSize: 13, color: '#6b7280' }}>{customAccent}</span>
            </div>
          </Row>
          <Row label="배경 색상" desc="전체 바탕화면 색상">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="color" value={customBg}
                onChange={e => { setCustomBg(e.target.value); actions.setTheme({ bgColor: e.target.value, preset: 'custom' }); }}
                style={{ width: 40, height: 40, border: 'none', borderRadius: 8, cursor: 'pointer', padding: 0 }}
              />
              <span style={{ fontSize: 13, color: '#6b7280' }}>{customBg}</span>
            </div>
          </Row>
          <Row label="다크 모드">
            <Toggle value={theme.darkMode} onChange={v => actions.setTheme({ darkMode: v })} />
          </Row>
        </div>
      );

      case 'schedule': return (
        <div>
          <SectionTitle>근무 시간</SectionTitle>
          <Row label="출근 시각">
            <input type="time" value={schedule.workStart}
              onChange={e => actions.setSchedule({ workStart: e.target.value })}
              style={{ ...inputStyle, width: 'auto' }}
            />
          </Row>
          <Row label="퇴근 시각">
            <input type="time" value={schedule.workEnd}
              onChange={e => actions.setSchedule({ workEnd: e.target.value })}
              style={{ ...inputStyle, width: 'auto' }}
            />
          </Row>

          <SectionTitle>교시 시간표</SectionTitle>
          <div style={{ background: '#f9fafb', borderRadius: 12, overflow: 'hidden' }}>
            {schedule.periods.map((p, idx) => (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', borderBottom: '0.5px solid #e5e7eb' }}>
                <div style={{ flex: 1, fontSize: 13, fontWeight: 500, color: '#374151' }}>{p.name}</div>
                <input type="time" value={p.start}
                  onChange={e => {
                    const newPeriods = [...schedule.periods];
                    newPeriods[idx] = { ...p, start: e.target.value };
                    actions.setSchedule({ periods: newPeriods });
                  }}
                  style={{ ...inputStyle, width: 'auto', padding: '5px 8px', fontSize: 13 }}
                />
                <span style={{ color: '#9ca3af' }}>~</span>
                <input type="time" value={p.end}
                  onChange={e => {
                    const newPeriods = [...schedule.periods];
                    newPeriods[idx] = { ...p, end: e.target.value };
                    actions.setSchedule({ periods: newPeriods });
                  }}
                  style={{ ...inputStyle, width: 'auto', padding: '5px 8px', fontSize: 13 }}
                />
              </div>
            ))}
          </div>
        </div>
      );

      case 'google': return (
        <div>
          <SectionTitle>계정 연결</SectionTitle>
          {!google.connected ? (
            <button onClick={() => actions.setGoogle({ connected: true, email: 'example@gmail.com' })}
              style={{ width: '100%', background: '#4285f4', color: '#fff', border: 'none', borderRadius: 10, padding: '13px', fontSize: 15, fontWeight: 600, cursor: 'pointer' }}>
              Google 로그인
            </button>
          ) : (
            <div>
              <div style={{ background: '#d1fae5', borderRadius: 10, padding: '12px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontWeight: 600, color: '#065f46' }}>✅ 연결됨</div>
                  <div style={{ fontSize: 13, color: '#6b7280' }}>{google.email}</div>
                </div>
                <button onClick={() => actions.setGoogle({ connected: false, email: '', accessToken: null })}
                  style={{ background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: 8, padding: '8px 14px', cursor: 'pointer', fontSize: 13 }}>
                  연결 해제
                </button>
              </div>
              <SectionTitle>서비스 선택</SectionTitle>
              {[
                { key: 'calendar', label: 'Google Calendar', emoji: '📅' },
                { key: 'gmail',    label: 'Gmail', emoji: '📧' },
                { key: 'drive',    label: 'Google Drive', emoji: '📁' },
                { key: 'classroom',label: 'Google Classroom', emoji: '🎓' },
                { key: 'meet',     label: 'Google Meet', emoji: '📹' },
                { key: 'tasks',    label: 'Google Tasks', emoji: '✅' }
              ].map(s => (
                <Row key={s.key} label={`${s.emoji} ${s.label}`}>
                  <Toggle value={google.services?.[s.key] ?? true}
                    onChange={v => actions.setGoogle({ services: { ...google.services, [s.key]: v } })} />
                </Row>
              ))}
            </div>
          )}
        </div>
      );

      case 'microsoft': return (
        <div>
          <SectionTitle>계정 연결</SectionTitle>
          {!microsoft.connected ? (
            <button onClick={() => actions.setMicrosoft({ connected: true, email: 'example@outlook.com' })}
              style={{ width: '100%', background: '#00a1f1', color: '#fff', border: 'none', borderRadius: 10, padding: '13px', fontSize: 15, fontWeight: 600, cursor: 'pointer' }}>
              🪟 Microsoft 로그인
            </button>
          ) : (
            <div>
              <div style={{ background: '#dbeafe', borderRadius: 10, padding: '12px 16px', marginBottom: 16 }}>
                <div style={{ fontWeight: 600, color: '#1e40af' }}>✅ 연결됨</div>
                <div style={{ fontSize: 13, color: '#6b7280' }}>{microsoft.email}</div>
              </div>
              {[
                { key: 'outlook', label: 'Outlook 메일·캘린더', emoji: '📮' },
                { key: 'onedrive', label: 'OneDrive', emoji: '💾' },
                { key: 'teams', label: 'Teams', emoji: '💬' }
              ].map(s => (
                <Row key={s.key} label={`${s.emoji} ${s.label}`}>
                  <Toggle value={microsoft.services?.[s.key] ?? true}
                    onChange={v => actions.setMicrosoft({ services: { ...microsoft.services, [s.key]: v } })} />
                </Row>
              ))}
            </div>
          )}
        </div>
      );

      case 'ai': return (
        <div>
          <SectionTitle>AI 기능 활성화</SectionTitle>
          <Row label="AI Plus 기능 사용" desc="API 키가 필요합니다">
            <Toggle value={ai.enabled} onChange={v => actions.setAI({ enabled: v })} />
          </Row>
          {ai.enabled && (
            <>
              <SectionTitle>AI 제공자 선택</SectionTitle>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 16 }}>
                {[
                  { id: 'claude', label: 'Claude', color: '#d97706' },
                  { id: 'openai', label: 'GPT-4o', color: '#10b981' },
                  { id: 'gemini', label: 'Gemini', color: '#4285f4' }
                ].map(p => (
                  <button key={p.id} onClick={() => actions.setAI({ provider: p.id })}
                    style={{
                      border: `2px solid ${ai.provider === p.id ? p.color : '#e5e7eb'}`,
                      borderRadius: 10, padding: '12px 8px', background: ai.provider === p.id ? p.color + '15' : '#fff',
                      cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#1f2937'
                    }}>
                    {p.label}
                  </button>
                ))}
              </div>
              <SectionTitle>API 키</SectionTitle>
              <input type="password" placeholder="API 키를 입력하세요"
                value={ai.apiKey}
                onChange={e => actions.setAI({ apiKey: e.target.value })}
                style={inputStyle}
              />
              <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 6 }}>
                🔒 API 키는 이 기기에만 암호화하여 저장됩니다
              </div>
              <SectionTitle>사용 가능한 AI 기능</SectionTitle>
              {['기안문 초안 작성', '수업·행사 계획안 생성', '아이디어 추천', '메일·공문 초안', '세특 문장 생성', '문서 요약', '음성 입력', '스크린샷 분석'].map(f => (
                <div key={f} style={{ padding: '7px 0', fontSize: 13, color: '#374151', borderBottom: '0.5px solid #f9fafb' }}>
                  ✦ {f}
                </div>
              ))}
            </>
          )}
        </div>
      );

      case 'notifications': return (
        <div>
          <SectionTitle>알림 설정</SectionTitle>
          {[
            { key: 'classReminder', label: '수업 시작 5분 전 알림' },
            { key: 'scheduleAlert', label: '일정 알림' },
            { key: 'mailAlert',     label: '메일 수신 알림' },
            { key: 'communityAlert',label: '커뮤니티 공지 알림' },
            { key: 'silentDuringClass', label: '수업 중 무음 모드', desc: '시간표 기준 자동 전환' },
            { key: 'soundEnabled',  label: '알림 소리' }
          ].map(n => (
            <Row key={n.key} label={n.label} desc={n.desc}>
              <Toggle value={notifications[n.key]}
                onChange={v => actions.setNotifications({ [n.key]: v })} />
            </Row>
          ))}
        </div>
      );

      case 'noticeboard': return (
        <div>
          <SectionTitle>전광판 설정</SectionTitle>
          <Row label="전광판 사용">
            <Toggle value={noticeboard.enabled} onChange={v => actions.setUI({ noticeboard: { ...noticeboard, enabled: v } })} />
          </Row>
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: '#374151', marginBottom: 6 }}>Google Sheets URL</div>
            <input placeholder="https://docs.google.com/spreadsheets/..."
              value={noticeboard.googleSheetUrl}
              onChange={e => actions.setUI({ noticeboard: { ...noticeboard, googleSheetUrl: e.target.value } })}
              style={inputStyle}
            />
            <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 6 }}>
              구글 시트 우측 상단 [공유] → 링크 복사 후 붙여넣기
            </div>
          </div>
          <Row label="새로고침 주기" desc={`현재: ${noticeboard.refreshInterval}초`}>
            <input type="number" min="5" max="60" value={noticeboard.refreshInterval}
              onChange={e => actions.setUI({ noticeboard: { ...noticeboard, refreshInterval: Number(e.target.value) } })}
              style={{ ...inputStyle, width: 80 }}
            />
          </Row>
        </div>
      );

      case 'profile': return (
        <div>
          <SectionTitle>기본 정보</SectionTitle>
          <Row label="이름">
            <input value={user.name} onChange={e => actions.setUser({ name: e.target.value })} style={{ ...inputStyle, width: 160 }} />
          </Row>
          <Row label="학교 / 직장명">
            <input value={user.school} onChange={e => actions.setUser({ school: e.target.value })} style={{ ...inputStyle, width: 200 }} />
          </Row>
          <Row label="온보딩 다시 보기">
            <button onClick={() => { actions.setUser({ setupComplete: false }); close(); }}
              style={{ background: '#f3f4f6', border: 'none', borderRadius: 8, padding: '8px 14px', cursor: 'pointer', fontSize: 13, color: '#374151' }}>
              다시 설정하기
            </button>
          </Row>
        </div>
      );

      default: return (
        <div style={{ color: '#9ca3af', textAlign: 'center', paddingTop: 40 }}>
          해당 탭은 준비 중입니다.
        </div>
      );
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 9000, fontFamily: "'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif"
    }} onClick={close}>
      <div style={{
        background: '#fff', borderRadius: 20,
        width: 720, maxHeight: '85vh',
        display: 'flex', overflow: 'hidden',
        boxShadow: '0 24px 60px rgba(0,0,0,0.18)'
      }} onClick={e => e.stopPropagation()}>

        {/* 좌측 탭 목록 */}
        <div style={{ width: 180, background: '#f9fafb', borderRight: '0.5px solid #f0f0f0', padding: '20px 0', flexShrink: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#1f2937', padding: '0 18px 16px' }}>⚙️ 설정</div>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
              width: '100%', padding: '11px 18px', background: activeTab === t.id ? theme.accentColor + '15' : 'none',
              border: 'none', cursor: 'pointer', textAlign: 'left', fontSize: 13,
              fontWeight: activeTab === t.id ? 600 : 400,
              color: activeTab === t.id ? theme.accentColor : '#374151',
              borderLeft: `3px solid ${activeTab === t.id ? theme.accentColor : 'transparent'}`,
              transition: 'all 0.15s'
            }}>{t.label}</button>
          ))}
        </div>

        {/* 우측 컨텐츠 */}
        <div style={{ flex: 1, padding: '28px 32px', overflowY: 'auto' }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 4 }}>
            <button onClick={close} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#9ca3af' }}>✕</button>
          </div>
          {renderTabContent()}
        </div>
      </div>
    </div>
  );
}
