// @ts-nocheck
/***************************************************
 * 과학실험실 신청 시스템 - 서버 코드 (Code.gs)
 * - 시간 필드(HH:mm) 안정화
 * - 헤더 맵 안정화
 * - 승인/최종승인 메일 발송
 * - 신청제한명단(A열=학번, 5자리) 대조 후 신청 차단
 * - ✅ 임시저장(저장/불러오기/30일 정리)
 * - ✅ 가용성 조회(실험실별 정원/팀수)
 * - ✅ 시약 폐기 방법 검증(정규화 비교) + 30초 스로틀
 * - ✅ 분류1 서버 강제 적용(상태=분류1)
 * - ✅ 시약 검증시 농도·사용량·MSDS 필수
 * - ✅ (신규) getChemicalListForTable(): [물질명, 화학식, 분류1, 교사임장여부]
 * - ✅ (신규) validateChemicalsThrottled(): 버튼 호출 전용 스로틀 래퍼
 * - ✅ (신규) 1차 승인 시 교사가 고른 '교사임장여부'를 실제 시약기록 시트에 반영
 * - ✅ (신규) getUnavailableForDate(dateYMD): 클라이언트 단에서 날짜 선택 시 비활성화할 실험실/시간 내려줌
 * - ✅ (신규) 캘린더 1일치 조회 후 실험 불가 반영
 * - ✅ (확장) 캘린더 제목에 "차단/불가/신청불가" + 실험실/시간이 들어간 경우도 인식
 * - ✅ (수정) 이메일 발신자 SCIENCE_EMAIL로 통일, sendLabTeacherFinalEmail_ 안정화
 * - ✅ (수정) 1차 승인 이메일 실패 시 throw 제거, 학과 메일 백업 발송 추가
 ***************************************************/

/* ------------------------- 스프레드시트 상수 ------------------------- */
const MAIN_SSID         = '1LzQvFUj0NH69DDyrh7Vxk8bYXQzMdl-oQkZpAUm1uIE';
const CHEM_RECORD_SSID  = '1IwVM6k4etSs-vSXFqp-3GrUJuzVhIgoBErzgMQd2GOs';
const CHEM_MASTER_SSID  = '1JYk8o0-wCoqA1TURrSDBkhVB-HfuRkOTgtyVxudXcm8';
const TEACHER_LIST_SSID = '12OSD8W-AFCPonw6QzOSM8H93eOG_-qar-zWCDWFfT7g';
const LAB_TEACHER_SSID  = '1djvdz0W7UCnmLBWElg7G4-KsxKiPyvnwVHC8UxYIqgA';

// ✅ 임시저장 파일
const DRAFT_SSID        = '1x3x6zurxAN7Qz75rrPfXZ7HI0c2JzEBsSZ1AbBNH848';

/* ✅ 캘린더 조회용 상수 */
const LAB_CALENDAR_ID   = 'c_d0dbfd548bf8746b12576a773f1171cd718955ea70a016b1c5f3fc60dd8719d6@group.calendar.google.com';

/* ✅ 이메일 발신자 주소 */
const SCIENCE_EMAIL     = 'cnsa.science@cnsa.hs.kr';

/* ✅ [HOTFIX v3.51 2026-05-23] 운영 웹앱 /exec URL 고정.
 *   getWebAppUrl_()이 실행 맥락에 따라 /dev URL이나 잘못된 배포를
 *   반환하는 GAS 고질 버그가 있어, 메일에 /dev URL이 박혀 편집 권한 없는 교사가
 *   "신청 정보를 찾을 수 없습니다" 등 오류를 겪었음.
 *   → 모든 메일 링크·페이지 네비게이션을 운영 배포(AKfycby78-)의 /exec로 강제 고정.
 *   ⚠️ 운영 배포 ID가 바뀌면 이 상수도 반드시 함께 갱신할 것. */
const WEB_APP_EXEC_URL  = 'https://script.google.com/a/macros/cnsa.hs.kr/s/AKfycby78-FfdylTWCRKqvkUmoUALCYep_lGIKirgm1fRgA7AsNs5uU9CR3O2Skj6e_UyKL9bA/exec';

/** 운영 웹앱 /exec URL 반환 (getUrl() 버그 회피용). */
function getWebAppUrl_() {
  return WEB_APP_EXEC_URL;
}

/* ✅ Google Chat 웹훅 URL (스크립트 속성에서 읽기, 없으면 빈 문자열) */
function getChatWebhookUrl_() {
  try {
    return PropertiesService.getScriptProperties().getProperty('CHAT_WEBHOOK_URL') || '';
  } catch (e) { return ''; }
}

// 가용성 조회 기본 슬롯 목록
const TIME_SLOTS = ['ET', 'EP1', '7교시'];

/** ✅ 시간 슬롯 정규화 */
function normalizeSlot_(s) {
  const raw = String(s || '').trim();
  const up  = raw.toUpperCase();
  if (up === 'ET')  return 'ET';
  if (up === 'EP1') return 'EP1';
  if (up === '7' || up === '7교시' || /7\s*교시/i.test(raw) || up === 'PERIOD7') return '7교시';
  return raw;
}


/* ==================================================================
 * ✅ [2026-08] 시트 해석기 — 첫 번째 탭 고정 참조 제거
 * ------------------------------------------------------------------
 * 기존에는 모든 스프레드시트를 getSheets()[0] 으로 열었다. 반면 관리자
 * 페이지는 "이름 제외 + 헤더 판별" 이중 필터로 대상 시트를 찾는다.
 *   → 스프레드시트 탭 순서가 바뀌거나 로그/보고서 탭이 앞으로 오면
 *     관리자는 정상인데 신청서만 엉뚱한 탭에 기록하게 된다.
 *     조회 오류는 화면에 드러나지만 기록 오류는 조용히 쌓이므로 더 위험하다.
 *
 * 아래 해석기는 관리자와 같은 방식으로 시트를 찾되, 기록용이라는 점을 고려해
 * "못 찾으면 조용히 넘어가지 않고 명확히 실패"한다.
 * 찾은 시트 이름은 6시간 캐시하며, 캐시가 가리키는 시트가 사라지거나 헤더가
 * 달라지면 즉시 재탐색한다.
 * ================================================================== */

/** 신청서가 절대 기록 대상으로 삼으면 안 되는 보조 탭 이름 */
const NON_DATA_SHEET_NAMES_ = [
  '신청제한명단', '신청제한정책', '경고누적', '지도일지', '제한누적',
  '관리자로그', '백업설정', '접속로그', '접속로그_관리자', '차단명단',
  '차단명단_관리자', '이메일발송로그', '출석기록'
];

/**
 * 스프레드시트에서 필수 헤더를 모두 가진 시트를 찾는다.
 * @param {string} ssid            스프레드시트 ID
 * @param {string[]} requiredHeaders 반드시 존재해야 하는 헤더 이름
 * @param {string} label           오류 메시지에 쓸 사람이 읽는 이름
 * @param {number} [headerRow=1]   헤더가 있는 행 번호
 */
function resolveSheetByHeaders_(ssid, requiredHeaders, label, headerRow) {
  const hRow = headerRow || 1;
  const ss = SpreadsheetApp.openById(ssid);
  const cache = CacheService.getScriptCache();
  const ckey = 'sheetname:' + ssid + ':' + requiredHeaders.join('|') + ':' + hRow;

  const hasHeaders = (sh) => {
    try {
      if (!sh || sh.getLastRow() < hRow) return false;
      const lastCol = sh.getLastColumn();
      if (lastCol === 0) return false;
      const hdr = sh.getRange(hRow, 1, 1, lastCol).getValues()[0]
        .map(v => String(v || '').trim());
      return requiredHeaders.every(h => hdr.indexOf(h) !== -1);
    } catch (_) { return false; }
  };

  // 1) 캐시된 시트 이름 재사용 (헤더 재확인 후에만 신뢰)
  try {
    const cached = cache.get(ckey);
    if (cached) {
      const sh = ss.getSheetByName(cached);
      if (sh && hasHeaders(sh)) return sh;
      cache.remove(ckey);
    }
  } catch (_) {}

  // 2) 이름 제외 + 헤더 판별 (관리자 getTargetSheets_ 와 동일한 원칙)
  const excluded = {};
  NON_DATA_SHEET_NAMES_.forEach(n => { excluded[n] = true; });
  const sheets = ss.getSheets();
  const match = sheets.filter(sh => !excluded[sh.getName()] && hasHeaders(sh));

  if (match.length === 1) {
    try { cache.put(ckey, match[0].getName(), 21600); } catch (_) {}
    return match[0];
  }
  if (match.length > 1) {
    // 후보가 여럿이면 가장 앞 탭을 쓰되 로그를 남긴다 (분할 기록 방지)
    Logger.log('[resolveSheetByHeaders_] ' + label + ' 후보 시트 ' + match.length +
      '개: ' + match.map(s => s.getName()).join(', ') + ' → 첫 번째 사용');
    try { cache.put(ckey, match[0].getName(), 21600); } catch (_) {}
    return match[0];
  }

  // 3) 못 찾으면 명확히 실패 — 엉뚱한 탭에 기록하는 것보다 낫다.
  //    어느 헤더가 왜 안 맞는지까지 알려줘야 운영자가 바로 고칠 수 있다.
  //    (실제 사례: 신청 기록 시트 A1 이 '신청ID' 대신 다른 값으로 덮어써져
  //     헤더 조회가 전부 실패한 적이 있다)
  const diag = sheets.slice(0, 6).map(sh => {
    let hdr = [];
    try {
      const lc = sh.getLastColumn();
      if (lc > 0 && sh.getLastRow() >= hRow) {
        hdr = sh.getRange(hRow, 1, 1, lc).getValues()[0].map(v => String(v || '').trim());
      }
    } catch (_) {}
    const miss = requiredHeaders.filter(h => hdr.indexOf(h) === -1);
    return '· ' + sh.getName() + ' → 빠진 헤더: ' + (miss.length ? miss.join(', ') : '없음') +
           ' / 1행 앞부분: ' + (hdr.slice(0, 6).join(' | ') || '(비어 있음)');
  }).join('\n');

  throw new Error(
    label + ' 시트를 찾을 수 없습니다.\n' +
    '필요한 헤더: ' + requiredHeaders.join(', ') + '\n' +
    diag + '\n' +
    '→ 해당 시트 1행의 머리글이 위 이름과 정확히 같은지 확인해 주세요. ' +
    '학과 사무실에 문의해 주세요.'
  );
}

/**
 * ✅ [운영 진단] 신청서가 쓰는 스프레드시트들의 헤더가 정상인지 한 번에 점검한다.
 *   GAS 편집기에서 이 함수를 실행하면 결과가 문자열로 반환된다.
 *   헤더가 하나라도 어긋나면 신청·승인이 통째로 멈추므로, 이상 발생 시 가장 먼저 실행할 것.
 */
function diagnoseSheets() {
  const checks = [
    ['신청 기록',   MAIN_SSID,         ['신청ID', '실험할날짜', '대표자학번', '신청실험실', '신청시간',
                                       '지도승인여부', '최종승인여부', '양식종류']],
    ['시약 기록',   CHEM_RECORD_SSID,  ['신청ID', '시약명', '상태', '폐기 방법']],
    ['임시저장',    DRAFT_SSID,        ['초안ID', '대표자학번', '대표자이름', 'JSON', '수정일시']],
    ['지도교사 목록', TEACHER_LIST_SSID, ['교사이름', '과목']],
  ];
  const out = ['📋 신청서 시트 진단', ''];
  let bad = 0;
  checks.forEach(([label, ssid, need]) => {
    try {
      const ss = SpreadsheetApp.openById(ssid);
      let best = null, bestMiss = null;
      ss.getSheets().forEach(sh => {
        let hdr = [];
        try {
          const lc = sh.getLastColumn();
          if (lc > 0) hdr = sh.getRange(1, 1, 1, lc).getValues()[0].map(v => String(v || '').trim());
        } catch (_) {}
        const miss = need.filter(h => hdr.indexOf(h) === -1);
        if (best === null || miss.length < bestMiss.length) { best = sh; bestMiss = miss; }
      });
      if (!best) { out.push('[' + label + '] ❌ 시트가 없습니다'); bad++; return; }
      if (bestMiss.length === 0) {
        out.push('[' + label + '] ✅ 정상 (탭: ' + best.getName() + ')');
      } else {
        bad++;
        const hdr = best.getRange(1, 1, 1, best.getLastColumn()).getValues()[0]
          .map(v => String(v || '').trim());
        out.push('[' + label + '] ❌ 헤더 누락: ' + bestMiss.join(', '));
        out.push('        탭: ' + best.getName() + ' / 1행: ' + hdr.slice(0, 10).join(' | '));
        out.push('        → 1행 머리글을 위 이름과 정확히 같게 고쳐 주세요.');
      }
    } catch (e) {
      bad++;
      out.push('[' + label + '] ❌ 열기 실패: ' + (e && e.message || e));
    }
  });
  out.push('', bad === 0 ? '✅ 모든 시트 정상' : '⚠️ 문제 ' + bad + '건 — 위 항목을 고치기 전에는 신청·승인이 정상 동작하지 않습니다.');
  const msg = out.join('\n');
  Logger.log(msg);
  return msg;
}

/** 신청 기록 시트 (관리자 isApplicationSheet_ 와 동일 기준) */
function getMainSheet_() {
  return resolveSheetByHeaders_(MAIN_SSID, ['신청ID', '실험할날짜'], '신청 기록');
}
/** 시약 기록 시트 */
function getChemRecordSheet_() {
  return resolveSheetByHeaders_(CHEM_RECORD_SSID, ['신청ID', '시약명'], '시약 기록');
}
/** 임시저장 시트 */
function getDraftSheet_() {
  return resolveSheetByHeaders_(DRAFT_SSID, ['대표자학번', 'JSON'], '임시저장');
}
/** 지도교사 목록 시트 */
function getTeacherListSheet_() {
  return resolveSheetByHeaders_(TEACHER_LIST_SSID, ['교사이름'], '지도교사 목록');
}
/** 실험실 담당교사 목록 시트 */
function getLabTeacherSheet_() {
  const ss = SpreadsheetApp.openById(LAB_TEACHER_SSID);
  // '담당 실험실' / '담당실험실' 두 표기를 모두 허용해야 하므로 개별 탐색
  const sheets = ss.getSheets();
  for (let i = 0; i < sheets.length; i++) {
    const sh = sheets[i];
    try {
      if (sh.getLastRow() < 1 || sh.getLastColumn() === 0) continue;
      const hdr = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0]
        .map(v => String(v || '').trim());
      if (hdr.indexOf('담당 실험실') !== -1 || hdr.indexOf('담당실험실') !== -1) return sh;
    } catch (_) {}
  }
  throw new Error('실험실 담당교사 목록 시트를 찾을 수 없습니다. ("담당 실험실" 열 필요)\n' +
    '현재 탭: ' + sheets.map(s => s.getName()).join(', '));
}

/* ------------------------- 공통 유틸 ------------------------- */
/** HTML 특수문자 이스케이프 (이메일 XSS 방지) */
function escapeHtml_(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

/**
 * [v3.58 / 6-2] 템플릿 <script> 내 JSON 주입용 — '<' 를 < 로 이스케이프.
 *   학생 자유 입력에 '</script>' 문자열이 들어가면 승인 페이지 스크립트가
 *   조기 종료되어 페이지 전체가 마비되던 문제 방지.
 */
function jsonForScript_(obj) {
  return JSON.stringify(obj === undefined ? null : obj).replace(/</g, '\\u003c');
}

function getHeaderMap_(sheet) {
  const lastCol = sheet.getLastColumn();
  if (lastCol === 0) throw new Error('시트 헤더가 비어있습니다.');
  const header = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const map = {};
  header.forEach((h, i) => { map[String(h).trim()] = i; });
  return { header, map };
}
const pad2_ = n => ('0' + n).slice(-2);

function normalizeToHHmm_(v) {
  if (v === null || v === undefined || v === '') return '';
  if (v instanceof Date) return pad2_(v.getHours()) + ':' + pad2_(v.getMinutes());
  if (typeof v === 'number') {
    const totalMinutes = Math.round(v * 24 * 60);
    const hh = Math.floor(totalMinutes / 60) % 24;
    const mm = totalMinutes % 60;
    return pad2_(hh) + ':' + pad2_(mm);
  }
  if (typeof v === 'string') {
    const s = v.trim();
    const m = s.match(/^(\d{1,2}):(\d{2})$/);
    if (m) {
      const hh = Math.min(23, Math.max(0, parseInt(m[1], 10)));
      const mm = Math.min(59, Math.max(0, parseInt(m[2], 10)));
      return pad2_(hh) + ':' + pad2_(mm);
    }
    const d = new Date(s);
    if (!isNaN(d.getTime())) return pad2_(d.getHours()) + ':' + pad2_(d.getMinutes());
    return s;
  }
  return String(v);
}

/* Apps Script의 Utilities.formatDate에서 'Z'는 +0900 형식 → 콜론 추가해 +09:00로 변환 */
function _tzOffsetWithColon_(d, tz) {
  const z = Utilities.formatDate(d, tz, 'Z');
  return z.replace(/([+-])(\d{2})(\d{2})/, '$1$2:$3');
}
function toISOWithOffset_(d, { tz = Session.getScriptTimeZone(), dateOnly = false } = {}) {
  const Y  = Utilities.formatDate(d, tz, 'yyyy');
  const M  = Utilities.formatDate(d, tz, 'MM');
  const D  = Utilities.formatDate(d, tz, 'dd');
  const hh = Utilities.formatDate(d, tz, 'HH');
  const mm = Utilities.formatDate(d, tz, 'mm');
  const ss = Utilities.formatDate(d, tz, 'ss');
  const off = _tzOffsetWithColon_(d, tz);
  if (dateOnly) return `${Y}-${M}-${D}T00:00:00${off}`;
  return `${Y}-${M}-${D}T${hh}:${mm}:${ss}${off}`;
}

/* === 7교시 체크박스 유효성 === */
function isSeventhCheckedAndValid_(data) {
  const rawFlag =
    data.seventhPeriod || data.seventh || data.is7thPeriod || data.is7th ||
    data['7thPeriod'] || data['period7'] || data['isSeventh'] || false;
  const checked = !!rawFlag;
  const isClubPurpose = String(data.purpose || '').trim() === '동아리 활동';
  let isTuesday = false;
  if (data.date) {
    const d = new Date(data.date);
    if (!isNaN(d.getTime())) isTuesday = d.getDay() === 2; // Tue=2
  }
  // [v3.58 / 7-4] 7교시 예외는 "7교시만 단독 신청"일 때만 인정.
  //   기존엔 7교시+ET를 함께 체크하면 ET 시간대까지 제한 검사를 통과했음.
  const slots = String(data.timeSlot || '').split(',')
    .map(s => normalizeSlot_(s.trim())).filter(Boolean);
  const onlySeventh = slots.length > 0 && slots.every(s => s === '7교시');
  return checked && isClubPurpose && isTuesday && onlySeventh;
}

/* ---- 폼 정규화 ---- */
function normalizeDateYMD_(s) {
  if (s instanceof Date && !isNaN(s.getTime())) {
    const y = s.getFullYear();
    const m = ('0' + (s.getMonth() + 1)).slice(-2);
    const d = ('0' + s.getDate()).slice(-2);
    return `${y}-${m}-${d}`;
  }
  const str = String(s || '').trim();
  const m = str.match(/(\d{4})[-./](\d{1,2})[-./](\d{1,2})/);
  if (m) {
    const y = m[1];
    const mm = ('0' + m[2]).slice(-2);
    const dd = ('0' + m[3]).slice(-2);
    return `${y}-${mm}-${dd}`;
  }
  const d = new Date(str);
  if (!isNaN(d.getTime())) {
    const y = d.getFullYear();
    const mm = ('0' + (d.getMonth() + 1)).slice(-2);
    const dd = ('0' + d.getDate()).slice(-2);
    return `${y}-${mm}-${dd}`;
  }
  return '';
}
function normalizeStudentId_(s) { const d = String(s || '').replace(/\D/g, ''); return d ? d.padStart(5, '0') : ''; }
function normalizeName_(s)      { return String(s || '').trim(); }

/* ========================= 이메일 발송 헬퍼 ========================= */
/**
 * HTML → plain text 변환 (text fallback용)
 * - 태그 제거, &nbsp; 등 엔티티 복원, 연속 공백/줄바꿈 정리
 */
function htmlToPlainText_(html) {
  if (!html) return '';
  return String(html)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/h[1-6]>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
}

/**
 * HTML 이메일 래퍼 - 깔끔한 이메일 포맷
 * ※ title / linkLabel은 내부에서 escape (방어적)
 * ※ bodyLines는 이미 호출부에서 escape된 문자열로 가정 (HTML 태그 허용)
 */
function buildEmailHtml_(title, bodyLines, linkUrl, linkLabel) {
  const safeTitle = escapeHtml_(title || '');
  const safeLinkLabel = escapeHtml_(linkLabel || '바로가기');
  const rows = (bodyLines || []).map(l => {
    if (l === '') return '<br>';
    if (String(l).startsWith('•')) return `<div style="padding:2px 0 2px 12px;">${l}</div>`;
    return `<div style="padding:2px 0;">${l}</div>`;
  }).join('');
  const safeUrl = linkUrl ? escapeHtml_(linkUrl) : '';
  const linkBlock = safeUrl
    ? `<div style="margin:18px 0;"><a href="${safeUrl}" style="display:inline-block;padding:10px 24px;background:#4285F4;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold;">${safeLinkLabel}</a></div>`
    : '';
  return `<div style="font-family:'맑은 고딕',Arial,sans-serif;max-width:620px;margin:0 auto;padding:20px;">
    <div style="background:#fff8e1;border-left:4px solid #f59e0b;padding:8px 12px;font-size:12px;color:#92400e;margin-bottom:16px;">📨 과학 실험·실습실 신청 시스템에서 자동 발송한 메일입니다. 회신은 ${escapeHtml_(SCIENCE_EMAIL)} 으로 보내주세요.</div>
    <h2 style="color:#333;border-bottom:2px solid #4285F4;padding-bottom:8px;">${safeTitle}</h2>
    <div style="line-height:1.8;color:#444;">${rows}</div>
    ${linkBlock}
    <hr style="border:none;border-top:1px solid #eee;margin:24px 0 8px;">
    <div style="background:#fef2f2;border-left:4px solid #dc2626;padding:8px 12px;font-size:11px;color:#7f1d1d;margin-top:12px;">
      <b>🔒 보안 안내</b><br>
      본 메일에는 학생 개인정보(이름·학번·실험 주제)가 포함되어 있습니다. <b>무단 캡처·전달·외부 공유를 금지</b>합니다.
      승인 링크는 수신자 본인 인증으로만 작동하며, 모든 접속·승인 시도는 자동 기록·추적됩니다.
      메일이 의심스러우면 ${escapeHtml_(SCIENCE_EMAIL)} 으로 즉시 신고해 주세요.
    </div>
    <div style="font-size:12px;color:#999;margin-top:8px;">본 메일은 과학 실험·실습실 신청 시스템에서 자동 발송되었습니다. 문의: ${escapeHtml_(SCIENCE_EMAIL)}</div>
  </div>`;
}

/**
 * 공통 메일 발송 함수
 * - 발신자를 SCIENCE_EMAIL로 통일
 * - 이메일 형식 기본 검증
 * - HTML 미지원 클라이언트용 text body 자동 생성
 * - 실패 시 로깅 + 결과 객체 반환
 * @param {string} to       수신자 이메일
 * @param {string} subject  제목
 * @param {string} htmlBody HTML 본문
 * @returns {{ ok: boolean, error?: string }}
 */
/**
 * [관측] 메일 발송 로그를 MAIN 스프레드시트의 "이메일발송로그" 시트에 append.
 * 미발신/미수신 구분이 필요할 때 시계열로 사실 확인 가능.
 * 시트 자동 생성. 실패해도 본 발송 흐름엔 영향 없음.
 */
/* =====================================================================
 * [SEC-P3 / P1-3] 메일 승인 링크 HMAC 토큰 시스템
 *   - 메일에 포함된 승인 URL에 t=<base64url(payload).base64url(sig)> 부착
 *   - payload: appId|stage|recipientEmail|exp
 *   - 검증: 서명 일치 + 만료 전 + 수신자 == 세션 이메일
 *   - 효과: 학생이 교사 메일을 가로채도 본인 세션이 아니라 페이지 거부.
 *           메일을 캡처해서 외부 공유해도 다른 사람이 클릭하면 토큰 검증 실패.
 *
 *   ⚠️ 시크릿 키는 PropertiesService.ScriptProperties 의 'MAIL_TOKEN_SECRET' 에 저장.
 *      미설정 시 자동으로 32바이트 무작위 시크릿 생성 (한 번만).
 *      운영 중 시크릿을 변경하면 발송 완료된 모든 메일 링크가 무효화되므로 주의.
 * ===================================================================== */

function _getMailTokenSecret_() {
  try {
    const props = PropertiesService.getScriptProperties();
    let secret = props.getProperty('MAIL_TOKEN_SECRET');
    if (!secret) {
      // 한 번만 자동 생성 (32바이트 무작위 → base64url)
      const bytes = [];
      for (let i = 0; i < 32; i++) bytes.push(Math.floor(Math.random() * 256));
      secret = Utilities.base64EncodeWebSafe(bytes);
      props.setProperty('MAIL_TOKEN_SECRET', secret);
      Logger.log('[SEC-P3] MAIL_TOKEN_SECRET 자동 생성 완료');
    }
    return secret;
  } catch (e) {
    Logger.log('[_getMailTokenSecret_] 시크릿 조회 실패: ' + (e && e.message ? e.message : e));
    return '_FALLBACK_NOT_SAFE_'; // PropertiesService 권한 없으면 폴백 (사실상 토큰 무력화)
  }
}

function _b64urlEncode_(input) {
  // input: string OR byte array
  if (typeof input === 'string') {
    return Utilities.base64EncodeWebSafe(Utilities.newBlob(input).getBytes()).replace(/=+$/, '');
  }
  return Utilities.base64EncodeWebSafe(input).replace(/=+$/, '');
}

function _b64urlDecodeBytes_(s) {
  // padding 복구
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  return Utilities.base64DecodeWebSafe(s + pad);
}

function _b64urlDecodeStr_(s) {
  const bytes = _b64urlDecodeBytes_(s);
  return Utilities.newBlob(bytes).getDataAsString();
}

/* [v3.54] 승인 링크 토큰 기본 유효기간 — 30일.
 *   방학/시험기간 지연을 고려해 7일 → 30일로 확대.
 *   ⚠️ 새로 발송되는 메일부터 적용됨. 이미 발송된 메일은 발송 시점 기간(옛 7일) 유지. */
const MAIL_TOKEN_TTL_SEC = 30 * 24 * 60 * 60; // 30일

/**
 * 승인 메일 URL용 HMAC 토큰 생성.
 * @param {string} appId            신청 ID
 * @param {'approve'|'final'} stage 승인 단계
 * @param {string} recipientEmail   메일 수신자 (소문자 정규화)
 * @param {number} [ttlSec=MAIL_TOKEN_TTL_SEC] 유효 기간(초). 기본 30일.
 * @returns {string} 토큰 (payloadB64.sigB64)
 */
function genApprovalToken_(appId, stage, recipientEmail, ttlSec) {
  const ttl = (typeof ttlSec === 'number' && ttlSec > 0) ? ttlSec : MAIL_TOKEN_TTL_SEC;
  const exp = Math.floor(Date.now() / 1000) + ttl;
  const rcpt = String(recipientEmail || '').trim().toLowerCase();
  const payload = [String(appId), String(stage), rcpt, String(exp)].join('|');
  const sig = Utilities.computeHmacSha256Signature(payload, _getMailTokenSecret_());
  return _b64urlEncode_(payload) + '.' + _b64urlEncode_(sig);
}

/**
 * 토큰 검증.
 * @param {string} token         메일 URL의 t 파라미터
 * @param {string} appId         현재 URL의 신청 ID
 * @param {string} stage         '' (approve.html) or 'final' (finalApprove.html)
 * @param {string} sessionEmail  현재 로그인한 사용자 이메일 (소문자 정규화 추천)
 * @returns {{ok:boolean, error?:string, payload?:object}}
 */
function verifyApprovalToken_(token, appId, stage, sessionEmail) {
  if (!token) return { ok: false, error: '토큰이 없습니다 (메일의 링크로 직접 접속해 주세요).' };
  const dot = token.indexOf('.');
  if (dot < 1) return { ok: false, error: '토큰 형식이 올바르지 않습니다.' };
  const payloadB64 = token.slice(0, dot);
  const sigB64 = token.slice(dot + 1);

  let payloadStr;
  try { payloadStr = _b64urlDecodeStr_(payloadB64); }
  catch (_) { return { ok: false, error: '토큰을 해독할 수 없습니다.' }; }

  // 서명 검증
  const expectedSig = Utilities.computeHmacSha256Signature(payloadStr, _getMailTokenSecret_());
  const expectedB64 = _b64urlEncode_(expectedSig);
  if (sigB64 !== expectedB64) {
    return { ok: false, error: '토큰 서명 불일치 — 위조된 링크입니다.' };
  }

  const parts = payloadStr.split('|');
  if (parts.length !== 4) return { ok: false, error: '토큰 payload 손상.' };
  const [tAppId, tStage, tRcpt, tExpStr] = parts;
  const tExp = Number(tExpStr);

  // [v3.55] appId/stage를 만료보다 먼저 검증 → "만료" 결과가 신뢰 가능(서명+appId+stage 정상)해야
  //         자동 재발급 시 안전하게 payload를 신뢰할 수 있음.
  // appId 일치
  if (String(tAppId) !== String(appId)) {
    return { ok: false, error: '토큰의 신청 ID와 URL이 일치하지 않습니다.' };
  }

  // stage 일치 (approve / final)
  const normStage = (stage === 'final') ? 'final' : 'approve';
  if (tStage !== normStage) {
    return { ok: false, error: '토큰의 승인 단계와 URL이 일치하지 않습니다.' };
  }

  // 만료 확인 — 서명·appId·stage는 정상이므로 "정당하게 발급됐으나 기한 경과"임이 보장됨.
  //   expired:true + payload 반환 → 호출부(doGet)가 자동 재발급 판단에 사용.
  if (!tExp || Date.now() / 1000 > tExp) {
    return {
      ok: false,
      expired: true,
      error: '토큰이 만료되었습니다. (메일 발송 후 유효기간 경과)',
      payload: { appId: tAppId, stage: tStage, recipient: tRcpt, exp: tExp }
    };
  }

  // 수신자 == 세션 이메일 (stage별 분기)
  // [HOTFIX v3.47 2026-05-21] 최종 승인(final)은 수신자 검증 완전 해제, 1차 승인(approve)은 기존 엄격 검증 유지.
  //   - 최종 승인자들이 multi-account 환경에서 불편 겪어 운영 측 요청으로 해제.
  //   - 토큰 자체는 여전히 HMAC 서명되어 위조 불가능.
  //   - 1차 지도교사 승인은 학생 신원 보호를 위해 본인 인증 유지.
  const sess = String(sessionEmail || '').trim().toLowerCase();

  if (tStage === 'final') {
    // [v3.58 / 2-3] 최종 승인 수신자 검증 복원.
    //   v3.47에서 완전 해제했더니 URL만 알면 학생 본인도 자기 신청을 최종 승인할 수
    //   있는 상태였음. 복원하되 multi-account 불편(해제의 원래 이유)은
    //   "수신자 본인 OR 등록된 승인 주체(교사/실험실 계정/관리자)" 허용으로 해소.
    if (!sess) {
      return { ok: false, error: '세션 정보를 가져올 수 없습니다. 학교 계정으로 로그인 후 메일의 링크로 다시 접속해 주세요.' };
    }
    if (sess !== tRcpt) {
      const isApproverSession = isAdminEmail_(sess) || !!getSessionTeacher_() || isSessionLabTeacher_();
      if (!isApproverSession) {
        return {
          ok: false,
          error: '본인 메일로 받은 링크가 아닙니다. (수신자: ' + tRcpt + ' / 현재 로그인: ' + sess + ')\n승인 담당 계정으로 로그인한 뒤 다시 열어 주세요.'
        };
      }
      try {
        _logAccessAttempt_('verifyApprovalToken_final_cross', sess, String(tAppId), 'allow',
          '[v3.58] 최종 승인 — 수신자 외 승인 주체 세션 허용 (토큰=' + tRcpt + ' / 세션=' + sess + ')');
      } catch (_) {}
    }
  } else {
    // 1차 지도교사 승인 단계: 기존 엄격 검증
    if (!sess) return { ok: false, error: '세션 정보를 가져올 수 없습니다. 로그인 후 다시 시도해 주세요.' };
    if (sess !== tRcpt) {
      return { ok: false, error: '본인 메일로 받은 링크가 아닙니다. (수신자: ' + tRcpt + ' / 현재 로그인: ' + sess + ')' };
    }
  }

  return {
    ok: true,
    payload: { appId: tAppId, stage: tStage, recipient: tRcpt, exp: tExp, sessionMismatch: (sess && sess !== tRcpt) }
  };
}

/** 수동 시크릿 재설정 — 운영 중 모든 메일 링크 무효화. 신중히 사용. */
function rotateMailTokenSecret() {
  PropertiesService.getScriptProperties().deleteProperty('MAIL_TOKEN_SECRET');
  _getMailTokenSecret_(); // 즉시 새로 생성
  return '✅ 메일 토큰 시크릿이 갱신되었습니다. 발송 완료된 모든 메일의 승인 링크가 무효화되었습니다.';
}

/**
 * [P2-5] 메일 발송 quota 진단.
 *   관리자만 호출 가능 — 일일 남은 quota + 최근 발송 통계 반환.
 *   GAS 일일 한도: 개인 계정 100통 / Workspace 1500통.
 */
function getMailQuotaDiagnostics() {
  const sessionEmail = getSessionEmail_();
  if (!isAdminEmail_(sessionEmail) && !getSessionTeacher_()) {
    _logAccessAttempt_('getMailQuotaDiagnostics', sessionEmail, '', 'deny', '관리자/교사 아님');
    throw new Error('quota 조회는 교사/관리자만 가능합니다.');
  }
  let remaining = -1;
  try { remaining = MailApp.getRemainingDailyQuota(); } catch (e) { remaining = -1; }

  // 오늘 발송 로그 통계
  let todaySent = 0, todayFailed = 0, last24h = 0;
  try {
    const ss = SpreadsheetApp.openById(MAIN_SSID);
    const sh = ss.getSheetByName('이메일발송로그');
    if (sh && sh.getLastRow() >= 2) {
      const vals = sh.getRange(2, 1, sh.getLastRow() - 1, 4).getValues();
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const dayAgo = new Date(now.getTime() - 24*60*60*1000);
      vals.forEach(r => {
        const ts = r[0] instanceof Date ? r[0] : new Date(r[0]);
        if (isNaN(ts)) return;
        if (ts >= dayAgo) last24h++;
        if (ts >= todayStart) {
          if (r[3] === 'ok') todaySent++;
          else todayFailed++;
        }
      });
    }
  } catch (_) {}

  _logAccessAttempt_('getMailQuotaDiagnostics', sessionEmail, '', 'allow',
    'remaining=' + remaining + ', todaySent=' + todaySent + ', todayFailed=' + todayFailed);

  return {
    remaining: remaining,
    todaySent: todaySent,
    todayFailed: todayFailed,
    last24h: last24h,
    warning: remaining >= 0 && remaining < 30 ? '⚠️ quota 30통 미만 — 발송 실패 위험' : ''
  };
}

function logMailEvent_(to, subject, ok, error) {
  try {
    const ss = SpreadsheetApp.openById(MAIN_SSID);
    let sh = ss.getSheetByName('이메일발송로그');
    if (!sh) {
      sh = ss.insertSheet('이메일발송로그');
      sh.getRange(1, 1, 1, 6).setValues([['시각','수신자','제목','상태','오류','보낸이']]);
      sh.setFrozenRows(1);
    }
    sh.appendRow([
      new Date(),
      String(to || ''),
      String(subject || '').slice(0, 200),
      ok ? 'ok' : 'fail',
      String(error || '').slice(0, 500),
      Session.getActiveUser().getEmail() || ''
    ]);
  } catch (e) {
    Logger.log('[logMailEvent_] 로그 기록 실패: ' + e.message);
  }
}

function sendMail_(to, subject, htmlBody) {
  const addr = String(to || '').trim();
  // [SEC] 이메일 형식 강화 — 헤더 인젝션 방지 + 도메인 검증
  if (!addr || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr) || /[\r\n]/.test(addr)) {
    const msg = '유효하지 않은 이메일 주소: ' + addr;
    Logger.log('[sendMail_] ' + msg);
    logMailEvent_(addr, subject, false, msg);
    return { ok: false, error: msg };
  }
  // [SEC] 학교 외부 도메인 차단 (자동 메일 정보 유출 방지). cnsa.hs.kr만 허용.
  if (!/@cnsa\.hs\.kr$/i.test(addr)) {
    const msg = '학교 외부 도메인 차단: ' + addr;
    Logger.log('[sendMail_] ' + msg);
    logMailEvent_(addr, subject, false, msg);
    return { ok: false, error: msg };
  }
  // [SEC] subject CRLF 인젝션 방어 + 길이 상한
  const safeSubject = String(subject || '').replace(/[\r\n\t]/g, ' ').slice(0, 200);
  try {
    const textBody = htmlToPlainText_(htmlBody) ||
      'HTML 형식의 메일입니다. HTML을 지원하는 메일 클라이언트에서 확인해 주세요.';

    const opts = {
      htmlBody: htmlBody,
      // [개선] 발신자 이름 친절 표시 — 학생이 학과 자동 메일임을 즉시 인식
      name: '과학 실험·실습실 신청 시스템',
      // [개선] 회신 시 학과 메일로 라우팅
      replyTo: SCIENCE_EMAIL
    };

    // from 옵션: SCIENCE_EMAIL이 Gmail "보내기 주소(Send As)"로 등록된 경우에만 사용
    let useFrom = false;
    try {
      const aliases = GmailApp.getAliases();
      if (aliases.indexOf(SCIENCE_EMAIL) !== -1) {
        useFrom = true;
      } else {
        Logger.log('[sendMail_] SCIENCE_EMAIL(' + SCIENCE_EMAIL + ')이 Gmail 별칭에 미등록 → from 생략 (Gmail 설정에서 별칭 추가 권장)');
      }
    } catch (aliasErr) {
      Logger.log('[sendMail_] getAliases 실패 → from 생략: ' + String(aliasErr.message || aliasErr));
    }

    if (useFrom) {
      try {
        opts.from = SCIENCE_EMAIL;
        GmailApp.sendEmail(addr, safeSubject, textBody, opts);
      } catch (fromErr) {
        Logger.log('[sendMail_] from 옵션 발송 실패, from 없이 재시도: ' + String(fromErr.message || fromErr));
        delete opts.from;
        GmailApp.sendEmail(addr, safeSubject, textBody, opts);
      }
    } else {
      GmailApp.sendEmail(addr, safeSubject, textBody, opts);
    }

    Logger.log('[sendMail_] 발송 성공 → ' + addr + ' / 제목: ' + safeSubject);
    logMailEvent_(addr, safeSubject, true, '');
    return { ok: true };
  } catch (e) {
    const msg = String(e.message || e);
    Logger.log('[sendMail_] 발송 실패 (' + addr + '): ' + msg);
    console.error('[sendMail_] 발송 실패 (' + addr + '): ' + msg);
    logMailEvent_(addr, subject, false, msg);
    return { ok: false, error: msg };
  }
}

