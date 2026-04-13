// ============================================================
// SettingsPanel.jsx - 설정 패널 (탭 구조)
// 색상 커스텀, Google/MS 연동, AI, 일과 등 전체 설정
// ============================================================

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useApp } from '../AppContext';
import { initFirebase } from '../services/communityService';

// ── 포커스 소실 방지: 컴포넌트를 함수 밖에 정의 ─────────────
const SettingsRow = React.memo(({ label, desc, children }) => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderBottom: '0.5px solid #f3f4f6' }}>
    <div style={{ flex: 1 }}>
      <div style={{ fontSize: 14, fontWeight: 500, color: '#1f2937' }}>{label}</div>
      {desc && <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>{desc}</div>}
    </div>
    <div style={{ marginLeft: 16 }}>{children}</div>
  </div>
));

const SettingsSectionTitle = React.memo(({ children }) => (
  <div style={{ fontSize: 12, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.8px', margin: '20px 0 8px' }}>
    {children}
  </div>
));

const SettingsToggle = React.memo(({ value, onChange, accentColor }) => (
  <button onClick={() => onChange(!value)} style={{
    width: 44, height: 24, borderRadius: 12, cursor: 'pointer',
    background: value ? (accentColor || '#f43f5e') : '#d1d5db',
    position: 'relative', border: 'none', transition: 'background 0.2s', flexShrink: 0
  }}>
    <div style={{
      width: 18, height: 18, borderRadius: '50%', background: '#fff',
      position: 'absolute', top: 3, left: value ? 23 : 3,
      transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
    }} />
  </button>
));

// 디바운스 입력: 로컬 state로 포커스 유지, blur 시 또는 500ms 후 저장
function DebouncedInput({ value, onCommit, delay = 500, style, ...props }) {
  const [local, setLocal] = useState(value ?? '');
  const timerRef = useRef(null);
  // 외부 값이 변경되면 로컬도 동기화 (다른 곳에서 변경된 경우)
  useEffect(() => { setLocal(value ?? ''); }, [value]);
  const commit = useCallback((v) => {
    clearTimeout(timerRef.current);
    onCommit(v);
  }, [onCommit]);
  const handleChange = (e) => {
    const v = e.target.value;
    setLocal(v);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => commit(v), delay);
  };
  const handleBlur = () => { clearTimeout(timerRef.current); commit(local); };
  useEffect(() => () => clearTimeout(timerRef.current), []);
  return <input {...props} value={local} onChange={handleChange} onBlur={handleBlur} style={style} />;
}

// ── Google OAuth PKCE 헬퍼 (Onboarding과 동일 로직) ────────
const GOOGLE_CLIENT_ID = process.env.REACT_APP_GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.REACT_APP_GOOGLE_CLIENT_SECRET || '';
const GOOGLE_SCOPES = ['https://www.googleapis.com/auth/calendar','https://www.googleapis.com/auth/gmail.readonly','https://www.googleapis.com/auth/drive.readonly','https://www.googleapis.com/auth/tasks','https://www.googleapis.com/auth/userinfo.email','https://www.googleapis.com/auth/userinfo.profile'].join(' ');
const OAUTH_CALLBACK_PORT = 3000; // Google Cloud Console 등록 포트와 반드시 일치
function b64url(buf) { return btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,''); }
async function genPKCE() { const v=b64url(crypto.getRandomValues(new Uint8Array(32))); return {v, c:b64url(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(v)))}; }

function SettingsGoogleLoginButton({ actions, clientSecret }) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const doLogin = async () => {
    setLoading(true); setErr(null);
    try {
      if (window.electronAPI?.oauth?.startServer) await window.electronAPI.oauth.startServer();
      const redirectUri = `http://localhost:${OAUTH_CALLBACK_PORT}/auth/google/callback`;
      const { v: verifier, c: challenge } = await genPKCE();
      sessionStorage.setItem('pkce_verifier', verifier);
      sessionStorage.setItem('oauth_redirect', redirectUri);
      if (clientSecret) sessionStorage.setItem('oauth_client_secret', clientSecret);
      const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(GOOGLE_CLIENT_ID)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(GOOGLE_SCOPES)}&access_type=offline&prompt=consent&code_challenge=${challenge}&code_challenge_method=S256`;
      // Fix: 팝업 차단 여부 확인
      const popup = window.open(authUrl, 'google-oauth', 'width=520,height=640,left=300,top=100');
      if (!popup || popup.closed) {
        setErr('팝업이 차단되었습니다. 주소창 옆 팝업 차단 아이콘을 클릭하여 허용해 주세요.');
        setLoading(false);
        return;
      }
      // 팝업이 OAuth 완료 없이 닫히면 loading 해제
      let oauthDone = false;
      const closeWatcher = setInterval(() => {
        try {
          if (popup.closed && !oauthDone) {
            clearInterval(closeWatcher);
            setLoading(false);
            setErr(prev => prev || '로그인 창이 닫혔습니다. 다시 시도해 주세요.');
          }
        } catch {}
      }, 1000);
      const onCode = async (code) => {
        oauthDone = true; clearInterval(closeWatcher);
        try {
          const sv = sessionStorage.getItem('pkce_verifier');
          const sr = sessionStorage.getItem('oauth_redirect');
          const ss = sessionStorage.getItem('oauth_client_secret') || clientSecret || GOOGLE_CLIENT_SECRET;
          const params = {code,client_id:GOOGLE_CLIENT_ID,client_secret:ss,redirect_uri:sr,grant_type:'authorization_code',code_verifier:sv};
          // Fix: 응답 상태 코드 확인 후 JSON 파싱
          const tokenResp = await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(params).toString()});
          if (!tokenResp.ok) { throw new Error(`토큰 교환 실패 (${tokenResp.status})`); }
          const t = await tokenResp.json();
          if (t.access_token) {
            const userResp = await fetch(`https://www.googleapis.com/oauth2/v2/userinfo?access_token=${t.access_token}`);
            if (!userResp.ok) { throw new Error(`사용자 정보 조회 실패 (${userResp.status})`); }
            const u = await userResp.json();
            actions.setGoogle({connected:true,email:u.email||'',clientSecret:ss,accessToken:t.access_token,refreshToken:t.refresh_token||''});
          } else { setErr('토큰 교환 실패: '+(t.error_description||t.error||'오류')); }
        } catch(e) { setErr('연동 오류: '+e.message); }
        finally { setLoading(false); window.electronAPI?.off?.('oauth-code',onCode); window.electronAPI?.off?.('oauth-error',onErr); }
      };
      const onErr = (m) => { oauthDone = true; clearInterval(closeWatcher); setErr('로그인 실패: '+m); setLoading(false); window.electronAPI?.off?.('oauth-code',onCode); window.electronAPI?.off?.('oauth-error',onErr); };
      window.electronAPI?.on?.('oauth-code', onCode);
      window.electronAPI?.on?.('oauth-error', onErr);
    } catch(e) { setErr('오류: '+e.message); setLoading(false); }
  };
  return (
    <div>
      {err && <div style={{background:'#fee2e2',color:'#991b1b',borderRadius:8,padding:'8px 12px',marginBottom:10,fontSize:12}}>❌ {err}</div>}
      <button onClick={doLogin} disabled={loading} style={{width:'100%',background:loading?'#9ca3af':'#4285f4',color:'#fff',border:'none',borderRadius:10,padding:'13px',fontSize:15,fontWeight:600,cursor:'pointer',opacity:loading?0.7:1}}>
        {loading ? '⏳ 연동 중...' : '🔗 Google 로그인'}
      </button>
      <div style={{fontSize:12,color:'#9ca3af',marginTop:8,textAlign:'center'}}>팝업 창에서 Google 계정으로 로그인하세요</div>
    </div>
  );
}

// 8개 테마 프리셋 — 각각 고유한 시각적 개성
const THEME_PRESETS = [
  { id: 'rose', label: '🌹 로즈 클래식', desc: '따뜻한 파스텔',
    accent: '#f43f5e', bg: '#fff1f2', border: '#fecdd3', widgetBg: '#ffffff', textColor: '#1f2937',
    borderRadius: 10, borderRadiusSm: 6, borderWidth: 1, shadowStyle: 'subtle', widgetBgStyle: 'solid', backdropBlur: 0 },
  { id: 'aurora', label: '🌌 오로라 글래스', desc: '보라 글래스모피즘', dark: true,
    accent: '#8b5cf6', bg: '#0f0b1e', border: 'rgba(139,92,246,0.2)', widgetBg: 'rgba(139,92,246,0.08)', textColor: '#e2e8f0',
    borderRadius: 16, borderRadiusSm: 10, borderWidth: 1, shadowStyle: 'elevated', widgetBgStyle: 'glass', backdropBlur: 12 },
  { id: 'flatmono', label: '📰 플랫 모노', desc: '미니멀 신문',
    accent: '#18181b', bg: '#fafafa', border: '#d4d4d8', widgetBg: '#ffffff', textColor: '#18181b',
    borderRadius: 4, borderRadiusSm: 2, borderWidth: 2, shadowStyle: 'none', widgetBgStyle: 'flat', backdropBlur: 0 },
  { id: 'ocean', label: '🌊 오션 그래디언트', desc: '부드러운 파란 물결',
    accent: '#0284c7', bg: '#f0f9ff', border: '#bae6fd', widgetBg: '#ffffff', textColor: '#1f2937',
    borderRadius: 14, borderRadiusSm: 8, borderWidth: 0, shadowStyle: 'medium', widgetBgStyle: 'gradient', backdropBlur: 0,
    gradientFrom: '#e0f2fe', gradientTo: '#ffffff' },
  { id: 'forest', label: '🌿 포레스트', desc: '둥근 자연',
    accent: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0', widgetBg: '#ffffff', textColor: '#14532d',
    borderRadius: 20, borderRadiusSm: 12, borderWidth: 1, shadowStyle: 'subtle', widgetBgStyle: 'solid', backdropBlur: 0 },
  { id: 'midnight', label: '🌙 미드나잇 프로', desc: '깊은 다크 전문가', dark: true,
    accent: '#38bdf8', bg: '#020617', border: '#1e293b', widgetBg: '#0f172a', textColor: '#e2e8f0',
    borderRadius: 8, borderRadiusSm: 5, borderWidth: 1, shadowStyle: 'elevated', widgetBgStyle: 'solid', backdropBlur: 0 },
  { id: 'amber', label: '🍯 웜 앰버', desc: '따뜻한 골드',
    accent: '#d97706', bg: '#fffbeb', border: '#fde68a', widgetBg: '#ffffff', textColor: '#1f2937',
    borderRadius: 12, borderRadiusSm: 7, borderWidth: 1, shadowStyle: 'medium', widgetBgStyle: 'solid', backdropBlur: 0 },
  { id: 'cyber', label: '⚡ 네온 사이버', desc: '사이버펑크', dark: true,
    accent: '#22d3ee', bg: '#0a0a0a', border: 'rgba(34,211,238,0.15)', widgetBg: 'rgba(34,211,238,0.05)', textColor: '#e4e4e7',
    borderRadius: 2, borderRadiusSm: 1, borderWidth: 1, shadowStyle: 'none', widgetBgStyle: 'glass', backdropBlur: 8 },
];

