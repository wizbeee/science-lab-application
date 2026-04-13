// ============================================================
// noticeboardService.js - 전광판 (Google Sheets 실시간 연동)
// 15초마다 자동 갱신 → 모든 사용자 화면에 공지 표시
// ============================================================

// Google Sheets를 CSV로 공개 공유 후 가져오기
// 방법: 구글 시트 → 공유 → 링크 복사 → 아래 변환 함수로 CSV URL 생성

export function convertSheetUrlToCsv(sheetUrl) {
  // https://docs.google.com/spreadsheets/d/{ID}/edit#gid=0
  // → https://docs.google.com/spreadsheets/d/{ID}/export?format=csv&gid=0
  try {
    const match = sheetUrl.match(/\/spreadsheets\/d\/([^/]+)/);
    if (!match) return null;
    const id = match[1];
    const gidMatch = sheetUrl.match(/gid=(\d+)/);
    const gid = gidMatch ? gidMatch[1] : '0';
    return `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`;
  } catch {
    return null;
  }
}

// CSV 파싱
function parseCsv(csvText) {
  const lines = csvText.trim().split('\n').filter(Boolean);
  return lines.map(line =>
    line.split(',').map(cell => cell.replace(/^"|"$/g, '').trim())
  );
}

// 공지 데이터 가져오기 (CSV 방식 - 인증 불필요)
export async function fetchNoticeboardData(sheetUrl) {
  const csvUrl = convertSheetUrlToCsv(sheetUrl);
  if (!csvUrl) throw new Error('올바른 Google Sheets URL이 아닙니다.');

  const res = await fetch(csvUrl);
  if (!res.ok) throw new Error('시트를 가져올 수 없습니다. 공유 설정을 확인해 주세요.');

  const text = await res.text();
  const rows = parseCsv(text);

  // 첫 행이 헤더인 경우 제거
  // 컬럼: [타입, 내용, 중요도, 날짜]
  const notices = rows
    .filter((r, i) => i > 0 && r[1]) // 헤더 제외, 내용 있는 행만
    .map((r, i) => ({
      id: i,
      type: r[0] || 'info',      // info | warning | urgent
      text: r[1] || '',
      priority: r[2] || 'normal',
      date: r[3] || ''
    }))
    .filter(n => n.text);

  return notices;
}

// 전광판 자동 새로고침 관리자
export class NoticeboardManager {
  constructor(url, intervalSec, onUpdate, onError) {
    this.url = url;
    this.intervalMs = intervalSec * 1000;
    this.onUpdate = onUpdate;
    this.onError = onError;
    this.timer = null;
    this.currentIndex = 0;
    this.notices = [];
    this.rotateTimer = null;
  }

  async fetch() {
    try {
      const data = await fetchNoticeboardData(this.url);
      this.notices = data;
      this.onUpdate(data);
    } catch (e) {
      this.onError?.(e.message);
    }
  }

  start() {
    this.fetch();
    this.timer = setInterval(() => this.fetch(), this.intervalMs);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    if (this.rotateTimer) clearInterval(this.rotateTimer);
  }

  // 텍스트 순환 (마퀴 대신 슬라이드 방식)
  startRotation(onSlide, rotateSec = 5) {
    this.rotateTimer = setInterval(() => {
      if (this.notices.length > 0) {
        this.currentIndex = (this.currentIndex + 1) % this.notices.length;
        onSlide(this.notices[this.currentIndex], this.currentIndex);
      }
    }, rotateSec * 1000);
  }
}
