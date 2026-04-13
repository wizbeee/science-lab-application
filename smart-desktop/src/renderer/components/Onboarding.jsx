// ============================================================
// Onboarding.jsx - 첫 실행 온보딩 7단계 마법사
// 직관적 · 사용자 친화적 설계
// ============================================================

import React, { useState, useEffect } from 'react';
import { useApp } from '../AppContext';
import { community } from '../services/communityService';

// ── 테마 프리셋 (SettingsPanel과 동기화) ────────────────────
const THEME_PRESETS = [
  { id: 'rose', label: '🌹 로즈', accent: '#f43f5e', bg: '#fff1f2', border: '#fecdd3', widgetBg: '#ffffff', textColor: '#1f2937',
    borderRadius: 10, shadowStyle: 'subtle', widgetBgStyle: 'solid' },
  { id: 'ocean', label: '🌊 오션', accent: '#0284c7', bg: '#f0f9ff', border: '#bae6fd', widgetBg: '#ffffff', textColor: '#1f2937',
    borderRadius: 14, shadowStyle: 'medium', widgetBgStyle: 'gradient', gradientFrom: '#e0f2fe', gradientTo: '#ffffff' },
  { id: 'forest', label: '🌿 포레스트', accent: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0', widgetBg: '#ffffff', textColor: '#14532d',
    borderRadius: 20, shadowStyle: 'subtle', widgetBgStyle: 'solid' },
  { id: 'amber', label: '🍯 앰버', accent: '#d97706', bg: '#fffbeb', border: '#fde68a', widgetBg: '#ffffff', textColor: '#1f2937',
    borderRadius: 12, shadowStyle: 'medium', widgetBgStyle: 'solid' },
  { id: 'aurora', label: '🌌 오로라', accent: '#8b5cf6', bg: '#0f0b1e', border: 'rgba(139,92,246,0.2)', widgetBg: 'rgba(139,92,246,0.08)', textColor: '#e2e8f0',
    dark: true, borderRadius: 16, shadowStyle: 'elevated', widgetBgStyle: 'glass', backdropBlur: 12 },
  { id: 'midnight', label: '🌙 미드나잇', accent: '#38bdf8', bg: '#020617', border: '#1e293b', widgetBg: '#0f172a', textColor: '#e2e8f0',
    dark: true, borderRadius: 8, shadowStyle: 'elevated', widgetBgStyle: 'solid' },
];

const ROLES = [
  { id: 'teacher', label: '교사', emoji: '📚', desc: '시간표·수업·업무 맞춤' },
  { id: 'office',  label: '직장인', emoji: '💼', desc: '업무·일정·미팅 맞춤' },
  { id: 'other',   label: '기타', emoji: '😊', desc: '기본 구성으로 시작' }
];

// ── PKCE 헬퍼 ─────────────────────────────────────────────
const GOOGLE_CLIENT_ID = process.env.REACT_APP_GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.REACT_APP_GOOGLE_CLIENT_SECRET || '';
const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/tasks',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile'
].join(' ');

function base64urlEncode(buffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

async function generatePKCE() {
  const verifier = base64urlEncode(crypto.getRandomValues(new Uint8Array(32)));
  const challenge = base64urlEncode(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  return { verifier, challenge };
}

async function exchangeCodeForTokens(code, verifier, redirectUri) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code, client_id: GOOGLE_CLIENT_ID, client_secret: GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri, grant_type: 'authorization_code', code_verifier: verifier
    }).toString()
  });
  // HTTP 오류 시 에러 정보 포함하여 throw
  if (!res.ok) {
    let errBody = {};
    try { errBody = await res.json(); } catch {}
    throw new Error(errBody.error_description || errBody.error || `토큰 교환 실패 (${res.status})`);
  }
  return res.json();
}

async function getGoogleUserInfo(accessToken) {
  const res = await fetch(`https://www.googleapis.com/oauth2/v2/userinfo?access_token=${accessToken}`);
  return res.json();
}