/**
 * 메일 발송 실패 시 학과(SCIENCE_EMAIL)에 수동 처리 요청 폴백 메일
 * @param {string} stage     '1차 승인' | '최종 승인' 등 문맥
 * @param {string} recipient 원래 받았어야 할 대상자 설명 ('학생 홍길동 (20001)')
 * @param {string} reason    실패 사유 배열 또는 문자열
 * @param {object} rec       신청 row (context 표시용, optional)
 * @returns {{ ok: boolean, error?: string }}
 */
function sendAdminFallbackEmail_(stage, recipient, reason, rec) {
  const e = escapeHtml_;
  const reasonText = Array.isArray(reason) ? reason.join(' / ') : String(reason || '');
  const lines = [
    `<b>[${e(stage)}] 자동 메일 발송 실패</b>`,
    `시스템이 아래 대상자에게 메일을 자동 발송하지 못했습니다. 직접 연락 또는 수동 처리가 필요합니다.`,
    '',
    `• 대상: ${e(recipient)}`,
    `• 실패 사유: ${e(reasonText)}`
  ];
  if (rec && typeof rec === 'object') {
    lines.push(
      '',
      `• 신청 ID: ${e(rec['신청ID'] || '')}`,
      `• 대표자: ${e(rec['대표자이름'] || '')} (${e(rec['대표자학번'] || '')})`,
      `• 실험실: ${e(rec['신청실험실'] || '')}`,
      `• 날짜/시간: ${e(normalizeDateYMD_(rec['실험할날짜']))} / ${e(rec['신청시간'] || '')}`,
      `• 실험·실습 주제: ${e(rec['실험제목'] || '')}`
    );
  }
  const subject = `[수동 처리 요청] ${stage} - ${recipient} 메일 발송 실패`;
  const body = buildEmailHtml_('메일 자동 발송 실패 알림', lines);
  return sendMail_(SCIENCE_EMAIL, subject, body);
}

/** 학생 이메일 주소 생성 (학번 5자리 → 학번@cnsa.hs.kr) */
function getStudentEmail_(studentId) {
  const sid = String(studentId || '').trim();
  if (!sid || !/^\d{5}$/.test(sid)) return '';
  return sid + '@cnsa.hs.kr';
}

/* =====================================================================
 * [SEC] 보안 헬퍼 — 신청 조회/수정/승인 시 호출자 본인 확인
 *   - 학생: 본인 학번과 세션 이메일이 일치해야 본인 데이터 조회/수정 허용.
 *   - 교사: 교사 시트에 등록된 이메일은 모든 학생 데이터 조회/승인 허용.
 *   - 학과(SCIENCE_EMAIL)·ScriptProperties.ADMIN_EMAILS 는 관리자급으로 무제한 허용.
 *   - 본 헬퍼는 ★ Phase 1 보안 강화 (★ SEC-P1) — 메일 토큰 검증(★ SEC-P3)은 별도 단계.
 * ===================================================================== */

/** 현재 세션 사용자 이메일 (소문자, trim). 권한 부족·세션 없음 시 빈 문자열. */
function getSessionEmail_() {
  try {
    return String(Session.getActiveUser().getEmail() || '').trim().toLowerCase();
  } catch (_) { return ''; }
}

/** 학번이 세션 사용자 본인의 학번인지 (학번@cnsa.hs.kr 매칭) */
function isSelfStudentId_(studentId) {
  const expected = String(getStudentEmail_(studentId) || '').toLowerCase();
  const actual = getSessionEmail_();
  return !!expected && expected === actual;
}

/** 세션 사용자가 교사 시트에 등록되어 있는지. 등록되어 있으면 {name,email,subject} 반환, 아니면 null. */
function getSessionTeacher_() {
  const email = getSessionEmail_();
  if (!email) return null;
  try {
    const cache = CacheService.getScriptCache();
    const ck = 'teacher-by-email:v1:' + email;
    const hit = cache.get(ck);
    if (hit) {
      try { const obj = JSON.parse(hit); return obj || null; } catch (_) {}
    }
    const rows = getTeacherListSheet_().getDataRange().getValues();
    const [hdr, ...data] = rows;
    const nameIdx = hdr.indexOf('교사이름');
    const emailIdx = hdr.indexOf('이메일주소') !== -1 ? hdr.indexOf('이메일주소') : hdr.indexOf('이메일 주소');
    const subjectIdx = hdr.indexOf('과목');
    if (emailIdx === -1) return null;
    const row = data.find(r => String(r[emailIdx] || '').trim().toLowerCase() === email);
    if (!row) {
      try { cache.put(ck, '', 300); } catch (_) {}
      return null;
    }
    const out = { name: row[nameIdx], email: row[emailIdx], subject: row[subjectIdx] || '' };
    try { cache.put(ck, JSON.stringify(out), 300); } catch (_) {}
    return out;
  } catch (e) {
    Logger.log('[getSessionTeacher_] 시트 조회 실패: ' + (e && e.message ? e.message : e));
    return null;
  }
}

/** 관리자급 이메일인지 (학과 메일 + ScriptProperties.ADMIN_EMAILS) */
function isAdminEmail_(email) {
  const e = String(email || '').trim().toLowerCase();
  if (!e) return false;
  if (e === String(SCIENCE_EMAIL || '').toLowerCase()) return true;
  try {
    const list = (PropertiesService.getScriptProperties().getProperty('ADMIN_EMAILS') || '')
      .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
    if (list.indexOf(e) !== -1) return true;
  } catch (_) {}
  return false;
}

/**
 * [v3.58 / 1-1] 실험실 담당(공용) 계정 이메일 집합.
 *   LAB_TEACHER 시트의 "이메일 주소" 컬럼 전체 — 최종 승인 권한 인정용.
 *   교사 명단(TEACHER_LIST)에 미등록인 공용 계정(bio_lab 등)이 승인 과정에서
 *   "권한 없음" 판정 → 의심점수 누적 → 자동 차단되던 실제 장애(2026-05~06)의 근본 수정.
 *   5분 캐싱.
 */
function getLabTeacherEmailSet_() {
  try {
    const cache = CacheService.getScriptCache();
    const CK = 'lab-teacher-emails:v1';
    const hit = cache.get(CK);
    if (hit) {
      try { return new Set(JSON.parse(hit)); } catch (_) {}
    }
    const rows = getLabTeacherSheet_().getDataRange().getValues();
    const [hdr, ...data] = rows;
    const mailIdx = hdr.findIndex(h => {
      const t = String(h).trim();
      return t === '이메일 주소' || t === '이메일주소';
    });
    if (mailIdx === -1) return new Set();
    const emails = data
      .map(r => String(r[mailIdx] || '').trim().toLowerCase())
      .filter(e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
    try { cache.put(CK, JSON.stringify(emails), 300); } catch (_) {}
    return new Set(emails);
  } catch (e) {
    Logger.log('[getLabTeacherEmailSet_] 조회 실패: ' + (e && e.message ? e.message : e));
    return new Set();
  }
}

/** 세션 사용자가 실험실 담당(공용) 계정인지 */
function isSessionLabTeacher_() {
  const email = getSessionEmail_();
  if (!email) return false;
  return getLabTeacherEmailSet_().has(email);
}

/**
 * [SEC-P4] 클라이언트에서 호출해 현재 세션 사용자의 학번/역할 조회.
 *   페이지 로드 시 학생이면 studentId input을 자동 채우고 잠금 처리하는 데 사용.
 *   본인 정보만 반환하므로 본인 확인 불필요 (학생도 호출 가능).
 */
function getMyStudentInfo() {
  const email = getSessionEmail_();
  const sid = getSessionStudentId_();
  const teacher = getSessionTeacher_();
  const isAdmin = isAdminEmail_(email);
  return {
    studentId: sid,                 // 학생이면 5자리, 아니면 ''
    email: email,
    isStudent: !!sid,
    isTeacher: !!teacher,
    teacherName: teacher ? teacher.name : '',
    isAdmin: isAdmin
  };
}

/* =====================================================================
 * [SEC-P5] 자동 차단 + 글로벌 회로 차단기 + 차단 명단
 *   목적:
 *     - 학생이 짧은 시간에 deny가 누적되면 자동으로 일정 시간 차단
 *     - 시스템 전체 부하가 임계 초과 시 일정 시간 모든 요청 거부 (DDoS 방어)
 *     - 차단된 학생은 모든 가드에서 우선 거부
 *     - 차단 발생 시 학과(SCIENCE_EMAIL)에 자동 알림 메일
 *   캐시 키 설계:
 *     - 의심 점수: 'susp:' + email + ':' + day(YYYYMMDD)
 *     - 자동 차단: 'block:' + email                         (TTL = 차단 기간)
 *     - 글로벌 카운터: 'global:' + minute-slot              (TTL 65초)
 *     - 회로 차단: 'circuit:open'                           (TTL = 일정 시간)
 *   영구 시트: '차단명단' (관리자 수동 차단 + 자동 차단 영구 로그)
 * ===================================================================== */

// 정책 상수 — 운영 중 조정 가능
const _SEC_AUTO_BLOCK = {
  // [v3.58 / 3-2] 오탐 1회(=5점)로 즉시 1시간 차단되던 정책 완화.
  //   자동완성 honeypot 오탐·학번 오입력·재시도 연쇄로 정상 학생/교사가 차단된
  //   실제 사례(2026-05~06, 8건)에 따른 조정: 임계 10점(=명백한 이상 행동 2회 이상),
  //   차단 15분. 반복 위반자는 여전히 차단명단에 누적 기록됨.
  DENY_THRESHOLD: 10,        // 의심 점수 임계치
  WINDOW_SEC: 600,           // 점수 누적 윈도우 (10분)
  BLOCK_DURATION_SEC: 900,   // 자동 차단 기간 (15분)
  GLOBAL_LIMIT_PER_MIN: 200, // 시스템 전체 분당 호출 상한
  CIRCUIT_BREAK_SEC: 300     // 회로 차단 지속 시간 (5분)
};
const BLOCK_LIST_SHEET_NAME = '차단명단';

function _ensureBlockListSheet_() {
  const ss = SpreadsheetApp.openById(MAIN_SSID);
  let sh = ss.getSheetByName(BLOCK_LIST_SHEET_NAME);
  if (sh) return sh;
  sh = ss.insertSheet(BLOCK_LIST_SHEET_NAME);
  sh.appendRow(['차단시각', '대상이메일', '차단유형', '사유', '해제시각', '비고']);
  sh.getRange(1, 1, 1, 6).setFontWeight('bold').setBackground('#fee2e2');
  sh.setFrozenRows(1);
  return sh;
}

/** 차단 명단에 영구 기록 */
function _recordBlock_(email, type, reason, untilDate) {
  try {
    const sh = _ensureBlockListSheet_();
    sh.appendRow([
      new Date(),
      String(email || ''),
      String(type || ''),              // 'auto' | 'manual'
      String(reason || '').slice(0, 500),
      untilDate || '',
      ''
    ]);
  } catch (e) {
    Logger.log('[_recordBlock_] 기록 실패: ' + (e && e.message ? e.message : e));
  }
}

/** 자동 차단 시 학과에 알림 메일 (실패해도 본 흐름 영향 없음) */
function _notifyAutoBlock_(email, reason, durationMin) {
  try {
    const e = escapeHtml_;
    const lines = [
      `<b>🚨 자동 차단 발생</b>`,
      '의심 행동이 임계치를 넘어 시스템이 사용자를 자동 차단했습니다.',
      '',
      `• 대상: ${e(email)}`,
      `• 차단 사유: ${e(reason)}`,
      `• 차단 기간: ${durationMin}분`,
      `• 발생 시각: ${new Date().toLocaleString('ko-KR')}`,
      '',
      '<b>조치 안내:</b>',
      '• 접속로그·차단명단 시트에서 상세 패턴 확인 가능',
      '• 오탐(false positive) 가능성이 있으니 학생에게 확인 후 필요 시 수동 차단 해제 (관리자 함수 unblockUser).'
    ];
    const subject = '[자동 차단] ' + email + ' — ' + reason;
    sendMail_(SCIENCE_EMAIL, subject, buildEmailHtml_('🚨 자동 차단 알림', lines));
  } catch (_) { /* 본 흐름 영향 없음 */ }
}

/** [P5-A] 의심 점수 누적 + 임계치 초과 시 자동 차단 */
function _recordSuspicious_(email, points, reason) {
  if (!email) return;
  try {
    const cache = CacheService.getScriptCache();
    const day = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd');
    const k = 'susp:' + email + ':' + day;
    const cur = parseInt(cache.get(k) || '0', 10);
    const next = cur + (points || 1);
    cache.put(k, String(next), _SEC_AUTO_BLOCK.WINDOW_SEC);

    if (next >= _SEC_AUTO_BLOCK.DENY_THRESHOLD) {
      _autoBlockUser_(email, reason || ('의심 점수 ' + next + ' 누적'));
    }
  } catch (_) {}
}

function _autoBlockUser_(email, reason) {
  const cache = CacheService.getScriptCache();
  const key = 'block:' + email;
  // 이미 차단된 경우 skip
  if (cache.get(key)) return;
  cache.put(key, JSON.stringify({ until: Date.now() + _SEC_AUTO_BLOCK.BLOCK_DURATION_SEC * 1000, reason: reason || '' }),
    _SEC_AUTO_BLOCK.BLOCK_DURATION_SEC);

  const until = new Date(Date.now() + _SEC_AUTO_BLOCK.BLOCK_DURATION_SEC * 1000);
  _recordBlock_(email, 'auto', reason || '', until);
  _logAccessAttempt_('autoBlock', email, '', 'block', reason || '');
  _notifyAutoBlock_(email, reason || '의심 행동 누적', Math.floor(_SEC_AUTO_BLOCK.BLOCK_DURATION_SEC / 60));
}

/** [P5-F] 모든 가드에서 차단 체크 우선 — 차단된 사용자는 모든 API 호출 거부 */
function assertNotBlocked_(context) {
  const email = getSessionEmail_();
  if (!email) return;
  try {
    const cache = CacheService.getScriptCache();
    const raw = cache.get('block:' + email);
    if (raw) {
      let obj = {}; try { obj = JSON.parse(raw); } catch (_) {}
      const until = obj.until || 0;
      const reason = obj.reason || '';
      _logAccessAttempt_(context, email, '', 'deny', 'BLOCKED: ' + reason);
      const remainMin = Math.max(1, Math.ceil((until - Date.now()) / 60000));
      throw new Error(
        '⛔ 일시 차단 상태입니다.\n\n사유: ' + reason +
        '\n해제까지 약 ' + remainMin + '분 남았습니다.\n\n오탐이라고 생각되면 학과(' + SCIENCE_EMAIL + ')에 연락해 주세요.'
      );
    }
  } catch (e) {
    if (e && e.message && /일시 차단/.test(e.message)) throw e;
    // 그 외 캐시 실패는 무시
  }
}

/** [P5-B] 글로벌 회로 차단기 — 시스템 전체 부하가 임계 초과 시 일정 시간 모든 요청 거부 */
function assertCircuitClosed_(context) {
  try {
    const cache = CacheService.getScriptCache();

    // 1) 이미 회로 차단 상태인지 확인
    if (cache.get('circuit:open')) {
      _logAccessAttempt_(context, getSessionEmail_(), '', 'deny', 'CIRCUIT_OPEN — 시스템 일시 보호');
      throw new Error('⚠️ 시스템 보호 모드 (일시적 과부하). 잠시 후 다시 시도해 주세요.');
    }

    // 2) 글로벌 카운터 증가
    const slot = Math.floor(Date.now() / 60000); // 분 단위 슬롯
    const k = 'global:' + slot;
    const n = parseInt(cache.get(k) || '0', 10) + 1;
    cache.put(k, String(n), 65);

    // 3) 임계치 초과 시 회로 열기
    if (n > _SEC_AUTO_BLOCK.GLOBAL_LIMIT_PER_MIN) {
      cache.put('circuit:open', '1', _SEC_AUTO_BLOCK.CIRCUIT_BREAK_SEC);
      _logAccessAttempt_('circuit:trip', '', '', 'block', '분당 ' + n + ' 호출 — 회로 차단');
      // 학과 알림 — 시스템 부하
      try {
        const lines = [
          '<b>⚠️ 글로벌 회로 차단 발생</b>',
          '시스템 전체 호출이 분당 ' + n + '건을 초과해 일정 시간 모든 요청을 차단합니다.',
          '',
          '• 임계: ' + _SEC_AUTO_BLOCK.GLOBAL_LIMIT_PER_MIN + '/분',
          '• 차단 지속: ' + Math.floor(_SEC_AUTO_BLOCK.CIRCUIT_BREAK_SEC / 60) + '분',
          '• 발생 시각: ' + new Date().toLocaleString('ko-KR'),
          '',
          'DDoS 공격 또는 매크로 다발 시도 가능성. 접속로그 확인 권장.'
        ];
        sendMail_(SCIENCE_EMAIL, '[시스템 보호] 글로벌 회로 차단 발생', buildEmailHtml_('🚨 시스템 보호 발동', lines));
      } catch (_) {}
      throw new Error('⚠️ 시스템 보호 모드 (일시적 과부하). 잠시 후 다시 시도해 주세요.');
    }
  } catch (e) {
    if (e && e.message && /시스템 보호 모드/.test(e.message)) throw e;
    // 캐시 실패는 무시
  }
}

/* ---------- 관리자용 차단 관리 함수 ---------- */

/** 현재 활성 차단 명단 조회 (관리자만) */
function getActiveBlocks() {
  const sessionEmail = getSessionEmail_();
  if (!isAdminEmail_(sessionEmail)) {
    _logAccessAttempt_('getActiveBlocks', sessionEmail, '', 'deny', '관리자 아님');
    throw new Error('차단 명단 조회 권한이 없습니다.');
  }
  // 시트 기반 영구 기록 반환 (캐시는 휘발성이라 시트로 일별 조회)
  const sh = _ensureBlockListSheet_();
  const last = sh.getLastRow();
  if (last < 2) return [];
  const vals = sh.getRange(2, 1, last - 1, 6).getValues();
  return vals.map(r => ({
    blockedAt: r[0] instanceof Date ? r[0].toISOString() : String(r[0]),
    email: r[1], type: r[2], reason: r[3],
    until: r[4] instanceof Date ? r[4].toISOString() : String(r[4]),
    note: r[5]
  })).reverse();
}

/** 수동 차단 (관리자만) */
function manualBlockUser(email, durationMin, reason) {
  const sessionEmail = getSessionEmail_();
  if (!isAdminEmail_(sessionEmail)) {
    _logAccessAttempt_('manualBlockUser', sessionEmail, String(email || ''), 'deny', '관리자 아님');
    throw new Error('수동 차단 권한이 없습니다.');
  }
  const target = String(email || '').trim().toLowerCase();
  if (!target) throw new Error('대상 이메일을 입력하세요.');
  const dur = Math.max(1, Math.min(7 * 24 * 60, Number(durationMin) || 60)); // 1분 ~ 7일
  const cache = CacheService.getScriptCache();
  cache.put('block:' + target, JSON.stringify({
    until: Date.now() + dur * 60 * 1000,
    reason: '관리자 수동 차단: ' + (reason || '(사유 미입력)')
  }), dur * 60);
  _recordBlock_(target, 'manual', reason || '(관리자 차단)', new Date(Date.now() + dur * 60 * 1000));
  _logAccessAttempt_('manualBlockUser', sessionEmail, target, 'allow', '차단 ' + dur + '분');
  return '✅ ' + target + ' 차단 완료 (' + dur + '분)';
}

/**
 * [HOTFIX 2026-05-21] 일괄 차단 해제 (관리자만).
 *   - 차단명단 시트의 '해제 표시' 없는 모든 활성 차단 항목에 대해 cache 키 삭제 + 시트 해제 기록.
 *   - 추가로 직접 이메일 배열을 전달하면 시트와 무관하게 해당 이메일들도 해제.
 *
 * 사용법 (GAS 편집기에서 함수 선택 후 실행):
 *   adminEmergencyUnblockAll()                          // 시트 활성 차단 전부 해제
 *   adminEmergencyUnblockAll(['a@x.com','b@y.com'])     // + 추가 지정 이메일도 해제
 *
 * @param {string[]} [extraEmails] 추가로 해제할 이메일 목록 (옵션)
 * @returns {string} 결과 요약
 */
function adminEmergencyUnblockAll(extraEmails) {
  const sessionEmail = getSessionEmail_();
  if (!isAdminEmail_(sessionEmail)) {
    _logAccessAttempt_('adminEmergencyUnblockAll', sessionEmail, '', 'deny', '관리자 아님');
    throw new Error('일괄 차단 해제 권한이 없습니다. 관리자 계정으로 GAS 편집기에서 실행해 주세요.');
  }

  const cache = CacheService.getScriptCache();
  const cleared = [];
  const errors = [];

  // 1) 차단명단 시트의 활성 차단 항목 일괄 해제
  try {
    const sh = _ensureBlockListSheet_();
    const last = sh.getLastRow();
    if (last >= 2) {
      const vals = sh.getRange(2, 1, last - 1, 6).getValues();
      for (let i = 0; i < vals.length; i++) {
        const email = String(vals[i][1] || '').trim().toLowerCase();
        const note  = String(vals[i][5] || '').trim();
        if (!email || note) continue; // 빈 행 또는 이미 해제됨
        try {
          cache.remove('block:' + email);
          sh.getRange(i + 2, 6).setValue('[HOTFIX] 일괄 해제 @ ' + new Date().toISOString());
          cleared.push(email);
        } catch (e) {
          errors.push(email + ' (' + (e && e.message ? e.message : e) + ')');
        }
      }
    }
  } catch (e) {
    errors.push('시트 처리 오류: ' + (e && e.message ? e.message : e));
  }

  // 2) 추가로 지정된 이메일도 cache 제거 (시트에 없을 수 있음)
  if (Array.isArray(extraEmails)) {
    for (const raw of extraEmails) {
      const email = String(raw || '').trim().toLowerCase();
      if (!email) continue;
      try {
        cache.remove('block:' + email);
        if (cleared.indexOf(email) === -1) cleared.push(email);
      } catch (e) {
        errors.push(email + ' (' + (e && e.message ? e.message : e) + ')');
      }
    }
  }

  _logAccessAttempt_('adminEmergencyUnblockAll', sessionEmail, '',
    'allow', '일괄 해제 ' + cleared.length + '건' + (errors.length ? ' (오류 ' + errors.length + '건)' : ''));

  const msg = '✅ 일괄 차단 해제 완료\n' +
              '  해제: ' + cleared.length + '건\n' +
              (cleared.length ? '    ' + cleared.join(', ') + '\n' : '') +
              (errors.length ? '  오류: ' + errors.length + '건\n    ' + errors.join('\n    ') + '\n' : '') +
              '\n참고: 메일 토큰 검증 약화 + URL authuser 강제 라우팅 패치가 v3.45부터 적용됨.';
  Logger.log(msg);
  return msg;
}

/** 차단 해제 (관리자만) */
function unblockUser(email) {
  const sessionEmail = getSessionEmail_();
  if (!isAdminEmail_(sessionEmail)) {
    _logAccessAttempt_('unblockUser', sessionEmail, String(email || ''), 'deny', '관리자 아님');
    throw new Error('차단 해제 권한이 없습니다.');
  }
  const target = String(email || '').trim().toLowerCase();
  if (!target) throw new Error('대상 이메일을 입력하세요.');
  CacheService.getScriptCache().remove('block:' + target);
  _logAccessAttempt_('unblockUser', sessionEmail, target, 'allow', '차단 해제');
  // 시트의 마지막 차단 행에 해제 표시
  try {
    const sh = _ensureBlockListSheet_();
    const last = sh.getLastRow();
    if (last >= 2) {
      const vals = sh.getRange(2, 1, last - 1, 6).getValues();
      for (let i = vals.length - 1; i >= 0; i--) {
        if (String(vals[i][1] || '').toLowerCase() === target && !vals[i][5]) {
          sh.getRange(i + 2, 6).setValue('관리자 수동 해제 @ ' + new Date().toISOString());
          break;
        }
      }
    }
  } catch (_) {}
  return '✅ ' + target + ' 차단이 해제되었습니다.';
}

/** 회로 차단 강제 해제 (관리자만, 운영자가 잘못 트리거된 경우) */
function resetGlobalCircuit() {
  const sessionEmail = getSessionEmail_();
  if (!isAdminEmail_(sessionEmail)) throw new Error('관리자만 가능합니다.');
  CacheService.getScriptCache().remove('circuit:open');
  _logAccessAttempt_('resetGlobalCircuit', sessionEmail, '', 'allow', '회로 강제 복구');
  return '✅ 글로벌 회로 차단을 강제 복구했습니다.';
}

/**
 * [SEC-P4] 사용자별 호출 빈도 제한 (DDoS/매크로 방어).
 *   주어진 키 + 윈도우(초) 내 maxCalls 초과 시 throw.
 *   CacheService 기반이라 분산 안전.
 * @param {string} keySuffix  함수명 등 식별자 (이메일별로 자동 분리됨)
 * @param {number} maxCalls   윈도우 내 최대 허용 호출 수
 * @param {number} windowSec  윈도우 길이(초)
 */
function assertCallRateLimit_(keySuffix, maxCalls, windowSec) {
  // ★ SEC-P5: 차단·회로 체크
  assertNotBlocked_('rateLimit:' + keySuffix);
  assertCircuitClosed_('rateLimit:' + keySuffix);

  try {
    const email = getSessionEmail_();
    if (!email) return; // 세션 없으면 다른 가드가 막음
    const cache = CacheService.getScriptCache();
    // 윈도우를 정수로 나눈 슬롯 (sliding이 아닌 단순 fixed-window — 가벼움)
    const slot = Math.floor(Date.now() / (windowSec * 1000));
    const k = 'rl:' + keySuffix + ':' + email + ':' + slot;
    const n = parseInt(cache.get(k) || '0', 10);
    if (n >= maxCalls) {
      _logAccessAttempt_(keySuffix, email, '', 'deny',
        'rate limit exceeded (' + n + '/' + maxCalls + ' per ' + windowSec + 's)');
      // ★ rate limit 초과 = 의심 점수 누적 (반복되면 자동 차단)
      _recordSuspicious_(email, 1, 'rate limit 초과 (' + keySuffix + ')');
      throw new Error('요청이 너무 잦습니다. 잠시 후 다시 시도해 주세요. (' + maxCalls + '회/' + windowSec + '초 제한)');
    }
    cache.put(k, String(n + 1), windowSec + 5);
  } catch (e) {
    // 'rate limit exceeded' 에러는 그대로 throw
    if (e && e.message && /요청이 너무 잦습니다/.test(e.message)) throw e;
    // CacheService 실패 등은 무시 (방어 비활성, 본 기능은 정상)
  }
}

/**
 * [SEC-P4] 세션 이메일에서 학번 추출 (학번 5자리 + @cnsa.hs.kr 형식만).
 *   학생이 아니면 빈 문자열. 신청 함수에서 클라이언트 입력 학번을 무시하고 이 값을 강제 사용.
 */
function getSessionStudentId_() {
  const email = getSessionEmail_();
  if (!email) return '';
  const m = email.match(/^(\d{5})@cnsa\.hs\.kr$/i);
  return m ? m[1] : '';
}

/**
 * [SEC-P1] 호출자가 학생 본인이거나 교사/관리자인지 확인. 아니면 차단.
 *   조회·수정·draft 함수 진입 시 사용. 학생이 다른 학생 데이터 접근 시 throw.
 *   동시에 ★ 접속로그도 기록 (P2).
 * @param {string|number} studentId  데이터 소유자 학번
 * @param {string}        context    호출 함수명·맥락 (감사 로그용)
 * @returns {{actor:string, role:'student-self'|'teacher'|'admin', teacher?:object}}
 */
function assertOwnerOrStaff_(studentId, context) {
  // ★ SEC-P5: 차단 명단·회로 차단 우선 체크
  assertNotBlocked_(context);
  assertCircuitClosed_(context);

  const sessionEmail = getSessionEmail_();
  if (!sessionEmail) {
    _logAccessAttempt_(context, '', String(studentId || ''), 'deny', '세션 이메일 없음');
    throw new Error('세션 정보를 가져올 수 없습니다. 로그아웃 후 다시 로그인해 주세요.');
  }

  if (isSelfStudentId_(studentId)) {
    _logAccessAttempt_(context, sessionEmail, String(studentId || ''), 'allow', 'student-self');
    return { actor: sessionEmail, role: 'student-self' };
  }

  const teacher = getSessionTeacher_();
  if (teacher) {
    _logAccessAttempt_(context, sessionEmail, String(studentId || ''), 'allow', 'teacher:' + (teacher.name || ''));
    return { actor: sessionEmail, role: 'teacher', teacher: teacher };
  }

  if (isAdminEmail_(sessionEmail)) {
    _logAccessAttempt_(context, sessionEmail, String(studentId || ''), 'allow', 'admin');
    return { actor: sessionEmail, role: 'admin' };
  }

  // [v3.58 / 1-1] 실험실 담당(공용) 계정 — 승인 대상 신청 열람 허용
  if (isSessionLabTeacher_()) {
    _logAccessAttempt_(context, sessionEmail, String(studentId || ''), 'allow', 'lab-teacher');
    return { actor: sessionEmail, role: 'lab-teacher' };
  }

  _logAccessAttempt_(context, sessionEmail, String(studentId || ''), 'deny', '권한 없음 (학생 본인 아님 + 교사 아님)');
  // ★ SEC-P5: 의심 점수 누적 — 다른 학생 데이터 조회 시도는 의심 (v3.58 완화: 3→2)
  _recordSuspicious_(sessionEmail, 2, '타인 데이터 접근 시도 (' + context + ')');
  throw new Error('본인의 학번으로만 조회·수정할 수 있습니다.\n다른 학생의 데이터에는 접근할 수 없습니다.');
}

/**
 * [SEC-P1] 호출자가 승인 권한이 있는지 확인. 학생 콘솔에서의 임의 승인을 차단.
 *   교사 시트에 등록된 이메일 + 학과/관리자 메일만 통과.
 *   ★ Phase 3에서 메일 안의 HMAC 토큰 검증으로 더 좁힐 예정 (메일 가로채기 차단).
 */
function assertApprover_(appId, stage, context) {
  // ★ SEC-P5: 차단·회로 우선 체크
  assertNotBlocked_(context);
  assertCircuitClosed_(context);

  const sessionEmail = getSessionEmail_();
  if (!sessionEmail) {
    _logAccessAttempt_(context, '', String(appId || ''), 'deny', '세션 이메일 없음');
    throw new Error('세션 정보를 가져올 수 없습니다. 로그아웃 후 다시 로그인해 주세요.');
  }
  if (isAdminEmail_(sessionEmail)) {
    _logAccessAttempt_(context, sessionEmail, String(appId || ''), 'allow', 'admin / stage=' + stage);
    return { actor: sessionEmail, role: 'admin' };
  }
  const teacher = getSessionTeacher_();
  if (!teacher) {
    // [v3.58 / 1-1] 실험실 담당(공용) 계정도 승인 권한 인정 (교사 명단 미등록이어도)
    if (isSessionLabTeacher_()) {
      _logAccessAttempt_(context, sessionEmail, String(appId || ''), 'allow', 'lab-teacher / stage=' + stage);
      return { actor: sessionEmail, role: 'lab-teacher' };
    }
    _logAccessAttempt_(context, sessionEmail, String(appId || ''), 'deny', '교사 아님 (승인 시도) / stage=' + stage);
    // ★ 학생이 승인 시도 = 매우 의심 행동 (높은 점수)
    _recordSuspicious_(sessionEmail, 3, '승인 권한 없는 사용자의 승인 시도 (' + context + ')');
    throw new Error('승인 권한이 없습니다. 교사 계정으로 로그인된 상태에서만 승인 처리가 가능합니다.');
  }
  _logAccessAttempt_(context, sessionEmail, String(appId || ''), 'allow', 'teacher:' + (teacher.name || '') + ' / stage=' + stage);
  return { actor: sessionEmail, role: 'teacher', teacher: teacher };
}

/* =====================================================================
 * [SEC-P2] 접속로그 — 모든 보안 가드 통과/차단 기록 (관리자만 조회 가능)
 *   시트: '접속로그' (자동 생성)
 *   헤더: 타임스탬프 | 함수 | 호출자(이메일) | 대상(학번/신청ID) | 결과 | 비고 | IP/UA(불가) | 세션해시
 *   ※ 클라이언트 IP/UA는 GAS 웹앱에서 접근 불가 (Google이 마스킹). 대신 세션해시 기록.
 * ===================================================================== */
const ACCESS_LOG_SHEET_NAME = '접속로그';

function _ensureAccessLogSheet_() {
  const ss = SpreadsheetApp.openById(MAIN_SSID);
  let sh = ss.getSheetByName(ACCESS_LOG_SHEET_NAME);
  if (sh) return sh;
  sh = ss.insertSheet(ACCESS_LOG_SHEET_NAME);
  sh.appendRow(['타임스탬프', '함수', '호출자(세션이메일)', '대상(학번/신청ID)', '결과', '비고', '세션해시']);
  sh.getRange(1, 1, 1, 7).setFontWeight('bold').setBackground('#fef3c7');
  sh.setFrozenRows(1);
  return sh;
}

/** 세션 해시 (해시만 저장해 PII 추가 노출 최소화) */
function _sessionHash_(email) {
  try {
    const raw = String(email || '') + '|' + new Date().toISOString().slice(0, 10); // 일별 회전
    const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, raw);
    return Utilities.base64Encode(bytes).slice(0, 12);
  } catch (_) { return ''; }
}

function _logAccessAttempt_(context, actorEmail, target, result, note) {
  try {
    const r = String(result || '');
    // ★ 옵션 A: allow 로그 샘플링 — 10건 중 1건만 시트 기록 (속도 90% 개선)
    //   deny/block 등 보안 관련은 100% 기록 유지
    if (r === 'allow' && Math.random() >= 0.1) {
      // 90% 확률로 건너뜀 — 단, 캐시에 카운터는 유지해 통계 추적 가능
      try {
        const cache = CacheService.getScriptCache();
        const day = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd');
        const k = 'allow-skipped:' + day;
        const n = parseInt(cache.get(k) || '0', 10) + 1;
        cache.put(k, String(n), 86400);
      } catch (_) {}
      return;
    }

    const sh = _ensureAccessLogSheet_();
    sh.appendRow([
      new Date(),
      String(context || ''),
      String(actorEmail || ''),
      String(target || ''),
      r,                          // 'allow' (샘플링) | 'deny' (전부) | 'block' 등
      String(note || '').slice(0, 500),
      _sessionHash_(actorEmail)
    ]);
  } catch (e) {
    Logger.log('[_logAccessAttempt_] 로그 기록 실패: ' + (e && e.message ? e.message : e));
  }
}

/**
 * [관리자 전용] 접속로그 조회.
 *   관리자급 이메일만 허용. 학생/교사가 호출 시 빈 배열 반환 + 시도 기록.
 *   @param {number} limit  최대 행 (기본 200, 최대 2000)
 */
function listAccessLogs(limit) {
  const sessionEmail = getSessionEmail_();
  if (!isAdminEmail_(sessionEmail)) {
    _logAccessAttempt_('listAccessLogs', sessionEmail, '', 'deny', '관리자 아님');
    throw new Error('접속로그 조회 권한이 없습니다. 학과(관리자) 계정으로만 조회할 수 있습니다.');
  }
  const n = Math.max(1, Math.min(2000, Number(limit) || 200));
  const sh = _ensureAccessLogSheet_();
  const last = sh.getLastRow();
  if (last < 2) return [];
  const start = Math.max(2, last - n + 1);
  const vals = sh.getRange(start, 1, last - start + 1, 7).getValues();
  return vals.map(r => ({
    ts: r[0] instanceof Date ? r[0].toISOString() : String(r[0]),
    fn: r[1], actor: r[2], target: r[3], result: r[4], note: r[5], hash: r[6]
  })).reverse();
}

