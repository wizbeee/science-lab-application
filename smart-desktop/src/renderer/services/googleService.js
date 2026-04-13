// ============================================================
// googleService.js - Google OAuth2 + API 연동
// Calendar, Gmail, Drive, Classroom, Meet, Tasks
// ============================================================

import axios from 'axios';

// ── OAuth 설정 ─────────────────────────────────────────────
// Google Cloud Console에서 발급받은 OAuth 클라이언트 정보
// 실제 사용 시 .env 또는 설정에서 로드
const GOOGLE_CONFIG = {
  clientId: process.env.REACT_APP_GOOGLE_CLIENT_ID || '',
  clientSecret: process.env.REACT_APP_GOOGLE_CLIENT_SECRET || '',
  redirectUri: 'http://localhost:3000/auth/google/callback',
  scopes: [
    'https://www.googleapis.com/auth/calendar',
    'https://www.googleapis.com/auth/calendar.events',
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/drive.readonly',
    'https://www.googleapis.com/auth/classroom.courses.readonly',
    'https://www.googleapis.com/auth/classroom.coursework.students.readonly',
    'https://www.googleapis.com/auth/tasks',
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile'
  ]
};

const API_BASE = 'https://www.googleapis.com';

// ── 토큰 관리 ─────────────────────────────────────────────
let accessToken = null;
let refreshToken = null;
let tokenExpiry = 0;

export function setTokens(access, refresh, expiresIn) {
  accessToken = access;
  refreshToken = refresh;
  // expiresIn이 3600(기본)이고 이미 세팅된 토큰과 동일하면 expiry 갱신하지 않음
  // (매번 호출 시 만료시간이 리셋되는 것 방지)
  if (expiresIn && expiresIn !== 3600) {
    tokenExpiry = Date.now() + expiresIn * 1000;
  } else if (tokenExpiry === 0) {
    // 처음 세팅 시에만 1시간 설정 (이후 갱신 시 실제 값으로 업데이트)
    tokenExpiry = Date.now() + 3600 * 1000;
  }
}

// 앱 시작 시 저장된 토큰 복원 (만료시간 모르므로 즉시 갱신 시도)
export async function initTokens(access, refresh) {
  accessToken = access;
  refreshToken = refresh;
  tokenExpiry = 0; // 만료 상태로 시작 → apiCall에서 자동 갱신
  if (refresh) {
    try {
      await refreshAccessToken();
      console.log('[Google] 앱 시작 토큰 갱신 성공');
      return true;
    } catch (e) {
      console.warn('[Google] 앱 시작 토큰 갱신 실패:', e.message);
      return false;
    }
  }
  return false;
}

export function getAccessToken() {
  return accessToken;
}

export function isTokenValid() {
  return accessToken && Date.now() < tokenExpiry - 60000; // 1분 여유
}

// OAuth 로그인 URL 생성
export function getAuthUrl(clientId) {
  const id = clientId || GOOGLE_CONFIG.clientId;
  if (!id) return null;

  const params = new URLSearchParams({
    client_id: id,
    redirect_uri: GOOGLE_CONFIG.redirectUri,
    response_type: 'code',
    scope: GOOGLE_CONFIG.scopes.join(' '),
    access_type: 'offline',
    prompt: 'consent'
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

// 인증 코드 → 토큰 교환 (form-encoded 필수!)
export async function exchangeCode(code, clientId, clientSecret) {
  const body = new URLSearchParams({
    code,
    client_id: clientId || GOOGLE_CONFIG.clientId,
    client_secret: clientSecret || GOOGLE_CONFIG.clientSecret,
    redirect_uri: GOOGLE_CONFIG.redirectUri,
    grant_type: 'authorization_code'
  });
  const res = await axios.post('https://oauth2.googleapis.com/token', body.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  });
  setTokens(res.data.access_token, res.data.refresh_token, res.data.expires_in);
  return res.data;
}

// 토큰 갱신
export async function refreshAccessToken(clientId, clientSecret) {
  if (!refreshToken) throw new Error('No refresh token');
  const body = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: clientId || GOOGLE_CONFIG.clientId,
    client_secret: clientSecret || GOOGLE_CONFIG.clientSecret,
    grant_type: 'refresh_token'
  });
  const res = await axios.post('https://oauth2.googleapis.com/token', body.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  });
  setTokens(res.data.access_token, refreshToken, res.data.expires_in);
  return res.data;
}