// ── Google 로그인 버튼 컴포넌트 ────────────────────────────
function GoogleLoginButton({ btnPrimary, actions }) {
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState(null);

  const handleLogin = async () => {
    setLoading(true);
    setError(null);
    try {
      // OAuth 서버 시작 (포트 3456)
      if (window.electronAPI?.oauth?.startServer) {
        await window.electronAPI.oauth.startServer();
      }
      const port = (await window.electronAPI?.oauth?.getPort?.()) || 3456;
      const redirectUri = `http://localhost:${port}/auth/google/callback`;

      // PKCE 생성
      const { verifier, challenge } = await generatePKCE();
      sessionStorage.setItem('pkce_verifier', verifier);
      sessionStorage.setItem('oauth_redirect', redirectUri);

      const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
        `client_id=${encodeURIComponent(GOOGLE_CLIENT_ID)}` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}` +
        `&response_type=code` +
        `&scope=${encodeURIComponent(GOOGLE_SCOPES)}` +
        `&access_type=offline&prompt=consent` +
        `&code_challenge=${challenge}&code_challenge_method=S256`;

      // 팝업으로 Google 로그인 창 열기 (팝업 차단 감지)
      const popup = window.open(authUrl, 'google-oauth', 'width=520,height=640,left=300,top=100');
      if (!popup || popup.closed) {
        setError('팝업이 차단되었습니다. 주소창 옆 팝업 차단 아이콘을 클릭하여 허용해 주세요.');
        setLoading(false);
        return;
      }

      // 팝업이 닫혀도 loading 상태 해제 (주기적 확인)
      let oauthCompleted = false; // OAuth 성공 완료 플래그
      const popupCloseTimer = setInterval(() => {
        try {
          if (popup.closed && !oauthCompleted) {
            clearInterval(popupCloseTimer);
            setLoading(false);
            setError(prev => prev || '로그인 창이 닫혔습니다. 다시 시도해 주세요.');
          }
        } catch {}
      }, 1000);

      // 메인 프로세스에서 oauth-code 이벤트 수신
      const onCode = async (code) => {
        oauthCompleted = true;
        clearInterval(popupCloseTimer);
        try {
          const storedVerifier = sessionStorage.getItem('pkce_verifier');
          const storedRedirect = sessionStorage.getItem('oauth_redirect');
          const tokens = await exchangeCodeForTokens(code, storedVerifier, storedRedirect);
          if (tokens.access_token) {
            const userInfo = await getGoogleUserInfo(tokens.access_token);
            actions.setGoogle({
              connected: true,
              email: userInfo.email || '',
              accessToken: tokens.access_token,
              refreshToken: tokens.refresh_token || ''
            });
            sessionStorage.removeItem('pkce_verifier');
            sessionStorage.removeItem('oauth_redirect');
          } else {
            setError('토큰 교환 실패: ' + (tokens.error_description || tokens.error || '알 수 없는 오류'));
          }
        } catch (e) {
          setError('연동 오류: ' + e.message);
        } finally {
          setLoading(false);
          if (window.electronAPI?.off) window.electronAPI.off('oauth-code', onCode);
          if (window.electronAPI?.off) window.electronAPI.off('oauth-error', onErr);
        }
      };
      const onErr = (errMsg) => {
        oauthCompleted = true;
        clearInterval(popupCloseTimer);
        setError('로그인 실패: ' + errMsg);
        setLoading(false);
        if (window.electronAPI?.off) window.electronAPI.off('oauth-code', onCode);
        if (window.electronAPI?.off) window.electronAPI.off('oauth-error', onErr);
      };
      if (window.electronAPI?.on) {
        window.electronAPI.on('oauth-code', onCode);
        window.electronAPI.on('oauth-error', onErr);
      }
    } catch (e) {
      setError('오류: ' + e.message);
      setLoading(false);
    }
  };

  return (
    <div>
      {error && (
        <div style={{ background: '#fee2e2', color: '#991b1b', borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: 13 }}>
          ❌ {error}
        </div>
      )}
      <button onClick={handleLogin} disabled={loading} style={{
        ...btnPrimary, background: loading ? '#9ca3af' : '#4285f4', width: '100%',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
        opacity: loading ? 0.7 : 1
      }}>
        {loading ? (
          <span>⏳ 연동 중...</span>
        ) : (
          <>
            <svg width="18" height="18" viewBox="0 0 24 24"><path fill="#fff" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#fff" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#fff" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#fff" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
            Google 로그인
          </>
        )}
      </button>
      <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 8, textAlign: 'center' }}>
        팝업 창에서 Google 계정으로 로그인하세요
      </div>
    </div>
  );
}

export default function Onboarding({ onComplete }) {
  const { state, actions } = useApp();

  // step을 localStorage에 저장하여 OAuth 리다이렉트 후에도 유지
  const [step, setStep] = useState(() => {
    const saved = parseInt(localStorage.getItem('onboarding-step') || '1');
    return isNaN(saved) ? 1 : Math.max(1, Math.min(saved, 6));
  });
  const TOTAL = 6;

  // 단계별 데이터
  const [name, setName] = useState(() => localStorage.getItem('onboarding-name') || '');
  const [school, setSchool] = useState(() => localStorage.getItem('onboarding-school') || '충남삼성고등학교');
  const [role, setRole] = useState(() => localStorage.getItem('onboarding-role') || 'teacher');
  // Google 연동 상태는 전역 상태에서 가져옴
  const googleConnected = state.google?.connected || false;
  const [msConnected, setMsConnected] = useState(false);
  const [groupCode, setGroupCode] = useState('');
  const [groupName, setGroupName] = useState('');
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupCode, setNewGroupCode] = useState('');
  const [groupMsg, setGroupMsg] = useState(null); // { type: 'success'|'error', text }
  const [groupBusy, setGroupBusy] = useState(false);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [selectedTheme, setSelectedTheme] = useState('pink');
  const [accentColor, setAccentColor] = useState('#e879a0');

  // NEIS 학교 검색 상태
  const [schoolSearchResults, setSchoolSearchResults] = useState([]);
  const [schoolSearching, setSchoolSearching] = useState(false);
  const [selectedSchoolCode, setSelectedSchoolCode] = useState(
    () => localStorage.getItem('onboarding-officeCode') ? {
      officeCode: localStorage.getItem('onboarding-officeCode'),
      schoolCode: localStorage.getItem('onboarding-schoolCode')
    } : null
  );

  // step 변경 시 localStorage 저장
  useEffect(() => {
    localStorage.setItem('onboarding-step', step.toString());
  }, [step]);

  // 이름/학교/역할 변경 시 저장
  useEffect(() => { localStorage.setItem('onboarding-name', name); }, [name]);
  useEffect(() => { localStorage.setItem('onboarding-school', school); }, [school]);
  useEffect(() => { localStorage.setItem('onboarding-role', role); }, [role]);

  // Google 연동 완료 감지 → step 3에 있으면 자동으로 다음 단계
  useEffect(() => {
    if (googleConnected && step === 3) {
      const timer = setTimeout(() => setStep(4), 1500);
      return () => clearTimeout(timer);
    }
  }, [googleConnected, step]);

  const theme = THEME_PRESETS.find(t => t.id === selectedTheme);

  const next = () => setStep(s => Math.min(s + 1, TOTAL));
  const prev = () => setStep(s => Math.max(s - 1, 1));

  // NEIS 학교 검색
  const searchSchool = async () => {
    if (!school || school.length < 2) return;
    setSchoolSearching(true);
    setSchoolSearchResults([]);
    try {
      const url = `https://open.neis.go.kr/hub/schoolInfo?Type=json&SCHUL_NM=${encodeURIComponent(school)}&SCHUL_KND_SC_NM=고등학교`;
      const res = await fetch(url);
      const data = await res.json();
      const rows = data.schoolInfo?.[1]?.row || [];
      setSchoolSearchResults(rows.slice(0, 8).map(r => ({
        name: r.SCHUL_NM,
        officeCode: r.ATPT_OFCDC_SC_CODE,
        schoolCode: r.SD_SCHUL_CODE,
        address: r.ORG_RDNMA
      })));
    } catch (e) {
      console.warn('학교 검색 실패:', e);
    } finally {
      setSchoolSearching(false);
    }
  };

  const handleJoinGroup = async () => {
    if (!groupCode.trim()) return;
    setGroupBusy(true);
    setGroupMsg(null);
    try {
      const userId = state.community?.userId || ('user_' + Date.now());
      const userName = name || '사용자';
      const joined = await community.joinGroup(groupCode.trim(), userId, userName);
      setGroupMsg({ type: 'success', text: `"${joined.name}" 그룹에 참가했습니다!` });
      actions.setCommunity({ userId, username: userName, groups: [joined.id] });
    } catch (e) {
      setGroupMsg({ type: 'error', text: e.message || '그룹 참가에 실패했습니다.' });
    } finally {
      setGroupBusy(false);
    }
  };

  const handleCreateGroup = async () => {
    if (!newGroupName.trim() || !newGroupCode.trim()) return;
    setGroupBusy(true);
    setGroupMsg(null);
    try {
      const userId = state.community?.userId || ('user_' + Date.now());
      const userName = name || '사용자';
      const created = await community.createGroup({ name: newGroupName.trim(), code: newGroupCode.trim(), adminId: userId, members: [{ id: userId, name: userName }] });
      setGroupMsg({ type: 'success', text: `그룹 "${created.name}" 생성 완료! 코드: ${created.code}` });
      actions.setCommunity({ userId, username: userName, groups: [created.id] });
      setShowCreateGroup(false);
    } catch (e) {
      setGroupMsg({ type: 'error', text: e.message || '그룹 생성에 실패했습니다.' });
    } finally {
      setGroupBusy(false);
    }
  };

  const handleComplete = () => {
    // localStorage 정리
    ['onboarding-step','onboarding-name','onboarding-school','onboarding-role',
     'onboarding-officeCode','onboarding-schoolCode'].forEach(k => localStorage.removeItem(k));

    const preset = THEME_PRESETS.find(t => t.id === selectedTheme);
    actions.setUser({ name, school, role, setupComplete: true });

    // NEIS 학교 코드 설정
    if (selectedSchoolCode) {
      actions.setMeal({
        schoolCode: selectedSchoolCode.schoolCode,
        officeCode: selectedSchoolCode.officeCode,
        enabled: true
      });
    }
    actions.setTheme({
      preset: selectedTheme,
      accentColor: selectedTheme === 'custom' ? accentColor : preset.accent,
      bgColor: preset.bg,
      borderColor: preset.border,
      widgetBg: preset.widgetBg || '#ffffff',
      textColor: preset.textColor || '#2d2d2d',
      darkMode: !!preset.dark,
      // v3.2 확장 속성
      borderRadius: preset.borderRadius ?? 10,
      borderRadiusSm: preset.borderRadiusSm ?? 6,
      borderWidth: preset.borderWidth ?? 1,
      shadowStyle: preset.shadowStyle || 'subtle',
      widgetBgStyle: preset.widgetBgStyle || 'solid',
      backdropBlur: preset.backdropBlur ?? 0,
      gradientFrom: preset.gradientFrom || '',
      gradientTo: preset.gradientTo || ''
    });
    // 기본 위젯 설정 — 스크린샷(첨부파일) 기준 동일 구성
    // 좌: 시간표, D-Day, 바로가기 | 중앙: 캘린더, 메일, 진도표
    // 중앙우: 할일, 메모, AI채팅, 스톱워치 | 우: 날씨, 급식, 뽑기, 음악, 계산기, 자료, 명언
    const baseWidgets = {
      // ── ON: 스크린샷에 보이는 17개 위젯 ──
      timetable: true, dday: true, quicklinks: true,
      calendar: true, mail: true, progress: true,
      todos: true, memo: true, aichat: true, stopwatch: true,
      weather: true, meal: true,
      randompick: true, music: true, calc: true,
      teachinglinks: true, quote: true,
      // ── OFF: 스크린샷에 없는 위젯 ──
      clock: false, currentPeriod: false,
      noticeboard: false, noticeboard1: false, noticeboard2: false,
      system: false, focus: false, weekschedule: false,
      neisalert: false, exam: false, recentfiles: false,
      fileexplorer: false, quickphrases: false,
      lessontimer: false, grading: false
    };
    // 첫 실행 시 레이아웃 캐시 초기화 (해상도 맞춤 재배치)
    localStorage.removeItem('widget-layout');
    // 교사 역할: 추가 위젯은 OFF 유지 (기본 17개와 겹침 방지)
    // 편집 모드에서 숨겨진 위젯 패널을 통해 사용자가 직접 추가
    if (role === 'teacher') {
      // lessontimer, exam은 기본 위치가 aichat/todos와 겹치므로 OFF 유지
    }
    // 직장인 역할: 기본 17개와 겹침 방지로 OFF 유지
    if (role === 'office') {
      // weekschedule, quickphrases는 기본 위치가 calendar/todos와 겹치므로 OFF 유지
    }
    actions.setWidgets(baseWidgets);
    // AI Plus 활성화
    actions.setAI({ enabled: true });
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
            <div style={{ display: 'flex', gap: 8 }}>
              <input style={{ ...inputStyle, flex: 1 }} value={school}
                onChange={e => { setSchool(e.target.value); setSelectedSchoolCode(null); setSchoolSearchResults([]); }}
                onKeyDown={e => e.key === 'Enter' && searchSchool()}
                placeholder="학교명 입력 후 검색"
              />
              <button onClick={searchSchool} disabled={schoolSearching} style={{
                ...btnPrimary, padding: '12px 16px', fontSize: 13, whiteSpace: 'nowrap',
                background: schoolSearching ? '#9ca3af' : (theme?.accent || '#e879a0')
              }}>
                {schoolSearching ? '검색 중...' : '🔍 검색'}
              </button>
            </div>
            {/* 학교 검색 결과 */}
            {schoolSearchResults.length > 0 && (
              <div style={{ border: '1.5px solid #e5e7eb', borderRadius: 10, marginTop: 6, overflow: 'hidden', maxHeight: 180, overflowY: 'auto' }}>
                {schoolSearchResults.map(r => (
                  <button key={r.schoolCode} onClick={() => {
                    setSchool(r.name);
                    setSelectedSchoolCode({ officeCode: r.officeCode, schoolCode: r.schoolCode });
                    localStorage.setItem('onboarding-officeCode', r.officeCode);
                    localStorage.setItem('onboarding-schoolCode', r.schoolCode);
                    setSchoolSearchResults([]);
                  }} style={{
                    width: '100%', background: 'none', border: 'none', padding: '10px 14px',
                    textAlign: 'left', cursor: 'pointer', borderBottom: '0.5px solid #f3f4f6',
                    display: 'flex', flexDirection: 'column', gap: 2
                  }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#1f2937' }}>{r.name}</span>
                    <span style={{ fontSize: 11, color: '#9ca3af' }}>{r.address}</span>
                  </button>
                ))}
              </div>
            )}
            {selectedSchoolCode && (
              <div style={{ fontSize: 11, color: '#10b981', marginTop: 4 }}>
                ✅ 급식 연동 준비 완료 ({selectedSchoolCode.officeCode} / {selectedSchoolCode.schoolCode})
              </div>
            )}
            {schoolSearchResults.length === 0 && !schoolSearching && !selectedSchoolCode && school.length > 0 && (
              <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>
                💡 학교 검색 시 급식 정보가 자동으로 연동됩니다
              </div>
            )}
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
            <GoogleLoginButton btnPrimary={btnPrimary} actions={actions} />
          ) : (
            <div style={{ background: '#d1fae5', borderRadius: 10, padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 20 }}>✅</span>
                <span style={{ color: '#065f46', fontWeight: 600 }}>Google 연동 완료! 잠시 후 다음 단계로 이동합니다...</span>
              </div>
            </div>
          )}
        </div>
      );

      // 4단계: 시간표
      case 4: return (
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

      // 5단계: 커뮤니티
      case 5: return (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <div style={{ fontSize: 32 }}>👥</div>
            <h2 style={{ fontSize: 22, fontWeight: 700, color: '#1f2937' }}>그룹 연결</h2>
          </div>
          <p style={{ color: '#9ca3af', fontSize: 13, marginBottom: 20 }}>
            같은 학교·팀 사람들과 공지·일정을 실시간으로 공유해요
          </p>

          {/* 메시지 표시 */}
          {groupMsg && (
            <div style={{ padding: '10px 14px', borderRadius: 8, marginBottom: 12,
              background: groupMsg.type === 'success' ? '#d1fae5' : '#fee2e2',
              color: groupMsg.type === 'success' ? '#065f46' : '#991b1b', fontSize: 13 }}>
              {groupMsg.type === 'success' ? '✅' : '❌'} {groupMsg.text}
            </div>
          )}

          {/* 그룹 참가 */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 13, color: '#374151', fontWeight: 600, display: 'block', marginBottom: 6 }}>그룹 참가 코드 입력</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input style={{ ...inputStyle, flex: 1 }} placeholder="예: CNSA-2024"
                value={groupCode} onChange={e => setGroupCode(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleJoinGroup()} />
              <button onClick={handleJoinGroup} disabled={groupBusy || !groupCode.trim()}
                style={{ ...btnPrimary, padding: '12px 20px', whiteSpace: 'nowrap',
                  opacity: groupBusy || !groupCode.trim() ? 0.6 : 1 }}>
                {groupBusy ? '처리 중...' : '참가'}
              </button>
            </div>
          </div>

          <div style={{ textAlign: 'center', color: '#9ca3af', fontSize: 13, margin: '12px 0' }}>또는</div>

          {/* 그룹 만들기 */}
          {!showCreateGroup ? (
            <button onClick={() => setShowCreateGroup(true)}
              style={{ ...btnSecondary, width: '100%', marginBottom: 8 }}>
              + 새 그룹 만들기
            </button>
          ) : (
            <div style={{ border: '1.5px solid #e5e7eb', borderRadius: 12, padding: '14px 16px', marginBottom: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 10 }}>새 그룹 만들기</div>
              <input style={{ ...inputStyle, marginBottom: 8 }} placeholder="그룹 이름 (예: 충남삼성고 2024)"
                value={newGroupName} onChange={e => setNewGroupName(e.target.value)} />
              <input style={{ ...inputStyle, marginBottom: 10 }} placeholder="참가 코드 (예: CNSA-2024)"
                value={newGroupCode} onChange={e => setNewGroupCode(e.target.value)} />
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={handleCreateGroup} disabled={groupBusy || !newGroupName.trim() || !newGroupCode.trim()}
                  style={{ ...btnPrimary, flex: 1, opacity: groupBusy || !newGroupName.trim() || !newGroupCode.trim() ? 0.6 : 1 }}>
                  {groupBusy ? '생성 중...' : '그룹 생성'}
                </button>
                <button onClick={() => setShowCreateGroup(false)} style={{ ...btnSecondary }}>취소</button>
              </div>
            </div>
          )}

          <p style={{ fontSize: 12, color: '#9ca3af', textAlign: 'center', marginTop: 8 }}>
            건너뛰고 나중에 설정에서 연결할 수 있어요
          </p>
        </div>
      );

      // 6단계: 테마
      case 6: return (
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

        {/* 하단 버튼 (1, 마지막 단계 제외) */}
        {step > 1 && step < TOTAL && (
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 24, paddingTop: 20, borderTop: '0.5px solid #f3f4f6' }}>
            <button style={btnSecondary} onClick={prev}>← 이전</button>
            <button style={btnPrimary} onClick={next}>
              {step === TOTAL - 1 ? '완료 →' : '다음 →'}
            </button>
          </div>
        )}

        {/* 2단계 이후 건너뛰기 */}
        {step > 1 && step < TOTAL && (
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