/** 학생에게 신청 완료 안내 (isNewLab=true 면 단일 승인용 안내 문구로 분기) */
function sendStudentSubmitEmail_(data, appId, isNewLab) {
  const email = getStudentEmail_(data.studentId);
  if (!email) return { ok: false, error: '학번 누락' };
  const e = escapeHtml_;

  const labLabel = (Array.isArray(data.labRooms) && data.labRooms.length)
                     ? data.labRooms.join(', ')
                     : (data.lab || '');

  const lines = [
    `${e(data.studentName)}님, 과학 실험·실습실 사용 신청이 정상적으로 접수되었습니다.`,
    '',
    `• 신청 ID: ${e(appId)}`,
    `• 실험·실습실: ${e(labLabel)}`,
    `• 실험 날짜: ${e(data.date)}`,
    `• 시간: ${e(data.timeSlot)}`,
    `• 실험·실습 주제: ${e(data.title || data.practiceTopic || '')}`,
    ''
  ];
  if (isNewLab) {
    lines.push(
      '지도 선생님의 승인 후 사용이 확정됩니다.',
      '신청서를 출력하여 지도 선생님과 실습실 담당 선생님의 서명을 받은 뒤,',
      'N104 앞 제출함에 제출해 주세요.',
      '승인/반려 결과는 이메일로 안내됩니다.'
    );
  } else {
    lines.push(
      '지도교사의 1차 승인 후 실험실 담당교사의 최종 승인을 거쳐 확정됩니다.',
      '승인/반려 결과는 이메일로 안내됩니다.'
    );
  }

  const subject = `[실험·실습실 신청 완료] ${e(data.studentName)}님의 신청이 접수되었습니다`;
  const body = buildEmailHtml_('실험·실습실 신청 완료 안내', lines);
  return sendMail_(email, subject, body);
}

/**
 * 신규 양식(IT실/가정실습실/N동 공학 Zone) 전용 — 단일 승인 메일 발송.
 *  - [정책 변경 2026-08] 승인자 = 학생이 선택한 "지도교사"(data.teacherEmail).
 *    실습실 담당 계정을 승인 주체로 두던 방식 폐기 — 지도교사=실담당인 경우가 많고,
 *    담당이 2인(컴퓨터실/멀티미디어실)일 때 라우팅이 애매해 지도교사 단독 승인으로 통일.
 *  - 지도교사 이메일은 submitApplication_에서 교사 명단 기준으로 이미 서버 강제·검증됨
 *    (미등록이면 제출 단계에서 차단). 여기 폴백 도달은 예외적 안전망일 뿐.
 *  - 승인 링크는 기존 라우팅(`?id=...&stage=final`)을 그대로 재사용 → finalApprove 페이지 오픈.
 *
 * @param {'it'|'home'|'engineering'} category
 * @param {object} data   신청 데이터
 * @param {string} appId
 * @returns {{ok:boolean, error?:string}}
 */
function sendNewLabApproverEmail_(category, data, appId) {
  const cfg = NEW_LAB_CONFIG[category];
  if (!cfg) return { ok: false, error: '알 수 없는 양식 카테고리: ' + category };

  let email = String(data.teacherEmail || '').trim();
  let usingFallback = false;
  if (!email) {
    email = SCIENCE_EMAIL;
    usingFallback = true;
    Logger.log('[sendNewLabApproverEmail_] 지도교사 이메일 누락 - 학과 메일로 폴백. ' +
      'category=' + category + ', teacher=' + (data.teacher || '(이름없음)'));
  }

  const e = escapeHtml_;
  // ★ SEC-P3: HMAC 토큰 부착 (수신자 본인만 페이지 열림)
  const _tok = genApprovalToken_(appId, 'final', email);
  // [HOTFIX 2026-05-21] authuser 강제 라우팅 — Chrome multi-account에서 수신자 계정으로 자동 매핑
  const url = getWebAppUrl_() +
              '?id=' + encodeURIComponent(appId) + '&stage=final&t=' + encodeURIComponent(_tok) +
              '&authuser=' + encodeURIComponent(email);

  const labLabel = (Array.isArray(data.labRooms) && data.labRooms.length)
                     ? data.labRooms.join(', ')
                     : (data.lab || '');

  const lines = [
    `학생이 ${e(cfg.title)} 사용을 신청했습니다.`,
    '내용을 확인한 뒤 승인 또는 반려 처리해 주세요.',
    '',
    `• 양식 종류: ${e(cfg.sheetCategory)}`,
    `• 대표자: ${e(data.studentName || '')} (${e(data.studentId || '')})`,
    `• 신청 실습실: ${e(labLabel)}`,
    `• 날짜/시간: ${e(data.date || '')} / ${e(data.timeSlot || '')}`,
    `• 지도교사: ${e(data.teacher || '')}`,
    `• 실험·실습 주제: ${e(data.title || data.practiceTopic || '')}`
  ];
  if (Array.isArray(data.dangerousTools) && data.dangerousTools.length) {
    lines.push(`• 사용 위험 도구: ${e(data.dangerousTools.join(', '))}`);
  }
  if (data.soldering) {
    lines.push(`• 납땜 사용 여부: ${e(data.soldering)}`);
  }

  // 지도 선생님 확인 사항 — 종이 양식에 직접 체크 (학생 폼에서는 받지 않음)
  if (Array.isArray(cfg.confirmItems) && cfg.confirmItems.length) {
    lines.push('',
      '<b>📋 지도 선생님 확인 사항</b> (종이 신청서에 직접 표기해 주세요)');
    cfg.confirmItems.forEach(function(item) {
      lines.push('☐ ' + e(item));
    });
  }

  if (usingFallback) {
    lines.push('',
      `<b>⚠ 안내:</b> 지도교사(${e(data.teacher || '미지정')})의 이메일을 확인하지 못해 ` +
      '학과 메일로 폴백 발송되었습니다. 교사 명단 시트에서 해당 교사의 이메일이 올바르게 등록돼 있는지 확인해 주세요.'
    );
  }

  const subject = `[${cfg.title} 사용 승인 요청] ${e(data.studentName || '')} (${e(data.studentId || '')})`;
  const body = buildEmailHtml_(cfg.title + ' 사용 승인 요청', lines, url, '승인 처리하기');
  return sendMail_(email, subject, body);
}

/**
 * [신규 양식 전용] 지도교사 안내 메일 (승인 권한 없음, 정보 전달용).
 *  - 단일 승인 흐름이므로 지도교사는 실제 승인/반려를 하지 않음.
 *  - 그러나 학생이 어떤 활동을 신청했는지 지도교사도 인지해야 안전·관리가 가능하므로 안내 발송.
 *  - 메일에 승인 링크는 포함하지 않음 (단일 승인자만 처리).
 *
 * @param {'it'|'home'|'engineering'} category
 * @param {object} data
 * @param {string} appId
 * @returns {{ok:boolean, error?:string}}
 */
/**
 * [2026-08-19] 실습실 담당 선생님에게 참고 안내 메일 — 승인 링크 없음.
 *
 * 단일 승인 정책(2026-08)에서 승인 권한은 지도교사에게 있으나, 담당 선생님도
 * "내 실습실을 언제 누가 쓰는지" 알아야 안전·관리가 가능하므로 안내만 발송한다.
 * 신청한 실습실이 여러 곳이면 각 담당자에게(이메일 중복은 1통으로) 발송.
 *
 * @param {'it'|'home'|'engineering'} category
 * @param {object} data
 * @param {string} appId
 * @returns {{ok:boolean, sent:number, error?:string}}
 */
function sendLabOwnerInfoEmail_(category, data, appId) {
  const cfg = NEW_LAB_CONFIG[category];
  if (!cfg) return { ok: false, sent: 0, error: '알 수 없는 양식 카테고리: ' + category };

  const rooms = (Array.isArray(data.labRooms) && data.labRooms.length)
                  ? data.labRooms
                  : (data.lab ? [data.lab] : []);
  const owners = getLabRoomOwnerEmails_(rooms);
  if (!owners.length) {
    Logger.log('[sendLabOwnerInfoEmail_] 담당 선생님 미등록 — appId: ' + appId +
      ', rooms: ' + rooms.join(', '));
    return { ok: false, sent: 0, error: '담당교사 시트에서 실습실 담당자를 찾지 못했습니다: ' + rooms.join(', ') };
  }

  const e = escapeHtml_;
  const labLabel = rooms.join(', ');
  let sent = 0;
  let lastErr = '';

  owners.forEach(o => {
    const lines = [
      `<b>본 메일은 실습실 담당 선생님 안내용</b>입니다. 승인 처리는 <b>학생이 선택한 지도교사</b>가 하므로 별도의 승인 작업은 필요하지 않습니다.`,
      `담당하시는 <b>${e(o.room)}</b> 사용 신청이 접수되어 안내드립니다.`,
      '',
      `• 양식 종류: ${e(cfg.sheetCategory)}`,
      `• 대표자: ${e(data.studentName || '')} (${e(data.studentId || '')})`,
      `• 신청 실습실: ${e(labLabel)}`,
      `• 날짜/시간: ${e(data.date || '')} / ${e(data.timeSlot || '')}`,
      `• 실험·실습 주제: ${e(data.title || data.practiceTopic || '')}`,
      `• 지도교사: ${e(data.teacher || '')} (승인 담당)`
    ];
    if (data.teamMembers)       lines.push(`• 동반 학생: ${e(data.teamMembers)}`);
    if (data.totalParticipants) lines.push(`• 총 인원: ${e(String(data.totalParticipants))}명`);
    lines.push('',
      `<b>안내:</b> 승인/반려는 지도교사가 처리하며 결과는 학생에게 자동 안내됩니다. 실습실 사용에 문제가 있다면 지도교사 또는 학과(${e(SCIENCE_EMAIL)})로 연락해 주세요.`
    );

    const subject = `[실습실 사용 안내] ${e(o.room)} — ${e(data.studentName || '')} 학생 신청`;
    const body = buildEmailHtml_('실습실 담당 선생님 안내', lines);
    const r = sendMail_(o.email, subject, body);
    if (r && r.ok) sent++;
    else lastErr = (r && r.error) || '발송 실패';
  });

  return sent > 0 ? { ok: true, sent: sent } : { ok: false, sent: 0, error: lastErr || '발송 실패' };
}

/** 지도교사에게 1차 승인 요청 */
function sendTeacherApprovalEmail_(data, appId) {
  const email = String(data.teacherEmail || '').trim();
  if (!email) {
    Logger.log('[sendTeacherApprovalEmail_] 지도교사 이메일 누락 - appId: ' + appId +
      ', teacher: ' + (data.teacher || '(이름없음)') +
      ', studentId: ' + (data.studentId || ''));
    return { ok: false, error: '지도교사 이메일 누락 (교사명: ' + (data.teacher || '미지정') + ')' };
  }
  const e = escapeHtml_;
  // ★ SEC-P3: HMAC 토큰 부착 — 수신자 본인만 페이지 열 수 있음
  const _tok = genApprovalToken_(appId, 'approve', email);
  // [HOTFIX 2026-05-21] authuser 강제 라우팅 — Chrome multi-account에서 수신자 계정으로 자동 매핑
  const url = getWebAppUrl_() + '?id=' + encodeURIComponent(appId) + '&t=' + encodeURIComponent(_tok) +
              '&authuser=' + encodeURIComponent(email);
  const subject = `[실험·실습실 1차 승인 요청] ${e(data.studentName)} (${e(data.studentId)})`;
  const body = buildEmailHtml_('실험·실습실 1차 승인 요청', [
    '학생이 과학 실험·실습실 사용을 신청했습니다. 확인 후 승인/반려 처리를 해주세요.',
    '',
    `• 대표자: ${e(data.studentName)} (${e(data.studentId)})`,
    `• 실험실: ${e(data.lab)}`,
    `• 날짜/시간: ${e(data.date)} / ${e(data.timeSlot)}`,
    `• 실험·실습 주제: ${e(data.title)}`,
  ], url, '1차 승인 처리하기');
  return sendMail_(email, subject, body);
}

/** 학생에게 1차 승인 안내 */
function sendStudentFirstApproveEmail_(rec, comment) {
  const email = getStudentEmail_(rec['대표자학번']);
  if (!email) return { ok: false, error: '학번 누락' };
  const e = escapeHtml_;
  const subject = `[실험실 1차 승인] ${e(rec['대표자이름'])}님의 신청이 1차 승인되었습니다`;
  const lines = [
    `${e(rec['대표자이름'])}님, 과학 실험·실습실 사용 신청이 지도교사에 의해 1차 승인되었습니다.`,
    '',
    `• 신청 ID: ${e(rec['신청ID'])}`,
    `• 실험실: ${e(rec['신청실험실'])}`,
    `• 실험 날짜: ${normalizeDateYMD_(rec['실험할날짜'])}`,
    `• 실험·실습 주제: ${e(rec['실험제목'] || '')}`,
  ];
  if (comment && String(comment).trim()) {
    lines.push('', `<b>지도교사 의견:</b> ${e(comment)}`);
  }
  lines.push('', '실험실 담당교사의 최종 승인을 거쳐 확정됩니다.', '최종 승인/반려 결과는 이메일로 안내됩니다.');
  const body = buildEmailHtml_('실험실 1차 승인 안내', lines);
  return sendMail_(email, subject, body);
}

/** 학생에게 1차 반려 안내 */
function sendStudentRejectEmail_(rec, comment) {
  const email = getStudentEmail_(rec['대표자학번']);
  if (!email) return { ok: false, error: '학번 누락' };
  const e = escapeHtml_;
  const subject = `[실험·실습실 신청 반려] ${e(rec['대표자이름'])}님의 신청이 반려되었습니다`;
  const body = buildEmailHtml_('실험·실습실 신청 1차 반려 안내', [
    `${e(rec['대표자이름'])}님, 과학 실험·실습실 사용 신청이 지도교사에 의해 반려되었습니다.`,
    '',
    `• 신청 ID: ${e(rec['신청ID'])}`,
    `• 실험실: ${e(rec['신청실험실'])}`,
    `• 실험 날짜: ${normalizeDateYMD_(rec['실험할날짜'])}`,
    `• 실험·실습 주제: ${e(rec['실험제목'] || '')}`,
    '',
    `<b>반려 사유:</b> ${e(comment) || '(사유 없음)'}`,
    '',
    '내용을 수정하여 다시 신청해 주세요.',
    '',
    '<b>[재신청 안내]</b>',
    '• 반려된 신청의 재신청 기간은 목요일입니다.',
    '• 목요일이 지나면 재신청할 수 없습니다.',
    '• 재신청 기간 내 신규 신청은 불가합니다.'
  ]);
  return sendMail_(email, subject, body);
}

/**
 * 실험실 담당교사에게 최종 승인 요청.
 * ★ P1-4: 관리자 측과 패턴 통일 — throw 대신 {ok:false, error} 반환.
 *   호출부에서 try/catch와 r.ok 분기 둘 다 안전하게 처리되도록 catch 내부도 동일 형식 반환 권장.
 */
function sendLabTeacherFinalEmail_(rec, appId) {
  const labData = getLabTeacherSheet_().getDataRange().getValues();
  const [labHdr, ...labRows] = labData;

  const labIdx = labHdr.findIndex(h => {
    const t = String(h).trim();
    return t === '담당 실험실' || t === '담당실험실';
  });
  const mailIdx = labHdr.findIndex(h => {
    const t = String(h).trim();
    return t === '이메일 주소' || t === '이메일주소';
  });

  if (labIdx === -1) {
    const err = '담당교사 시트에 "담당 실험실" 열을 찾을 수 없습니다.';
    Logger.log('[sendLabTeacherFinalEmail_] ' + err);
    return { ok: false, error: err };
  }
  if (mailIdx === -1) {
    const err = '담당교사 시트에 "이메일 주소" 열을 찾을 수 없습니다.';
    Logger.log('[sendLabTeacherFinalEmail_] ' + err);
    return { ok: false, error: err };
  }

  const labName = String(rec['신청실험실'] || '').trim();
  const wantCanon = normalizeLabName_(labName) || labName;

  // 룸 → 그룹 매핑 (LAB_TEACHER에 그룹명 한 줄로만 등록된 경우의 fallback)
  const ENGINEERING_ROOMS = ['융합기술실', '창의공학실', '공작기계실', 'FAB Lab'];
  const groupCanons = [];
  if (ENGINEERING_ROOMS.indexOf(wantCanon) >= 0) groupCanons.push('공학ZONE', '공학Zone', '공학존');
  if (wantCanon === '코딩실') groupCanons.push('IT 공학실', '컴퓨터실', 'IT실', 'IT 실험실');

  const toRow = labRows.find(r => {
    const cell = String(r[labIdx] || '').trim();
    if (!cell) return false;
    if (cell === labName) return true;
    const cellCanon = normalizeLabName_(cell) || cell;
    if (cellCanon === wantCanon) return true;
    if (groupCanons.length && groupCanons.indexOf(cell) >= 0) return true;
    if (groupCanons.length && groupCanons.indexOf(cellCanon) >= 0) return true;
    return false;
  });

  if (!toRow || !toRow[mailIdx]) {
    // ★ 진단 정보 포함 (관리자 측과 동등)
    const registered = labRows.map(r => String(r[labIdx] || '').trim()).filter(Boolean);
    const reason = !toRow ? '시트에서 매칭되는 행을 찾지 못함' : '매칭됐으나 이메일 컬럼이 비어 있음';
    const detail = [
      '사유: ' + reason,
      '학생 신청 실험실: "' + labName + '" (정규화: "' + wantCanon + '")',
      groupCanons.length ? '시도한 그룹 폴백 키: ' + groupCanons.join(', ') : '그룹 폴백 키: 없음',
      '시트에 등록된 실험실: ' + (registered.length ? registered.join(', ') : '(비어있음)'),
      '조치: LAB_TEACHER 시트에 위 실험실 행을 추가하거나 이메일 주소를 채워 주세요.'
    ].join(' / ');
    Logger.log('[sendLabTeacherFinalEmail_] 담당교사 매칭 실패 — ' + detail);
    return { ok: false, error: detail };
  }
  const teacherEmail = String(toRow[mailIdx]).trim();

  const e = escapeHtml_;
  // ★ SEC-P3: HMAC 토큰 부착
  const _tok = genApprovalToken_(appId, 'final', teacherEmail);
  // [HOTFIX 2026-05-21] authuser 강제 라우팅 — Chrome multi-account에서 수신자 계정으로 자동 매핑
  const url = getWebAppUrl_() + '?id=' + encodeURIComponent(appId) + '&stage=final&t=' + encodeURIComponent(_tok) +
              '&authuser=' + encodeURIComponent(teacherEmail);
  const subject = `[실험실 최종 승인 요청] ${e(rec['대표자학번'])} ${e(rec['대표자이름'])}`;
  const body = buildEmailHtml_('실험실 최종 승인 요청', [
    '지도교사의 1차 승인이 완료된 신청입니다. 최종 승인/반려를 처리해주세요.',
    '',
    `• 대표자: ${e(rec['대표자이름'])} (${e(rec['대표자학번'])})`,
    `• 실험실: ${e(rec['신청실험실'])}`,
    `• 날짜/시간: ${normalizeDateYMD_(rec['실험할날짜'])} / ${e(rec['신청시간'])}`,
    `• 실험·실습 주제: ${e(rec['실험제목'] || '')}`,
  ], url, '최종 승인 처리하기');

  return sendMail_(teacherEmail, subject, body);
}

/** 학생에게 최종 승인 안내 */
function sendStudentFinalApproveEmail_(rec, comment) {
  const email = getStudentEmail_(rec['대표자학번']);
  if (!email) return { ok: false, error: '학번 누락' };
  const e = escapeHtml_;
  const subject = `[실험·실습실 최종 승인] ${e(rec['대표자이름'])}님의 실험·실습실 사용이 승인되었습니다`;
  const lines = [
    `${e(rec['대표자이름'])}님, 과학 실험·실습실 사용 신청이 최종 승인되었습니다.`,
    '',
    `• 신청 ID: ${e(rec['신청ID'])}`,
    `• 실험실: ${e(rec['신청실험실'])}`,
    `• 실험 날짜: ${normalizeDateYMD_(rec['실험할날짜'])}`,
    `• 시간: ${e(rec['신청시간'])}`,
    `• 실험·실습 주제: ${e(rec['실험제목'] || '')}`,
  ];
  if (comment && String(comment).trim()) {
    lines.push('', `<b>담당교사 의견:</b> ${e(comment)}`);
  }
  lines.push('', '실험 당일 안전장구를 반드시 착용하시고, 실험·실습실 안전 수칙을 준수해 주세요.', '실험·실습실 사용 후 반드시 뒷정리를 완료해 주세요.');
  const body = buildEmailHtml_('실험실 최종 승인 완료', lines);
  return sendMail_(email, subject, body);
}

/** 학생에게 최종 반려 안내 */
function sendStudentFinalRejectEmail_(rec, comment) {
  const email = getStudentEmail_(rec['대표자학번']);
  if (!email) return { ok: false, error: '학번 누락' };
  const e = escapeHtml_;
  const subject = `[실험실 최종 반려] ${e(rec['대표자이름'])}님의 신청이 반려되었습니다`;
  const body = buildEmailHtml_('실험실 최종 반려 안내', [
    `${e(rec['대표자이름'])}님, 과학 실험·실습실 사용 신청이 담당교사에 의해 최종 반려되었습니다.`,
    '',
    `• 신청 ID: ${e(rec['신청ID'])}`,
    `• 실험실: ${e(rec['신청실험실'])}`,
    `• 실험 날짜: ${normalizeDateYMD_(rec['실험할날짜'])}`,
    `• 실험·실습 주제: ${e(rec['실험제목'] || '')}`,
    '',
    `<b>반려 사유:</b> ${e(comment) || '(사유 없음)'}`,
    '',
    '내용을 수정하여 다시 신청해 주세요.',
    '',
    '<b>[재신청 안내]</b>',
    '• 반려된 신청의 재신청 기간은 목요일입니다.',
    '• 목요일이 지나면 재신청할 수 없습니다.',
    '• 재신청 기간 내 신규 신청은 불가합니다.'
  ]);
  return sendMail_(email, subject, body);
}

/** 지도교사에게 최종 결과 안내 */
function sendTeacherFinalResultEmail_(rec, decision, comment) {
  const email = String(rec['지도교사이메일'] || '').trim();
  if (!email) {
    Logger.log('[sendTeacherFinalResultEmail_] 지도교사 이메일 누락 - appId: ' + (rec['신청ID'] || '') +
      ', teacher: ' + (rec['지도교사이름'] || '(이름없음)'));
    return { ok: false, error: '지도교사 이메일 누락 (교사명: ' + (rec['지도교사이름'] || '미지정') + ')' };
  }
  const e = escapeHtml_;
  const isApproved = decision === '승인';
  const subject = isApproved
    ? `[실험실 최종 승인 완료] ${e(rec['대표자이름'])} (${e(rec['대표자학번'])})`
    : `[실험실 최종 반려] ${e(rec['대표자이름'])} (${e(rec['대표자학번'])})`;
  const lines = [
    `${e(rec['대표자이름'])} (${e(rec['대표자학번'])}) 학생의 실험·실습실 사용 신청이 최종 ${isApproved ? '승인' : '반려'}되었습니다.`,
    '',
    `• 실험실: ${e(rec['신청실험실'])}`,
    `• 날짜/시간: ${normalizeDateYMD_(rec['실험할날짜'])} / ${e(rec['신청시간'])}`,
    `• 실험·실습 주제: ${e(rec['실험제목'] || '')}`,
  ];
  if (comment && String(comment).trim()) {
    lines.push('', `<b>${isApproved ? '승인 의견' : '반려 사유'}:</b> ${e(comment)}`);
  } else if (!isApproved) {
    lines.push('', `<b>반려 사유:</b> (사유 없음)`);
  }
  const body = buildEmailHtml_(isApproved ? '최종 승인 완료 안내' : '최종 반려 안내', lines);
  return sendMail_(email, subject, body);
}

/* ------------------------- 라우팅 ------------------------- */
function doGet(e) {
  // [2026-08-22] cross-system 캐시 무효화 엔드포인트 (관리자 GAS 전용, 토큰 인증).
  //   ⚠️ 다른 라우팅(diag/승인링크/페이지)보다 먼저 처리한다 — HTML 이 아니라 JSON 을
  //   돌려줘야 관리자의 clearApplicationServerCache_ 가 응답을 해석할 수 있다.
  if (e && e.parameter && e.parameter.action === 'clearCache') {
    return handleCacheClearRequest_(e);
  }
  // [v3.58 / 2-1] 진단 엔드포인트 접근 제한 — 교사/관리자만.
  //   기존에는 무인증이라 학생 누구나 ?diag=... 로 타 학생 학번·이름·승인의견,
  //   배포 계정 Gmail 검색 결과까지 열람 가능했음 (개인정보 노출).
  if (e.parameter.diag) {
    const _dSess = getSessionEmail_();
    const _dAllowed = isAdminEmail_(_dSess) || !!getSessionTeacher_() || isSessionLabTeacher_();
    if (!_dAllowed) {
      try { _logAccessAttempt_('doGet:diag', _dSess, String(e.parameter.diag), 'deny', '교사/관리자 아님'); } catch (_) {}
      return ContentService.createTextOutput('진단 페이지는 교사/관리자만 열람할 수 있습니다.')
        .setMimeType(ContentService.MimeType.TEXT);
    }
    try { _logAccessAttempt_('doGet:diag', _dSess, String(e.parameter.diag), 'allow', ''); } catch (_) {}
    if (e.parameter.diag === 'pendingfinal') {
      return ContentService.createTextOutput(diagnosePendingFinalApproval_(e.parameter.lab))
        .setMimeType(ContentService.MimeType.TEXT);
    }
    if (e.parameter.diag === 'fallback') {
      return ContentService.createTextOutput(diagnoseManualFallback_())
        .setMimeType(ContentService.MimeType.TEXT);
    }
    return ContentService.createTextOutput('알 수 없는 진단 유형: ' + e.parameter.diag)
      .setMimeType(ContentService.MimeType.TEXT);
  }
  try { ensurePurgeTrigger_(); } catch (_) { /* 권한 부족 시 무시 */ }

  const id   = e.parameter.id   || '';
  const page = e.parameter.page || '';

  let tpl;

  // ── 1) 승인 링크 (id가 있으면 기존 로직)
  if (id) {
    // ★ SEC-P3: HMAC 토큰 검증 — 메일 수신자 본인만 페이지 진입 가능
    let _token = e.parameter.t || '';
    const _stage = e.parameter.stage === 'final' ? 'final' : 'approve';
    const _sess = getSessionEmail_();
    let _v = verifyApprovalToken_(_token, id, _stage, _sess);

    // [v3.55] 만료 토큰 자동 재발급:
    //   서명·appId·stage가 모두 정상인 "정당하게 발급된" 토큰이 기한만 지난 경우,
    //   새 30일 토큰을 즉시 재발급하고 정상 진행. (1년 초과 만료는 차단 — 관리자 재발송 필요)
    //   1차(approve)는 재검증에서 수신자 검증이 다시 걸리므로, 잘못된 계정은 여전히 거부됨.
    if (!_v.ok && _v.expired && _v.payload) {
      const _origExp = Number(_v.payload.exp) || 0;
      const _agoSec = Math.floor(Date.now() / 1000) - _origExp;
      const _MAX_REISSUE_AGE = 365 * 24 * 60 * 60; // 만료 후 1년까지만 자동 재발급
      if (_agoSec >= 0 && _agoSec <= _MAX_REISSUE_AGE) {
        _token = genApprovalToken_(_v.payload.appId, _v.payload.stage, _v.payload.recipient);
        _v = verifyApprovalToken_(_token, id, _stage, _sess); // 새 토큰으로 재검증
        try {
          _logAccessAttempt_('doGet:approval', _sess, String(id), 'allow',
            '[v3.55] 만료 토큰 자동 재발급 (' + Math.floor(_agoSec / 86400) + '일 경과) → ' + (_v.ok ? '통과' : '재검증실패'));
        } catch (_) {}
      }
    }

    if (!_v.ok) {
      // 접속 거부 기록 + 거부 페이지 반환
      try {
        _logAccessAttempt_('doGet:approval', _sess, String(id),
          'deny', 'token: ' + (_v.error || 'unknown'));
      } catch(_) {}
      const errMsg = _v.error || '잘못된 접근입니다.';
      const html =
        '<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
        '<title>접근 거부</title>' +
        '<style>body{font-family:"맑은 고딕",Arial,sans-serif;background:#0f172a;color:#fff;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:24px;text-align:center}' +
        '.box{max-width:560px;background:#1e293b;border:1px solid #334155;border-radius:14px;padding:32px;box-shadow:0 12px 40px rgba(0,0,0,0.4)}' +
        '.icon{font-size:56px;margin-bottom:14px}h1{margin:0 0 12px;font-size:22px;color:#f87171}' +
        '.detail{background:#0f172a;border-left:3px solid #f59e0b;padding:10px 14px;border-radius:6px;margin:14px 0;font-size:13px;color:#fde68a;text-align:left;line-height:1.6}' +
        '.note{font-size:13px;color:#cbd5e1;line-height:1.7;margin-top:14px}</style></head><body>' +
        '<div class="box">' +
          '<div class="icon">🛑</div>' +
          '<h1>접근이 거부되었습니다</h1>' +
          '<div class="detail">' + escapeHtml_(errMsg) + '</div>' +
          '<div class="note">본 페이지는 메일 수신자 본인 계정으로만 접근할 수 있습니다.<br>' +
          '의심스러운 접근으로 판단되어 자동 기록되었습니다.<br><br>' +
          '문의: ' + escapeHtml_(SCIENCE_EMAIL) + '</div>' +
        '</div></body></html>';
      return HtmlService.createHtmlOutput(html)
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
        .setTitle('접근 거부');
    }
    // 토큰 OK — 정상 페이지 렌더
    if (e.parameter.stage === 'final') {
      // [HOTFIX v3.48] 토큰 검증 통과 → 10분간 cache에 bypass 키 저장 (클라이언트 후속 호출도 우회됨)
      try { _markFinalAuthBypass_(id); } catch (_) {}
      tpl = HtmlService.createTemplateFromFile('finalApprove');
      // 권한 체크 우회 (실험실 계정 미등록 케이스 대응)
      try { tpl.appData = getApplication(id, { skipAuth: true, authContext: 'doGet:final-token-verified' }); }
      catch (err) { tpl.appData = { __error: String(err && err.message ? err.message : err) }; }
    } else {
      tpl = HtmlService.createTemplateFromFile('approve');
      // [v3.58 / 3-3] 토큰 검증을 이미 통과했으므로 권한 체크 우회 (final 분기와 동일 패턴)
      //   — 교사 시트 일시 오류 시 페이지 로딩부터 실패하고 의심점수가 쌓이던 문제 수정.
      try { tpl.appData = getApplication(id, { skipAuth: true, authContext: 'doGet:approve-token-verified' }); }
      catch (err) { tpl.appData = { __error: String(err && err.message ? err.message : err) }; }
    }
    tpl.id = id;
    tpl.webAppUrl = getWebAppUrl_();
    tpl.approvalToken = _token; // 클라이언트가 submitApproval 호출 시 재전송
    return tpl.evaluate()
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
      .setTitle(e.parameter.stage === 'final' ? '최종 승인/반려' : '실험·실습실 신청 승인');
  }

  // ── 2) 1층 실험실 신청서
  if (page === 'form') {
    tpl = HtmlService.createTemplateFromFile('form');
    tpl.id = '';
    tpl.webAppUrl = getWebAppUrl_();
    return tpl.evaluate()
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
      .setTitle('과학 실험·실습실 사용 신청서(S동 1층)');
  }

  // ── 3) 2층 실험실 신청서 (Tech & Art LAB 은 공학 양식으로 이동, 3층 사용 안 함)
  if (page === 'form2f') {
    tpl = HtmlService.createTemplateFromFile('form2f');
    tpl.id = '';
    tpl.webAppUrl = getWebAppUrl_();
    return tpl.evaluate()
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
      .setTitle('과학 실험·실습실 사용 신청서(S동 2층)');
  }

  // ── 4~6) 신규 양식: IT실 / 가정실습실 / N동 공학 Zone (단일 승인)
  //  NEW_LAB_CONFIG.formPage 와 일치하는 page 파라미터를 자동 라우팅한다.
  //  HTML 템플릿엔 category(it/home/engineering)와 cfg(메타) 가 주입되어
  //  paperConfirmTeachers / subjectFilter / rooms 를 폼에서 직접 사용할 수 있다.
  {
    const newCats = Object.keys(NEW_LAB_CONFIG);
    for (let i = 0; i < newCats.length; i++) {
      const cat = newCats[i];
      const cfg = NEW_LAB_CONFIG[cat];
      if (page === cfg.formPage) {
        tpl = HtmlService.createTemplateFromFile(cfg.formPage);
        tpl.id = '';
        tpl.webAppUrl = getWebAppUrl_();
        tpl.category  = cat;
        tpl.cfg       = cfg;
        return tpl.evaluate()
          .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
          .setTitle('과학 실험·실습실 사용 신청서(' + cfg.title + ')');
      }
    }
  }

  // ── 7) 시약 검색 (조회 전용, 신청 절차 없음 — 학생 주제 선정 참고용)
  if (page === 'chemsearch') {
    tpl = HtmlService.createTemplateFromFile('chem_search');
    tpl.webAppUrl = getWebAppUrl_();
    return tpl.evaluate()
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
      .setTitle('시약 검색');
  }

  // ── 8) 기본: 게이트웨이
  tpl = HtmlService.createTemplateFromFile('gateway');
  tpl.webAppUrl = getWebAppUrl_();
  return tpl.evaluate()
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .setTitle('과학 실험·실습실 사용 신청');
}
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function getGatewayUrl() {
  return getWebAppUrl_();
}

/* ------------------------- 데이터 조회 API ------------------------- */
/**
 * ✅ 시약 목록(객체형) 반환
 */
function getChemicalList() {
  const ss = SpreadsheetApp.openById(CHEM_MASTER_SSID);
  return ss.getSheets()
    .filter(s => s.getName() !== '시약 출납')
    .flatMap(sheet => {
      const rows = sheet.getDataRange().getValues();
      if (rows.length < 3) return [];

      // 이 파일은 1행 설명, 2행 헤더
      const hdr = rows[1].map(v => String(v || '').trim());

      const nameIdx     = hdr.indexOf('물질명');
      const formulaIdx  = hdr.indexOf('화학식');

      let classIdx = hdr.indexOf('분류1');
      if (classIdx === -1) classIdx = hdr.indexOf('분류 1');
      if (classIdx === -1) classIdx = hdr.indexOf('상태');

      let guidanceIdx = hdr.indexOf('교사임장여부');
      if (guidanceIdx === -1) guidanceIdx = hdr.indexOf('교사 임장여부');
      if (guidanceIdx === -1) guidanceIdx = hdr.indexOf('교사 임장 여부');

      let disposalIdx = hdr.indexOf('폐수 처리 분류');
      if (disposalIdx === -1) disposalIdx = hdr.indexOf('폐수처리');
      if (disposalIdx === -1) disposalIdx = hdr.indexOf('폐기 방법');

      if (nameIdx === -1 && formulaIdx === -1) return [];

      return rows
        .slice(2)
        .filter(r => r[nameIdx] || r[formulaIdx])
        .map(r => {
          const nm = r[nameIdx]      || '';
          const fm = r[formulaIdx]   || '';
          const c1 = (classIdx !== -1 ? r[classIdx] : '') || '';
          const g  = (guidanceIdx !== -1 ? r[guidanceIdx] : '') || '';
          const dp = (disposalIdx !== -1 ? r[disposalIdx] : '') || '';
          return {
            '물질명': nm,
            '화학식': fm,
            '분류1':  c1,
            '교사임장여부': g,
            '폐수처리': dp,
            disposal: dp,
            name: nm,
            formula: fm,
            class1: c1,
            classification: c1,
            guidance: g,
            sheet: sheet.getName()
          };
        });
    });
}

/** ✅ 테이블 전용 목록 (폐수 처리 분류 포함 — 시약 검색 조회 페이지에서 사용)
 *  [검토반영] 5분 캐시. 시약 검색이 게이트웨이 배너로 상시 진입점이 되면서
 *  한 반(30명)이 동시에 열면 시약 마스터 통합문서를 30번 통째로 읽던 문제를 완화.
 *  캐시 값 상한(100KB)을 넘으면 캐싱을 건너뛰고 정상 동작만 유지한다.
 *  ※ rate limit은 의도적으로 넣지 않음 — 초과 시 의심 점수가 쌓여 학생이
 *    자동 차단될 수 있어, 조회 전용 페이지에는 부적절.
 */
function getChemicalListForTable() {
  const header = ['물질명', '화학식', '분류1', '교사임장여부', '폐수처리'];
  const CK = 'chem-table:v2';
  const cache = CacheService.getScriptCache();
  try {
    const hit = cache.get(CK);
    if (hit) {
      const rowsCached = JSON.parse(hit);
      if (Array.isArray(rowsCached)) return { header, rows: rowsCached };
    }
  } catch (_) { /* 캐시 파손 시 무시하고 재계산 */ }

  const list = getChemicalList();
  const rows = list.map(o => [
    o['물질명'] || o.name || '',
    o['화학식'] || o.formula || '',
    o['분류1']  || o.class1 || o.classification || '',
    o['교사임장여부'] || o.guidance || '',
    o['폐수처리'] || o.disposal || ''
  ]);
  try {
    const payload = JSON.stringify(rows);
    if (payload.length <= 90000) cache.put(CK, payload, 300);
  } catch (_) { /* 캐시 실패는 무시 */ }
  return { header, rows };
}

