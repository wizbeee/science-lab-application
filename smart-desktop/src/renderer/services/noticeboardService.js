// ============================================================
// noticeboardService.js - 전광판 (Google Sheets 실시간 연동)
// A열: 내용(표시 텍스트)  B열: 순서(숫자 오름차순 정렬)
// ============================================================

export function convertSheetUrlToCsv(sheetUrl) {
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

function parseCsv(csvText) {
  const lines = csvText.trim().split('\n').filter(Boolean);
  return lines.map(line => {
    // 따옴표로 감싼 셀 처리
    const result = [];
    let inQuote = false, cell = '';
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { inQuote = !inQuote; }
      else if (ch === ',' && !inQuote) { result.push(cell.trim()); cell = ''; }
      else { cell += ch; }
    }
    result.push(cell.trim());
    return result;
  });
}

export async function fetchNoticeboardData(sheetUrl) {
  const csvUrl = convertSheetUrlToCsv(sheetUrl);
  if (!csvUrl) throw new Error('올바른 Google Sheets URL이 아닙니다.');

  // 10초 타임아웃으로 네트워크 응답 대기
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);
  let res;
  try {
    res = await fetch(csvUrl, { signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
  if (!res.ok) throw new Error('시트를 가져올 수 없습니다. 공유 설정을 확인해 주세요.');

  const text = await res.text();
  const rows = parseCsv(text);

  // 첫 행 = 헤더 제외, A열(r[0]) = 내용, B열(r[1]) = 순서
  const notices = rows
    .filter((r, i) => i > 0 && r[0] && r[0].trim()) // 헤더 제외, A열 내용 있는 행만
    .map((r, i) => ({
      id: i,
      text: r[0].trim(),                  // A열 = 표시할 내용
      orderRaw: (r[1] || '').trim(),      // B열 = 순서
      _originalIndex: i
    }))
    .filter(n => n.text);

  // B열 숫자 오름차순 정렬 (숫자 아니면 원래 순서 유지)
  notices.sort((a, b) => {
    const na = parseInt(a.orderRaw);
    const nb = parseInt(b.orderRaw);
    if (isNaN(na) && isNaN(nb)) return a._originalIndex - b._originalIndex;
    if (isNaN(na)) return 1;
    if (isNaN(nb)) return -1;
    return na - nb;
  });

  return notices;
}

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
    // 이미 실행 중이면 중복 타이머 방지
    if (this.timer) return;
    this.fetch();
    this.timer = setInterval(() => this.fetch(), this.intervalMs);
  }

  stop() {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    if (this.rotateTimer) { clearInterval(this.rotateTimer); this.rotateTimer = null; }
  }

  startRotation(onSlide, rotateSec = 5) {
    // 이미 실행 중이면 중복 타이머 방지
    if (this.rotateTimer) { clearInterval(this.rotateTimer); this.rotateTimer = null; }
    this.rotateTimer = setInterval(() => {
      const list = Array.isArray(this.notices) ? this.notices : [];
      if (list.length > 0) {
        this.currentIndex = (this.currentIndex + 1) % list.length;
        try { onSlide(list[this.currentIndex], this.currentIndex); } catch {}
      }
    }, rotateSec * 1000);
  }
}