// API 호출 헬퍼 (자동 토큰 갱신 + 재시도, 15초 타임아웃)
let isRefreshing = false; // 토큰 갱신 중 중복 방지

async function apiCall(url, options = {}, _retried = false) {
  if (!accessToken) throw new Error('Not authenticated');

  // 토큰 만료 임박 시 미리 갱신 (만료 5분 전)
  if (!_retried && refreshToken && tokenExpiry > 0 && Date.now() > tokenExpiry - 300000) {
    try {
      await refreshAccessToken();
      // 갱신된 토큰을 AppContext에도 반영
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('google-token-refreshed', {
          detail: { accessToken, tokenExpiry }
        }));
      }
    } catch {}
  }

  try {
    const res = await axios({
      url: url.startsWith('http') ? url : `${API_BASE}${url}`,
      headers: { Authorization: `Bearer ${accessToken}`, ...options.headers },
      timeout: 15000,
      ...options
    });
    return res.data;
  } catch (err) {
    if (err.response) {
      const status = err.response.status;

      // 401: 토큰 만료 → refresh token으로 자동 갱신 시도
      if (status === 401 && !_retried && refreshToken && !isRefreshing) {
        isRefreshing = true;
        try {
          console.log('[Google] Access token 만료, refresh token으로 갱신 중...');
          await refreshAccessToken();
          // 갱신된 토큰을 AppContext에 반영
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('google-token-refreshed', {
              detail: { accessToken, tokenExpiry }
            }));
          }
          isRefreshing = false;
          // 원래 요청 재시도
          return apiCall(url, options, true);
        } catch (refreshErr) {
          console.warn('[Google] Refresh token 갱신 실패:', refreshErr.message);
          // refresh도 실패 → 이때만 재로그인 알림
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('google-token-expired'));
          }
          throw new Error('Google 인증이 만료되었습니다. 다시 로그인하세요.');
        } finally {
          isRefreshing = false; // 어떤 경우든 플래그 해제
        }
      }

      if (status === 401) {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('google-token-expired'));
        }
        throw new Error('Google 인증이 만료되었습니다. 다시 로그인하세요.');
      }
      if (status === 403) throw new Error('Google API 접근 권한이 없습니다.');
      if (status === 429) throw new Error('Google API 요청 한도 초과. 잠시 후 다시 시도하세요.');
      throw new Error(`Google API 오류 (${status})`);
    }
    if (err.code === 'ECONNABORTED') throw new Error('요청 시간 초과');
    throw err;
  }
}

// ── 사용자 정보 ─────────────────────────────────────────────
export async function getUserInfo() {
  return apiCall('https://www.googleapis.com/oauth2/v2/userinfo');
}

// ── Google Calendar ─────────────────────────────────────────

// 캘린더 목록 조회
export async function getCalendarList() {
  const data = await apiCall('/calendar/v3/users/me/calendarList?maxResults=50');
  return (data.items || []).map(c => ({
    id: c.id,
    name: c.summary || c.id,
    color: c.backgroundColor || '#3b82f6',
    primary: c.primary || false,
    accessRole: c.accessRole // owner | writer | reader
  })).sort((a, b) => (b.primary ? 1 : 0) - (a.primary ? 1 : 0)); // 기본 캘린더 맨 위
}