/** 시약 마스터를 수정한 뒤 즉시 반영하고 싶을 때 GAS 편집기에서 수동 실행 (미실행 시 5분 후 자동 갱신) */
function invalidateChemicalTableCache() {
  CacheService.getScriptCache().remove('chem-table:v2');
  return '시약 검색 캐시를 비웠습니다.';
}

/* ============================================================
 * [2026-08-22] cross-system 캐시 무효화 엔드포인트
 *
 * 관리자 GAS(scriptId 1jafWEX…)의 clearApplicationServerCache_() 는 예전부터
 * `?action=clearCache` 를 호출해 왔지만 신청서에 핸들러가 없어 doGet 이 HTML 을
 * 돌려주었고, 관리자는 parse_error 로 조용히 실패했다. 그 결과
 *   ① 관리자에서 신청제한명단·시약 마스터를 바꿔도 신청서 캐시(TTL 300초)가 남고
 *   ② 설정 미완료 상태에서는 1시간마다 학과 계정으로 "설정 누락" 메일이 반복 발송됐다.
 * 여기서 관리자가 기대하는 계약을 그대로 구현한다.
 *
 * 요청: GET ?action=clearCache&token=<CACHE_CLEAR_TOKEN>[&keys=k1,k2]
 *       (본 웹앱은 access=DOMAIN 이므로 관리자는 배포계정 OAuth 토큰을 Bearer 로 붙여 호출)
 * 응답: {status:'ok', message, cleared:[...], skipped:[...]}
 *       status 가 'ok' 가 아니면 관리자는 영구 실패로 보고 재시도하지 않는다.
 * keys 생략 = 허용된 키 전부.
 * ============================================================ */

/** 무효화를 허용하는 캐시 키. 목록 밖의 키는 지우지 않고 skipped 로 보고한다. */
const CACHE_CLEAR_ALLOWED_KEYS_ = [
  'restricted-list:v1',  // 신청 제한 명단 (getRestrictedList)
  'chem-master:v1',      // 시약 마스터 등급/폐기 맵 (getChemMasterMaps_)
  'chem-table:v2'        // 시약 표 렌더 캐시 (getChemicalTable)
];

/** 'lab-teacher-email:*' 같은 와일드카드 키를 실제 키 목록으로 전개한다. */
function _expandCacheClearKey_(key) {
  const k = String(key || '').trim();
  if (k !== 'lab-teacher-email:*') return k ? [k] : [];
  const out = [];
  try {
    Object.keys(NEW_LAB_CONFIG).forEach(function (cat) {
      const sk = NEW_LAB_CONFIG[cat] && NEW_LAB_CONFIG[cat].labTeacherSheetKey;
      if (sk) out.push('lab-teacher-email:' + sk);
    });
  } catch (_) {}
  return out;
}

function handleCacheClearRequest_(e) {
  const json = function (obj) {
    return ContentService.createTextOutput(JSON.stringify(obj))
      .setMimeType(ContentService.MimeType.JSON);
  };
  const actor = (function () { try { return getSessionEmail_(); } catch (_) { return ''; } })();

  const expected = String(PropertiesService.getScriptProperties()
    .getProperty('CACHE_CLEAR_TOKEN') || '');
  const given = String((e && e.parameter && e.parameter.token) || '');

  if (expected.length < 16) {
    try { _logAccessAttempt_('doGet:clearCache', actor, '', 'deny', 'CACHE_CLEAR_TOKEN 미설정'); } catch (_) {}
    return json({ status: 'not_configured',
      message: '신청서 GAS 편집기에서 getCacheClearTokenInfo() 를 1회 실행해 토큰을 만든 뒤, ' +
               '같은 값을 관리자 GAS 의 setApplicationServerConfig(웹앱URL, 토큰) 에 넣으세요.' });
  }

  // 상수시간 비교 (길이 차이도 diff 에 반영해 조기 반환을 없앤다)
  let diff = given.length ^ expected.length;
  for (let i = 0; i < given.length; i++) {
    diff |= given.charCodeAt(i) ^ expected.charCodeAt(i % expected.length);
  }
  if (diff !== 0) {
    try { _logAccessAttempt_('doGet:clearCache', actor, '', 'deny', '토큰 불일치'); } catch (_) {}
    return json({ status: 'unauthorized', message: '인증 실패' });
  }

  const raw = String((e && e.parameter && e.parameter.keys) || '').trim();
  const requested = raw
    ? raw.split(',').map(function (x) { return x.trim(); }).filter(Boolean)
    : CACHE_CLEAR_ALLOWED_KEYS_.slice();

  const cache = CacheService.getScriptCache();
  const cleared = [], skipped = [];
  requested.forEach(function (key) {
    const expanded = _expandCacheClearKey_(key);
    // 허용목록에 있거나 실습실 담당 메일 캐시(키가 시트 표기에 따라 늘어남)만 허용
    const ok = expanded.filter(function (k) {
      return CACHE_CLEAR_ALLOWED_KEYS_.indexOf(k) !== -1 || k.indexOf('lab-teacher-email:') === 0;
    });
    if (!ok.length) { skipped.push(key); return; }
    ok.forEach(function (k) {
      try { cache.remove(k); cleared.push(k); } catch (_) { skipped.push(k); }
    });
  });

  try {
    _logAccessAttempt_('doGet:clearCache', actor, cleared.join(','), 'allow',
      '캐시 무효화 ' + cleared.length + '건' + (skipped.length ? ' / 거부 ' + skipped.join(',') : ''));
  } catch (_) {}

  return json({
    status: 'ok',
    message: '캐시 ' + cleared.length + '건 무효화' +
             (skipped.length ? ' (허용목록 외 ' + skipped.length + '건 무시)' : ''),
    cleared: cleared,
    skipped: skipped
  });
}

/**
 * 아래 두 함수는 전역 함수라 google.script.run 으로도 호출될 수 있다.
 * 가드가 없으면 학생이 브라우저 콘솔에서 토큰을 열람할 수 있으므로 반드시 관리자만 허용한다.
 *   - 학과 계정/ADMIN_EMAILS: isAdminEmail_
 *   - 편집기에서 소유자가 직접 실행한 경우: 활성 사용자 == 유효 사용자
 *     (웹앱은 executeAs=USER_DEPLOYING 이라 학생 호출에서는 두 값이 달라 통과하지 못한다)
 */
function _assertCacheClearAdmin_(ctx) {
  let active = '', effective = '';
  try { active = getSessionEmail_(); } catch (_) {}
  try { effective = String(Session.getEffectiveUser().getEmail() || '').trim().toLowerCase(); } catch (_) {}
  if (isAdminEmail_(active)) return;
  if (active && effective && active === effective) return;
  try { _logAccessAttempt_(ctx, active, '', 'deny', '관리자/소유자 아님'); } catch (_) {}
  throw new Error('관리자만 실행할 수 있습니다. (학과 계정, ADMIN_EMAILS 등록 계정, 또는 스크립트 소유자)');
}

/**
 * [관리자 전용 · 편집기 실행] cross-system 캐시 무효화 토큰을 직접 지정한다.
 *   보통은 getCacheClearTokenInfo() 로 자동 생성하는 편이 편하다.
 */
function setCacheClearToken(token) {
  _assertCacheClearAdmin_('setCacheClearToken');
  const t = String(token || '');
  if (t.length < 16) throw new Error('토큰은 16자 이상이어야 합니다.');
  PropertiesService.getScriptProperties().setProperty('CACHE_CLEAR_TOKEN', t);
  return 'CACHE_CLEAR_TOKEN 저장 완료. 관리자 GAS 에서 ' +
         "setApplicationServerConfig('" + ScriptApp.getService().getUrl() + "', '" + t + "') 을 실행하세요.";
}

/**
 * [관리자 전용 · 편집기 실행] 토큰이 없으면 생성해서 보여준다(있으면 기존 값 표시).
 *   출력된 setApplicationServerConfig(...) 한 줄을 관리자 GAS 편집기에 그대로 붙여넣으면 된다.
 */
function getCacheClearTokenInfo() {
  _assertCacheClearAdmin_('getCacheClearTokenInfo');
  const props = PropertiesService.getScriptProperties();
  let t = String(props.getProperty('CACHE_CLEAR_TOKEN') || '');
  let created = false;
  if (t.length < 16) {
    t = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
    props.setProperty('CACHE_CLEAR_TOKEN', t);
    created = true;
  }
  return (created ? '[신규 생성] ' : '[기존 값] ') + 'CACHE_CLEAR_TOKEN = ' + t +
    '\n\n▶ 관리자 GAS 편집기에서 아래 한 줄을 실행하세요:\n' +
    "setApplicationServerConfig('" + ScriptApp.getService().getUrl() + "', '" + t + "')";
}

/**
 * ✅ [클라이언트 API] 교사 명단 — rate limit 적용.
 *   서버 내부에서 명단이 필요할 때는 rate limit 없는 readTeacherList_() 를 쓴다.
 *   (getEligibleTeachers 가 이 함수를 부르면 호출 1회가 두 번 계산돼
 *    실습실 체크박스를 몇 번 바꾸는 것만으로 학생이 차단당했다.)
 */
function getTeacherList() {
  assertCallRateLimit_('getTeacherList', 30, 60);
  return readTeacherList_();
}

/** 교사 명단 원본 조회 (rate limit 없음, 60초 캐시). 서버 내부 전용. */
function readTeacherList_() {
  const cache = CacheService.getScriptCache();
  const CK = 'teacher-list:v2';
  try {
    const hit = cache.get(CK);
    if (hit) return JSON.parse(hit);
  } catch (_) {}
  const rows = getTeacherListSheet_().getDataRange().getValues();
  const [hdr, ...data] = rows;
  const nameIdx = hdr.indexOf('교사이름');
  const emailIdx = hdr.indexOf('이메일주소') !== -1 ? hdr.indexOf('이메일주소') : hdr.indexOf('이메일 주소');
  const subjectIdx = hdr.indexOf('과목');

  // 호출자 분석: 학생인지 교사/관리자인지 판단
  const sessionEmail = getSessionEmail_();
  const isStudent = !!getSessionStudentId_();
  const isStaff = !!getSessionTeacher_() || isAdminEmail_(sessionEmail);

  const out = data.filter(r => r[nameIdx]).map(r => {
    var item = {
      name: String(r[nameIdx] || '').trim(),
      subject: String(r[subjectIdx] || '').trim()
    };
    // 교사/관리자만 이메일 전체 노출. 학생은 이메일 마스킹 (학생이 다른 교사에 사칭 메일 못 쓰게)
    if (isStaff || !isStudent) {
      item.email = r[emailIdx];
    } else {
      // 학생용 — 이메일은 신청 흐름에 필요하므로 마스킹된 형태로 노출
      //   onTeacherChange에서 본인이 선택한 교사 이메일은 서버에서 다시 검증·강제 매핑됨
      //   따라서 클라이언트에 보내는 값은 실제 이메일이 아니어도 됨 (서버가 이름으로 재조회)
      item.email = r[emailIdx]; // 이름 기반 매칭이라 이메일 필요 — 단, 클라이언트 노출 최소화 안 함
    }
    return item;
  });
  try { cache.put(CK, JSON.stringify(out), 60); } catch (_) {}
  return out;
}

/**
 * [v3.58 / 2-4] 지도교사 이메일 서버 강제 결정.
 *   클라이언트가 보낸 teacherEmail을 신뢰하지 않고, 교사 명단 시트에서
 *   이름으로 재조회해 시트의 이메일을 반환. 동명이인이면 클라이언트 이메일과
 *   일치하는 행 우선. 이름 미등록 시 '' 반환(호출부에서 오류 처리).
 */
function resolveTeacherEmail_(teacherName, claimedEmail) {
  const name = String(teacherName || '').trim();
  if (!name) return '';
  try {
    const rows = getTeacherListSheet_().getDataRange().getValues();
    const [hdr, ...data] = rows;
    const nameIdx = hdr.indexOf('교사이름');
    const emailIdx = hdr.indexOf('이메일주소') !== -1 ? hdr.indexOf('이메일주소') : hdr.indexOf('이메일 주소');
    if (nameIdx === -1 || emailIdx === -1) return '';
    const matches = data.filter(r => String(r[nameIdx] || '').trim() === name);
    if (matches.length === 0) return '';
    const claimed = String(claimedEmail || '').trim().toLowerCase();
    const exact = matches.find(r => String(r[emailIdx] || '').trim().toLowerCase() === claimed);
    return String((exact || matches[0])[emailIdx] || '').trim();
  } catch (_) { return ''; }
}

/** ★ 신청 제출 시 서버가 다시 검증할 함수 — 클라이언트가 보낸 teacherEmail이 시트와 일치하는지 */
function _verifyTeacherEmailBelongs_(teacherName, teacherEmail) {
  if (!teacherName || !teacherEmail) return false;
  try {
    const rows = getTeacherListSheet_().getDataRange().getValues();
    const [hdr, ...data] = rows;
    const nameIdx = hdr.indexOf('교사이름');
    const emailIdx = hdr.indexOf('이메일주소') !== -1 ? hdr.indexOf('이메일주소') : hdr.indexOf('이메일 주소');
    return data.some(r =>
      String(r[nameIdx] || '').trim() === String(teacherName).trim() &&
      String(r[emailIdx] || '').trim().toLowerCase() === String(teacherEmail).trim().toLowerCase()
    );
  } catch (_) { return false; }
}

/* ------------------------- 신청제한명단 ------------------------- */
/**
 * 신청제한명단 5분 캐싱.
 * 관리자가 명단 수정 시 최대 5분 후 반영됨.
 * 즉시 반영이 필요하면 invalidateRestrictedListCache() 실행.
 */
function getRestrictedList() {
  // ★ SEC-P1: rate limit + 학생 호출 시 본인 학번만 노출 (전체 명단 노출 차단)
  assertCallRateLimit_('getRestrictedList', 30, 60);

  // 호출자 판단 — 학생이면 본인 학번만 포함된 배열 반환
  const sessionStudentId = getSessionStudentId_();
  const isStaff = !!getSessionTeacher_() || isAdminEmail_(getSessionEmail_());

  const cache = CacheService.getScriptCache();
  const CK = 'restricted-list:v1';
  const hit = cache.get(CK);
  let unique;
  if (hit) {
    try { unique = JSON.parse(hit); } catch (_) { /* 파싱 실패 시 재조회 */ }
  }
  if (!unique) {
    const ss = SpreadsheetApp.openById(MAIN_SSID);
    const sh = ss.getSheetByName('신청제한명단');
    if (!sh) return [];
    const lastRow = sh.getLastRow();
    if (lastRow < 2) return [];
    // [v3.58 / 1-2] A열만 읽던 것을 A~C열로 확장 — 실제 운영 시트에서 학번이
    // B열에 입력된 사례(2026-08 확인)로 제한이 통째로 무력화됐던 문제 수정.
    const numCols = Math.min(3, sh.getLastColumn());
    const ids = sh.getRange(2, 1, lastRow - 1, numCols).getValues()
      .flat().map(v => String(v || '').trim()).filter(s => /^\d{5}$/.test(s));
    unique = Array.from(new Set(ids));
    try { cache.put(CK, JSON.stringify(unique), 300); } catch (_) { /* 캐시 실패 무시 */ }
  }

  // ★ 학생 호출 시: 본인 학번만 (또는 빈 배열) 반환. 교사/관리자는 전체.
  if (isStaff) return unique;
  if (sessionStudentId && unique.indexOf(sessionStudentId) !== -1) return [sessionStudentId];
  return [];
}

/** 관리자가 명단 변경 후 즉시 반영하고 싶을 때 GAS 편집기에서 수동 실행 */
function invalidateRestrictedListCache() {
  CacheService.getScriptCache().remove('restricted-list:v1');
  return '신청제한명단 캐시를 비웠습니다.';
}

/* ------------------------- 마이그레이션 (관리자 수동 실행) ------------------------- */
/**
 * 신규 양식(IT실/가정실습실/N동 공학 Zone) 도입 시 필요한 MAIN 시트 헤더를 자동 추가.
 * GAS 에디터 → 함수 선택 → '실행'을 1회만 누르면 됨.
 * 이미 존재하는 헤더는 건너뛰고, 누락된 헤더만 끝에 append. 기존 데이터는 손상되지 않음.
 */
// 통일 후 '실습주제'는 '실험제목' 컬럼으로 통합되어 사용하지 않음 — 컬럼 목록에서 제외.
// 기존 시트에 이미 추가된 '실습주제' 컬럼은 그대로 두어도 무방(빈 값 저장).
const NEW_LAB_SHEET_COLUMNS = [
  '양식종류',
  '사용실험실목록',
  '사용컴퓨터번호',
  '납땜여부',
  '위험도구',
  '사용계획',
  '신청장비',
  '재료JSON',
  '교육_장비사용법',
  '교육_정리방법',
  // [2026-08] 1차 승인 검토 항목 — 지도교사가 승인 화면에서 반드시 고르는 두 값.
  //   그동안 검증만 하고 어디에도 기록하지 않아, 관리자 화면이 표시하려 해도
  //   보여줄 데이터가 없었다(사고 시 책임 추적 불가). 저장 대상으로 추가한다.
  '도구장비_적절성',
  '실험내용_적절성'
];

function migrateAddNewLabColumns() {
  const sh = getMainSheet_();
  const ss = sh.getParent();
  const lastCol = sh.getLastColumn();
  if (lastCol === 0) {
    throw new Error('첫 시트가 비어 있습니다. 먼저 기본 헤더를 구성한 뒤 다시 실행하세요.');
  }
  const headerRow = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(v => String(v).trim());
  const toAdd = NEW_LAB_SHEET_COLUMNS.filter(c => headerRow.indexOf(c) === -1);

  if (toAdd.length === 0) {
    Logger.log('[migrateAddNewLabColumns] 추가할 헤더 없음 (이미 모두 존재)');
    return '추가할 헤더 없음 (이미 모두 존재)';
  }
  sh.getRange(1, lastCol + 1, 1, toAdd.length).setValues([toAdd]);
  SpreadsheetApp.flush();
  const msg = '시트에 신규 헤더 ' + toAdd.length + '개 추가됨: ' + toAdd.join(', ');
  Logger.log('[migrateAddNewLabColumns] ' + msg);
  return msg;
}

/* ======================================================================= */
/* 🔴 여기부터는 "캘린더 기반 차단" + "차단/불가/신청불가 단어 규칙"을 반영한 버전 */
/* ======================================================================= */

/* --- 신규 표준 규칙 ([차단] X / Y) 지원을 위한 공용 상수/헬퍼 --- */

/** 정식 실험실 목록 (form.html / form2f.html / form_it.html / form_home.html / form_engineering.html의 실제 option 값과 일치) */
const CANONICAL_LABS_ = [
  // S동 1층 (화학·생물 계열)
  '화학실험실', '생물실험실', '프로젝트실험실', '첨단기기실험실', '오픈랩',
  // S동 2층 (물리 계열) — Tech & Art LAB 은 폼 측에서 N동 공학 양식으로 이동되었으나
  // 정식 실험실 이름 자체는 캘린더 차단 정규화 등에서 그대로 유효하므로 목록에 유지.
  '물리실험실', '파동광학실험실', 'AP Lab', 'Tech & Art LAB',
  // S동 2층 IT 계열 (신규) — 멀티미디어실은 컴퓨터실과 별개의 독립 실습실
  //   ※ [2026-08-19] 멀티미디어실은 **신청 접수 중단**(NEW_LAB_CONFIG.it.rooms에서 제외).
  //     이름 정규화·캘린더 차단·담당교사 시트 키(LAB_TEACHER에 '멀티미디어실'로 등록)
  //     용도로만 남겨둔다 — 제거하면 컴퓨터실·코딩실의 담당 안내 조회가 깨진다.
  'IT 공학실', '코딩실', '멀티미디어실',
  // N동 가정실습실 (신규)
  '가정실습실',
  // N동 공학 Zone (신규)
  '융합기술실', '창의공학실', '공작기계실', 'FAB Lab'
];

/**
 * 별칭 → 정식 이름 매핑 (대소문자·공백 무시하여 조회).
 * 관리자가 약칭/영문 표기 등 다양한 형태로 적어도 정식 이름으로 정규화.
 */
const LAB_ALIASES_ = {
  '화학':              '화학실험실',
  '생물':              '생물실험실',
  '프로젝트':          '프로젝트실험실',
  '첨단기기':          '첨단기기실험실',
  '첨단':              '첨단기기실험실',
  '오픈':              '오픈랩',
  'openlab':           '오픈랩',
  'open lab':          '오픈랩',
  '물리':              '물리실험실',
  '파동광학':          '파동광학실험실',
  '파동':              '파동광학실험실',
  'ap':                'AP Lab',
  'aplab':             'AP Lab',
  'ap lab':            'AP Lab',
  '에이피':            'AP Lab',
  'techart':           'Tech & Art LAB',
  'tech&art':          'Tech & Art LAB',
  'techandart':        'Tech & Art LAB',
  'tech&artlab':       'Tech & Art LAB',
  'tech & art lab':    'Tech & Art LAB',
  'tech&art lab':      'Tech & Art LAB',
  'tech and art lab':  'Tech & Art LAB',
  '테크아트':          'Tech & Art LAB',
  '테크앤아트':        'Tech & Art LAB',
  // LAB_TEACHER 시트의 한글 변종 표기 호환 (담당교사 매칭용)
  'ap실험실':          'AP Lab',
  'techart실험실':     'Tech & Art LAB',
  'tech&art실험실':    'Tech & Art LAB',
  '테크아트실험실':    'Tech & Art LAB',
  '테크앤아트실험실':  'Tech & Art LAB',

  // 신규 — S동 2층 IT실
  '컴퓨터':            'IT 공학실',
  '컴퓨터실':          'IT 공학실',   // [2026-08] 옛 이름 → 신 이름 호환
  'computer':          'IT 공학실',
  'it공학실':          'IT 공학실',
  'it 공학실':         'IT 공학실',
  // [2026-08-19] 멀티미디어실은 컴퓨터실의 옛 이름이 아니라 별개의 독립 실습실.
  //   기존의 '멀티미디어실 → 컴퓨터실' 별칭을 제거하고 자체 실로 정규화한다.
  //   (별칭이 남아 있으면 두 실의 중복 예약 검사·담당교사 매칭이 서로 뒤섞임)
  '멀티미디어':        '멀티미디어실',
  '멀티':              '멀티미디어실',
  'multimedia':        '멀티미디어실',
  '코딩':              '코딩실',
  'coding':            '코딩실',

  // 신규 — N동 가정실습실
  '가정':              '가정실습실',
  '가정실':            '가정실습실',

  // 신규 — N동 공학 Zone
  '융합':              '융합기술실',
  '융합기술':          '융합기술실',
  '창의':              '창의공학실',
  '창의공학':          '창의공학실',
  '공작':              '공작기계실',
  '공작기계':          '공작기계실',
  'fab':               'FAB Lab',
  'fablab':            'FAB Lab',
  'fab lab':           'FAB Lab',
  '팹랩':              'FAB Lab'
};

/* ==================================================================
 * ✅ [2026-08] 승인 정책 단일 소스 (Single Source of Truth)
 * ------------------------------------------------------------------
 * 그동안 "어떤 실습실을 어떤 과목 교사가 지도/승인하는가"가 각 폼 HTML에
 * 흩어져 하드코딩돼 있었다. 그 결과
 *   - 1·2층은 과목 완전일치(===), 신규 폼은 부분일치로 규칙이 서로 달랐고
 *     ('물리(테크)' 김원우 선생님이 2층 폼에서만 누락)
 *   - NEW_LAB_CONFIG.subjectFilter 는 어느 폼도 읽지 않는 죽은 설정이었으며
 *   - 서버는 "명단에 있는 교사인가"만 볼 뿐 과목·실습실 정합성은 검사하지 않아
 *     드롭다운이 유일한 관문이었다.
 *
 * 아래 표가 유일한 기준이며, 폼은 getEligibleTeachers() 로 후보를 받아 오고
 * 서버는 제출 시 assertTeacherEligible_() 로 같은 표를 다시 대조한다.
 *
 *   stage 2 = 지도교사 1차 승인 → 실습실 담당 계정 최종 승인
 *   stage 1 = 지도교사 단독 승인 (1차 단계 없음)
 *   clubSubjects = 사용목적이 '동아리 활동'일 때 대체 적용할 과목 (없으면 목적 무관)
 * ================================================================== */
const LAB_APPROVAL_POLICY_ = {
  /* S동 1층 — 2단 승인. 동아리 활동이면 화학·생명과학 공통 */
  '화학실험실':      { stage: 2, subjects: ['화학'],              clubSubjects: ['화학', '생명과학'] },
  '생물실험실':      { stage: 2, subjects: ['생명과학'],          clubSubjects: ['화학', '생명과학'] },
  '프로젝트실험실':  { stage: 2, subjects: ['화학', '생명과학'] },
  '첨단기기실험실':  { stage: 2, subjects: ['화학', '생명과학'] },
  '오픈랩':          { stage: 2, subjects: ['화학', '생명과학'] },

  /* S동 2층 물리 계열 — 2단 승인. 동아리 여부와 무관하게 물리 교사만.
     '물리(테크)'(김원우 선생님)는 SUBJECT_ALIASES_ 로 '물리'를 함께 갖는다. */
  '물리실험실':      { stage: 2, subjects: ['물리'] },
  '파동광학실험실':  { stage: 2, subjects: ['물리'] },
  'AP Lab':          { stage: 2, subjects: ['물리'] },

  /* S동 2층 IT 계열 — 1단 승인 (정보 교사 단독) */
  'IT 공학실':       { stage: 1, subjects: ['정보'] },
  '코딩실':          { stage: 1, subjects: ['정보'] },
  '멀티미디어실':    { stage: 1, subjects: ['정보'] },   // 신청 접수 중단 상태이나 정책은 유지

  /* S동 3층 — 1단 승인. 교사 이름을 코드에 박지 않고 과목 '물리(테크)'로 지정.
     담당 교사가 바뀌거나 휴직하면 지도교사 목록 시트의 과목만 옮기면 된다. */
  'Tech & Art LAB':  { stage: 1, subjects: ['물리(테크)'] },

  /* N동 지하 — 1단 승인 */
  '가정실습실':      { stage: 1, subjects: ['가정'] },

  /* N동 공학 ZONE — 1단 승인 (기술 교사 단독) */
  '융합기술실':      { stage: 1, subjects: ['기술'] },
  '창의공학실':      { stage: 1, subjects: ['기술'] },
  '공작기계실':      { stage: 1, subjects: ['기술'] },
  'FAB Lab':         { stage: 1, subjects: ['기술'] }
};

/**
 * 과목 토큰 확장표. 시트의 '과목' 칸 한 값이 여러 자격을 겸하는 경우를 표현한다.
 *   '물리(테크)' → 물리 계열 실험실(2층)에도, Tech & Art LAB 에도 자격이 있다.
 *   반대로 그냥 '물리'인 교사는 Tech & Art LAB 자격이 없다(확장은 단방향).
 */
const SUBJECT_ALIASES_ = {
  '물리(테크)': ['물리(테크)', '물리']
};

/** 과목 비교용 정규화 — 공백 제거 + 소문자화 */
function normSubject_(s) {
  return String(s || '').trim().toLowerCase().replace(/\s+/g, '');
}

/**
 * 지도교사 목록 시트의 '과목' 칸 → 자격 토큰 Set.
 *   - 콤마/슬래시/가운뎃점으로 복수 과목 기재 가능 ('물리, 공학')
 *   - 앞뒤 공백은 무시 (기존에 공백 하나로 교사가 통째로 사라지던 문제 차단)
 *   - SUBJECT_ALIASES_ 로 상위 자격까지 확장
 */
function parseSubjectTokens_(subjectCell) {
  const out = {};
  String(subjectCell || '')
    .split(/[,\/·]/)
    .map(t => t.trim())
    .filter(Boolean)
    .forEach(tok => {
      out[normSubject_(tok)] = true;
      const expanded = SUBJECT_ALIASES_[tok] || SUBJECT_ALIASES_[tok.replace(/\s+/g, '')];
      if (Array.isArray(expanded)) expanded.forEach(e => { out[normSubject_(e)] = true; });
    });
  return out;
}

/** 교사의 과목 칸이 요구 과목 중 하나라도 만족하는가 */
function teacherMatchesSubjects_(subjectCell, wantedSubjects) {
  if (!Array.isArray(wantedSubjects) || !wantedSubjects.length) return false;
  const have = parseSubjectTokens_(subjectCell);
  return wantedSubjects.some(w => have[normSubject_(w)] === true);
}

/** 실습실 이름(별칭 허용) → 승인 정책. 미등록이면 null */
function getLabPolicy_(labName) {
  const raw = String(labName || '').trim();
  if (!raw) return null;
  if (LAB_APPROVAL_POLICY_[raw]) return LAB_APPROVAL_POLICY_[raw];
  const canon = normalizeLabName_(raw);
  return (canon && LAB_APPROVAL_POLICY_[canon]) ? LAB_APPROVAL_POLICY_[canon] : null;
}

/** 사용목적 문자열이 '동아리 활동'인가 */
function isClubPurpose_(purpose) {
  return String(purpose || '').indexOf('동아리') !== -1;
}

/**
 * 실습실 + 사용목적으로 요구 과목 목록을 계산한다.
 * 복수 실습실이면 각 실의 요구 과목을 모두 만족해야 하므로 교집합을 쓴다.
 *   (예: 코딩실 + IT 공학실 → 둘 다 '정보' → 정보)
 * 교집합이 비면 [] 를 돌려주고, 호출부가 "함께 신청할 수 없는 조합"으로 처리한다.
 */
function requiredSubjectsFor_(labNames, purpose) {
  const labs = (Array.isArray(labNames) ? labNames : [labNames])
    .map(s => String(s || '').trim()).filter(Boolean);
  if (!labs.length) return { ok: false, subjects: [], unknown: [], stage: 0 };

  const club = isClubPurpose_(purpose);
  const unknown = [];
  let acc = null;
  let stage = 0;

  labs.forEach(lab => {
    const p = getLabPolicy_(lab);
    if (!p) { unknown.push(lab); return; }
    stage = Math.max(stage, p.stage);
    const wanted = (club && Array.isArray(p.clubSubjects)) ? p.clubSubjects : p.subjects;
    if (acc === null) {
      acc = wanted.slice();
    } else {
      acc = acc.filter(s => wanted.indexOf(s) !== -1);
    }
  });

  return { ok: unknown.length === 0 && acc !== null, subjects: acc || [], unknown: unknown, stage: stage };
}

/**
 * ✅ [클라이언트 API] 선택한 실습실·사용목적에 지도교사가 될 수 있는 교사 목록.
 *   모든 신청 폼(1층/2층/IT/가정/공학/Tech&Art)이 이 함수 하나만 호출한다.
 *
 * @param {string|string[]} labNames 실습실 이름(복수 가능)
 * @param {string} purpose 사용목적 (1층에서만 '동아리 활동' 분기에 사용)
 * @return {{ok:boolean, teachers:Array, subjects:Array, stage:number, message:string}}
 */
function getEligibleTeachers(labNames, purpose) {
  assertCallRateLimit_('getEligibleTeachers', 60, 60);

  const req = requiredSubjectsFor_(labNames, purpose);
  if (req.unknown.length) {
    return { ok: false, teachers: [], subjects: [], stage: 0,
             message: '승인 정책이 등록되지 않은 실습실입니다: ' + req.unknown.join(', ') };
  }
  if (!req.subjects.length) {
    return { ok: false, teachers: [], subjects: [], stage: req.stage,
             message: '함께 신청할 수 없는 실습실 조합입니다. 지도교사 자격이 서로 다릅니다.' };
  }

  const all = readTeacherList_();
  const teachers = all.filter(t => teacherMatchesSubjects_(t.subject, req.subjects));

  return {
    ok: true,
    teachers: teachers,
    subjects: req.subjects,
    stage: req.stage,
    message: teachers.length ? '' :
      '해당 실습실의 지도교사(' + req.subjects.join('·') + ')가 교사 명단에 없습니다. 학과에 문의해 주세요.'
  };
}

/**
 * ✅ [서버 강제 검증] 제출된 지도교사가 해당 실습실·목적의 자격을 갖췄는지 대조.
 *   드롭다운(클라이언트)이 유일한 관문이던 구조를 서버로 옮긴다.
 *   조작된 요청이나 폼 캐시로 옛 목록이 남은 경우를 모두 차단.
 */
function assertTeacherEligible_(teacherName, labNames, purpose) {
  const req = requiredSubjectsFor_(labNames, purpose);
  if (req.unknown.length) {
    throw new Error('승인 정책이 등록되지 않은 실습실입니다: ' + req.unknown.join(', ') +
      '\n학과에 문의해 주세요.');
  }
  if (!req.subjects.length) {
    throw new Error('함께 신청할 수 없는 실습실 조합입니다. 지도교사 자격이 서로 다릅니다.');
  }

  const name = String(teacherName || '').trim();
  const rows = readTeacherList_().filter(t => String(t.name || '').trim() === name);
  if (!rows.length) {
    throw new Error('지도교사 "' + name + '" 를 교사 명단에서 찾을 수 없습니다.');
  }
  const eligible = rows.some(t => teacherMatchesSubjects_(t.subject, req.subjects));
  if (!eligible) {
    throw new Error(
      '"' + name + '" 선생님은 선택하신 실습실의 지도교사가 될 수 없습니다.\n' +
      '필요 과목: ' + req.subjects.join(' 또는 ') +
      ' / 등록 과목: ' + (rows[0].subject || '(없음)') +
      '\n지도교사를 목록에서 다시 선택해 주세요.'
    );
  }
  return req;
}

/* ------------------------------------------------------------------
 * 신규 양식 카탈로그 (S동 2층 IT실 / 가정실습실 / N동 공학 Zone)
 * ------------------------------------------------------------------
 * 신규 양식은 1차/최종 2단계 없이 "단일 승인"으로 처리된다.
 * [정책 변경 2026-08] 승인자는 **학생이 선택한 지도교사**(data.teacherEmail)이며,
 * 지도교사 이메일은 교사 명단 시트를 기준으로 서버가 강제 결정한다(resolveTeacherEmail_).
 *   ※ 과거에는 LAB_TEACHER 시트의 실습실 담당 계정이 승인 주체였다. 아래
 *     labTeacherSheetKey / getNewLabApproverEmail_ 는 그 시절 잔재이며 현재 승인
 *     라우팅에는 사용되지 않는다(빠른 롤백 대비로 남겨둠).
 *
 *   labTeacherSheetKey 가 LAB_TEACHER 시트 "담당 실험실" 컬럼의 키이며,
 *   해당 행의 "이메일 주소" 컬럼 값으로 메일이 발송된다.
 *
 *   it          → 시트 키 "컴퓨터실"  (컴퓨터실 + 코딩실 공용 라우팅)
 *   home        → 시트 키 "가정실"
 *   engineering → 시트 키 "공학존"        (4실 모두 공용 라우팅)
 *
 * paperConfirmTeachers 는 PDF 신청서 우상단 "실습실 담당 선생님 확인란"에
 * 표기되는 종이 양식용 메타데이터일 뿐, 시스템 승인 라우팅에는 쓰이지 않는다.
 * ------------------------------------------------------------------ */
const NEW_LAB_CONFIG = {
  it: {
    sheetCategory: 'IT실',
    title: 'S동 2층 IT 관련 실습실',
    rooms: ['IT 공학실', '코딩실'],  // [2026-08-19] 멀티미디어실 신청 접수 중단 — 목록에서 제외
                                     // [2026-08] '컴퓨터실' → 'IT 공학실' 로 명칭 변경 (옛 이름은 LAB_ALIASES_ 로 호환)
    paperConfirmTeachers: [
      { name: '윤용철', location: 'C201' },
      { name: '이정석', location: 'C201' }
    ],
    // 지도교사 자격은 LAB_APPROVAL_POLICY_ 가 유일한 기준 (여기에 중복 정의하지 않는다)
    labTeacherSheetKey: 'IT 공학실',
    formPage: 'form_it',
    // 종이 양식의 "지도 선생님 확인 사항" — 학생 폼에서는 받지 않고
    // 최종 승인자 메일에 체크리스트로 표시되어, 지도교사가 종이 양식에 직접 표기.
    confirmItems: [
      '직접 실습실에 가서 지도해야 하는 과정 여부 (필요 시 임장 시간 함께 기재)',
      '활동 장소 적절성 확인',
      '컴퓨터 전원 끄기·멀티탭 사용 등 전기 안전 교육 완료 여부'
    ]
  },
  home: {
    sheetCategory: '가정실습실',
    title: 'N동 가정실습실',
    rooms: ['가정실습실'],
    paperConfirmTeachers: [
      { name: '박연서', location: 'C401' },
      { name: '최승아', location: 'N305' }
    ],
    // 지도교사 자격은 LAB_APPROVAL_POLICY_ 참조
    labTeacherSheetKey: '가정실',
    formPage: 'form_home',
    confirmItems: [
      '직접 실습실에 가서 지도해야 하는 과정 여부 (필요 시 임장 시간 함께 기재)',
      '실습에 필요한 장비와 도구 적절성',
      '실습 장비 사용법에 대한 사전 교육 완료 여부',
      '실습 후 정리 방법에 대한 사전 교육 완료 여부'
    ]
  },
  engineering: {
    // [2026-08] Tech & Art LAB 을 별도 양식(techart)으로 분리.
    //   두 곳의 지도교사 자격이 서로 다르기 때문(공학 ZONE=기술 / Tech & Art LAB=물리(테크)).
    //   ※ 시트 저장값 변경 — 관리자의 SHEET_CAT_MAP_ 에 신·구 값이 모두 등록돼 있어
    //     기존 신청 기록('N동 공학 ZONE, Tech & Art LAB')도 계속 공학으로 조회된다.
    sheetCategory: 'N동 공학 ZONE',
    title: 'N동 공학 ZONE',
    rooms: ['융합기술실', '창의공학실', '공작기계실', 'FAB Lab'],
    paperConfirmTeachers: [
      { name: '이대석', location: 'N503' }
    ],
    labTeacherSheetKey: '공학존',
    formPage: 'form_engineering',
    confirmItems: [
      '직접 실습실에 가서 지도해야 하는 과정 여부 (필요 시 임장 시간 함께 기재)',
      '실습에 필요한 장비와 도구 적절성',
      '실습 장비 사용법에 대한 사전 교육 완료 여부',
      '실습 후 정리 방법에 대한 사전 교육 완료 여부'
    ]
  },
  techart: {
    // [2026-08] S동 3층 Tech & Art LAB — 공학 ZONE 에서 분리된 단독 양식.
    //   지도교사 자격은 과목 '물리(테크)' (LAB_APPROVAL_POLICY_ 참조).
    //   담당 교사가 바뀌거나 휴직하면 지도교사 목록 시트의 과목만 옮기면 되며,
    //   코드에 교사 이름을 남기지 않는다.
    sheetCategory: 'Tech & Art LAB',
    title: 'S동 3층 Tech & Art LAB',
    rooms: ['Tech & Art LAB'],
    paperConfirmTeachers: [],
    labTeacherSheetKey: 'Tech & Art LAB',
    formPage: 'form_techart',
    confirmItems: [
      '직접 실습실에 가서 지도해야 하는 과정 여부 (필요 시 임장 시간 함께 기재)',
      '실습에 필요한 장비와 도구 적절성',
      '실습 장비 사용법에 대한 사전 교육 완료 여부',
      '실습 후 정리 방법에 대한 사전 교육 완료 여부'
    ]
  }
};

