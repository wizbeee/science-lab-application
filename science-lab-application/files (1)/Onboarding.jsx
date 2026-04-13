// ============================================================
// Onboarding.jsx - 첫 실행 온보딩 7단계 마법사
// 직관적 · 사용자 친화적 설계
// ============================================================

import React, { useState } from 'react';
import { useApp } from '../AppContext';

// ── 테마 프리셋 ─────────────────────────────────────────────
const THEME_PRESETS = [
  { id: 'pink',   label: '핑크', accent: '#e879a0', bg: '#fff5f7', border: '#f0d0da' },
  { id: 'blue',   label: '파랑', accent: '#3b82f6', bg: '#eff6ff', border: '#bfdbfe' },
  { id: 'green',  label: '초록', accent: '#10b981', bg: '#f0fdf4', border: '#bbf7d0' },
  { id: 'purple', label: '보라', accent: '#8b5cf6', bg: '#faf5ff', border: '#ddd6fe' },
  { id: 'orange', label: '오렌지', accent: '#f97316', bg: '#fff7ed', border: '#fed7aa' },
  { id: 'dark',   label: '다크', accent: '#6366f1', bg: '#1e1e2e', border: '#313244' }
];

const ROLES = [
  { id: 'teacher', label: '교사', emoji: '📚', desc: '시간표·수업·업무 맞춤' },
  { id: 'office',  label: '직장인', emoji: '💼', desc: '업무·일정·미팅 맞춤' },
  { id: 'other',   label: '기타', emoji: '😊', desc: '기본 구성으로 시작' }
];