// 이벤트 조회 (다중 캘린더 지원)
export async function getCalendarEvents(timeMin, timeMax, calendarIds = ['primary']) {
  const now = new Date();
  const min = timeMin || now.toISOString();
  const max = timeMax || new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const params = new URLSearchParams({
    timeMin: min, timeMax: max,
    singleEvents: 'true', orderBy: 'startTime', maxResults: '50'
  });

  if (!calendarIds.length) return [];
  const ids = calendarIds;
  const results = await Promise.allSettled(
    ids.map(calId =>
      apiCall(`/calendar/v3/calendars/${encodeURIComponent(calId)}/events?${params}`)
        .then(data => ({ data, calId }))
    )
  );

  const allEvents = [];
  results.forEach(r => {
    if (r.status !== 'fulfilled') return;
    const { data, calId } = r.value;
    (data.items || []).forEach(e => {
      allEvents.push({
        id: e.id,
        title: e.summary || '(제목 없음)',
        date: (e.start?.date || e.start?.dateTime || '').split('T')[0],
        time: e.start?.dateTime ? new Date(e.start.dateTime).toTimeString().slice(0, 5) : '',
        endTime: e.end?.dateTime ? new Date(e.end.dateTime).toTimeString().slice(0, 5) : '',
        location: e.location || '',
        description: e.description || '',
        color: e.colorId ? `#${['', 'a4bdfc','7ae7bf','dbadff','ff887c','fbd75b','ffb878','46d6db','e1e1e1','5484ed','51b749','dc2127'][+e.colorId] || '3b82f6'}` : '#3b82f6',
        calendarId: calId,
        source: 'google'
      });
    });
  });

  return allEvents.sort((a, b) =>
    a.date.localeCompare(b.date) || a.time.localeCompare(b.time)
  );
}

export async function createCalendarEvent(event) {
  return apiCall('/calendar/v3/calendars/primary/events', {
    method: 'POST',
    data: {
      summary: event.title,
      start: event.allDay
        ? { date: event.date }
        : { dateTime: `${event.date}T${event.time || '09:00'}:00`, timeZone: 'Asia/Seoul' },
      end: event.allDay
        ? { date: event.date }
        : { dateTime: `${event.date}T${event.endTime || '10:00'}:00`, timeZone: 'Asia/Seoul' },
      location: event.location,
      description: event.description
    }
  });
}

export async function deleteCalendarEvent(eventId) {
  return apiCall(`/calendar/v3/calendars/primary/events/${eventId}`, {
    method: 'DELETE'
  });
}

// ── Gmail ───────────────────────────────────────────────────
export async function getUnreadCount() {
  const data = await apiCall('/gmail/v1/users/me/labels/INBOX');
  return data.messagesUnread || 0;
}

export async function getRecentEmails(maxResults = 10) {
  const listData = await apiCall(
    `/gmail/v1/users/me/messages?maxResults=${maxResults}&labelIds=INBOX`
  );
  const messages = listData.messages || [];

  // Promise.allSettled: 일부 메일 fetch 실패해도 나머지 결과 반환
  const results = await Promise.allSettled(
    messages.slice(0, maxResults).map(async (msg) => {
      const detail = await apiCall(`/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`);
      const headers = detail.payload?.headers || [];
      const getHeader = (name) => headers.find(h => h.name === name)?.value || '';
      return {
        id: msg.id,
        subject: getHeader('Subject') || '(제목 없음)',
        from: getHeader('From').replace(/<.*>/g, '').trim(),
        date: getHeader('Date'),
        snippet: detail.snippet || '',
        unread: (detail.labelIds || []).includes('UNREAD')
      };
    })
  );
  // 성공한 것만 반환
  return results
    .filter(r => r.status === 'fulfilled')
    .map(r => r.value);
}

// ── Google Drive ────────────────────────────────────────────
export async function getRecentFiles(maxResults = 10) {
  const params = new URLSearchParams({
    pageSize: String(maxResults),
    orderBy: 'modifiedTime desc',
    fields: 'files(id,name,mimeType,modifiedTime,webViewLink,iconLink,size)',
    q: "trashed = false"
  });
  const data = await apiCall(`/drive/v3/files?${params}`);
  return (data.files || []).map(f => ({
    id: f.id,
    name: f.name,
    type: f.mimeType,
    modified: f.modifiedTime,
    link: f.webViewLink,
    icon: f.iconLink,
    size: f.size
  }));
}