/**
 * ✅ [2026-08] 시트 '양식종류' 저장값 → 카테고리 단일 매핑.
 *   승인 페이지(approve/finalApprove)가 각자 하드코딩 표를 들고 있어, 양식이 추가되거나
 *   저장값이 바뀔 때마다 화면이 조용히 옛 분기를 타는 문제가 있었다.
 *   서버가 계산해 getApplication 결과에 __formCategory 로 실어 보낸다.
 *   과거 저장값도 함께 인식해 기존 신청 기록이 깨지지 않게 한다.
 */
const SHEET_CATEGORY_MAP_ = {
  'IT실':                          'it',
  '가정실습실':                    'home',
  'N동 공학 ZONE':                 'engineering',
  'N동 공학 Zone':                 'engineering',   // 과거 저장값
  'N동 공학 ZONE, Tech & Art LAB': 'engineering',   // Tech & Art 분리 전 저장값
  'Tech & Art LAB':                'techart'
};
function categoryFromSheetValue_(raw) {
  const v = String(raw || '').trim();
  if (!v) return '';
  if (SHEET_CATEGORY_MAP_[v]) return SHEET_CATEGORY_MAP_[v];
  const lower = v.toLowerCase();
  if (['it','home','engineering','techart'].indexOf(lower) !== -1) return lower;
  return '';   // 'S동 1층' / 'S동 2층' / 빈 값 → 2단 승인 양식
}

/** 룸명(단일) → 카테고리(it/home/engineering/techart). 매칭 실패 시 빈 문자열. */
function getNewLabCategory_(roomName) {
  const s = String(roomName || '').trim();
  if (!s) return '';
  const cats = Object.keys(NEW_LAB_CONFIG);
  for (let i = 0; i < cats.length; i++) {
    if (NEW_LAB_CONFIG[cats[i]].rooms.indexOf(s) !== -1) return cats[i];
  }
  return '';
}

/** 룸명 1개 또는 룸명 배열 → 신규 양식 여부. */
function isNewLabRoom_(roomsOrName) {
  const arr = Array.isArray(roomsOrName) ? roomsOrName : [roomsOrName];
  for (let i = 0; i < arr.length; i++) {
    if (getNewLabCategory_(arr[i])) return true;
  }
  return false;
}

/**
 * [2026-08-19] 실습실 담당 선생님 조회 — "참고 안내" 메일 수신자용.
 *
 * ※ 승인 권한은 지도교사에게 있음(2026-08 단일 승인 정책). 이 함수는 승인자를 찾는 것이
 *    아니라, "내가 담당하는 실습실에 신청이 들어왔다"는 사실을 알릴 대상을 찾는 용도.
 * ※ 예전 getNewLabApproverEmail_(카테고리 1명 조회)를 대체 — 카테고리 대표 1명만 찾던
 *    방식은 IT실처럼 실별 담당이 다른 경우를 표현하지 못했음.
 *
 * 매칭 규칙: 실 이름 정확 일치 → 정규화 일치 → 그룹 등록명 폴백(공학ZONE 등).
 * @param {string[]} rooms 신청한 실습실 이름 배열
 * @returns {Array<{room:string, email:string}>} 이메일 기준 중복 제거된 목록
 */
function getLabRoomOwnerEmails_(rooms) {
  const list = (Array.isArray(rooms) ? rooms : [rooms])
    .map(r => String(r || '').trim()).filter(Boolean);
  if (!list.length) return [];

  const out = [];
  const seenEmail = {};
  try {
    const labData = getLabTeacherSheet_().getDataRange().getValues();
    const [labHdr, ...labRows] = labData;
    const labIdx = labHdr.findIndex(h => {
      const t = String(h).trim();
      return t === '담당 실험실' || t === '담당실험실';
    });
    const mailIdx = labHdr.findIndex(h => {
      const t = String(h).trim();
      return t === '이메일 주소' || t === '이메일주소';
    });
    if (labIdx === -1 || mailIdx === -1) {
      Logger.log('[getLabRoomOwnerEmails_] 담당교사 시트 헤더(담당 실험실/이메일 주소) 없음');
      return [];
    }

    // 그룹 한 줄 등록 폴백 (담당교사 시트가 실별이 아니라 그룹 한 줄로만 등록된 경우).
    //   예: '공학ZONE' 한 행이 5개 실을 대표 / IT 그룹은 현재 '멀티미디어실' 한 행뿐이라
    //       컴퓨터실·코딩실 신청도 이 행으로 폴백해야 안내가 나간다.
    const ENGINEERING_ROOMS = ['융합기술실', '창의공학실', '공작기계실', 'FAB Lab'];
    const IT_ROOMS = ['IT 공학실', '코딩실', '멀티미디어실'];
    const norm = s => String(s || '').trim().toLowerCase().replace(/\s+/g, '');

    list.forEach(room => {
      const wantCanon = normalizeLabName_(room) || room;
      const groupCanons = [];
      if (ENGINEERING_ROOMS.indexOf(wantCanon) >= 0) groupCanons.push('공학zone', '공학존');
      if (IT_ROOMS.indexOf(wantCanon) >= 0) groupCanons.push('it공학실', '컴퓨터실', '코딩실', '멀티미디어실', 'it실');

      // [2-pass] 1차: 실 이름 정확/정규화 일치 (시트 행 순서와 무관하게 정확 매칭 우선)
      let row = labRows.find(r => {
        const cell = String(r[labIdx] || '').trim();
        if (!cell) return false;
        if (cell === room) return true;
        return (normalizeLabName_(cell) || cell) === wantCanon;
      });
      // 2차: 그룹 등록명 폴백
      if (!row && groupCanons.length) {
        row = labRows.find(r => {
          const cell = String(r[labIdx] || '').trim();
          if (!cell) return false;
          const cellCanon = normalizeLabName_(cell) || cell;
          return groupCanons.indexOf(norm(cell)) >= 0 || groupCanons.indexOf(norm(cellCanon)) >= 0;
        });
      }
      if (!row) {
        Logger.log('[getLabRoomOwnerEmails_] 담당교사 미등록 실습실: ' + room);
        return;
      }
      const email = String(row[mailIdx] || '').trim();
      if (!email || seenEmail[email.toLowerCase()]) return;
      seenEmail[email.toLowerCase()] = true;
      out.push({ room: room, email: email });
    });
  } catch (e) {
    Logger.log('[getLabRoomOwnerEmails_] 시트 조회 실패: ' + (e && e.message ? e.message : e));
  }
  return out;
}

/** [폐기 잔여물 정리] 예전 승인자 메일 캐시를 비움 (수동 실행용). */
function invalidateNewLabEmailCache() {
  const cache = CacheService.getScriptCache();
  Object.keys(NEW_LAB_CONFIG).forEach(cat => {
    const k = NEW_LAB_CONFIG[cat].labTeacherSheetKey;
    if (k) cache.remove('lab-teacher-email:' + k);
  });
  return '실습실 담당 메일 캐시를 비웠습니다. (현재 담당자 조회는 캐시를 쓰지 않습니다)';
}

/**
 * 입력된 실험실 이름(정식/약칭/대소문자/공백 섞임)을 정식 이름으로 정규화.
 * 매칭 실패 시 빈 문자열 반환.
 */
function normalizeLabName_(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  // 1) 정식 이름 완전 일치
  for (let i = 0; i < CANONICAL_LABS_.length; i++) {
    if (CANONICAL_LABS_[i] === s) return CANONICAL_LABS_[i];
  }
  // 2) 대소문자·공백 무시 일치 (정식 목록)
  const key = s.toLowerCase().replace(/\s+/g, '');
  for (let i = 0; i < CANONICAL_LABS_.length; i++) {
    if (CANONICAL_LABS_[i].toLowerCase().replace(/\s+/g, '') === key) {
      return CANONICAL_LABS_[i];
    }
  }
  // 3) 별칭 매핑
  const keys = Object.keys(LAB_ALIASES_);
  for (let i = 0; i < keys.length; i++) {
    if (keys[i].toLowerCase().replace(/\s+/g, '') === key) {
      return LAB_ALIASES_[keys[i]];
    }
  }
  return '';
}

/* [v3.57] 층(floor) 단위 차단 지원.
 *   관리자가 "1층 차단"처럼 층 단위로 적으면 해당 층 실험실 전체로 확장.
 *   폼 구성과 일치: form.html=S동 1층 / form2f.html=S동 2·3층 / form_it=IT실 / form_home=가정 / form_engineering=공학Zone.
 *   ⚠️ 실험실 배치가 바뀌면 이 매핑도 함께 갱신할 것. */
/* [2026-08] 층 그룹을 실제 건물 배치와 일치시켰다.
 *   변경 전에는 '3층'이 물리 계열(실제 2층)까지 포함해, "3층 차단"이 2층 물리
 *   실험실까지 막았다. 신규 교원이 규칙을 읽고 예측할 수 있도록 층=물리적 위치로 정리한다.
 *   2·3층을 한꺼번에 막던 기존 표기('2·3층')는 두 층의 합집합으로 계속 동작한다.
 *
 * ⚠️ 그룹 키는 "공백 제거·소문자화한 본문에 포함되면 매칭"이다. 따라서 개별 실습실
 *    이름의 일부가 되는 키(예: '공학' → '창의공학실')를 넣으면 실 하나만 막으려던
 *    입력이 그룹 전체로 번진다. 키를 추가할 때 반드시 확인할 것. */
const FLOOR_GROUPS_ = [
  { keys: ['s동1층', '1층'],
    labs: ['화학실험실', '생물실험실', '프로젝트실험실', '첨단기기실험실', '오픈랩'] },

  // S동 2층 — 물리 계열 3실 + IT 계열 3실
  { keys: ['s동2층', '2층'],
    labs: ['물리실험실', '파동광학실험실', 'AP Lab', 'IT 공학실', '코딩실', '멀티미디어실'] },

  // S동 3층 — Tech & Art LAB 전용
  { keys: ['s동3층', '3층'],
    labs: ['Tech & Art LAB'] },

  // 2·3층 동시 표기(기존 운영 표기 호환) — 두 층의 합집합
  { keys: ['s동2·3층', 's동2,3층', 's동2.3층', '2·3층', '2,3층', '2.3층'],
    labs: ['물리실험실', '파동광학실험실', 'AP Lab', 'IT 공학실', '코딩실', '멀티미디어실',
           'Tech & Art LAB'] },

  // N동 — 가정실습실(지하) + 공학 ZONE 4실
  { keys: ['n동'],
    labs: ['가정실습실', '융합기술실', '창의공학실', '공작기계실', 'FAB Lab'] },

  // 공학 ZONE 4실만 (키가 개별 실 이름의 부분문자열이 아닌지 확인 완료)
  { keys: ['공학존', '공학zone'],
    labs: ['융합기술실', '창의공학실', '공작기계실', 'FAB Lab'] }
];

/**
 * 텍스트에서 층 키워드를 찾아 해당 층의 실험실 목록으로 확장.
 * @param {string} text 캘린더 제목/설명
 * @returns {string[]} 정식 실험실 이름 배열 (없으면 빈 배열)
 */
function expandFloorGroups_(text) {
  const t = String(text || '').toLowerCase().replace(/\s+/g, '');
  const out = [];
  FLOOR_GROUPS_.forEach(g => {
    if (g.keys.some(k => t.indexOf(k.replace(/\s+/g, '')) !== -1)) {
      g.labs.forEach(l => { if (out.indexOf(l) === -1) out.push(l); });
    }
  });
  return out;
}

/**
 * 신규 표준: [차단] X / Y / (사유)  파서
 *   - X(실험실): 쉼표 구분 복수, '전체' 사용 가능, 약칭 허용
 *   - Y(시간):   쉼표 구분 복수, '전체' 사용 가능 (ET/EP1/7교시)
 *   - 사유: 파싱에 영향 없음(안내용)
 * 예시:
 *   [차단] 화학실험실
 *   [차단] 전체 / ET
 *   [차단] 화학실험실 / ET, EP1 / 대청소
 *   [차단] 전체
 * 반환값 형식은 parseCalendarEventForBlocks_의 out과 동일.
 */
function parseNewBlockTag_(text) {
  const out = { allBlocked: false, labs: [], times: [] };
  const re = /\[\s*차단\s*\]\s*([^\[\n\r]*)/gi;
  let m;
  while ((m = re.exec(text)) !== null) {
    const body = String(m[1] || '').trim();

    // [차단]만 있고 뒷부분 없음 → 그 날 전체 차단
    if (!body) { out.allBlocked = true; continue; }

    const parts = body.split('/').map(s => s.trim());
    const labsPart  = parts[0] || '';
    const timesPart = parts[1] || '';

    let labsAll = false;
    const thisLabs = [];
    labsPart.split(',').map(s => s.trim()).filter(Boolean).forEach(tok => {
      if (/^(전체|all)$/i.test(tok)) { labsAll = true; return; }
      // [v3.57] 층 키워드면 해당 층 실험실로 확장 (예: [차단] 1층)
      const fl = expandFloorGroups_(tok);
      if (fl.length > 0) { fl.forEach(l => { if (thisLabs.indexOf(l) === -1) thisLabs.push(l); }); return; }
      const norm = normalizeLabName_(tok);
      if (norm) thisLabs.push(norm);
    });

    let timesAll = false;
    const thisTimes = [];
    timesPart.split(',').map(s => s.trim()).filter(Boolean).forEach(tok => {
      if (/^(전체|all)$/i.test(tok)) { timesAll = true; return; }
      const norm = normalizeSlot_(tok);
      if (['ET','EP1','7교시'].indexOf(norm) !== -1) thisTimes.push(norm);
    });

    // 해석 규칙:
    //   labs=전체 AND (times 생략 OR times=전체) → 전체 차단
    //   labs=전체 AND times=[특정]              → times만 추가(모든 실험실의 그 시간)
    //   labs=[특정] AND times 생략                → labs만 추가(해당 실험실 종일)
    //   labs=[특정] AND times=[특정]            → labs+times 모두 추가(perLabTimes 경로)
    //   labs 생략   AND times=[특정]            → times만 추가(모든 실험실의 그 시간)
    if (labsAll && (timesAll || thisTimes.length === 0)) {
      out.allBlocked = true;
    } else if (labsAll && thisTimes.length > 0) {
      thisTimes.forEach(t => { if (out.times.indexOf(t) === -1) out.times.push(t); });
    } else if (thisLabs.length > 0) {
      thisLabs.forEach(l => { if (out.labs.indexOf(l) === -1) out.labs.push(l); });
      if (thisTimes.length > 0) {
        thisTimes.forEach(t => { if (out.times.indexOf(t) === -1) out.times.push(t); });
      }
    } else if (thisTimes.length > 0) {
      thisTimes.forEach(t => { if (out.times.indexOf(t) === -1) out.times.push(t); });
    }
  }
  return out;
}

/**
 * ✅ 자연어 기반 차단 패턴을 찾아주는 헬퍼
 */
function matchBlockByWords_(text) {
  // 정식 목록 + 옛 철자('Tech&Art Lab') 병행 인식 — 하위 호환
  const labs = CANONICAL_LABS_.concat(['Tech&Art Lab']);
  const times = ['ET', 'EP1', '7교시'];
  const blockWords = ['차단', '불가', '신청불가', '신청 불가'];

  const found = {
    allBlocked: false,
    labs: [],
    times: []
  };

  const t = String(text || '').trim();
  const hasBlockWord = blockWords.some(w => t.indexOf(w) !== -1);

  // [v3.57] 층 단위 차단 — "1층 차단" 등은 해당 층 실험실로 확장.
  const floorLabs = expandFloorGroups_(t);
  if (floorLabs.length > 0 && hasBlockWord) {
    floorLabs.forEach(l => { if (found.labs.indexOf(l) === -1) found.labs.push(l); });
  }

  // [v3.57] "전체 차단"은 층/특정 실험실 한정이 전혀 없을 때만 전체 차단으로 해석.
  //   (예: "1층 전체 차단"은 1층만 → 위에서 이미 처리됨. 여기서 allBlocked로 잘못 잡지 않음.)
  const hasSpecificLab = floorLabs.length > 0 || labs.some(l => t.indexOf(l) !== -1);
  if (
    !hasSpecificLab &&
    ( /전체\s*(차단|불가)/.test(t) ||
      /전체\s*(신청\s*불가|신청불가)/.test(t) ||
      /전체\s*실험실\s*(신청\s*불가|신청불가)/.test(t) )
  ) {
    found.allBlocked = true;
  }

  labs.forEach(lab => {
    if (t.indexOf(lab) !== -1) {
      if (blockWords.some(w => t.indexOf(w) !== -1)) {
        if (found.labs.indexOf(lab) === -1) {
          found.labs.push(lab);
        }
      }
      times.forEach(slot => {
        // [v3.58] 슬롯 단어 경계 — 'ET'가 영단어 일부(MEETING 등)로 오인되지 않게
        const re = new RegExp(lab + '\\s*' + slot + '(?![A-Za-z0-9]).*(' + blockWords.join('|') + ')');
        if (re.test(t)) {
          if (found.times.indexOf(slot) === -1) {
            found.times.push(slot);
          }
          if (found.labs.indexOf(lab) === -1) {
            found.labs.push(lab);
          }
        }
      });
    }
  });

  times.forEach(slot => {
    // [v3.58] 슬롯 단어 경계 적용 (영단어 속 'ET' 오인 방지)
    const re = new RegExp('(?:^|[^A-Za-z])' + slot + '(?![A-Za-z0-9]).*(' + blockWords.join('|') + ')');
    if (re.test(t)) {
      if (found.times.indexOf(slot) === -1) {
        found.times.push(slot);
      }
    }
  });

  return found;
}

/**
 * 캘린더 이벤트 한 건을 우리 규칙으로 파싱
 *
 * 인식 우선순위:
 *  1) 신규 표준: [차단] X / Y / (사유)  ← 권장
 *  2) 기존 태그: [BLOCK], [전체불가], [lab:...], [time:...]
 *  3) 자연어:    "화학실험실 ET 차단" 등 (matchBlockByWords_)
 *  4) 단순 키워드: 제목/설명에 실험실명이나 시간 슬롯만 있어도 인식 (하위 호환)
 */
function parseCalendarEventForBlocks_(title, desc) {
  const text = ((title || '') + ' ' + (desc || '')).trim();
  const upper = text.toUpperCase();

  const out = {
    allBlocked: false,
    labs: [],
    times: []
  };

  // [1] 신규 표준: [차단] X / Y 파서 (권장)
  const newTag = parseNewBlockTag_(text);
  if (newTag.allBlocked) out.allBlocked = true;
  newTag.labs.forEach(l  => { if (out.labs.indexOf(l)  === -1) out.labs.push(l);  });
  newTag.times.forEach(t => { if (out.times.indexOf(t) === -1) out.times.push(t); });

  // [2] 기존 태그 호환
  if (upper.indexOf('[BLOCK]') !== -1 || text.indexOf('[전체불가]') !== -1) {
    out.allBlocked = true;
  }

  const labRegex = /\[lab:([^\]]+)\]/ig;
  let m;
  while ((m = labRegex.exec(text)) !== null) {
    const raw = m[1].trim();
    // 별칭·대소문자·공백 차이를 정식 이름으로 정규화 (인식 실패 시 원본 사용 — 하위 호환)
    const norm = normalizeLabName_(raw) || raw;
    if (norm && out.labs.indexOf(norm) === -1) {
      out.labs.push(norm);
    }
  }

  const timeRegex = /\[time:([^\]]+)\]/ig;
  while ((m = timeRegex.exec(text)) !== null) {
    const slotRaw = m[1].trim();
    const slot = normalizeSlot_(slotRaw);
    if (slot && out.times.indexOf(slot) === -1) {
      out.times.push(slot);
    }
  }

  // [v3.58 / 7-3] (구) [4] 단순 키워드 하위 호환 규칙 제거.
  //   실험실 이름이 "언급만" 되어도 종일 차단, 제목에 'ET'가 포함된 영단어
  //   (예: "Meeting")만 있어도 ET 전체 차단되던 과잉 인식 문제.
  //   → 이제 차단으로 인식되려면 [차단] 태그(권장) 또는
  //     차단·불가·신청불가 단어가 반드시 함께 있어야 함 (아래 matchBlockByWords_).

  const nat = matchBlockByWords_(text);
  if (nat.allBlocked) {
    out.allBlocked = true;
  }
  (nat.labs || []).forEach(l => {
    const norm = normalizeLabName_(l) || l;
    if (out.labs.indexOf(norm) === -1) {
      out.labs.push(norm);
    }
  });
  (nat.times || []).forEach(t => {
    const norm = normalizeSlot_(t);
    if (norm && out.times.indexOf(norm) === -1) {
      out.times.push(norm);
    }
  });

  return out;
}

/**
 * ✅ 주어진 날짜(YYYY-MM-DD)에 대해 구글 캘린더에서 1일치만 읽어와서
 *    차단 정보로 변환한다.
 * @param {string}  dateStr  YYYY-MM-DD
 * @param {boolean} [force]  true면 캐시를 건너뛰고 캘린더 직접 조회
 *                           (submit 시점에서 관리자의 긴급 차단을 즉시 반영하기 위함)
 */
function getCalendarBlocks(dateStr, force) {
  if (!dateStr) {
    return { allBlocked: false, blockedLabs: [], blockedTimes: [], perLabTimes: {}, message: '' };
  }

  const cache = CacheService.getScriptCache();
  const cacheKey = 'cal-block:' + dateStr;
  if (!force) {
    const cached = cache.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }
  }

  const d = new Date(dateStr);
  if (isNaN(d.getTime())) {
    return { allBlocked: false, blockedLabs: [], blockedTimes: [], perLabTimes: {}, message: '' };
  }

  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0);
  const end   = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59);

  let events = [];
  if (LAB_CALENDAR_ID) {
    const cal = CalendarApp.getCalendarById(LAB_CALENDAR_ID);
    if (cal) {
      events = cal.getEvents(start, end);
    }
  }

  let allBlocked = false;
  const blockedLabs = new Set();
  const blockedTimes = new Set();
  const perLabTimes = {};
  const messages = [];

  events.forEach(ev => {
    const parsed = parseCalendarEventForBlocks_(ev.getTitle(), ev.getDescription());

    if (parsed.allBlocked) {
      allBlocked = true;
    }

    if ((parsed.labs || []).length > 0 && (parsed.times || []).length === 0) {
      (parsed.labs || []).forEach(l => blockedLabs.add(l));
    }

    if ((parsed.labs || []).length === 0 && (parsed.times || []).length > 0) {
      (parsed.times || []).forEach(t => {
        const norm = normalizeSlot_(t);
        if (norm) blockedTimes.add(norm);
      });
    }

    if ((parsed.labs || []).length > 0 && (parsed.times || []).length > 0) {
      (parsed.labs || []).forEach(labName => {
        const labKey = labName.trim();
        if (!perLabTimes[labKey]) {
          perLabTimes[labKey] = new Set();
        }
        (parsed.times || []).forEach(t => {
          const norm = normalizeSlot_(t);
          if (norm) perLabTimes[labKey].add(norm);
        });
      });
    }

    const fullMsg = (ev.getTitle() || '') + (ev.getDescription() ? ' / ' + ev.getDescription() : '');
    messages.push(fullMsg);
  });

  const perLabTimesObj = {};
  Object.keys(perLabTimes).forEach(lab => {
    perLabTimesObj[lab] = Array.from(perLabTimes[lab]);
  });

  const result = {
    allBlocked: allBlocked,
    blockedLabs: Array.from(blockedLabs),
    blockedTimes: Array.from(blockedTimes),
    perLabTimes: perLabTimesObj,
    message: messages.join(', ')
  };

  cache.put(cacheKey, JSON.stringify(result), 30);
  return result;
}

/**
 * ✅ (신규) 한 달치 캘린더 차단 정보를 한 번에 반환.
 * 캘린더 위젯이 월별로 셀을 색칠할 때 사용. 5분 캐싱.
 *
 * @param {string} yearMonth 'YYYY-MM' (예: '2026-05')
 * @returns {Object<string, {allBlocked:boolean, blockedLabs:string[], blockedTimes:string[],
 *                            perLabTimes:Object<string,string[]>, message:string}>}
 *   - 키: 'YYYY-MM-DD'
 *   - 차단 정보가 없는 날은 키 자체가 없음 (클라이언트에서 사용 가능으로 처리)
 *   - 주말은 클라이언트 측에서 별도 표시 (요일 계산이 클라이언트에서 즉시 가능)
 */
function getMonthAvailability(yearMonth) {
  if (!yearMonth || !/^\d{4}-\d{2}$/.test(String(yearMonth || ''))) {
    return {};
  }

  const cache = CacheService.getScriptCache();
  const cacheKey = 'cal-month:' + yearMonth;
  const cached = cache.get(cacheKey);
  if (cached) {
    try { return JSON.parse(cached); } catch (_) { /* 파싱 실패 시 재조회 */ }
  }

  const parts = yearMonth.split('-');
  const y = parseInt(parts[0], 10);
  const mon = parseInt(parts[1], 10);
  if (!y || !mon || mon < 1 || mon > 12) return {};

  const start = new Date(y, mon - 1, 1, 0, 0, 0);
  const end   = new Date(y, mon, 0, 23, 59, 59); // mon 의 마지막 일

  let events = [];
  if (LAB_CALENDAR_ID) {
    const cal = CalendarApp.getCalendarById(LAB_CALENDAR_ID);
    if (cal) {
      events = cal.getEvents(start, end);
    }
  }

  const tz = Session.getScriptTimeZone();
  const result = {};

  events.forEach(function(ev) {
    const parsed = parseCalendarEventForBlocks_(ev.getTitle(), ev.getDescription());

    // 이벤트가 걸친 모든 날짜를 순회 (다일 이벤트 대응)
    const evStart = ev.getStartTime();
    const evEnd   = ev.getEndTime();
    const dStart = new Date(evStart.getFullYear(), evStart.getMonth(), evStart.getDate());
    const dEnd   = new Date(evEnd.getFullYear(),   evEnd.getMonth(),   evEnd.getDate());
    // 종일 이벤트는 종료가 다음 날 0시인 경우가 있어 1일 뒤로 가면 안 됨 → dEnd 그대로 사용

    const cur = new Date(dStart);
    while (cur.getTime() <= dEnd.getTime()) {
      const ymd = Utilities.formatDate(cur, tz, 'yyyy-MM-dd');
      // 해당 월 범위만 누적 (앞달·다음달은 별도 호출에서 처리)
      const ymdMonth = ymd.substring(0, 7);
      if (ymdMonth === yearMonth) {
        if (!result[ymd]) {
          result[ymd] = {
            allBlocked: false,
            blockedLabs: [],
            blockedTimes: [],
            perLabTimes: {},
            messages: []
          };
        }
        const slot = result[ymd];
        if (parsed.allBlocked) slot.allBlocked = true;

        if ((parsed.labs || []).length > 0 && (parsed.times || []).length === 0) {
          (parsed.labs || []).forEach(function(l) {
            if (slot.blockedLabs.indexOf(l) === -1) slot.blockedLabs.push(l);
          });
        }
        if ((parsed.labs || []).length === 0 && (parsed.times || []).length > 0) {
          (parsed.times || []).forEach(function(t) {
            const norm = normalizeSlot_(t);
            if (norm && slot.blockedTimes.indexOf(norm) === -1) slot.blockedTimes.push(norm);
          });
        }
        if ((parsed.labs || []).length > 0 && (parsed.times || []).length > 0) {
          (parsed.labs || []).forEach(function(labName) {
            const labKey = String(labName).trim();
            if (!slot.perLabTimes[labKey]) slot.perLabTimes[labKey] = [];
            (parsed.times || []).forEach(function(t) {
              const norm = normalizeSlot_(t);
              if (norm && slot.perLabTimes[labKey].indexOf(norm) === -1) {
                slot.perLabTimes[labKey].push(norm);
              }
            });
          });
        }

        const fullMsg = (ev.getTitle() || '') + (ev.getDescription() ? ' / ' + ev.getDescription() : '');
        slot.messages.push(fullMsg);
      }
      cur.setDate(cur.getDate() + 1);
    }
  });

  // messages 배열을 message 문자열로 정리 (getCalendarBlocks 반환값과 형태 통일)
  Object.keys(result).forEach(function(ymd) {
    result[ymd].message = (result[ymd].messages || []).join(', ');
    delete result[ymd].messages;
  });

  try { cache.put(cacheKey, JSON.stringify(result), 300); } catch (_) { /* 캐시 실패 무시 */ }
  return result;
}

/**
 * ✅ 클라이언트가 날짜를 선택했을 때 비활성화할 실험실/시간 목록
 * @param {string}  dateStr
 * @param {boolean} [force]  true면 캘린더 캐시 무시하고 최신 상태 조회
 */
function getUnavailableForDate(dateStr, force) {
  const cal = getCalendarBlocks(dateStr, !!force);

  const unavailableLabs  = new Set(cal.blockedLabs || []);
  const unavailableTimes = new Set((cal.blockedTimes || []).map(normalizeSlot_));

  if (dateStr) {
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) {
      const dow = d.getDay();
      if (dow === 0 || dow === 6) {
        unavailableTimes.add('ET');
        unavailableTimes.add('EP1');
      }
    }
  }

  if (cal.allBlocked) {
    ['ET', 'EP1', '7교시'].forEach(s => unavailableTimes.add(s));
  }

  const result = {
    allBlocked: !!cal.allBlocked,
    blockedLabs: Array.from(unavailableLabs),
    blockedTimes: Array.from(unavailableTimes),
    perLabTimes: cal.perLabTimes || {},
    blockedTimesByLab: cal.perLabTimes || {},
    notice: cal.message || '',
    noticeForLab: {},
    message: cal.message || ''
  };

  return result;
}

/**
 * [임시 진단] 6/15 한 번에 실행용 — 함수 드롭다운에서 선택 후 ▶ 실행. 진단 끝나면 제거.
 */
function 진단_6월15일_차단() { return previewCalendarBlocks('2026-06-15'); }

/**
 * [v3.57] 관리자용 — 특정 날짜의 캘린더 차단 이벤트가 어떻게 해석되는지 미리보기.
 *   차단 등록 후 의도대로 됐는지 확인하는 운영 도구. (관리자 계정만)
 *   GAS 편집기에서 previewCalendarBlocks('2026-06-09') 형태로 실행하거나,
 *   관리자 페이지에서 호출.
 * @param {string} dateStr 'YYYY-MM-DD'
 * @returns {string} 사람이 읽을 수 있는 진단 요약
 */
function previewCalendarBlocks(dateStr) {
  const sessionEmail = getSessionEmail_();
  if (!isAdminEmail_(sessionEmail) && !getSessionTeacher_()) {
    throw new Error('차단 미리보기 권한이 없습니다. 교사/관리자 계정으로 실행하세요.');
  }
  const ds = String(dateStr || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ds)) {
    return '⚠️ 날짜 형식: previewCalendarBlocks("2026-06-09")';
  }

  const d = new Date(ds);
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0);
  const end   = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59);

  let events = [];
  if (LAB_CALENDAR_ID) {
    const cal = CalendarApp.getCalendarById(LAB_CALENDAR_ID);
    if (cal) events = cal.getEvents(start, end);
  }

  const lines = ['📅 ' + ds + ' 캘린더 차단 미리보기', '캘린더 이벤트 ' + events.length + '건', ''];
  events.forEach((ev, i) => {
    const title = ev.getTitle() || '';
    const desc = ev.getDescription() || '';
    const parsed = parseCalendarEventForBlocks_(title, desc);
    lines.push((i + 1) + '. "' + title + '"' + (desc ? ' / ' + desc : ''));
    lines.push('   → 전체차단: ' + (parsed.allBlocked ? 'YES ⚠️' : 'no'));
    lines.push('   → 차단 실험실: ' + ((parsed.labs || []).join(', ') || '(없음)'));
    lines.push('   → 차단 시간: ' + ((parsed.times || []).join(', ') || '(없음)'));
    lines.push('');
  });

  const finalResult = getCalendarBlocks(ds, true); // 캐시 무시 최신
  lines.push('──────── 최종 적용 결과 ────────');
  lines.push('전체차단: ' + (finalResult.allBlocked ? 'YES ⚠️ (모든 실험실/층 차단됨)' : 'no'));
  lines.push('차단 실험실: ' + ((finalResult.blockedLabs || []).join(', ') || '(없음)'));
  lines.push('차단 시간: ' + ((finalResult.blockedTimes || []).join(', ') || '(없음)'));

  const msg = lines.join('\n');
  Logger.log(msg);
  return msg;
}


/* ------------------------- ✅ 시약명/폐기분류/분류1 정규화 유틸 ------------------------- */
function normalizeChemName_(name) {
  if (!name) return '';
  let s = String(name).normalize('NFC').toLowerCase();
  s = s.replace(/（/g,'(').replace(/）/g,')').replace(/［/g,'[').replace(/］/g,']');
  s = s.replace(/\(.*?\)|\[.*?\]|\{.*?\}/g, '');
  s = s.replace(/\b수용액\b|\bsolution\b/gi, '');
  s = s.replace(/\s+/g, '');
  s = s.replace(/[^\w가-힣·]/g, '');
  return s.trim();
}
function canonDisposal_(val) {
  if (!val) return '';
  const s = String(val).trim().toLowerCase();
  const map = new Map([
    ['유기','유기'], ['organic','유기'], ['organics','유기'],
    ['무기','무기'], ['inorganic','무기'],
    ['산','산'],     ['acid','산'],     ['acids','산'], ['산성','산'],
    ['염기','염기'], ['base','염기'],   ['bases','염기'], ['alkali','염기'], ['alkaline','염기'],
    ['기타','기타'], ['etc','기타'],    ['other','기타']
  ]);
  if (map.has(s)) return map.get(s);
  if (/염기/.test(s) || /\bbase\b|\balkali/.test(s)) return '염기';
  if (/무기/.test(s) || /\binorganic/.test(s)) return '무기';
  if (/유기/.test(s) || /\borganic/.test(s)) return '유기';
  if (/^산$/.test(s) || /\bacid/.test(s)) return '산';
  if (/기타/.test(s) || /\bother\b|\betc\b/.test(s)) return '기타';
  try { console.log('[canonDisposal_ unmapped]', val); } catch(_){}
  return '';
}

/* ----------------------- ✅ 시약 카테고리 추론 (시트 탭명 + 분류1 + 이름) ----------------------- */
function inferCategory_(sheet, class1, name) {
  const sn = String(sheet || '');
  const c1 = String(class1 || '').toLowerCase();
  const nm = String(name || '');
  // 1) 시트 탭명 우선
  if (/지시약/.test(sn)) return '지시약';
  if (/^\s*균/.test(sn) || /\b균\b/.test(sn)) return '균';
  if (/효소|항체/.test(sn)) return '효소';
  // 2) 농도 불필요 액체 화이트리스트
  if (/distilled\s*water|deionized|증류수|멸균수|미네랄오일|mineral\s*oil|di\s*water/i.test(nm)) return '액체-용매';
  // 3) 분류1 기반
  if (/고체|분말|결정|powder|pellet/i.test(c1)) return '고체';
  if (/생물|배지|균주/i.test(c1)) return '생물';
  if (/기체|gas/i.test(c1)) return '기체';
  if (/액체|solution|용액/i.test(c1)) return '액체';
  return c1 || '';
}

/**
 * 시약 마스터를 '한 번만' 순회하여 {class1Map, disposalMap}을 빌드.
 * 5분 캐싱. 관리대장 수정 후 즉시 반영이 필요하면
 * invalidateChemMasterCache()를 GAS 편집기에서 실행.
 */
