// ============================================================
// microsoftService.js - Microsoft Graph API 연동
// Outlook Calendar, Outlook Mail, OneDrive, Teams
// ============================================================

import axios from 'axios';

// ── MSAL 설정 ──────────────────────────────────────────────
// Azure App Registration에서 발급
const MS_CONFIG = {
  clientId: '',         // Azure Portal에서 발급
  redirectUri: 'http://localhost:3000/auth/microsoft/callback',
  scopes: [
    'User.Read',
    'Calendars.Read',
    'Calendars.ReadWrite',
    'Mail.Read',
    'Files.Read',
    'OnlineMeetings.Read'
  ]
};

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';

// ── 토큰 관리 ─────────────────────────────────────────────
let accessToken = null;
let tokenExpiry = 0;

export function setMSToken(token, expiresIn) {
  accessToken = token;
  tokenExpiry = Date.now() + (expiresIn || 3600) * 1000;
}

export function isMSTokenValid() {
  return accessToken && Date.now() < tokenExpiry - 60000;
}

// OAuth 로그인 URL 생성
export function getMSAuthUrl(clientId) {
  const id = clientId || MS_CONFIG.clientId;
  if (!id) return null;

  const params = new URLSearchParams({
    client_id: id,
    redirect_uri: MS_CONFIG.redirectUri,
    response_type: 'code',
    scope: MS_CONFIG.scopes.join(' '),
    response_mode: 'query'
  });
  return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params}`;
}

// 인증 코드 → 토큰 교환
export async function exchangeMSCode(code, clientId, clientSecret) {
  const res = await axios.post('https://login.microsoftonline.com/common/oauth2/v2.0/token',
    new URLSearchParams({
      code,
      client_id: clientId || MS_CONFIG.clientId,
      client_secret: clientSecret || MS_CONFIG.clientSecret,
      redirect_uri: MS_CONFIG.redirectUri,
      grant_type: 'authorization_code'
    }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );
  setMSToken(res.data.access_token, res.data.expires_in);
  return res.data;
}

// API 호출 헬퍼
async function graphCall(endpoint, options = {}) {
  if (!accessToken) throw new Error('Not authenticated with Microsoft');
  const res = await axios({
    url: `${GRAPH_BASE}${endpoint}`,
    headers: { Authorization: `Bearer ${accessToken}`, ...options.headers },
    ...options
  });
  return res.data;
}

// ── 사용자 정보 ─────────────────────────────────────────────
export async function getMSUserInfo() {
  return graphCall('/me');
}

// ── Outlook Calendar ────────────────────────────────────────
export async function getOutlookEvents(days = 7) {
  const now = new Date();
  const end = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

  const params = new URLSearchParams({
    startDateTime: now.toISOString(),
    endDateTime: end.toISOString(),
    '$orderby': 'start/dateTime',
    '$top': '50',
    '$select': 'subject,start,end,location,bodyPreview,isOnlineMeeting,onlineMeetingUrl'
  });

  const data = await graphCall(`/me/calendarview?${params}`);
  return (data.value || []).map(e => ({
    id: e.id,
    title: e.subject || '(제목 없음)',
    date: (e.start?.dateTime || '').split('T')[0],
    time: e.start?.dateTime ? new Date(e.start.dateTime + 'Z').toTimeString().slice(0, 5) : '',
    endTime: e.end?.dateTime ? new Date(e.end.dateTime + 'Z').toTimeString().slice(0, 5) : '',
    location: e.location?.displayName || '',
    isOnline: e.isOnlineMeeting,
    meetingUrl: e.onlineMeetingUrl,
    color: '#0078d4',
    source: 'microsoft'
  }));
}

export async function createOutlookEvent(event) {
  return graphCall('/me/events', {
    method: 'POST',
    data: {
      subject: event.title,
      start: {
        dateTime: `${event.date}T${event.time || '09:00'}:00`,
        timeZone: 'Asia/Seoul'
      },
      end: {
        dateTime: `${event.date}T${event.endTime || '10:00'}:00`,
        timeZone: 'Asia/Seoul'
      },
      location: event.location ? { displayName: event.location } : undefined
    }
  });
}

// ── Outlook Mail ────────────────────────────────────────────
export async function getOutlookUnreadCount() {
  const data = await graphCall("/me/mailFolders/Inbox?$select=unreadItemCount");
  return data.unreadItemCount || 0;
}

export async function getOutlookEmails(maxResults = 10) {
  const data = await graphCall(
    `/me/messages?$top=${maxResults}&$orderby=receivedDateTime desc&$select=subject,from,receivedDateTime,bodyPreview,isRead`
  );
  return (data.value || []).map(m => ({
    id: m.id,
    subject: m.subject || '(제목 없음)',
    from: m.from?.emailAddress?.name || m.from?.emailAddress?.address || '',
    date: m.receivedDateTime ? new Date(m.receivedDateTime).toLocaleDateString('ko-KR') : '',
    snippet: m.bodyPreview || '',
    unread: !m.isRead,
    source: 'microsoft'
  }));
}

// ── OneDrive ────────────────────────────────────────────────
export async function getOneDriveRecent(maxResults = 10) {
  const data = await graphCall(
    `/me/drive/recent?$top=${maxResults}&$select=name,webUrl,lastModifiedDateTime,size,file`
  );
  return (data.value || []).map(f => ({
    id: f.id,
    name: f.name,
    link: f.webUrl,
    modified: f.lastModifiedDateTime,
    size: f.size,
    type: f.file?.mimeType || 'folder'
  }));
}

// ── Teams 회의 ──────────────────────────────────────────────
export async function getTeamsMeetings() {
  // Teams 회의는 Calendar 이벤트 중 온라인 미팅인 것만 필터
  const events = await getOutlookEvents(3);
  return events.filter(e => e.isOnline && e.meetingUrl);
}

// ── 데모 데이터 ─────────────────────────────────────────────
export function getDemoOutlookEvents() {
  const today = new Date();
  const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  return [
    { id: 'ms-demo1', title: 'Teams 부서 회의', date: fmt(today), time: '10:00', endTime: '11:00', color: '#0078d4', source: 'microsoft', isOnline: true },
    { id: 'ms-demo2', title: '프로젝트 리뷰', date: fmt(new Date(today.getTime() + 2*86400000)), time: '15:00', endTime: '16:00', color: '#0078d4', source: 'microsoft' }
  ];
}

export function getDemoOutlookEmails() {
  return [
    { id: 'ms-demo1', subject: '주간 업무 보고 요청', from: '팀장님', date: '오늘', snippet: '이번 주 업무 보고를 부탁드립니다...', unread: true, source: 'microsoft' },
    { id: 'ms-demo2', subject: 'Teams 회의 초대', from: 'Microsoft Teams', date: '어제', snippet: '새 회의가 예약되었습니다...', unread: false, source: 'microsoft' }
  ];
}