const TABS = [
  { id: 'design',       label: '🎨 디자인' },
  { id: 'schedule',     label: '🕐 일과' },
  { id: 'google',       label: '🔗 Google' },
  { id: 'ai',           label: '✦ AI Plus' },
  { id: 'noticeboard',  label: '📡 전광판' },
  { id: 'notifications',label: '🔔 알림' },
  { id: 'widgets',      label: '🧩 위젯' },
  { id: 'weather',      label: '🌤️ 날씨' },
  { id: 'meal',         label: '🍽️ 급식' },
  { id: 'profile',      label: '👤 내 정보' },
  { id: 'data',         label: '💾 데이터' },
  // community 탭: Firebase 자체 설정 필요 → 일반 사용자에게 노출 안 함
];

// ── 캘린더 선택 컴포넌트 ─────────────────────────────────────
function CalendarSelector({ google, actions, theme }) {
  const [calList, setCalList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const selected = google.selectedCalendarIds || [];

  useEffect(() => {
    if (!google.connected || !google.accessToken) return;
    // 저장된 캘린더 목록이 있으면 사용
    if (google.calendarList?.length) { setCalList(google.calendarList); return; }
    setLoading(true);
    import('../services/googleService').then(async ({ setTokens, getCalendarList }) => {
      try {
        setTokens(google.accessToken, google.refreshToken, 3600);
        const list = await getCalendarList();
        setCalList(list);
        actions.setGoogle({ calendarList: list });
      } catch (e) {
        setError('캘린더 목록을 불러올 수 없습니다.');
      }
      setLoading(false);
    });
  }, [google.connected, google.accessToken]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (id) => {
    const next = selected.includes(id)
      ? selected.filter(s => s !== id)
      : [...selected, id];
    actions.setGoogle({ selectedCalendarIds: next });
  };

  const refresh = async () => {
    setLoading(true); setError(null);
    try {
      const { setTokens, getCalendarList } = await import('../services/googleService');
      setTokens(google.accessToken, google.refreshToken, 3600);
      const list = await getCalendarList();
      setCalList(list);
      actions.setGoogle({ calendarList: list });
    } catch { setError('불러오기 실패'); }
    setLoading(false);
  };

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: theme?.textColor || '#374151' }}>📅 표시할 캘린더 선택</span>
        <button onClick={refresh} disabled={loading}
          style={{ fontSize: 11, background: 'none', border: `1px solid ${theme?.borderColor || '#e5e7eb'}`, borderRadius: 6, padding: '3px 8px', cursor: 'pointer', color: '#6b7280' }}>
          {loading ? '로딩 중...' : '🔄 새로고침'}
        </button>
      </div>
      {error && <div style={{ fontSize: 11, color: '#dc2626', marginBottom: 6 }}>{error}</div>}
      {calList.length === 0 && !loading && (
        <div style={{ fontSize: 11, color: '#9ca3af' }}>Google에 연결하면 캘린더 목록이 표시됩니다.</div>
      )}
      {calList.length > 0 && selected.length === 0 && (
        <div style={{ fontSize: 11, color: '#f59e0b', background: '#fef9c3', borderRadius: 6, padding: '5px 10px', marginBottom: 6 }}>
          ⚠️ 선택된 캘린더가 없습니다. 캘린더 위젯에 일정이 표시되지 않습니다.
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {calList.map(cal => {
          const isSelected = selected.includes(cal.id);
          return (
            <label key={cal.id} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '6px 10px', borderRadius: 8, background: isSelected ? cal.color + '18' : (theme?.darkMode ? '#1e293b' : '#f9fafb'), border: `1px solid ${isSelected ? cal.color + '60' : (theme?.borderColor || '#f0f0f0')}`, transition: 'all 0.15s' }}>
              <input type="checkbox" checked={isSelected} onChange={() => toggle(cal.id)}
                style={{ accentColor: cal.color, width: 14, height: 14 }} />
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: cal.color, flexShrink: 0 }} />
              <span style={{ fontSize: 12, flex: 1, color: theme?.textColor || '#1f2937' }}>{cal.name}</span>
              {cal.primary && <span style={{ fontSize: 10, color: '#9ca3af', background: '#f3f4f6', borderRadius: 4, padding: '1px 5px' }}>기본</span>}
            </label>
          );
        })}
      </div>
    </div>
  );
}