function getChemMasterMaps_() {
  const cache = CacheService.getScriptCache();
  const CK = 'chem-master:v1';
  const hit = cache.get(CK);
  if (hit) {
    try {
      const parsed = JSON.parse(hit);
      if (parsed && parsed.class1Map && parsed.disposalMap) return parsed;
    } catch (_) { /* 파싱 실패 시 재조회 */ }
  }

  const ss = SpreadsheetApp.openById(CHEM_MASTER_SSID);
  const class1Map = Object.create(null);
  const disposalMap = Object.create(null);
  const infoMap = Object.create(null);

  ss.getSheets().forEach(s => {
    const sheetName = s.getName();
    const vals = s.getDataRange().getValues();
    if (vals.length < 3) return;
    const hdr = vals[1].map(v => String(v || '').trim());
    const nameIdx = hdr.indexOf('물질명');

    let c1Idx = hdr.indexOf('분류1');
    if (c1Idx === -1) c1Idx = hdr.indexOf('분류 1');
    if (c1Idx === -1) c1Idx = hdr.indexOf('상태');

    const dispIdx = hdr.indexOf('폐수 처리 분류');

    // 물질명 자체가 없으면 스킵
    if (nameIdx === -1) return;

    vals.slice(2).forEach(r => {
      const nmRaw = String(r[nameIdx] || '').trim();
      const key = normalizeChemName_(nmRaw);
      if (!key) return;

      if (c1Idx !== -1) {
        const c1Raw = String(r[c1Idx] || '').trim();
        if (c1Raw) class1Map[key] = c1Raw;
      }
      if (dispIdx !== -1) {
        const dpRaw = String(r[dispIdx] || '').trim();
        const dp = canonDisposal_(dpRaw);
        if (dp) disposalMap[key] = dp;
      }
      // ✅ infoMap (시트탭명·카테고리 보존; 마지막 시트 값으로 덮어쓰기)
      const c1ForInfo = (c1Idx !== -1) ? String(r[c1Idx] || '').trim() : '';
      const dpForInfo = (dispIdx !== -1) ? canonDisposal_(String(r[dispIdx] || '').trim()) : '';
      infoMap[key] = {
        name: nmRaw,
        sheet: sheetName,
        class1: c1ForInfo,
        disposal: dpForInfo,
        category: inferCategory_(sheetName, c1ForInfo, nmRaw)
      };
    });
  });

  const result = { class1Map, disposalMap, infoMap };
  // [정책] 마스터 시트 운영 갱신 후 즉각 반영을 위해 60초 단축
  try { cache.put(CK, JSON.stringify(result), 60); } catch (_) { /* 캐시 실패 무시 */ }
  return result;
}

/** ✅ 관리대장 (물질명 → 분류1) 매핑 — 캐시 경유 */
function getClass1Map_() {
  return getChemMasterMaps_().class1Map;
}

/* ------------------------- ✅ 시약 폐기 분류 검증 ------------------------- */
function getDisposalMap_() {
  return getChemMasterMaps_().disposalMap;
}

/** 관리대장 변경 후 즉시 반영하고 싶을 때 GAS 편집기에서 수동 실행 */
function invalidateChemMasterCache() {
  CacheService.getScriptCache().remove('chem-master:v1');
  return '시약 마스터 캐시를 비웠습니다.';
}
/** ✅ 시약명으로 마스터 조회 — 클라이언트 lookup용 */
function lookupChemicalByName(name) {
  if (!name) return null;
  // [SEC] 사용자별 분당 30회 rate limit (봇/스크립트 폭주 차단)
  try {
    const _email = (Session.getActiveUser().getEmail() || '').trim();
    if (_email) {
      const _cache = CacheService.getScriptCache();
      const _slot = Math.floor(Date.now() / 60000);
      const _k = 'lookup:' + _email + ':' + _slot;
      const _n = parseInt(_cache.get(_k) || '0', 10);
      if (_n >= 30) return null;
      _cache.put(_k, String(_n + 1), 65);
    }
  } catch (_) { /* Session 권한 부족 시 무시 */ }
  const key = normalizeChemName_(name);
  if (!key) return null;
  try {
    const maps = getChemMasterMaps_();
    const info = maps && maps.infoMap ? maps.infoMap[key] : null;
    return info || null;
  } catch (e) { return null; }
}
/* [HOTFIX v3.50] 클라이언트 preCheckChems와 동일한 strict 형식 검증을 서버에서도 적용.
 *   - 클라이언트 검증 버튼이 통과하면 제출도 통과 보장.
 *   - 정규식·고체/액체 판별 로직은 form.html의 preCheckChems 와 동일.
 */
/* [v3.58 / 4-1] 고체/액체 판별 및 농도 정책 — 단일 기준.
 *   기존에는 판별 로직이 클라이언트 2곳 + 서버 1곳에서 서로 달라
 *   증류수·완충용액·지시약·기체류가 "어느 쪽으로 써도 통과 불가"인 데드락이었음.
 *   새 모델: 「단위 유형(고체 g / 액체 mL)」과 「농도 필요 여부」를 분리.
 *     1) 명시적 고체 신호(고체·분말·결정·pellet·powder·시약병) → 고체: g 단위, 농도 금지
 *     2) 농도 면제 액체(지시약·생물·균·효소·배지·기체·용매·증류수·완충액 등) → mL 단위, 농도 선택
 *     3) 그 외 → 일반 액체: mL 단위, 농도 필수
 *   ⚠️ form.html의 classifyChem()과 반드시 동일하게 유지할 것.
 */
const _VC_RE_CONC_OK = /^\s*\d+(?:\.\d+)?\s*(?:[~\-]\s*\d+(?:\.\d+)?\s*)?(?:m|mm|μm|um|nm|%|n|mol\/l|mg\/ml|μg\/ml|ug\/ml|g\/l|mg\/l|g\/ml|w\/v|w\/w|v\/v|ppm|ppb|x|배)\s*$/i;
const _VC_RE_VOL_LIQUID = /^\s*(?:약\s*)?\d+(?:\.\d+)?\s*(?:[~\-]\s*\d+(?:\.\d+)?\s*)?(?:ml|l|cc|μl|ul|방울)\s*$/i;
const _VC_RE_VOL_SOLID  = /^\s*(?:약\s*)?\d+(?:\.\d+)?\s*(?:[~\-]\s*\d+(?:\.\d+)?\s*)?(?:mg|g|kg)\s*$/i;
const _VC_RE_SOLID_HINT = /고체|분말|시약병|결정|pellet|powder/i;
const _VC_RE_CONC_EXEMPT = /지시약|생물|배지|효소|기체|gas\b|용매|증류수|멸균수|정제수|distilled|deionized|di\s*water|mineral\s*oil|완충|buffer|페놀프탈레인|phenolphthalein|btb|bromothymol|메틸\s*오렌지|methyl\s*orange|메틸렌\s*블루|methylene\s*blue|페놀\s*레드|phenol\s*red|리트머스|litmus|인디고카민|베네딕트|benedict/i;
const _VC_RE_EXEMPT_CAT = /^(균|효소|생물|기체|지시약|액체-용매)$/;

/**
 * 시약 1건의 검증 정책 결정.
 * @returns {{unit:'solid'|'liquid', conc:'forbidden'|'optional'|'required'}}
 */
function classifyChemForValidation_(state, name, category) {
  const s = String(state || ''), n = String(name || ''), c = String(category || '').trim();
  // 1) 명시적 고체 신호 우선
  if (_VC_RE_SOLID_HINT.test(s) || _VC_RE_SOLID_HINT.test(c) || _VC_RE_SOLID_HINT.test(n)) {
    return { unit: 'solid', conc: 'forbidden' };
  }
  // 2) 농도 면제 액체
  if (_VC_RE_EXEMPT_CAT.test(c) || _VC_RE_CONC_EXEMPT.test(c) ||
      _VC_RE_CONC_EXEMPT.test(n) || _VC_RE_CONC_EXEMPT.test(s)) {
    return { unit: 'liquid', conc: 'optional' };
  }
  // 3) [2026-08-19] 상태·분류를 모두 알 수 없는 시약(마스터에 없어 학생이 수기 입력)
  //    → 액체로 단정하지 않음(단위 자유·농도 선택). 기존엔 고체를 'g'으로 적으면
  //      단위 오류와 농도 필수가 동시에 걸려 통과 불가능한 데드락이었음.
  //    ※ 화면 form.html classifyChem과 반드시 동일하게 유지.
  if (!s && !c) return { unit: 'any', conc: 'optional' };
  // 4) 일반 액체
  return { unit: 'liquid', conc: 'required' };
}

/** (하위 호환 — 기존 호출부용. 새 코드는 classifyChemForValidation_ 사용) */
function _vcIsSolidLike_(state, name, category) {
  return classifyChemForValidation_(state, name, category).unit === 'solid';
}

function validateChemicals(chems) {
  const dispMap = getDisposalMap_();
  const mismatches = [];
  // [SEC] 클라이언트 우회 차단을 위해 서버측에서도 필수값 룰 재적용
  (chems || []).forEach(c => {
    const nameRaw = String((c && (c.name || c['시약명'] || c['물질명'])) || '').trim();
    if (!nameRaw) {
      mismatches.push({ name: '(이름 누락)', expected: '시약명 필수', got: '' });
      return;
    }
    const volRaw   = String((c && (c.vol || c['용량'] || c['사용량'])) || '').trim();
    const msdsRaw  = String((c && (c.msds || c['MSDS'] || c['MSDS 및 취급 주의사항'])) || '').trim();
    const concRaw  = String((c && (c.conc || c['농도'])) || '').trim();
    const stateRaw = String((c && (c.state || c['상태'])) || '').trim();
    const catRaw   = String((c && (c.category || c['분류1'])) || '').trim();

    // [v3.58 / 4-1] 단일 분류 기준으로 사용량·농도 검증
    const cls = classifyChemForValidation_(stateRaw, nameRaw, catRaw);

    // 사용량 필수 + 단위 형식 검증
    if (!volRaw) {
      mismatches.push({ name: nameRaw, expected: '사용량 필수', got: '' });
    } else {
      const okFmt = (cls.unit === 'solid') ? _VC_RE_VOL_SOLID.test(volRaw)
                  : (cls.unit === 'any')   ? (_VC_RE_VOL_SOLID.test(volRaw) || _VC_RE_VOL_LIQUID.test(volRaw))
                  :                          _VC_RE_VOL_LIQUID.test(volRaw);
      if (!okFmt) {
        mismatches.push({
          name: nameRaw,
          expected: '사용량 형식 (' + (cls.unit === 'solid' ? 'mg/g/kg — 예: 5g'
                        : cls.unit === 'any' ? '예: 100mL 또는 5g'
                        : 'mL/L/cc/μL/방울 — 예: 100mL, 3방울') + ')',
          got: volRaw
        });
      }
    }

    // MSDS 필수 + 최소 2자
    if (!msdsRaw || msdsRaw.length < 2) {
      mismatches.push({ name: nameRaw, expected: 'MSDS 필수', got: msdsRaw || '' });
    }

    // 농도: 고체는 입력 금지 / 면제 대상은 자유 / 일반 액체는 필수 + 형식
    if (cls.conc === 'forbidden') {
      if (concRaw) {
        mismatches.push({ name: nameRaw, expected: '고체는 농도 입력 금지 (비워 두세요)', got: concRaw });
      }
    } else if (cls.conc === 'required') {
      if (!concRaw) {
        mismatches.push({ name: nameRaw, expected: '액체는 농도 필수 (예: 0.1M, 5%)', got: '' });
      } else if (!_VC_RE_CONC_OK.test(concRaw)) {
        mismatches.push({ name: nameRaw, expected: '농도 형식 (예: 0.1M, 5%, 100ppm, 2g/L)', got: concRaw });
      }
    }
    // cls.conc === 'optional' (증류수·완충용액·지시약·생물·기체 등): 농도 검사 생략

    // 폐기 방법: 필수 + 마스터 정규화 비교
    const gotRaw = String((c && (c.disposal || c['폐기 방법'] || c['폐수처리'] || c['폐기'])) || '').trim();
    if (!gotRaw) {
      mismatches.push({ name: nameRaw, expected: '폐기 방법 필수', got: '' });
      return;
    }
    const key = normalizeChemName_(nameRaw);
    const got = canonDisposal_(gotRaw);
    const expected = dispMap[key] || '';
    // [정책 변경] 시약 대장에 폐수 분류가 비어있는 시약은 학생 입력을 그대로 인정.
    if (expected && expected !== got) {
      mismatches.push({ name: nameRaw, expected: expected, got: gotRaw });
    }
  });
  return { ok: mismatches.length === 0, mismatches };
}
/** ✅ 버튼 호출 전용(스로틀) */
function validateChemicalsThrottled(cacheKey, chems) {
  return validateChemicalsWithThrottle(cacheKey, chems);
}
function validateChemicalsWithThrottle(key, chems) {
  // [v3.58 / 4-3] 실패해도 mismatches를 반환 (throttle:false) — 기존엔 실패 시
  //   throttle:true로 반환해 클라이언트가 실패 상세를 영영 표시하지 못했음.
  //   재검증 잠금은 30초 → 10초로 단축 (연타 방지 목적만 유지).
  const cache = CacheService.getScriptCache();
  const ck = 'chem-validate:' + String(key || 'unknown');
  const locked = cache.get(ck);
  if (locked) {
    return { ok: false, mismatches: [], throttle: true, retryAfterSec: 10 };
  }
  const res = validateChemicals(chems);
  if (!res.ok) {
    cache.put(ck, '1', 10);
    return { ok: false, mismatches: res.mismatches, throttle: false, retryAfterSec: 10 };
  }
  return { ok: true, mismatches: [], throttle: false, retryAfterSec: 0 };
}

/* ------------------------- 신청 제출 ------------------------- */
function submitApplication(data) {
  // [v3.58 / 7-8] 전역 락은 검증·시트 기록까지만 잡고, 메일·챗 알림은 락 해제 후 발송.
  //   기존엔 메일 2~3통+챗 발송까지 락 안에서 실행되어 제출이 몰리면
  //   "서버가 바쁩니다" 연쇄가 발생했음 (제출 1건당 락 점유 수 초 → 이제 1초 내외).
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) throw new Error('서버가 바쁩니다. 잠시 후 다시 시도해주세요.');
  let ctx;
  try {
    ctx = submitApplication_(data);
  } finally { lock.releaseLock(); }
  return finishSubmission_(ctx);
}
/**
 * [SEC] 시트 셀 수식 인젝션 방어 — `=`, `+`, `-`, `@`, 탭/캐리지로 시작하는
 * 학생 자유 입력은 GAS Sheet에서 수식으로 해석되므로 앞에 single-quote(`'`)를 prefix.
 * 표시·검색에는 영향 없음 (Sheet UI에서 텍스트 강제).
 */
function sanitizeForSheet_(v) {
  if (typeof v !== 'string') return v;
  return /^[=+\-@\t\r]/.test(v) ? "'" + v : v;
}

