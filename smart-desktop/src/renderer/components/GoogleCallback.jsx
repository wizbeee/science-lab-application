// ============================================================
// GoogleCallback.jsx - Google OAuth 콜백 처리
// ============================================================

import { useEffect, useState } from 'react';
import { exchangeCode, getUserInfo } from '../services/googleService';

export default function GoogleCallback({ onSuccess, onError }) {
  const [status, setStatus] = useState('Google 인증 처리 중...');
  const [done, setDone] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const error = params.get('error');

    if (error) {
      setStatus('인증이 취소되었습니다: ' + error);
      setFailed(true);
      return;
    }

    if (!code) {
      setStatus('인증 코드가 없습니다.');
      setFailed(true);
      return;
    }

    async function handleCode() {
      try {
        setStatus('Google 서버와 토큰 교환 중...');
        console.log('Exchanging code:', code.substring(0, 20) + '...');
        const tokenData = await exchangeCode(code);
        console.log('Token received:', !!tokenData.access_token);

        setStatus('사용자 정보 가져오는 중...');
        const userInfo = await getUserInfo();
        console.log('User info:', userInfo.email);

        setStatus(`✅ ${userInfo.email} 연동 완료!`);
        setDone(true);

        // 2초 후 자동으로 앱으로 복귀
        setTimeout(() => {
          onSuccess?.({
            accessToken: tokenData.access_token,
            refreshToken: tokenData.refresh_token,
            email: userInfo.email,
            name: userInfo.name,
            picture: userInfo.picture
          });
        }, 1500);

      } catch (err) {
        console.error('Google OAuth error:', err);
        const msg = err.response?.data?.error_description
          || err.response?.data?.error
          || err.message
          || '알 수 없는 오류';
        setStatus('❌ 인증 실패: ' + msg);
        setFailed(true);
      }
    }

    handleCode();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'linear-gradient(135deg, #eff6ff 0%, #fff5f7 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999,
      fontFamily: "'Malgun Gothic', sans-serif"
    }}>
      <div style={{
        background: '#fff', borderRadius: 20, padding: '40px 48px',
        textAlign: 'center', boxShadow: '0 8px 40px rgba(0,0,0,0.1)',
        maxWidth: 420
      }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>
          {done ? '✅' : failed ? '❌' : '🔗'}
        </div>
        <div style={{ fontSize: 18, fontWeight: 700, color: '#1f2937', marginBottom: 12 }}>
          Google 계정 연동
        </div>
        <div style={{
          fontSize: 14, color: done ? '#059669' : failed ? '#dc2626' : '#6b7280',
          lineHeight: 1.6, marginBottom: 20,
          wordBreak: 'break-word'
        }}>
          {status}
        </div>

        {!done && !failed && (
          <div style={{ width: 32, height: 32, border: '3px solid #e5e7eb', borderTopColor: '#3b82f6', borderRadius: '50%', margin: '0 auto', animation: 'spin 1s linear infinite' }}>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        )}

        {failed && (
          <button onClick={() => {
            window.history.replaceState({}, '', '/');
            onError?.();
          }} style={{
            background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 10,
            padding: '12px 28px', fontSize: 14, fontWeight: 600, cursor: 'pointer'
          }}>
            돌아가기
          </button>
        )}

        {done && (
          <div style={{ fontSize: 12, color: '#9ca3af' }}>잠시 후 자동으로 돌아갑니다...</div>
        )}
      </div>
    </div>
  );
}
