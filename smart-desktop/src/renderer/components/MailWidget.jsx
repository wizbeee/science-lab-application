// ============================================================
// MailWidget.jsx - 통합 메일 위젯
// Google Gmail + Microsoft Outlook 통합 표시
// ============================================================

import React, { useState, useEffect } from 'react';
import { useApp } from '../AppContext';

export default function MailWidget() {
  const { state } = useApp();
  const { theme, google, microsoft } = state;
  const [emails, setEmails] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      let allEmails = [];

      // Google 연동 시 Gmail
      if (google.connected && google.accessToken) {
        try {
          const { setTokens, getRecentEmails } = await import('../services/googleService');
          setTokens(google.accessToken, google.refreshToken, 3600);
          const gmails = await getRecentEmails(5);
          allEmails = [...allEmails, ...gmails.map(e => ({ ...e, source: 'google' }))];
        } catch (err) {
          console.log('Gmail fetch error:', err);
        }
      }

      setEmails(allEmails);
      setLoading(false);
    };
    load();
  }, [google.connected, microsoft.connected]);

  const unreadCount = emails.filter(e => e.unread).length;

  // 미연동 상태
  if (!google.connected && !microsoft.connected) {
    return (
      <div style={{ background: '#fff', borderRadius: 16, padding: '14px 18px', border: `1px solid ${theme.borderColor}` }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 10 }}>📧 받은 메일</div>
        <div style={{ fontSize: 13, color: '#9ca3af', textAlign: 'center', padding: '16px 0' }}>
          Google 또는 Microsoft<br />연동 후 메일이 표시됩니다
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: '#fff', borderRadius: 16, padding: '14px 18px', border: `1px solid ${theme.borderColor}` }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>
          📧 받은 메일
          {unreadCount > 0 && (
            <span style={{ marginLeft: 6, background: '#fee2e2', color: '#dc2626', fontSize: 11, padding: '2px 7px', borderRadius: 10 }}>
              {unreadCount}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {google.connected && <span style={{ fontSize: 10, background: '#dbeafe', color: '#1e40af', padding: '2px 6px', borderRadius: 6 }}>Gmail</span>}
          {microsoft.connected && <span style={{ fontSize: 10, background: '#e0f2fe', color: '#0369a1', padding: '2px 6px', borderRadius: 6 }}>Outlook</span>}
        </div>
      </div>

      {loading ? (
        <div style={{ fontSize: 12, color: '#9ca3af', textAlign: 'center', padding: '12px 0' }}>불러오는 중...</div>
      ) : emails.length === 0 ? (
        <div style={{ fontSize: 12, color: '#9ca3af', textAlign: 'center', padding: '12px 0' }}>새 메일이 없습니다</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 220, overflowY: 'auto' }}>
          {emails.map(email => (
            <div key={email.id} style={{
              padding: '8px 10px', borderRadius: 8,
              background: email.unread ? '#fefce8' : '#f9fafb',
              border: `0.5px solid ${email.unread ? '#fde68a' : '#f0f0f0'}`,
              cursor: 'pointer'
            }}
              onClick={() => {
                const url = email.source === 'google'
                  ? 'https://mail.google.com'
                  : 'https://outlook.office.com/mail';
                window.electronAPI?.shell?.openExternal(url);
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                {email.unread && <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#3b82f6', flexShrink: 0 }} />}
                <span style={{ fontSize: 12, fontWeight: email.unread ? 700 : 500, color: '#1f2937', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {email.subject}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 11, color: '#6b7280' }}>{email.from}</span>
                <span style={{ fontSize: 10, color: '#9ca3af' }}>{email.date}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