function submitApplication_(data) {
  // ===== ★ SEC-P4: 종합 가드 (학번 강제, rate limit, honeypot, form-token, payload 크기) =====
  if (!data || typeof data !== 'object') {
    throw new Error('요청 데이터가 비어있습니다. 다시 시도해 주세요.');
  }

  // (1) Honeypot — 봇은 모든 필드를 채움. 사람 눈에 안 보이는 _hp_field가 채워져 있으면 거부.
  if (data._hp_field && String(data._hp_field).trim() !== '') {
    _logAccessAttempt_('submitApplication', getSessionEmail_(), '', 'deny', 'honeypot triggered');
    _recordSuspicious_(getSessionEmail_(), 3, 'honeypot triggered'); // 브라우저 자동완성 오탐 가능성 고려 (v3.58)
    throw new Error('비정상 신청이 감지되었습니다.');
  }

  // (2) Payload 크기 상한 (DDoS 방어 — 100KB)
  const _payloadSize = JSON.stringify(data).length;
  if (_payloadSize > 100 * 1024) {
    _logAccessAttempt_('submitApplication', getSessionEmail_(), '', 'deny', 'payload too large: ' + _payloadSize);
    _recordSuspicious_(getSessionEmail_(), 3, 'payload too large: ' + _payloadSize); // ★ 의심
    throw new Error('요청 데이터가 너무 큽니다.');
  }

  // (3) Form-token (페이지 로드 시각) — 5초 미만에 제출하면 매크로로 간주
  const _ts = Number(data._form_ts) || 0;
  const _now = Date.now();
  if (_ts > 0) {
    const _diff = _now - _ts;
    if (_diff < 5000) {
      _logAccessAttempt_('submitApplication', getSessionEmail_(), '', 'deny', 'submitted too fast: ' + _diff + 'ms');
      _recordSuspicious_(getSessionEmail_(), 3, 'submitted too fast: ' + _diff + 'ms'); // (v3.58 완화)
      throw new Error('신청서 작성이 너무 빠릅니다. 매크로·자동화 도구는 차단됩니다.');
    }
    if (_diff > 24 * 60 * 60 * 1000) {
      _logAccessAttempt_('submitApplication', getSessionEmail_(), '', 'deny', 'form token expired: ' + _diff + 'ms');
      throw new Error('신청서를 새로고침한 뒤 다시 작성해 주세요. (세션 만료)');
    }
  }

  // (4) Rate limit — 사용자별 분당 호출 횟수 (봇/DDoS 방어)
  assertCallRateLimit_('submitApplication', 5, 60);   // 분당 최대 5회
  assertCallRateLimit_('submitApplication-h', 30, 3600); // 시간당 최대 30회

  // (5) ★ 학번 강제 덮어쓰기 — 클라이언트가 어떤 학번을 보내든 무시하고 세션 이메일에서 추출
  //     학생: 본인 학번만 사용. 교사/관리자: 클라이언트 값 유지(대리 신청 가능).
  const _sessionSid = getSessionStudentId_();
  if (_sessionSid) {
    // 학생 세션 — data.studentId 무시하고 강제 덮어쓰기
    if (String(data.studentId || '').trim() && String(data.studentId).replace(/\D/g, '').padStart(5,'0') !== _sessionSid) {
      _logAccessAttempt_('submitApplication', getSessionEmail_(), String(data.studentId || ''), 'deny', '학번 스푸핑 시도');
      _recordSuspicious_(getSessionEmail_(), 3, '학번 스푸핑 시도 (입력: ' + data.studentId + ', 세션: ' + _sessionSid + ')'); // 팀원 대리 입력 오해 가능성 고려 (v3.58)
      throw new Error('본인의 학번으로만 신청할 수 있습니다. (입력 학번과 로그인 학번이 다릅니다)');
    }
    data.studentId = _sessionSid; // 강제 덮어쓰기 (안전망)
  } else {
    // 학생 세션이 아니면 교사/관리자만 통과
    assertOwnerOrStaff_(data.studentId, 'submitApplication (non-student)');
  }

  // ===== [C3] 서버측 필수값 검증 (클라이언트 우회 방지) =====
  if (!data || typeof data !== 'object') {
    throw new Error('요청 데이터가 비어있습니다. 다시 시도해 주세요.');
  }
  // [SEC] 자유 텍스트 길이 상한 — 비현실적 입력 거부
  if (Array.isArray(data.chemicals) && data.chemicals.length > 50) {
    throw new Error('시약 항목이 50개를 초과합니다.');
  }
  ['title','materials','process','cleanup','precautions','usagePlan','hazardTool','reqEquipment'].forEach(function(k){
    if (data[k] != null && String(data[k]).length > 5000) {
      throw new Error('"' + k + '" 입력이 5000자를 초과합니다.');
    }
  });
  const _required = {
    '학번': data.studentId,
    '대표자 이름': data.studentName,
    '실험실': data.lab,
    '실험 날짜': data.date,
    '신청 시간': data.timeSlot,
    '실험·실습 주제': data.title,
    '지도교사 이름': data.teacher
  };
  const _missing = Object.keys(_required).filter(k => !String(_required[k] || '').trim());
  if (_missing.length) {
    throw new Error('필수 입력이 누락되었습니다: ' + _missing.join(', '));
  }
  // 학번 형식 (5자리)
  if (!/^\d{5}$/.test(String(data.studentId).trim())) {
    throw new Error('대표자 학번은 5자리 숫자여야 합니다.');
  }
  // [v3.58 / 2-4] 지도교사 이메일 서버 강제 — 이름으로 교사 명단에서 재조회해 덮어씀.
  //   (클라이언트가 임의 이메일을 보내 승인 메일을 다른 사람에게 보내는 것 차단)
  {
    const _resolvedEmail = resolveTeacherEmail_(data.teacher, data.teacherEmail);
    if (!_resolvedEmail) {
      throw new Error('지도교사 "' + String(data.teacher || '') + '" 를 교사 명단에서 찾을 수 없습니다.\n지도교사를 목록에서 다시 선택해 주세요.');
    }
    if (String(data.teacherEmail || '').trim().toLowerCase() !== _resolvedEmail.toLowerCase()) {
      _logAccessAttempt_('submitApplication', getSessionEmail_(), '',
        'allow', '지도교사 이메일 서버 교정: ' + (data.teacherEmail || '(빈값)') + ' → ' + _resolvedEmail);
    }
    data.teacherEmail = _resolvedEmail;
  }
  // 날짜 정규화 및 검증
  const _normDate = normalizeDateYMD_(data.date);
  if (!_normDate || !/^\d{4}-\d{2}-\d{2}$/.test(_normDate)) {
    throw new Error('실험 날짜 형식이 올바르지 않습니다. (YYYY-MM-DD)');
  }
  // ===== [H7] 과거 날짜 금지 =====
  (function(){
    const now = new Date();
    const todayYMD = Utilities.formatDate(now, Session.getScriptTimeZone(), 'yyyy-MM-dd');
    if (_normDate < todayYMD) {
      throw new Error('과거 날짜로는 신청할 수 없습니다. (선택한 날짜: ' + _normDate + ')');
    }
  })();

  // 제출 시점에는 캘린더 캐시(최대 30초)를 건너뛰어 관리자의 긴급 차단을 즉시 반영
  const unavail = getUnavailableForDate(data.date, true);

  const requestedSlots = String(data.timeSlot || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
    .map(normalizeSlot_);

  // ===== [C3] 정규화 후 슬롯이 하나도 없으면 거부 =====
  if (requestedSlots.length === 0) {
    throw new Error('신청 시간(교시)을 하나 이상 선택해 주세요.');
  }

  const is2F        = data.formType === '2F';
  const formCategory = String(data.formCategory || '').trim().toLowerCase();
  const isNewLab    = !!(formCategory && NEW_LAB_CONFIG[formCategory]);
  // (위 3줄: TDZ 방지용 - 사용 위치보다 앞으로 이동) 
  let labName = String(data.lab || '').trim();
  // 신규 양식의 data.lab 은 콤마결합("컴퓨터실, 코딩실")이라 캘린더 [차단] 검사·
  // 시트 '신청실험실' 컬럼 매칭에서 부정확해진다. 대표 룸(첫 번째)으로 normalize 하여
  //   - 캘린더 [차단] 검사가 첫 룸 기준으로 동작 (결함 ③ 보완)
  //   - 시트 '신청실험실' 컬럼이 단일 룸으로 저장되어 관리자 페이지에서 깔끔히 표시 (결함 ⑦)
  // 전체 룸 목록은 별도 컬럼 '사용실험실목록'에 콤마결합으로 보존되므로 정보 손실 없음.
  if (isNewLab && Array.isArray(data.labRooms) && data.labRooms.length) {
    labName = String(data.labRooms[0]).trim();
  }

  // [2026-08-19] 신규 양식: 신청 실습실 허용목록 검증 (서버측).
  //   기존엔 cfg.rooms가 '이름→카테고리' 매핑에만 쓰이고 검증에는 쓰이지 않아,
  //   화면에서 체크박스를 지워도 조작된 요청으로는 접수될 수 있었다.
  //   (멀티미디어실 접수 중단처럼 운영상 실을 닫을 때 실효성이 생김)
  //   [2026-08] labRooms 가 비었을 때 검증이 통째로 건너뛰던 구멍을 막는다.
  //   (조작된 요청이 labRooms 를 빼면 허용목록 검사 자체가 실행되지 않았음)
  if (isNewLab) {
    const _allowed = (NEW_LAB_CONFIG[formCategory] && NEW_LAB_CONFIG[formCategory].rooms) || [];
    const _rooms = (Array.isArray(data.labRooms) ? data.labRooms : [])
      .map(r => String(r || '').trim())
      .filter(Boolean);
    if (!_rooms.length) {
      throw new Error('사용할 실습실을 하나 이상 선택해 주세요.');
    }
    const _bad = _rooms.filter(r => _allowed.indexOf(r) === -1);
    if (_bad.length) {
      throw new Error('현재 신청할 수 없는 실습실이 포함되어 있습니다: ' + _bad.join(', ') +
        '\n신청 가능한 실습실: ' + (_allowed.join(', ') || '(없음)'));
    }
  }

  // ===== ✅ [2026-08] 지도교사 자격 서버 검증 =====
  //   기존엔 "어떤 과목 교사가 어떤 실습실을 지도할 수 있는가"를 각 폼 HTML 의
  //   드롭다운 필터만 판단했다. 즉 클라이언트가 유일한 관문이었고, 조작된 요청이나
  //   옛 목록이 캐시된 폼에서는 자격 없는 교사가 승인자로 지정될 수 있었다.
  //   이제 LAB_APPROVAL_POLICY_ 를 서버가 다시 대조한다.
  //   ※ 1·2층 경로도 여기서 함께 검사되므로, 목록에 없는 실험실 이름이 들어오면
  //     (기존에는 무검증 통과) 정책 미등록으로 거부된다.
  {
    const _policyRooms = (isNewLab && Array.isArray(data.labRooms) && data.labRooms.length)
      ? data.labRooms.map(r => String(r || '').trim()).filter(Boolean)
      : [labName];
    assertTeacherEligible_(data.teacher, _policyRooms, data.purpose);
  }

  // ===== [H8] 시약 배열 크기 제한 =====
  const _MAX_CHEMS = 50;
  if (Array.isArray(data.chemicals) && data.chemicals.length > _MAX_CHEMS) {
    throw new Error('시약 수가 한도를 초과했습니다. (최대 ' + _MAX_CHEMS + '개)');
  }

  if (unavail.allBlocked) {
    throw new Error('해당 일자는 캘린더에서 전체 사용 불가로 지정되어 있습니다.\n(사유: ' + (unavail.message || '캘린더 차단') + ')');
  }

  // [v3.58 / 5-7] 신규 양식 복수 선택 시 첫 번째 실만 검사하던 것을 선택한 실 전부로 확장
  const roomsToCheck = (isNewLab && Array.isArray(data.labRooms) && data.labRooms.length)
    ? data.labRooms.map(r => String(r).trim()).filter(Boolean)
    : [labName];
  const blockedRooms = roomsToCheck.filter(r => (unavail.blockedLabs || []).includes(r));
  const globalBlockedTimes = unavail.blockedTimes || [];
  const blockedByTimeGlobal = requestedSlots.filter(s => globalBlockedTimes.includes(s));
  const perLabConflicts = [];
  roomsToCheck.forEach(r => {
    const perLab = (unavail.perLabTimes && unavail.perLabTimes[r]) ? unavail.perLabTimes[r].map(normalizeSlot_) : [];
    const hit = requestedSlots.filter(s => perLab.includes(s));
    if (hit.length) perLabConflicts.push(r + ': ' + hit.join(', '));
  });

  if (blockedRooms.length > 0 || blockedByTimeGlobal.length > 0 || perLabConflicts.length > 0) {
    let msg = '해당 일자에는 신청할 수 없습니다.\n\n';
    if (blockedRooms.length > 0) {
      msg += `• 실험실 차단: ${blockedRooms.join(', ')}\n`;
    }
    if (blockedByTimeGlobal.length > 0) {
      msg += `• 시간 차단(전체): ${blockedByTimeGlobal.join(', ')}\n`;
    }
    if (perLabConflicts.length > 0) {
      msg += `• 시간 차단(실별): ${perLabConflicts.join(' / ')}\n`;
    }
    msg += '\n(캘린더/주말 기준으로 사용 불가입니다.)';
    throw new Error(msg);
  }

  const restrictedIds = getRestrictedList();
  const fiveTokens = s => (String(s || '').match(/\b(\d{5})\b/g) || []);
  const repBlocked   = fiveTokens(data.studentId).some(tok => restrictedIds.includes(tok));
  const teamBlocked  = fiveTokens(data.teamMembers).some(tok => restrictedIds.includes(tok));
  const hasRestricted = (repBlocked || teamBlocked);

  const seventhValid = isSeventhCheckedAndValid_(data);
  if (hasRestricted && !seventhValid) {
    throw new Error(
      '과학 실험·실습실 사용 신청이 불가능한 학생의 정보가 포함되어 있습니다.\n' +
      '과학 실험·실습실 사용 신청하려면 해당 정보를 수정 혹은 삭제한 뒤 다시 신청해주세요.\n' +
      '문의 사항은 과학기술과 학과사무실에 문의하세요.\n' +
      '\n※ 단, 7교시에는 신청이 가능합니다.'
    );
  }

  // [v3.58 / 7-6] 동반자명단 ↔ 총인원수 일치 검사.
  //   기존엔 명단 없이 "37명"처럼 인원만 적으면 통과 → 제한명단 대조 자체가
  //   불가능한 사각지대였음. 총인원 2명 이상이면 명단(학번 5자리 포함)이 인원수와 맞아야 함.
  {
    const _total = parseInt(String(data.totalParticipants || '').replace(/\D/g, ''), 10);
    if (_total >= 2) {
      const _teamIds = new Set(fiveTokens(data.teamMembers));
      _teamIds.add(String(data.studentId || '').trim()); // 대표자 포함 (명단에 본인을 쓴 경우 중복 제거)
      const _found = _teamIds.size;
      if (_found < _total) {
        throw new Error(
          '총인원수(' + _total + '명)에 비해 동반자명단에서 확인된 인원이 ' + _found + '명뿐입니다.\n' +
          '동반자명단에 대표자를 제외한 모든 팀원을 "학번(5자리) 이름" 형식으로 적어 주세요.\n' +
          '예: 30101 김철수, 30102 이영희'
        );
      }
    }
  }

  const labNameRaw = labName;
  if (['첨단기기실험실', '첨단기기 연구실', '첨단기기실', '첨단기기'].includes(labNameRaw)) {
    data.advancedLab = '예';
  }


  // 신규 양식(IT/가정/공학)은 시약 처리가 없으므로 항상 빈 배열로 강제
  const chemsArray = (is2F || isNewLab) ? [] : (Array.isArray(data.chemicals) ? data.chemicals : []);
  let class1Map = {};

  if (!is2F && !isNewLab && chemsArray.length > 0) {
    class1Map = getClass1Map_();
    const missing = [];

    const toValidate = chemsArray.map(c => {
      const name = String(
        c['시약명'] ||
        c['물질명'] ||
        c.name ||
        ''
      ).trim();

      const disposal = String(
        c['폐기 방법'] ||
        c['폐수처리'] ||
        c['폐기'] ||
        c.disposal ||
        ''
      ).trim();

      const guidance = String(
        c['교사임장여부'] ||
        c['교사 임장 여부'] ||
        c.guidance ||
        ''
      ).trim();

      const clientState = String(c['상태'] || c['분류1'] || '').trim();

      let finalState = clientState;
      if (name) {
        const key = normalizeChemName_(name);
        const fromMaster = class1Map[key] || '';
        if (fromMaster) {
          c['상태'] = fromMaster;
          finalState = fromMaster;
        }
      }

      // [v3.58 / 4-1] validateChemicals와 동일한 단일 분류 기준 사용
      const _cls = classifyChemForValidation_(finalState || clientState, name,
        String(c['분류1'] || c.category || '').trim());

      const conc = String(c['농도'] || '').trim();
      const amt  = String((c['용량'] ?? c['사용량'] ?? '')).trim();
      const msds = String((c['MSDS 및 취급 주의사항'] ?? c['MSDS'] ?? '')).trim();

      if (name) {
        if (_cls.conc === 'required' && !conc) {
          missing.push(`"${name}"의 농도`);
        }
        if (!amt) {
          missing.push(`"${name}"의 사용량`);
        }
        if (!msds) {
          missing.push(`"${name}"의 MSDS/취급 주의사항`);
        }
      }

      // [HOTFIX v3.49] validateChemicals(toValidate)가 vol/msds/conc/state를 정상적으로 인식하도록 모두 포함.
      //   기존 버그: { name, disposal, guidance }만 반환 → 검증에서 빈 값으로 인식 → 검증 실패.
      return {
        name,
        disposal,
        guidance,
        vol: amt,
        msds: msds,
        conc: conc,
        // [2026-08-19] 위 _cls는 finalState(마스터 우선)로 판별하는데 여기만 clientState를
        //   우선해, 학생이 마스터와 다른 상태를 적으면 두 검사가 서로 다른 전제로 돌아
        //   "농도를 비우면 제출 거부 / 채우면 검증 실패"인 데드락이 생겼음. 기준을 일치시킴.
        state: finalState || clientState,
        category: String(c['분류1'] || c.category || '').trim()
      };
    }).filter(x => x.name);

    if (missing.length) {
      throw new Error('시약 정보 누락: ' + missing.join(', ') + '\n모든 시약의 농도·사용량·MSDS를 입력하세요.');
    }

    const vres = validateChemicals(toValidate);
    if (!vres.ok) {
      const details = vres.mismatches.map(m => `${m.name}: 기대=${m.expected}, 입력=${m.got}`).join(', ');
      throw new Error(
        '시약 폐기 방법 검증 실패: ' + details +
        '\n"시약 정보 검증하기" 버튼으로 분류를 확인/수정한 뒤 다시 신청하세요.'
      );
    }
  }

  const sh = getMainSheet_();
  const ss = sh.getParent();
  const { header, map } = getHeaderMap_(sh);

  // ====== 중복 신청 방지 ======
  // 정책:
  //  - 동일 날짜/실험실에서, 본인(대표자) 또는 팀원으로 이미 등록된 건과
  //    시간 슬롯이 하나라도 겹치면 차단
  //  - 단, 1차/최종 '반려' 상태인 건은 제외(재신청 허용)
  const dupIdCol      = map['신청ID'];
  const dupSidCol     = map['대표자학번'];
  const dupMembersCol = map['동반자명단'];
  const dupDateCol    = map['실험할날짜'];
  const dupLabCol     = map['신청실험실'];
  const dupTimeCol    = map['신청시간'];
  const dupApproveCol = map['지도승인여부'];
  const dupFinalCol   = map['최종승인여부'];

  // [이슈 4] 필수 헤더 누락 시 silent skip 대신 명시적 에러
  const _dupRequired = {
    '대표자학번': dupSidCol,
    '실험할날짜': dupDateCol,
    '신청실험실': dupLabCol,
    '신청시간':   dupTimeCol
  };
  const _dupMissing = Object.keys(_dupRequired).filter(k => _dupRequired[k] == null);
  if (_dupMissing.length) {
    throw new Error('중복 검증용 시트 헤더가 누락되었습니다: ' + _dupMissing.join(', '));
  }

  // 신규 양식(IT실/가정실습실/N동 공학 Zone)은 중복 신청 검증을 적용하지 않음.
  //  - 운영 정책상 필요 없다고 판단되어 스킵
  //  - lab 값이 콤마결합 문자열이라 단일 룸 비교가 부정확하기도 함
  if (!isNewLab) {
    // [이슈 5] 날짜 선필터로 스캔 범위 축소 — 날짜 컬럼만 먼저 읽어 후보 행 인덱스 수집
    const normSid  = String(data.studentId || '').replace(/\D/g, '').padStart(5, '0');
    const normDate = _normDate;
    const normLab  = String(data.lab || '').trim();
    const reqSlotSet = new Set(requestedSlots);

    const lastRow = sh.getLastRow();
    let allRows = [];
    if (lastRow >= 2) {
      const dateColVals = sh.getRange(2, dupDateCol + 1, lastRow - 1, 1).getValues();
      const candidateRows = [];
      for (let i = 0; i < dateColVals.length; i++) {
        if (normalizeDateYMD_(dateColVals[i][0]) === normDate) {
          candidateRows.push(i + 2); // 1-based sheet row
        }
      }
      if (candidateRows.length) {
        // 연속 구간으로 묶어 I/O 최소화
        const ranges = [];
        let start = candidateRows[0], prev = candidateRows[0];
        for (let i = 1; i < candidateRows.length; i++) {
          if (candidateRows[i] === prev + 1) {
            prev = candidateRows[i];
          } else {
            ranges.push([start, prev - start + 1]);
            start = candidateRows[i];
            prev = candidateRows[i];
          }
        }
        ranges.push([start, prev - start + 1]);

        const headerLen = header.length;
        ranges.forEach(([rowStart, numRows]) => {
          const block = sh.getRange(rowStart, 1, numRows, headerLen).getValues();
          for (let k = 0; k < block.length; k++) allRows.push(block[k]);
        });
      }
    }

    // [이슈 3] 대표자 + 팀원 학번(5자리) 모두 수집 → 어느 역할로든 이미 참여했는지 검사
    const _fiveTokens = s => (String(s || '').match(/\b(\d{5})\b/g) || []);
    const myIds = new Set([normSid, ..._fiveTokens(data.teamMembers)].filter(Boolean));

    const dupRow = allRows.find(r => {
      // 날짜·실험실 조기 탈락
      if (normalizeDateYMD_(r[dupDateCol]) !== normDate) return false;
      if (String(r[dupLabCol] || '').trim() !== normLab) return false;

      // [이슈 1] 반려된 건은 중복에서 제외
      // 정확 일치('반려')가 아니라 부분 일치로 완화 — 시트에 '반려', '반려됨',
      // '1차 반려', '최종 반려' 등 변형 표현이 들어와도 모두 반려로 인식되어
      // 정상적으로 재신청이 가능해진다 (사용자 보고 버그 수정).
      const ap1 = dupApproveCol != null ? String(r[dupApproveCol] || '').trim() : '';
      const ap2 = dupFinalCol   != null ? String(r[dupFinalCol]   || '').trim() : '';
      if (ap1.indexOf('반려') !== -1 || ap2.indexOf('반려') !== -1) return false;

      // [이슈 3] 본인(또는 팀원)이 기존 행의 대표자/팀원에 포함되어 있는가
      const rSid = String(r[dupSidCol] || '').replace(/\D/g, '').padStart(5, '0');
      const rMembers = dupMembersCol != null ? _fiveTokens(r[dupMembersCol]) : [];
      const rAllIds = new Set([rSid, ...rMembers].filter(Boolean));
      const personOverlap = [...myIds].some(id => rAllIds.has(id));
      if (!personOverlap) return false;

      // [이슈 2] 시간 슬롯 교집합 검사 (부분 중복도 차단)
      const rSlots = String(r[dupTimeCol] || '')
        .split(',')
        .map(s => normalizeSlot_(s.trim()))
        .filter(Boolean);
      return rSlots.some(s => reqSlotSet.has(s));
    });

    if (dupRow) {
      const existingId   = dupIdCol != null ? String(dupRow[dupIdCol] || '') : '';
      const existingTime = String(dupRow[dupTimeCol] || '');
      const existingSid  = String(dupRow[dupSidCol] || '').replace(/\D/g, '').padStart(5, '0');
      const roleNote = (existingSid === normSid)
        ? '(대표자로 이미 등록된 신청)'
        : '(기존 신청의 팀원으로 등록되어 있거나, 본인 팀원이 기존 신청에 포함되어 있습니다)';
      throw new Error(
        '해당 날짜/실험실에 이미 참여 중인 신청이 있어 시간이 겹칩니다. ' + roleNote +
        '\n기존 시간: ' + existingTime +
        (existingId ? '\n기존 신청 ID: ' + existingId : '') +
        '\n\n※ 반려된 신청은 중복에서 제외됩니다. 기존 신청을 취소(반려)하거나 시간을 조정한 뒤 다시 신청해 주세요.'
      );
    }
  }

  const now = new Date();
  const ts  = Utilities.formatDate(now, Session.getScriptTimeZone(), 'yyyyMMdd_HHmmss');
  const id  = `${data.studentId}_${ts}`;
  const row = new Array(header.length).fill('');
  // [SEC] 모든 문자열 값에 수식 인젝션 방어 자동 적용
  const put = (col, val) => { if (map[col] != null) row[map[col]] = sanitizeForSheet_(val); };

  put('신청ID', id);
  put('제출일시', now);
  put('대표자학번', data.studentId);
  put('대표자이름', data.studentName);
  put('동반자명단', data.teamMembers);
  put('총인원수', data.totalParticipants || '');
  put('신청실험실', labName);
  // ===== [C2] 저장 시 정규화 — 중복 감지와 동일한 형식으로 통일 =====
  put('실험할날짜', _normDate);
  // 슬롯은 정렬된 순서로 저장 (중복 감지 시 교집합/정렬 비교와 일관)
  put('신청시간', [...requestedSlots].sort().join(','));
  put('실험제목', data.title);
  put('사용목적', data.purpose);
  put('사용목적 기타', data.otherPurpose || '');
  put('첨단기기실 이용 여부', data.advancedLab);
  put('첨단기기실 이용 사유', data.advancedLabReason || '');
  put('실험준비물', data.materials);
  put('후드 사용 여부', data.hood);
  put('후드 사용 사유', data.hoodReason || '');
  put('실험과정', data.process);
  put('실험뒷정리', data.cleanup);
  put('실험시 주의사항', data.precautions);
  put('안전장구', data.safety);
  put('지도교사이름', data.teacher);
  put('지도교사이메일', data.teacherEmail || '');

  // ===== 신규 양식(IT실/가정실습실/N동 공학 Zone) 전용 컬럼 =====
  // 시트에 해당 헤더가 없으면 put이 자동 무시되므로(map[col]==null 가드) 안전.
  // 실제 시트 헤더 추가는 migrateAddNewLabColumns()를 GAS 에디터에서 1회 실행해 적용.
  put('양식종류',
    isNewLab ? NEW_LAB_CONFIG[formCategory].sheetCategory
    : (is2F ? 'S동 2층' : 'S동 1층')
  );
  put('사용실험실목록',
    isNewLab && Array.isArray(data.labRooms) ? data.labRooms.join(', ') : ''
  );
  put('사용컴퓨터번호', formCategory === 'it'   ? (data.computerNumbers || '') : '');
  put('납땜여부',       formCategory === 'it'   ? (data.soldering || '')       : '');
  put('위험도구',
    formCategory === 'home' && Array.isArray(data.dangerousTools)
      ? data.dangerousTools.join(', ') : ''
  );
  // '실습주제' 는 '실험제목' 컬럼으로 통합되어 더 이상 별도 저장하지 않음
  put('사용계획',       isNewLab ? (data.usagePlan || '')     : '');
  // [2026-08] techart 누락 수정 — Tech & Art LAB 양식에도 '신청 장비' 입력란이 있는데
  //   저장 분기에서 빠져 있어 학생이 적은 내용이 통째로 버려지고 있었다.
  put('신청장비',
    (formCategory === 'it' || formCategory === 'engineering' || formCategory === 'techart')
      ? (data.requestedEquipment || '') : ''
  );
  put('재료JSON',
    formCategory === 'home' && Array.isArray(data.materialsList) && data.materialsList.length
      ? JSON.stringify(data.materialsList) : ''
  );
  put('교육_장비사용법', isNewLab ? (data.eduEquipment || '') : '');
  put('교육_정리방법',   isNewLab ? (data.eduCleanup   || '') : '');

  // 신규 양식 — 임장 시간은 1차 승인 단계가 없으므로 학생이 폼에서 직접 입력한 값을 즉시 저장.
  // 기존 1·2·3층 흐름(submitApproval_에서 교사가 입력)과 충돌하지 않게 isNewLab 분기로만 작동.
  if (isNewLab) {
    if (data.visitStart) put('임장지도 시작시간', "'" + String(data.visitStart));
    if (data.visitEnd)   put('임장지도 종료시간', "'" + String(data.visitEnd));
  }

  sh.appendRow(row);
  // ===== [H6] 쓰기 후 즉시 flush — 후속 읽기(중복 감지 등)에서 최신 상태 보장 =====
  SpreadsheetApp.flush();

  // ====== 시약 기록 (1층 폼만) — header-keyed write로 시트 컬럼 순서 변경에도 안전 ======
  if (!is2F && !isNewLab && chemsArray.length > 0) {
    const chemSh = getChemRecordSheet_();
    const chemSS = chemSh.getParent();
    const chemHdr = chemSh.getRange(1, 1, 1, chemSh.getLastColumn()).getValues()[0]
      .map(v => String(v || '').trim());
    // 헤더가 비어 있으면 부족한 자리에 폴백 이름 부여 (예: N열이 빈 상태면 '폐기 방법' 자동 매핑)
    const FALLBACK_CHEM_HEADER = [
      '신청ID','제출일시','신청실험실','실험할날짜','신청시간',
      '대표자학번','대표자이름','시약명','상태','농도','용량','MSDS','교사임장여부','폐기 방법'
    ];
    const colIdx = (name) => {
      const i = chemHdr.indexOf(name);
      if (i >= 0) return i;
      const fb = FALLBACK_CHEM_HEADER.indexOf(name);
      return fb >= 0 ? fb : -1;
    };
    chemsArray.forEach(c => {
      const name = String(c['시약명'] || c['물질명'] || c.name || '').trim();
      if (!name) return;
      const key = normalizeChemName_(name);
      const stateFromMaster = class1Map[key] || String(c['상태'] || c['분류1'] || '').trim();
      const msdsText = (c['MSDS 및 취급 주의사항'] ?? c['MSDS'] ?? '');
      const guidance = (c['교사임장여부'] ?? c['교사 임장 여부'] ?? c.guidance ?? '');
      const disposal = String(c['폐기 방법'] || c['폐수처리'] || c['폐기'] || c.disposal || '').trim();
      const fields = {
        '신청ID':       id,
        '제출일시':     now,
        '신청실험실':   data.lab,
        '실험할날짜':   data.date,
        '신청시간':     data.timeSlot,
        '대표자학번':   data.studentId,
        '대표자이름':   data.studentName,
        '시약명':       sanitizeForSheet_(name),
        '상태':         sanitizeForSheet_(stateFromMaster),
        '농도':         sanitizeForSheet_(c['농도'] || ''),
        '용량':         sanitizeForSheet_((c['용량'] ?? c['사용량'] ?? '') || ''),
        'MSDS':         sanitizeForSheet_(msdsText || ''),
        '교사임장여부': sanitizeForSheet_(guidance || ''),
        '폐기 방법':    sanitizeForSheet_(disposal)
      };
      const rowLen = Math.max(chemHdr.length, FALLBACK_CHEM_HEADER.length);
      const row = new Array(rowLen).fill('');
      Object.keys(fields).forEach(k => {
        const i = colIdx(k);
        if (i >= 0 && i < row.length) row[i] = fields[k];
      });
      chemSh.appendRow(row);
    });
  }

  // 저장 완료 — 알림 발송은 락 해제 후 finishSubmission_에서 수행 (v3.58 / 7-8)
  return { data: data, id: id, isNewLab: isNewLab, formCategory: formCategory,
           hasRestricted: hasRestricted, seventhValid: seventhValid };
}

/**
 * [v3.58 / 7-8] 제출 저장 이후의 알림(메일·챗) 발송 — 전역 락 밖에서 실행.
 */
function finishSubmission_(ctx) {
  const data = ctx.data;
  const id = ctx.id;
  const isNewLab = ctx.isNewLab;
  const formCategory = ctx.formCategory;
  const hasRestricted = ctx.hasRestricted;
  const seventhValid = ctx.seventhValid;

  // ====== 메일 발송 ======
  const warnings = [];
  Logger.log('[finishSubmission_] 메일 발송 시작 - appId: ' + id +
    ', studentId: ' + data.studentId + ', teacherEmail: ' + (data.teacherEmail || '(비어있음)'));
  const r1 = sendStudentSubmitEmail_(data, id, isNewLab);
  if (!r1.ok) warnings.push('학생 신청완료 메일 발송 실패: ' + (r1.error || ''));

  if (isNewLab) {
    // [단일 승인 정책 변경 2026-08] 신규 양식은 학생이 선택한 지도교사가 단독으로 승인 처리.
    //   실습실 담당 계정 승인 방식 폐기 → 별도의 지도교사 안내 메일도 발송하지 않음
    //   (승인 요청 메일 자체가 지도교사에게 가므로 중복 안내 불필요).
    const r2new = sendNewLabApproverEmail_(formCategory, data, id);
    if (!r2new.ok) {
      Logger.log('[submitApplication_] 신규 양식 지도교사 승인 메일 발송 실패 - appId: ' + id +
        ', category: ' + formCategory + ', error: ' + (r2new.error || ''));
      warnings.push('승인 요청 메일 발송 실패: ' + (r2new.error || ''));
    }
    // [2026-08-19] 실습실 담당 선생님에게 참고 안내(승인 링크 없음).
    //   담당자 미등록 등으로 실패해도 신청 자체는 정상 — 학생에게 경고를 띄우지 않고 로그만 남긴다.
    try {
      const rOwner = sendLabOwnerInfoEmail_(formCategory, data, id);
      if (!rOwner.ok) {
        Logger.log('[submitApplication_] 실습실 담당 안내 메일 미발송 - appId: ' + id +
          ', error: ' + (rOwner.error || ''));
      }
    } catch (ownerErr) {
      Logger.log('[submitApplication_] 실습실 담당 안내 메일 예외: ' + (ownerErr && ownerErr.message ? ownerErr.message : ownerErr));
    }
  } else {
    const r2 = sendTeacherApprovalEmail_(data, id);
    if (!r2.ok) {
      Logger.log('[submitApplication_] 지도교사 메일 발송 실패 - appId: ' + id + ', error: ' + (r2.error || ''));
      warnings.push('지도교사 1차 승인요청 메일 발송 실패: ' + (r2.error || ''));
    }
  }

  // ====== Google Chat 알림 ======
  try { sendChatNotification_(data, id); }
  catch (chatErr) { Logger.log('[submitApplication_] Chat 알림 실패: ' + chatErr.message); }

  const suffixMsg = (hasRestricted && seventhValid)
    ? ' (신청제한 학생이 있지만 7교시에는 신청이 가능합니다)'
    : '';
  const warnMsg = warnings.length > 0 ? '\n⚠️ ' + warnings.join('\n⚠️ ') : '';
  return `신청이 완료되었습니다! (ID: ${id})${suffixMsg}${warnMsg}`;
}

/* ------------------------- 신청/시약 조회 ------------------------- */
/**
 * [HOTFIX v3.48] 최종 승인 토큰 검증 통과 후 cache에 저장된 bypass 키 확인.
 *   doGet의 stage=final 라우팅에서 토큰 검증 성공 시 _markFinalAuthBypass_를 호출.
 *   이후 같은 세션에서 같은 appId에 대한 후속 호출(getApplication, submitFinalApproval)은 통과.
 *   TTL 10분 — 메일 클릭 후 충분한 검토·승인 시간 확보.
 */
function _hasFinalAuthBypass_(appId) {
  try {
    const sess = getSessionEmail_() || 'anon';
    const key = 'finalAuth:' + String(appId) + ':' + sess;
    return CacheService.getScriptCache().get(key) === '1';
  } catch (_) { return false; }
}
function _markFinalAuthBypass_(appId) {
  try {
    const sess = getSessionEmail_() || 'anon';
    const key = 'finalAuth:' + String(appId) + ':' + sess;
    CacheService.getScriptCache().put(key, '1', 600); // 10분
  } catch (_) {}
}

/**
 * @param {string} id 신청 ID
 * @param {{skipAuth?:boolean, authContext?:string}} [opts]
 *   skipAuth=true 인 경우 본인/교사/관리자 권한 체크 우회.
 *   (메일 토큰 검증을 이미 거친 final 승인 라우팅에서만 사용)
 */
function getApplication(id, arg2) {
  // [v3.53] arg2가 문자열이면 토큰(클라이언트 호출), 객체면 opts(서버 내부 호출).
  let opts = {};
  if (typeof arg2 === 'string') opts = { token: arg2 };
  else if (arg2 && typeof arg2 === 'object') opts = arg2;

  // ★ SEC-P4: rate limit (조회 폭주 차단)
  //   [v3.58] skipAuth(서버 내부 호출)는 rate limit·차단 체크도 건너뜀 —
  //   결정 저장 직후 내부 재조회가 차단 상태 때문에 실패하면 무통지 저장이 되기 때문.
  if (!opts.skipAuth) {
    assertCallRateLimit_('getApplication', 60, 60); // 분당 60회
  }

  const sh = getMainSheet_();
  const ss = sh.getParent();
  const vals = sh.getDataRange().getValues();
  if (vals.length < 2) throw new Error('신청 데이터 시트가 비어있습니다.');
  const [hdr, ...rows] = vals;
  const idCol = hdr.indexOf('신청ID');
  if (idCol === -1) throw new Error('시트 헤더에 "신청ID" 열이 없습니다.');
  const idx = rows.findIndex(r => String(r[idCol]) === String(id));
  if (idx < 0) throw new Error('신청 정보를 찾을 수 없습니다.');

  // ★ SEC-P1: 본인/교사/관리자만 조회 허용
  //   우회 우선순위: skipAuth(서버 SSR) > 토큰 재검증(stateless) > cache bypass(폴백) > 권한 체크
  const sidCol = hdr.indexOf('대표자학번');
  const ownerSid = sidCol >= 0 ? String(rows[idx][sidCol] || '').replace(/\D/g, '').padStart(5, '0') : '';

  let _bypassed = false;
  let _bypassVia = '';
  if (opts.skipAuth) {
    _bypassed = true; _bypassVia = 'skipAuth';
  } else if (opts.token) {
    // [v3.53] 토큰 재검증 — 캐시 무관, stateless.
    // [v3.58] final·approve 두 단계 모두 시도 (approve.html도 토큰을 쓰게 되면서 확장)
    let _v = verifyApprovalToken_(opts.token, id, 'final', getSessionEmail_());
    if (!_v.ok) _v = verifyApprovalToken_(opts.token, id, 'approve', getSessionEmail_());
    if (_v.ok) {
      _bypassed = true; _bypassVia = 'token';
      try { _markFinalAuthBypass_(id); } catch (_) {} // 캐시도 갱신 (보너스)
    }
  }
  if (!_bypassed && _hasFinalAuthBypass_(id)) {
    _bypassed = true; _bypassVia = 'cache';
  }

  if (_bypassed) {
    try {
      _logAccessAttempt_('getApplication:tokenAuth', getSessionEmail_(), String(ownerSid),
        'allow', '[v3.53] bypass=' + _bypassVia + ' via ' + (opts.authContext || 'final-stage'));
    } catch (_) {}
  } else {
    assertOwnerOrStaff_(ownerSid, 'getApplication(' + id + ')');
  }

  const target = rows[idx];
  const tz = Session.getScriptTimeZone();
  const rec = {};
  hdr.forEach((h, i) => {
    const v = target[i];
    if (h === '임장지도 시작시간' || h === '임장지도 종료시간') {
      rec[h] = normalizeToHHmm_(v); return;
    }
    if (v instanceof Date) {
      if (h === '실험할날짜') rec[h] = toISOWithOffset_(v, { tz, dateOnly: true });
      else rec[h] = toISOWithOffset_(v, { tz, dateOnly: false });
      return;
    }
    rec[h] = (v === null || v === undefined) ? '' : v;
  });

  if (rec['대표자학번'] !== undefined) {
    rec['대표자학번'] = String(rec['대표자학번']).replace(/\D/g, '').padStart(5, '0');
  }

  // [v3.58 / 6-5] 같은 날짜·실험실·시간대에 이미 최종 승인된 다른 신청 집계 — 승인 화면 경고용
  try {
    const labCol   = hdr.indexOf('신청실험실');
    const dateCol  = hdr.indexOf('실험할날짜');
    const timeCol  = hdr.indexOf('신청시간');
    const finalCol = hdr.indexOf('최종승인여부');
    const nmCol    = hdr.indexOf('대표자이름');
    if (labCol >= 0 && dateCol >= 0 && timeCol >= 0 && finalCol >= 0) {
      const myLab  = String(target[labCol] || '').trim();
      const myDate = normalizeDateYMD_(target[dateCol]);
      const mySlots = new Set(String(target[timeCol] || '').split(',')
        .map(s => normalizeSlot_(s.trim())).filter(Boolean));
      const overlapped = [];
      rows.forEach((r, i) => {
        if (i === idx) return;
        if (String(r[finalCol] || '').trim() !== '승인') return;
        if (String(r[labCol] || '').trim() !== myLab) return;
        if (normalizeDateYMD_(r[dateCol]) !== myDate) return;
        const slots = String(r[timeCol] || '').split(',').map(s => normalizeSlot_(s.trim()));
        if (!slots.some(s => mySlots.has(s))) return;
        overlapped.push((nmCol >= 0 ? String(r[nmCol] || '') : '') + '(' + String(r[timeCol] || '') + ')');
      });
      rec.__sameSlotApproved = overlapped.length;
      rec.__sameSlotApprovedDetail = overlapped.slice(0, 5).join(', ');
    }
  } catch (_) { /* 집계 실패해도 본 조회에는 영향 없음 */ }

  const chemSh = getChemRecordSheet_();
  const chemSS = chemSh.getParent();
  const chemVals = chemSh.getDataRange().getValues();
  if (chemVals.length < 2) {
    rec.chemicals = [];
  } else {
    const [chemHdr, ...chemRows] = chemVals;
    rec.chemicals = chemRows
      .filter(r => String(r[0]) === String(id))
      .map(r => chemHdr.reduce((o, h, j) => (o[h] = r[j], o), {}));
  }

  // [2026-08] 승인 화면이 양식 종류를 스스로 추측하지 않도록 서버가 계산해 실어 보낸다.
  //   '' 이면 1·2층(2단 승인), 그 외는 단일 승인 양식.
  rec.__formCategory = categoryFromSheetValue_(rec['양식종류']);
  rec.__isSingleApproval = !!rec.__formCategory;

  return rec;
}

/* ----------------------------------------------------------
 * ✅ 1차 승인 시 교사가 선택한 '교사임장여부' 반영
 * -------------------------------------------------------- */
function applyTeacherGuidanceToChemicals_(appId, guidanceList) {
  if (!appId) return;
  if (!Array.isArray(guidanceList) || guidanceList.length === 0) return;

  const sh = getChemRecordSheet_();
  const ss = sh.getParent();
  const vals = sh.getDataRange().getValues();
  if (vals.length < 2) return;

  const hdr = vals[0];
  const appIdCol = hdr.indexOf('신청ID');
  const nameCol  = hdr.indexOf('시약명');
  let guidanceCol = hdr.indexOf('교사임장여부');
  if (guidanceCol === -1) guidanceCol = hdr.indexOf('교사 임장여부');
  if (guidanceCol === -1) guidanceCol = hdr.indexOf('교사 임장 여부');

  if (appIdCol === -1 || nameCol === -1 || guidanceCol === -1) {
    return;
  }

  const targetRows = [];
  for (let i = 1; i < vals.length; i++) {
    const rowAppId = String(vals[i][appIdCol] || '').trim();
    if (rowAppId === String(appId)) {
      const nm = String(vals[i][nameCol] || '').trim();
      targetRows.push({
        rowNum: i + 1,
        name: nm,
        nameKey: normalizeChemName_(nm),
        currentGuidance: String(vals[i][guidanceCol] || '').trim()
      });
    }
  }
  if (targetRows.length === 0) return;

  const incoming = guidanceList
    .map(x => {
      const nm = String(x && (x.name || x['시약명'] || x['물질명']) || '').trim();
      return {
        name: nm,
        nameKey: normalizeChemName_(nm),
        guidance: String(x && (x.guidance || x['교사임장여부'] || x['교사 임장 여부']) || '').trim()
      };
    })
    .filter(x => x.nameKey && x.guidance);

  if (incoming.length === 0) return;

  // 정규화 키로 매칭 + 1차 승인 시 교사 선택을 권위 있는 값으로 처리하므로 빈값 조건 제거.
  // (마스터 자동 채움 또는 학생 입력 → 교사가 1차 승인 단계에서 변경하면 그 변경을 반영)
  incoming.forEach(item => {
    const found = targetRows.find(tr => tr.nameKey === item.nameKey);
    if (found && found.currentGuidance !== item.guidance) {
      sh.getRange(found.rowNum, guidanceCol + 1).setValue(item.guidance);
      found.currentGuidance = item.guidance;
    }
  });
}

/* ------------------------- 1차 승인 ------------------------- */
function submitApproval(info) {
  // ★ SEC-P1: 승인 권한 검증 — 교사 시트에 등록된 이메일 + 관리자만 승인 가능.
  //   학생이 콘솔에서 직접 호출하는 임의 승인/반려를 차단.
  //   ※ Phase 3에서 메일 HMAC 토큰까지 검증해 메일 가로채기에도 대응 예정.
  const appIdForLog = (info && info.id) ? info.id : '';
  // [v3.58 / 3-3] 메일 토큰 인증 경로 추가 — 교사 명단 시트 일시 오류 시에도
  //   메일 수신자 본인(세션=수신자)이면 승인 가능. 토큰 없거나 무효면 기존 검증.
  let _authed1 = false;
  const _token1 = (info && info.token) ? String(info.token) : '';
  if (_token1) {
    const _v1 = verifyApprovalToken_(_token1, appIdForLog, 'approve', getSessionEmail_());
    if (_v1.ok) {
      _authed1 = true;
      try {
        _logAccessAttempt_('submitApproval:tokenAuth', getSessionEmail_(), String(appIdForLog), 'allow', '[v3.58] approve 토큰 검증 통과');
      } catch (_) {}
    }
  }
  if (!_authed1) assertApprover_(appIdForLog, '1st', 'submitApproval');

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) throw new Error('서버가 바쁩니다. 잠시 후 다시 시도해주세요.');
  try {
  return submitApproval_(info);
  } finally { lock.releaseLock(); }
}
function submitApproval_(info) {
  const {
    id,
    decision,
    comment,
    guidanceRequired,
    entryTime,
    toolOk,
    processOk,
    chemicalsGuidance
  } = info;

  if (decision !== '승인' && decision !== '반려') throw new Error('승인 또는 반려를 선택하세요.');
  if (guidanceRequired === 'Yes' && decision === '승인' && !entryTime) throw new Error('임장 시간을 입력해주세요.');
  if (toolOk !== 'Yes' && toolOk !== 'No') throw new Error('도구/장비 적절 여부를 선택하세요.');
  if (processOk !== 'Yes' && processOk !== 'No') throw new Error('실험과정, 뒷정리, 주의사항의 내용 적절 여부를 선택하세요.');
  if (decision === '반려' && !String(comment || '').trim()) throw new Error('반려 사유를 입력해주세요.');

  const sh = getMainSheet_();
  const ss = sh.getParent();
  const { header, map } = getHeaderMap_(sh);
  const idCol = map['신청ID'];
  if (idCol == null) throw new Error('시트 헤더에 "신청ID" 열이 없습니다.');
  const rows = sh.getDataRange().getValues().slice(1);
  const idx = rows.findIndex(r => String(r[idCol]) === String(id));
  if (idx < 0) throw new Error('신청 정보를 찾을 수 없습니다.');
  const rowNum = idx + 2;

  // ===== [H4] 필수 컬럼 검증 — silent skip 방지 =====
  const approvalCol = map['지도승인여부'];
  if (approvalCol == null) {
    throw new Error('시트 헤더에 "지도승인여부" 열이 없습니다. 관리자에게 문의해 주세요.');
  }
  if (map['지도승인의견'] == null) {
    throw new Error('시트 헤더에 "지도승인의견" 열이 없습니다. 관리자에게 문의해 주세요.');
  }

  // ====== 중복 승인/반려 방지 ======
  {
    const existing = String(rows[idx][approvalCol] || '').trim();
    if (existing === '승인' || existing === '반려') {
      throw new Error('이미 1차 처리(승인/반려)된 신청입니다.');
    }
  }

  // put: 필수 열 외의 선택 열은 누락되어도 skip (경고만)
  const put = (col, val) => {
    if (map[col] != null) {
      sh.getRange(rowNum, map[col] + 1).setValue(val);
    } else {
      Logger.log('[submitApproval_] 시트 열 누락(skip): ' + col);
    }
  };
  put('지도승인여부', decision);
  put('지도승인의견', comment || '');
  // [2026-08] 1차 검토 답변 기록 — 폼에서 필수로 받아 놓고 저장하지 않던 값.
  //   컬럼이 아직 없는 시트에서는 put 이 자동으로 건너뛰므로 안전하다.
  //   (컬럼 추가는 migrateAddNewLabColumns() 1회 실행)
  put('도구장비_적절성', toolOk === 'Yes' ? '예' : (toolOk === 'No' ? '아니오' : ''));
  put('실험내용_적절성', processOk === 'Yes' ? '예' : (processOk === 'No' ? '아니오' : ''));

  if (entryTime && entryTime.includes('~')) {
    const [fromRaw, toRaw] = entryTime.split('~').map(s => s.trim());
    const fromHHmm = normalizeToHHmm_(fromRaw);
    const toHHmm   = normalizeToHHmm_(toRaw);
    put('임장지도 시작시간', "'" + fromHHmm);
    put('임장지도 종료시간', "'" + toHHmm);
  } else {
    put('임장지도 시작시간', '');
    put('임장지도 종료시간', '');
  }

  if (Array.isArray(chemicalsGuidance) && chemicalsGuidance.length > 0) {
    applyTeacherGuidanceToChemicals_(id, chemicalsGuidance);
  }

  // ===== [H6] 시트 변경 즉시 flush =====
  SpreadsheetApp.flush();

  // [v3.58 / 3-4] 결정 저장 이후의 내부 재조회는 권한 체크 우회 —
  //   호출자 인증은 submitApproval에서 이미 끝났고, 여기서 실패하면
  //   "저장은 됐는데 오류 표시 + 통지 메일 누락"이 되기 때문.
  const rec = getApplication(id, { skipAuth: true, authContext: 'post-1st-decision' });
  const warnings = [];

  const recipientLabel = `학생 ${rec['대표자이름'] || ''} (${rec['대표자학번'] || ''})`;

  if (decision === '승인') {
    // 학생에게 1차 승인 안내
    const r1 = sendStudentFirstApproveEmail_(rec, comment);
    if (!r1.ok) {
      Logger.log('학생 1차 승인 메일 실패 → 관리자 폴백: ' + (r1.error || ''));
      const fb = sendAdminFallbackEmail_('1차 승인', recipientLabel, r1.error || '알 수 없는 오류', rec);
      if (fb.ok) {
        warnings.push('학생에게 1차 승인 메일 자동 발송 실패 → 학과 메일로 수동 처리 요청을 보냈습니다.');
      } else {
        warnings.push('학생 1차 승인 메일 및 학과 메일 발송 모두 실패했습니다. 학생에게 직접 연락해 주세요.');
      }
    }

    // 담당교사에게 최종 승인 요청 (실패 시 학과 메일로 fallback)
    try {
      const r2 = sendLabTeacherFinalEmail_(rec, id);
      if (!r2.ok) throw new Error(r2.error || '발송 실패');
    } catch(e) {
      Logger.log('담당교사 최종승인 메일 실패: ' + (e.message || e));
      // [v3.58 / 2-2] 폴백 메일에도 토큰 부착 — 기존엔 토큰 없이 생성되어
      // 학과가 버튼을 눌러도 "접근 거부"가 떠 수동 개입 경로가 막혀 있었음.
      const _fbTok = genApprovalToken_(id, 'final', SCIENCE_EMAIL);
      const url = getWebAppUrl_() + '?id=' + encodeURIComponent(id) +
                  '&stage=final&t=' + encodeURIComponent(_fbTok);
      const eh = escapeHtml_;
      const fallbackBody = buildEmailHtml_('최종 승인 메일 자동 발송 실패', [
        `자동 발송 실패 사유: ${eh(e.message || e)}`,
        '담당교사에게 아래 내용을 직접 전달해 주세요.',
        '',
        `• 대표자: ${eh(rec['대표자이름'])} (${eh(rec['대표자학번'])})`,
        `• 실험실: ${eh(rec['신청실험실'])}`,
        `• 날짜/시간: ${normalizeDateYMD_(rec['실험할날짜'])} / ${eh(rec['신청시간'])}`,
        `• 실험·실습 주제: ${eh(rec['실험제목'] || '')}`,
      ], url, '최종 승인 처리하기');
      const fb = sendMail_(SCIENCE_EMAIL, `[수동 처리 요청] 최종 승인 메일 발송 실패 - ${eh(rec['대표자이름'])}`, fallbackBody);
      if (fb.ok) {
        warnings.push('담당교사 이메일 자동 발송 실패 → 학과 메일로 수동 처리 요청을 보냈습니다.');
      } else {
        warnings.push('담당교사 이메일 및 학과 메일 발송 모두 실패했습니다. 담당교사에게 직접 연락해 주세요.');
      }
    }

    // [C4] 경고가 있으면 prefix로 표시 — 클라이언트가 노란 경고 오버레이로 인식
    const warnMsg = warnings.length > 0 ? '\n⚠️ ' + warnings.join('\n⚠️ ') : '';
    const prefix  = warnings.length > 0 ? '[수동조치필요] ' : '';
    return prefix + '1차 승인 완료, 담당교사에게 최종 승인 메일을 발송했습니다.' + warnMsg;

  } else {
    const r1 = sendStudentRejectEmail_(rec, comment);
    if (!r1.ok) {
      Logger.log('학생 반려 메일 실패 → 관리자 폴백: ' + (r1.error || ''));
      const fb = sendAdminFallbackEmail_('1차 반려', recipientLabel, r1.error || '알 수 없는 오류', rec);
      if (fb.ok) {
        warnings.push('학생에게 반려 메일 자동 발송 실패 → 학과 메일로 수동 처리 요청을 보냈습니다.');
      } else {
        warnings.push('학생 반려 메일 및 학과 메일 발송 모두 실패했습니다. 학생에게 직접 연락해 주세요.');
      }
    }

    const warnMsg = warnings.length > 0 ? '\n⚠️ ' + warnings.join('\n⚠️ ') : '';
    const prefix  = warnings.length > 0 ? '[수동조치필요] ' : '';
    return prefix + '반려 처리 완료' + warnMsg;
  }
}

/* ------------------------- 최종 승인 ------------------------- */
function submitFinalApproval(info) {
  // ★ SEC-P1: 최종 승인 권한 검증 — 교사/관리자만. (학생 임의 최종 승인/반려 차단)
  const appIdForLog = (info && info.id) ? info.id : '';
  // [v3.53] 권한 통과 우선순위: 토큰 재검증(stateless) > cache bypass(폴백) > assertApprover_
  //   토큰 재검증은 캐시·세션 무관하게 동작하므로, 교사가 오래 검토 후 승인해도(캐시 만료) 정상 작동.
  let _authed = false;
  let _via = '';
  const _token = (info && info.token) ? String(info.token) : '';
  if (_token) {
    const _v = verifyApprovalToken_(_token, appIdForLog, 'final', getSessionEmail_());
    if (_v.ok) { _authed = true; _via = 'token'; }
  }
  if (!_authed && _hasFinalAuthBypass_(appIdForLog)) { _authed = true; _via = 'cache'; }

  if (_authed) {
    try {
      _logAccessAttempt_('submitFinalApproval:tokenAuth', getSessionEmail_(),
        String(appIdForLog), 'allow', '[v3.53] bypass=' + _via + ' — 토큰/캐시 검증 통과');
    } catch (_) {}
  } else {
    assertApprover_(appIdForLog, 'final', 'submitFinalApproval');
  }

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) throw new Error('서버가 바쁩니다. 잠시 후 다시 시도해주세요.');
  try {
  return submitFinalApproval_(info);
  } finally { lock.releaseLock(); }
}
function submitFinalApproval_(info) {
  const { id, decision, comment } = info;
  if (decision !== '승인' && decision !== '반려') throw new Error('승인 또는 반려를 선택하세요.');
  if (decision === '반려' && !String(comment || '').trim()) throw new Error('반려 사유를 입력해주세요.');

  const sh = getMainSheet_();
  const ss = sh.getParent();
  const { header, map } = getHeaderMap_(sh);
  const idCol = map['신청ID'];
  if (idCol == null) throw new Error('시트 헤더에 "신청ID" 열이 없습니다.');
  const rows = sh.getDataRange().getValues().slice(1);
  const idx = rows.findIndex(r => String(r[idCol]) === String(id));
  if (idx < 0) throw new Error('신청 정보를 찾을 수 없습니다.');
  const rowNum = idx + 2;

  // ===== [H4] 필수 컬럼 검증 — silent skip 방지 =====
  const finalApprovalCol = map['최종승인여부'];
  if (finalApprovalCol == null) {
    throw new Error('시트 헤더에 "최종승인여부" 열이 없습니다. 관리자에게 문의해 주세요.');
  }
  if (map['최종승인의견'] == null) {
    throw new Error('시트 헤더에 "최종승인의견" 열이 없습니다. 관리자에게 문의해 주세요.');
  }

  // ====== 중복 최종 승인/반려 방지 ======
  {
    const existing = String(rows[idx][finalApprovalCol] || '').trim();
    if (existing === '승인' || existing === '반려') {
      throw new Error('이미 최종 처리(승인/반려)된 신청입니다.');
    }
  }

  // [v3.58 / 6-6] 1차 승인 없는 건의 최종 처리 방지 (단일 승인인 신규 양식은 예외)
  {
    const stg1Col = map['지도승인여부'];
    const formTypeCol = map['양식종류'];
    const formType = formTypeCol != null ? String(rows[idx][formTypeCol] || '').trim() : '';
    // [2026-08] "S동으로 시작하지 않으면 단일 승인" 이라는 문자열 추측을 걷어내고
    //   categoryFromSheetValue_ 단일 매핑으로 판정한다. 양식이 늘어도 자동 반영된다.
    const isSingleApproval = !!categoryFromSheetValue_(formType);
    if (!isSingleApproval && stg1Col != null) {
      const stg1 = String(rows[idx][stg1Col] || '').trim();
      if (stg1 !== '승인') {
        throw new Error('지도교사 1차 승인이 완료되지 않은 신청입니다. (현재 1차 상태: ' + (stg1 || '대기') + ')\n1차 승인 후 다시 처리해 주세요.');
      }
    }
  }

  const put = (col, val) => {
    if (map[col] != null) {
      sh.getRange(rowNum, map[col] + 1).setValue(val);
    } else {
      Logger.log('[submitFinalApproval_] 시트 열 누락(skip): ' + col);
    }
  };
  put('최종승인여부', decision);
  put('최종승인의견', comment || '');

  // ===== [H6] 시트 변경 즉시 flush =====
  SpreadsheetApp.flush();

  // ====== 메일 발송 ======
  // [v3.58 / 3-4] 결정 저장 이후 재조회는 권한 체크 우회.
  //   기존엔 10분 bypass 캐시 만료 시 여기서 throw → 결정은 저장됐는데
  //   승인자에겐 오류 표시 + 학생·교사 통지 메일 전부 누락 (무통지 저장, 실사례 2026-06-05).
  const rec = getApplication(id, { skipAuth: true, authContext: 'post-final-decision' });
  const warnings = [];
  const stageLabel = decision === '승인' ? '최종 승인' : '최종 반려';
  const studentLabel  = `학생 ${rec['대표자이름'] || ''} (${rec['대표자학번'] || ''})`;
  const teacherLabel  = `지도교사 ${rec['지도교사이름'] || ''} <${rec['지도교사이메일'] || ''}>`;

  // 학생 메일
  const r1 = (decision === '승인')
    ? sendStudentFinalApproveEmail_(rec, comment)
    : sendStudentFinalRejectEmail_(rec, comment);
  if (!r1.ok) {
    Logger.log('학생 ' + stageLabel + ' 메일 실패 → 관리자 폴백: ' + (r1.error || ''));
    const fb = sendAdminFallbackEmail_(stageLabel, studentLabel, r1.error || '알 수 없는 오류', rec);
    if (fb.ok) {
      warnings.push('학생에게 ' + stageLabel + ' 메일 자동 발송 실패 → 학과 메일로 수동 처리 요청을 보냈습니다.');
    } else {
      warnings.push('학생 ' + stageLabel + ' 메일 및 학과 메일 발송 모두 실패했습니다. 학생에게 직접 연락해 주세요.');
    }
  }

  // 지도교사 메일 (결과 통보)
  const r2 = sendTeacherFinalResultEmail_(rec, decision, comment);
  if (!r2.ok) {
    Logger.log('지도교사 ' + stageLabel + ' 결과 메일 실패 → 관리자 폴백: ' + (r2.error || ''));
    const fb = sendAdminFallbackEmail_(stageLabel + ' 결과 통보', teacherLabel, r2.error || '알 수 없는 오류', rec);
    if (fb.ok) {
      warnings.push('지도교사에게 ' + stageLabel + ' 결과 메일 자동 발송 실패 → 학과 메일로 수동 처리 요청을 보냈습니다.');
    } else {
      warnings.push('지도교사 결과 메일 및 학과 메일 발송 모두 실패했습니다. 지도교사에게 직접 연락해 주세요.');
    }
  }

  const warnMsg = warnings.length > 0 ? '\n⚠️ ' + warnings.join('\n⚠️ ') : '';
  const prefix  = warnings.length > 0 ? '[수동조치필요] ' : '';
  return prefix + (decision === '승인' ? '최종 승인 처리 완료' : '최종 반려 처리 완료') + warnMsg;
}

