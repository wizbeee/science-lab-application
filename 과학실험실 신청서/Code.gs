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

/* ------------------------- 공통 유틸 ------------------------- */
/** HTML 특수문자 이스케이프 (이메일 XSS 방지) */
function escapeHtml_(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
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
  return checked && isClubPurpose && isTuesday;
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
 * HTML 이메일 래퍼 - 깔끔한 이메일 포맷
 */
function buildEmailHtml_(title, bodyLines, linkUrl, linkLabel) {
  const rows = bodyLines.map(l => {
    if (l === '') return '<br>';
    if (l.startsWith('•')) return `<div style="padding:2px 0 2px 12px;">${l}</div>`;
    return `<div style="padding:2px 0;">${l}</div>`;
  }).join('');
  const safeUrl = linkUrl ? escapeHtml_(linkUrl) : '';
  const linkBlock = safeUrl
    ? `<div style="margin:18px 0;"><a href="${safeUrl}" style="display:inline-block;padding:10px 24px;background:#4285F4;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold;">${linkLabel || '바로가기'}</a></div>`
    : '';
  return `<div style="font-family:'맑은 고딕',Arial,sans-serif;max-width:620px;margin:0 auto;padding:20px;">
    <h2 style="color:#333;border-bottom:2px solid #4285F4;padding-bottom:8px;">${title}</h2>
    <div style="line-height:1.8;color:#444;">${rows}</div>
    ${linkBlock}
    <hr style="border:none;border-top:1px solid #eee;margin:24px 0 8px;">
    <div style="font-size:12px;color:#999;">본 메일은 과학 실험·실습실 신청 시스템에서 자동 발송되었습니다.</div>
  </div>`;
}

/**
 * 공통 메일 발송 함수
 * - 발신자를 SCIENCE_EMAIL로 통일
 * - 이메일 형식 기본 검증
 * - 실패 시 로깅 + 결과 객체 반환
 * @param {string} to       수신자 이메일
 * @param {string} subject  제목
 * @param {string} htmlBody HTML 본문
 * @returns {{ ok: boolean, error?: string }}
 */
function sendMail_(to, subject, htmlBody) {
  const addr = String(to || '').trim();
  if (!addr || !/@/.test(addr)) {
    const msg = '유효하지 않은 이메일 주소: ' + addr;
    Logger.log('[sendMail_] ' + msg);
    return { ok: false, error: msg };
  }
  try {
    GmailApp.sendEmail(addr, subject, '', {
      from: SCIENCE_EMAIL,
      htmlBody: htmlBody
    });
    return { ok: true };
  } catch (e) {
    const msg = String(e.message || e);
    Logger.log('[sendMail_] 발송 실패 (' + addr + '): ' + msg);
    return { ok: false, error: msg };
  }
}

/** 학생 이메일 주소 생성 (학번 5자리 → 학번@cnsa.hs.kr) */
function getStudentEmail_(studentId) {
  const sid = String(studentId || '').trim();
  if (!sid || !/^\d{5}$/.test(sid)) return '';
  return sid + '@cnsa.hs.kr';
}

/** 학생에게 신청 완료 안내 */
function sendStudentSubmitEmail_(data, appId) {
  const email = getStudentEmail_(data.studentId);
  if (!email) return { ok: false, error: '학번 누락' };
  const e = escapeHtml_;
  const subject = `[실험·실습실 신청 완료] ${e(data.studentName)}님의 신청이 접수되었습니다`;
  const body = buildEmailHtml_('실험·실습실 신청 완료 안내', [
    `${e(data.studentName)}님, 과학 실험·실습실 사용 신청이 정상적으로 접수되었습니다.`,
    '',
    `• 신청 ID: ${e(appId)}`,
    `• 실험실: ${e(data.lab)}`,
    `• 실험 날짜: ${e(data.date)}`,
    `• 시간: ${e(data.timeSlot)}`,
    `• 실험 제목: ${e(data.title)}`,
    '',
    '지도교사의 1차 승인 후 실험실 담당교사의 최종 승인을 거쳐 확정됩니다.',
    '승인/반려 결과는 이메일로 안내됩니다.'
  ]);
  return sendMail_(email, subject, body);
}

/** 지도교사에게 1차 승인 요청 */
function sendTeacherApprovalEmail_(data, appId) {
  const email = String(data.teacherEmail || '').trim();
  if (!email) return { ok: false, error: '지도교사 이메일 누락' };
  const e = escapeHtml_;
  const url = ScriptApp.getService().getUrl() + '?id=' + encodeURIComponent(appId);
  const subject = `[실험·실습실 1차 승인 요청] ${e(data.studentName)} (${e(data.studentId)})`;
  const body = buildEmailHtml_('실험·실습실 1차 승인 요청', [
    '학생이 과학 실험·실습실 사용을 신청했습니다. 확인 후 승인/반려 처리를 해주세요.',
    '',
    `• 대표자: ${e(data.studentName)} (${e(data.studentId)})`,
    `• 실험실: ${e(data.lab)}`,
    `• 날짜/시간: ${e(data.date)} / ${e(data.timeSlot)}`,
    `• 실험 제목: ${e(data.title)}`,
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
    `• 실험 제목: ${e(rec['실험제목'] || '')}`,
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
    `• 실험 제목: ${e(rec['실험제목'] || '')}`,
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

/** 실험실 담당교사에게 최종 승인 요청 */
function sendLabTeacherFinalEmail_(rec, appId) {
  const labData = SpreadsheetApp.openById(LAB_TEACHER_SSID).getSheets()[0].getDataRange().getValues();
  const [labHdr, ...labRows] = labData;

  const labIdx = labHdr.findIndex(h => {
    const t = String(h).trim();
    return t === '담당 실험실' || t === '담당실험실';
  });
  const mailIdx = labHdr.findIndex(h => {
    const t = String(h).trim();
    return t === '이메일 주소' || t === '이메일주소';
  });

  if (labIdx === -1) throw new Error('담당교사 시트에 "담당 실험실" 열을 찾을 수 없습니다.');
  if (mailIdx === -1) throw new Error('담당교사 시트에 "이메일 주소" 열을 찾을 수 없습니다.');

  const labName = String(rec['신청실험실'] || '').trim();

  const toRow = labRows.find(r => String(r[labIdx]).trim() === labName);
  if (!toRow || !toRow[mailIdx]) throw new Error(`담당교사 이메일을 찾을 수 없습니다: ${labName}`);
  const teacherEmail = String(toRow[mailIdx]).trim();

  const e = escapeHtml_;
  const url = ScriptApp.getService().getUrl() + '?id=' + encodeURIComponent(appId) + '&stage=final';
  const subject = `[실험실 최종 승인 요청] ${e(rec['대표자학번'])} ${e(rec['대표자이름'])}`;
  const body = buildEmailHtml_('실험실 최종 승인 요청', [
    '지도교사의 1차 승인이 완료된 신청입니다. 최종 승인/반려를 처리해주세요.',
    '',
    `• 대표자: ${e(rec['대표자이름'])} (${e(rec['대표자학번'])})`,
    `• 실험실: ${e(rec['신청실험실'])}`,
    `• 날짜/시간: ${normalizeDateYMD_(rec['실험할날짜'])} / ${e(rec['신청시간'])}`,
    `• 실험 제목: ${e(rec['실험제목'] || '')}`,
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
    `• 실험 제목: ${e(rec['실험제목'] || '')}`,
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
    `• 실험 제목: ${e(rec['실험제목'] || '')}`,
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
  if (!email) return { ok: false, error: '지도교사 이메일 누락' };
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
    `• 실험 제목: ${e(rec['실험제목'] || '')}`,
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
  try { ensurePurgeTrigger_(); } catch (_) { /* 권한 부족 시 무시 */ }

  const id   = e.parameter.id   || '';
  const page = e.parameter.page || '';

  let tpl;

  // ── 1) 승인 링크 (id가 있으면 기존 로직)
  if (id) {
    if (e.parameter.stage === 'final') {
      tpl = HtmlService.createTemplateFromFile('finalApprove');
      try { tpl.appData = getApplication(id); }
      catch (err) { tpl.appData = { __error: String(err && err.message ? err.message : err) }; }
    } else {
      tpl = HtmlService.createTemplateFromFile('approve');
      try { tpl.appData = getApplication(id); }
      catch (err) { tpl.appData = { __error: String(err && err.message ? err.message : err) }; }
    }
    tpl.id = id;
    tpl.webAppUrl = ScriptApp.getService().getUrl();
    return tpl.evaluate()
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
      .setTitle(e.parameter.stage === 'final' ? '최종 승인/반려' : '실험·실습실 신청 승인');
  }

  // ── 2) 1층 실험실 신청서
  if (page === 'form') {
    tpl = HtmlService.createTemplateFromFile('form');
    tpl.id = '';
    tpl.webAppUrl = ScriptApp.getService().getUrl();
    return tpl.evaluate()
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
      .setTitle('과학 실험·실습실 사용 신청서(S동 1층)');
  }

  // ── 3) 2·3층 실험실 신청서
  if (page === 'form2f') {
    tpl = HtmlService.createTemplateFromFile('form2f');
    tpl.id = '';
    tpl.webAppUrl = ScriptApp.getService().getUrl();
    return tpl.evaluate()
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
      .setTitle('과학 실험·실습실 사용 신청서(S동 2·3층)');
  }

  // ── 4) 기본: 게이트웨이
  tpl = HtmlService.createTemplateFromFile('gateway');
  tpl.webAppUrl = ScriptApp.getService().getUrl();
  return tpl.evaluate()
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .setTitle('과학 실험·실습실 사용 신청');
}
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
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

      if (nameIdx === -1 && formulaIdx === -1) return [];

      return rows
        .slice(2)
        .filter(r => r[nameIdx] || r[formulaIdx])
        .map(r => {
          const nm = r[nameIdx]      || '';
          const fm = r[formulaIdx]   || '';
          const c1 = (classIdx !== -1 ? r[classIdx] : '') || '';
          const g  = (guidanceIdx !== -1 ? r[guidanceIdx] : '') || '';
          return {
            '물질명': nm,
            '화학식': fm,
            '분류1':  c1,
            '교사임장여부': g,
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

/** ✅ 테이블 전용 목록 */
function getChemicalListForTable() {
  const header = ['물질명', '화학식', '분류1', '교사임장여부'];
  const list = getChemicalList();
  const rows = list.map(o => [
    o['물질명'] || o.name || '',
    o['화학식'] || o.formula || '',
    o['분류1']  || o.class1 || o.classification || '',
    o['교사임장여부'] || o.guidance || ''
  ]);
  return { header, rows };
}

function getTeacherList() {
  const rows = SpreadsheetApp.openById(TEACHER_LIST_SSID).getSheets()[0].getDataRange().getValues();
  const [hdr, ...data] = rows;
  const nameIdx = hdr.indexOf('교사이름');
  const emailIdx = hdr.indexOf('이메일주소') !== -1 ? hdr.indexOf('이메일주소') : hdr.indexOf('이메일 주소');
  const subjectIdx = hdr.indexOf('과목');
  return data.filter(r => r[nameIdx]).map(r => ({ name:r[nameIdx], email:r[emailIdx], subject:r[subjectIdx] || '' }));
}

/* ------------------------- 신청제한명단 ------------------------- */
function getRestrictedList() {
  const ss = SpreadsheetApp.openById(MAIN_SSID);
  const sh = ss.getSheetByName('신청제한명단');
  if (!sh) return [];
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return [];
  const ids = sh.getRange(2, 1, lastRow - 1, 1).getValues()
    .flat().map(v => String(v || '').trim()).filter(s => /^\d{5}$/.test(s));
  return Array.from(new Set(ids));
}

/* ======================================================================= */
/* 🔴 여기부터는 "캘린더 기반 차단" + "차단/불가/신청불가 단어 규칙"을 반영한 버전 */
/* ======================================================================= */

/**
 * ✅ 자연어 기반 차단 패턴을 찾아주는 헬퍼
 */
function matchBlockByWords_(text) {
  const labs = ['화학실험실', '생물실험실', '프로젝트실험실', '첨단기기실험실', '오픈랩',
                '물리실험실', '파동광학실험실', 'AP Lab', 'Tech&Art Lab'];
  const times = ['ET', 'EP1', '7교시'];
  const blockWords = ['차단', '불가', '신청불가', '신청 불가'];

  const found = {
    allBlocked: false,
    labs: [],
    times: []
  };

  const t = String(text || '').trim();

  if (
    /전체\s*(차단|불가)/.test(t) ||
    /전체\s*(신청\s*불가|신청불가)/.test(t) ||
    /전체\s*실험실\s*(신청\s*불가|신청불가)/.test(t)
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
        const re = new RegExp(lab + '\\s*' + slot + '.*(' + blockWords.join('|') + ')');
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
    const re = new RegExp(slot + '.*(' + blockWords.join('|') + ')');
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
 */
function parseCalendarEventForBlocks_(title, desc) {
  const text = ((title || '') + ' ' + (desc || '')).trim();
  const upper = text.toUpperCase();

  const out = {
    allBlocked: false,
    labs: [],
    times: []
  };

  if (upper.indexOf('[BLOCK]') !== -1 || text.indexOf('[전체불가]') !== -1) {
    out.allBlocked = true;
  }

  const labRegex = /\[lab:([^\]]+)\]/ig;
  let m;
  while ((m = labRegex.exec(text)) !== null) {
    const labName = m[1].trim();
    if (labName && out.labs.indexOf(labName) === -1) {
      out.labs.push(labName);
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

  const LEGACY_LABS = ['화학실험실', '생물실험실', '프로젝트실험실', '첨단기기실험실', '오픈랩',
                       '물리실험실', '파동광학실험실', 'AP Lab', 'Tech&Art Lab'];
  LEGACY_LABS.forEach(lab => {
    if (text.indexOf(lab) !== -1 && out.labs.indexOf(lab) === -1) {
      out.labs.push(lab);
    }
  });

  const LEGACY_TIMES = ['ET', 'EP1', '7교시'];
  LEGACY_TIMES.forEach(t => {
    if (upper.indexOf(t) !== -1 && out.times.indexOf(t) === -1) {
      out.times.push(t);
    }
  });

  const nat = matchBlockByWords_(text);
  if (nat.allBlocked) {
    out.allBlocked = true;
  }
  (nat.labs || []).forEach(l => {
    if (out.labs.indexOf(l) === -1) {
      out.labs.push(l);
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
 */
function getCalendarBlocks(dateStr) {
  if (!dateStr) {
    return { allBlocked: false, blockedLabs: [], blockedTimes: [], perLabTimes: {}, message: '' };
  }

  const cache = CacheService.getScriptCache();
  const cacheKey = 'cal-block:' + dateStr;
  const cached = cache.get(cacheKey);
  if (cached) {
    return JSON.parse(cached);
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
 * ✅ 클라이언트가 날짜를 선택했을 때 비활성화할 실험실/시간 목록
 */
function getUnavailableForDate(dateStr) {
  const cal = getCalendarBlocks(dateStr);

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


/* ------------------------- ✅ 시약명/폐기분류/분류1 정규화 유틸 ------------------------- */
function normalizeChemName_(name) {
  if (!name) return '';
  let s = String(name).toLowerCase();
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
  return '';
}

/** ✅ 관리대장 (물질명 → 분류1) 매핑 */
function getClass1Map_() {
  const ss = SpreadsheetApp.openById(CHEM_MASTER_SSID);
  const map = Object.create(null);
  ss.getSheets().forEach(s => {
    const vals = s.getDataRange().getValues();
    if (vals.length < 3) return;
    const hdr = vals[1].map(v => String(v || '').trim());
    const nameIdx = hdr.indexOf('물질명');

    let c1Idx = hdr.indexOf('분류1');
    if (c1Idx === -1) c1Idx = hdr.indexOf('분류 1');
    if (c1Idx === -1) c1Idx = hdr.indexOf('상태');

    if (nameIdx === -1 || c1Idx === -1) return;
    vals.slice(2).forEach(r => {
      const nmRaw = String(r[nameIdx] || '').trim();
      const c1Raw = String(r[c1Idx]   || '').trim();
      const key = normalizeChemName_(nmRaw);
      if (key && c1Raw) map[key] = c1Raw;
    });
  });
  return map;
}

/* ------------------------- ✅ 시약 폐기 분류 검증 ------------------------- */
function getDisposalMap_() {
  const ss = SpreadsheetApp.openById(CHEM_MASTER_SSID);
  const map = Object.create(null);
  ss.getSheets().forEach(s => {
    const vals = s.getDataRange().getValues();
    if (vals.length < 3) return;
    const hdr = vals[1].map(v => String(v || '').trim());
    const nameIdx = hdr.indexOf('물질명');
    const dispIdx = hdr.indexOf('폐수 처리 분류');
    if (nameIdx === -1 || dispIdx === -1) return;
    vals.slice(2).forEach(r => {
      const nmRaw = String(r[nameIdx] || '').trim();
      const dpRaw = String(r[dispIdx] || '').trim();
      const nm = normalizeChemName_(nmRaw);
      const dp = canonDisposal_(dpRaw);
      if (nm && dp) map[nm] = dp;
    });
  });
  return map;
}
function validateChemicals(chems) {
  const dispMap = getDisposalMap_();
  const mismatches = [];
  (chems || []).forEach(c => {
    const nameRaw = String((c && (c.name || c['시약명'] || c['물질명'])) || '').trim();
    const gotRaw  = String((c && (c.disposal || c['폐기 방법'] || c['폐수처리'] || c['폐기'])) || '').trim();
    if (!nameRaw || !gotRaw) return;
    const key = normalizeChemName_(nameRaw);
    const got = canonDisposal_(gotRaw);
    const expected = dispMap[key] || '';
    if (!expected || expected !== got) {
      mismatches.push({ name: nameRaw, expected: expected || '(관리대장 없음)', got: gotRaw });
    }
  });
  return { ok: mismatches.length === 0, mismatches };
}
/** ✅ 버튼 호출 전용(스로틀) */
function validateChemicalsThrottled(cacheKey, chems) {
  return validateChemicalsWithThrottle(cacheKey, chems);
}
function validateChemicalsWithThrottle(key, chems) {
  const cache = CacheService.getScriptCache();
  const ck = 'chem-validate:' + String(key || 'unknown');
  const locked = cache.get(ck);
  if (locked) {
    return { ok: false, mismatches: [], throttle: true, retryAfterSec: 30 };
  }
  const res = validateChemicals(chems);
  if (!res.ok) {
    cache.put(ck, '1', 30);
    return { ok: false, mismatches: res.mismatches, throttle: true, retryAfterSec: 30 };
  }
  return { ok: true, mismatches: [], throttle: false, retryAfterSec: 0 };
}

/* ------------------------- 신청 제출 ------------------------- */
function submitApplication(data) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) throw new Error('서버가 바쁩니다. 잠시 후 다시 시도해주세요.');
  try {
  return submitApplication_(data);
  } finally { lock.releaseLock(); }
}
function submitApplication_(data) {
  const unavail = getUnavailableForDate(data.date);

  const requestedSlots = String(data.timeSlot || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
    .map(normalizeSlot_);

  const labName = String(data.lab || '').trim();

  if (unavail.allBlocked) {
    throw new Error('해당 일자는 캘린더에서 전체 사용 불가로 지정되어 있습니다.\n(사유: ' + (unavail.message || '캘린더 차단') + ')');
  }

  const blockedByLab  = (unavail.blockedLabs || []).includes(labName);
  const globalBlockedTimes = unavail.blockedTimes || [];
  const perLab = (unavail.perLabTimes && unavail.perLabTimes[labName]) ? unavail.perLabTimes[labName].map(normalizeSlot_) : [];
  const blockedByTimeGlobal = requestedSlots.filter(s => globalBlockedTimes.includes(s));
  const blockedByTimePerLab = requestedSlots.filter(s => perLab.includes(s));

  if (blockedByLab || blockedByTimeGlobal.length > 0 || blockedByTimePerLab.length > 0) {
    let msg = '해당 일자에는 신청할 수 없습니다.\n\n';
    if (blockedByLab) {
      msg += `• 실험실 차단: ${labName}\n`;
    }
    if (blockedByTimeGlobal.length > 0) {
      msg += `• 시간 차단(전체): ${blockedByTimeGlobal.join(', ')}\n`;
    }
    if (blockedByTimePerLab.length > 0) {
      msg += `• 시간 차단(${labName} 전용): ${blockedByTimePerLab.join(', ')}\n`;
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

  const labNameRaw = labName;
  if (['첨단기기실험실', '첨단기기 연구실', '첨단기기실', '첨단기기'].includes(labNameRaw)) {
    data.advancedLab = '예';
  }

  const is2F = data.formType === '2F';
  const chemsArray = is2F ? [] : (Array.isArray(data.chemicals) ? data.chemicals : []);
  let class1Map = {};

  if (!is2F && chemsArray.length > 0) {
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

      const RE_SOLID_SERVER = /고체|분말|시약병|결정|pellet|powder|생물|지시약/i;
      const isSolidLike =
        RE_SOLID_SERVER.test(clientState || '') ||
        RE_SOLID_SERVER.test(finalState || '') ||
        RE_SOLID_SERVER.test(name || '');

      const conc = String(c['농도'] || '').trim();
      const amt  = String((c['용량'] ?? c['사용량'] ?? '')).trim();
      const msds = String((c['MSDS 및 취급 주의사항'] ?? c['MSDS'] ?? '')).trim();

      if (name) {
        if (!isSolidLike && !conc) {
          missing.push(`"${name}"의 농도`);
        }
        if (!amt) {
          missing.push(`"${name}"의 사용량`);
        }
        if (!msds) {
          missing.push(`"${name}"의 MSDS/취급 주의사항`);
        }
      }

      return { name, disposal, guidance };
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

  const ss = SpreadsheetApp.openById(MAIN_SSID);
  const sh = ss.getSheets()[0];
  const { header, map } = getHeaderMap_(sh);

  // ====== 중복 신청 방지 ======
  const dupIdCol   = map['신청ID'];
  const dupSidCol  = map['대표자학번'];
  const dupDateCol = map['실험할날짜'];
  const dupLabCol  = map['신청실험실'];
  const dupTimeCol = map['신청시간'];
  if (dupSidCol != null && dupDateCol != null && dupLabCol != null && dupTimeCol != null) {
    const allRows = sh.getDataRange().getValues().slice(1);
    const normSid  = String(data.studentId || '').replace(/\D/g, '').padStart(5, '0');
    const normDate = normalizeDateYMD_(data.date);
    const normLab  = String(data.lab || '').trim();
    const normSlots = requestedSlots.sort().join(',');
    const dupRow = allRows.find(r => {
      const rSid  = String(r[dupSidCol] || '').replace(/\D/g, '').padStart(5, '0');
      const rDate = normalizeDateYMD_(r[dupDateCol]);
      const rLab  = String(r[dupLabCol] || '').trim();
      const rTime = String(r[dupTimeCol] || '').split(',').map(s => normalizeSlot_(s.trim())).filter(Boolean).sort().join(',');
      return rSid === normSid && rDate === normDate && rLab === normLab && rTime === normSlots;
    });
    if (dupRow) {
      const existingId = dupIdCol != null ? String(dupRow[dupIdCol] || '') : '';
      throw new Error(
        '해당 날짜/실험실/시간에 이미 신청한 내역이 있습니다.' +
        (existingId ? '\n기존 신청 ID: ' + existingId : '') +
        '\n중복 신청은 불가합니다.'
      );
    }
  }

  const now = new Date();
  const ts  = Utilities.formatDate(now, Session.getScriptTimeZone(), 'yyyyMMdd_HHmmss');
  const id  = `${data.studentId}_${ts}`;
  const row = new Array(header.length).fill('');
  const put = (col, val) => { if (map[col] != null) row[map[col]] = val; };

  put('신청ID', id);
  put('제출일시', now);
  put('대표자학번', data.studentId);
  put('대표자이름', data.studentName);
  put('동반자명단', data.teamMembers);
  put('총인원수', data.totalParticipants || '');
  put('신청실험실', data.lab);
  put('실험할날짜', data.date);
  put('신청시간', data.timeSlot);
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
  sh.appendRow(row);

  // ====== 시약 기록 (1층 폼만) ======
  if (!is2F && chemsArray.length > 0) {
    const chemSS = SpreadsheetApp.openById(CHEM_RECORD_SSID);
    const chemSh = chemSS.getSheets()[0];
    chemsArray.forEach(c => {
      const name = String(
        c['시약명'] ||
        c['물질명'] ||
        c.name ||
        ''
      ).trim();
      if (!name) return;
      const key = normalizeChemName_(name);
      const stateFromMaster = class1Map[key] || String(c['상태'] || c['분류1'] || '').trim();
      const msdsText = (c['MSDS 및 취급 주의사항'] ?? c['MSDS'] ?? '');
      const guidance = (c['교사임장여부'] ?? c['교사 임장 여부'] ?? c.guidance ?? '');
      const disposal = String(c['폐기 방법'] || c['폐수처리'] || c['폐기'] || c.disposal || '').trim();
      chemSh.appendRow([
        id, now, data.lab, data.date, data.timeSlot,
        data.studentId, data.studentName,
        name, stateFromMaster, c['농도'] || '', (c['용량'] ?? c['사용량'] ?? '') || '',
        msdsText || '', guidance || '', disposal
      ]);
    });
  }

  // ====== 메일 발송 ======
  const warnings = [];
  const r1 = sendStudentSubmitEmail_(data, id);
  if (!r1.ok) warnings.push('학생 신청완료 메일 발송 실패: ' + (r1.error || ''));
  const r2 = sendTeacherApprovalEmail_(data, id);
  if (!r2.ok) warnings.push('지도교사 1차 승인요청 메일 발송 실패: ' + (r2.error || ''));

  const suffixMsg = (hasRestricted && seventhValid)
    ? ' (신청제한 학생이 있지만 7교시에는 신청이 가능합니다)'
    : '';
  const warnMsg = warnings.length > 0 ? '\n⚠️ ' + warnings.join('\n⚠️ ') : '';
  return `신청이 완료되었습니다! (ID: ${id})${suffixMsg}${warnMsg}`;
}

/* ------------------------- 신청/시약 조회 ------------------------- */
function getApplication(id) {
  const ss = SpreadsheetApp.openById(MAIN_SSID);
  const sh = ss.getSheets()[0];
  const vals = sh.getDataRange().getValues();
  if (vals.length < 2) throw new Error('신청 데이터 시트가 비어있습니다.');
  const [hdr, ...rows] = vals;
  const idCol = hdr.indexOf('신청ID');
  if (idCol === -1) throw new Error('시트 헤더에 "신청ID" 열이 없습니다.');
  const idx = rows.findIndex(r => String(r[idCol]) === String(id));
  if (idx < 0) throw new Error('신청 정보를 찾을 수 없습니다.');

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

  const chemSS = SpreadsheetApp.openById(CHEM_RECORD_SSID);
  const chemSh = chemSS.getSheets()[0];
  const chemVals = chemSh.getDataRange().getValues();
  if (chemVals.length < 2) {
    rec.chemicals = [];
  } else {
    const [chemHdr, ...chemRows] = chemVals;
    rec.chemicals = chemRows
      .filter(r => String(r[0]) === String(id))
      .map(r => chemHdr.reduce((o, h, j) => (o[h] = r[j], o), {}));
  }
  return rec;
}

/* ----------------------------------------------------------
 * ✅ 1차 승인 시 교사가 선택한 '교사임장여부' 반영
 * -------------------------------------------------------- */
function applyTeacherGuidanceToChemicals_(appId, guidanceList) {
  if (!appId) return;
  if (!Array.isArray(guidanceList) || guidanceList.length === 0) return;

  const ss = SpreadsheetApp.openById(CHEM_RECORD_SSID);
  const sh = ss.getSheets()[0];
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
      targetRows.push({
        rowNum: i + 1,
        name: String(vals[i][nameCol] || '').trim(),
        currentGuidance: String(vals[i][guidanceCol] || '').trim()
      });
    }
  }
  if (targetRows.length === 0) return;

  const incoming = guidanceList
    .map(x => ({
      name: String(x && (x.name || x['시약명'] || x['물질명']) || '').trim(),
      guidance: String(x && (x.guidance || x['교사임장여부'] || x['교사 임장 여부']) || '').trim()
    }))
    .filter(x => x.name && x.guidance);

  if (incoming.length === 0) return;

  incoming.forEach(item => {
    const found = targetRows.find(tr =>
      tr.name === item.name &&
      (!tr.currentGuidance || tr.currentGuidance === '')
    );
    if (found) {
      sh.getRange(found.rowNum, guidanceCol + 1).setValue(item.guidance);
      found.currentGuidance = item.guidance;
    }
  });
}

/* ------------------------- 1차 승인 ------------------------- */
function submitApproval(info) {
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

  const ss = SpreadsheetApp.openById(MAIN_SSID);
  const sh = ss.getSheets()[0];
  const { header, map } = getHeaderMap_(sh);
  const idCol = map['신청ID'];
  if (idCol == null) throw new Error('시트 헤더에 "신청ID" 열이 없습니다.');
  const rows = sh.getDataRange().getValues().slice(1);
  const idx = rows.findIndex(r => String(r[idCol]) === String(id));
  if (idx < 0) throw new Error('신청 정보를 찾을 수 없습니다.');
  const rowNum = idx + 2;

  // ====== 중복 승인/반려 방지 ======
  const approvalCol = map['지도승인여부'];
  if (approvalCol != null) {
    const existing = String(rows[idx][approvalCol] || '').trim();
    if (existing === '승인' || existing === '반려') {
      throw new Error('이미 1차 처리(승인/반려)된 신청입니다.');
    }
  }

  const put = (col, val) => { if (map[col] != null) sh.getRange(rowNum, map[col] + 1).setValue(val); };
  put('지도승인여부', decision);
  put('지도승인의견', comment || '');

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

  const rec = getApplication(id);
  const warnings = [];

  if (decision === '승인') {
    // 학생에게 1차 승인 안내
    const r1 = sendStudentFirstApproveEmail_(rec, comment);
    if (!r1.ok) warnings.push('학생 1차 승인 메일 발송 실패: ' + (r1.error || ''));

    // 담당교사에게 최종 승인 요청 (실패 시 학과 메일로 fallback)
    try {
      const r2 = sendLabTeacherFinalEmail_(rec, id);
      if (!r2.ok) throw new Error(r2.error || '발송 실패');
    } catch(e) {
      Logger.log('담당교사 최종승인 메일 실패: ' + (e.message || e));
      const url = ScriptApp.getService().getUrl() + '?id=' + encodeURIComponent(id) + '&stage=final';
      const eh = escapeHtml_;
      const fallbackBody = buildEmailHtml_('최종 승인 메일 자동 발송 실패', [
        `자동 발송 실패 사유: ${eh(e.message || e)}`,
        '담당교사에게 아래 내용을 직접 전달해 주세요.',
        '',
        `• 대표자: ${eh(rec['대표자이름'])} (${eh(rec['대표자학번'])})`,
        `• 실험실: ${eh(rec['신청실험실'])}`,
        `• 날짜/시간: ${normalizeDateYMD_(rec['실험할날짜'])} / ${eh(rec['신청시간'])}`,
        `• 실험 제목: ${eh(rec['실험제목'] || '')}`,
      ], url, '최종 승인 처리하기');
      const fb = sendMail_(SCIENCE_EMAIL, `[수동 처리 요청] 최종 승인 메일 발송 실패 - ${eh(rec['대표자이름'])}`, fallbackBody);
      if (fb.ok) {
        warnings.push('담당교사 이메일 자동 발송 실패 → 학과 메일로 수동 처리 요청을 보냈습니다.');
      } else {
        warnings.push('담당교사 이메일 및 학과 메일 발송 모두 실패했습니다. 담당교사에게 직접 연락해 주세요.');
      }
    }

    const warnMsg = warnings.length > 0 ? '\n⚠️ ' + warnings.join('\n⚠️ ') : '';
    return '1차 승인 완료, 담당교사에게 최종 승인 메일을 발송했습니다.' + warnMsg;

  } else {
    const r1 = sendStudentRejectEmail_(rec, comment);
    if (!r1.ok) warnings.push('학생 반려 메일 발송 실패: ' + (r1.error || ''));

    const warnMsg = warnings.length > 0 ? '\n⚠️ ' + warnings.join('\n⚠️ ') : '';
    return '반려 처리 완료' + warnMsg;
  }
}

/* ------------------------- 최종 승인 ------------------------- */
function submitFinalApproval(info) {
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

  const ss = SpreadsheetApp.openById(MAIN_SSID);
  const sh = ss.getSheets()[0];
  const { header, map } = getHeaderMap_(sh);
  const idCol = map['신청ID'];
  if (idCol == null) throw new Error('시트 헤더에 "신청ID" 열이 없습니다.');
  const rows = sh.getDataRange().getValues().slice(1);
  const idx = rows.findIndex(r => String(r[idCol]) === String(id));
  if (idx < 0) throw new Error('신청 정보를 찾을 수 없습니다.');
  const rowNum = idx + 2;

  // ====== 중복 최종 승인/반려 방지 ======
  const finalApprovalCol = map['최종승인여부'];
  if (finalApprovalCol != null) {
    const existing = String(rows[idx][finalApprovalCol] || '').trim();
    if (existing === '승인' || existing === '반려') {
      throw new Error('이미 최종 처리(승인/반려)된 신청입니다.');
    }
  }

  const put = (col, val) => { if (map[col] != null) sh.getRange(rowNum, map[col] + 1).setValue(val); };
  put('최종승인여부', decision);
  put('최종승인의견', comment || '');

  // ====== 메일 발송 ======
  const rec = getApplication(id);
  const warnings = [];

  if (decision === '승인') {
    const r1 = sendStudentFinalApproveEmail_(rec, comment);
    if (!r1.ok) warnings.push('학생 최종승인 메일 발송 실패: ' + (r1.error || ''));
    const r2 = sendTeacherFinalResultEmail_(rec, '승인', comment);
    if (!r2.ok) warnings.push('지도교사 최종승인 결과 메일 발송 실패: ' + (r2.error || ''));
  } else {
    const r1 = sendStudentFinalRejectEmail_(rec, comment);
    if (!r1.ok) warnings.push('학생 최종반려 메일 발송 실패: ' + (r1.error || ''));
    const r2 = sendTeacherFinalResultEmail_(rec, '반려', comment);
    if (!r2.ok) warnings.push('지도교사 최종반려 결과 메일 발송 실패: ' + (r2.error || ''));
  }

  const warnMsg = warnings.length > 0 ? '\n⚠️ ' + warnings.join('\n⚠️ ') : '';
  return (decision === '승인' ? '최종 승인 처리 완료' : '최종 반려 처리 완료') + warnMsg;
}

/* ------------------------- 임시저장: 저장/불러오기/정리 ------------------------- */
function saveDraft(formData) {
  const ss = SpreadsheetApp.openById(DRAFT_SSID);
  const sh = ss.getSheets()[0];
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
  const row = new Array(hdr.length).fill('');
  row[idx.id]   = Utilities.getUuid();
  row[idx.cr]   = now;
  row[idx.up]   = now;
  row[idx.sid]  = normalizeStudentId_(formData.studentId);
  row[idx.name] = normalizeName_(formData.studentName);
  row[idx.date] = normalizeDateYMD_(formData.date);
  row[idx.json] = JSON.stringify(formData);
  sh.appendRow(row);
  return '임시저장 완료';
}
function loadDraft(studentId, studentName, dateYMD) {
  const ss = SpreadsheetApp.openById(DRAFT_SSID);
  const sh = ss.getSheets()[0];
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
    return rSid === sid && rName === name && rDate === ymd && r[idx.json];
  });
  if (candidates.length === 0) throw new Error('해당 조건의 임시저장 내역이 없습니다.');
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
  const ss = SpreadsheetApp.openById(DRAFT_SSID);
  const sh = ss.getSheets()[0];
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
  const sid  = normalizeStudentId_(studentId);
  const name = normalizeName_(studentName);
  if (!sid || !name) throw new Error('학번과 이름을 모두 입력하세요.');

  const ss = SpreadsheetApp.openById(MAIN_SSID);
  const sh = ss.getSheets()[0];
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