// ── Google Classroom ────────────────────────────────────────
export async function getCourses() {
  const data = await apiCall('/classroom/v1/courses?courseStates=ACTIVE&pageSize=20');
  return (data.courses || []).map(c => ({
    id: c.id,
    name: c.name,
    section: c.section || '',
    room: c.room || '',
    link: c.alternateLink
  }));
}

export async function getCourseWork(courseId) {
  const data = await apiCall(`/classroom/v1/courses/${courseId}/courseWork?pageSize=10&orderBy=dueDate desc`);
  return (data.courseWork || []).map(w => ({
    id: w.id,
    title: w.title,
    dueDate: w.dueDate ? `${w.dueDate.year}-${String(w.dueDate.month).padStart(2,'0')}-${String(w.dueDate.day).padStart(2,'0')}` : '',
    link: w.alternateLink,
    state: w.state
  }));
}

// ── Google Tasks ────────────────────────────────────────────
export async function getTaskLists() {
  const data = await apiCall('/tasks/v1/users/@me/lists');
  return data.items || [];
}

export async function getTasks(taskListId = '@default') {
  const data = await apiCall(`/tasks/v1/lists/${taskListId}/tasks?showCompleted=true&maxResults=50`);
  return (data.items || []).map(t => ({
    id: t.id,
    text: t.title || '',
    done: t.status === 'completed',
    due: t.due ? t.due.split('T')[0] : '',
    notes: t.notes || '',
    source: 'google'
  }));
}

export async function createTask(taskListId = '@default', task) {
  return apiCall(`/tasks/v1/lists/${taskListId}/tasks`, {
    method: 'POST',
    data: {
      title: task.text,
      due: task.due ? `${task.due}T00:00:00.000Z` : undefined,
      notes: task.notes
    }
  });
}

export async function updateTask(taskListId = '@default', taskId, updates) {
  return apiCall(`/tasks/v1/lists/${taskListId}/tasks/${taskId}`, {
    method: 'PATCH',
    data: {
      title: updates.text,
      status: updates.done ? 'completed' : 'needsAction',
      notes: updates.notes
    }
  });
}

export async function deleteTask(taskListId = '@default', taskId) {
  return apiCall(`/tasks/v1/lists/${taskListId}/tasks/${taskId}`, {
    method: 'DELETE'
  });
}

// ── 데모 데이터 (API 키 없을 때) ───────────────────────────
export function getDemoCalendarEvents() {
  const today = new Date();
  const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  return [
    { id: 'demo1', title: '교직원 회의', date: fmt(today), time: '09:00', endTime: '10:00', color: '#3b82f6', source: 'google' },
    { id: 'demo2', title: '학부모 상담', date: fmt(new Date(today.getTime() + 86400000)), time: '14:00', endTime: '15:00', color: '#10b981', source: 'google' },
    { id: 'demo3', title: '수행평가 채점 마감', date: fmt(new Date(today.getTime() + 3*86400000)), time: '', endTime: '', color: '#ef4444', source: 'google' }
  ];
}

export function getDemoEmails() {
  return [
    { id: 'demo1', subject: '3월 교직원 회의 안내', from: '교무부', date: '오늘', snippet: '3월 교직원 회의를 아래와 같이...', unread: true },
    { id: 'demo2', subject: '현장체험학습 계획서 검토 요청', from: '학생부', date: '어제', snippet: '첨부된 현장체험학습 계획서를...', unread: true },
    { id: 'demo3', subject: '교육청 공문 전달', from: '행정실', date: '2일 전', snippet: '충남교육청 공문을 전달드립니다...', unread: false }
  ];
}