export default function Onboarding({ onComplete }) {
  const { actions } = useApp();
  const [step, setStep] = useState(1);
  const TOTAL = 7;

  // 단계별 데이터
  const [name, setName] = useState('');
  const [school, setSchool] = useState('충남삼성고등학교');
  const [role, setRole] = useState('teacher');
  const [googleConnected, setGoogleConnected] = useState(false);
  const [msConnected, setMsConnected] = useState(false);
  const [groupCode, setGroupCode] = useState('');
  const [selectedTheme, setSelectedTheme] = useState('pink');
  const [accentColor, setAccentColor] = useState('#e879a0');

  const theme = THEME_PRESETS.find(t => t.id === selectedTheme);

  const next = () => setStep(s => Math.min(s + 1, TOTAL));
  const prev = () => setStep(s => Math.max(s - 1, 1));

  const handleComplete = () => {
    const preset = THEME_PRESETS.find(t => t.id === selectedTheme);
    actions.setUser({ name, school, role, setupComplete: true });
    actions.setTheme({
      preset: selectedTheme,
      accentColor: selectedTheme === 'custom' ? accentColor : preset.accent,
      bgColor: preset.bg,
      borderColor: preset.border,
      darkMode: selectedTheme === 'dark'
    });
    onComplete();
  };

  // ── 공통 스타일 ─────────────────────────────────────────
  const cardStyle = {
    background: '#fff',
    borderRadius: 20,
    padding: '36px 40px',
    maxWidth: 560,
    width: '100%',
    boxShadow: '0 8px 40px rgba(0,0,0,0.12)',
    position: 'relative'
  };

  const inputStyle = {
    width: '100%',
    border: `1.5px solid #e5e7eb`,
    borderRadius: 10,
    padding: '12px 16px',
    fontSize: 15,
    outline: 'none',
    transition: 'border-color 0.2s',
    fontFamily: 'inherit',
    color: '#1f2937'
  };

  const btnPrimary = {
    background: theme?.accent || '#e879a0',
    color: '#fff',
    border: 'none',
    borderRadius: 10,
    padding: '13px 28px',
    fontSize: 15,
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'opacity 0.15s'
  };

  const btnSecondary = {
    background: 'transparent',
    color: '#6b7280',
    border: '1.5px solid #e5e7eb',
    borderRadius: 10,
    padding: '13px 28px',
    fontSize: 15,
    cursor: 'pointer'
  };

  // ── 단계별 렌더링 ────────────────────────────────────────
  const renderStep = () => {
    switch (step) {

      // 1단계: 환영
      case 1: return (
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 64, marginBottom: 16 }}>🖥️</div>
          <h2 style={{ fontSize: 26, fontWeight: 700, color: '#1f2937', marginBottom: 12 }}>
            스마트 바탕화면에 오신 것을 환영합니다
          </h2>
          <p style={{ color: '#6b7280', fontSize: 15, lineHeight: 1.7, marginBottom: 28 }}>
            수업·업무·일정을 한눈에 관리하는<br />
            교사 & 직장인 맞춤 스마트 대시보드입니다.<br />
            지금부터 5분 안에 설정을 완료할 수 있어요.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 28 }}>
            {[
              { icon: '📅', label: '시간표 & 일정' },
              { icon: '🔔', label: '스마트 알림' },
              { icon: '🌐', label: 'Google & MS 연동' }
            ].map(f => (
              <div key={f.label} style={{ background: '#f9fafb', borderRadius: 12, padding: '14px 8px', textAlign: 'center' }}>
                <div style={{ fontSize: 28, marginBottom: 6 }}>{f.icon}</div>
                <div style={{ fontSize: 12, color: '#4b5563', fontWeight: 500 }}>{f.label}</div>
              </div>
            ))}
          </div>
          <button style={btnPrimary} onClick={next}>시작하기 →</button>
        </div>
      );

      // 2단계: 기본 정보
      case 2: return (
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: '#1f2937', marginBottom: 8 }}>기본 정보를 알려주세요</h2>
          <p style={{ color: '#9ca3af', fontSize: 13, marginBottom: 24 }}>언제든지 설정에서 변경할 수 있어요</p>

          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 13, color: '#374151', fontWeight: 600, display: 'block', marginBottom: 6 }}>이름</label>
            <input style={inputStyle} placeholder="홍길동" value={name} onChange={e => setName(e.target.value)} />
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={{ fontSize: 13, color: '#374151', fontWeight: 600, display: 'block', marginBottom: 6 }}>학교 / 직장명</label>
            <input style={inputStyle} value={school} onChange={e => setSchool(e.target.value)} />
          </div>

          <div style={{ marginBottom: 28 }}>
            <label style={{ fontSize: 13, color: '#374151', fontWeight: 600, display: 'block', marginBottom: 10 }}>직종 선택</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
              {ROLES.map(r => (
                <button key={r.id} onClick={() => setRole(r.id)} style={{
                  border: `2px solid ${role === r.id ? (theme?.accent || '#e879a0') : '#e5e7eb'}`,
                  borderRadius: 12, padding: '14px 8px', background: role === r.id ? `${theme?.accent}15` : '#fff',
                  cursor: 'pointer', textAlign: 'center', transition: 'all 0.15s'
                }}>
                  <div style={{ fontSize: 26, marginBottom: 4 }}>{r.emoji}</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#1f2937' }}>{r.label}</div>
                  <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 3 }}>{r.desc}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      );

      // 3단계: Google 연동
      case 3: return (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <div style={{ fontSize: 32 }}>🔗</div>
            <h2 style={{ fontSize: 22, fontWeight: 700, color: '#1f2937' }}>Google 계정 연동</h2>
          </div>
          <p style={{ color: '#9ca3af', fontSize: 13, marginBottom: 20 }}>
            Google 로그인 한 번으로 아래 서비스가 모두 연결됩니다<br />
            나중에 설정에서도 변경 가능합니다
          </p>

          <div style={{ background: '#f9fafb', borderRadius: 14, padding: '16px 20px', marginBottom: 20 }}>
            {[
              { icon: '📅', label: 'Google Calendar', desc: '일정 표시 & 등록·삭제' },
              { icon: '📧', label: 'Gmail', desc: '받은 메일 미리보기' },
              { icon: '📁', label: 'Google Drive', desc: '파일 빠른 접근' },
              { icon: '🎓', label: 'Google Classroom', desc: '수업·과제 현황' },
              { icon: '📹', label: 'Google Meet', desc: '회의 링크 원클릭 접속' },
              { icon: '✅', label: 'Google Tasks', desc: '할 일 동기화' }
            ].map(s => (
              <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: '0.5px solid #e5e7eb' }}>
                <span style={{ fontSize: 20 }}>{s.icon}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#1f2937' }}>{s.label}</div>
                  <div style={{ fontSize: 11, color: '#9ca3af' }}>{s.desc}</div>
                </div>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: googleConnected ? '#10b981' : '#d1d5db' }} />
              </div>
            ))}
          </div>

          {!googleConnected ? (
            <button onClick={() => setGoogleConnected(true)} style={{
              ...btnPrimary, background: '#4285f4', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10
            }}>
              <svg width="18" height="18" viewBox="0 0 24 24"><path fill="#fff" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#fff" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#fff" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#fff" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
              Google 로그인
            </button>
          ) : (
            <div style={{ background: '#d1fae5', borderRadius: 10, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 20 }}>✅</span>
              <span style={{ color: '#065f46', fontWeight: 600 }}>Google 연동 완료!</span>
            </div>
          )}
        </div>
      );

      // 4단계: Microsoft 연동
      case 4: return (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <div style={{ fontSize: 32 }}>🪟</div>
            <h2 style={{ fontSize: 22, fontWeight: 700, color: '#1f2937' }}>Microsoft 계정 연동</h2>
          </div>
          <p style={{ color: '#9ca3af', fontSize: 13, marginBottom: 20 }}>
            건너뛰어도 나중에 설정에서 연동할 수 있어요
          </p>

          <div style={{ background: '#f9fafb', borderRadius: 14, padding: '16px 20px', marginBottom: 20 }}>
            {[
              { icon: '📮', label: 'Outlook', desc: '메일·캘린더 통합' },
              { icon: '💾', label: 'OneDrive', desc: '파일 빠른 접근' },
              { icon: '💬', label: 'Teams', desc: '채팅·회의 알림' }
            ].map(s => (
              <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '0.5px solid #e5e7eb' }}>
                <span style={{ fontSize: 22 }}>{s.icon}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#1f2937' }}>{s.label}</div>
                  <div style={{ fontSize: 11, color: '#9ca3af' }}>{s.desc}</div>
                </div>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: msConnected ? '#10b981' : '#d1d5db' }} />
              </div>
            ))}
          </div>

          {!msConnected ? (
            <button onClick={() => setMsConnected(true)} style={{
              ...btnPrimary, background: '#00a1f1', width: '100%'
            }}>
              🪟 Microsoft 로그인
            </button>
          ) : (
            <div style={{ background: '#dbeafe', borderRadius: 10, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 20 }}>✅</span>
              <span style={{ color: '#1e40af', fontWeight: 600 }}>Microsoft 연동 완료!</span>
            </div>
          )}
        </div>
      );

      // 5단계: 시간표 (교사만)
      case 5: return (
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: '#1f2937', marginBottom: 8 }}>시간표 설정</h2>
          <p style={{ color: '#9ca3af', fontSize: 13, marginBottom: 20 }}>
            기본 일과표가 이미 설정되어 있어요.<br />
            세부 수업 배정은 메인 화면에서 직접 클릭해 편집할 수 있어요.
          </p>

          <div style={{ background: '#f9fafb', borderRadius: 14, overflow: 'hidden', marginBottom: 20 }}>
            {[
              { time: '08:40~09:30', label: '1교시', color: '#dbeafe' },
              { time: '09:40~10:30', label: '2교시', color: '#dbeafe' },
              { time: '10:40~11:30', label: '3교시', color: '#dbeafe' },
              { time: '11:30~13:30', label: '점심 (4교시 A/B)', color: '#fef9c3' },
              { time: '13:30~14:20', label: '5교시', color: '#dbeafe' },
              { time: '14:30~15:20', label: '6교시', color: '#dbeafe' },
              { time: '15:30~16:20', label: '7교시', color: '#dbeafe' },
              { time: '16:20~16:30', label: '종례', color: '#dcfce7' }
            ].map(p => (
              <div key={p.label} style={{ display: 'flex', alignItems: 'center', padding: '10px 16px', borderBottom: '0.5px solid #e5e7eb', background: p.color }}>
                <span style={{ fontSize: 12, color: '#6b7280', width: 120, flexShrink: 0 }}>{p.time}</span>
                <span style={{ fontSize: 14, color: '#1f2937', fontWeight: 500 }}>{p.label}</span>
              </div>
            ))}
          </div>

          <p style={{ fontSize: 12, color: '#9ca3af', textAlign: 'center' }}>
            ⚙️ 설정 → 일과 탭에서 언제든지 교시 시간을 수정할 수 있어요
          </p>
        </div>
      );

      // 6단계: 커뮤니티
      case 6: return (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <div style={{ fontSize: 32 }}>👥</div>
            <h2 style={{ fontSize: 22, fontWeight: 700, color: '#1f2937' }}>그룹 연결</h2>
          </div>
          <p style={{ color: '#9ca3af', fontSize: 13, marginBottom: 20 }}>
            같은 학교·팀 사람들과 공지·일정을 실시간으로 공유해요
          </p>

          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 13, color: '#374151', fontWeight: 600, display: 'block', marginBottom: 6 }}>그룹 참가 코드 입력</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input style={{ ...inputStyle, flex: 1 }} placeholder="예: CNSA-2024" value={groupCode} onChange={e => setGroupCode(e.target.value)} />
              <button style={{ ...btnPrimary, padding: '12px 20px', whiteSpace: 'nowrap' }}>참가</button>
            </div>
          </div>

          <div style={{ textAlign: 'center', color: '#9ca3af', fontSize: 13, margin: '16px 0' }}>또는</div>

          <button style={{ ...btnSecondary, width: '100%', marginBottom: 8 }}>
            + 새 그룹 만들기
          </button>

          <p style={{ fontSize: 12, color: '#9ca3af', textAlign: 'center' }}>
            건너뛰고 나중에 설정할 수 있어요
          </p>
        </div>
      );

      // 7단계: 테마
      case 7: return (
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: '#1f2937', marginBottom: 8 }}>테마 색상 선택</h2>
          <p style={{ color: '#9ca3af', fontSize: 13, marginBottom: 20 }}>
            나중에 설정 → 색상 탭에서 세부 색상도 직접 바꿀 수 있어요
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 20 }}>
            {THEME_PRESETS.map(t => (
              <button key={t.id} onClick={() => { setSelectedTheme(t.id); setAccentColor(t.accent); }}
                style={{
                  border: `2.5px solid ${selectedTheme === t.id ? t.accent : '#e5e7eb'}`,
                  borderRadius: 14, padding: '16px 8px', background: t.bg,
                  cursor: 'pointer', textAlign: 'center', transition: 'all 0.15s'
                }}>
                <div style={{ width: 32, height: 32, borderRadius: '50%', background: t.accent, margin: '0 auto 8px' }} />
                <div style={{ fontSize: 13, fontWeight: 600, color: t.id === 'dark' ? '#fff' : '#1f2937' }}>{t.label}</div>
              </button>
            ))}
          </div>

          <div style={{ marginBottom: 24 }}>
            <label style={{ fontSize: 13, color: '#374151', fontWeight: 600, display: 'block', marginBottom: 8 }}>
              직접 색상 선택
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <input type="color" value={accentColor}
                onChange={e => { setAccentColor(e.target.value); setSelectedTheme('custom'); }}
                style={{ width: 48, height: 48, border: 'none', borderRadius: 8, cursor: 'pointer', padding: 0 }}
              />
              <span style={{ fontSize: 13, color: '#6b7280' }}>원하는 색상을 직접 고를 수 있어요</span>
            </div>
          </div>

          <button onClick={handleComplete} style={{ ...btnPrimary, width: '100%', fontSize: 16, padding: '15px' }}>
            🎉 설정 완료 & 시작하기
          </button>
        </div>
      );

      default: return null;
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 9999, fontFamily: "'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif"
    }}>
      <div style={cardStyle}>
        {/* 진행 바 */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 12, color: '#9ca3af' }}>단계 {step} / {TOTAL}</span>
            <span style={{ fontSize: 12, color: '#9ca3af' }}>{Math.round((step / TOTAL) * 100)}%</span>
          </div>
          <div style={{ height: 4, background: '#f3f4f6', borderRadius: 4 }}>
            <div style={{ height: '100%', borderRadius: 4, background: theme?.accent || '#e879a0',
              width: `${(step / TOTAL) * 100}%`, transition: 'width 0.3s ease' }} />
          </div>
          {/* 단계 점 */}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
            {Array.from({ length: TOTAL }, (_, i) => (
              <div key={i} style={{
                width: 8, height: 8, borderRadius: '50%',
                background: i + 1 <= step ? (theme?.accent || '#e879a0') : '#e5e7eb',
                transition: 'background 0.3s'
              }} />
            ))}
          </div>
        </div>

        {/* 단계 컨텐츠 */}
        {renderStep()}

        {/* 하단 버튼 (1, 7단계 제외) */}
        {step > 1 && step < 7 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 24, paddingTop: 20, borderTop: '0.5px solid #f3f4f6' }}>
            <button style={btnSecondary} onClick={prev}>← 이전</button>
            <button style={btnPrimary} onClick={next}>
              {step === 6 ? '완료 →' : '다음 →'}
            </button>
          </div>
        )}

        {/* 2단계 이후 건너뛰기 */}
        {step > 1 && step < 7 && (
          <div style={{ textAlign: 'center', marginTop: 12 }}>
            <button onClick={next} style={{ background: 'none', border: 'none', color: '#9ca3af', fontSize: 12, cursor: 'pointer' }}>
              건너뛰기
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