export default function SettingsPanel() {
  const { state, actions } = useApp();
  const { theme, google, microsoft, ai, noticeboard, notifications, user, widgets, weather, meal } = state;
  // schedule 안전 기본값 — periods가 배열이 아니거나 없으면 빈 배열
  const rawSchedule = state.schedule || {};
  const schedule = {
    workStart: rawSchedule.workStart || '08:30',
    workEnd: rawSchedule.workEnd || '16:30',
    periods: Array.isArray(rawSchedule.periods) ? rawSchedule.periods : []
  };
  const community = state.community || {};

  const [activeTab, setActiveTab] = useState(state.ui.settingsTab || 'design');
  const [customAccent, setCustomAccent] = useState(theme.accentColor);
  const [customBg, setCustomBg] = useState(theme.bgColor);
  const [systemFonts, setSystemFonts] = useState([]);
  const [fontLoading, setFontLoading] = useState(false);

  // 시스템 설치 폰트 로드
  useEffect(() => {
    if (activeTab !== 'design') return;
    setFontLoading(true);
    const load = async () => {
      try {
        let fonts = [];
        if (window.electronAPI?.fonts?.getSystem) {
          fonts = await window.electronAPI.fonts.getSystem();
        } else if ('queryLocalFonts' in window) {
          const result = await window.queryLocalFonts();
          fonts = [...new Set(result.map(f => f.family))].sort();
        }
        setSystemFonts(fonts);
      } catch { setSystemFonts([]); }
      setFontLoading(false);
    };
    load();
  }, [activeTab]);
  const [widgetSearch, setWidgetSearch] = useState('');
  const [taskbarHidden, setTaskbarHidden] = useState(() => localStorage.getItem('taskbar-hidden') === 'true');
  const [fbSaving, setFbSaving] = useState(false);
  const [fbStatus, setFbStatus] = useState('');
  const [clientSecret, setClientSecret] = useState(() => state.google?.clientSecret || '');

  const close = () => actions.setUI({ settingsOpen: false });

  const inputStyle = {
    width: '100%', border: '1.5px solid #e5e7eb', borderRadius: 9,
    padding: '10px 14px', fontSize: 14, outline: 'none', fontFamily: 'inherit',
    color: '#1f2937', background: '#fff'
  };

  // 외부 정의 컴포넌트 사용 (함수 안에서 정의하면 매 렌더마다 새 컴포넌트 → 포커스 소실)
  const Row = SettingsRow;
  const SectionTitle = SettingsSectionTitle;
  const Toggle = useCallback(({ value, onChange }) => (
    <SettingsToggle value={value} onChange={onChange} accentColor={theme.accentColor} />
  ), [theme.accentColor]);

  // ── 탭별 컨텐츠 ─────────────────────────────────────────
  const renderTabContent = () => {
    switch (activeTab) {

      case 'design': return (
        <div>
          <SectionTitle>테마 프리셋</SectionTitle>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 20 }}>
            {THEME_PRESETS.map(t => {
              const isDark = !!t.dark;
              const active = theme.preset === t.id;
              return (
                <button key={t.id} onClick={() => {
                  actions.setTheme({
                    preset: t.id, accentColor: t.accent, bgColor: t.bg, borderColor: t.border,
                    widgetBg: t.widgetBg, textColor: t.textColor, darkMode: isDark,
                    // v3.2 확장 속성
                    borderRadius: t.borderRadius ?? 10, borderRadiusSm: t.borderRadiusSm ?? 6,
                    borderWidth: t.borderWidth ?? 1, shadowStyle: t.shadowStyle || 'subtle',
                    widgetBgStyle: t.widgetBgStyle || 'solid', backdropBlur: t.backdropBlur ?? 0,
                    gradientFrom: t.gradientFrom || '', gradientTo: t.gradientTo || '',
                  });
                  setCustomAccent(t.accent); setCustomBg(t.bg);
                }} style={{
                  border: `2px solid ${active ? t.accent : 'transparent'}`,
                  borderRadius: t.borderRadius || 12, padding: 0, background: 'none',
                  cursor: 'pointer', textAlign: 'center', overflow: 'hidden',
                  boxShadow: active ? `0 0 0 3px ${t.accent}40` : '0 1px 4px rgba(0,0,0,0.10)',
                  transition: 'all 0.15s'
                }}>
                  {/* 미리보기 — 프리셋의 실제 모서리/그림자/스타일 반영 */}
                  <div style={{ background: t.bg, padding: '10px 8px 6px', borderRadius: t.borderRadius || 10 }}>
                    <div style={{ height: 6, borderRadius: t.borderRadiusSm || 4, background: t.accent, marginBottom: 5 }} />
                    <div style={{ display: 'flex', gap: 3, marginBottom: 4 }}>
                      <div style={{ flex: 1, height: 18, borderRadius: t.borderRadiusSm || 4, background: t.widgetBg, border: (t.borderWidth ?? 1) > 0 ? `${t.borderWidth ?? 1}px solid ${t.border}` : 'none', boxShadow: t.shadowStyle === 'elevated' ? '0 2px 6px rgba(0,0,0,0.15)' : 'none' }} />
                      <div style={{ flex: 1, height: 18, borderRadius: t.borderRadiusSm || 4, background: t.widgetBg, border: (t.borderWidth ?? 1) > 0 ? `${t.borderWidth ?? 1}px solid ${t.border}` : 'none' }} />
                    </div>
                    <div style={{ height: 10, borderRadius: t.borderRadiusSm || 4, background: t.accent + '33' }} />
                  </div>
                  <div style={{ padding: '4px 0 6px', fontSize: 9, color: isDark ? '#94a3b8' : '#6b7280' }}>{t.desc}</div>
                  <div style={{ fontSize: 11, fontWeight: 600, padding: '5px 4px 6px', color: theme.textColor }}>{t.label}</div>
                </button>
              );
            })}
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
                onChange={e => { setCustomBg(e.target.value); if (e.target.value) actions.setTheme({ bgColor: e.target.value, preset: 'custom' }); }}
                style={{ width: 40, height: 40, border: 'none', borderRadius: 8, cursor: 'pointer', padding: 0 }}
              />
              <span style={{ fontSize: 13, color: '#6b7280' }}>{customBg}</span>
            </div>
          </Row>
          <Row label="다크 모드">
            <select value={theme.autoDarkMode === 'system' ? 'system' : theme.autoDarkMode === true || theme.autoDarkMode === 'time' ? 'time' : theme.darkMode ? 'on' : 'off'}
              onChange={e => {
                const v = e.target.value;
                if (v === 'on') actions.setTheme({ darkMode: true, autoDarkMode: false, textColor: '#e2e8f0', bgColor: '#0f172a', widgetBg: '#1e293b', borderColor: '#334155' });
                else if (v === 'off') actions.setTheme({ darkMode: false, autoDarkMode: false, textColor: '#1f2937', bgColor: theme.bgColor || '#fff1f2', widgetBg: '#ffffff', borderColor: theme.borderColor || '#fecdd3' });
                else if (v === 'system') actions.setTheme({ autoDarkMode: 'system' });
                else if (v === 'time') actions.setTheme({ autoDarkMode: 'time' });
              }}
              style={{ ...inputStyle, width: 140 }}>
              <option value="off">라이트 모드</option>
              <option value="on">다크 모드</option>
              <option value="system">시스템 따라가기</option>
              <option value="time">시간별 자동 (18시~6시)</option>
            </select>
          </Row>

          {/* 고급 비주얼 스타일 — 접이식 */}
          <details style={{ marginTop: 12 }}>
            <summary style={{ fontSize: 12, fontWeight: 700, color: '#9ca3af', cursor: 'pointer', padding: '8px 0', userSelect: 'none' }}>
              🎛️ 고급 비주얼 설정 (선택사항)
            </summary>
            <div style={{ marginTop: 8 }}>
              <Row label="모서리 둥글기" desc={`${theme.borderRadius ?? 10}px`}>
                <input type="range" min={0} max={24} value={theme.borderRadius ?? 10}
                  onChange={e => actions.setTheme({ borderRadius: Number(e.target.value), borderRadiusSm: Math.max(1, Math.round(Number(e.target.value) * 0.6)), preset: 'custom' })}
                  style={{ width: 100, accentColor: theme.accentColor }} />
              </Row>
              <Row label="그림자">
                <select value={theme.shadowStyle || 'subtle'}
                  onChange={e => actions.setTheme({ shadowStyle: e.target.value, preset: 'custom' })}
                  style={{ ...inputStyle, width: 110 }}>
                  <option value="none">없음</option>
                  <option value="subtle">은은한</option>
                  <option value="medium">보통</option>
                  <option value="elevated">깊은</option>
                </select>
              </Row>
              <Row label="위젯 배경">
                <select value={theme.widgetBgStyle || 'solid'}
                  onChange={e => actions.setTheme({ widgetBgStyle: e.target.value, preset: 'custom' })}
                  style={{ ...inputStyle, width: 110 }}>
                  <option value="solid">기본</option>
                  <option value="glass">글래스</option>
                  <option value="gradient">그래디언트</option>
                  <option value="flat">플랫</option>
                </select>
              </Row>
              {theme.widgetBgStyle === 'glass' && (
                <Row label="블러" desc={`${theme.backdropBlur ?? 0}px`}>
                  <input type="range" min={0} max={20} value={theme.backdropBlur ?? 0}
                    onChange={e => actions.setTheme({ backdropBlur: Number(e.target.value), preset: 'custom' })}
                    style={{ width: 100, accentColor: theme.accentColor }} />
                </Row>
              )}
              <Row label="테두리" desc={`${theme.borderWidth ?? 1}px`}>
                <input type="range" min={0} max={3} value={theme.borderWidth ?? 1}
                  onChange={e => actions.setTheme({ borderWidth: Number(e.target.value), preset: 'custom' })}
                  style={{ width: 80, accentColor: theme.accentColor }} />
              </Row>
            </div>
          </details>

          <SectionTitle>글꼴</SectionTitle>
          <Row label="글꼴 종류" desc={fontLoading ? '폰트 목록 로딩 중...' : systemFonts.length > 0 ? `${systemFonts.length}개 감지` : ''}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, width: 220 }}>
              <select
                value={theme.fontFamily || 'Malgun Gothic'}
                onChange={e => actions.setTheme({ fontFamily: e.target.value })}
                style={{ ...inputStyle, cursor: 'pointer' }}
              >
                <optgroup label="추천 폰트">
                  {['Malgun Gothic', 'Noto Sans KR', 'Nanum Gothic', 'Nanum Myeongjo',
                    'Pretendard', 'Spoqa Han Sans Neo', 'D2Coding'].map(f =>
                    <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>
                  )}
                </optgroup>
                {systemFonts.length > 0 && (
                  <optgroup label="설치된 폰트">
                    {systemFonts
                      .filter(f => !['Malgun Gothic','Noto Sans KR','Nanum Gothic','Nanum Myeongjo','Pretendard','Spoqa Han Sans Neo','D2Coding'].includes(f))
                      .map(f => <option key={f} value={f}>{f}</option>)}
                  </optgroup>
                )}
              </select>
              <div style={{ fontFamily: `'${theme.fontFamily || 'Malgun Gothic'}', sans-serif`, fontSize: 12, color: '#6b7280', padding: '4px 8px', background: '#f9fafb', borderRadius: 6, border: '1px solid #e5e7eb' }}>
                가나다라마바사 AaBbCc 123 미리보기
              </div>
            </div>
          </Row>
          <Row label="글꼴 크기" desc={`${theme.fontSize || 13}px`}>
            <input type="range" min={10} max={18} value={theme.fontSize || 13}
              onChange={e => actions.setTheme({ fontSize: Number(e.target.value) })}
              style={{ width: 100, accentColor: theme.accentColor }} />
          </Row>

          <SectionTitle>배경</SectionTitle>
          <Row label="배경 이미지" desc="파일 선택 또는 URL">
            <div style={{ display: 'flex', gap: 4 }}>
              <button onClick={() => {
                const fi = document.createElement('input'); fi.type = 'file'; fi.accept = 'image/*';
                fi.onchange = (ev) => {
                  const reader = new FileReader();
                  reader.onload = (r) => actions.setTheme({ bgImage: r.target.result });
                  reader.readAsDataURL(ev.target.files[0]);
                };
                fi.click();
              }} style={{ background: theme.accentColor, color: '#fff', border: 'none', borderRadius: 6, padding: '6px 10px', cursor: 'pointer', fontSize: 12 }}>📷 파일</button>
              <DebouncedInput placeholder="https://..." value={(theme.bgImage || '').startsWith('data:') ? '(파일 선택됨)' : (theme.bgImage || '')}
                onCommit={v => actions.setTheme({ bgImage: v })}
                style={{ ...inputStyle, width: 140 }} />
              {theme.bgImage && <button onClick={() => actions.setTheme({ bgImage: '' })} style={{ background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: 6, padding: '6px 8px', cursor: 'pointer', fontSize: 11 }}>✕</button>}
            </div>
          </Row>
          <Row label="위젯 투명도" desc={`${theme.widgetOpacity || 95}%`}>
            <input type="range" min={30} max={100} value={theme.widgetOpacity || 95}
              onChange={e => actions.setTheme({ widgetOpacity: Number(e.target.value) })}
              style={{ width: 100, accentColor: theme.accentColor }} />
          </Row>

          <SectionTitle>시스템</SectionTitle>
          <Row label="작업표시줄 숨기기" desc="앱 사용 중 Windows 작업표시줄을 숨깁니다">
            <button onClick={() => {
              const next = !taskbarHidden;
              setTaskbarHidden(next);
              localStorage.setItem('taskbar-hidden', String(next));
              window.dispatchEvent(new Event('taskbar-toggled'));
              if (window.electronAPI?.system?.taskbar) {
                window.electronAPI.system.taskbar(!next); // true=show, false=hide
              }
            }} style={{
              width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer', position: 'relative',
              background: taskbarHidden ? theme.accentColor : '#d1d5db', transition: 'background 0.2s'
            }}>
              <div style={{
                position: 'absolute', top: 2, left: taskbarHidden ? 22 : 2,
                width: 20, height: 20, borderRadius: '50%', background: '#fff',
                transition: 'left 0.2s', boxShadow: '0 1px 4px rgba(0,0,0,0.2)'
              }} />
            </button>
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
          {(schedule.periods || []).length === 0 ? (
            <div style={{ background: '#fef3c7', borderRadius: 8, padding: '12px', fontSize: 12, color: '#92400e', border: '1px solid #fde68a', marginBottom: 10 }}>
              ⚠️ 교시 데이터가 없습니다. 아래 "기본 일과 복원" 버튼을 눌러주세요.
              <button onClick={() => {
                // 충남삼성고 기본 일과표 복원
                const defaultPeriods = [
                  { id: 1, name: '1교시', start: '08:40', end: '09:30', type: 'class' },
                  { id: 2, name: '쉬는시간', start: '09:30', end: '09:40', type: 'break' },
                  { id: 3, name: '2교시', start: '09:40', end: '10:30', type: 'class' },
                  { id: 4, name: '쉬는시간', start: '10:30', end: '10:40', type: 'break' },
                  { id: 5, name: '3교시', start: '10:40', end: '11:30', type: 'class' },
                  { id: 6, name: '4교시A/점심B', start: '11:30', end: '12:30', type: 'lunch' },
                  { id: 7, name: '4교시B/점심A', start: '12:30', end: '13:30', type: 'lunch' },
                  { id: 8, name: '5교시', start: '13:30', end: '14:20', type: 'class' },
                  { id: 9, name: '쉬는시간', start: '14:20', end: '14:30', type: 'break' },
                  { id: 10, name: '6교시', start: '14:30', end: '15:20', type: 'class' },
                  { id: 11, name: '쉬는시간', start: '15:20', end: '15:30', type: 'break' },
                  { id: 12, name: '7교시', start: '15:30', end: '16:20', type: 'class' },
                  { id: 13, name: '종례', start: '16:20', end: '16:30', type: 'event' },
                  { id: 14, name: 'ET', start: '16:50', end: '18:10', type: 'extra' },
                  { id: 15, name: '석식', start: '18:10', end: '19:10', type: 'dinner' },
                  { id: 16, name: 'EP1', start: '19:20', end: '20:50', type: 'extra' },
                  { id: 17, name: 'EP2', start: '21:10', end: '22:30', type: 'extra' }
                ];
                actions.setSchedule({ periods: defaultPeriods });
              }} style={{ display: 'block', marginTop: 8, background: '#f59e0b', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 14px', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>
                🔄 기본 일과 복원
              </button>
            </div>
          ) : (
          <div style={{ background: '#f9fafb', borderRadius: 12, overflow: 'hidden' }}>
            {(schedule.periods || []).map((p, idx) => {
              if (!p || typeof p !== 'object') return null;
              return (
              <div key={p.id || idx} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', borderBottom: '0.5px solid #e5e7eb' }}>
                <div style={{ flex: 1, fontSize: 13, fontWeight: 500, color: '#374151' }}>{String(p.name || `교시 ${idx + 1}`)}</div>
                <input type="time" value={p.start || ''}
                  onChange={e => {
                    const newPeriods = [...(schedule.periods || [])];
                    newPeriods[idx] = { ...p, start: e.target.value };
                    actions.setSchedule({ periods: newPeriods });
                  }}
                  style={{ ...inputStyle, width: 'auto', padding: '5px 8px', fontSize: 13 }}
                />
                <span style={{ color: '#9ca3af' }}>~</span>
                <input type="time" value={p.end || ''}
                  onChange={e => {
                    const newPeriods = [...(schedule.periods || [])];
                    newPeriods[idx] = { ...p, end: e.target.value };
                    actions.setSchedule({ periods: newPeriods });
                  }}
                  style={{ ...inputStyle, width: 'auto', padding: '5px 8px', fontSize: 13 }}
                />
              </div>
              );
            })}
          </div>
          )}

          <SectionTitle>주간 시간표 (과목표)</SectionTitle>
          <div style={{ background: '#eff6ff', borderRadius: 8, padding: '10px 12px', marginBottom: 10, fontSize: 12, color: '#1e40af', border: '1px solid #bfdbfe' }}>
            📋 엑셀(.xlsx/.xls) 또는 CSV 시간표 파일을 가져올 수 있습니다.<br/>
            헤더(교시,월,화,수,목,금)를 자동으로 찾고, 교시당 3행(과목/교사/교실) 형식도 지원합니다.
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <button onClick={() => {
              const fi = document.createElement('input'); fi.type = 'file'; fi.accept = '.csv,.txt,.xls,.xlsx';
              fi.onchange = (ev) => {
                const file = ev.target.files[0];
                if (!file) return;
                const ext = file.name.split('.').pop().toLowerCase();
                const isExcel = ext === 'xls' || ext === 'xlsx';

                // 공통 파싱: 2D 배열 → 시간표 객체
                const parseRows = (allLines) => {
                  const DAY_NAMES = ['월','화','수','목','금'];
                  let headerIdx = 0;
                  for (let i = 0; i < Math.min(allLines.length, 20); i++) {
                    if (allLines[i].filter(c => DAY_NAMES.includes(String(c||'').trim())).length >= 3) { headerIdx = i; break; }
                  }
                  const header = (allLines[headerIdx] || []).map(c => String(c||'').trim());
                  const dayColIdx = DAY_NAMES.map((d,i) => { const idx = header.indexOf(d); return idx >= 0 ? idx : i+1; });
                  const dataLines = allLines.slice(headerIdx + 1);
                  const PERIOD_IDS = [1,2,3,'4A','4B',5,6,7];
                  const getPeriodId = (idx) => PERIOD_IDS[idx] !== undefined ? PERIOD_IDS[idx] : idx + 1;
                  const tt = { mon:[], tue:[], wed:[], thu:[], fri:[] };
                  const days = ['mon','tue','wed','thu','fri'];
                  const nonBlank = dataLines.filter(r => r.some(c => String(c||'').trim()));
                  const periodNumCount = nonBlank.filter(r => /^\d+$/.test(String(r[0]||'').trim())).length;
                  const isMultiRow = periodNumCount > 0 && nonBlank.length / periodNumCount >= 2;
                  if (isMultiRow) {
                    let pi = 0;
                    for (let i = 0; i < dataLines.length; i += 3) {
                      const cols = (dataLines[i]||[]).map(c => String(c||'').trim());
                      const pid = getPeriodId(pi++);
                      days.forEach((d,di) => { const s = cols[dayColIdx[di]]||''; if(s) tt[d].push({period:pid, subject:s, class:'', room:''}); });
                    }
                  } else {
                    let pi = 0;
                    nonBlank.forEach(row => {
                      const cols = row.map(c => String(c||'').trim());
                      const pid = getPeriodId(pi++);
                      days.forEach((d,di) => { const s = cols[dayColIdx[di]]||''; if(s) tt[d].push({period:pid, subject:s, class:'', room:''}); });
                    });
                  }
                  return { tt, days };
                };

                if (isExcel) {
                  const reader = new FileReader();
                  reader.onload = async (r) => {
                    try {
                      const XLSX = await import('xlsx');
                      const wb = XLSX.read(r.target.result, { type: 'array' });
                      const ws = wb.Sheets[wb.SheetNames[0]];
                      const allLines = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
                      const { tt, days } = parseRows(allLines);
                      actions.setTimetable(tt);
                      alert(`엑셀 시간표 적용 완료! (${Math.max(...days.map(d=>tt[d].length))}교시, ${file.name})`);
                    } catch(e) { alert('엑셀 오류: ' + e.message); }
                  };
                  reader.readAsArrayBuffer(file);
                } else {
                  const reader = new FileReader();
                  reader.onload = (r) => {
                    try {
                      const text = r.target.result.replace(/^\uFEFF/, '').trim();
                      const allLines = text.split(/\r?\n/).map(l => l.split(',').map(c => c.trim().replace(/^"|"$/g, '')));
                      const { tt, days } = parseRows(allLines);
                      actions.setTimetable(tt);
                      alert(`시간표 적용 완료! (${Math.max(...days.map(d=>tt[d].length))}교시)`);
                    } catch(e) { alert('파일 오류: ' + e.message); }
                  };
                  reader.readAsText(file, 'utf-8');
                }
              };
              fi.click();
            }} style={{ background: theme.accentColor, color: '#fff', border: 'none', borderRadius: 8, padding: '8px 14px', cursor: 'pointer', fontSize: 13 }}>
              📂 시간표 가져오기 (Excel/CSV)
            </button>
            <button onClick={() => {
              const days = ['mon','tue','wed','thu','fri'];
              const tt = state.timetable || {};
              const maxLen = Math.max(...days.map(d => (tt[d]||[]).length), 0);
              const rows = [['교시','월','화','수','목','금']];
              for (let i = 0; i < maxLen; i++) {
                rows.push([i+1, ...days.map(d => {
                  const cell = (tt[d]||[])[i];
                  return cell?.subject || (typeof cell === 'string' ? cell : '');
                })]);
              }
              const csv = rows.map(r => r.join(',')).join('\n');
              const blob = new Blob(['\uFEFF'+csv], { type: 'text/csv' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a'); a.href = url; a.download = '시간표.csv'; a.click();
              URL.revokeObjectURL(url);
            }} style={{ background: '#f3f4f6', border: 'none', borderRadius: 8, padding: '8px 14px', cursor: 'pointer', fontSize: 13, color: '#374151' }}>
              📤 CSV 내보내기
            </button>
          </div>
          {/* 현재 시간표 미리보기 */}
          {(() => {
            const tt = state.timetable || {};
            const days = ['mon','tue','wed','thu','fri'];
            const labels = ['월','화','수','목','금'];
            const maxLen = Math.max(...days.map(d => (tt[d]||[]).length), 0);
            if (maxLen === 0) return <div style={{ fontSize: 12, color: '#9ca3af' }}>등록된 시간표 없음</div>;
            return (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>{['교시',...labels].map(h => <th key={h} style={{ padding: '4px 6px', background: '#f3f4f6', border: '0.5px solid #e5e7eb', color: '#374151' }}>{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {Array.from({length: maxLen}, (_,i) => (
                      <tr key={i}>
                        <td style={{ padding: '4px 6px', border: '0.5px solid #e5e7eb', textAlign: 'center', color: '#6b7280', fontWeight: 600 }}>{i+1}</td>
                        {days.map(d => (
                          <td key={d} style={{ padding: '4px 6px', border: '0.5px solid #e5e7eb', textAlign: 'center' }}>{(() => { const cell = (tt[d]||[])[i]; return cell?.subject || (typeof cell === 'string' ? cell : ''); })()}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })()}
        </div>
      );

      case 'google': return (
        <div>
          <SectionTitle>계정 연결</SectionTitle>
          <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: '12px 14px', marginBottom: 14, fontSize: 12, color: '#1e40af' }}>
            🔗 Google 계정으로 로그인하면 <strong>캘린더·Gmail·Drive·할일</strong>을 연동할 수 있습니다.<br/>
            별도 설정 없이 아래 버튼만 누르면 됩니다.
          </div>
          {!google.connected ? (<>
            <SettingsGoogleLoginButton actions={actions} clientSecret="" />
          </>) : (
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

              {/* ── 캘린더 선택 ── */}
              {(google.services?.calendar ?? true) && (
                <CalendarSelector google={google} actions={actions} theme={theme} />
              )}
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

      case 'ai': {
        const AI_PROVIDERS = [
          { id: 'gemini',      label: 'Gemini',      color: '#4285f4', badge: '무료',  desc: 'Google AI',          models: ['gemini-2.0-flash','gemini-1.5-flash','gemini-1.5-pro'] },
          { id: 'groq',        label: 'Groq',        color: '#f55036', badge: '무료',  desc: '초고속 오픈소스',      models: ['llama-3.3-70b-versatile','llama-3.1-8b-instant','mixtral-8x7b-32768','gemma2-9b-it'] },
          { id: 'claude',      label: 'Claude',      color: '#d97706', badge: null,   desc: 'Anthropic',           models: ['claude-sonnet-4-6','claude-opus-4-6','claude-haiku-4-5-20251001'] },
          { id: 'openai',      label: 'GPT',         color: '#10b981', badge: null,   desc: 'OpenAI',              models: ['gpt-4o-mini','gpt-4o','gpt-4-turbo'] },
          { id: 'openrouter',  label: 'OpenRouter',  color: '#6366f1', badge: '무료모델↑', desc: '100+ 모델',       models: ['meta-llama/llama-3.3-70b-instruct:free','google/gemini-2.0-flash-exp:free','mistralai/mistral-7b-instruct:free'] },
          { id: 'ollama',      label: 'Ollama',      color: '#374151', badge: '로컬',  desc: '인터넷 없이 AI',       models: ['llama3.2','llama3.1','mistral','gemma2','phi3'] },
        ];

        const GUIDES = {
          gemini: { color: '#eff6ff', border: '#bfdbfe', text: '#1e40af', steps: ['Google AI Studio (aistudio.google.com/apikey) 접속', 'Google 계정으로 로그인', '"API 키 만들기" 클릭 → 키 복사'], note: '✅ 무료 (일 1,500회 요청)', url: 'https://aistudio.google.com/apikey' },
          groq:   { color: '#fff7ed', border: '#fed7aa', text: '#9a3412', steps: ['console.groq.com 접속 후 회원가입', '좌측 "API Keys" → "Create API Key"', '생성된 키 복사'], note: '✅ 무료 (분당 30회) — Llama3·Mixtral 사용 가능', url: 'https://console.groq.com' },
          claude: { color: '#fffbeb', border: '#fde68a', text: '#92400e', steps: ['console.anthropic.com 접속', '"API Keys" → "Create Key"', '생성된 키 복사'], note: '💳 유료 (크레딧 충전 필요)', url: 'https://console.anthropic.com' },
          openai: { color: '#f0fdf4', border: '#bbf7d0', text: '#14532d', steps: ['platform.openai.com 접속', '"API Keys" → "Create new secret key"', '생성된 키 복사'], note: '💳 유료 (크레딧 충전 필요) — gpt-4o-mini 저렴', url: 'https://platform.openai.com/api-keys' },
          openrouter: { color: '#f5f3ff', border: '#ddd6fe', text: '#4c1d95', steps: ['openrouter.ai 접속 후 회원가입', '"Keys" → "Create Key"', '생성된 키 복사'], note: '✅ 무료 모델 다수 포함 (:free 모델 선택 시)', url: 'https://openrouter.ai/keys' },
          ollama: { color: '#f8fafc', border: '#e2e8f0', text: '#1e293b', steps: ['ollama.com 에서 앱 설치', '터미널에서 원하는 모델 실행: ollama pull llama3.2', '앱 실행 후 아래 URL이 자동 감지됨'], note: '✅ 완전 무료 · 인터넷 불필요 · 데이터 외부 유출 없음', url: 'https://ollama.com' },
        };

        const selectedProvider = AI_PROVIDERS.find(p => p.id === ai.provider) || AI_PROVIDERS[0];
        const guide = GUIDES[ai.provider];
        const openUrl = (url) => { if (window.electronAPI) window.electronAPI.shell.openExternal(url); else window.open(url, '_blank'); };

        return (
          <div>
            <SectionTitle>AI 기능 활성화</SectionTitle>
            <Row label="AI Plus 기능 사용">
              <Toggle value={ai.enabled} onChange={v => actions.setAI({ enabled: v })} />
            </Row>
            {ai.enabled && (<>
              <SectionTitle>제공자 선택</SectionTitle>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 16 }}>
                {AI_PROVIDERS.map(p => (
                  <button key={p.id} onClick={() => actions.setAI({ provider: p.id, model: p.models[0] })}
                    style={{
                      border: `2px solid ${ai.provider === p.id ? p.color : '#e5e7eb'}`,
                      borderRadius: 10, padding: '10px 6px',
                      background: ai.provider === p.id ? p.color + '15' : '#fff',
                      cursor: 'pointer', textAlign: 'center',
                    }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: ai.provider === p.id ? p.color : '#374151' }}>{p.label}</div>
                    <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 2 }}>{p.desc}</div>
                    {p.badge && <div style={{ fontSize: 9, background: p.color, color: '#fff', borderRadius: 4, padding: '1px 5px', marginTop: 3, display: 'inline-block' }}>{p.badge}</div>}
                  </button>
                ))}
              </div>

              {/* 모델 선택 */}
              <SectionTitle>모델</SectionTitle>
              <select value={ai.model || selectedProvider.models[0]}
                onChange={e => actions.setAI({ model: e.target.value })}
                style={inputStyle}>
                {selectedProvider.models.map(m => <option key={m} value={m}>{m}</option>)}
                <option value="__custom__">직접 입력...</option>
              </select>
              {(ai.model === '__custom__' || !selectedProvider.models.includes(ai.model)) && ai.model !== '' && (
                <DebouncedInput placeholder="모델명 직접 입력 (예: llama3:latest)" value={ai.model === '__custom__' ? '' : ai.model}
                  onCommit={v => actions.setAI({ model: v })}
                  style={{ ...inputStyle, marginTop: 6 }} />
              )}

              {/* Ollama URL */}
              {ai.provider === 'ollama' && (
                <>
                  <SectionTitle>Ollama 서버 주소</SectionTitle>
                  <DebouncedInput placeholder="http://localhost:11434" value={ai.ollamaUrl || 'http://localhost:11434'}
                    onCommit={v => actions.setAI({ ollamaUrl: v })}
                    style={inputStyle} />
                </>
              )}

              {/* API 키 (Ollama 제외) */}
              {ai.provider !== 'ollama' && (<>
                <SectionTitle>API 키</SectionTitle>
                <DebouncedInput type="password" placeholder="API 키를 입력하세요"
                  value={ai.apiKey} onCommit={v => actions.setAI({ apiKey: v })}
                  style={inputStyle} />
                <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 5 }}>🔒 이 기기에만 저장됩니다</div>
              </>)}

              {/* 발급 가이드 */}
              {guide && (
                <div style={{ background: guide.color, border: `1px solid ${guide.border}`, borderRadius: 10, padding: '12px 14px', marginTop: 14 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: guide.text, marginBottom: 8 }}>
                    📋 {selectedProvider.label} {ai.provider === 'ollama' ? '설치 방법' : 'API 키 발급'}
                  </div>
                  <div style={{ fontSize: 12, color: guide.text, lineHeight: 1.9 }}>
                    {guide.steps.map((s, i) => <div key={i}>{i+1}. {s}</div>)}
                  </div>
                  <div style={{ fontSize: 11, color: guide.text, marginTop: 8, opacity: 0.8 }}>{guide.note}</div>
                  <button onClick={() => openUrl(guide.url)}
                    style={{ marginTop: 10, background: guide.text, color: '#fff', border: 'none', borderRadius: 7, padding: '7px 14px', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>
                    🔗 바로가기
                  </button>
                </div>
              )}
            </>)}
          </div>
        );
      }

      case 'notifications': return (
        <div>
          <SectionTitle>알림 설정</SectionTitle>
          {[
            { key: 'classReminder', label: '수업 시작 5분 전 알림 (시간표 과목명 포함)' },
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
          <SectionTitle>전광판 Google Sheets 연동</SectionTitle>
          <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 14, background: '#eff6ff', borderRadius: 8, padding: '8px 12px', border: '1px solid #bfdbfe' }}>
            📡 아래 URL은 <strong>전광판 마퀴 바 · 전광판1 · 전광판2</strong> 모두 공유합니다.<br />
            위젯별 표시 여부는 <strong>설정 → 위젯</strong> 탭에서 켜고 끄세요.
          </div>
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: '#374151', marginBottom: 6 }}>Google Sheets URL</div>
            <DebouncedInput placeholder="https://docs.google.com/spreadsheets/..."
              value={noticeboard.googleSheetUrl}
              onCommit={v => actions.setNoticeboard({ googleSheetUrl: v })}
              style={inputStyle}
            />
            <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 6 }}>
              구글 시트 우측 상단 [공유] → 링크 있는 모든 사용자 → 링크 복사 후 붙여넣기
            </div>
          </div>
          <div style={{ fontSize: 12, color: '#374151', background: '#f0fdf4', borderRadius: 8, padding: '10px 12px', border: '1px solid #bbf7d0', marginBottom: 14 }}>
            📋 <strong>시트 형식</strong><br />
            • <strong>A열</strong>: 내용 (표시할 공지 텍스트)<br />
            • <strong>B열</strong>: 순서 (숫자, 낮을수록 먼저 표시)<br />
            • 1행: 헤더 (내용, 순서)
          </div>
          <Row label="새로고침 주기" desc={`현재: ${noticeboard.refreshInterval}초`}>
            <input type="number" min="5" max="60" value={noticeboard.refreshInterval}
              onChange={e => actions.setNoticeboard({ refreshInterval: Number(e.target.value) })}
              style={{ ...inputStyle, width: 80 }}
            />
          </Row>
          <div style={{ marginTop: 14, padding: '10px 12px', background: '#f9fafb', borderRadius: 8, border: '1px solid #e5e7eb' }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 8 }}>위젯별 표시 설정</div>
            <Row label="📡 전광판 마퀴 바 (상단바 아래)">
              <Toggle value={state.widgets.noticeboard} onChange={v => actions.setWidgets({ noticeboard: v })} />
            </Row>
            <Row label="📺 전광판1 (슬라이드 위젯)">
              <Toggle value={state.widgets.noticeboard1 ?? false} onChange={v => actions.setWidgets({ noticeboard1: v })} />
            </Row>
            <Row label="📋 전광판2 (카드형 위젯)">
              <Toggle value={state.widgets.noticeboard2 ?? false} onChange={v => actions.setWidgets({ noticeboard2: v })} />
            </Row>
          </div>
        </div>
      );

      case 'profile': return (
        <div>
          <SectionTitle>기본 정보</SectionTitle>
          <Row label="이름">
            <DebouncedInput value={user.name} onCommit={v => actions.setUser({ name: v })} style={{ ...inputStyle, width: 160 }} />
          </Row>
          <Row label="학교 / 직장명">
            <DebouncedInput value={user.school} onCommit={v => actions.setUser({ school: v })} style={{ ...inputStyle, width: 200 }} />
          </Row>
          <Row label="온보딩 다시 보기" desc="첫 설정 화면부터 다시 시작합니다">
            <button onClick={async () => {
              if (window.electronAPI?.resetOnboarding) {
                await window.electronAPI.resetOnboarding();
              }
              actions.setUser({ setupComplete: false });
              close();
            }}
              style={{ background: '#fee2e2', border: 'none', borderRadius: 8, padding: '8px 14px', cursor: 'pointer', fontSize: 13, color: '#dc2626', fontWeight: 600 }}>
              초기 설정 다시 시작
            </button>
          </Row>

          <SectionTitle>위젯 프리셋</SectionTitle>
          <Row label="현재 배치 저장">
            <button onClick={() => {
              const name = prompt('프리셋 이름 (예: 수업 모드):');
              if (!name) return;
              const layout = localStorage.getItem('widget-layout') || '{}';
              const presets = { ...(state.layoutPresets || {}), [name]: { layout: JSON.parse(layout), widgets } };
              actions.setUI({ layoutPresets: presets });
              alert(`"${name}" 프리셋이 저장되었습니다.`);
            }} style={{ background: theme.accentColor, color: '#fff', border: 'none', borderRadius: 8, padding: '8px 14px', cursor: 'pointer', fontSize: 13 }}>
              💾 저장
            </button>
          </Row>
          {Object.keys(state.layoutPresets || {}).map(name => (
            <Row key={name} label={`📋 ${name}`}>
              <div style={{ display: 'flex', gap: 4 }}>
                <button onClick={() => {
                  const preset = state.layoutPresets[name];
                  if (preset.layout) localStorage.setItem('widget-layout', JSON.stringify(preset.layout));
                  if (preset.widgets) actions.setWidgets(preset.widgets);
                  window.location.reload();
                }} style={{ background: '#f3f4f6', border: 'none', borderRadius: 6, padding: '6px 10px', cursor: 'pointer', fontSize: 12, color: '#374151' }}>적용</button>
                <button onClick={() => {
                  const presets = { ...state.layoutPresets }; delete presets[name];
                  actions.setUI({ layoutPresets: presets });
                }} style={{ background: '#fee2e2', border: 'none', borderRadius: 6, padding: '6px 8px', cursor: 'pointer', fontSize: 12, color: '#dc2626' }}>삭제</button>
              </div>
            </Row>
          ))}

          <SectionTitle>설정 백업</SectionTitle>
          <div style={{ background: '#fffbeb', borderRadius: 8, padding: '10px 12px', marginBottom: 12, fontSize: 12, color: '#92400e', border: '1px solid #fde68a' }}>
            ⚠️ API 키, 구글 토큰 등 개인 인증 정보는 백업에 포함되지 않습니다.
          </div>
          <Row label="전체 설정 내보내기" desc="민감정보 제외 JSON 파일">
            <button onClick={() => {
              const { ai: aiState, google: g, microsoft: ms, community: com, cache: _cache, ui: _ui, ...rest } = state;
              const safe = {
                ...rest,
                ai: { enabled: aiState.enabled, provider: aiState.provider },
                google: { connected: false },
                microsoft: { connected: false },
                community: { username: com?.username || '', groups: [] }
              };
              const blob = new Blob([JSON.stringify(safe, null, 2)], { type: 'application/json' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a'); a.href = url;
              a.download = `smart-desktop-backup-${new Date().toISOString().slice(0,10)}.json`; a.click();
              URL.revokeObjectURL(url);
            }} style={{ background: theme.accentColor, color: '#fff', border: 'none', borderRadius: 8, padding: '8px 14px', cursor: 'pointer', fontSize: 13 }}>
              📤 백업 파일 저장
            </button>
          </Row>
          <SectionTitle>업데이트</SectionTitle>
          <Row label="현재 버전" desc="설치된 앱 버전">
            <span style={{ fontSize: 13, fontWeight: 600, color: theme.accentColor }}>v{window.electronAPI?.appVersion || '개발 모드'}</span>
          </Row>
          <Row label="업데이트 확인" desc="새 버전이 있는지 확인합니다">
            <button onClick={async () => {
              if (window.electronAPI?.update?.check) {
                await window.electronAPI.update.check();
                // 약간의 딜레이 후 결과 표시 (update-available 이벤트로 처리됨)
                setTimeout(() => {
                  alert('업데이트 확인을 완료했습니다.\n새 버전이 있으면 앱 하단에 알림이 표시됩니다.');
                }, 2000);
              } else {
                window.open('https://github.com/wizbeee/smart-teacher-desktop/releases', '_blank');
              }
            }} style={{ background: theme.accentColor, color: '#fff', border: 'none', borderRadius: 8, padding: '8px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
              🔄 업데이트 확인
            </button>
          </Row>
          <Row label="GitHub Releases" desc="최신 릴리즈 페이지">
            <button onClick={() => {
              const url = 'https://github.com/wizbeee/smart-teacher-desktop/releases';
              if (window.electronAPI?.shell) window.electronAPI.shell.openExternal(url);
              else window.open(url, '_blank');
            }} style={{ background: '#f3f4f6', border: 'none', borderRadius: 8, padding: '8px 14px', cursor: 'pointer', fontSize: 13, color: '#374151' }}>
              🌐 릴리즈 페이지 열기
            </button>
          </Row>

          <Row label="설정 복원" desc="이전에 내보낸 파일 선택">
            <button onClick={() => {
              const fi = document.createElement('input'); fi.type = 'file'; fi.accept = '.json';
              fi.onchange = (ev) => {
                const reader = new FileReader();
                reader.onload = (r) => {
                  try {
                    const data = JSON.parse(r.target.result);
                    // 민감 정보는 덮어쓰지 않음
                    const { ai: _a, google: _g, microsoft: _ms, community: _c, cache: _cache, ui: _ui, ...safe } = data;
                    const SAFE_KEYS = ['user','theme','schedule','timetable','ddays','todos','memos','favorites','desktopZones','notifications','widgets','quickPhrases','layoutPresets','weather','meal','noticeboard','focus'];
                    if (window.electronAPI) {
                      // Electron 모드: store에 직접 저장
                      SAFE_KEYS.forEach(k => { if (safe[k] !== undefined) window.electronAPI.store.set(k, safe[k]); });
                    } else {
                      // 브라우저 모드: localStorage 저장
                      const toSave = {};
                      SAFE_KEYS.forEach(k => { if (safe[k] !== undefined) toSave[k] = safe[k]; });
                      localStorage.setItem('smart-desktop', JSON.stringify(toSave));
                    }
                    alert('설정이 복원되었습니다! 앱을 새로고침합니다.');
                    window.location.reload();
                  } catch { alert('잘못된 백업 파일입니다.'); }
                };
                reader.readAsText(ev.target.files[0]);
              };
              fi.click();
            }} style={{ background: '#f3f4f6', border: 'none', borderRadius: 8, padding: '8px 14px', cursor: 'pointer', fontSize: 13, color: '#374151' }}>
              📥 백업 파일 불러오기
            </button>
          </Row>
        </div>
      );

      case 'widgets': {
        const allWidgets = [
          { key: 'timetable',     label: '📋 주간 시간표', cat: '수업' },
          { key: 'calendar',      label: '📅 캘린더', cat: '일정' },
          { key: 'todos',         label: '✅ 할 일', cat: '일정' },
          { key: 'dday',          label: '📆 D-Day', cat: '일정' },
          { key: 'weekschedule',  label: '🗓 주간 일정', cat: '일정' },
          { key: 'exam',          label: '📝 고사 일정', cat: '수업' },
          { key: 'progress',      label: '📊 수업 진도표', cat: '수업' },
          { key: 'weather',       label: '🌤️ 날씨', cat: '정보' },
          { key: 'meal',          label: '🍽️ 급식', cat: '정보' },
          { key: 'mail',          label: '📧 받은 메일', cat: '소통' },
          { key: 'memo',          label: '📝 메모', cat: '도구' },
          { key: 'quicklinks',    label: '⭐ 바로가기', cat: '도구' },
          { key: 'recentfiles',   label: '📂 최근 문서', cat: '도구' },
          { key: 'fileexplorer',  label: '📂 파일 탐색기', cat: '도구' },
          { key: 'quickphrases',  label: '💬 자주 쓰는 문구', cat: '도구' },
          { key: 'quote',         label: '📖 오늘의 명언', cat: '기타' },
          { key: 'music',         label: '🎧 미디어/액자', cat: '기타' },
          { key: 'stopwatch',     label: '⏱ 스톱워치/타이머', cat: '도구' },
          { key: 'calc',          label: '🔢 계산기', cat: '도구' },
          { key: 'randompick',    label: '🎲 랜덤 뽑기', cat: '수업' },
          { key: 'lessontimer',   label: '🎯 수업 타이머', cat: '수업' },
          { key: 'grading',       label: '📊 채점 계산기', cat: '수업' },
          { key: 'teachinglinks', label: '📎 수업 자료', cat: '수업' },
          { key: 'aichat',        label: '🤖 AI 채팅', cat: '도구' },
          { key: 'neisalert',     label: '📋 NEIS 공문', cat: '정보' },
          { key: 'noticeboard',   label: '📡 전광판 (상단바 버튼)', cat: '소통' },
          { key: 'noticeboard2',  label: '📋 전광판2 (카드형 위젯)', cat: '소통' },
          { key: 'system',        label: '🖥️ 시스템 제어', cat: '기타' },
          { key: 'focus',         label: '🎯 포커스 모드', cat: '기타' },
          { key: 'clock',         label: '🕐 시계', cat: '기타' },
          { key: 'currentPeriod', label: '📚 지금 이 시간', cat: '수업' },
          // ── 신규 위젯 ──
          { key: 'timeline',      label: '📊 타임라인 뷰', cat: '일정' },
          { key: 'dualtz',        label: '🌍 세계 시계', cat: '정보' },
          { key: 'eventtemplate', label: '📋 일정 템플릿', cat: '일정' },
          { key: 'journal',       label: '📓 일일 저널', cat: '도구' },
          { key: 'stickynote',    label: '📌 스티커 노트', cat: '도구' },
          { key: 'habit',         label: '🔥 습관 트래커', cat: '생활' },
          { key: 'challenge',     label: '🎯 일일 챌린지', cat: '생활' },
          { key: 'kanban',        label: '📋 칸반 보드', cat: '도구' },
          { key: 'applauncher',   label: '🚀 앱 런처', cat: '도구' },
          { key: 'attendance',    label: '📋 출석 체크', cat: '수업' },
          { key: 'noisemeter',    label: '🎙 소음 측정기', cat: '수업' },
          { key: 'rotationtimer', label: '🔄 모둠 타이머', cat: '수업' },
          { key: 'scoreboard',    label: '🏆 팀 점수판', cat: '수업' },
          { key: 'streak',        label: '🔥 연속기록', cat: '생활' },
          { key: 'eyerest',       label: '👁 눈 휴식 알림', cat: '생활' },
          { key: 'water',         label: '💧 수분 섭취', cat: '생활' },
          { key: 'currency',      label: '💱 환율 변환', cat: '정보' },
          { key: 'graphview',     label: '🕸 그래프 뷰', cat: '도구' },
          { key: 'voicetodo',     label: '🎤 음성→할일', cat: '도구' },
          { key: 'photoframe',    label: '🖼 사진 프레임', cat: '기타' },
          { key: 'rssfeed',       label: '📰 뉴스 피드', cat: '정보' },
          { key: 'aisummary',     label: '📄 AI 요약', cat: '도구' },
          { key: 'xpbadge',       label: '🎮 업적 & XP', cat: '생활' },
          { key: 'stretch',       label: '🧘 스트레칭', cat: '생활' },
          { key: 'screentime',    label: '📱 스크린타임', cat: '생활' },
          { key: 'emailpreview',  label: '📬 메일 미리보기', cat: '정보' },
          { key: 'sysmonitor',    label: '💻 시스템 모니터', cat: '정보' },
          { key: 'countdown',     label: '⏳ 카운트다운', cat: '일정' },
          { key: 'network',       label: '🌐 네트워크', cat: '정보' },
          { key: 'storageinfo',   label: '💾 저장소', cat: '정보' },
          { key: 'ocr',           label: '🔍 텍스트 추출', cat: '도구' },
          { key: 'locreminder',   label: '📍 위치 알림', cat: '생활' },
          { key: 'unitconverter', label: '📐 단위 변환', cat: '도구' },
          { key: 'seatingchart',  label: '🪑 학급 좌석표', cat: '수업' },
          { key: 'metronome',     label: '🎵 메트로놈', cat: '수업' },
          { key: 'qrcode',        label: '📱 QR코드 생성', cat: '도구' },
          { key: 'classvote',     label: '🗳 학급 투표', cat: '수업' },
          { key: 'classbell',     label: '🔔 수업 종소리', cat: '수업' },
        ];
        // widgetSearch는 컴포넌트 최상위에서 선언됨
        const filtered = widgetSearch
          ? allWidgets.filter(w => w.label.includes(widgetSearch) || w.cat.includes(widgetSearch))
          : allWidgets;
        const onCount = allWidgets.filter(w => widgets?.[w.key] === true).length;

        return (
        <div>
          {/* 검색 + 전체 제어 */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
            <input placeholder="🔍 위젯 검색..." value={widgetSearch} onChange={e => setWidgetSearch(e.target.value)}
              style={{ ...inputStyle, flex: 1 }} />
            <div style={{ fontSize: 11, color: '#9ca3af', display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
              {onCount}/{allWidgets.length}
            </div>
          </div>

          {/* 카테고리별 표시 */}
          {['수업', '일정', '소통', '정보', '도구', '생활', '기타'].map(cat => {
            const items = filtered.filter(w => w.cat === cat);
            if (items.length === 0) return null;
            return (
              <div key={cat}>
                <SectionTitle>{cat}</SectionTitle>
                {items.map(w => (
                  <Row key={w.key} label={w.label}>
                    <Toggle value={widgets?.[w.key] === true}
                      onChange={v => actions.setWidgets({ [w.key]: v })} />
                  </Row>
                ))}
              </div>
            );
          })}
        </div>
        );
      }

      case 'weather': return (
        <div>
          <SectionTitle>위치 설정</SectionTitle>
          <Row label="지역명" desc="미세먼지 측정소 이름과 동일하게">
            <DebouncedInput value={weather.location}
              onCommit={v => actions.setWeather({ location: v })}
              style={{ ...inputStyle, width: 140 }}
              placeholder="예: 아산"
            />
          </Row>
          <Row label="위도">
            <DebouncedInput type="number" step="0.001" value={String(weather.lat)}
              onCommit={v => actions.setWeather({ lat: parseFloat(v) || 0 })}
              style={{ ...inputStyle, width: 120 }}
            />
          </Row>
          <Row label="경도">
            <DebouncedInput type="number" step="0.001" value={String(weather.lon)}
              onCommit={v => actions.setWeather({ lon: parseFloat(v) || 0 })}
              style={{ ...inputStyle, width: 120 }}
            />
          </Row>

          <SectionTitle>기상청 API (공공데이터포털)</SectionTitle>
          <div style={{ background: '#eff6ff', borderRadius: 8, padding: '10px 12px', marginBottom: 10, fontSize: 12, color: '#1e40af', border: '1px solid #bfdbfe' }}>
            🌤️ <b>기상청 단기예보</b> API를 사용하면 정확한 대한민국 날씨를 표시합니다.<br/>
            <a href="https://www.data.go.kr/data/15084084/openapi.do" target="_blank" rel="noreferrer" style={{ color: '#2563eb' }}>
              공공데이터포털에서 무료 발급 →
            </a>
          </div>
          <Row label="기상청 API 키" desc="일반 인증키(Decoding)">
            <DebouncedInput type="password" value={weather.kmaApiKey || ''}
              onCommit={v => actions.setWeather({ kmaApiKey: v })}
              style={{ ...inputStyle, width: 200 }}
              placeholder="공공데이터포털 인증키"
            />
          </Row>

          <SectionTitle>미세먼지 API (에어코리아)</SectionTitle>
          <div style={{ background: '#f0fdf4', borderRadius: 8, padding: '10px 12px', marginBottom: 10, fontSize: 12, color: '#166534', border: '1px solid #bbf7d0' }}>
            💨 에어코리아 API로 실시간 미세먼지를 표시합니다.<br/>
            <a href="https://www.data.go.kr/data/15073861/openapi.do" target="_blank" rel="noreferrer" style={{ color: '#16a34a' }}>
              공공데이터포털에서 무료 발급 →
            </a>
          </div>
          <Row label="에어코리아 API 키" desc="일반 인증키(Decoding)">
            <DebouncedInput type="password" value={weather.airApiKey || ''}
              onCommit={v => actions.setWeather({ airApiKey: v })}
              style={{ ...inputStyle, width: 200 }}
              placeholder="공공데이터포털 인증키"
            />
          </Row>

          <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 12, lineHeight: 1.6 }}>
            💡 API 키가 없으면 샘플 데이터가 표시됩니다<br/>
            💡 기상청 키만 입력하면 날씨는 실시간, 미세먼지는 샘플<br/>
            💡 두 키 모두 입력하면 완전한 실시간 날씨+미세먼지
          </div>
        </div>
      );

      case 'meal': return (
        <div>
          <SectionTitle>급식 설정 (NEIS)</SectionTitle>
          <Row label="교육청 코드" desc="예: J10 (충남)">
            <DebouncedInput value={meal.officeCode}
              onCommit={v => actions.setMeal({ officeCode: v })}
              style={{ ...inputStyle, width: 100 }}
            />
          </Row>
          <Row label="학교 코드" desc="예: J100005773 (충남삼성고)">
            <DebouncedInput value={meal.schoolCode}
              onCommit={v => actions.setMeal({ schoolCode: v })}
              style={{ ...inputStyle, width: 140 }}
            />
          </Row>
          <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 12 }}>
            💡 NEIS API 키가 없으면 샘플 메뉴가 표시됩니다<br />
            학교 코드는 나이스 홈페이지에서 확인할 수 있습니다
          </div>
        </div>
      );

      case 'community': {
        const fb = community.firebaseConfig || {};
        const isConnected = !!fb.apiKey;
        return (
          <div>
            <SectionTitle>내 정보</SectionTitle>
            <Row label="표시 이름">
              <DebouncedInput value={community.username || ''}
                onCommit={v => actions.setCommunity({ username: v })}
                placeholder="홍길동" style={{ ...inputStyle, width: 160 }} />
            </Row>
            <Row label="사용자 ID" desc="다른 사람이 메시지 보낼 때 사용">
              <DebouncedInput value={community.userId || ''}
                onCommit={v => actions.setCommunity({ userId: v })}
                placeholder="hong123" style={{ ...inputStyle, width: 160 }} />
            </Row>

            <SectionTitle>Firebase 연동</SectionTitle>
            <div style={{ background: isConnected ? '#f0fdf4' : '#fefce8', borderRadius: 10, padding: '10px 14px', marginBottom: 14, border: `1px solid ${isConnected ? '#bbf7d0' : '#fde68a'}`, fontSize: 12, color: isConnected ? '#166534' : '#92400e' }}>
              {isConnected
                ? `✅ Firebase 연결됨 (${fb.projectId})`
                : '⚠️ Firebase 미연결 — 현재 로컬 모드 (재시작 시 데이터 초기화)'}
            </div>

            <div style={{ background: '#f8fafc', borderRadius: 10, padding: 14, marginBottom: 14, border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 10 }}>
                🔥 Firebase 설정
                <span style={{ fontSize: 11, fontWeight: 400, color: '#9ca3af', marginLeft: 8 }}>
                  firebase.google.com → 프로젝트 생성 → 웹앱 추가
                </span>
              </div>
              {[
                { key: 'apiKey',     label: 'API Key',      placeholder: 'AIzaSy...' },
                { key: 'authDomain', label: 'Auth Domain',  placeholder: 'project.firebaseapp.com' },
                { key: 'projectId',  label: 'Project ID',   placeholder: 'my-project-id' },
                { key: 'appId',      label: 'App ID',       placeholder: '1:123456:web:abc...' }
              ].map(f => (
                <Row key={f.key} label={f.label}>
                  <DebouncedInput value={fb[f.key] || ''}
                    onCommit={v => actions.setCommunity({ firebaseConfig: { ...fb, [f.key]: v } })}
                    placeholder={f.placeholder} style={{ ...inputStyle, width: 240, fontSize: 11 }} />
                </Row>
              ))}
              <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center' }}>
                <button disabled={fbSaving || !fb.apiKey} onClick={async () => {
                  setFbSaving(true); setFbStatus('');
                  const ok = await initFirebase(fb, community.userId || 'user');
                  setFbStatus(ok ? '✅ 연결 성공!' : '❌ 연결 실패 — 설정을 확인하세요');
                  setFbSaving(false);
                }} style={{
                  background: fbSaving ? '#d1d5db' : '#f97316', color: '#fff',
                  border: 'none', borderRadius: 8, padding: '8px 18px', fontSize: 13,
                  cursor: fbSaving ? 'not-allowed' : 'pointer', fontWeight: 600
                }}>{fbSaving ? '연결 중...' : '🔥 Firebase 연결'}</button>
                {fbStatus && <span style={{ fontSize: 12, color: fbStatus.startsWith('✅') ? '#16a34a' : '#dc2626' }}>{fbStatus}</span>}
              </div>
            </div>

            <div style={{ background: '#f0f9ff', borderRadius: 10, padding: '10px 14px', fontSize: 12, color: '#0369a1', border: '1px solid #bae6fd' }}>
              <strong>Firebase 무료 설정 방법</strong><br />
              1. <a href="#" onClick={e => { e.preventDefault(); window.electronAPI?.shell?.openExternal('https://console.firebase.google.com'); }}>console.firebase.google.com</a> 접속<br />
              2. 새 프로젝트 생성 → 웹앱 추가 (Firestore Database 활성화)<br />
              3. Firestore Database → 규칙 탭 → <code style={{ background: '#e0f2fe', padding: '1px 4px', borderRadius: 3 }}>allow read, write: if true;</code> 로 변경 (테스트용)<br />
              4. 프로젝트 설정 → 앱 → SDK 설정에서 config 값 복사
            </div>
          </div>
        );
      }

      case 'data': return (
        <div>
          {/* ── 내보내기 / 가져오기 ── */}
          <SectionTitle>설정 내보내기 / 가져오기</SectionTitle>
          <div style={{ background: '#fffbeb', borderRadius: 8, padding: '10px 12px', marginBottom: 12, fontSize: 12, color: '#92400e', border: '1px solid #fde68a' }}>
            ⚠️ API 키, 구글 토큰, Firebase 설정 등 개인 인증 정보는 내보내기에 포함되지 않습니다.
          </div>
          <Row label="설정 내보내기" desc="민감정보 제외 JSON 파일">
            <button onClick={() => {
              const { ai: aiState, google: g, microsoft: ms, community: com, ...rest } = state;
              const safe = {
                ...rest,
                ai: { enabled: aiState.enabled, provider: aiState.provider },
                google: { connected: false },
                microsoft: { connected: false },
                community: { username: com?.username || '', groups: [] }
              };
              const blob = new Blob([JSON.stringify(safe, null, 2)], { type: 'application/json' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a'); a.href = url;
              a.download = `smart-desktop-${new Date().toISOString().slice(0,10)}.json`; a.click();
              URL.revokeObjectURL(url);
            }} style={{ background: theme.accentColor, color: '#fff', border: 'none', borderRadius: 8, padding: '8px 14px', cursor: 'pointer', fontSize: 13 }}>
              📤 내보내기
            </button>
          </Row>
          <Row label="설정 가져오기" desc="이전에 내보낸 파일 선택">
            <button onClick={() => {
              const fi = document.createElement('input'); fi.type = 'file'; fi.accept = '.json';
              fi.onchange = (ev) => {
                const reader = new FileReader();
                reader.onload = (r) => {
                  try {
                    const data = JSON.parse(r.target.result);
                    // 민감 정보는 절대 덮어쓰지 않음
                    const { ai: _a, google: _g, microsoft: _ms, community: _c, cache: _cache, ui: _ui, ...safe } = data;
                    actions.dispatch({ type: 'INIT', payload: safe });
                    if (data.widgets) actions.setWidgets(data.widgets);
                    if (data.theme) actions.setTheme(data.theme);
                    if (data.schedule) actions.setSchedule(data.schedule);
                    if (data.timetable) actions.setTimetable(data.timetable);
                    alert('설정이 적용되었습니다. 앱을 새로고침합니다.');
                    window.location.reload();
                  } catch { alert('잘못된 파일 형식입니다.'); }
                };
                reader.readAsText(ev.target.files[0]);
              };
              fi.click();
            }} style={{ background: '#f3f4f6', border: 'none', borderRadius: 8, padding: '8px 14px', cursor: 'pointer', fontSize: 13, color: '#374151' }}>
              📥 가져오기
            </button>
          </Row>

          {/* ── 데이터 초기화 ── */}
          <SectionTitle>데이터 초기화</SectionTitle>
          <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 10 }}>
            메모·할일은 앱 종료 후에도 영구 보관됩니다. 아래 버튼으로 초기화할 수 있습니다.
          </div>
          <Row label={`✅ 할 일 (${(state.todos||[]).length}개)`}>
            <button onClick={() => {
              if (!window.confirm('할 일 목록을 모두 삭제하시겠습니까?')) return;
              (state.todos||[]).forEach(t => actions.deleteTodo(t.id));
            }} style={{ background: '#fee2e2', border: 'none', borderRadius: 8, padding: '8px 14px', cursor: 'pointer', fontSize: 13, color: '#dc2626' }}>
              🗑 전체 삭제
            </button>
          </Row>
          <Row label={`📝 메모 (${(state.memos||[]).length}개)`}>
            <button onClick={() => {
              if (!window.confirm('메모를 모두 삭제하시겠습니까?')) return;
              (state.memos||[]).forEach(m => actions.deleteMemo(m.id));
            }} style={{ background: '#fee2e2', border: 'none', borderRadius: 8, padding: '8px 14px', cursor: 'pointer', fontSize: 13, color: '#dc2626' }}>
              🗑 전체 삭제
            </button>
          </Row>
          <Row label={`📆 D-Day (${(state.ddays||[]).length}개)`}>
            <button onClick={() => {
              if (!window.confirm('D-Day를 모두 삭제하시겠습니까?')) return;
              (state.ddays||[]).forEach(d => actions.deleteDday(d.id));
            }} style={{ background: '#fee2e2', border: 'none', borderRadius: 8, padding: '8px 14px', cursor: 'pointer', fontSize: 13, color: '#dc2626' }}>
              🗑 전체 삭제
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
      zIndex: 99999, fontFamily: "'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif"
    }} onClick={e => { if (e.target === e.currentTarget) close(); }}>
      <div style={{
        background: '#fff', borderRadius: 20,
        width: 720, height: '80vh',  // 고정 높이 — 탭 변경 시 크기 안 바뀜
        display: 'flex', overflow: 'hidden',
        boxShadow: '0 24px 60px rgba(0,0,0,0.18)'
      }}>

        {/* 좌측 탭 목록 */}
        <div style={{ width: 180, background: '#f9fafb', borderRight: '0.5px solid #f0f0f0', padding: '20px 0', flexShrink: 0, overflowY: 'auto' }}>
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

        {/* 우측 컨텐츠 — 고정 높이 내 스크롤 */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 32px 0', flexShrink: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#1f2937' }}>
              {(TABS.find(t => t.id === activeTab) || {}).label || '설정'}
            </div>
            <button onClick={close} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#9ca3af' }}>✕</button>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px 32px 28px' }}>
          {renderTabContent()}
          </div>
        </div>
      </div>
    </div>
  );
}