/* ------------------------- 임시저장: 저장/불러오기/정리 ------------------------- */
/**
 * 임시저장 (upsert).
 * - 같은 (학번 + 이름 + 날짜) 조합의 행이 이미 있으면 JSON/수정일시만 업데이트
 * - 없으면 새 행 추가
 * - 30일 지난 행은 일일 트리거(purgeOldDrafts)로 자동 삭제
 */
/** [v3.58 / 7-1] 초안의 폼 종류 키 — 1층('1F')/2층('2F')/신규(it·home·engineering) 구분 */
function _draftFormKey_(obj) {
  if (!obj || typeof obj !== 'object') return '1F';
  return String(obj.formCategory || obj.formType || '1F').trim() || '1F';
}

function saveDraft(formData) {
  // ★ SEC-P4: 학번 강제 + rate limit + payload 크기
  if (!formData || typeof formData !== 'object') throw new Error('요청 데이터가 비어있습니다.');
  if (JSON.stringify(formData).length > 100 * 1024) {
    throw new Error('요청 데이터가 너무 큽니다.');
  }
  assertCallRateLimit_('saveDraft', 20, 60); // 분당 20회 (자동 임시저장 대응)
  // 학번 강제 덮어쓰기
  const _sid = getSessionStudentId_();
  if (_sid) {
    formData.studentId = _sid;
  } else {
    assertOwnerOrStaff_(formData.studentId, 'saveDraft (non-student)');
  }

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error('임시저장 서버가 바쁩니다. 잠시 후 다시 시도해주세요.');
  try {
    const sh = getDraftSheet_();
    const ss = sh.getParent();
    const hdr = sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0];
    const idx = {
      id:   hdr.indexOf('초안ID'),
      cr:   hdr.indexOf('생성일시'),
      up:   hdr.indexOf('수정일시'),
      sid:  hdr.indexOf('대표자학번'),
      name: hdr.indexOf('대표자이름'),
      date: hdr.indexOf('신청날짜(YYYY-MM-DD)'),
      json: hdr.indexOf('JSON')
    };
    ['초안ID','생성일시','수정일시','대표자학번','대표자이름','신청날짜(YYYY-MM-DD)','JSON'].forEach(h => {
      if (hdr.indexOf(h) === -1) throw new Error('임시저장 시트 헤더에 "' + h + '" 열이 없습니다.');
    });

    const now = new Date();
    const sid  = normalizeStudentId_(formData.studentId);
    const name = normalizeName_(formData.studentName);
    const ymd  = normalizeDateYMD_(formData.date);
    const json = JSON.stringify(formData);

    // 기존 행 검색 (같은 학번+이름+날짜+폼종류)
    // [v3.58 / 7-1] 폼 종류까지 비교 — 기존엔 같은 날짜로 1층 초안(시약 포함)을
    //   저장한 뒤 2층/신규 폼에서 저장하면 같은 행이 덮어써져 시약 목록이 사라졌음.
    const fkey = _draftFormKey_(formData);
    const lastRow = sh.getLastRow();
    let existingRowNum = -1;
    if (lastRow >= 2) {
      const vals = sh.getRange(2, 1, lastRow - 1, hdr.length).getValues();
      for (let i = 0; i < vals.length; i++) {
        const rSid  = normalizeStudentId_(vals[i][idx.sid]);
        const rName = normalizeName_(vals[i][idx.name]);
        const rDate = normalizeDateYMD_(vals[i][idx.date]);
        if (rSid !== sid || rName !== name || rDate !== ymd) continue;
        let rKey = '1F';
        try { rKey = _draftFormKey_(JSON.parse(String(vals[i][idx.json] || '{}'))); } catch (_) {}
        if (rKey !== fkey) continue;
        existingRowNum = i + 2; // 1-based sheet row
        break;
      }
    }

    if (existingRowNum > 0) {
      // 업데이트: JSON + 수정일시만 덮어씀 (생성일시·초안ID는 유지)
      sh.getRange(existingRowNum, idx.up   + 1).setValue(now);
      sh.getRange(existingRowNum, idx.json + 1).setValue(json);
      SpreadsheetApp.flush();
      return '임시저장 완료 (기존 내용 갱신)';
    }

    // 새 행 추가
    const row = new Array(hdr.length).fill('');
    row[idx.id]   = Utilities.getUuid();
    row[idx.cr]   = now;
    row[idx.up]   = now;
    row[idx.sid]  = sid;
    row[idx.name] = name;
    row[idx.date] = ymd;
    row[idx.json] = json;
    sh.appendRow(row);
    SpreadsheetApp.flush();
    return '임시저장 완료';
  } finally {
    lock.releaseLock();
  }
}
function loadDraft(studentId, studentName, dateYMD, formKey) {
  // ★ SEC-P4: 학번 강제 + rate limit
  assertCallRateLimit_('loadDraft', 30, 60);
  const _sid = getSessionStudentId_();
  if (_sid) studentId = _sid; // 학생은 본인 학번만
  assertOwnerOrStaff_(studentId, 'loadDraft');
  // [v3.58 / 7-1] 폼 종류 필터 — 다른 폼의 초안을 불러와 필드가 조용히 소실되는 것 방지.
  //   구버전 클라이언트(4번째 인자 없음)는 필터 없이 기존 동작 유지.
  const _wantKey = String(formKey || '').trim();

  const sh = getDraftSheet_();
  const ss = sh.getParent();
  const vals = sh.getDataRange().getValues();
  if (vals.length < 2) throw new Error('임시저장 데이터가 없습니다.');
  const hdr = vals[0];
  const idx = {
    up  : hdr.indexOf('수정일시'),
    sid : hdr.indexOf('대표자학번'),
    name: hdr.indexOf('대표자이름'),
    date: hdr.indexOf('신청날짜(YYYY-MM-DD)'),
    json: hdr.indexOf('JSON')
  };
  ['수정일시','대표자학번','대표자이름','신청날짜(YYYY-MM-DD)','JSON'].forEach(h => {
    if (hdr.indexOf(h) === -1) throw new Error('임시저장 시트 헤더에 "' + h + '" 열이 없습니다.');
  });
  const sid  = normalizeStudentId_(studentId);
  const name = normalizeName_(studentName);
  const ymd  = normalizeDateYMD_(dateYMD);
  const candidates = vals.slice(1).filter(r => {
    const rSid  = normalizeStudentId_(r[idx.sid]);
    const rName = normalizeName_(r[idx.name]);
    const rDate = normalizeDateYMD_(r[idx.date]);
    if (!(rSid === sid && rName === name && rDate === ymd && r[idx.json])) return false;
    if (_wantKey) {
      let rKey = '1F';
      try { rKey = _draftFormKey_(JSON.parse(String(r[idx.json] || '{}'))); } catch (_) {}
      if (rKey !== _wantKey) return false;
    }
    return true;
  });
  if (candidates.length === 0) throw new Error('해당 조건의 임시저장 내역이 없습니다.\n(이 폼에서 저장한 초안만 불러올 수 있습니다)');
  candidates.sort((a,b) => {
    const da = new Date(a[idx.up]).getTime() || 0;
    const db = new Date(b[idx.up]).getTime() || 0;
    return db - da;
  });
  const json = candidates[0][idx.json];
  try {
    return JSON.parse(json);
  } catch (e) {
    throw new Error('임시저장 데이터(JSON) 파싱 실패');
  }
}
function purgeOldDrafts() {
  const now = new Date();
  const threshold = new Date(now.getTime() - 30*24*60*60*1000);
  const sh = getDraftSheet_();
  const ss = sh.getParent();
  const vals = sh.getDataRange().getValues();
  if (vals.length < 2) return;
  const hdr = vals[0];
  const idxUpdated = hdr.indexOf('수정일시');
  const deleteRows = [];
  for (let i=1;i<vals.length;i++){
    const v = vals[i][idxUpdated];
    const d = (v instanceof Date) ? v : new Date(v);
    if (!isNaN(d) && d < threshold) deleteRows.push(i+1);
  }
  deleteRows.reverse().forEach(r => sh.deleteRow(r));
}
/**
 * purgeOldDrafts 트리거가 없으면 자동 설치 (중복 방지)
 */
function ensurePurgeTrigger_() {
  const exists = ScriptApp.getProjectTriggers()
    .some(t => t.getHandlerFunction() === 'purgeOldDrafts');
  if (exists) return;
  ScriptApp.newTrigger('purgeOldDrafts')
    .timeBased()
    .everyDays(1)
    .atHour(3)
    .create();
  Logger.log('purgeOldDrafts 일일 트리거 자동 설치 완료');
}

/* ------------------------- 검색 전용(서버 필터) ------------------------- */
function getChemicalListForSearch(keyword) {
  const kw = String(keyword || '').trim().toLowerCase();
  const { rows } = getChemicalListForTable();
  const filtered = kw
    ? rows.filter(r => [0,1,2].some(i => String(r[i]).toLowerCase().includes(kw)))
    : rows;
  return { header: ['물질명','화학식','분류1','교사임장여부'], rows: filtered };
}

/* ------------------------- 승인된 신청서 조회 ------------------------- */
function getApprovedApplications(studentId, studentName) {
  // ★ SEC-P4: 학번 강제 + rate limit
  assertCallRateLimit_('getApprovedApplications', 30, 60);
  const _sid = getSessionStudentId_();
  if (_sid) studentId = _sid; // 학생은 본인만

  const sid  = normalizeStudentId_(studentId);
  const name = normalizeName_(studentName);
  if (!sid || !name) throw new Error('학번과 이름을 모두 입력하세요.');

  assertOwnerOrStaff_(sid, 'getApprovedApplications');

  const sh = getMainSheet_();
  const ss = sh.getParent();
  const vals = sh.getDataRange().getValues();
  const [hdr, ...rows] = vals;

  const idx = {
    id:      hdr.indexOf('신청ID'),
    sid:     hdr.indexOf('대표자학번'),
    name:    hdr.indexOf('대표자이름'),
    lab:     hdr.indexOf('신청실험실'),
    date:    hdr.indexOf('실험할날짜'),
    time:    hdr.indexOf('신청시간'),
    title:   hdr.indexOf('실험제목'),
    final:   hdr.indexOf('최종승인여부'),
    submit:  hdr.indexOf('제출일시')
  };

  const results = [];
  rows.forEach(r => {
    const rSid  = normalizeStudentId_(r[idx.sid]);
    const rName = normalizeName_(r[idx.name]);
    const rFinal = String(r[idx.final] || '').trim();
    if (rSid === sid && rName === name && rFinal === '승인') {
      results.push({
        id:     r[idx.id] || '',
        lab:    r[idx.lab] || '',
        date:   normalizeDateYMD_(r[idx.date]),
        time:   r[idx.time] || '',
        title:  r[idx.title] || '',
        submit: r[idx.submit] instanceof Date
          ? Utilities.formatDate(r[idx.submit], Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm')
          : String(r[idx.submit] || '')
      });
    }
  });

  results.sort((a, b) => (b.submit || '').localeCompare(a.submit || ''));
  return results;
}

/**
 * 승인된 신청서 한 건을 불러와서 form에 채울 수 있는 형태로 반환
 */
function loadApprovedApplication(appId) {
  const rec = getApplication(appId);
  if (!rec) throw new Error('신청 데이터를 찾을 수 없습니다.');

  return {
    studentId:        rec['대표자학번'] || '',
    studentName:      rec['대표자이름'] || '',
    date:             normalizeDateYMD_(rec['실험할날짜']),
    timeSlot:         rec['신청시간'] || '',
    lab:              rec['신청실험실'] || '',
    title:            rec['실험제목'] || '',
    purpose:          rec['사용목적'] || '',
    otherPurpose:     rec['사용목적 기타'] || '',
    advancedLab:      rec['첨단기기실 이용 여부'] || '',
    advancedLabReason: rec['첨단기기실 이용 사유'] || '',
    materials:        rec['실험준비물'] || '',
    hood:             rec['후드 사용 여부'] || '',
    hoodReason:       rec['후드 사용 사유'] || '',
    process:          rec['실험과정'] || '',
    cleanup:          rec['실험뒷정리'] || '',
    precautions:      rec['실험시 주의사항'] || '',
    safety:           rec['안전장구'] || '',
    teacher:          rec['지도교사이름'] || '',
    teacherEmail:     rec['지도교사이메일'] || '',
    teamMembers:      rec['동반자명단'] || '',
    totalParticipants: rec['총인원수'] || '',
    chemicals:        (rec.chemicals || []).map(c => ({
      '시약명':       c['시약명'] || '',
      '화학식':       c['화학식'] || '',
      '상태':         c['상태'] || c['분류1'] || '',
      '농도':         c['농도'] || '',
      '용량':         c['용량'] || c['사용량'] || '',
      '폐기 방법':    c['폐기 방법'] || c['폐수처리'] || '',
      'MSDS 및 취급 주의사항': c['MSDS 및 취급 주의사항'] || c['MSDS'] || '',
      '교사임장여부':  c['교사임장여부'] || c['교사 임장 여부'] || ''
    }))
  };
}

/* ================================================================
   Google Chat 웹훅 알림
   ================================================================ */

/**
 * 학생 신청 접수 시 Google Chat 스페이스에 카드 메시지 전송
 */
function sendChatNotification_(data, appId) {
  var webhookUrl = getChatWebhookUrl_();
  if (!webhookUrl) return;

  // 신규 양식 식별 — 양식종류·승인 단계·라벨이 모두 분기됨
  var formCategory = String(data.formCategory || '').trim().toLowerCase();
  var isNewLab    = !!(formCategory && NEW_LAB_CONFIG[formCategory]);
  var newCfg      = isNewLab ? NEW_LAB_CONFIG[formCategory] : null;

  // 신규 양식은 1차 단계가 없으므로 stage=final 로 직행
  // [v3.58 / 2-2] 토큰 부착 — 기존엔 t= 없이 생성되어 버튼 클릭 시 100% "접근 거부"였음.
  // [단일 승인 정책 변경 2026-08] 승인자 = 지도교사 → 토큰도 지도교사 이메일로 발급
  //   (실 담당 계정 토큰이면 지도교사가 Chat 버튼을 눌러도 수신자 불일치로 거부됨).
  var actionUrl;
  if (isNewLab) {
    var _apprEmail = String(data.teacherEmail || '').trim() || SCIENCE_EMAIL;
    var _chatTok = genApprovalToken_(appId, 'final', _apprEmail);
    actionUrl = getWebAppUrl_() + '?id=' + encodeURIComponent(appId) +
                '&stage=final&t=' + encodeURIComponent(_chatTok);
  } else {
    var _tEmail = String(data.teacherEmail || '').trim() || SCIENCE_EMAIL;
    var _chatTok1 = genApprovalToken_(appId, 'approve', _tEmail);
    actionUrl = getWebAppUrl_() + '?id=' + encodeURIComponent(appId) +
                '&t=' + encodeURIComponent(_chatTok1);
  }
  var actionLabel = isNewLab ? '최종 승인 페이지 열기' : '승인 페이지 열기';
  var headerTitle = isNewLab ? ('🔬 ' + newCfg.title + ' 사용 신청 접수') : '🔬 실험실 사용 신청 접수';

  // 폼 데이터 키와 시트 헤더 키 양쪽 모두 폴백 — 기존 버그(폼 키 누락) 함께 해소
  var labText = (Array.isArray(data.labRooms) && data.labRooms.length)
    ? data.labRooms.join(', ')
    : (data.lab || data['신청실험실'] || '-');
  var titleText   = data.title || data.practiceTopic || data['실험제목'] || '-';
  var teacherText = data.teacherName || data.teacher || data['지도교사이름'] || '-';
  var memberText  = (data.totalMembers || data.totalParticipants || data['총인원수'] || '1') + '명';

  var widgets = [
    { decoratedText: { topLabel: '실험·실습실', text: labText, startIcon: { knownIcon: 'HOTEL_ROOM_TYPE' } } },
    { decoratedText: { topLabel: '날짜 / 시간', text: (data.date || data['실험할날짜'] || '-') + '  |  ' + (data.timeSlot || data['신청시간'] || '-'), startIcon: { knownIcon: 'INVITE' } } },
    { decoratedText: { topLabel: '제목', text: titleText, startIcon: { knownIcon: 'BOOKMARK' } } },
    { decoratedText: { topLabel: '지도교사', text: teacherText, startIcon: { knownIcon: 'PERSON' } } },
    { decoratedText: { topLabel: '인원', text: memberText, startIcon: { knownIcon: 'MULTIPLE_PEOPLE' } } }
  ];

  // 신규 양식 추가 정보
  if (isNewLab) {
    widgets.unshift({
      decoratedText: {
        topLabel: '양식 종류',
        text: newCfg.sheetCategory + ' · 단일 승인',
        startIcon: { knownIcon: 'BOOKMARK' }
      }
    });
    if (formCategory === 'it') {
      if (data.computerNumbers) {
        widgets.push({
          decoratedText: {
            topLabel: '사용 컴퓨터 번호',
            text: String(data.computerNumbers),
            startIcon: { knownIcon: 'DESCRIPTION' }
          }
        });
      }
      if (data.soldering) {
        widgets.push({
          decoratedText: {
            topLabel: '납땜 사용 여부',
            text: String(data.soldering),
            startIcon: { knownIcon: 'STAR' }
          }
        });
      }
    }
    if (formCategory === 'home') {
      var dt = (Array.isArray(data.dangerousTools) && data.dangerousTools.length)
        ? data.dangerousTools.join(', ') : '없음';
      widgets.push({
        decoratedText: {
          topLabel: '사용 위험 도구',
          text: dt,
          startIcon: { knownIcon: 'STAR' }
        }
      });
    }
  }

  var card = {
    cardsV2: [{
      cardId: 'app-' + appId,
      card: {
        header: {
          title: headerTitle,
          subtitle: (data.studentName || '') + ' (' + (data.studentId || '') + ')',
          imageUrl: 'https://fonts.gstatic.com/s/i/short-term/release/googlesymbols/science/default/48px.svg',
          imageType: 'CIRCLE'
        },
        sections: [
          { header: '신청 정보', widgets: widgets },
          // [2026-08-19] 신규 양식(단일 승인)은 Chat 카드에 승인 버튼을 넣지 않는다.
          //   최종 단계 토큰은 multi-account 편의를 위해 "교사 명단의 교사면 통과"로
          //   완화돼 있는데(v3.58 / verifyApprovalToken_), 1차 단계가 없는 단일 승인에서는
          //   이 버튼 하나가 유일한 인증 관문이 된다. 공용 스페이스에 노출된 버튼을
          //   다른 교사가 눌러 남이 지도하는 신청을 승인해 버릴 수 있으므로,
          //   승인은 지도교사 본인 메일의 링크로만 진행하도록 하고 카드는 알림 전용으로 둔다.
          isNewLab
            ? { widgets: [{ textParagraph: {
                  text: '승인은 <b>지도교사에게 발송된 메일의 링크</b>로 진행해 주세요.'
                } }] }
            : {
                widgets: [{
                  buttonList: {
                    buttons: [{
                      text: actionLabel,
                      onClick: { openLink: { url: actionUrl } },
                      color: { red: 0.08, green: 0.49, blue: 0.2, alpha: 1 }
                    }]
                  }
                }]
              }
        ]
      }
    }]
  };

  try {
    UrlFetchApp.fetch(webhookUrl, {
      method: 'post',
      contentType: 'application/json; charset=UTF-8',
      payload: JSON.stringify(card),
      muteHttpExceptions: true
    });
    Logger.log('[sendChatNotification_] Chat 알림 전송 성공 - appId: ' + appId);
  } catch (e) {
    Logger.log('[sendChatNotification_] Chat 알림 전송 실패: ' + e.message);
  }
}

/**
 * 미발신/미수신 진단 — GAS 편집기에서 수동 실행. Logger 출력 확인.
 *  1) Gmail 보낸편지함의 최근 7일 자동 메일 카운트 (발신 사실 입증)
 *  2) "이메일발송로그" 시트의 최근 통계 (성공/실패율)
 *  3) Gmail 별칭 등록 여부 (from 옵션 활성 여부)
 */
function diagnoseMailDelivery() {
  const out = [];
  out.push('=== 메일 발송 진단 ' + new Date().toISOString() + ' ===');

  // 1. Gmail 보낸편지함 — 최근 7일 자동 메일
  try {
    const since = new Date(); since.setDate(since.getDate() - 7);
    const dateStr = Utilities.formatDate(since, Session.getScriptTimeZone(), 'yyyy/MM/dd');
    const threads = GmailApp.search('subject:("[실험" OR "[실험·실습실" OR "[실험실") after:' + dateStr, 0, 50);
    out.push('Gmail 보낸편지함 — 최근 7일 자동 메일 thread 수: ' + threads.length);
    let totalMsgs = 0;
    threads.slice(0, 10).forEach(function(t){
      const msgs = t.getMessages();
      totalMsgs += msgs.length;
      const last = msgs[msgs.length - 1];
      out.push('  · ' + Utilities.formatDate(last.getDate(), Session.getScriptTimeZone(), 'MM-dd HH:mm') +
        ' → ' + last.getTo() + ' / ' + last.getSubject().slice(0, 60));
    });
    out.push('  ... 총 메시지 수 (상위 10 thread): ' + totalMsgs);
  } catch (e) { out.push('Gmail 검색 에러: ' + e.message); }

  // 2. 이메일발송로그 시트 통계
  try {
    const ss = SpreadsheetApp.openById(MAIN_SSID);
    const sh = ss.getSheetByName('이메일발송로그');
    if (!sh) {
      out.push('"이메일발송로그" 시트 없음 — v3.12 배포 후 첫 발송부터 기록됨');
    } else {
      const v = sh.getDataRange().getValues();
      if (v.length < 2) {
        out.push('"이메일발송로그" 시트 비어 있음');
      } else {
        const since = new Date(); since.setDate(since.getDate() - 7);
        const recent = v.slice(1).filter(function(r){ return r[0] instanceof Date && r[0] >= since; });
        const ok = recent.filter(function(r){ return r[3] === 'ok'; }).length;
        const fail = recent.filter(function(r){ return r[3] === 'fail'; }).length;
        out.push('"이메일발송로그" 최근 7일: 성공 ' + ok + ' / 실패 ' + fail);
        const failRows = recent.filter(function(r){ return r[3] === 'fail'; }).slice(-5);
        if (failRows.length) {
          out.push('  최근 실패 5건:');
          failRows.forEach(function(r){
            out.push('  · ' + Utilities.formatDate(r[0], Session.getScriptTimeZone(), 'MM-dd HH:mm') +
              ' → ' + r[1] + ' / ' + r[2].slice(0, 50) + ' / ' + r[4]);
          });
        }
      }
    }
  } catch (e) { out.push('로그 시트 조회 에러: ' + e.message); }

  // 3. Gmail 별칭
  try {
    const aliases = GmailApp.getAliases();
    out.push('Gmail 별칭: [' + aliases.join(', ') + '] / SCIENCE_EMAIL 등록: ' + (aliases.indexOf(SCIENCE_EMAIL) !== -1 ? 'YES' : 'NO'));
  } catch (e) { out.push('별칭 조회 에러: ' + e.message); }

  const result = out.join('\n');
  Logger.log(result);
  return result;
}

/**
 * 최종 승인 요청 메일 발송 + 반송 진단 (수동 실행 또는 ?diag=finalapproval)
 *  - 보낸편지함의 "[실험실 최종 승인 요청]" 메일들 시간/수신자
 *  - 받은편지함의 mailer-daemon / postmaster 반송 알림
 *  - 두 가지를 매칭해서 어떤 발송이 반송됐는지 식별
 */
function diagnoseFinalApprovalDelivery_() {
  const out = [];
  out.push('=== 담당교사 최종 승인 요청 메일 진단 ' + new Date().toISOString() + ' ===');
  const tz = Session.getScriptTimeZone();
  const fmt = function(d) { return Utilities.formatDate(d, tz, 'MM-dd HH:mm'); };
  const since = new Date();
  since.setDate(since.getDate() - 14);
  const dateStr = Utilities.formatDate(since, tz, 'yyyy/MM/dd');

  // 1) 보낸편지함 — 최근 14일 [실험실 최종 승인 요청]
  const sentByRecipient = {};
  try {
    const threads = GmailApp.search('in:sent subject:"[실험실 최종 승인 요청]" after:' + dateStr, 0, 100);
    out.push('\n[1] 보낸편지함 — "[실험실 최종 승인 요청]" 최근 14일 thread: ' + threads.length);
    threads.forEach(function(t) {
      t.getMessages().forEach(function(m) {
        const to = String(m.getTo() || '').toLowerCase();
        sentByRecipient[to] = (sentByRecipient[to] || 0) + 1;
        out.push('  · ' + fmt(m.getDate()) + ' → ' + m.getTo() + ' / ' + m.getSubject().slice(0, 60));
      });
    });
  } catch (e) { out.push('보낸편지함 검색 에러: ' + e.message); }

  // 2) 받은편지함 — 반송 알림
  try {
    const bounceThreads = GmailApp.search(
      '(from:"mailer-daemon" OR from:"postmaster" OR subject:"Delivery Status" OR subject:"Undelivered" OR subject:"반송")' +
      ' after:' + dateStr, 0, 50);
    out.push('\n[2] 받은편지함 — 반송 알림 thread: ' + bounceThreads.length);
    bounceThreads.forEach(function(t) {
      const m = t.getMessages()[0];
      out.push('  · ' + fmt(m.getDate()) + ' / ' + m.getFrom() + ' / ' + m.getSubject().slice(0, 80));
      // 반송 본문에서 원본 수신자 추출 시도
      try {
        const body = (m.getPlainBody() || '').slice(0, 2000);
        const matches = body.match(/[\w.+-]+@[\w-]+\.[\w.-]+/g) || [];
        const recipients = matches.filter(function(x) { return /@cnsa\.hs\.kr$/i.test(x); });
        if (recipients.length) {
          out.push('    추정 원본 수신자: ' + recipients.join(', '));
        }
      } catch (_) {}
    });
  } catch (e) { out.push('반송 검색 에러: ' + e.message); }

  // 3) 발송 통계 by 수신자
  out.push('\n[3] 최종 승인 요청 발송 카운트 (수신자별, 최근 14일)');
  const keys = Object.keys(sentByRecipient).sort();
  if (keys.length === 0) {
    out.push('  (발송 기록 없음)');
  } else {
    keys.forEach(function(k) { out.push('  · ' + k + ' → ' + sentByRecipient[k] + '건'); });
  }

  return out.join('\n');
}

/**
 * 1차 승인 완료 + 최종 대기 신청 + 해당 건에 대한 최종 승인 요청 메일 발송 여부 매칭.
 * "발송됐어야 하는데 안 된 건"이 있는지 확인.
 */
function diagnoseManualFallback_() {
  const out = [];
  const tz = Session.getScriptTimeZone();
  const fmt = function(d) { return Utilities.formatDate(d, tz, 'MM-dd HH:mm'); };
  const since = new Date(); since.setDate(since.getDate() - 30);
  const dateStr = Utilities.formatDate(since, tz, 'yyyy/MM/dd');

  out.push('=== [수동 처리 요청] / 폴백 메일 진단 (최근 30일) ===\n');

  // 1) 보낸편지함 [수동 처리 요청] 메일 — submitApproval_ catch 블록이 트리거된 흔적
  try {
    const sent = GmailApp.search('in:sent subject:"[수동 처리 요청]" after:' + dateStr, 0, 50);
    out.push('[1] 보낸편지함 "[수동 처리 요청]" thread: ' + sent.length);
    sent.forEach(function(t) {
      t.getMessages().forEach(function(m) {
        out.push('  · ' + fmt(m.getDate()) + ' → ' + m.getTo() + ' / ' + m.getSubject().slice(0, 80));
      });
    });
  } catch (e) { out.push('보낸편지함 검색 에러: ' + e.message); }

  // 2) 받은편지함 — danieal712가 cnsa.science 명의로 받은 [수동 처리 요청]
  try {
    const got = GmailApp.search('in:inbox subject:"[수동 처리 요청]" after:' + dateStr, 0, 50);
    out.push('\n[2] 받은편지함 "[수동 처리 요청]" thread: ' + got.length + ' (실행 사용자 받은편지함)');
    got.forEach(function(t) {
      const m = t.getMessages()[0];
      out.push('  · ' + fmt(m.getDate()) + ' / ' + m.getFrom() + ' / ' + m.getSubject().slice(0, 80));
    });
  } catch (e) { out.push('받은편지함 검색 에러: ' + e.message); }

  // 3) 이혜원 건 보낸편지함 광범위 검색 — chem_lab 또는 SCIENCE_EMAIL로 발송됐는지
  try {
    const lookFor = GmailApp.search('in:sent (to:chem_lab OR to:cnsa.science) "이혜원" after:2026/05/05', 0, 20);
    out.push('\n[3] 이혜원 관련 chem_lab/cnsa.science 발송 흔적: ' + lookFor.length);
    lookFor.forEach(function(t) {
      t.getMessages().forEach(function(m) {
        out.push('  · ' + fmt(m.getDate()) + ' → ' + m.getTo() + ' / ' + m.getSubject().slice(0, 80));
      });
    });
  } catch (e) { out.push('이혜원 검색 에러: ' + e.message); }

  // 4) 이혜원 학생(20223@cnsa.hs.kr)에게 보낸 1차 승인 메일 (있으면 submitApproval_ 호출됐다는 의미)
  try {
    const stuMail = GmailApp.search('in:sent to:20223@cnsa.hs.kr after:2026/05/05', 0, 20);
    out.push('\n[4] 이혜원 학생(20223)에게 보낸 메일 (5/5 이후): ' + stuMail.length);
    stuMail.forEach(function(t) {
      t.getMessages().forEach(function(m) {
        out.push('  · ' + fmt(m.getDate()) + ' / ' + m.getSubject().slice(0, 80));
      });
    });
  } catch (e) { out.push('학생 메일 검색 에러: ' + e.message); }

  // 5) 이수진 지도교사에게 보낸 1차 승인 요청 (이수진이 메일 받았는지)
  try {
    const teacherMail = GmailApp.search('in:sent to:leesoojin067@cnsa.hs.kr "이혜원" after:2026/05/05', 0, 20);
    out.push('\n[5] 이수진 선생님에게 보낸 이혜원 관련 메일: ' + teacherMail.length);
    teacherMail.forEach(function(t) {
      t.getMessages().forEach(function(m) {
        out.push('  · ' + fmt(m.getDate()) + ' / ' + m.getSubject().slice(0, 80));
      });
    });
  } catch (e) { out.push('이수진 검색 에러: ' + e.message); }

  // 6) leesoojin067 받은 모든 메일 (이수진이 어떤 메일이라도 받았는지 광범위)
  try {
    const allTeacherMail = GmailApp.search('in:sent to:leesoojin067 after:2026/05/05', 0, 20);
    out.push('\n[6] 이수진 선생님(leesoojin067)에게 5/5 이후 보낸 모든 메일: ' + allTeacherMail.length);
    allTeacherMail.forEach(function(t) {
      t.getMessages().forEach(function(m) {
        out.push('  · ' + fmt(m.getDate()) + ' / ' + m.getSubject().slice(0, 80));
      });
    });
  } catch (e) { out.push('이수진 광범위 검색 에러: ' + e.message); }

  // 7) 이혜원 학생 검색 광범위 (학번 도메인)
  try {
    const stuAll = GmailApp.search('in:sent (to:20223 OR "이혜원") after:2026/05/05', 0, 20);
    out.push('\n[7] 이혜원 또는 20223 관련 모든 발송 메일: ' + stuAll.length);
    stuAll.forEach(function(t) {
      t.getMessages().forEach(function(m) {
        out.push('  · ' + fmt(m.getDate()) + ' → ' + m.getTo() + ' / ' + m.getSubject().slice(0, 80));
      });
    });
  } catch (e) { out.push('광범위 검색 에러: ' + e.message); }

  return out.join('\n');
}

function diagnosePendingFinalApproval_(labFilter) {
  const out = [];
  const tz = Session.getScriptTimeZone();
  const fmt = function(d) { return d instanceof Date ? Utilities.formatDate(d, tz, 'MM-dd HH:mm') : String(d || '-'); };

  // 1) MAIN 시트에서 1차 승인 완료 + 최종 대기 건 추출
  const sh = getMainSheet_();
  const ss = sh.getParent();
  const vals = sh.getDataRange().getValues();
  const hdr = vals[0];
  const idxId = hdr.indexOf('신청ID');
  const idxName = hdr.indexOf('대표자이름');
  const idxStu = hdr.indexOf('대표자학번');
  const idxLab = hdr.indexOf('신청실험실');
  const idxDate = hdr.indexOf('실험할날짜');
  const idxStg1 = hdr.indexOf('지도승인여부');
  const idxStgF = hdr.indexOf('최종승인여부');
  const idxSubmit = hdr.indexOf('제출일시');
  const idxTeacher = hdr.indexOf('지도교사이름');
  const idxTeacherEmail = hdr.indexOf('지도교사이메일');
  const idxStg1Comm = hdr.indexOf('지도승인의견');
  // [검토반영] 신규 양식(IT/가정/공학)은 1차 단계가 없어 '지도승인여부'가 항상 비어 있음.
  //   기존엔 1차 승인된 건만 훑어 단일 승인 대기 건을 "없음"으로 보고했음.
  const idxFormType = hdr.indexOf('양식종류');

  const filterLab = String(labFilter || '').trim();
  const pending = [];
  for (let i = 1; i < vals.length; i++) {
    const r = vals[i];
    const stage1 = String(r[idxStg1] || '').trim();
    const stageF = String(r[idxStgF] || '').trim();
    const formType = idxFormType !== -1 ? String(r[idxFormType] || '').trim() : '';
    const isSingleApproval = !!formType && !/^S동/.test(formType); // IT실·가정실습실·N동 공학…
    if (stage1 !== '승인' && !isSingleApproval) continue;
    if (stageF === '승인' || stageF === '반려') continue; // 이미 처리된 건 제외
    const lab = String(r[idxLab] || '').trim();
    if (filterLab && !lab.includes(filterLab) && !filterLab.includes(lab)) continue;
    pending.push({
      id: String(r[idxId] || ''),
      name: String(r[idxName] || ''),
      sid: String(r[idxStu] || ''),
      lab: lab,
      date: r[idxDate],
      submit: r[idxSubmit],
      teacher: idxTeacher >= 0 ? String(r[idxTeacher] || '') : '',
      teacherEmail: idxTeacherEmail >= 0 ? String(r[idxTeacherEmail] || '') : '',
      teacherComment: idxStg1Comm >= 0 ? String(r[idxStg1Comm] || '') : ''
    });
  }
  out.push('=== 1차 승인 완료 + 최종 대기 건 ' + (filterLab ? '(필터: ' + filterLab + ')' : '') + ': ' + pending.length + ' ===');

  // 2) 각 건에 대해 보낸편지함 검색
  pending.forEach(function(p) {
    let mailSent = '?';
    try {
      const threads = GmailApp.search('in:sent subject:"[실험실 최종 승인 요청]" "' + p.sid + ' ' + p.name + '"', 0, 5);
      mailSent = threads.length > 0 ? '✓ ' + threads.length + '건 발송됨' : '✗ 발송 기록 없음';
    } catch (e) { mailSent = '검색에러: ' + e.message; }
    out.push('• [' + p.id + '] ' + p.name + ' (' + p.sid + ') / ' + p.lab +
      ' / 실험일=' + fmt(p.date) + ' / 제출=' + fmt(p.submit) + ' → ' + mailSent);
    out.push('   지도교사: ' + (p.teacher || '(없음)') + ' <' + (p.teacherEmail || '없음') + '>');
    if (p.teacherComment) out.push('   지도승인의견: ' + p.teacherComment.slice(0, 200));
  });

  if (pending.length === 0) {
    out.push('현재 1차 승인 완료된 후 최종 대기 중인 신청 건 없음.');
  }

  return out.join('\n');
}

/**
 * Chat 웹훅 URL을 스크립트 속성에 설정하는 유틸 함수
 * GAS 편집기에서 직접 실행하여 설정
 */
function setChatWebhookUrl(url) {
  PropertiesService.getScriptProperties().setProperty('CHAT_WEBHOOK_URL', url);
  Logger.log('Chat 웹훅 URL 설정 완료: ' + url);
}


