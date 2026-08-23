/****************************************************
 * 관리자 페이지 전용 웹앱 배포용 Google Apps Script (FULL, fixed)
 * - 요청 사항 반영:
 *   1) 제한 만료 정리 강건화(문자열/타임존 안전 파싱 + 자정 기준 비교)
 *   2) 만료 자동 정리 일일 트리거 제공(setupDailyRestrictionMaintenance)
 *   3) 기존 기능·헤더·시트 구조 유지
 *   4) ✅ (수정) 버그 수정 및 신규 기능 추가
 *
 * [P2-#25 유지보수 가이드 — 데스크탑/모바일 코드 중복]
 * 데스크탑(admin.html + admin_scripts.html)과 모바일(m_admin.html + m_admin_scripts.html + m_spa.html)이
 * 별도 HTML로 구현되어 있어 유사 함수가 양쪽에 중복 정의될 수 있다.
 * - 한쪽 버그 수정 시 반드시 다른 쪽도 검토할 것.
 * - 중복 함수 식별 시 향후 m_components.html 같은 공통 인클루드 파일로 추출 권장.
 * - 현재 알려진 중복: calcStatus(), escapeHtml(), 신청 카드 렌더링, 필터 로직.
 ****************************************************/

// ===== 스프레드시트 ID들 =====
const MAIN_SSID         = '1LzQvFUj0NH69DDyrh7Vxk8bYXQzMdl-oQkZpAUm1uIE';
const CHEM_RECORD_SSID  = '1IwVM6k4etSs-vSXFqp-3GrUJuzVhIgoBErzgMQd2GOs';
// const CHEM_MASTER_SSID  = '1JYk8o0-wCoqA1TURrSDBkhVB-HfuRkOTgtyVxudXcm8';  // ✅ 미사용 - 주석 처리
const TEACHER_LIST_SSID = '12OSD8W-AFCPonw6QzOSM8H93eOG_-qar-zWCDWFfT7g';
const LAB_TEACHER_SSID  = '1djvdz0W7UCnmLBWElg7G4-KsxKiPyvnwVHC8UxYIqgA';

// ===== 메일 발송 상수 =====
const SCIENCE_EMAIL = 'cnsa.science@cnsa.hs.kr';
// [DEPRECATED 직접 사용] 신청서 GAS 운영 deploy URL — 메일 본문 링크와 cross-clear 호출 모두에 사용.
// 신청서 GAS 새 deploy 시 이 상수만 갱신하지 말고 setApplicationServerConfig(URL, 토큰)을 다시 실행하면
// PropertiesService(APP_SERVER_URL)가 우선 적용된다. 직접 참조는 getApproveBaseUrl_() 사용.
const APPROVE_BASE_URL_FALLBACK = 'https://script.google.com/a/macros/cnsa.hs.kr/s/AKfycbwdmq680-4fMZFC9jID32KEDP1UOJa-dAe6OSF4tJw5g6raciu1sWOe58cwh1DV5hesaw/exec';

/**
 * 신청서 GAS 의 web app base URL 을 동적으로 조회.
 *  1) PropertiesService('APP_SERVER_URL') — setApplicationServerConfig() 로 설정한 값 (단일 진실 소스)
 *  2) 미설정 시 APPROVE_BASE_URL_FALLBACK 상수 (운영 시작 전·토큰 미설정 시 안전망)
 * 메일 본문 링크와 cross-clear 호출이 같은 값을 공유하므로 새 deploy 때 한 번만 갱신하면 된다.
 */
function getApproveBaseUrl_() {
  try {
    const url = PropertiesService.getScriptProperties().getProperty('APP_SERVER_URL') || '';
    if (url && /^https?:\/\//.test(url)) return url;
  } catch (_) { /* 권한 부족 등 */ }
  return APPROVE_BASE_URL_FALLBACK;
}

// ===== 시트 이름 상수 =====
const LAB_LOG_SHEET_NAME        = '실험실지도일지';
const WARN_ACCUM_SHEET_NAME     = '경고기록누적';
const POLICY_SHEET_NAME         = '신청제한정책';
const RESTRICT_SHEET_NAME       = '신청제한명단';
const RESTRICT_ACCUM_SHEET_NAME = '신청제한누적명단';
const ADMIN_LOG_SHEET_NAME      = '관리자로그';
const BACKUP_CONFIG_SHEET_NAME  = '백업설정';  // ✅ 신규 추가

// ===== 조회에서 제외할 시트 =====
const EXCLUDED_SHEETS = [
  RESTRICT_SHEET_NAME,
  POLICY_SHEET_NAME,
  WARN_ACCUM_SHEET_NAME,
  LAB_LOG_SHEET_NAME,
  RESTRICT_ACCUM_SHEET_NAME,
  ADMIN_LOG_SHEET_NAME,
  BACKUP_CONFIG_SHEET_NAME,
  // [v4.18/S1] 보안·메일 로그 시트 — 통계/목록 오염 방지 (문자열 리터럴: 상수 정의가 이 아래라 TDZ 회피)
  '접속로그_관리자',
  '차단명단_관리자',
  '이메일발송로그',
  // [v4.18/S3] 출석체크 기록 시트
  '출석기록',
];

/**
 * [v4.18/S1] 신청 데이터 시트 판별 — '실험할날짜' 헤더가 있는 시트만 신청 시트로 취급.
 * 이름 기반 제외(EXCLUDED_SHEETS)를 보완: 신청서 GAS가 새로 만드는 보고서·정책 탭 등
 * 이름을 모르는 시트도 자동 제외되어 목록·통계·수정 대상에서 빠진다.
 */
function isApplicationSheet_(sh) {
  try {
    if (!sh || sh.getLastRow() < 1) return false;
    const { map } = getHeaderMap_(sh);
    return map['실험할날짜'] != null && map['신청ID'] != null;
  } catch (_) { return false; }
}

// ===== 정책/명단 헤더 =====
const POLICY_HEADERS        = ['활성화', '경고임계', '기간_일'];
const RESTRICT_HEADERS      = ['학번', '이름', '제한사유', '시작일', '종료일', '현재상태', '최근경고수', '산출일'];
const RESTRICT_ACCUM_HEADERS= ['학번','이름','누적 횟수'];

/**
 * [SEC] 시트 셀 수식 인젝션 방어 — `=`, `+`, `-`, `@`, 탭/캐리지로 시작하는 문자열은
 * Sheet에서 수식으로 해석되므로 single-quote(`'`)를 prefix하여 텍스트 강제.
 * 신청서 GAS와 동일 헬퍼 — 관리자 batch update / chem update에 적용됨.
 */
function sanitizeForSheet_(v) {
  if (typeof v !== 'string') return v;
  return /^[=+\-@\t\r]/.test(v) ? "'" + v : v;
}

/* ==================================================
 *  공통/진입점
 * ================================================== */

function doGet(e) {
  var view = (e && e.parameter && e.parameter.view) ? String(e.parameter.view) : '';
  var platform = (e && e.parameter && e.parameter.platform) ? String(e.parameter.platform) : '';
  var isMobile = (platform === 'mobile');
  var file;
  var title = '과학실험·실습실 사용 신청 관리 시스템';

  // [v3.38] 멀티 로그인 해결 — ?switchAccount=1 진입 시 Google AccountChooser로 강제 리다이렉트.
  // 사용자가 의도한 계정으로 선택 후 자동으로 이 페이지로 돌아온다.
  if (e && e.parameter && e.parameter.switchAccount) {
    var thisUrl = ScriptApp.getService().getUrl();
    var continueParams = [];
    if (view) continueParams.push('view=' + encodeURIComponent(view));
    if (platform) continueParams.push('platform=' + encodeURIComponent(platform));
    var returnUrl = thisUrl + (continueParams.length ? '?' + continueParams.join('&') : '');
    var chooserUrl = 'https://accounts.google.com/AccountChooser?continue=' + encodeURIComponent(returnUrl);
    var html = '<!DOCTYPE html><html><head><meta charset="UTF-8">' +
               '<meta name="viewport" content="width=device-width,initial-scale=1">' +
               '<title>계정 선택으로 이동…</title>' +
               '<style>body{font-family:system-ui,-apple-system,Segoe UI,Apple SD Gothic Neo,Noto Sans KR,sans-serif;text-align:center;padding:60px 20px;color:#111;background:#f6f7fb;}' +
               '.box{max-width:420px;margin:0 auto;background:#fff;padding:36px 28px;border-radius:14px;box-shadow:0 10px 30px rgba(0,0,0,0.06);}' +
               '.spinner{width:32px;height:32px;border:3px solid #e5e7eb;border-top-color:#2563eb;border-radius:50%;animation:spin 0.8s linear infinite;margin:0 auto 16px;}' +
               '@keyframes spin{to{transform:rotate(360deg);}}' +
               'a{color:#2563eb;text-decoration:none;font-weight:600;}</style></head>' +
               '<body><div class="box"><div class="spinner"></div>' +
               '<h2 style="margin:0 0 8px;font-size:18px;">Google 계정 선택으로 이동 중…</h2>' +
               '<p style="margin:0 0 20px;color:#6b7280;font-size:13px;line-height:1.5;">사용할 계정을 선택하면 자동으로 관리 시스템으로 돌아옵니다.</p>' +
               '<p style="font-size:12px;color:#9ca3af;">자동으로 이동하지 않으면 <a href="' + chooserUrl + '" target="_top">여기를 클릭</a>하세요.</p>' +
               '</div>' +
               '<script>setTimeout(function(){window.top.location.href=' + JSON.stringify(chooserUrl) + ';},300);<\/script>' +
               '</body></html>';
    return HtmlService.createHtmlOutput(html)
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
      .setTitle('계정 선택');
  }

  // [v4.18/S2] 로그아웃 라우트 — 기존엔 라우트가 없어 entry 로 떨어진 뒤 Google 세션으로
  //   자동 재인증되어 1초 만에 복귀(사실상 무동작). 명시적 안내 페이지 제공.
  //   (isMobile 분기보다 먼저 와야 모바일 ?view=logout&platform=mobile 도 여기로 온다)
  if (view === 'logout') {
    var loAppUrl = ScriptApp.getService().getUrl();
    var loChooser = 'https://accounts.google.com/AccountChooser?continue=' + encodeURIComponent(loAppUrl);
    var loHtml = '<!DOCTYPE html><html><head><meta charset="UTF-8">' +
      '<meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<title>로그아웃</title>' +
      '<style>body{font-family:system-ui,-apple-system,Segoe UI,Apple SD Gothic Neo,Noto Sans KR,sans-serif;text-align:center;padding:60px 20px;color:#111;background:#f6f7fb;margin:0;}' +
      '.box{max-width:440px;margin:0 auto;background:#fff;padding:36px 28px;border-radius:14px;box-shadow:0 10px 30px rgba(0,0,0,0.06);}' +
      '.btn{display:inline-block;margin:6px 4px;padding:11px 22px;border-radius:10px;font-weight:700;font-size:14px;text-decoration:none;cursor:pointer;border:none;}' +
      '.btn-primary{background:#2563eb;color:#fff;}.btn-amber{background:#f59e0b;color:#fff;}' +
      '.note{background:#fef3c7;border-radius:8px;padding:12px 14px;font-size:12.5px;color:#78350f;text-align:left;line-height:1.6;margin:18px 0 6px;}</style></head>' +
      '<body><div class="box">' +
      '<div style="font-size:52px;margin-bottom:12px;">👋</div>' +
      '<h2 style="margin:0 0 8px;font-size:20px;">세션이 정리되었습니다</h2>' +
      '<p style="margin:0 0 14px;color:#6b7280;font-size:13.5px;line-height:1.6;">관리 시스템 사용을 종료했습니다.</p>' +
      '<div class="note"><b>⚠️ 공용 컴퓨터인 경우:</b> 완전한 로그아웃은 브라우저에서 Google 계정 자체를 로그아웃해야 합니다. 이 시스템은 학교 Google 계정으로 자동 인증되므로, Google 로그인이 남아 있으면 다시 접속 시 자동 로그인됩니다.</div>' +
      '<a class="btn btn-primary" href="' + loAppUrl + '" target="_top">다시 로그인</a>' +
      '<a class="btn btn-amber" href="' + loChooser + '" target="_top">다른 계정으로</a>' +
      '<script>try{sessionStorage.removeItem("__lab_admin_session__");}catch(e){}<\/script>' +
      '</div></body></html>';
    return HtmlService.createHtmlOutput(loHtml)
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
      .setTitle('로그아웃');
  }

  // 라우팅 분기 (✅ 모바일: SPA 단일 페이지 / 데스크탑: 개별 페이지)
  if (isMobile) {
    // ★ 모바일 SPA — 한 번 로드로 모든 뷰 포함, 즉시 네비게이션
    file = 'm_spa';
    title = '실험실 관리';
  } else {
    switch(view) {
      case 'admin':
        file = 'admin';
        title = '과학실험·실습실 사용 신청 관리 시스템';
        break;
      case 'chemical_list':
      case 'common_list':
        file = 'common_list';
        title = '시약 목록';
        break;
      case 'student_list':
        file = 'student_list';
        title = '학생 명단';
        break;
      case 'teacher_schedule':
        file = 'teacher_schedule';
        title = '임장 일정';
        break;
      // case 'statistics': 파일 미구현 — 추후 추가 예정
      default:
        file = 'entry';
        title = '과학실험·실습실 사용 신청 관리 시스템';
    }
  }
  
  try {
    var tpl = HtmlService.createTemplateFromFile(file);
    // [2026-08] 서브페이지 사이드바에서 넘어온 "열 패널" 지시 (todayLab/guidance/warning/restriction).
    //   GAS 샌드박스 iframe 에서는 location.search 를 신뢰할 수 없어 서버가 직접 주입한다.
    var _open = (e && e.parameter && e.parameter.open) ? String(e.parameter.open) : '';
    tpl.openPanel = /^[a-zA-Z]{1,20}$/.test(_open) ? _open : '';

    return tpl.evaluate()
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
      .setTitle(title)
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  } catch (error) {
    var missing = file;
    var safeMissing = String(missing).replace(/[&<>"']/g, function(m) {
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m];
    });
    var safeError = String(error.message || '').replace(/[&<>"']/g, function(m) {
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m];
    });
    return HtmlService.createHtmlOutput(`
      <!DOCTYPE html><html><head><meta charset="UTF-8"><title>설치 필요</title>
      <style>
        body{font-family:Arial,sans-serif;max-width:600px;margin:50px auto;padding:20px;background:#f5f5f5}
        .container{background:#fff;padding:30px;border-radius:10px;box-shadow:0 0 10px rgba(0,0,0,.1)}
        .step{margin:15px 0;padding:10px;background:#e8f4fd;border-radius:5px}
        .code{background:#f0f0f0;padding:2px 5px;border-radius:3px;font-family:monospace}
      </style></head><body>
        <div class="container">
          <h1>페이지 설치 필요</h1>
          <p><b>${safeMissing}.html</b> 파일이 없습니다. 다음 순서로 HTML 파일을 추가하세요.</p>
          <div class="step"><b>1단계:</b> GAS 편집기 → <span class="code">파일 → 새로 만들기 → HTML</span></div>
          <div class="step"><b>2단계:</b> 파일명을 <span class="code">${safeMissing}</span> 으로 저장</div>
          <div class="step"><b>3단계:</b> (관리자 페이지라면) <span class="code">admin, admin_head, admin_body, admin_scripts</span> 4개 파일</div>
          <div class="step"><b>4단계:</b> (시약목록) <span class="code">chemical_list, chemical_list_body, chemical_list_scripts</span></div>
          <div class="step"><b>5단계:</b> (학생명단) <span class="code">student_list, student_list_body, student_list_scripts</span></div>
          <div class="step"><b>6단계:</b> (임장일정) <span class="code">teacher_schedule, teacher_schedule_body, teacher_schedule_scripts</span></div>
          <div class="step"><b>7단계:</b> (공통) <span class="code">common_styles</span></div>
          <div class="step"><b>8단계:</b> 저장 후 다시 배포</div>
          <p style="margin-top:16px;background:#fff3cd;padding:10px;border-radius:6px">
            <b>오류:</b> ${safeError}
          </p>
        </div>
      </body></html>
    `).setTitle('페이지 설치 필요');
  }
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/* ── [v3.38] AccountChooser 헬퍼 — 멀티 로그인 해결 ─────────────
   Google 멀티 로그인 환경에서 사용자가 의도한 계정으로 진입하도록
   accounts.google.com/AccountChooser?continue=... 형태로 본 페이지 URL을 감싼다.
   메일/공지의 모든 진입 링크 + 페이지 상단 "다른 계정 ↗" 버튼에서 사용.
   ────────────────────────────────────────────── */
function getAdminAppUrl_() {
  return ScriptApp.getService().getUrl();
}

/** 클라이언트가 페이지 상단 "다른 계정" 링크에서 사용할 URL */
function getAccountChooserUrl() {
  return 'https://accounts.google.com/AccountChooser?continue=' + encodeURIComponent(getAdminAppUrl_());
}

/** AccountChooser로 감싼 임의 URL 생성 (메일 본문 등에서 사용) */
function buildAccountChooserUrl_(targetUrl) {
  var t = String(targetUrl || getAdminAppUrl_());
  return 'https://accounts.google.com/AccountChooser?continue=' + encodeURIComponent(t);
}

/** 현재 로그인 계정 정보 + AccountChooser URL 반환 (클라이언트 표시용) */
function getMyAccountInfo() {
  var email = '';
  try { email = String(Session.getActiveUser().getEmail() || '').trim(); } catch (_) {}
  return {
    email: email,
    chooserUrl: getAccountChooserUrl()
  };
}

function getHeaderMap_(sheet) {
  const lastCol = sheet.getLastColumn();
  if (lastCol === 0) throw new Error('시트 헤더가 비어있습니다: ' + sheet.getName());
  const header = sheet.getRange(1,1,1, lastCol).getValues()[0];
  const map = {};
  // [무결성] 중복 컬럼 검출 — indexOf 기반 화이트리스트 함수가 첫 위치만 잡으므로
  // 시트 편집 실수로 같은 헤더가 두 번 들어가면 운영자에게 즉시 알림.
  const seen = Object.create(null);
  const dupes = [];
  header.forEach((h,i)=> {
    const key = String(h || '').trim();
    if (!key) return;
    if (seen[key] != null) dupes.push(key);
    else seen[key] = i;
    map[key] = seen[key]; // 항상 첫 위치
  });
  if (dupes.length > 0) {
    try { Logger.log('[getHeaderMap_] 중복 컬럼 헤더 감지: ' + dupes.join(', ') + ' (시트=' + sheet.getName() + ')'); } catch (_) {}
  }
  return { header, map };
}

/**
 * 필수 헤더가 모두 존재하는지 검증. 누락 시 SCIENCE_EMAIL 폴백 알림 후 throw.
 * - 운영자가 시트 헤더를 잘못 변경하면 silent fail 대신 즉시 가시화.
 * - 신청서 GAS의 동일 이름 함수와 동작 일관성.
 */
function assertRequiredHeaders_(map, required, context) {
  const missing = (required || []).filter(h => map[h] == null);
  if (missing.length === 0) return;
  const msg = '시트 헤더 누락 [' + (context || '?') + ']: ' + missing.join(', ');
  try { Logger.log('[assertRequiredHeaders_] ' + msg); } catch (_) {}
  try {
    // 관리자 측 폴백 메일 (sendAdminFallbackEmail_은 신청서 전용 — 관리자에선 _adm_sendMail_)
    if (typeof _adm_sendMail_ === 'function' && typeof SCIENCE_EMAIL !== 'undefined') {
      _adm_sendMail_(
        SCIENCE_EMAIL,
        '[수동 처리 요청] 관리자 시트 헤더 무결성 - ' + (context || ''),
        '<b>시트 헤더 누락 감지</b><br>' +
        '컨텍스트: ' + String(context || '') + '<br>' +
        '누락 헤더: ' + missing.join(', ') + '<br>' +
        '시트의 1행 헤더를 확인하세요.'
      );
    }
  } catch (_) { /* 알림 실패는 무시 */ }
  throw new Error(msg);
}

function normalizeToHHmm_(v) {
  if (v==null || v==='') return '';
  if (v instanceof Date) {
    const pad=n=>String(n).padStart(2,'0');
    return `${pad(v.getHours())}:${pad(v.getMinutes())}`;
  }
  if (typeof v==='number') {
    const total = Math.round(v*24*60), hh=Math.floor(total/60)%24, mm=total%60;
    const pad=n=>String(n).padStart(2,'0');
    return `${pad(hh)}:${pad(mm)}`;
  }
  if (typeof v==='string') {
    const s=v.trim(); const m=s.match(/^(\d{1,2}):(\d{2})$/);
    if (m) {
      const pad=n=>String(n).padStart(2,'0');
      const hh=Math.min(23, Math.max(0, parseInt(m[1],10)));
      const mm=Math.min(59, Math.max(0, parseInt(m[2],10)));
      return `${pad(hh)}:${pad(mm)}`;
    }
    const d=new Date(s);
    if (!isNaN(d.getTime())) {
      const pad=n=>String(n).padStart(2,'0');
      return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }
    return s;
  }
  return String(v);
}

/***********************************************************
 * Entry(입장) 페이지용 서버 설정
 ***********************************************************/
const ENTRY_DEFAULT_PASSWORD = '3000';
const ENTRY_PW_PROP_KEY      = 'ENTRY_PASSWORD';
const TEACHER_SHEET_ID       = '12OSD8W-AFCPonw6QzOSM8H93eOG_-qar-zWCDWFfT7g';
const TEACHER_SHEET_NAME     = '';
const TEACHER_EMAIL_DOMAIN   = '@cnsa.hs.kr';

function getEntryPassword_() {
  const props = PropertiesService.getScriptProperties();
  return props.getProperty(ENTRY_PW_PROP_KEY) || ENTRY_DEFAULT_PASSWORD;
}
function setEntryPassword(newPw) {
  assertAdminOrTeacher_('setEntryPassword');
  if (!newPw) throw new Error('비밀번호가 비었습니다.');
  PropertiesService.getScriptProperties().setProperty(ENTRY_PW_PROP_KEY, String(newPw));
  logAdminAction_('설정변경', 'ENTRY_PASSWORD', '입장 비밀번호 변경');
  return { success: true };
}
function normalizeTeacherId_(raw) {
  let s = String(raw || '').trim().toLowerCase();
  if (!s) return '';
  const at = s.indexOf('@');
  if (at >= 0) s = s.slice(0, at);
  return s;
}
function getTeacherIdSet_() {
  const cache = CacheService.getScriptCache();
  const cached = cache.get('TEACHER_ID_SET_V1');
  // [v4.0.6/안정성-P1] 캐시 손상 시 throw 방지 — 손상된 캐시는 무효화 후 재로드
  if (cached) {
    try { return new Set(JSON.parse(cached)); }
    catch (_) { try { cache.remove('TEACHER_ID_SET_V1'); } catch (__) {} }
  }
  const ss = SpreadsheetApp.openById(TEACHER_SHEET_ID);
  const sh = TEACHER_SHEET_NAME ? ss.getSheetByName(TEACHER_SHEET_NAME) : ss.getSheets()[0];
  if (!sh) throw new Error('교사 목록 시트를 찾을 수 없습니다.');
  const values = sh.getDataRange().getDisplayValues();
  const ids = [];
  const emailRe = new RegExp(String(TEACHER_EMAIL_DOMAIN).replace('.', '\\.') + '$', 'i');
  for (let r = 0; r < values.length; r++) {
    for (let c = 0; c < values[r].length; c++) {
      const cell = String(values[r][c] || '').trim();
      if (!cell) continue;
      const lower = cell.toLowerCase();
      if (lower.endsWith(TEACHER_EMAIL_DOMAIN) || emailRe.test(lower)) {
        const local = lower.split('@')[0];
        if (local) ids.push(local);
      }
    }
  }
  const uniq = Array.from(new Set(ids));
  cache.put('TEACHER_ID_SET_V1', JSON.stringify(uniq), 60 * 10);
  return new Set(uniq);
}

/**
 * [SR4] 교사 목록 캐시 수동 무효화.
 * 신규 교사를 교사 시트에 추가한 직후 즉시 반영하고 싶을 때 GAS 편집기에서 실행.
 * 반환: 성공 메시지 문자열
 */
// [v4.0.9/UX-25] 신청제한 명단 전체 일괄 만료 — 종료일을 어제로 바꿔 즉시 풀림
function expireAllRestrictions() {
  assertAdminOrTeacher_('expireAllRestrictions');
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return { success: false, message: '서버가 바쁩니다.' };
  try {
    const sh = ensureRestrictSheet_();
    const v = sh.getDataRange().getValues();
    if (v.length < 2) return { success: true, count: 0, message: '만료할 항목이 없습니다.' };
    const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
    const endCol = (RESTRICT_HEADERS.indexOf('종료일') + 1) || 5;
    let count = 0;
    for (let i = 1; i < v.length; i++) {
      sh.getRange(i + 1, endCol).setValue(yesterday);
      count++;
    }
    SpreadsheetApp.flush();
    // [v4.18/S1] 코어 직접 호출(이미 잠금 보유) + 해제 마커를 '오늘'로 기록.
    //   기존: purge 직후 recalcRestrictedList() 가 같은 경고를 다시 세어 그 자리에서 재제한
    //   (일괄 만료 자기 무효화). 마커 도입으로 오늘까지의 경고는 소진 처리되므로 recalc 불필요.
    const todayStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
    try { purgeExpiredRestrictionsCore_(todayStr); } catch (_) {}
    // [P0-#1] 신청서 GAS 의 restricted-list:v1 캐시 즉시 무효화 (cross-system).
    try { clearApplicationServerCache_(['restricted-list:v1']); } catch (_) {}
    logAdminAction_('일괄만료', '제한명단', count + '건 만료 처리');
    return { success: true, count: count, message: count + '건 만료 처리되었습니다.' };
  } catch (e) {
    return { success: false, message: e.message };
  } finally { lock.releaseLock(); }
}

function invalidateTeacherCache() {
  assertAdminOrTeacher_('invalidateTeacherCache');
  var c = CacheService.getScriptCache();
  c.remove('TEACHER_ID_SET_V1');
  // [v4.0.5/B] getTeacherListForEdit 캐시도 함께 무효화
  c.remove('TEACHER_LIST_FOR_EDIT_V1');
  try { logAdminAction_('캐시무효화', 'TEACHER_ID_SET_V1+TEACHER_LIST_FOR_EDIT_V1', '교사 목록 캐시 수동 초기화'); } catch (e) {}
  return '교사 목록 캐시를 비웠습니다. 다음 로그인부터 즉시 반영됩니다.';
}

/* ============================================================
 * [P0-#1] Cross-system 캐시 무효화 — 관리자 → 신청서 GAS 호출
 *
 * 신청서 GAS 와 관리자 GAS 는 별도 프로젝트라 CacheService 도 분리되어 있다.
 * 관리자가 신청제한명단/시약 마스터 등을 변경해도 신청서 GAS 의 캐시(최대 5분 TTL)
 * 가 유지되어 학생 신청에 옛 데이터가 적용되는 시간 윈도우가 존재했다.
 *
 * 이 함수는 신청서 GAS 의 web app endpoint(?action=clearCache)를 HTTP 호출하여
 * 즉시 캐시를 무효화한다. 보안: ScriptProperties 의 토큰을 함께 전송, 미일치 시 거부.
 *
 * 운영 흐름 (한 번만 설정):
 *   1) 신청서 GAS 에디터에서: setCacheClearToken('아무_긴_랜덤_문자열') 1회 실행
 *   2) 관리자 GAS 에디터에서: setApplicationServerConfig(신청서_웹앱_URL, 동일_토큰) 1회 실행
 *
 * 호출 예:
 *   clearApplicationServerCache_(['restricted-list:v1']);
 *   clearApplicationServerCache_(['chem-master:v1', 'lab-teacher-email:*']);
 *   clearApplicationServerCache_();  // 인자 없으면 모든 허용 키 비움
 * ============================================================ */
function setApplicationServerConfig(webAppUrl, token) {
  assertAdminOrTeacher_('setApplicationServerConfig');
  if (!webAppUrl || !/^https?:\/\//.test(String(webAppUrl))) {
    throw new Error('신청서 web app URL 은 http(s):// 로 시작해야 합니다.');
  }
  // [2026-08-22] Apps Script 배포 URL 로 제한 — clearApplicationServerCache_ 가 이 URL 로
  //   배포계정 OAuth 토큰을 보내므로, 임의 호스트가 설정되면 토큰이 유출된다.
  if (!_adm_isAppsScriptWebAppUrl_(webAppUrl)) {
    throw new Error('Apps Script 배포 URL 형식이 아닙니다.\n' +
      '예: https://script.google.com/macros/s/AKfycb.../exec');
  }
  if (!token || String(token).length < 16) {
    throw new Error('토큰은 16자 이상이어야 합니다. 신청서 GAS 의 setCacheClearToken 과 동일 값을 사용하세요.');
  }
  const props = PropertiesService.getScriptProperties();
  props.setProperty('APP_SERVER_URL', String(webAppUrl));
  props.setProperty('APP_SERVER_TOKEN', String(token));
  return '신청서 서버 설정이 저장되었습니다. (URL+토큰)';
}

/* ============================================================
 * [P1-#12] 시트 스키마 진단 함수 — 운영자가 시트 헤더 변경 후 GAS 편집기에서 1회 실행하여
 * 모든 시트의 필수 헤더가 정상 존재하는지 한 번에 검증한다.
 *
 * 사용:
 *   관리자 GAS 편집기 → diagnoseSheetSchema 함수 선택 → 실행 → 실행 로그(View > Logs) 확인.
 *
 * 검증 대상:
 *   - MAIN_SSID 첫 시트: 신청ID, 대표자학번, 대표자이름, 실험할날짜, 신청실험실, 신청시간, 지도승인여부, 최종승인여부
 *   - CHEM_RECORD_SSID: 신청ID, 시약명, 교사임장여부
 *   - LAB_TEACHER_SSID: 담당 실험실(또는 변형), 이메일 주소(또는 변형)
 *   - TEACHER_LIST_SSID: 교사이름(또는 변형), 이메일주소(또는 변형)
 * ============================================================ */
function diagnoseSheetSchema() {
  assertAdminOrTeacher_('diagnoseSheetSchema');
  const out = [];
  const checkSheet = (label, ssid, sheetIdx, required) => {
    try {
      const ss = SpreadsheetApp.openById(ssid);
      const sheets = ss.getSheets();
      const sh = (typeof sheetIdx === 'number') ? sheets[sheetIdx] : ss.getSheetByName(sheetIdx);
      if (!sh) {
        out.push('[' + label + '] ❌ 시트를 찾을 수 없음 — sheetIdx=' + sheetIdx);
        return;
      }
      const lastCol = sh.getLastColumn();
      if (lastCol === 0) {
        out.push('[' + label + '] ❌ 헤더 비어있음 (시트=' + sh.getName() + ')');
        return;
      }
      const hdr = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(h => String(h || '').trim());
      const missing = [];
      required.forEach(spec => {
        const candidates = Array.isArray(spec) ? spec : [spec];
        const found = candidates.some(c => hdr.indexOf(c) !== -1);
        if (!found) missing.push(candidates.join(' / '));
      });
      if (missing.length === 0) {
        out.push('[' + label + '] ✅ 정상 (시트=' + sh.getName() + ')');
      } else {
        out.push('[' + label + '] ⚠️ 누락: ' + missing.join('; ') +
                 ' / 현재 헤더: ' + hdr.join(' | '));
      }
    } catch (e) {
      out.push('[' + label + '] ❌ 예외: ' + (e && e.message || e));
    }
  };

  checkSheet('MAIN', MAIN_SSID, 0, [
    '신청ID', '대표자학번', '대표자이름', '실험할날짜',
    '신청실험실', '신청시간', '지도승인여부', '최종승인여부'
  ]);
  checkSheet('CHEM_RECORD', CHEM_RECORD_SSID, 0, [
    '신청ID', '시약명', '교사임장여부'
  ]);
  checkSheet('LAB_TEACHER', LAB_TEACHER_SSID, 0, [
    ['담당 실험실', '담당실험실'],
    ['이메일 주소', '이메일주소']
  ]);
  checkSheet('TEACHER_LIST', TEACHER_LIST_SSID, 0, [
    ['교사이름', '성명', '이름'],
    ['이메일주소', '이메일 주소', '이메일']
  ]);

  const summary = '시트 스키마 진단 결과 (' + new Date().toISOString() + ')\n' + out.join('\n');
  Logger.log(summary);
  return summary;
}

/**
 * 신청서 GAS 캐시를 무효화. 실패해도 호출자 흐름은 차단하지 않음(try-catch로 감쌈).
 * [P1-#8] 토큰 미설정 가시화: 운영자가 인지할 수 있도록 1시간에 1번 SCIENCE_EMAIL 알림 (스팸 방지 throttle).
 * [P2-#22] 재시도: 일시적 HTTP 오류(5xx) 또는 네트워크 예외 시 최대 2회 재시도 (총 3회 시도, 2초/4초 대기).
 *   화이트리스트 외 키 같은 영구 실패(4xx, parse_error 등)는 재시도하지 않는다.
 */
/**
 * [2026-08-22] APP_SERVER_URL 이 Apps Script 웹앱 배포 URL 인지 검사.
 *   clearApplicationServerCache_ 가 이 URL 로 배포계정 OAuth 토큰(Bearer)을 보내므로,
 *   토큰이 외부 호스트로 새 나가지 않게 막는 가드다.
 *   허용 형태:
 *     https://script.google.com/macros/s/<ID>/exec
 *     https://script.google.com/a/macros/<도메인>/s/<ID>/exec   (도메인 배포 형태)
 */
function _adm_isAppsScriptWebAppUrl_(url) {
  const u = String(url || '');
  if (!/^https:\/\/script\.google\.com\//.test(u)) return false;
  return /\/macros\/(s|[^/]+\/s)\/[A-Za-z0-9_-]+\/(exec|dev)\b/.test(u);
}

function clearApplicationServerCache_(keys) {
  const props = PropertiesService.getScriptProperties();
  const url   = props.getProperty('APP_SERVER_URL') || '';
  const token = props.getProperty('APP_SERVER_TOKEN') || '';
  if (!url || !token) {
    Logger.log('[clearApplicationServerCache_] 설정 미완료 — setApplicationServerConfig() 1회 실행 필요');
    // [P1-#8] 1시간 throttle 알림 — 운영 시작 후 토큰 미설정 상태가 누적되지 않도록.
    try {
      const cache = CacheService.getScriptCache();
      const ck = 'cross-clear-config-missing-warned';
      if (!cache.get(ck) && typeof _adm_sendMail_ === 'function' && typeof SCIENCE_EMAIL !== 'undefined') {
        _adm_sendMail_(
          SCIENCE_EMAIL,
          '[수동 처리 요청] cross-system 캐시 무효화 설정 누락',
          '<b>관리자 GAS의 신청서 캐시 무효화 설정이 미완료입니다.</b><br><br>' +
          '설정이 완료되지 않아 관리자에서 신청제한명단·시약 마스터 등을 변경해도 ' +
          '신청서 측에 최대 5분간 옛 데이터가 적용될 수 있습니다.<br><br>' +
          '<b>해결 방법:</b><br>' +
          '1) 신청서 GAS 편집기에서 <code>setCacheClearToken(\'아무_긴_랜덤_문자열\')</code> 1회 실행<br>' +
          '2) 관리자 GAS 편집기에서 <code>setApplicationServerConfig(\'신청서_URL\', \'동일_토큰\')</code> 1회 실행<br>' +
          '3) 관리자 GAS 편집기에서 <code>clearAllCaches()</code> 실행으로 검증<br><br>' +
          '※ 이 알림은 1시간에 1번만 발송됩니다.'
        );
        cache.put(ck, '1', 3600); // 1시간
      }
    } catch (_) { /* 알림 실패는 무시 */ }
    return { ok: false, error: 'config_missing' };
  }

  // [2026-08-22] 신청서 웹앱은 access=DOMAIN 이라 무인증 GET 은 구글 로그인 HTML 을 돌려준다.
  //   (이 호출이 지금까지 parse_error 로 조용히 실패해 온 진짜 원인 — 신청서에 핸들러가
  //    없던 문제와 겹쳐 있었다.) 배포 계정 OAuth 토큰을 Authorization 헤더로 붙여 호출한다.
  //   토큰 유출 방지를 위해 Apps Script 호스트가 아니면 아예 보내지 않는다.
  if (!_adm_isAppsScriptWebAppUrl_(url)) {
    Logger.log('[clearApplicationServerCache_] Apps Script 배포 URL 이 아니라 호출 중단: ' + url);
    return { ok: false, error: 'bad_host',
             message: 'APP_SERVER_URL 이 Apps Script 배포 URL(.../macros/s/<ID>/exec) 이 아닙니다.' };
  }

  const keysParam = (Array.isArray(keys) && keys.length) ? keys.join(',') : '';
  const fullUrl = url
    + (url.indexOf('?') >= 0 ? '&' : '?')
    + 'action=clearCache&token=' + encodeURIComponent(token)
    + (keysParam ? '&keys=' + encodeURIComponent(keysParam) : '');

  // [P2-#22] 최대 3회 시도 (1+2 재시도). 일시적 5xx/예외만 재시도, 4xx·인증 실패는 즉시 종료.
  const MAX_ATTEMPTS = 3;
  let lastError = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const resp = UrlFetchApp.fetch(fullUrl, {
        method: 'get',
        muteHttpExceptions: true,
        followRedirects: true,
        // [2026-08-22] access=DOMAIN 웹앱 호출용 인증 (호스트는 위에서 검증했다)
        headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }
      });
      const code = resp.getResponseCode();
      const body = resp.getContentText();
      if (code !== 200) {
        const isRetryable = (code >= 500 && code < 600); // 5xx만 재시도
        Logger.log('[clearApplicationServerCache_] attempt=' + attempt + ' HTTP ' + code +
                   ' body=' + body.substring(0, 200));
        lastError = { ok: false, error: 'http_' + code };
        if (!isRetryable) return lastError;
      } else {
        let parsed;
        try {
          parsed = JSON.parse(body);
        } catch (_) {
          // [2026-08-22] HTML 이 돌아오는 경우를 따로 표시해 진단 시간을 줄인다.
          const looksHtml = /^\s*<(!doctype|html)/i.test(body);
          parsed = {
            status: 'parse_error',
            message: (looksHtml
              ? 'JSON 대신 HTML 응답 — 신청서에 clearCache 핸들러가 없거나 인증 거부(로그인 페이지). '
              : '') + body.substring(0, 200)
          };
        }
        if (parsed.status !== 'ok') {
          Logger.log('[clearApplicationServerCache_] 응답 상태=' + parsed.status + ' message=' + parsed.message);
          // 응답 상태가 ok가 아니면 영구 실패로 판단 (재시도해도 결과 동일)
          return { ok: false, error: parsed.status, message: parsed.message };
        }
        // [P2-#32] skipped 항목(화이트리스트 외 키)이 있으면 운영자 가시화.
        //   관리자가 의도하지 않은 키를 보냈을 때 반환값에 명시되어 호출자가 인지 가능.
        if (Array.isArray(parsed.skipped) && parsed.skipped.length > 0) {
          Logger.log('[clearApplicationServerCache_] 화이트리스트 외 키 거부됨: ' + parsed.skipped.join(','));
        }
        return {
          ok: true,
          message: parsed.message,
          cleared: Array.isArray(parsed.cleared) ? parsed.cleared : [],
          skipped: Array.isArray(parsed.skipped) ? parsed.skipped : [],
          attempts: attempt
        };
      }
    } catch (e) {
      Logger.log('[clearApplicationServerCache_] attempt=' + attempt + ' 예외: ' + (e && e.message || e));
      lastError = { ok: false, error: 'exception', message: String(e && e.message || e) };
    }
    // 마지막 시도가 아니면 backoff
    if (attempt < MAX_ATTEMPTS) {
      Utilities.sleep(attempt * 2000); // 2초, 4초
    }
  }
  return lastError || { ok: false, error: 'unknown' };
}

/**
 * [P0-#1] 운영자용 — 관리자/신청서 양쪽 캐시를 한 번에 비운다.
 *
 * 사용 시점:
 *  - 신청제한명단을 관리자 페이지가 아닌 시트에서 직접 수정한 경우
 *  - 시약 마스터(분류·제한 정보) 시트를 직접 수정한 경우
 *  - LAB_TEACHER 시트의 담당자 이메일을 변경한 경우
 *  - 관리자 페이지에서 데이터를 수정했는데 학생 측에 5분간 옛 데이터가 보일 때
 *
 * 실행 방법:
 *  - 관리자 GAS 편집기 → clearAllCaches 함수 선택 → 실행
 *  - 또는 관리자 페이지에 버튼을 만들어 google.script.run 으로 호출
 *
 * @return {string} 처리 결과 메시지
 */
function clearAllCaches() {
  assertAdminOrTeacher_('clearAllCaches');
  const messages = [];

  // 1) 관리자 측 자체 캐시
  try {
    var c = CacheService.getScriptCache();
    c.remove('TEACHER_ID_SET_V1');
    c.remove('TEACHER_LIST_FOR_EDIT_V1');
    c.remove('CHEM_MAP_V1');
    messages.push('[관리자] TEACHER_ID_SET_V1, TEACHER_LIST_FOR_EDIT_V1, CHEM_MAP_V1 비움');
  } catch (e) {
    messages.push('[관리자] 캐시 무효화 실패: ' + (e && e.message || e));
  }

  // 2) 신청서 GAS 측 캐시 (cross-system)
  const r = clearApplicationServerCache_(); // 인자 없음 = 허용된 모든 키
  if (r.ok) {
    messages.push('[신청서] ' + r.message);
  } else if (r.error === 'config_missing') {
    messages.push('[신청서] 설정 미완료 — setApplicationServerConfig(웹앱URL, 토큰) 1회 실행 후 재시도');
  } else {
    messages.push('[신청서] 무효화 실패: ' + (r.message || r.error));
  }

  try { logAdminAction_('캐시무효화', '전체', messages.join(' / ')); } catch (_) {}
  return messages.join('\n');
}

function getAppUrl() {
  return ScriptApp.getService().getUrl();
}
// [v4.0.5/A] verifyTeacherId/verifyPassword 응답에 appUrl 을 동봉하여 클라이언트의 getAppUrl 추가 왕복 제거.
//   entry.html 의 인라인 APP_BASE_URL 보다 더 안정적인 보조 채널.
function verifyTeacherId(userId) {
  var raw = String(userId || '').trim().toLowerCase();
  if (!raw) return { ok:false, reason:'EMPTY' };
  var prefix = raw;
  var at = raw.indexOf('@');
  if (at > 0) prefix = raw.slice(0, at);
  try {
    var set = getTeacherIdSet_();
    var ok = set.has(prefix);
    return ok ? { ok:true, appUrl: ScriptApp.getService().getUrl() } : { ok:false };
  } catch (err) {
    return { ok:false, reason:'ERROR', message: String(err && err.message || err) };
  }
}

/**
 * ★ [신규] Google 세션 기반 자동 인증 — 사용자 입력 없이 로그인된 계정만으로 검증.
 *   학생이 교사 아이디를 외워도 본인 Google 계정이 교사 시트에 없으면 거부.
 *   학과(SCIENCE_EMAIL) / ADMIN_EMAILS / 교사 시트 등록자만 통과.
 *   거부 시 학과에 자동 알림 메일.
 */
function verifyTeacherBySession() {
  var email = '';
  try { email = String(Session.getActiveUser().getEmail() || '').trim().toLowerCase(); }
  catch (_) {}

  if (!email) {
    return { ok:false, reason:'NO_SESSION', message:'세션 정보를 가져올 수 없습니다. 로그아웃 후 다시 로그인해 주세요.' };
  }

  // 차단 명단 우선 체크
  try {
    var blocked = CacheService.getScriptCache().get('adm-block:' + email);
    if (blocked) {
      try { _adm_logAccess_('verifyTeacherBySession', email, '', 'deny', 'BLOCKED'); } catch(_) {}
      return { ok:false, reason:'BLOCKED', message:'⛔ 일시 차단된 계정입니다.' };
    }
  } catch (_) {}

  // 학과 / ADMIN_EMAILS
  if (_adm_isAdminEmail_(email)) {
    try { _adm_logAccess_('verifyTeacherBySession', email, '', 'allow', 'admin'); } catch(_) {}
    // ★ 학과 계정일 때 자연스러운 표시명 — 'cnsa.science' 같은 prefix 노출 방지
    var adminName = (email === String(SCIENCE_EMAIL || '').toLowerCase()) ? '과학기술과' : '관리자';
    return _issueSessionToken_(email, 'admin', adminName);
  }

  // 교사 시트 (이메일 직접 매칭)
  var teacher = _adm_getSessionTeacher_();
  if (teacher) {
    try { _adm_logAccess_('verifyTeacherBySession', email, '', 'allow', 'teacher:' + (teacher.name||'')); } catch(_) {}
    return _issueSessionToken_(email, 'teacher', teacher.name);
  }

  // 교사 시트의 'prefix' 매칭도 시도 (기존 호환 — 이메일 prefix와 교사 ID 동일한 경우)
  try {
    var prefix = email.indexOf('@') > 0 ? email.slice(0, email.indexOf('@')) : email;
    var set = getTeacherIdSet_();
    if (set.has(prefix)) {
      try { _adm_logAccess_('verifyTeacherBySession', email, '', 'allow', 'teacher-by-prefix'); } catch(_) {}
      return _issueSessionToken_(email, 'teacher', prefix);
    }
  } catch (_) {}

  // ★ 거부 — 학생 계정으로 추정. 의심 점수 + 학과 알림
  try {
    _adm_logAccess_('verifyTeacherBySession', email, '', 'deny', '관리자 페이지 무단 접근 시도');
    _adm_recordSuspicious_(email, 5, '관리자 페이지 접근 시도 (Google 세션 미등록)');
    _notifyUnauthorizedAdminAccess_(email);
  } catch (_) {}
  return { ok:false, reason:'NOT_AUTHORIZED', message:'⛔ 접근 권한이 없습니다.\n\n관리자 페이지는 교사·학과 관리자 계정으로만 접근할 수 있습니다.\n본인이 교사이신데 거부되었다면 학과(' + SCIENCE_EMAIL + ')에 문의해 주세요.' };
}

/** ★ [신규] 활성 세션 토큰 발급 — 10분 비활성 자동 만료용 */
function _issueSessionToken_(email, role, name) {
  var token = Utilities.base64EncodeWebSafe(
    Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, email + ':' + Date.now() + ':' + Math.random())
  ).slice(0, 24).replace(/=+$/, '');
  var ttlSec = 600; // 10분
  try {
    CacheService.getScriptCache().put('sess:' + token, JSON.stringify({
      email: email, role: role, name: name || '', issued: Date.now()
    }), ttlSec);
  } catch (_) {}
  return {
    ok: true,
    appUrl: ScriptApp.getService().getUrl(),
    sessionToken: token,
    role: role,
    displayName: name || email.split('@')[0],
    email: email, // [v4.18/S6] entry 화면 "현재 로그인" 실제 계정 표시용
    ttlSec: ttlSec
  };
}

/** ★ [신규] 세션 토큰 갱신 — 활동 시 호출해 만료 시간 연장 */
function refreshSessionToken(token) {
  if (!token) return { ok:false, reason:'NO_TOKEN' };
  var cache = CacheService.getScriptCache();
  var raw = cache.get('sess:' + token);
  if (!raw) return { ok:false, reason:'EXPIRED' };
  // TTL 재설정 (10분)
  try { cache.put('sess:' + token, raw, 600); } catch (_) {}
  return { ok:true };
}

/** ★ [신규] 세션 토큰 무효화 — 명시적 로그아웃 */
function revokeSessionToken(token) {
  if (token) {
    try { CacheService.getScriptCache().remove('sess:' + token); } catch (_) {}
  }
  return { ok:true };
}

/** 무단 접근 시 학과 알림 메일 */
function _notifyUnauthorizedAdminAccess_(email) {
  try {
    if (typeof _adm_sendMail_ === 'function') {
      var lines = [
        '<b>🚨 관리자 페이지 무단 접근 시도</b>',
        '교사·관리자가 아닌 계정으로 관리자 페이지에 접근하려 했습니다.',
        '',
        '• 시도 계정: ' + email,
        '• 발생 시각: ' + new Date().toLocaleString('ko-KR'),
        '',
        '의심 시 접속로그_관리자 시트 확인 + 학생 본인에게 경고 권장.'
      ];
      _adm_sendMail_(SCIENCE_EMAIL,
        '[보안] 관리자 페이지 무단 접근 시도: ' + email,
        _adm_buildEmailHtml_('🚨 관리자 무단 접근 시도', lines));
    }
  } catch (_) {}
}
function verifyPassword(pw) {
  var input = String(pw || '');
  var saved = String(getEntryPassword_() || '');
  var ok = input === saved;
  return ok ? { ok:true, appUrl: ScriptApp.getService().getUrl() } : { ok:false };
}

/* ==================================================
 *  테스트/간단 조회
 * ================================================== */
function testConnection() {
  assertAdminOrTeacher_('testConnection');
  try {
    const ss = SpreadsheetApp.openById(MAIN_SSID);
    const sh = ss.getSheets()[0];
    const info = {
      success: true,
      sheetName: sh.getName(),
      rowCount: sh.getLastRow(),
      colCount: sh.getLastColumn(),
      message: '연결 성공!'
    };
    if (sh.getLastRow()>0) {
      const headers = sh.getRange(1,1,1, sh.getLastColumn()).getValues()[0];
      info.headers = headers;
      if (sh.getLastRow()>1) {
        const n = Math.min(3, sh.getLastRow()-1);
        info.sampleData = sh.getRange(2,1,n, sh.getLastColumn()).getValues();
      }
    }
    return info;
  } catch (err) {
    return { success:false, error:err.message, message:'연결 실패: '+err.message };
  }
}
function getSimpleApplications() {
  assertAdminOrTeacher_('getSimpleApplications');
  try {
    const ss = SpreadsheetApp.openById(MAIN_SSID);
    const sh = ss.getSheets()[0];
    const vals = sh.getDataRange().getValues();
    if (vals.length<2) return { success:true, data:[], message:'데이터가 없습니다' };
    const [hdr, ...rows] = vals;
    const max = Math.min(50, rows.length);
    const data = [];
    for (let i=0;i<max;i++){
      const row=rows[i], obj={};
      hdr.forEach((h,j)=>{
        const v=row[j];
        if (v instanceof Date) obj[h]=toLocalISOString_(v);
        else if (v==null) obj[h]='';
        else obj[h]=String(v);
      });
      obj.chemicals=[];
      data.push(obj);
    }
    return { success:true, data, message:`${data.length}개 로드` };
  } catch (e) {
    return { success:false, error:e.message, data:[], message:'조회 실패: '+e.message };
  }
}

/* ==================================================
 *  유틸: 대상 시트 선택 (제외 시트 반영)
 * ================================================== */
function getTargetSheets_(ss){
  const names = new Set(EXCLUDED_SHEETS.map(String));
  // [v4.18/S1] 이름 제외 + 헤더 판별 이중 필터 — 로그·보고서 탭이 신청 데이터로 취급되는 것 차단
  return ss.getSheets().filter(sh => !names.has(sh.getName()) && isApplicationSheet_(sh));
}
function pickSheetsForRange_(ss, from, to) {
  // [v4.18/S6] "짧은 기간은 첫 시트만" 최적화 제거 — 신청 시트가 2개 이상이거나 탭 순서가
  //   바뀌면 기본 조회에서 데이터가 조용히 누락되는 위험이 성능 이득보다 큼.
  //   getTargetSheets_ 의 이름+헤더 이중 필터가 이미 신청 시트만 골라내므로 전 시트 스캔.
  return getTargetSheets_(ss);
}

/* ==================================================
 *  날짜/타임존 안전 유틸 (★ 수정됨 - 시간대 통일)
 * ================================================== */

/** 문자열/시리얼/Date → Date 변환(실패 시 null) - ✅ 시간대 통일 */
function parseToDateSafe_(v) {
  if (v instanceof Date && !isNaN(v)) return new Date(v.getTime());
  if (typeof v === 'number' && isFinite(v)) {
    if (v > 1e10) return new Date(v);
    const epoch = new Date(Date.UTC(1899,11,30));
    const ms = v * 24 * 60 * 60 * 1000;
    const d  = new Date(epoch.getTime() + ms);
    return isNaN(d) ? null : d;
  }
  if (typeof v === 'string') {
    const s = v.trim();
    if (!s) return null;
    
    // ✅ 시간대 통일: yyyy-MM-dd 형식 감지 후 스크립트 타임존 기준으로 파싱
    const match = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (match) {
      const tz = Session.getScriptTimeZone();
      const year = parseInt(match[1], 10);
      const month = parseInt(match[2], 10) - 1;
      const day = parseInt(match[3], 10);
      const d = new Date(year, month, day);
      return isNaN(d) ? null : d;
    }
    
    const d = new Date(s);
    if (!isNaN(d)) return d;
    return null;
  }
  return null;
}

/** 로컬 타임존(스크립트 TZ) 기준으로 자정(00:00:00.000)으로 내림 */
function toLocalMidnight_(d) {
  if (!(d instanceof Date) || isNaN(d)) return null;
  const tz = Session.getScriptTimeZone();
  const s  = Utilities.formatDate(d, tz, 'yyyy-MM-dd');
  const md = new Date(s + 'T00:00:00');
  return isNaN(md) ? null : md;
}

/** 오늘 자정(로컬) */
function todayLocalMidnight_() {
  return toLocalMidnight_(new Date());
}

/** 날짜 비교용 포맷 (yyyy-MM-dd) */
function formatDateForCompare_(dateVal) {
  const d = parseToDateSafe_(dateVal);
  if (!d) return '';
  return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

/**
 * Date → 스크립트 타임존(KST) 기준 ISO 형식 문자열
 * toISOString()은 UTC 기준이라 KST와 최대 -1일 오프셋 발생.
 * 이 함수는 'Z' 없이 로컬 시간을 반환하므로 클라이언트에서
 * new Date()로 파싱 시 브라우저 로컬 시간으로 올바르게 해석됨.
 */
function toLocalISOString_(d) {
  if (!(d instanceof Date) || isNaN(d)) return '';
  const tz = Session.getScriptTimeZone();
  return Utilities.formatDate(d, tz, "yyyy-MM-dd'T'HH:mm:ss");
}

/* ==================================================
 *  데이터 조회/통계
 * ================================================== */

function getAllApplications(filters = {}) {
  assertAdminOrTeacher_('getAllApplications'); // ★ SEC: 학생 콘솔 호출 차단
  try {
    const ss = SpreadsheetApp.openById(MAIN_SSID);
    // [SR11] 파라미터에 양끝 공백이 섞이면 정확 매칭 실패 → 필터 무시되는 실버그 방지
    const basis = String(filters.basis || '실험할날짜').trim();
    const from  = filters.dateFrom ? new Date(filters.dateFrom + 'T00:00:00') : null;
    const to    = filters.dateTo   ? new Date(filters.dateTo + 'T23:59:59') : null;
    // [v4.18/S3] scanAll: 짧은 기간 최적화(첫 시트만)를 건너뛰고 전 신청 시트 조회
    const sheets = filters.scanAll ? getTargetSheets_(ss) : pickSheetsForRange_(ss, from, to);
    const list = [];

    // ✅ 성능 최적화: includeChemicals=false이면 별도 스프레드시트 호출 생략
    const needChemicals = filters.includeChemicals !== false;
    const chemMap = needChemicals ? loadAllChemicalsMap_() : null;

    sheets.forEach(sh=>{
      const vals = sh.getDataRange().getValues();
      if (vals.length < 2) return;
      const [hdr, ...rows] = vals;
      const idIdx = hdr.indexOf('신청ID');
      if (idIdx === -1) {
        // [SR15] 조용한 skip → 시트 손상/초기 미설정 상태를 운영자가 인지하도록 경고 로그
        Logger.log('[getAllApplications] 헤더에 "신청ID"가 없어 이 시트는 건너뜁니다: ' + sh.getName());
        return;
      }
      const keyDateCol = (basis === '실험할날짜') ? hdr.indexOf('실험할날짜') : hdr.indexOf('제출일시');
      const hasKeyDate = keyDateCol !== -1;
      if (!hasKeyDate) {
        Logger.log('[getAllApplications] 헤더에 "' + basis + '"가 없어 날짜 필터가 적용되지 않습니다: ' + sh.getName());
      }

      rows.forEach(row=>{
        if (hasKeyDate) {
          const dt = parseToDateSafe_(row[keyDateCol]);
          if (from && (!dt || dt < from)) return;
          if (to   && (!dt || dt > to))   return;
        }
        const app = {};
        hdr.forEach((h,i)=>{
          const v=row[i];
          if (h==='제출일시' || h==='실험할날짜') {
            const d = parseToDateSafe_(v);
            app[h] = d ? toLocalISOString_(d) : (v==null ? '' : String(v));
          } else if (h==='임장지도 시작시간' || h==='임장지도 종료시간') {
            app[h]=normalizeToHHmm_(v);
          } else {
            app[h]=(v==null)?'':String(v);
          }
        });
        const appId = app['신청ID'];
        app.chemicals = chemMap ? (chemMap.get(appId) || []) : [];
        list.push(app);
      });
    });

    let out = list.filter(app=>{
      // [v2] 룸 필터 — 신규 양식의 '사용실험실목록'(콤마결합)에도 매칭 (예: '코딩실' 검색이 '컴퓨터실, 코딩실' 신청을 포함)
      if (filters.lab) {
        const labQ = String(filters.lab);
        if (String(app['신청실험실']) !== labQ) {
          const labList = String(app['사용실험실목록'] || '').split(',').map(s => s.trim()).filter(Boolean);
          if (labList.indexOf(labQ) === -1) return false;
        }
      }
      if (filters.status) {
        const s = getApplicationStatusForAdmin(app);
        if (s !== String(filters.status)) return false;
      }
      if (filters.searchTerm) {
        const t=String(filters.searchTerm).toLowerCase();
        const k1=String(app['대표자학번']||'').toLowerCase();
        const k2=String(app['대표자이름']||'').toLowerCase();
        const k3=String(app['실험제목']||'').toLowerCase();
        const k4=String(app['지도교사이름']||'').toLowerCase();
        // [v2] 양식종류 한글 라벨로도 검색 (예: 'IT', '가정', '공학', '1층', '2층')
        const k5=labelForFormCategory_(app).toLowerCase();
        if (!(k1.includes(t)||k2.includes(t)||k3.includes(t)||k4.includes(t)||k5.includes(t))) return false;
      }
      return true;
    });

    out.sort((a,b)=>{
      const da=new Date(a['제출일시']), db=new Date(b['제출일시']);
      return db - da;
    });
    return out;
  } catch (e) {
    console.error('getAllApplications 오류:', e);
    throw new Error('신청서 목록을 불러오는 중 오류: '+e.message);
  }
}

function getApplicationById(applicationId) {
  assertAdminOrTeacher_('getApplicationById');
  if (!applicationId) return null;
  const ss = SpreadsheetApp.openById(MAIN_SSID);
  const sheets = getTargetSheets_(ss);
  for (const sh of sheets) {
    const vals = sh.getDataRange().getValues();
    if (vals.length < 2) continue;
    const [hdr, ...rows] = vals;
    const idCol = hdr.indexOf('신청ID');
    if (idCol === -1) continue;
    for (let i = 0; i < rows.length; i++) {
      if (String(rows[i][idCol]) === String(applicationId)) {
        const row = rows[i];
        const app = {};
        hdr.forEach((h, j) => {
          const v = row[j];
          if (h === '제출일시' || h === '실험할날짜') {
            const d = parseToDateSafe_(v);
            app[h] = d ? toLocalISOString_(d) : (v==null ? '' : String(v));
          } else if (h === '임장지도 시작시간' || h === '임장지도 종료시간') {
            app[h] = normalizeToHHmm_(v);
          } else {
            app[h] = (v == null) ? '' : String(v);
          }
        });
        const appId = app['신청ID'];
        // [v4.0.2/P1-6] 신규 양식(IT/가정/공학)은 시약 시트와 무관 → 시약 fetch 자체 생략 (성능)
        app.chemicals = (appId && !isNewLab_(app)) ? getApplicationChemicals(appId) : [];
        return app;
      }
    }
  }
  return null;
}

function getApplicationChemicals(applicationId) {
  assertAdminOrTeacher_('getApplicationChemicals');
  try {
    const ss = SpreadsheetApp.openById(CHEM_RECORD_SSID);
    const sh = ss.getSheets()[0];
    const vals = sh.getDataRange().getValues();
    if (vals.length<2) return [];
    const [hdr, ...rows] = vals;
    // [G-P1] 신청ID 컬럼 위치를 헤더 이름으로 찾는다 — 시약 시트 헤더 재정렬에 안전
    //   기존: r[0] 위치 고정 가정. 헤더 변경 시 잘못된 컬럼으로 비교해 결과 누락.
    //   폴백: 헤더에 '신청ID'가 없으면 1번 컬럼 (기존 동작과 호환).
    let idCol = hdr.indexOf('신청ID');
    if (idCol < 0) idCol = 0;
    const out=[];
    rows.forEach(r=>{
      if (String(r[idCol])===String(applicationId)) {
        const obj={};
        hdr.forEach((h,i)=> obj[h]=(r[i]==null)?'':String(r[i]));
        out.push(obj);
      }
    });
    return out;
  } catch (e) {
    console.error('getApplicationChemicals 오류:', e);
    return [];
  }
}

function loadAllChemicalsMap_() {
  // ✅ 성능 최적화: CacheService로 시약 데이터 캐싱 (5분)
  const cache = CacheService.getScriptCache();
  const cacheKey = 'CHEM_MAP_V1';
  const cached = cache.get(cacheKey);
  if (cached) {
    try {
      const parsed = JSON.parse(cached);
      const map = new Map();
      for (const key in parsed) {
        map.set(key, parsed[key]);
      }
      return map;
    } catch (_) { /* 캐시 파싱 실패 시 아래에서 재로드 */ }
  }

  const map = new Map();
  try {
    const ss = SpreadsheetApp.openById(CHEM_RECORD_SSID);
    const sh = ss.getSheets()[0];
    const vals = sh.getDataRange().getValues();
    if (vals.length < 2) return map;
    const [hdr, ...rows] = vals;
    rows.forEach(r => {
      const appId = String(r[0] || '');
      if (!appId) return;
      const obj = {};
      hdr.forEach((h, i) => obj[h] = (r[i] == null) ? '' : String(r[i]));
      if (!map.has(appId)) map.set(appId, []);
      map.get(appId).push(obj);
    });

    // [SR13] 캐시에 저장 (Map → plain object). CacheService 단일값 100KB 이론 한계 →
    //   안전 마진 포함 80KB로 완화하고, 초과 시 Logger에 경고 기록해 운영자가 파악 가능.
    try {
      const plain = {};
      for (const [k, v] of map) { plain[k] = v; }
      const json = JSON.stringify(plain);
      const MAX_CACHE_BYTES = 80000;
      if (json.length < MAX_CACHE_BYTES) {
        cache.put(cacheKey, json, 60 * 5); // 5분 캐시
      } else {
        Logger.log('[loadAllChemicalsMap_] 캐시 크기 초과(' + json.length + 'B > ' + MAX_CACHE_BYTES + 'B) → 캐시 저장 생략. 다음 호출 시 전체 재로드.');
      }
    } catch (_) { /* 캐시 저장 실패 시 무시 (다음 호출에서 재로드) */ }
  } catch (e) {
    Logger.log('loadAllChemicalsMap_ 오류: ' + e.message);
  }
  return map;
}

/**
 * [SR12/SR13] 시약 캐시 수동 무효화.
 * 관리대장 수정 후 즉시 반영하고 싶을 때 GAS 편집기에서 실행.
 */
function invalidateChemicalMapCache() {
  assertAdminOrTeacher_('invalidateChemicalMapCache');
  CacheService.getScriptCache().remove('CHEM_MAP_V1');
  // [G-P0] 신청서 GAS 의 시약 마스터 캐시(chem-master:v1)도 함께 무효화.
  //   관리자 GAS 의 CHEM_MAP_V1 은 신청 시약 기록 캐시(로컬), 신청서의 chem-master:v1 은
  //   시약 마스터(분류·제한) 캐시. 둘은 별개라 운영자가 시약 마스터 시트를 수정한 뒤
  //   이 함수로 함께 무효화되도록 한다.
  let appResult = '';
  try {
    const r = clearApplicationServerCache_(['chem-master:v1']);
    appResult = r.ok ? ' / 신청서 chem-master:v1 무효화' : (' / 신청서 무효화 실패: ' + (r.error || ''));
  } catch (e) {
    appResult = ' / 신청서 무효화 예외: ' + (e && e.message || e);
  }
  try { logAdminAction_('캐시무효화', 'CHEM_MAP_V1', '시약 맵 캐시 수동 초기화' + appResult); } catch (e) {}
  return '시약 맵 캐시를 비웠습니다.' + appResult;
}

/**
 * [v4.0.2] 신청서 NEW_LAB_CONFIG.sheetCategory 한글 라벨 → 내부 키 매핑.
 * 신청서 Code.gs#2048-2051 이 시트에 저장하는 실제 값:
 *   'IT실'/'가정실습실'/'N동 공학 Zone'(구)/'N동 공학 ZONE, Tech & Art LAB'(현)/'S동 1층'/'S동 2층'.
 */
const SHEET_CAT_MAP_ = {
  'IT실': 'it',
  '가정실습실': 'home',
  'N동 공학 Zone': 'engineering',
  'N동 공학 ZONE': 'engineering',
  // [2026-08] Tech & Art LAB 을 별도 양식으로 분리하기 전의 기존 신청 기록.
  //   옛 저장값도 계속 공학으로 조회되도록 남겨 둔다.
  'N동 공학 ZONE, Tech & Art LAB': 'engineering',
  'Tech & Art LAB': 'techart',
  'S동 1층': 'floor1',
  'S동 2층': 'floor2'
};
function categoryOf_(app) {
  if (!app) return '';
  const raw = String(app['양식종류'] || '').trim();
  if (SHEET_CAT_MAP_[raw]) return SHEET_CAT_MAP_[raw];
  const lower = raw.toLowerCase();
  if (lower === 'it' || lower === 'home' || lower === 'engineering' || lower === 'techart' ||
      lower === 'floor1' || lower === 'floor2') return lower;
  if (/물리|파동|AP\s?Lab/i.test(String(app['신청실험실'] || ''))) return 'floor2';
  return 'floor1';
}

/**
 * 신규 양식(IT/가정/공학) 여부 판별 — 신청서 v2에서 도입된 단일 승인 양식.
 * 단일 승인 흐름이라 '지도승인여부' 단계가 비어 있다.
 */
function isNewLab_(app) {
  const c = categoryOf_(app);
  return c === 'it' || c === 'home' || c === 'engineering' || c === 'techart';
}

/**
 * 신청을 사용자가 인지하는 한글 양식 라벨로 변환 (검색·필터·표시용).
 */
function labelForFormCategory_(app) {
  const KO = { it: 'IT', home: '가정', engineering: '공학', techart: 'Tech&Art', floor1: '1층', floor2: '2층' };
  return KO[categoryOf_(app)] || '';
}

function getApplicationStatusForAdmin(app) {
  const finalApproval = String(app['최종승인여부']||'');
  const firstApproval = String(app['지도승인여부']||'');
  if (finalApproval==='승인') return '최종승인';
  if (firstApproval==='반려' || finalApproval==='반려') return '반려';
  if (firstApproval==='승인') return '1차승인';
  return '대기';
}

function getApplicationStats(filters = {}) {
  assertAdminOrTeacher_('getApplicationStats');
  // ✅ 성능 최적화: 통계 계산에는 시약 데이터 불필요
  const statsFilters = Object.assign({}, filters, { includeChemicals: false });
  const rows = getAllApplications(statsFilters);
  const stats = { total: rows.length, pending:0, firstApproved:0, finalApproved:0, rejected:0 };
  rows.forEach(app=>{
    const s = getApplicationStatusForAdmin(app);
    if (s==='대기') stats.pending++;
    else if (s==='1차승인') stats.firstApproved++;
    else if (s==='최종승인') stats.finalApproved++;
    else if (s==='반려') stats.rejected++;
  });
  return stats;
}

function getAllApplicationsWithStats(filters = {}) {
  assertAdminOrTeacher_('getAllApplicationsWithStats');
  const data = getAllApplications(filters);
  const stats = { total: data.length, pending:0, firstApproved:0, finalApproved:0, rejected:0 };
  data.forEach(app => {
    const s = getApplicationStatusForAdmin(app);
    if (s==='대기') stats.pending++;
    else if (s==='1차승인') stats.firstApproved++;
    else if (s==='최종승인') stats.finalApproved++;
    else if (s==='반려') stats.rejected++;
  });
  return { data, stats };
}

/* ==================================================
 *  CRUD/업데이트
 * ================================================== */
function deleteApplication(applicationId) {
  assertAdminOrTeacher_('deleteApplication');
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) throw new Error('서버가 바쁩니다. 잠시 후 다시 시도해주세요.');
  try {
    if (!applicationId) throw new Error('신청 ID가 필요합니다.');

    // [SR8] 시약을 먼저 삭제. 시약 삭제가 실패하면 주 신청서는 건드리지 않아 고아 레코드 방지.
    //   주 신청서 먼저 삭제 시 시약 삭제 실패로 고아 시약이 남는 문제가 있었음.
    // [P2] 신청ID 컬럼 위치를 헤더 이름으로 찾도록 변경 — 헤더 재정렬에 안전
    let chemRowsDeleted = 0;
    try {
      CacheService.getScriptCache().remove('CHEM_MAP_V1'); // 시약 캐시 무효화
      const css = SpreadsheetApp.openById(CHEM_RECORD_SSID);
      const csh = css.getSheets()[0];
      const v = csh.getDataRange().getValues();
      if (v.length > 1) {
        const chemHdr = v[0].map(h => String(h || '').trim());
        const chemIdCol = chemHdr.indexOf('신청ID');
        // 헤더에 '신청ID'가 없으면 1번 컬럼으로 폴백 (기존 동작과 호환)
        const idColForDelete = (chemIdCol >= 0) ? chemIdCol : 0;
        for (let i = v.length - 1; i >= 1; i--) {
          if (String(v[i][idColForDelete]) === String(applicationId)) {
            csh.deleteRow(i + 1);
            chemRowsDeleted++;
          }
        }
      }
    } catch (e) {
      console.error('시약 삭제 실패 → 신청서 삭제 중단:', e);
      logAdminAction_('시약삭제실패', applicationId, '전체 중단: ' + e.message);
      throw new Error('시약 삭제 중 오류로 삭제를 중단했습니다: ' + e.message + '\n신청서는 그대로 유지됩니다. 다시 시도하거나 관리자에게 문의하세요.');
    }

    // 시약 삭제 성공 후 주 신청서 삭제
    const ss = SpreadsheetApp.openById(MAIN_SSID);
    const sheets = getTargetSheets_(ss);
    let deleted = false;
    for (const sh of sheets) {
      const vals = sh.getDataRange().getValues();
      if (vals.length < 2) continue;
      const [hdr, ...rows] = vals;
      const idCol = hdr.indexOf('신청ID');
      if (idCol === -1) continue;
      for (let i = rows.length - 1; i >= 0; i--) {
        if (String(rows[i][idCol]) === String(applicationId)) {
          sh.deleteRow(i + 2);
          deleted = true; break;
        }
      }
      if (deleted) break;
    }
    if (!deleted) {
      // 드문 경우: 시약은 지워졌지만 주 신청서는 이미 없음 (동시성 or 사전 삭제)
      logAdminAction_('삭제경고', applicationId, '시약 ' + chemRowsDeleted + '건 삭제 후 주 신청서를 찾지 못함');
      throw new Error('해당 신청서를 찾을 수 없습니다. (시약 ' + chemRowsDeleted + '건은 이미 삭제됨)');
    }

    logAdminAction_('삭제', applicationId, '신청서 + 시약 ' + chemRowsDeleted + '건 삭제');
    return `신청서 삭제 완료 (ID: ${applicationId}, 시약 ${chemRowsDeleted}건 포함)`;
  } catch (e) {
    console.error('deleteApplication 오류:', e);
    throw new Error('신청서 삭제 중 오류: ' + e.message);
  } finally { lock.releaseLock(); }
}

function updateApplicationStatus(applicationId, updates) {
  assertAdminOrTeacher_('updateApplicationStatus');
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) throw new Error('서버가 바쁩니다. 잠시 후 다시 시도해주세요.');
  try {
    const result = updateApplicationStatusCore_(applicationId, updates);
    // [v4.18/S1] 잠금 해제 전 flush — setValue 버퍼가 커밋되기 전에 잠금이 풀려
    //   다른 실행이 옛 값을 읽는 race 차단 (공식 권장 패턴)
    SpreadsheetApp.flush();
    return result;
  } finally { lock.releaseLock(); }
}

/**
 * [v4.18/S1] 상태 변경 코어 — 잠금·가드 없음. 반드시 ScriptLock 을 보유한 호출자만 사용.
 * GAS LockService 는 중첩 카운팅이 없어, 내부 함수가 releaseLock 하면 부모의 임계구역까지
 * 그 시점에 풀린다(v4.0.6 이 막았다고 한 승인 race 의 실제 원인). 그래서 코어 분리.
 */
function updateApplicationStatusCore_(applicationId, updates) {
  // [SR17] 날짜 필드가 문자열로 전달되면 시트에 문자열 그대로 박혀 필터/정렬이 깨질 수 있음.
  const DATE_FIELDS = ['실험할날짜', '제출일시'];
  try {
    if (!applicationId) throw new Error('신청 ID가 필요합니다.');
    const ss = SpreadsheetApp.openById(MAIN_SSID);
    const sheets = getTargetSheets_(ss);
    let done=false;
    for (const sh of sheets) {
      const { header, map } = getHeaderMap_(sh);
      if (map['신청ID']==null) continue;
      const vals=sh.getDataRange().getValues();
      const [hdr, ...rows]=vals;
      const idx=rows.findIndex(r=> String(r[map['신청ID']])===String(applicationId));
      if (idx<0) continue;
      const row = idx+2;
      Object.keys(updates).forEach(field=>{
        if (map[field] == null) return;
        let value = updates[field];
        if (DATE_FIELDS.indexOf(field) !== -1 && value && !(value instanceof Date)) {
          const d = new Date(value);
          if (!isNaN(d.getTime())) value = d;
          else Logger.log('[updateApplicationStatus] 날짜 변환 실패: ' + field + '=' + updates[field]);
        }
        sh.getRange(row, map[field]+1).setValue(value);
      });
      done=true; break;
    }
    if (!done) throw new Error('해당 신청서를 찾을 수 없습니다.');
    logAdminAction_('상태변경', applicationId, JSON.stringify(updates));
    return '상태가 업데이트되었습니다.';
  } catch (e) {
    console.error('updateApplicationStatus 오류:', e);
    throw new Error('상태 업데이트 중 오류: '+e.message);
  }
}

function createDataBackup() {
  assertAdminOrTeacher_('createDataBackup');
  const cache = CacheService.getScriptCache();
  // [v4.18/S1] 캐시(6h 휘발) + Properties(영구) 이중 확인 — 24시간 중복 방지 게이트 복원
  let lastBackup = cache.get('LAST_BACKUP_TIME');
  if (!lastBackup) {
    try { lastBackup = PropertiesService.getScriptProperties().getProperty('LAST_BACKUP_TIME'); } catch (_) {}
  }
  if (lastBackup) {
    const elapsed = Date.now() - Number(lastBackup);
    if (elapsed < 24 * 60 * 60 * 1000) {
      throw new Error('최근 24시간 내 백업이 이미 존재합니다. (마지막 백업: ' + new Date(Number(lastBackup)).toLocaleString() + ')');
    }
  }
  try {
    const ts = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd_HHmmss');
    const src = SpreadsheetApp.openById(MAIN_SSID);
    const dst = SpreadsheetApp.create(`실험·실습실신청_백업_${ts}`);
    src.getSheets().forEach(s=>{
      const b = dst.insertSheet(s.getName());
      const v = s.getDataRange().getValues();
      if (v.length>0) b.getRange(1,1,v.length, v[0].length).setValues(v);
    });
    const def = dst.getSheetByName('시트1'); if (def) dst.deleteSheet(def);
    logAdminAction_('백업', dst.getId(), '수동 백업 생성: ' + ts);
    // [v4.18/S1] CacheService TTL 상한은 21600초(6h) — 86400 지정 시 예외로 백업이 항상 '실패' 표시됨.
    //   24시간 중복 방지는 Properties 로 이전.
    try { cache.put('LAST_BACKUP_TIME', String(Date.now()), 21600); } catch (_) {}
    try { PropertiesService.getScriptProperties().setProperty('LAST_BACKUP_TIME', String(Date.now())); } catch (_) {}
    return { backupId:dst.getId(), backupUrl:dst.getUrl(), timestamp:ts };
  } catch (e) {
    console.error('createDataBackup 오류:', e);
    throw new Error('백업 생성 오류: '+e.message);
  }
}

function updateApplicationFields(applicationId, updates) {
  assertAdminOrTeacher_('updateApplicationFields');
  // [정책] 본 함수는 일반 관리자 수정 경로로, '대표자학번/대표자이름'은
  //   변경 불가(신청자 식별 정보 보호). 학번/이름 변경이 필요하면
  //   updateFullApplication 를 사용해야 함. 두 함수의 필드 목록 차이는 의도된 것임.
  // [v2] 신규 양식(IT/가정/공학) 컬럼 9개 추가. '양식종류'는 의도적으로 제외 —
  //   편집 시 신규/기존 라우팅이 깨지므로 읽기전용 유지.
  const EDITABLE_FIELDS = [
    '실험제목', '사용목적', '사용목적 기타', '실험준비물', '실험과정', '실험뒷정리',
    '실험시 주의사항', '안전장구', '첨단기기실 이용 여부', '첨단기기실 이용 사유',
    '후드 사용 여부', '후드 사용 사유', '동반자명단', '총인원수',
    '지도교사이름', '지도교사이메일', '신청실험실', '실험할날짜', '신청시간',
    '지도승인여부', '지도승인의견', '최종승인여부', '최종승인의견',
    '임장지도 시작시간', '임장지도 종료시간',
    // v2 신규 양식 컬럼 (IT/가정/공학)
    '사용실험실목록',
    '사용컴퓨터번호', '납땜여부',
    '위험도구', '사용계획', '재료JSON',
    '신청장비', '교육_장비사용법', '교육_정리방법',
    // [P0-2] 1차 승인 검토 항목 — 사고 시 책임 추적용
    '도구장비_적절성', '실험내용_적절성'
  ];
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) throw new Error('서버가 바쁩니다. 잠시 후 다시 시도해주세요.');
  try {
    if (!applicationId) throw new Error('신청 ID가 필요합니다.');
    // [2026-08-22] 접수 중단 실험실로의 변경 차단 — 시트 쓰기 전에 검증(부분 저장 방지)
    if (updates) _adm_assertLabWritable_(updates['신청실험실']);
    // ✅ 변경 전 상태 미리 읽기 (메일 dispatcher 용)
    const beforeApp = getApplicationById(applicationId);
    const prevState = {
      '지도승인여부': String((beforeApp && beforeApp['지도승인여부']) || ''),
      '최종승인여부': String((beforeApp && beforeApp['최종승인여부']) || '')
    };

    const ss = SpreadsheetApp.openById(MAIN_SSID);
    const sheets = getTargetSheets_(ss);
    let updated=false;
    for (const sh of sheets) {
      const { header, map } = getHeaderMap_(sh);
      const idCol = map['신청ID']; if (idCol==null) continue;
      const vals = sh.getDataRange().getValues();
      const [hdr, ...rows] = vals;
      const idx = rows.findIndex(r=> String(r[idCol])===String(applicationId));
      if (idx<0) continue;
      const row = idx+2;
      Object.keys(updates).forEach(field=>{
        if (!EDITABLE_FIELDS.includes(field)) {
          Logger.log('[updateApplicationFields] 수정 차단 필드: ' + field);
          return;
        }
        if (map[field]!=null) {
          let value = updates[field];
          // [P2-#14] 날짜 타입 일관성 — updateApplicationStatus 의 DATE_FIELDS 패턴과 통일.
          //   '실험할날짜'와 '제출일시' 모두 Date 객체로 변환 후 setValue.
          //   이미 Date 객체면 재생성 안 함 (불필요한 재변환 방지).
          if ((field==='실험할날짜' || field==='제출일시') && value && !(value instanceof Date)) {
            value = new Date(value);
          }
          sh.getRange(row, map[field]+1).setValue(value);
        }
      });
      updated=true; break;
    }
    if (!updated) throw new Error('해당 신청서를 찾을 수 없습니다.');
    SpreadsheetApp.flush();
    // [v4.0.6/안정성-P1] 신청실험실/대표자/날짜 변경 시 시약 맵 캐시가 stale 될 수 있어 무효화
    try { CacheService.getScriptCache().remove('CHEM_MAP_V1'); } catch (_) {}
    logAdminAction_('필드수정', applicationId, Object.keys(updates).join(', '));

    // ✅ [메일 누락 패치] 지도승인여부/최종승인여부 변경 시 자동 메일 발송
    if (updates['지도승인여부'] != null || updates['최종승인여부'] != null) {
      try {
        const newState = {
          '지도승인여부': updates['지도승인여부'] != null ? String(updates['지도승인여부']) : prevState['지도승인여부'],
          '최종승인여부': updates['최종승인여부'] != null ? String(updates['최종승인여부']) : prevState['최종승인여부']
        };
        const comment = updates['지도승인의견'] || updates['최종승인의견'] || '';
        notifyAfterAdminAction_(applicationId, prevState, newState, comment);
      } catch (mailErr) {
        Logger.log('[updateApplicationFields] 메일 발송 hook 에러: ' + mailErr.message);
      }
    }

    const updatedApp = getApplicationById(applicationId);
    return { success:true, message:'신청서 수정 완료', applicationId, updated: updatedApp };
  } catch (e) {
    console.error('updateApplicationFields 오류:', e);
    return { success:false, message:'수정 오류: '+e.message, error:e.message };
  } finally { lock.releaseLock(); }
}

function updateFullApplication(applicationId, data) {
  assertAdminOrTeacher_('updateFullApplication');
  // [v2] 신규 양식(IT/가정/공학) 컬럼 9개 추가. '양식종류'는 의도적으로 제외 —
  //   편집 시 신규/기존 라우팅이 깨지므로 읽기전용 유지.
  const EDITABLE_FIELDS = [
    '대표자학번', '대표자이름',
    '실험제목', '사용목적', '사용목적 기타', '실험준비물', '실험과정', '실험뒷정리',
    '실험시 주의사항', '안전장구', '첨단기기실 이용 여부', '첨단기기실 이용 사유',
    '후드 사용 여부', '후드 사용 사유', '동반자명단', '총인원수',
    '지도교사이름', '지도교사이메일', '신청실험실', '실험할날짜', '신청시간',
    '지도승인여부', '지도승인의견', '최종승인여부', '최종승인의견',
    '임장지도 시작시간', '임장지도 종료시간',
    // v2 신규 양식 컬럼 (IT/가정/공학)
    '사용실험실목록',
    '사용컴퓨터번호', '납땜여부',
    '위험도구', '사용계획', '재료JSON',
    '신청장비', '교육_장비사용법', '교육_정리방법',
    // [P0-2] 1차 승인 검토 항목 — 사고 시 책임 추적용
    '도구장비_적절성', '실험내용_적절성'
  ];
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) throw new Error('서버가 바쁩니다. 잠시 후 다시 시도해주세요.');
  try {
    if (!applicationId) throw new Error('신청 ID가 필요합니다.');
    // [2026-08-22] 접수 중단 실험실로의 변경 차단 — 시트 쓰기 전에 검증(부분 저장 방지)
    if (data) _adm_assertLabWritable_(data['신청실험실']);
    // ✅ 변경 전 상태 미리 읽기 (메일 dispatcher 용)
    const beforeApp = getApplicationById(applicationId);
    const prevState = {
      '지도승인여부': String((beforeApp && beforeApp['지도승인여부']) || ''),
      '최종승인여부': String((beforeApp && beforeApp['최종승인여부']) || '')
    };

    const ss = SpreadsheetApp.openById(MAIN_SSID);
    const sheets = getTargetSheets_(ss);
    let updated=false;
    for (const sh of sheets) {
      const { header, map } = getHeaderMap_(sh);
      const idCol = map['신청ID']; if (idCol==null) continue;
      const vals = sh.getDataRange().getValues();
      const [hdr, ...rows] = vals;
      const idx = rows.findIndex(r=> String(r[idCol])===String(applicationId));
      if (idx<0) continue;
      const row = idx+2;
      Object.keys(data).forEach(field=>{
        if (field === 'chemicals') return; // chemicals는 별도 처리
        if (!EDITABLE_FIELDS.includes(field)) {
          Logger.log('[updateFullApplication] 수정 차단 필드: ' + field);
          return;
        }
        if (map[field]!=null) {
          let v = data[field];
          if ((field==='실험할날짜'||field==='제출일시') && v) v=new Date(v);
          sh.getRange(row, map[field]+1).setValue(v);
        }
      });
      if (data.chemicals && Array.isArray(data.chemicals)) {
        updateChemicalRecords(applicationId, data.chemicals);
      }
      updated=true; break;
    }
    if (!updated) throw new Error('해당 신청서를 찾을 수 없습니다.');
    SpreadsheetApp.flush();
    logAdminAction_('전체수정', applicationId, Object.keys(data).join(', '));

    // ✅ [메일 누락 패치] 지도승인여부/최종승인여부 변경 시 자동 메일 발송
    if (data['지도승인여부'] != null || data['최종승인여부'] != null) {
      try {
        const newState = {
          '지도승인여부': data['지도승인여부'] != null ? String(data['지도승인여부']) : prevState['지도승인여부'],
          '최종승인여부': data['최종승인여부'] != null ? String(data['최종승인여부']) : prevState['최종승인여부']
        };
        const comment = data['지도승인의견'] || data['최종승인의견'] || '';
        notifyAfterAdminAction_(applicationId, prevState, newState, comment);
      } catch (mailErr) {
        Logger.log('[updateFullApplication] 메일 발송 hook 에러: ' + mailErr.message);
      }
    }

    const updatedApp = getApplicationById(applicationId);
    return { success:true, message:'신청서 수정 완료', applicationId, updated: updatedApp };
  } catch (e) {
    console.error('updateFullApplication 오류:', e);
    return { success:false, message:'수정 오류: '+e.message, error:e.message };
  } finally { lock.releaseLock(); }
}

function batchUpdateApplications(updatesList) {
  assertAdminOrTeacher_('batchUpdateApplications');
  if (!Array.isArray(updatesList) || updatesList.length === 0) {
    return { ok: false, message: '변경할 항목이 없습니다.' };
  }
  if (updatesList.length > 200) {
    return { ok: false, message: '한 번에 200건 이하만 처리할 수 있습니다.' };
  }

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    return { ok: false, message: '다른 작업이 진행 중입니다. 잠시 후 다시 시도하세요.' };
  }

  var successCount = 0, failCount = 0, errors = [];
  // [P0/P1 패치] 메일 dispatch 대상 항목을 모아두었다가 시트 flush 후 일괄 발송한다.
  //   - 매 항목마다 flush + dispatch 하면 200건 처리 시 비효율
  //   - 모든 변경 후 한 번 flush → notifyAfterAdminAction_ 가 getApplicationById 로 최신 행을
  //     읽어 정확한 메일 본문(레코드 전체)을 구성할 수 있다.
  var pendingNotifications = [];
  try {
    // Open spreadsheet once
    var ss = SpreadsheetApp.openById(MAIN_SSID);
    var sheets = getTargetSheets_(ss);

    // [P1] EDITABLE 화이트리스트는 루프 밖에 1회만 정의 (기존 매 항목마다 재선언했음)
    var BATCH_EDITABLE = [
      '실험제목', '사용목적', '사용목적 기타', '실험준비물', '실험과정', '실험뒷정리',
      '실험시 주의사항', '안전장구', '첨단기기실 이용 여부', '첨단기기실 이용 사유',
      '후드 사용 여부', '후드 사용 사유', '동반자명단', '총인원수',
      '지도교사이름', '지도교사이메일', '신청실험실', '실험할날짜', '신청시간',
      '지도승인여부', '지도승인의견', '최종승인여부', '최종승인의견',
      '임장지도 시작시간', '임장지도 종료시간',
      '사용실험실목록', '사용컴퓨터번호', '납땜여부',
      '위험도구', '사용계획', '재료JSON',
      '신청장비', '교육_장비사용법', '교육_정리방법',
      // [P0-2] 1차 승인 검토 항목 — 사고 시 책임 추적용
      '도구장비_적절성', '실험내용_적절성'
    ];

    updatesList.forEach(function(item) {
      try {
        var id = String(item.id || '');
        var changes = item.changes || {};
        if (!id) { failCount++; errors.push(id + ': ID 누락'); return; }
        // [2026-08-22] 접수 중단 실험실로의 변경 차단 — 항목 단위 거부(나머지 항목은 정상 처리).
        //   아래 항목 단위 try-catch 가 failCount/errors 로 집계한다.
        _adm_assertLabWritable_(changes['신청실험실']);

        // Find the row
        var found = false;
        for (var si = 0; si < sheets.length; si++) {
          var sh = sheets[si];
          var vals = sh.getDataRange().getValues();
          if (vals.length < 2) continue;
          var hdr = vals[0];
          var idCol = hdr.indexOf('신청ID');
          if (idCol === -1) continue;

          // [P0/P1] 승인 필드 컬럼 위치 — prevState 추출용 (메일 dispatcher)
          var firstCol = hdr.indexOf('지도승인여부');
          var finalCol = hdr.indexOf('최종승인여부');

          for (var ri = 1; ri < vals.length; ri++) {
            if (String(vals[ri][idCol]) === id) {
              // [P0] 변경 직전 prevState 추출 — 시트 read 추가 호출 없이 현재 행에서 바로 추출.
              //   updateApplicationFields 와 동일 의미 (메일 dispatcher 가 상태 전이 판정에 사용).
              var prevState = {
                '지도승인여부': firstCol >= 0 ? String(vals[ri][firstCol] || '') : '',
                '최종승인여부': finalCol >= 0 ? String(vals[ri][finalCol] || '') : ''
              };

              // [P1-#6] 행 내 모든 변경을 메모리에 모아 1번의 setValues 로 적용.
              //   기존: 변경 컬럼마다 setValue 호출 → 200건 × 평균 3컬럼 = 600회 API 호출 (6분 한도 위험).
              //   개선: 행 1개당 setValues 1회 → 200회 (3배 감소).
              var updatedRow = vals[ri].slice(); // 원본 보존, 메모리 복사본에서 변경
              var hasUpdate = false;
              Object.keys(changes).forEach(function(field) {
                if (BATCH_EDITABLE.indexOf(field) === -1) {
                  Logger.log('[batchUpdateApplications] 차단된 필드: ' + field + ' (id=' + id + ')');
                  return;
                }
                var col = hdr.indexOf(field);
                if (col !== -1) {
                  updatedRow[col] = sanitizeForSheet_(changes[field]);
                  hasUpdate = true;
                }
              });
              if (hasUpdate) {
                sh.getRange(ri + 1, 1, 1, hdr.length).setValues([updatedRow]);
              }

              // [P0] 메일 dispatch 큐 등록 — 승인 필드 변경 시에만.
              //   updateApplicationFields(L1071) 와 동일한 트리거 조건.
              if (changes['지도승인여부'] != null || changes['최종승인여부'] != null) {
                var newState = {
                  '지도승인여부': changes['지도승인여부'] != null ? String(changes['지도승인여부']) : prevState['지도승인여부'],
                  '최종승인여부': changes['최종승인여부'] != null ? String(changes['최종승인여부']) : prevState['최종승인여부']
                };
                var comment = changes['지도승인의견'] || changes['최종승인의견'] || '';
                pendingNotifications.push({ id: id, prev: prevState, next: newState, comment: comment });
              }

              found = true;
              successCount++;
              break;
            }
          }
          if (found) break;
        }
        if (!found) { failCount++; errors.push(id + ': 신청 건을 찾을 수 없음'); }
      } catch (e) {
        failCount++;
        errors.push((item.id || '?') + ': ' + e.message);
      }
    });

    // [P0] 시트 변경 즉시 반영 — 후속 notifyAfterAdminAction_ 의 getApplicationById 가 최신 행을 읽어야 정확한 메일 본문 구성 가능.
    SpreadsheetApp.flush();

    // [P0] 메일 dispatcher 실행 — 큐에 쌓인 알림 항목들을 순회해 발송.
    //   각 항목 실패가 다른 항목·전체 결과에 전파되지 않도록 try-catch 격리.
    var mailFailCount = 0;
    pendingNotifications.forEach(function(n) {
      try {
        notifyAfterAdminAction_(n.id, n.prev, n.next, n.comment);
      } catch (mailErr) {
        mailFailCount++;
        Logger.log('[batchUpdateApplications] 메일 dispatch 실패 (id=' + n.id + '): ' + (mailErr && mailErr.message || mailErr));
      }
    });

    // [v4.0.6/안정성-P1] logAdminAction_ 인자 정리 (target/details 분리)
    var detail = successCount + '건 성공, ' + failCount + '건 실패';
    if (pendingNotifications.length > 0) {
      detail += ' / 메일 ' + (pendingNotifications.length - mailFailCount) + '건 발송';
      if (mailFailCount > 0) detail += ' (' + mailFailCount + '건 실패)';
    }
    logAdminAction_('일괄수정', '-', detail);
    return {
      ok: true,
      successCount: successCount,
      failCount: failCount,
      errors: errors,
      // [P2-#33] 카운트 의미 명시:
      //   mailAttempted: dispatcher 호출을 시도한 큐 항목 수 (notifyAfterAdminAction_ 호출 횟수)
      //   mailFailed: 호출 자체가 throw 한 항목 수 (try-catch 잡힘)
      //   mailDispatched: 호출이 throw 없이 끝난 수 (내부 부분 실패는 notifyAfterAdminAction_ 자체에서 처리/로그)
      //   ⚠️ "발송 성공"과 동의어가 아니다 — notifyAfterAdminAction_ 내부에서 학생/교사 메일 중 일부만 실패해도
      //   여기선 throw 안 나면 dispatched로 카운트됨. 정확한 발송 성공 여부는 '이메일발송로그' 시트 참고.
      mailAttempted: pendingNotifications.length,
      mailDispatched: pendingNotifications.length - mailFailCount,
      mailFailed: mailFailCount
    };
  } finally {
    lock.releaseLock();
  }
}

function updateChemicalRecords(applicationId, chemicals) {
  assertAdminOrTeacher_('updateChemicalRecords');
  try {
    // ✅ 시약 데이터 변경 시 캐시 무효화
    CacheService.getScriptCache().remove('CHEM_MAP_V1');
    const ss = SpreadsheetApp.openById(CHEM_RECORD_SSID);
    const sh = ss.getSheets()[0];

    // [P2] 헤더 키 기반 처리로 통일 — 시트 컬럼 순서 변경/추가에 안전
    //   * 기존: appendRow에 14개 위치 고정 배열 → 헤더가 재정렬되면 잘못된 자리에 씀
    //   * 신규: 신청서 GAS의 submitApplication_ 시약 쓰기 패턴과 동일
    //   * 헤더가 비어 있으면 FALLBACK_CHEM_HEADER 위치를 폴백으로 사용
    const FALLBACK_CHEM_HEADER = [
      '신청ID','제출일시','신청실험실','실험할날짜','신청시간',
      '대표자학번','대표자이름','시약명','상태','농도','용량','MSDS','교사임장여부','폐기 방법'
    ];
    const lastCol = sh.getLastColumn();
    const chemHdr = lastCol > 0
      ? sh.getRange(1, 1, 1, lastCol).getValues()[0].map(v => String(v || '').trim())
      : [];
    const colIdx = (name) => {
      const i = chemHdr.indexOf(name);
      if (i >= 0) return i;
      const fb = FALLBACK_CHEM_HEADER.indexOf(name);
      return fb >= 0 ? fb : -1;
    };

    // 1) 동일 신청ID의 기존 행 삭제 — '신청ID' 헤더 위치 기반 (폴백: 1번 컬럼)
    const idColIdx = colIdx('신청ID');
    const idColForDelete = (idColIdx >= 0) ? idColIdx : 0;
    const v = sh.getDataRange().getValues();
    if (v.length > 1) {
      for (let i = v.length - 1; i >= 1; i--) {
        if (String(v[i][idColForDelete]) === String(applicationId)) sh.deleteRow(i + 1);
      }
    }

    // 2) [P2-#23] 새 시약 추가 — 모든 행을 메모리에 빌드 후 setValues 1회로 일괄 쓰기.
    //   기존: chemicals.forEach 안에서 sh.appendRow 호출 → N개 시약이면 N번 API 호출.
    //   개선: setValues 1회 → 시약 N개면 1번 (대량 등록 시 GAS 시간 한도 여유).
    if (Array.isArray(chemicals) && chemicals.length > 0) {
      const rowLen = Math.max(chemHdr.length, FALLBACK_CHEM_HEADER.length);
      const buildRow = (c) => {
        const fields = {
          '신청ID':       applicationId,
          '제출일시':     new Date(),
          '신청실험실':   sanitizeForSheet_(c['신청실험실'] || ''),
          '실험할날짜':   sanitizeForSheet_(c['실험할날짜'] || ''),
          '신청시간':     sanitizeForSheet_(c['신청시간'] || ''),
          '대표자학번':   c['대표자학번'] || '',
          '대표자이름':   sanitizeForSheet_(c['대표자이름'] || ''),
          '시약명':       sanitizeForSheet_(c['시약명'] || ''),
          '상태':         sanitizeForSheet_(c['상태'] || ''),
          '농도':         sanitizeForSheet_(c['농도'] || ''),
          '용량':         sanitizeForSheet_(c['용량'] || ''),
          'MSDS':         sanitizeForSheet_(c['MSDS'] || ''),
          '교사임장여부': sanitizeForSheet_(c['교사임장여부'] || ''),
          '폐기 방법':    sanitizeForSheet_(c['폐기 방법'] || c['폐수처리'] || c['폐기'] || '')
        };
        const row = new Array(rowLen).fill('');
        Object.keys(fields).forEach(k => {
          const i = colIdx(k);
          if (i >= 0 && i < row.length) row[i] = fields[k];
        });
        return row;
      };
      const newRows = chemicals.map(buildRow);
      const startRow = sh.getLastRow() + 1;
      sh.getRange(startRow, 1, newRows.length, rowLen).setValues(newRows);
    }
  } catch (e) {
    console.error('updateChemicalRecords 오류:', e);
    throw e;
  }
}

function getTeacherListForEdit() {
  assertAdminOrTeacher_('getTeacherListForEdit');
  // [v4.0.5/B] 5분 CacheService — getTeacherIdSet_ 와 동일 패턴. 신규 교사 추가 후 invalidateTeacherCache 로 즉시 반영.
  const cache = CacheService.getScriptCache();
  const cacheKey = 'TEACHER_LIST_FOR_EDIT_V1';
  const cached = cache.get(cacheKey);
  if (cached) {
    try { return JSON.parse(cached); } catch (_) { /* 파싱 실패 시 재로드 */ }
  }
  try {
    const rows = SpreadsheetApp.openById(TEACHER_LIST_SSID).getSheets()[0].getDataRange().getValues();
    if (!rows || rows.length < 2) return [];
    const [hdr, ...data] = rows;
    const headerNames = hdr.map(h => String(h || '').trim());
    // [P1-#10] 헤더 변형 다양화 — 신청서 GAS getTeacherList 와 동일 정책.
    const findIdx = (candidates) => {
      for (const c of candidates) {
        const i = headerNames.indexOf(c);
        if (i !== -1) return i;
      }
      return -1;
    };
    const nameIdx    = findIdx(['교사이름', '성명', '이름', '교사 이름']);
    const emailIdx   = findIdx(['이메일주소', '이메일 주소', '이메일', 'email', 'Email', '메일주소']);
    const subjectIdx = findIdx(['과목', '담당 과목', '담당과목', '교과']);

    if (nameIdx === -1 || emailIdx === -1) {
      const missing = [];
      if (nameIdx === -1) missing.push('교사이름(또는 변형)');
      if (emailIdx === -1) missing.push('이메일주소(또는 변형)');
      Logger.log('[getTeacherListForEdit] 헤더 누락: ' + missing.join(', ') +
                 ' (현재: ' + headerNames.join(' | ') + ')');
      return [];
    }
    const list = data.filter(r=>r[nameIdx]).map(r=>({
      name: r[nameIdx],
      email: r[emailIdx] || '',
      subject: subjectIdx >= 0 ? (r[subjectIdx] || '') : ''
    }));
    try {
      const json = JSON.stringify(list);
      // CacheService 단일값 100KB 한계 — 80KB 안전 마진
      if (json.length < 80000) cache.put(cacheKey, json, 60 * 5);
    } catch (_) { /* 캐시 저장 실패 무시 */ }
    return list;
  } catch (e) {
    console.error('getTeacherListForEdit 오류:', e);
    return [];
  }
}

/* ==================================================
 *  ✅ 중복 예약 방지 기능 (신규)
 * ================================================== */

/**
 * 중복 예약 확인
 * @param {string} lab - 실험실
 * @param {string} date - 실험 날짜 (yyyy-MM-dd)
 * @param {string} time - 신청 시간
 * @param {string} excludeAppId - 제외할 신청ID (자기 자신)
 * @returns {Object} { isDuplicate, existingApp }
 */
function checkDuplicateReservation(lab, date, time, excludeAppId) {
  assertAdminOrTeacher_('checkDuplicateReservation');
  // [SR9] 시간 슬롯을 Set으로 파싱해 부분 겹침도 감지.
  //   기존: "ET" vs "ET,EP1" → 서로 다른 문자열이라 통과됨 (잠재적 버그)
  //   개선: 교집합이 비어있지 않으면 중복으로 처리
  function parseSlots_(s) {
    return String(s || '').split(/[,\s]+/).map(t => t.trim()).filter(Boolean);
  }
  const requestedSlotSet = new Set(parseSlots_(time));

  const ss = SpreadsheetApp.openById(MAIN_SSID);
  const sheets = getTargetSheets_(ss); // [v4.18/S1] 이름+헤더 이중 필터 통일

  for (const sh of sheets) {
    const data = sh.getDataRange().getValues();
    if (data.length <= 1) continue;

    const { header, map } = getHeaderMap_(sh);
    const labIdx = map['신청실험실'];
    const dateIdx = map['실험할날짜'];
    const timeIdx = map['신청시간'];
    const idIdx = map['신청ID'];
    const firstApprovalIdx = map['지도승인여부'];
    const finalApprovalIdx = map['최종승인여부'];
    const studentIdx = map['대표자이름'];

    if (labIdx === undefined || dateIdx === undefined || timeIdx === undefined || idIdx === undefined) continue;

    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const rowId = String(row[idIdx] || '');

      // 자기 자신 제외
      if (rowId === excludeAppId) continue;

      // 실험실 비교
      if (String(row[labIdx] || '') !== lab) continue;

      // 날짜 비교
      const rowDate = formatDateForCompare_(row[dateIdx]);
      if (rowDate !== date) continue;

      // [SR9] 시간 슬롯 교집합 검사 (부분 겹침 포함)
      const rowSlots = parseSlots_(row[timeIdx]);
      const overlap = rowSlots.some(s => requestedSlotSet.has(s));
      if (!overlap) continue;

      // 승인 상태 확인 (1차승인 또는 최종승인된 것만)
      const firstApproval = String(row[firstApprovalIdx] || '');
      const finalApproval = String(row[finalApprovalIdx] || '');

      if (firstApproval === '승인' || finalApproval === '승인') {
        const overlappingSlots = rowSlots.filter(s => requestedSlotSet.has(s));
        return {
          isDuplicate: true,
          existingApp: {
            신청ID: rowId,
            대표자이름: row[studentIdx] || '',
            상태: finalApproval === '승인' ? '최종승인' : '1차승인',
            겹침시간: overlappingSlots.join(', ')
          }
        };
      }
    }
  }

  return { isDuplicate: false, existingApp: null };
}

/**
 * 중복 확인 후 승인 처리
 * @param {string} appId - 신청 ID
 * @param {string} approvalType - 승인 유형 ('1차승인' 또는 '최종승인')
 * @returns {Object} { success, isDuplicate, message, existingApp }
 */
function approveWithDuplicateCheck(appId, approvalType) {
  assertAdminOrTeacher_('approveWithDuplicateCheck');
  // [v4.0.6/안정성-P1] 두 관리자가 동시에 같은 슬롯의 다른 신청을 승인할 때 검사·승인 사이 race condition 방지
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return { success: false, message: '서버가 바쁩니다. 잠시 후 다시 시도해주세요.' };
  try {
    const app = getApplicationById(appId);
    if (!app) throw new Error('신청을 찾을 수 없습니다.');

    // [v4.18/S6] 신규 양식(IT/가정/공학)은 단일 승인 흐름 — '1차승인' 요청이 오면 최종승인으로
    //   승격 처리. 기존엔 존재하지 않는 1차 단계가 기록되고 학생 메일도 안 나갔음.
    if (approvalType === '1차승인' && isNewLab_(app)) {
      Logger.log('[approveWithDuplicateCheck] 단일 승인 양식 — 1차승인 요청을 최종승인으로 승격: ' + appId);
      approvalType = '최종승인';
    }

    const lab = app['신청실험실'] || '';
    const date = formatDateForCompare_(app['실험할날짜']);
    const time = app['신청시간'] || '';

    // 중복 확인
    const check = checkDuplicateReservation(lab, date, time, appId);

    if (check.isDuplicate) {
      return {
        success: false,
        isDuplicate: true,
        message: `이미 승인된 예약이 있습니다: ${check.existingApp.대표자이름} (${check.existingApp.상태})`,
        existingApp: check.existingApp
      };
    }

    // 중복 없으면 승인 진행
    const prevState = {
      '지도승인여부': String(app['지도승인여부'] || ''),
      '최종승인여부': String(app['최종승인여부'] || '')
    };

    const updates = {};
    if (approvalType === '1차승인') {
      updates['지도승인여부'] = '승인';
    } else if (approvalType === '최종승인') {
      updates['최종승인여부'] = '승인';
    }

    // [v4.18/S1] 코어 직접 호출 — updateApplicationStatus(잠금 재획득→조기 해제) 대신.
    //   flush 로 승인 기록을 커밋한 뒤에야 잠금이 풀리므로 중복 검사 race 가 실제로 막힘.
    updateApplicationStatusCore_(appId, updates);
    SpreadsheetApp.flush();
    logAdminAction_('승인', appId, approvalType);

    // ✅ [메일 누락 패치] 승인 후 학생/담당교사/지도교사에게 자동 메일 발송
    try {
      const newState = Object.assign({}, prevState, updates);
      notifyAfterAdminAction_(appId, prevState, newState, '');
    } catch (mailErr) {
      Logger.log('[approveWithDuplicateCheck] 메일 발송 hook 에러: ' + mailErr.message);
    }

    return {
      success: true,
      isDuplicate: false,
      message: `${approvalType} 완료`
    };
  } catch (e) {
    return {
      success: false,
      isDuplicate: false,
      message: '승인 처리 오류: ' + e.message
    };
  } finally { lock.releaseLock(); }
}

/**
 * 강제 승인 (중복 경고 무시)
 */
function forceApprove(appId, approvalType) {
  assertAdminOrTeacher_('forceApprove');
  // [v4.18/S1] 강제 승인도 잠금 보호 — 동시 강제 승인/일반 승인 충돌 방지
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return { success: false, message: '서버가 바쁩니다. 잠시 후 다시 시도해주세요.' };
  try {
    // 변경 전 상태 미리 읽기 (메일 dispatcher 용)
    let prevState = { '지도승인여부': '', '최종승인여부': '' };
    try {
      const app = getApplicationById(appId);
      if (app) prevState = {
        '지도승인여부': String(app['지도승인여부'] || ''),
        '최종승인여부': String(app['최종승인여부'] || '')
      };
    } catch (_) {}

    // [v4.18/S6] 신규 양식 단일 승인 흐름 — 1차승인 요청은 최종승인으로 승격
    try {
      const fa = getApplicationById(appId);
      if (approvalType === '1차승인' && fa && isNewLab_(fa)) approvalType = '최종승인';
    } catch (_) {}

    const updates = {};
    if (approvalType === '1차승인') {
      updates['지도승인여부'] = '승인';
    } else if (approvalType === '최종승인') {
      updates['최종승인여부'] = '승인';
    }

    updateApplicationStatusCore_(appId, updates);
    SpreadsheetApp.flush();
    logAdminAction_('강제승인', appId, approvalType + ' (중복 경고 무시)');

    // ✅ [메일 누락 패치]
    try {
      const newState = Object.assign({}, prevState, updates);
      notifyAfterAdminAction_(appId, prevState, newState, '');
    } catch (mailErr) {
      Logger.log('[forceApprove] 메일 발송 hook 에러: ' + mailErr.message);
    }

    return { success: true, message: `${approvalType} 완료 (강제)` };
  } catch (e) {
    return { success: false, message: '승인 처리 오류: ' + e.message };
  } finally { lock.releaseLock(); }
}

/* ==================================================
 *  실험실 지도 일지
 * ================================================== */
const LAB_LOG_HEADERS = ['실험날짜','학번','이름','실험실','지도교사','시간','경고여부','지도내용','작성일시'];

function ensureLabLogSheet_(){
  const ss = SpreadsheetApp.openById(MAIN_SSID);
  let sh = ss.getSheetByName(LAB_LOG_SHEET_NAME);
  if (!sh){
    sh = ss.insertSheet(LAB_LOG_SHEET_NAME);
    sh.getRange(1,1,1,LAB_LOG_HEADERS.length).setValues([LAB_LOG_HEADERS]);
  }
  return sh;
}
function ensureWarnAccumSheet_() {
  const ss = SpreadsheetApp.openById(MAIN_SSID);
  let sh = ss.getSheetByName(WARN_ACCUM_SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(WARN_ACCUM_SHEET_NAME);
    sh.getRange(1,1,1,8).setValues([['실험날짜','학번','이름','실험실','지도교사','시간','경고여부','지도내용']]);
  }
  return sh;
}
function ensureRestrictAccumSheet_() {
  const ss = SpreadsheetApp.openById(MAIN_SSID);
  let sh = ss.getSheetByName(RESTRICT_ACCUM_SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(RESTRICT_ACCUM_SHEET_NAME);
    sh.getRange(1,1,1,RESTRICT_ACCUM_HEADERS.length).setValues([RESTRICT_ACCUM_HEADERS]);
  }
  return sh;
}

function addLabGuidanceLog(entry){
  assertAdminOrTeacher_('addLabGuidanceLog');
  // [v4.0.6/안정성-P1] appendRow + 누적 + recalcRestrictedList 까지의 read-modify-write 보호
  const lock = LockService.getScriptLock();
  // [v4.18/S1] 반환 형태 통일 — 클라이언트는 r.success/r.message 를 읽으므로 ok/error 는 무시됐음
  if (!lock.tryLock(15000)) return { success: false, message: '서버가 바쁩니다. 잠시 후 다시 시도해주세요.' };
  try {
    const sh = ensureLabLogSheet_();
    const row = [
      entry.date ? new Date(entry.date) : '',
      entry.studentId || '',
      entry.name || '',
      entry.lab || '',
      entry.teacher || '',
      entry.time || '',
      entry.level || '',
      entry.content || '',
      new Date()
    ];
    sh.appendRow(row);

    if (String(entry.level) === '경고') {
      const warn = ensureWarnAccumSheet_();
      warn.appendRow([
        entry.date ? new Date(entry.date) : '',
        entry.studentId || '',
        entry.name || '',
        entry.lab || '',
        entry.teacher || '',
        entry.time || '',
        entry.level || '',
        entry.content || ''
      ]);
    }
    try {
      // [v4.18/S1] 코어 직접 호출 — 이 함수가 이미 ScriptLock 보유 (중첩 잠금 조기 해제 방지)
      purgeExpiredRestrictionsCore_();
      recalcRestrictedListCore_();
    } catch (_) {}
    SpreadsheetApp.flush();
    return { success:true, message:'기록 저장 완료' };
  } catch (e) {
    return { success:false, message:'기록 저장 실패: '+e.message };
  } finally { lock.releaseLock(); }
}

function listLabGuidanceLogs(){
  assertAdminOrTeacher_('listLabGuidanceLogs');
  try {
    const sh = ensureLabLogSheet_();
    const vals = sh.getDataRange().getValues();
    if (vals.length<2) return [];
    const [hdr, ...rows] = vals;
    return rows.map(r=>({
      '실험날짜': (parseToDateSafe_(r[0]) ? Utilities.formatDate(parseToDateSafe_(r[0]), Session.getScriptTimeZone(),'yyyy-MM-dd') : String(r[0]||'')),
      '학번': String(r[1]||''),
      '이름': String(r[2]||''),
      '실험실': String(r[3]||''),
      '지도교사': String(r[4]||''),
      '시간': String(r[5]||''),
      '경고여부': String(r[6]||''),
      '지도내용': String(r[7]||''),
      '작성일시': (parseToDateSafe_(r[8]) ? toLocalISOString_(parseToDateSafe_(r[8])) : String(r[8]||''))
    }));
  } catch (e) {
    return [];
  }
}

function warningStatsByStudent(){
  assertAdminOrTeacher_('warningStatsByStudent');
  try {
    const data = listLabGuidanceLogs();
    const m = new Map();
    data.forEach(row=>{
      const key = (row['학번']||'')+'|'+(row['이름']||'');
      if (!m.has(key)) m.set(key, { 학번:row['학번']||'', 이름:row['이름']||'', 지도:0, 경고:0, 안전사고:0, '기타 특이사항':0, total:0 });
      const obj=m.get(key);
      const lvl=row['경고여부']||'';
      if (lvl==='지도') obj['지도']++;
      else if (lvl==='경고') obj['경고']++;
      else if (lvl==='안전사고') obj['안전사고']++;
      else obj['기타 특이사항']++;
      obj.total++;
    });
    return Array.from(m.values()).sort((a,b)=> (b.total-a.total) || a.학번.localeCompare(b.학번,'ko'));
  } catch (e) {
    return [];
  }
}

/**
 * ✅ 학생 제한 이력 조회 (신규)
 */
function getStudentRestrictionHistory(studentId) {
  assertAdminOrTeacher_('getStudentRestrictionHistory');
  try {
    const logs = listLabGuidanceLogs().filter(log =>
      String(log['학번']) === String(studentId) && log['경고여부'] === '경고'
    );

    const accumSh = ensureRestrictAccumSheet_();
    const accumVals = accumSh.getDataRange().getValues();
    // [G-P1] 헤더 키 기반 — incrementRestrictAccum_ 와 동일 패턴 적용
    const accumHdr = (accumVals.length >= 1) ? accumVals[0].map(h => String(h || '').trim()) : [];
    const sidIdx   = accumHdr.indexOf('학번')      >= 0 ? accumHdr.indexOf('학번')      : 0;
    const countIdx = accumHdr.indexOf('누적 횟수') >= 0 ? accumHdr.indexOf('누적 횟수') : 2;
    let accumCount = 0;
    for (let i = 1; i < accumVals.length; i++) {
      if (String(accumVals[i][sidIdx]) === String(studentId)) {
        accumCount = Number(accumVals[i][countIdx]) || 0;
        break;
      }
    }

    return {
      warnings: logs,
      totalRestrictions: accumCount
    };
  } catch (e) {
    return { warnings: [], totalRestrictions: 0 };
  }
}

/* ==================================================
 *  신청 제한 정책/명단
 * ================================================== */
function ensurePolicySheet_(){
  const ss = SpreadsheetApp.openById(MAIN_SSID);
  let sh = ss.getSheetByName(POLICY_SHEET_NAME);
  if (!sh){
    sh = ss.insertSheet(POLICY_SHEET_NAME);
    sh.getRange(1,1,1,POLICY_HEADERS.length).setValues([POLICY_HEADERS]);
    sh.appendRow(['FALSE', 2, 30]);
  }
  return sh;
}
function ensureRestrictSheet_(){
  const ss = SpreadsheetApp.openById(MAIN_SSID);
  let sh = ss.getSheetByName(RESTRICT_SHEET_NAME);
  if (!sh){
    sh = ss.insertSheet(RESTRICT_SHEET_NAME);
    sh.getRange(1,1,1,RESTRICT_HEADERS.length).setValues([RESTRICT_HEADERS]);
  }
  return sh;
}
function getRestrictionPolicy(){
  assertAdminOrTeacher_('getRestrictionPolicy');
  return getRestrictionPolicyCore_();
}
/** [v4.18/S1] 정책 조회 코어 — 트리거·내부 호출용(무가드) */
function getRestrictionPolicyCore_(){
  const sh = ensurePolicySheet_();
  const vals = sh.getDataRange().getValues();
  const row = (vals.length>=2) ? vals[1] : ['FALSE',2,30];
  return {
    enabled: String(row[0]).toUpperCase()==='TRUE',
    count: parseInt(row[1]||2,10),
    days: parseInt(row[2]||30,10)
  };
}
function saveRestrictionPolicy(payload){
  assertAdminOrTeacher_('saveRestrictionPolicy');
  // [v4.0.6/안정성-P1] 정책 저장 + 후속 purge/recalc 동시 실행 시 충돌 방지 (setRestrictionEnabled 도 자동 보호)
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return { success: false, error: '서버가 바쁩니다. 잠시 후 다시 시도해주세요.' };
  try {
  const sh = ensurePolicySheet_();
  const enabled = !!payload.enabled;
  const count = Math.max(1, parseInt(payload.count||2,10));
  const days  = Math.max(1, parseInt(payload.days ||30,10));
  if (sh.getLastRow()<2) sh.appendRow([enabled? 'TRUE':'FALSE', count, days]);
  else sh.getRange(2,1,1,3).setValues([[enabled?'TRUE':'FALSE', count, days]]);
  // [v4.18/S1] 코어 직접 호출 — 이 함수가 이미 ScriptLock 보유 (중첩 잠금 조기 해제 방지)
  purgeExpiredRestrictionsCore_();
  recalcRestrictedListCore_();
  SpreadsheetApp.flush();
  // [G-P0] 신청서 GAS 의 restricted-list:v1 캐시 즉시 무효화 — 정책 변경/재산출 결과를
  //   학생 신청 시도가 5분 윈도우 동안 옛 명단으로 통과되는 위험 제거.
  try { clearApplicationServerCache_(['restricted-list:v1']); } catch (_) {}
  return { success:true };
  } finally { lock.releaseLock(); }
}
function setRestrictionEnabled(on){
  assertAdminOrTeacher_('setRestrictionEnabled');
  const p = getRestrictionPolicy();
  return saveRestrictionPolicy({ enabled: !!on, count:p.count, days:p.days });
}
function getRestrictedList(){
  assertAdminOrTeacher_('getRestrictedList');
  const sh = ensureRestrictSheet_();
  const v = sh.getDataRange().getValues();
  if (v.length<2) return [];
  const [hdr, ...rows] = v;
  return rows.map(r=>({
    '학번': String(r[0]||''),
    '이름': String(r[1]||''),
    '제한사유': String(r[2]||''),
    '시작일': (parseToDateSafe_(r[3]) ? Utilities.formatDate(parseToDateSafe_(r[3]), Session.getScriptTimeZone(),'yyyy-MM-dd') : String(r[3]||'')),
    '종료일': (parseToDateSafe_(r[4]) ? Utilities.formatDate(parseToDateSafe_(r[4]), Session.getScriptTimeZone(),'yyyy-MM-dd') : String(r[4]||'')),
    '현재상태': String(r[5]||''),
    '최근경고수': Number(r[6]||0),
    '산출일': (parseToDateSafe_(r[7]) ? toLocalISOString_(parseToDateSafe_(r[7])) : String(r[7]||''))
  }));
}

/** 현재 시점 제한 여부(대표자/동반자 점검) */
function isStudentRestricted(studentId, name, asOfDate){
  assertAdminOrTeacher_('isStudentRestricted'); // [v4.18/S1] 학생 제한(징계) 정보 열거 차단
  const p = getRestrictionPolicy();
  if (!p.enabled) return { restricted:false };
  const base = toLocalMidnight_(parseToDateSafe_(asOfDate) || new Date());
  const sh = ensureRestrictSheet_();
  const v = sh.getDataRange().getValues();
  if (v.length<2) return { restricted:false };
  // [G-P1] 헤더 키 기반 — RESTRICT_HEADERS 정의에 맞춰 컬럼 위치 동적 조회
  //   기존: r[0]/r[1]/r[2]/r[3]/r[4] 위치 고정 가정 (학번/이름/제한사유/시작일/종료일)
  const hdr = v[0].map(h => String(h || '').trim());
  const sidIdx    = hdr.indexOf('학번')    >= 0 ? hdr.indexOf('학번')    : 0;
  const nameIdx   = hdr.indexOf('이름')    >= 0 ? hdr.indexOf('이름')    : 1;
  const reasonIdx = hdr.indexOf('제한사유') >= 0 ? hdr.indexOf('제한사유') : 2;
  const startIdx  = hdr.indexOf('시작일')   >= 0 ? hdr.indexOf('시작일')   : 3;
  const endIdx    = hdr.indexOf('종료일')   >= 0 ? hdr.indexOf('종료일')   : 4;

  for (let i=1;i<v.length;i++){
    const r = v[i];
    if (String(r[sidIdx])===String(studentId) && String(r[nameIdx])===String(name)) {
      const start = toLocalMidnight_(parseToDateSafe_(r[startIdx]));
      const end   = toLocalMidnight_(parseToDateSafe_(r[endIdx]));
      if (start && end && base >= start && base <= end) {
        return { restricted:true, reason:String(r[reasonIdx]||''), until: Utilities.formatDate(end, Session.getScriptTimeZone(),'yyyy-MM-dd') };
      }
    }
  }
  return { restricted:false };
}

/* ==================================================
 *  제한 만료 정리(+ 누적 시트 반영) - ✅ 수정됨
 * ================================================== */

function incrementRestrictAccum_(studentId, name, inc=1){
  // [v4.18/S1] 내부 잠금 제거 — GAS LockService 는 중첩 카운팅이 없어, 이 함수의 releaseLock 이
  //   부모(purge/expire/정책 저장)가 잡은 임계구역까지 조기 해제하는 문제가 있었음.
  //   이제 모든 호출 경로가 ScriptLock 을 보유한 상태에서만 이 함수를 부른다.
  try {
    const sh = ensureRestrictAccumSheet_();
    const v = sh.getDataRange().getValues();
    // [G-P1] 헤더 키 기반 — RESTRICT_ACCUM_HEADERS 정의에 맞춰 컬럼 위치 동적 조회
    //   기존: v[i][0] / v[i][1] / countIdx=2 위치 고정 가정
    //   개선: 헤더 이름('학번','이름','누적 횟수') 으로 위치 조회. 헤더 누락 시 기본 위치 폴백.
    const headerRow = (v.length >= 1) ? v[0].map(h => String(h || '').trim()) : [];
    const sidIdx   = headerRow.indexOf('학번')      >= 0 ? headerRow.indexOf('학번')      : 0;
    const nameIdx  = headerRow.indexOf('이름')      >= 0 ? headerRow.indexOf('이름')      : 1;
    const countIdx = headerRow.indexOf('누적 횟수') >= 0 ? headerRow.indexOf('누적 횟수') : 2;

    if (v.length<2){
      // 빈 시트 → 헤더 위치에 맞춰 행 구성. 폴백 시 RESTRICT_ACCUM_HEADERS 와 동일 순서 유지.
      const blankRow = new Array(Math.max(headerRow.length, 3)).fill('');
      blankRow[sidIdx]   = studentId;
      blankRow[nameIdx]  = name;
      blankRow[countIdx] = Math.max(1, inc|0);
      sh.appendRow(blankRow);
      return;
    }
    let rowIndex = -1;
    for (let i=1;i<v.length;i++){
      if (String(v[i][sidIdx])===String(studentId) && String(v[i][nameIdx])===String(name)) {
        rowIndex = i+1; break;
      }
    }
    if (rowIndex>0){
      const cur = Number(sh.getRange(rowIndex, countIdx+1).getValue() || 0);
      sh.getRange(rowIndex, countIdx+1).setValue((cur|0) + Math.max(1, inc|0));
    } else {
      const newRow = new Array(Math.max(headerRow.length, 3)).fill('');
      newRow[sidIdx]   = studentId;
      newRow[nameIdx]  = name;
      newRow[countIdx] = Math.max(1, inc|0);
      sh.appendRow(newRow);
    }
  } catch (e) {
    try { Logger.log('[incrementRestrictAccum_] 실패: ' + (e && e.message ? e.message : e)); } catch (_) {}
  }
}

/* ── [v4.18/S1] 해제 마커 — 제한이 끝난(또는 수동 해제된) 학생의 해제일 기록 ──
   recalc 가 해제일 이전의 경고를 다시 세어 같은 경고로 재제한하는 문제(일괄 만료 자기 무효화·
   자연 만료 직후 재제한)를 막는다. 해제일 이후 새 경고만 재제한 판단에 사용. */
const RESTRICT_RELEASE_PROP_KEY = 'RESTRICT_RELEASE_MARKERS_V1';

function getReleaseMarkers_() {
  try {
    const raw = PropertiesService.getScriptProperties().getProperty(RESTRICT_RELEASE_PROP_KEY);
    return raw ? (JSON.parse(raw) || {}) : {};
  } catch (_) { return {}; }
}

function setReleaseMarkers_(markers) {
  try {
    // 400일 지난 마커는 정리 (Properties 9KB 한도 보호)
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 400);
    const cutoffStr = Utilities.formatDate(cutoff, Session.getScriptTimeZone(), 'yyyy-MM-dd');
    Object.keys(markers).forEach(k => { if (String(markers[k]) < cutoffStr) delete markers[k]; });
    PropertiesService.getScriptProperties().setProperty(RESTRICT_RELEASE_PROP_KEY, JSON.stringify(markers));
  } catch (e) {
    try { Logger.log('[setReleaseMarkers_] 실패: ' + (e && e.message ? e.message : e)); } catch (_) {}
  }
}

/**
 * 제한명단에서 "종료일 < 오늘(자정)" 인 항목 삭제
 * ✅ 수정: < → <= (종료일 다음날에 해제)
 */
function purgeExpiredRestrictions() {
  assertAdminOrTeacher_('purgeExpiredRestrictions');
  // [v4.18/S1] 무잠금 동시 실행 시 누적 이중 카운트·행 밀림 오삭제 방지
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return { removed: 0, busy: true };
  try {
    const removed = purgeExpiredRestrictionsCore_();
    SpreadsheetApp.flush();
    return { removed: removed };
  } finally { lock.releaseLock(); }
}

/**
 * [v4.18/S1] 만료 정리 코어 — 잠금·가드 없음. ScriptLock 보유 호출자 전용.
 * @param {string=} markerDateOpt 해제 마커로 기록할 날짜(yyyy-MM-dd). 생략 시 각 행의 종료일.
 */
function purgeExpiredRestrictionsCore_(markerDateOpt) {
  const sh = ensureRestrictSheet_();
  const last = sh.getLastRow();
  if (last < 2) return 0;

  const todayMid = todayLocalMidnight_();
  const range = sh.getRange(2,1,last-1, RESTRICT_HEADERS.length);
  const vals = range.getValues();

  const toDelete = [];
  const markers = getReleaseMarkers_();
  vals.forEach((r, i) => {
    const endDate = toLocalMidnight_(parseToDateSafe_(r[4]));
    if (!endDate) return;
    if (endDate < todayMid) {
      const sid = String(r[0]||''), nm = String(r[1]||'');
      incrementRestrictAccum_(sid, nm, 1);
      // 해제 마커 기록 — 이 날짜까지의 경고는 '소진'된 것으로 간주해 재제한에 쓰지 않음
      const markerDate = markerDateOpt ||
        Utilities.formatDate(endDate, Session.getScriptTimeZone(), 'yyyy-MM-dd');
      markers[sid + '|' + nm] = markerDate;
      toDelete.push(i+2);
    }
  });

  for (let i = toDelete.length-1; i>=0; i--) sh.deleteRow(toDelete[i]);
  if (toDelete.length > 0) setReleaseMarkers_(markers);
  return toDelete.length;
}

/* ==================================================
 *  제한 재산출(경고기록누적 기반)
 * ================================================== */
function getWarnCountsWithinDays_(days){
  const warnSh = ensureWarnAccumSheet_();
  const v = warnSh.getDataRange().getValues();
  if (v.length<2) return new Map();
  const cutoff = toLocalMidnight_(new Date(new Date().getTime() - days*24*60*60*1000));
  const counts = new Map();
  // [v4.18/S1] 해제 마커 — 해제일 이전 경고는 이미 제한으로 소진된 것으로 보고 제외.
  //   (일괄 만료 직후 recalc 가 같은 경고로 즉시 재제한하는 자기 무효화 방지)
  const markers = getReleaseMarkers_();
  const tz = Session.getScriptTimeZone();
  for (let i=1;i<v.length;i++){
    const r = v[i];
    const when = toLocalMidnight_(parseToDateSafe_(r[0]));
    const level = String(r[6]||'');
    if (!when) continue;
    if (level !== '경고') continue;
    if (when < cutoff) continue;
    const key = String(r[1]||'') + '|' + String(r[2]||'');
    const released = markers[key];
    if (released && Utilities.formatDate(when, tz, 'yyyy-MM-dd') <= String(released)) continue;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return counts;
}

/**
 * 경고기록누적 시트를 기준으로 제한명단 재산출
 */
function recalcRestrictedList(){
  assertAdminOrTeacher_('recalcRestrictedList');
  // [v4.18/S1] read-modify-write 잠금 보호
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return { success: false, message: '서버가 바쁩니다. 잠시 후 다시 시도해주세요.' };
  try {
    const result = recalcRestrictedListCore_();
    SpreadsheetApp.flush();
    return result;
  } finally { lock.releaseLock(); }
}

/** [v4.18/S1] 재산출 코어 — 잠금·가드 없음. ScriptLock 보유 호출자 전용. */
function recalcRestrictedListCore_(){
  const policy = getRestrictionPolicyCore_();
  const restrictSheet = ensureRestrictSheet_();
  const lastRow = restrictSheet.getLastRow();

  // ── 정책 비활성화: 기존 행을 누적명단에 기록 후 삭제 ──
  if (!policy.enabled) {
    if (lastRow > 1) {
      const existing = restrictSheet.getRange(2, 1, lastRow - 1, RESTRICT_HEADERS.length).getValues();
      existing.forEach(r => {
        const sid = String(r[0] || '').trim();
        const nm  = String(r[1] || '').trim();
        if (sid && nm) incrementRestrictAccum_(sid, nm, 1);
      });
      restrictSheet.deleteRows(2, lastRow - 1);
    }
    return { success: true, added: 0, cleared: true };
  }

  // ── 기존 제한 학생 학번 Set 구성 (중복 등록 방지) ──
  const existingIds = new Set();
  if (lastRow > 1) {
    const existing = restrictSheet.getRange(2, 1, lastRow - 1, 1).getValues();
    existing.forEach(r => {
      const id = String(r[0] || '').trim();
      if (id) existingIds.add(id);
    });
  }

  // ── 경고 카운트 산출 → 신규 제한 대상만 추가 ──
  const counts = getWarnCountsWithinDays_(policy.days);
  const todayMid = todayLocalMidnight_();
  const msDay  = 24*60*60*1000;
  const newRows = [];

  counts.forEach((cnt, key) => {
    if (cnt >= policy.count) {
      const [sid, name] = key.split('|');
      if (existingIds.has(sid)) return;          // 이미 제한 중 → 기존 날짜 보존
      const start = new Date(todayMid.getTime());
      const end   = new Date(todayMid.getTime() + policy.days * msDay - 1);
      newRows.push([
        sid,
        name,
        `최근 ${policy.days}일 경고 ${cnt}회`,
        start,
        end,
        '제한중',
        cnt,
        new Date()
      ]);
    }
  });

  if (newRows.length > 0) {
    restrictSheet
      .getRange(restrictSheet.getLastRow() + 1, 1, newRows.length, RESTRICT_HEADERS.length)
      .setValues(newRows);
  }
  return { success: true, added: newRows.length, preserved: existingIds.size };
}

/** 간략 조회 */
function getRestrictedListLite() {
  assertAdminOrTeacher_('getRestrictedListLite');
  const sh = ensureRestrictSheet_();
  const v = sh.getDataRange().getValues();
  if (v.length < 2) return [];
  const out = [];
  for (let i = 1; i < v.length; i++) {
    const r = v[i];
    const s = toLocalMidnight_(parseToDateSafe_(r[3]));
    const e = toLocalMidnight_(parseToDateSafe_(r[4]));
    out.push({
      학번: String(r[0] || ''),
      이름: String(r[1] || ''),
      시작일: s ? Utilities.formatDate(s, Session.getScriptTimeZone(), 'yyyy-MM-dd') : String(r[3] || ''),
      종료일: e ? Utilities.formatDate(e, Session.getScriptTimeZone(), 'yyyy-MM-dd') : String(r[4] || '')
    });
  }
  return out;
}
function getRestrictedAccumList() {
  assertAdminOrTeacher_('getRestrictedAccumList');
  const sh = ensureRestrictAccumSheet_();
  const v = sh.getDataRange().getValues();
  if (v.length < 2) return [];
  const out = [];
  for (let i = 1; i < v.length; i++) {
    const r = v[i];
    out.push({
      학번: String(r[0] || ''),
      이름: String(r[1] || ''),
      누적횟수: Number(r[2] || 0)
    });
  }
  return out;
}

/* ==================================================
 *  자동 정리 트리거
 * ================================================== */

/**
 * 매일 새벽 자동으로 제한 재산출 → 만료 정리 실행
 */
function setupDailyRestrictionMaintenance(hourLocal) {
  assertAdminOrTeacher_('setupDailyRestrictionMaintenance');
  const hour = Math.min(23, Math.max(0, Number(hourLocal ?? 3)));
  const fn = 'dailyRestrictionMaintenance_';
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === fn)
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger(fn)
    .timeBased()
    .atHour(hour)
    .everyDays(1)
    .create();
  return { success:true, message:`매일 ${hour}:00 자동 정리 트리거 설정 완료` };
}

/** 트리거가 호출하는 실제 작업 함수 */
function dailyRestrictionMaintenance_() {
  // [v4.18/S1] 트리거 컨텍스트 — 가드 없는 코어를 자체 잠금으로 실행
  //   (기존: 가드 있는 공개 함수 호출 → 소유자 계정이 교사 시트에 없으면 매일 조용히 실패할 수 있었음)
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) { console.error('dailyRestrictionMaintenance_: 잠금 획득 실패'); return; }
  try {
    try { purgeExpiredRestrictionsCore_(); } catch (e) { console.error('purge 실패:', e); }
    try { recalcRestrictedListCore_(); } catch (e) { console.error('recalc 실패:', e); }
    SpreadsheetApp.flush();
  } finally { lock.releaseLock(); }
}

/* ==================================================
 *  [v4.18/S3] 오늘의 실험실 — 출석체크
 *  당일 승인된 예약의 대표자+동반자 명단 기반 출석/지각/무단결석/무단참석 기록.
 *  기록은 MAIN_SSID 의 '출석기록' 탭에 저장 (EXCLUDED_SHEETS 등록 완료).
 * ================================================== */
const ATTENDANCE_SHEET_NAME = '출석기록';
const ATTENDANCE_HEADERS = ['날짜','신청ID','실험실','시간','학번','이름','상태','체크교사','체크일시'];
const ATTENDANCE_STATUSES = ['출석','지각','무단결석','무단참석'];

function ensureAttendanceSheet_() {
  const ss = SpreadsheetApp.openById(MAIN_SSID);
  let sh = ss.getSheetByName(ATTENDANCE_SHEET_NAME);
  if (sh) return sh;
  sh = ss.insertSheet(ATTENDANCE_SHEET_NAME);
  sh.getRange(1, 1, 1, ATTENDANCE_HEADERS.length).setValues([ATTENDANCE_HEADERS]);
  sh.getRange(1, 1, 1, ATTENDANCE_HEADERS.length).setFontWeight('bold').setBackground('#dbeafe');
  sh.setFrozenRows(1);
  return sh;
}

/** 동반자명단 문자열 → [{sid, name}] 파싱. "20415 김철수, 이영희" 등 자유 입력 대응 */
function buildRoster_(app) {
  const roster = [];
  const seen = {};
  const push = (sid, name, extra) => {
    sid = String(sid || '').trim(); name = String(name || '').trim();
    if (!sid && !name) return;
    const k = sid + '|' + name;
    if (seen[k]) return;
    seen[k] = 1;
    roster.push({ sid: sid, name: name, status: '', extra: !!extra });
  };
  push(app['대표자학번'], app['대표자이름']);
  String(app['동반자명단'] || '').split(/[,;\n·/]+/).forEach(tok => {
    const t = tok.trim();
    if (!t) return;
    const m = t.match(/^(\d{4,6})\s*(.*)$/);
    if (m) push(m[1], m[2]);
    else push('', t.replace(/\(\s*\d+\s*\)/g, '').trim());
  });
  return roster;
}

/** 특정 날짜의 출석 기록 맵 { 신청ID: { '학번|이름': 상태 } } */
function getAttendanceMapForDate_(dateStr) {
  const sh = ensureAttendanceSheet_();
  const v = sh.getDataRange().getValues();
  const map = {};
  const tz = Session.getScriptTimeZone();
  for (let i = 1; i < v.length; i++) {
    const d = parseToDateSafe_(v[i][0]);
    const ds = d ? Utilities.formatDate(d, tz, 'yyyy-MM-dd') : String(v[i][0] || '');
    if (ds !== dateStr) continue;
    const appId = String(v[i][1] || '');
    if (!map[appId]) map[appId] = {};
    map[appId][String(v[i][4] || '') + '|' + String(v[i][5] || '')] = String(v[i][6] || '');
  }
  return map;
}

/** 해당 날짜의 실험실 예약 + 명단 + 기존 출석 기록 (기본: 오늘) */
function getTodayLabSessions(dateStrOpt) {
  assertAdminOrTeacher_('getTodayLabSessions');
  const tz = Session.getScriptTimeZone();
  let dateStr = String(dateStrOpt || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) dateStr = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
  // scanAll: 하루 범위 최적화(첫 시트만)를 우회해 전 신청 시트에서 조회 —
  //   신청 시트가 여러 탭으로 늘거나 탭 순서가 바뀌어도 출석 대상 누락 방지
  const apps = getAllApplications({ dateFrom: dateStr, dateTo: dateStr, includeChemicals: false, scanAll: true });
  const att = getAttendanceMapForDate_(dateStr);
  const sessions = apps.map(app => {
    const key = String(app['신청ID']);
    const roster = buildRoster_(app);
    const recs = att[key] || {};
    roster.forEach(m => {
      const rk = m.sid + '|' + m.name;
      if (recs[rk]) m.status = recs[rk];
    });
    // 명단 외(무단참석 등) 저장분 복원
    Object.keys(recs).forEach(k => {
      const p = k.indexOf('|');
      const sid = k.slice(0, p), nm = k.slice(p + 1);
      if (!roster.some(m => m.sid === sid && m.name === nm)) {
        roster.push({ sid: sid, name: nm, status: recs[k], extra: true });
      }
    });
    return {
      appId: key,
      lab: String(app['신청실험실'] || ''),
      labs: String(app['사용실험실목록'] || ''),
      time: String(app['신청시간'] || ''),
      title: String(app['실험제목'] || ''),
      leaderSid: String(app['대표자학번'] || ''),
      leaderName: String(app['대표자이름'] || ''),
      count: String(app['총인원수'] || ''),
      status: getApplicationStatusForAdmin(app),
      roster: roster,
      saved: !!att[key]
    };
  });
  // 시간순 정렬 (ET → EP1 → 7교시 → 기타)
  const order = { 'ET': 1, 'EP1': 2, '7교시': 3 };
  sessions.sort((a, b) => (order[a.time] || 9) - (order[b.time] || 9) || String(a.lab).localeCompare(String(b.lab), 'ko'));
  return { date: dateStr, sessions: sessions };
}

/**
 * 출석 저장 — 같은 날짜+신청ID 기존 기록을 교체(upsert).
 * payload: { date, appId, lab, time, records: [{sid, name, status}] }
 */
function saveAttendance(payload) {
  const auth = assertAdminOrTeacher_('saveAttendance');
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return { success: false, message: '서버가 바쁩니다. 잠시 후 다시 시도해주세요.' };
  try {
    payload = payload || {};
    const tz = Session.getScriptTimeZone();
    let dateStr = String(payload.date || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) dateStr = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
    const appId = String(payload.appId || '').trim();
    if (!appId) throw new Error('신청 ID가 필요합니다.');
    const records = Array.isArray(payload.records) ? payload.records : [];
    const valid = records.filter(r => r && (String(r.sid || '').trim() || String(r.name || '').trim())
      && ATTENDANCE_STATUSES.indexOf(String(r.status || '')) !== -1);
    if (valid.length === 0) throw new Error('저장할 출석 기록이 없습니다.');

    const sh = ensureAttendanceSheet_();
    // 기존 동일 날짜+신청ID 기록 제거 (역순 삭제)
    const v = sh.getDataRange().getValues();
    for (let i = v.length - 1; i >= 1; i--) {
      const d = parseToDateSafe_(v[i][0]);
      const ds = d ? Utilities.formatDate(d, tz, 'yyyy-MM-dd') : String(v[i][0] || '');
      if (ds === dateStr && String(v[i][1] || '') === appId) sh.deleteRow(i + 1);
    }
    const teacher = (auth && auth.teacher && auth.teacher.name) ? auth.teacher.name : String((auth && auth.actor) || '');
    const now = new Date();
    const rows = valid.map(r => [
      dateStr, appId,
      sanitizeForSheet_(String(payload.lab || '')), sanitizeForSheet_(String(payload.time || '')),
      sanitizeForSheet_(String(r.sid || '').trim()), sanitizeForSheet_(String(r.name || '').trim()),
      String(r.status), sanitizeForSheet_(teacher), now
    ]);
    sh.getRange(sh.getLastRow() + 1, 1, rows.length, ATTENDANCE_HEADERS.length).setValues(rows);
    SpreadsheetApp.flush();
    logAdminAction_('출석체크', appId, dateStr + ' — ' + rows.length + '명 기록');
    return { success: true, saved: rows.length };
  } catch (e) {
    return { success: false, message: e.message };
  } finally { lock.releaseLock(); }
}

/* ==================================================
 *  관리자 작업 로그 시스템
 * ================================================== */

const ADMIN_LOG_HEADERS = ['타임스탬프', '작업자', '작업유형', '대상', '상세내용'];

/**
 * 관리자 로그 시트 확보
 */
function ensureAdminLogSheet_() {
  const ss = SpreadsheetApp.openById(MAIN_SSID);
  let sh = ss.getSheetByName(ADMIN_LOG_SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(ADMIN_LOG_SHEET_NAME);
    sh.appendRow(ADMIN_LOG_HEADERS);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, ADMIN_LOG_HEADERS.length)
      .setFontWeight('bold')
      .setBackground('#f3f4f6');
  }
  return sh;
}

/**
 * 관리자 작업 로그 기록
 * @param {string} actionType - 작업 유형 (승인, 반려, 삭제, 수정 등)
 * @param {string} target - 대상 (신청번호, 학번 등)
 * @param {string} details - 상세 내용
 */
// [v4.18/S1] 실제 기록은 내부 함수(_)로 이동 — 클라이언트가 직접 호출해 감사 로그를
//   위조·스팸하는 것을 차단. 트리거·거부 경로 등 내부 기록은 계속 무가드로 동작.
function logAdminAction(actionType, target, details) {
  assertAdminOrTeacher_('logAdminAction');
  return logAdminAction_(actionType, target, details);
}

// 내부 호출용 (_ 접미사) — google.script.run 으로 호출 불가
function logAdminAction_(actionType, target, details) {
  try {
    const sh = ensureAdminLogSheet_();
    const timestamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
    const user = Session.getActiveUser().getEmail() || '알 수 없음';
    sh.appendRow([timestamp, user, actionType, target, details]);
  } catch (e) {
    console.error('관리자 로그 기록 실패:', e);
  }
}

/**
 * 관리자 로그 조회
 * @param {number} limit - 최근 N개 (기본 100)
 */
function getAdminLogs(limit) {
  assertAdminOrTeacher_('getAdminLogs'); // [v4.18/S1] 작업자 이메일 포함 로그 — 학생 열람 차단
  const sh = ensureAdminLogSheet_();
  const data = sh.getDataRange().getValues();
  if (data.length <= 1) return [];
  
  const maxRows = Math.min(limit || 100, data.length - 1);
  const logs = [];
  for (let i = data.length - 1; i >= 1 && logs.length < maxRows; i--) {
    const row = data[i];
    logs.push({
      타임스탬프: row[0],
      작업자: row[1],
      작업유형: row[2],
      대상: row[3],
      상세내용: row[4]
    });
  }
  return logs;
}

/* ==================================================
 *  ✅ 백업 설정 (사용자 정의 보관 기간)
 * ================================================== */

/**
 * 백업 설정 조회 (클라이언트용 — 교사 가드)
 */
function getBackupConfig() {
  assertAdminOrTeacher_('getBackupConfig'); // [v4.18/S1]
  return getBackupConfig_();
}

/** 백업 설정 조회 — 내부·트리거용 (dailyAutoBackup_ 이 소유자 권한으로 호출) */
function getBackupConfig_() {
  const ss = SpreadsheetApp.openById(MAIN_SSID);
  let sh = ss.getSheetByName(BACKUP_CONFIG_SHEET_NAME);
  
  if (!sh) {
    sh = ss.insertSheet(BACKUP_CONFIG_SHEET_NAME);
    sh.appendRow(['설정항목', '값']);
    sh.appendRow(['보관기간(일)', 30]);
    sh.appendRow(['백업활성화', 'Y']);
  }
  
  const data = sh.getDataRange().getValues();
  const config = {};
  for (let i = 1; i < data.length; i++) {
    config[data[i][0]] = data[i][1];
  }
  
  return {
    // [v4.18/S1] 음수 방어 — 음수 보관기간이 저장돼 있으면 당일 백업까지 매일 삭제되므로 하한 1일 강제
    retentionDays: Math.max(1, Number(config['보관기간(일)']) || 30),
    enabled: config['백업활성화'] === 'Y'
  };
}

/**
 * 백업 설정 저장
 */
function saveBackupConfig(retentionDays, enabled) {
  assertAdminOrTeacher_('saveBackupConfig'); // [v4.18/S1] 무가드 시 보관기간 조작 → 백업 대량 삭제 경로
  // [v4.18/S1] 값 검증 — 1일 미만/비수치는 30일로. 음수·0이 들어가면 dailyAutoBackup_ 이
  //   당일 백업까지 매일 휴지통으로 보내게 되므로 반드시 하한 강제.
  const days = Math.max(1, Math.min(365, parseInt(retentionDays, 10) || 30));
  const ss = SpreadsheetApp.openById(MAIN_SSID);
  let sh = ss.getSheetByName(BACKUP_CONFIG_SHEET_NAME);

  if (!sh) {
    sh = ss.insertSheet(BACKUP_CONFIG_SHEET_NAME);
    sh.appendRow(['설정항목', '값']);
  }

  // 기존 데이터 삭제 후 새로 작성
  if (sh.getLastRow() > 1) {
    sh.getRange(2, 1, sh.getLastRow() - 1, 2).clearContent();
  }

  sh.getRange(2, 1, 2, 2).setValues([
    ['보관기간(일)', days],
    ['백업활성화', enabled ? 'Y' : 'N']
  ]);

  logAdminAction_('설정', '백업설정', `보관기간: ${days}일, 활성화: ${enabled ? 'Y' : 'N'}`);
  return { success: true, message: '백업 설정이 저장되었습니다.' };
}

/**
 * [v4.18/S4] 백업 시스템 원클릭 설치 — GAS 편집기에서 1회 실행.
 * 실행 시 새 Drive 권한 승인 창이 뜨고, 승인하면:
 *   ① 일일 자동 백업 트리거(매일 02시) ② 제한명단 정리 트리거(매일 03시) ③ 즉시 백업 1회.
 * 실행 후 메인 시트 폴더의 '자동백업' 폴더에 '백업_...' 파일이 생겼는지 확인하세요.
 */
function setupBackupSystem() {
  assertAdminOrTeacher_('setupBackupSystem');
  const r1 = setupDailyBackup(2);
  const r2 = setupDailyRestrictionMaintenance(3);
  dailyAutoBackup_(); // 즉시 1회 실행 (실패 시 관리자로그 + 학과 메일 알림)
  logAdminAction_('설정', '백업시스템', '트리거 설치 + 즉시 백업 실행');
  return {
    success: true,
    backupTrigger: r1 && r1.message,
    maintenanceTrigger: r2 && r2.message,
    note: "'자동백업' 폴더에 '백업_...' 파일이 생겼는지 확인하세요. 없으면 관리자로그 시트의 오류 기록을 확인하세요."
  };
}

/**
 * 일일 자동 백업 트리거 설정
 * @param {number} hourLocal - 백업 실행 시각 (0-23, 기본 2시)
 */
function setupDailyBackup(hourLocal) {
  assertAdminOrTeacher_('setupDailyBackup');
  const hour = Math.min(23, Math.max(0, Number(hourLocal ?? 2)));
  const fn = 'dailyAutoBackup_';
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === fn)
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger(fn)
    .timeBased()
    .atHour(hour)
    .everyDays(1)
    .create();
  logAdminAction_('설정', '백업 트리거', `매일 ${hour}:00 자동 백업 설정`);
  return { success: true, message: `매일 ${hour}:00 자동 백업 트리거 설정 완료` };
}

/**
 * 일일 자동 백업 실행 (트리거용) - ✅ 수정: 설정 기반 보관 기간
 */
function dailyAutoBackup_() {
  try {
    const config = getBackupConfig_(); // [v4.18/S1] 트리거 컨텍스트 — 무가드 내부 함수 사용
    if (!config.enabled) {
      console.log('자동 백업이 비활성화되어 있습니다.');
      return;
    }
    
    const ss = SpreadsheetApp.openById(MAIN_SSID);
    const dateStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd_HHmm');
    const backupName = `백업_${dateStr}`;
    
    // 백업 폴더 확보 (없으면 생성)
    const parentFolder = DriveApp.getFileById(MAIN_SSID).getParents().next();
    let backupFolder;
    const folders = parentFolder.getFoldersByName('자동백업');
    if (folders.hasNext()) {
      backupFolder = folders.next();
    } else {
      backupFolder = parentFolder.createFolder('자동백업');
    }
    
    // 스프레드시트 복사
    const backupFile = ss.copy(backupName);
    DriveApp.getFileById(backupFile.getId()).moveTo(backupFolder);
    
    // ✅ 수정: 설정된 보관 기간 적용
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - config.retentionDays);
    const oldFiles = backupFolder.getFiles();
    while (oldFiles.hasNext()) {
      const file = oldFiles.next();
      if (file.getDateCreated() < cutoffDate && file.getName().startsWith('백업_')) {
        file.setTrashed(true);
      }
    }
    
    logAdminAction_('백업', '자동백업', `백업 파일 생성: ${backupName}`);
    console.log('자동 백업 완료:', backupName);
  } catch (e) {
    console.error('자동 백업 실패:', e);
    logAdminAction_('오류', '자동백업', `백업 실패: ${e.message}`);
    // [v4.18/S4] 실패 무통보 제거 — 백업이 조용히 죽어 있던 문제. 학과 메일로 즉시 알림.
    try {
      if (typeof _adm_sendMail_ === 'function') {
        _adm_sendMail_(SCIENCE_EMAIL, '[백업 실패] 실험실 관리 시스템 자동 백업 오류',
          _adm_buildEmailHtml_('⚠️ 자동 백업 실패', [
            '일일 자동 백업이 실패했습니다.',
            '',
            '• 오류: ' + (e && e.message ? e.message : String(e)),
            '• 발생: ' + new Date().toLocaleString('ko-KR'),
            '',
            'GAS 편집기에서 dailyAutoBackup_ 을 수동 실행해 원인을 확인하세요.'
          ]));
      }
    } catch (_) {}
  }
}

/**
 * 수동 백업 실행
 */
function createManualBackup() {
  assertAdminOrTeacher_('createManualBackup');
  try {
    const ss = SpreadsheetApp.openById(MAIN_SSID);
    const dateStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd_HHmm');
    const backupName = `[수동백업] ${ss.getName()} - ${dateStr}`;

    // [v4.18/S4] 수동 백업도 '자동백업' 폴더에 정리 — 기존엔 parentFolder 를 만들어 놓고
    //   사용하지 않아 사본이 원본 시트 옆에 흩어졌음. '[수동백업]' 접두라 보관기간 정리 대상은 아님.
    const parentFolder = DriveApp.getFileById(MAIN_SSID).getParents().next();
    let backupFolder;
    const folders = parentFolder.getFoldersByName('자동백업');
    backupFolder = folders.hasNext() ? folders.next() : parentFolder.createFolder('자동백업');
    const backupFile = ss.copy(backupName);
    DriveApp.getFileById(backupFile.getId()).moveTo(backupFolder);

    logAdminAction_('백업', '수동백업', `백업 파일 생성: ${backupName}`);
    return { success: true, message: `백업 완료: ${backupName}`, fileId: backupFile.getId() };
  } catch (e) {
    return { success: false, message: `백업 실패: ${e.message}` };
  }
}

/* ==================================================
 *  ✅ 사용 통계 대시보드 (신규)
 * ================================================== */

/**
 * 사용 통계 조회
 * @param {string} dateFrom - 시작일 (yyyy-MM-dd)
 * @param {string} dateTo - 종료일 (yyyy-MM-dd)
 * @returns {Object} 통계 데이터
 */
function getUsageStatistics(dateFrom, dateTo) {
  assertAdminOrTeacher_('getUsageStatistics');
  const apps = getApplicationsForPeriod(dateFrom, dateTo);

  // 승인된 신청만 필터링
  const approved = apps.filter(a => {
    const finalApproval = String(a['최종승인여부'] || '');
    const firstApproval = String(a['지도승인여부'] || '');
    return finalApproval === '승인' || firstApproval === '승인';
  });

  const byLab = {};
  const byTime = {};
  const byDate = {};
  const byDayOfWeek = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
  const byTeacher = {};
  // [v3/D3] 양식종류별 신규 카테고리 — floor1/floor2/it/home/engineering
  const byFormCategory = { floor1: 0, floor2: 0, it: 0, home: 0, engineering: 0 };
  // 양식종류 한글 라벨 (반환 시 사용)
  const FORM_CATEGORY_LABEL = { floor1: '1층', floor2: '2층', it: 'IT', home: '가정', engineering: '공학' };

  approved.forEach(app => {
    const time = app['신청시간'] || '미지정';
    const date = formatDateForCompare_(app['실험할날짜']);
    const teacher = app['지도교사이름'] || '미지정';

    // [v3/D1] 실험실별 — 다중 룸 신청(신규 LAB)은 사용실험실목록을 split하여 각 룸에 카운트
    //   기존: 신청실험실(첫 룸만) → 두 번째 이후 룸 통계 누락
    //   신규: 사용실험실목록이 있으면 우선 사용, 없으면 신청실험실로 폴백
    const labListRaw = String(app['사용실험실목록'] || '').trim();
    let labRooms;
    if (labListRaw) {
      labRooms = labListRaw.split(',').map(s => s.trim()).filter(Boolean);
    } else {
      labRooms = [String(app['신청실험실'] || '미지정').trim() || '미지정'];
    }
    labRooms.forEach(lab => {
      byLab[lab] = (byLab[lab] || 0) + 1;
    });

    // [v3/D2] 시간대별 — 신청시간 콤마결합을 슬롯별로 split
    //   기존: "ET,EP1" 한 카테고리로 카운트 → 슬롯별 분석 불가
    //   신규: 슬롯 1개씩 분리하여 각각 +1
    const slotList = String(time).split(',').map(s => s.trim()).filter(Boolean);
    if (slotList.length === 0) {
      byTime['미지정'] = (byTime['미지정'] || 0) + 1;
    } else {
      slotList.forEach(slot => {
        byTime[slot] = (byTime[slot] || 0) + 1;
      });
    }

    // 일별
    if (date) {
      byDate[date] = (byDate[date] || 0) + 1;
    }

    // 요일별
    const d = parseToDateSafe_(app['실험할날짜']);
    if (d) {
      byDayOfWeek[d.getDay()]++;
    }

    // 교사별
    byTeacher[teacher] = (byTeacher[teacher] || 0) + 1;

    // [v3/D3] 양식종류별 — categoryOf_() 로 카테고리 판별 (관리자 GAS 전역 정의됨)
    const cat = categoryOf_(app);
    if (cat && byFormCategory.hasOwnProperty(cat)) {
      byFormCategory[cat]++;
    }
  });

  return {
    summary: {
      totalApplications: apps.length,
      approvedApplications: approved.length,
      approvalRate: apps.length > 0 ? Math.round(approved.length / apps.length * 100) : 0
    },
    byLab: Object.entries(byLab)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count),
    byTime: Object.entries(byTime)
      .map(([name, count]) => ({ name, count })),
    byDate: Object.entries(byDate)
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date)),
    byDayOfWeek: ['일', '월', '화', '수', '목', '금', '토']
      .map((name, i) => ({ name, count: byDayOfWeek[i] })),
    byTeacher: Object.entries(byTeacher)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count),
    // [v3/D3] 양식종류별 — 통계 클라이언트가 새 키를 모르면 무시 (하위 호환)
    byFormCategory: Object.keys(byFormCategory)
      .map(key => ({ key, name: FORM_CATEGORY_LABEL[key], count: byFormCategory[key] }))
      .sort((a, b) => b.count - a.count)
  };
}

/**
 * 신청 추이 데이터 (최근 N일)
 * @param {number} days - 조회 일수 (기본 30일)
 */
function getApplicationTrend(days) {
  assertAdminOrTeacher_('getApplicationTrend');
  const numDays = Math.min(90, Math.max(7, Number(days) || 30));
  const ss = SpreadsheetApp.openById(MAIN_SSID);
  const sheets = getTargetSheets_(ss); // [v4.18/S1] 이름+헤더 이중 필터 통일
  
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - numDays);
  startDate.setHours(0, 0, 0, 0);
  
  const dateMap = {}; // { 'yyyy-MM-dd': { total: 0, pending: 0, approved: 0, rejected: 0 } }
  
  for (const sh of sheets) {
    const data = sh.getDataRange().getValues();
    if (data.length <= 1) continue;
    
    const { map } = getHeaderMap_(sh);
    const dateIdx = map['실험할날짜'] ?? map['날짜'] ?? map['신청일'] ?? -1;
    const firstApprovalIdx = map['지도승인여부'];
    const finalApprovalIdx = map['최종승인여부'];
    
    if (dateIdx < 0) continue;
    
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const cellDate = parseToDateSafe_(row[dateIdx]);
      if (!cellDate || cellDate < startDate) continue;
      
      const dateKey = Utilities.formatDate(cellDate, Session.getScriptTimeZone(), 'yyyy-MM-dd');
      if (!dateMap[dateKey]) {
        dateMap[dateKey] = { total: 0, pending: 0, approved: 0, rejected: 0 };
      }
      
      dateMap[dateKey].total++;
      
      const firstApproval = firstApprovalIdx !== undefined ? String(row[firstApprovalIdx] || '') : '';
      const finalApproval = finalApprovalIdx !== undefined ? String(row[finalApprovalIdx] || '') : '';
      
      if (firstApproval === '반려' || finalApproval === '반려') {
        dateMap[dateKey].rejected++;
      } else if (finalApproval === '승인') {
        dateMap[dateKey].approved++;
      } else if (firstApproval === '승인') {
        dateMap[dateKey].approved++;
      } else {
        dateMap[dateKey].pending++;
      }
    }
  }
  
  // 배열로 변환하여 정렬
  const result = Object.entries(dateMap)
    .map(([date, counts]) => ({ date, ...counts }))
    .sort((a, b) => a.date.localeCompare(b.date));
  
  return result;
}

/**
 * 실험실별 사용 통계
 * @param {string} dateFrom - 시작일 (yyyy-MM-dd)
 * @param {string} dateTo - 종료일 (yyyy-MM-dd)
 */
function getLabUsageStats(dateFrom, dateTo) {
  assertAdminOrTeacher_('getLabUsageStats');
  const ss = SpreadsheetApp.openById(MAIN_SSID);
  const sheets = getTargetSheets_(ss); // [v4.18/S1] 이름+헤더 이중 필터 통일
  
  const from = dateFrom ? parseToDateSafe_(dateFrom) : null;
  const to = dateTo ? parseToDateSafe_(dateTo) : null;
  
  const labStats = {}; // { '실험실명': { total: 0, approved: 0, rejected: 0 } }
  
  for (const sh of sheets) {
    const data = sh.getDataRange().getValues();
    if (data.length <= 1) continue;
    
    const { map } = getHeaderMap_(sh);
    const dateIdx = map['실험할날짜'] ?? -1;
    const labIdx = map['신청실험실'] ?? -1;
    // [v3/D1] 다중 룸 신청(신규 LAB)도 각 룸에 카운트하기 위해 사용실험실목록 컬럼 추가 인식
    const labListIdx = map['사용실험실목록'] ?? -1;
    const firstApprovalIdx = map['지도승인여부'];
    const finalApprovalIdx = map['최종승인여부'];

    for (let i = 1; i < data.length; i++) {
      const row = data[i];

      if (dateIdx >= 0 && (from || to)) {
        const cellDate = parseToDateSafe_(row[dateIdx]);
        if (from && cellDate && cellDate < from) continue;
        if (to && cellDate && cellDate > to) continue;
      }

      // [v3/D1] 다중 룸 분해 — 사용실험실목록이 있으면 각 룸으로 분배, 없으면 신청실험실로 폴백
      let labRooms;
      const labListRaw = labListIdx >= 0 ? String(row[labListIdx] || '').trim() : '';
      if (labListRaw) {
        labRooms = labListRaw.split(',').map(s => s.trim()).filter(Boolean);
      } else {
        labRooms = [labIdx >= 0 ? String(row[labIdx] || '미지정').trim() : '미지정'];
        if (!labRooms[0]) labRooms = ['미지정'];
      }

      const firstApproval = firstApprovalIdx !== undefined ? String(row[firstApprovalIdx] || '') : '';
      const finalApproval = finalApprovalIdx !== undefined ? String(row[finalApprovalIdx] || '') : '';

      labRooms.forEach(labName => {
        if (!labStats[labName]) {
          labStats[labName] = { total: 0, approved: 0, rejected: 0, pending: 0 };
        }
        labStats[labName].total++;
        if (firstApproval === '반려' || finalApproval === '반려') {
          labStats[labName].rejected++;
        } else if (finalApproval === '승인' || firstApproval === '승인') {
          labStats[labName].approved++;
        } else {
          labStats[labName].pending++;
        }
      });
    }
  }
  
  return Object.entries(labStats)
    .map(([lab, stats]) => ({ lab, ...stats }))
    .sort((a, b) => b.total - a.total);
}

/* ==================================================
 *  ✅ 기간별 신청 데이터 조회 (시약목록, 학생명단, 임장일정용)
 *  - 중복 함수 정의 제거됨
 * ================================================== */

/**
 * 기간별 신청 데이터 조회
 * @param {string} dateFrom - 시작일 (yyyy-MM-dd)
 * @param {string} dateTo - 종료일 (yyyy-MM-dd)
 * @returns {Array} 신청 데이터 배열
 */
function getApplicationsForPeriod(dateFrom, dateTo) {
  assertAdminOrTeacher_('getApplicationsForPeriod');
  const ss = SpreadsheetApp.openById(MAIN_SSID);
  const sheets = getTargetSheets_(ss); // [v4.18/S1] 이름+헤더 이중 필터 통일

  const from = dateFrom ? parseToDateSafe_(dateFrom) : null;
  const to = dateTo ? parseToDateSafe_(dateTo) : null;

  // to 날짜는 해당 일의 끝으로 설정
  let toEnd = null;
  if (to) {
    toEnd = new Date(to.getTime());
    toEnd.setHours(23, 59, 59, 999);
  }

  // ✅ 시약 정보를 한 번에 모두 로드 (N+1 쿼리 방지)
  const chemMap = loadAllChemicalsMap_();

  const results = [];

  for (const sh of sheets) {
    const data = sh.getDataRange().getValues();
    if (data.length <= 1) continue;

    const { header, map } = getHeaderMap_(sh);
    const dateIdx = map['실험할날짜'] ?? -1;

    for (let i = 1; i < data.length; i++) {
      const row = data[i];

      // 날짜 필터링
      if (dateIdx >= 0 && (from || toEnd)) {
        const cellDate = parseToDateSafe_(row[dateIdx]);
        if (from && cellDate && cellDate < from) continue;
        if (toEnd && cellDate && cellDate > toEnd) continue;
      }

      // 객체로 변환
      const app = {};
      header.forEach((h, idx) => {
        if (h) {
          const v = row[idx];
          if (h === '제출일시' || h === '실험할날짜') {
            const d = parseToDateSafe_(v);
            app[h] = d ? toLocalISOString_(d) : (v == null ? '' : String(v));
          } else if (h === '임장지도 시작시간' || h === '임장지도 종료시간') {
            app[h] = normalizeToHHmm_(v);
          } else {
            app[h] = (v == null) ? '' : String(v);
          }
        }
      });

      // ✅ 시약 정보를 미리 로드한 맵에서 조회 (스프레드시트 재호출 없음)
      const appId = app['신청ID'] || '';
      app.chemicals = appId ? (chemMap.get(appId) || []) : [];

      results.push(app);
    }
  }

  return results;
}

/**
 * 시약 정보 파싱 (JSON 또는 개별 필드)
 */
// [P2-#16] DEPRECATED — 메인 시트의 '시약정보' JSON 또는 '시약명N' 류 레거시 컬럼을 파싱하는 함수.
// 현재 시스템은 시약을 별도 시트(CHEM_RECORD_SSID)에 저장하고 getApplicationChemicals 로 조회하므로
// 이 함수는 더 이상 호출되지 않는다. 호출처가 발견되면 getApplicationChemicals 로 마이그레이션할 것.
// 즉시 삭제하지 않는 이유: 과거 운영 중 메인 시트에 레거시 컬럼이 남아있을 가능성에 대한 안전망.
function parseChemicalsFromApp_(app) {
  // 시약 정보가 JSON 형태로 저장된 경우
  const chemJson = app['시약정보'] || app['사용시약'] || '';
  
  if (typeof chemJson === 'string' && chemJson.trim().startsWith('[')) {
    try {
      return JSON.parse(chemJson);
    } catch(e) {
      // JSON 파싱 실패 시 빈 배열
    }
  }
  
  // 개별 필드로 저장된 경우 (시약명1, 시약량1 등)
  const chemicals = [];
  for (let i = 1; i <= 10; i++) {
    const name = app[`시약명${i}`] || app[`시약${i}`] || '';
    if (!name) continue;
    
    chemicals.push({
      시약명: name,
      상태: app[`상태${i}`] || app[`시약상태${i}`] || '',
      농도: app[`농도${i}`] || '',
      용량: app[`용량${i}`] || app[`시약량${i}`] || '',
      MSDS: app[`MSDS${i}`] || '',
      교사임장여부: app[`교사임장여부${i}`] || app['교사임장여부'] || ''
    });
  }
  
  return chemicals;
}

/**
 * 임장 일정 수정용 API
 * @param {string} appId - 신청 ID
 * @param {Object} updates - 수정할 필드들
 */
function updateScheduleFields(appId, updates) {
  assertAdminOrTeacher_('updateScheduleFields');
  if (!appId) {
    return { success: false, message: '신청 ID가 필요합니다.' };
  }
  // [2026-08-22] 접수 중단 실험실로의 변경 차단.
  //   이 함수는 throw 가 아니라 결과 객체를 반환하는 계약이라 catch 해서 변환한다.
  try {
    _adm_assertLabWritable_(updates && updates['신청실험실']);
  } catch (labErr) {
    return { success: false, message: labErr.message };
  }
  // [v4.18/S6] 임장 일정 모달이 노출하는 편집 필드 전체를 허용 — 기존엔 시간 2개만 저장하고
  //   나머지(지도교사·실험실·날짜·시간대)는 조용히 버리면서 "저장되었습니다"를 표시했음(거짓 저장).
  const SCHEDULE_EDITABLE = ['임장지도 시작시간', '임장지도 종료시간', '지도교사이름', '신청실험실', '실험할날짜', '신청시간'];
  // [v4.0.6/안정성-P0-1] LockService — 두 관리자가 동시에 같은 신청의 임장 시간을 변경할 때 충돌 방지
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return { success: false, message: '서버가 바쁩니다. 잠시 후 다시 시도해주세요.' };
  try {
    const ss = SpreadsheetApp.openById(MAIN_SSID);
    const sheets = getTargetSheets_(ss); // [v4.18/S1] 이름+헤더 이중 필터 통일

    for (const sh of sheets) {
      const data = sh.getDataRange().getValues();
      if (data.length <= 1) continue;

      const { header, map } = getHeaderMap_(sh);
      const idIdx = map['신청ID'] ?? -1;

      if (idIdx < 0) continue;

      for (let i = 1; i < data.length; i++) {
        if (String(data[i][idIdx]) === String(appId)) {
          const updateCols = [];
          const skipped = [];
          for (const [field, value] of Object.entries(updates)) {
            if (SCHEDULE_EDITABLE.indexOf(field) === -1) {
              Logger.log('[updateScheduleFields] 차단된 필드: ' + field);
              skipped.push(field);
              continue;
            }
            const colIdx = map[field];
            if (colIdx !== undefined && colIdx >= 0) {
              let v = value;
              // [v4.18/S6] 날짜는 Date 로 변환해 저장 (문자열로 박히면 필터·정렬이 깨짐)
              if (field === '실험할날짜' && v && !(v instanceof Date)) {
                const d = parseToDateSafe_(v);
                if (d) v = d;
              }
              updateCols.push({ col: colIdx + 1, value: v });
            } else {
              skipped.push(field); // 시트에 해당 컬럼이 없는 경우도 결과에 보고
            }
          }

          if (updateCols.length > 0) {
            updateCols.forEach(u => { sh.getRange(i + 1, u.col).setValue(u.value); });
            SpreadsheetApp.flush();
            // [v4.18/S6] 실험실·날짜가 바뀔 수 있으므로 시약 맵 캐시 무효화 (updateApplicationFields 와 동일 정책)
            try { CacheService.getScriptCache().remove('CHEM_MAP_V1'); } catch (_) {}
            logAdminAction_('수정', appId, `임장일정 수정: ${JSON.stringify(updates)}`);
            // [v4.18/S6] 저장 안 된 필드가 있으면 응답에 명시 — 거짓 "저장되었습니다" 방지
            if (skipped.length > 0) {
              return { success: true, message: '일부만 저장되었습니다. 저장 안 된 항목: ' + skipped.join(', '), skipped: skipped };
            }
            return { success: true, message: '저장되었습니다.' };
          }
          return { success: false, message: '저장 가능한 필드가 없습니다. (시트 컬럼 확인 필요: ' + skipped.join(', ') + ')' };
        }
      }
    }
    return { success: false, message: '해당 신청을 찾을 수 없습니다.' };
  } finally {
    lock.releaseLock();
  }
}

function getLabList() {
  assertAdminOrTeacher_('getLabList'); // [v4.18/S1]
  try {
    var ss = SpreadsheetApp.openById(MAIN_SSID);
    var sheets = getTargetSheets_(ss);
    var labSet = {};
    sheets.forEach(function(sh) {
      var vals = sh.getDataRange().getValues();
      if (vals.length < 2) return;
      var hdr = vals[0];
      var labCol = hdr.indexOf('신청실험실');
      if (labCol === -1) return;
      for (var i = 1; i < vals.length; i++) {
        var v = String(vals[i][labCol] || '').trim();
        if (v) labSet[v] = true;
      }
    });
    return Object.keys(labSet).sort();
  } catch (e) {
    console.error('getLabList 오류:', e);
    return [];
  }
}

/* ==================================================
 *  ✅ 관리자 측 승인/반려 후 자동 메일 발송 (신청서 GAS submitApproval_ 동등 흐름)
 *  - 4개 entry 함수(approveWithDuplicateCheck, forceApprove,
 *    updateApplicationFields, updateFullApplication)에서 호출
 *  - 누가 어떤 경로로 시트의 지도승인여부/최종승인여부를 변경하든
 *    동일한 메일이 자동 발송됨 → 누락 0%
 * ================================================== */

function _adm_escapeHtml_(s) {
  return String(s == null ? '' : s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function _adm_htmlToPlainText_(html) {
  if (!html) return '';
  return String(html)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(div|p|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g,' ').replace(/&amp;/g,'&')
    .replace(/&lt;/g,'<').replace(/&gt;/g,'>')
    .replace(/&quot;/g,'"').replace(/&#39;/g,"'")
    .replace(/\n{3,}/g,'\n\n').replace(/[ \t]+\n/g,'\n').trim();
}

/* =====================================================================
 * [SEC-P3] HMAC 메일 토큰 — 신청서 GAS 와 동등.
 *   ⚠️ 두 프로젝트의 ScriptProperties 'MAIL_TOKEN_SECRET' 가 동일해야 토큰 검증 통과.
 *      운영자가 수동으로 동일 시크릿을 양쪽에 설정해야 합니다.
 *      미설정 시 자동 생성되지만, 신청서와 다른 값이라 발급된 토큰은 신청서 doGet에서 거부됨.
 *      → "secret 동기화 안내" 함수 _adm_getMailTokenSecretInfo() 제공.
 * ===================================================================== */
function _adm_getMailTokenSecret_() {
  try {
    const props = PropertiesService.getScriptProperties();
    let secret = props.getProperty('MAIL_TOKEN_SECRET');
    if (!secret) {
      const bytes = [];
      for (let i = 0; i < 32; i++) bytes.push(Math.floor(Math.random() * 256));
      secret = Utilities.base64EncodeWebSafe(bytes);
      props.setProperty('MAIL_TOKEN_SECRET', secret);
      Logger.log('[SEC-P3 admin] MAIL_TOKEN_SECRET 자동 생성 — ⚠ 신청서와 다를 수 있음. 수동 동기화 필요');
    }
    return secret;
  } catch (e) {
    Logger.log('[_adm_getMailTokenSecret_] 시크릿 조회 실패: ' + (e && e.message ? e.message : e));
    return '_FALLBACK_NOT_SAFE_';
  }
}
function _adm_b64urlEncode_(input) {
  if (typeof input === 'string') {
    return Utilities.base64EncodeWebSafe(Utilities.newBlob(input).getBytes()).replace(/=+$/, '');
  }
  return Utilities.base64EncodeWebSafe(input).replace(/=+$/, '');
}
function _adm_genApprovalToken_(appId, stage, recipientEmail, ttlSec) {
  const ttl = (typeof ttlSec === 'number' && ttlSec > 0) ? ttlSec : 7 * 24 * 60 * 60;
  const exp = Math.floor(Date.now() / 1000) + ttl;
  const rcpt = String(recipientEmail || '').trim().toLowerCase();
  const payload = [String(appId), String(stage), rcpt, String(exp)].join('|');
  const sig = Utilities.computeHmacSha256Signature(payload, _adm_getMailTokenSecret_());
  return _adm_b64urlEncode_(payload) + '.' + _adm_b64urlEncode_(sig);
}

/** [운영 유틸] 현재 관리자 측 시크릿 정보 — 신청서와 동기화 확인용. 관리자만 호출. */
function getMailTokenSecretInfo() {
  const email = String((function(){ try { return Session.getActiveUser().getEmail() || ''; } catch(_){return '';} })()).trim().toLowerCase();
  if (email !== String(SCIENCE_EMAIL || '').toLowerCase()) {
    // 학과 메일만 시크릿 노출 (디버깅용)
    throw new Error('학과 메일(' + SCIENCE_EMAIL + ')로만 시크릿 확인이 가능합니다.');
  }
  const s = _adm_getMailTokenSecret_();
  return {
    secret: s,
    length: s.length,
    note: '신청서 GAS 의 ScriptProperties.MAIL_TOKEN_SECRET 도 위 값과 동일해야 메일 링크가 정상 작동합니다.'
  };
}

/* =====================================================================
 * [SEC] 관리자 페이지 보안 통합 모듈 — 신청서 GAS 와 동등.
 *   - 세션 식별, 권한 검증, 접속로그 (옵션 A 샘플링), 자동 차단, 회로 차단기.
 *   - 모든 위험 함수에 assertAdminOrTeacher_ 적용해 학생 콘솔 호출 차단.
 * ===================================================================== */

const _ADM_ACCESS_LOG_SHEET = '접속로그_관리자';
const _ADM_BLOCK_LIST_SHEET = '차단명단_관리자';
const _ADM_SEC_POLICY = {
  DENY_THRESHOLD: 5,
  WINDOW_SEC: 600,
  BLOCK_DURATION_SEC: 3600,
  GLOBAL_LIMIT_PER_MIN: 200,
  CIRCUIT_BREAK_SEC: 300
};

function _adm_getSessionEmail_() {
  try { return String(Session.getActiveUser().getEmail() || '').trim().toLowerCase(); }
  catch (_) { return ''; }
}

function _adm_isAdminEmail_(email) {
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

function _adm_getSessionTeacher_() {
  const email = _adm_getSessionEmail_();
  if (!email) return null;
  try {
    const cache = CacheService.getScriptCache();
    const ck = 'adm-teacher-by-email:v1:' + email;
    const hit = cache.get(ck);
    if (hit) { try { return JSON.parse(hit) || null; } catch (_) {} }
    const rows = SpreadsheetApp.openById(TEACHER_LIST_SSID).getSheets()[0].getDataRange().getValues();
    const [hdr, ...data] = rows;
    const nameIdx = hdr.indexOf('교사이름');
    const emailIdx = hdr.indexOf('이메일주소') !== -1 ? hdr.indexOf('이메일주소') : hdr.indexOf('이메일 주소');
    if (emailIdx === -1) return null;
    const row = data.find(r => String(r[emailIdx] || '').trim().toLowerCase() === email);
    if (!row) { try { cache.put(ck, '', 300); } catch(_){} return null; }
    const out = { name: row[nameIdx], email: row[emailIdx] };
    try { cache.put(ck, JSON.stringify(out), 300); } catch(_){}
    return out;
  } catch (e) {
    Logger.log('[_adm_getSessionTeacher_] 시트 조회 실패: ' + (e && e.message ? e.message : e));
    return null;
  }
}

function _adm_ensureAccessLogSheet_() {
  const ss = SpreadsheetApp.openById(MAIN_SSID);
  let sh = ss.getSheetByName(_ADM_ACCESS_LOG_SHEET);
  if (sh) return sh;
  sh = ss.insertSheet(_ADM_ACCESS_LOG_SHEET);
  sh.appendRow(['타임스탬프', '함수', '호출자(세션이메일)', '대상', '결과', '비고', '세션해시']);
  sh.getRange(1, 1, 1, 7).setFontWeight('bold').setBackground('#fef3c7');
  sh.setFrozenRows(1);
  return sh;
}

function _adm_sessionHash_(email) {
  try {
    const raw = String(email || '') + '|' + new Date().toISOString().slice(0, 10);
    return Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, raw)).slice(0, 12);
  } catch (_) { return ''; }
}

function _adm_logAccess_(context, actor, target, result, note) {
  try {
    const r = String(result || '');
    // 옵션 A: allow 샘플링 10%
    if (r === 'allow' && Math.random() >= 0.1) {
      try {
        const cache = CacheService.getScriptCache();
        const day = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd');
        const k = 'adm-allow-skipped:' + day;
        cache.put(k, String((parseInt(cache.get(k) || '0', 10)) + 1), 86400);
      } catch (_) {}
      return;
    }
    const sh = _adm_ensureAccessLogSheet_();
    sh.appendRow([new Date(), String(context||''), String(actor||''), String(target||''), r,
      String(note||'').slice(0, 500), _adm_sessionHash_(actor)]);
  } catch (e) {
    Logger.log('[_adm_logAccess_] 기록 실패: ' + (e && e.message ? e.message : e));
  }
}

/* ---------- 자동 차단 + 회로 차단기 ---------- */

function _adm_ensureBlockSheet_() {
  const ss = SpreadsheetApp.openById(MAIN_SSID);
  let sh = ss.getSheetByName(_ADM_BLOCK_LIST_SHEET);
  if (sh) return sh;
  sh = ss.insertSheet(_ADM_BLOCK_LIST_SHEET);
  sh.appendRow(['차단시각', '대상이메일', '차단유형', '사유', '해제시각', '비고']);
  sh.getRange(1, 1, 1, 6).setFontWeight('bold').setBackground('#fee2e2');
  sh.setFrozenRows(1);
  return sh;
}

function _adm_recordSuspicious_(email, points, reason) {
  if (!email) return;
  try {
    const cache = CacheService.getScriptCache();
    const day = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd');
    const k = 'adm-susp:' + email + ':' + day;
    const next = (parseInt(cache.get(k) || '0', 10)) + (points || 1);
    cache.put(k, String(next), _ADM_SEC_POLICY.WINDOW_SEC);
    if (next >= _ADM_SEC_POLICY.DENY_THRESHOLD) _adm_autoBlock_(email, reason || ('의심점수 ' + next));
  } catch (_) {}
}

function _adm_autoBlock_(email, reason) {
  const cache = CacheService.getScriptCache();
  const key = 'adm-block:' + email;
  if (cache.get(key)) return;
  cache.put(key, JSON.stringify({ until: Date.now() + _ADM_SEC_POLICY.BLOCK_DURATION_SEC * 1000, reason: reason || '' }),
    _ADM_SEC_POLICY.BLOCK_DURATION_SEC);
  try {
    _adm_ensureBlockSheet_().appendRow([new Date(), email, 'auto', String(reason||''),
      new Date(Date.now() + _ADM_SEC_POLICY.BLOCK_DURATION_SEC * 1000), '']);
  } catch (_) {}
  _adm_logAccess_('adminAutoBlock', email, '', 'block', reason || '');
  // 학과 알림
  try {
    if (typeof _adm_sendMail_ === 'function') {
      _adm_sendMail_(SCIENCE_EMAIL, '[관리자 페이지 자동 차단] ' + email,
        _adm_buildEmailHtml_('🚨 관리자 페이지 자동 차단', [
          '관리자 페이지에서 의심 행동이 누적되어 사용자가 자동 차단되었습니다.',
          '',
          '• 대상: ' + email,
          '• 사유: ' + reason,
          '• 기간: ' + Math.floor(_ADM_SEC_POLICY.BLOCK_DURATION_SEC/60) + '분',
          '• 발생: ' + new Date().toLocaleString('ko-KR')
        ]));
    }
  } catch (_) {}
}

function _adm_assertNotBlocked_(context) {
  const email = _adm_getSessionEmail_();
  if (!email) return;
  try {
    const raw = CacheService.getScriptCache().get('adm-block:' + email);
    if (raw) {
      let obj = {}; try { obj = JSON.parse(raw); } catch(_){}
      _adm_logAccess_(context, email, '', 'deny', 'BLOCKED: ' + (obj.reason || ''));
      const remainMin = Math.max(1, Math.ceil(((obj.until||0) - Date.now()) / 60000));
      throw new Error('⛔ 일시 차단 상태입니다. 약 ' + remainMin + '분 후 다시 시도해 주세요.');
    }
  } catch (e) {
    if (e && e.message && /일시 차단/.test(e.message)) throw e;
  }
}

function _adm_assertCircuitClosed_(context) {
  try {
    const cache = CacheService.getScriptCache();
    if (cache.get('adm-circuit:open')) {
      _adm_logAccess_(context, _adm_getSessionEmail_(), '', 'deny', 'CIRCUIT_OPEN');
      throw new Error('⚠️ 시스템 보호 모드. 잠시 후 다시 시도해 주세요.');
    }
    const slot = Math.floor(Date.now() / 60000);
    const k = 'adm-global:' + slot;
    const n = (parseInt(cache.get(k) || '0', 10)) + 1;
    cache.put(k, String(n), 65);
    if (n > _ADM_SEC_POLICY.GLOBAL_LIMIT_PER_MIN) {
      cache.put('adm-circuit:open', '1', _ADM_SEC_POLICY.CIRCUIT_BREAK_SEC);
      _adm_logAccess_('adminCircuit:trip', '', '', 'block', '분당 ' + n + ' 호출');
      throw new Error('⚠️ 시스템 보호 모드. 잠시 후 다시 시도해 주세요.');
    }
  } catch (e) {
    if (e && e.message && /시스템 보호/.test(e.message)) throw e;
  }
}

/**
 * ★ 핵심 가드 — 관리자 페이지의 거의 모든 함수가 이 가드를 통과해야 함.
 *   - 학과 메일 / ADMIN_EMAILS / 교사 시트 등록자만 통과.
 *   - 학생은 즉시 throw + 의심 점수 5점 (반복 시 자동 차단).
 *   - 차단 명단 · 회로 차단 우선 체크.
 */
function assertAdminOrTeacher_(context) {
  _adm_assertNotBlocked_(context);
  _adm_assertCircuitClosed_(context);

  const email = _adm_getSessionEmail_();
  if (!email) {
    _adm_logAccess_(context, '', '', 'deny', '세션 이메일 없음');
    throw new Error('세션 정보를 가져올 수 없습니다. 로그아웃 후 다시 로그인해 주세요.');
  }
  if (_adm_isAdminEmail_(email)) {
    _adm_logAccess_(context, email, '', 'allow', 'admin');
    return { actor: email, role: 'admin' };
  }
  const teacher = _adm_getSessionTeacher_();
  if (teacher) {
    _adm_logAccess_(context, email, '', 'allow', 'teacher:' + (teacher.name || ''));
    return { actor: email, role: 'teacher', teacher: teacher };
  }
  // [v4.18/S6] 이메일 prefix 매칭 폴백 — 입장 심사(verifyTeacherBySession)는 prefix 교사도
  //   통과시키는데 여기서 거부하면, 그 교사는 접속 직후 첫 RPC에서 의심점수 5점(임계 5)으로
  //   즉시 1시간 자동 차단 + 학과 경보 메일이 가는 모순이 있었음. 두 심사 기준을 일치시킨다.
  try {
    const prefix = email.indexOf('@') > 0 ? email.slice(0, email.indexOf('@')) : email;
    const idSet = getTeacherIdSet_();
    if (idSet.has(prefix)) {
      _adm_logAccess_(context, email, '', 'allow', 'teacher-by-prefix');
      return { actor: email, role: 'teacher', teacher: { name: prefix, email: email } };
    }
  } catch (_) {}
  // 학생 시도 — 매우 의심
  _adm_logAccess_(context, email, '', 'deny', '관리자 페이지 접근 권한 없음 (학생)');
  _adm_recordSuspicious_(email, 5, '관리자 페이지 함수 호출 시도 (' + context + ')');
  throw new Error('⛔ 관리자 페이지 접근 권한이 없습니다. 학생은 본 시스템에 접근할 수 없습니다.');
}

/* ---------- 관리자용 운영 도구 ---------- */

/** 접속로그 조회 (관리자만) */
function listAdminAccessLogs(limit) {
  const sessionEmail = _adm_getSessionEmail_();
  if (!_adm_isAdminEmail_(sessionEmail)) {
    _adm_logAccess_('listAdminAccessLogs', sessionEmail, '', 'deny', '관리자 아님');
    throw new Error('관리자만 조회할 수 있습니다.');
  }
  const n = Math.max(1, Math.min(2000, Number(limit) || 200));
  const sh = _adm_ensureAccessLogSheet_();
  const last = sh.getLastRow();
  if (last < 2) return [];
  const start = Math.max(2, last - n + 1);
  const vals = sh.getRange(start, 1, last - start + 1, 7).getValues();
  return vals.map(r => ({
    ts: r[0] instanceof Date ? r[0].toISOString() : String(r[0]),
    fn: r[1], actor: r[2], target: r[3], result: r[4], note: r[5], hash: r[6]
  })).reverse();
}

function _adm_logMailEvent_(to, subject, ok, error) {
  // [P2-#19] 신청서 logMailEvent_ 와 동일 정책 — 시트 자동 생성+append 직렬화.
  let lock = null;
  try { lock = LockService.getDocumentLock(); } catch (_) {}
  if (!lock) { try { lock = LockService.getScriptLock(); } catch (_) {} }
  let locked = false;
  if (lock) {
    try { locked = lock.tryLock(3000); } catch (_) { locked = false; }
  }
  try {
    const ss = SpreadsheetApp.openById(MAIN_SSID);
    let sh = ss.getSheetByName('이메일발송로그');
    if (!sh) {
      sh = ss.insertSheet('이메일발송로그');
      sh.getRange(1, 1, 1, 6).setValues([['시각','수신자','제목','상태','오류','보낸이']]);
      sh.setFrozenRows(1);
    }
    sh.appendRow([new Date(), String(to||''), String(subject||'').slice(0,200),
      ok ? 'ok' : 'fail', String(error||'').slice(0,500),
      Session.getActiveUser().getEmail() || '']);
  } catch (_) {}
  finally {
    if (locked && lock) {
      try { lock.releaseLock(); } catch (_) {}
    }
  }
}

function _adm_sendMail_(to, subject, htmlBody) {
  const addr = String(to || '').trim();
  if (!addr || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr) || /[\r\n]/.test(addr)) {
    const msg = '유효하지 않은 이메일: ' + addr;
    _adm_logMailEvent_(addr, subject, false, msg);
    return { ok: false, error: msg };
  }
  if (!/@cnsa\.hs\.kr$/i.test(addr)) {
    const msg = '학교 외부 도메인 차단: ' + addr;
    _adm_logMailEvent_(addr, subject, false, msg);
    return { ok: false, error: msg };
  }
  const safeSubject = String(subject||'').replace(/[\r\n\t]/g,' ').slice(0, 200);
  try {
    const textBody = _adm_htmlToPlainText_(htmlBody) || 'HTML 메일입니다.';
    const opts = {
      htmlBody: htmlBody,
      name: '과학 실험·실습실 신청 시스템',
      replyTo: SCIENCE_EMAIL
    };
    let useFrom = false;
    try {
      const aliases = GmailApp.getAliases();
      if (aliases.indexOf(SCIENCE_EMAIL) !== -1) useFrom = true;
    } catch (_) {}
    if (useFrom) {
      try {
        opts.from = SCIENCE_EMAIL;
        GmailApp.sendEmail(addr, safeSubject, textBody, opts);
      } catch (e) {
        delete opts.from;
        GmailApp.sendEmail(addr, safeSubject, textBody, opts);
      }
    } else {
      GmailApp.sendEmail(addr, safeSubject, textBody, opts);
    }
    Logger.log('[_adm_sendMail_] 발송 성공 → ' + addr + ' / ' + safeSubject);
    _adm_logMailEvent_(addr, safeSubject, true, '');
    return { ok: true };
  } catch (e) {
    const msg = String(e.message || e);
    Logger.log('[_adm_sendMail_] 발송 실패 (' + addr + '): ' + msg);
    _adm_logMailEvent_(addr, subject, false, msg);
    return { ok: false, error: msg };
  }
}

function _adm_buildEmailHtml_(title, lines, linkUrl, linkLabel) {
  const t = _adm_escapeHtml_(title || '');
  const ll = _adm_escapeHtml_(linkLabel || '바로가기');

  // [v3.38] 멀티 로그인 환경 대응 — 메일 내 진입 링크를 AccountChooser로 감싸기.
  //   수신자가 멀티 로그인 상태여도 의도한 계정을 선택한 뒤 페이지로 진입하도록 강제.
  //   이미 AccountChooser URL인 경우는 중복 감싸지 않음 (멱등).
  let safeLinkUrl = linkUrl;
  if (safeLinkUrl) {
    var s = String(safeLinkUrl).trim();
    if (s && !/^https:\/\/accounts\.google\.com\/AccountChooser\?/i.test(s)) {
      safeLinkUrl = 'https://accounts.google.com/AccountChooser?continue=' + encodeURIComponent(s);
    }
  }

  const rows = (lines || []).map(l => {
    if (l === '') return '<br>';
    if (String(l).startsWith('•')) return '<div style="padding:2px 0 2px 12px;">' + l + '</div>';
    return '<div style="padding:2px 0;">' + l + '</div>';
  }).join('');
  const linkBlock = safeLinkUrl ? ('<div style="margin:18px 0;"><a href="' +
    _adm_escapeHtml_(safeLinkUrl) + '" style="display:inline-block;padding:10px 24px;background:#4285F4;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold;">' +
    ll + '</a></div>' +
    '<div style="font-size:11px;color:#6b7280;margin:-10px 0 10px;">※ 멀티 로그인 환경에서는 계정 선택 화면이 먼저 표시됩니다. 본인의 학교 계정을 선택해 주세요.</div>') : '';
  return '<div style="font-family:\'맑은 고딕\',Arial,sans-serif;max-width:620px;margin:0 auto;padding:20px;">' +
    '<div style="background:#fff8e1;border-left:4px solid #f59e0b;padding:8px 12px;font-size:12px;color:#92400e;margin-bottom:16px;">📨 과학 실험·실습실 신청 시스템에서 자동 발송한 메일입니다. 회신은 ' + _adm_escapeHtml_(SCIENCE_EMAIL) + ' 으로 보내주세요.</div>' +
    '<h2 style="color:#333;border-bottom:2px solid #4285F4;padding-bottom:8px;">' + t + '</h2>' +
    '<div style="line-height:1.8;color:#444;">' + rows + '</div>' +
    linkBlock +
    '<hr style="border:none;border-top:1px solid #eee;margin:24px 0 8px;">' +
    '<div style="background:#fef2f2;border-left:4px solid #dc2626;padding:8px 12px;font-size:11px;color:#7f1d1d;margin-top:12px;">' +
      '<b>🔒 보안 안내</b><br>본 메일에는 학생 개인정보(이름·학번·실험 주제)가 포함되어 있습니다. <b>무단 캡처·전달·외부 공유를 금지</b>합니다. ' +
      '승인 링크는 수신자 본인 인증으로만 작동하며, 모든 접속·승인 시도는 자동 기록·추적됩니다. ' +
      '메일이 의심스러우면 ' + _adm_escapeHtml_(SCIENCE_EMAIL) + ' 으로 즉시 신고해 주세요.' +
    '</div>' +
    '<div style="font-size:12px;color:#999;margin-top:8px;">본 메일은 과학 실험·실습실 신청 시스템에서 자동 발송되었습니다. 문의: ' + _adm_escapeHtml_(SCIENCE_EMAIL) + '</div>' +
    '</div>';
}

function _adm_getStudentEmail_(studentId) {
  const sid = String(studentId || '').replace(/\D/g, '').padStart(5, '0').slice(0, 5);
  if (!/^\d{5}$/.test(sid)) return '';
  return sid + '@cnsa.hs.kr';
}

/**
 * [P2-#34] 시약명 정규화 — 신청서 GAS의 normalizeChemName_ 와 1:1 동등.
 * 관리자가 시약 검색·중복 검출·매칭을 추가할 경우 신청서와 동일 정규화 규칙을 사용해
 * "황산"·"황산(농축액)"·"H₂SO₄ 수용액" 등을 같은 키로 처리.
 * 현재는 호출처가 없으나 향후 시약 관리 기능 확장 시 신청서 측과 동일 동작 보장.
 */
function _adm_normalizeChemName_(name) {
  if (!name) return '';
  let s = String(name).normalize('NFC').toLowerCase();
  // 전각 괄호 → 반각 (신청서 normalizeChemName_와 동일)
  s = s.replace(/\uFF08/g, '(').replace(/\uFF09/g, ')').replace(/\uFF3B/g, '[').replace(/\uFF3D/g, ']');
  s = s.replace(/\(.*?\)|\[.*?\]|\{.*?\}/g, '');
  s = s.replace(/\b수용액\b|\bsolution\b/gi, '');
  s = s.replace(/\s+/g, '');
  s = s.replace(/[^\w가-힣·]/g, '');
  return s.trim();
}

function _adm_normalizeDateYMD_(v) {
  if (!v) return '';
  if (v instanceof Date) {
    const y = v.getFullYear(), m = ('0'+(v.getMonth()+1)).slice(-2), d = ('0'+v.getDate()).slice(-2);
    return y + '-' + m + '-' + d;
  }
  const s = String(v).trim();
  const m = s.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})/);
  if (m) return m[1] + '-' + ('0'+m[2]).slice(-2) + '-' + ('0'+m[3]).slice(-2);
  return s;
}

/* ===== 실험실 이름 정규화 (신청서 GAS와 동일) ===== */
const _ADM_CANONICAL_LABS = [
  '화학실험실', '생물실험실', '프로젝트실험실', '첨단기기실험실', '오픈랩',
  '물리실험실', '파동광학실험실', 'AP Lab', 'Tech & Art LAB',
  'IT 공학실', '컴퓨터실', '코딩실', '멀티미디어실', '가정실습실',   // '컴퓨터실'은 개명 전 기록 조회용으로 유지
  '융합기술실', '창의공학실', '공작기계실', 'FAB Lab'
];
const _ADM_LAB_ALIASES = {
  '화학':'화학실험실','생물':'생물실험실','프로젝트':'프로젝트실험실',
  '첨단기기':'첨단기기실험실','첨단':'첨단기기실험실',
  '오픈':'오픈랩','openlab':'오픈랩','open lab':'오픈랩',
  '물리':'물리실험실','파동광학':'파동광학실험실','파동':'파동광학실험실',
  'ap':'AP Lab','aplab':'AP Lab','ap lab':'AP Lab','에이피':'AP Lab',
  'ap실험실':'AP Lab',
  'techart':'Tech & Art LAB','tech&art':'Tech & Art LAB',
  'techandart':'Tech & Art LAB','tech&artlab':'Tech & Art LAB',
  'tech & art lab':'Tech & Art LAB','tech&art lab':'Tech & Art LAB',
  'tech and art lab':'Tech & Art LAB',
  '테크아트':'Tech & Art LAB','테크앤아트':'Tech & Art LAB',
  'techart실험실':'Tech & Art LAB','tech&art실험실':'Tech & Art LAB',
  '테크아트실험실':'Tech & Art LAB','테크앤아트실험실':'Tech & Art LAB',
  // [2026-08] '컴퓨터실' → 'IT 공학실' 개명. 옛 이름·약칭 모두 신 이름으로 정규화해
  //   신청서 GAS 와 키 집합을 맞춘다(담당교사 매칭·캘린더 차단이 어긋나지 않도록).
  '컴퓨터':'IT 공학실','computer':'IT 공학실','컴퓨터실':'IT 공학실',
  'it공학실':'IT 공학실','it 공학실':'IT 공학실','it공학':'IT 공학실',
  // [v4.18/S8] 멀티미디어실은 컴퓨터실의 옛 이름이 아니라 별개의 독립 실습실 —
  //   기존 '멀티미디어실→컴퓨터실' 별칭 제거(두 실의 중복 예약·담당 매칭이 섞이던 문제)
  '멀티미디어':'멀티미디어실','멀티':'멀티미디어실','multimedia':'멀티미디어실',
  '코딩':'코딩실','coding':'코딩실',
  '가정':'가정실습실','가정실':'가정실습실',
  // [2026-08-22] N동 공학 Zone 약칭 8개 보강 — 신청서 LAB_ALIASES 와 키 집합을 맞춘다.
  //   누락 상태에서는 담당교사 시트가 '융합기술'·'팹랩' 같은 약칭으로 등록돼 있을 때
  //   정확 매칭에 실패해 그룹/학과 폴백으로 떨어졌다(안내 메일이 엉뚱한 곳으로 감).
  '융합':'융합기술실','융합기술':'융합기술실',
  '창의':'창의공학실','창의공학':'창의공학실',
  '공작':'공작기계실','공작기계':'공작기계실',
  'fab':'FAB Lab','fablab':'FAB Lab','fab lab':'FAB Lab','팹랩':'FAB Lab'
};
function _adm_normalizeLabName_(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  for (let i = 0; i < _ADM_CANONICAL_LABS.length; i++) {
    if (_ADM_CANONICAL_LABS[i] === s) return _ADM_CANONICAL_LABS[i];
  }
  const key = s.toLowerCase().replace(/\s+/g, '');
  for (let i = 0; i < _ADM_CANONICAL_LABS.length; i++) {
    if (_ADM_CANONICAL_LABS[i].toLowerCase().replace(/\s+/g,'') === key) return _ADM_CANONICAL_LABS[i];
  }
  const keys = Object.keys(_ADM_LAB_ALIASES);
  for (let i = 0; i < keys.length; i++) {
    if (keys[i].toLowerCase().replace(/\s+/g,'') === key) return _ADM_LAB_ALIASES[keys[i]];
  }
  return '';
}

/* ============================================================
 * [2026-08-22] 접수 중단 실험실 — 관리자 편집 경로 서버측 "쓰기" 차단
 *
 * 신청서(v3.60)는 학생 제출 경로에 허용목록 검증을 넣었지만 관리자 편집에는 없어,
 * #bulkLab 일괄 변경 · 인라인/상세 편집 · 임장일정 수정으로 개별 레코드를 접수
 * 중단된 실로 되돌릴 수 있었다(서버 4함수의 EDITABLE 에 '신청실험실' 이 있는데
 * 값 검증이 전무). 닫은 실의 승인 흐름이 되살아나는 유일한 경로였다.
 *
 * ⚠️ 화면 목록(LAB_OPTIONS·M_LAB_OPTIONS·STANDARD_LABS·<option>)과 today_lab 의
 *    지도일지 자동채움은 의도적으로 건드리지 않는다 — 목록에서 지우면 과거 기록을
 *    열 때 매칭 option 이 없어 빈 실험실로 저장된다. 조회·집계·표시·필터는 종전대로
 *    두고 "저장"만 막는다.
 * ============================================================ */
const _ADM_CLOSED_LABS = ['멀티미디어실'];

/**
 * '신청실험실' 로 저장하려는 값이 접수 중단된 실이면 throw.
 * @param {*} value 저장하려는 실험실 이름. 빈 값/undefined 는 통과(다른 검증 소관).
 * @throws {Error} 접수 중단된 실일 때
 */
function _adm_assertLabWritable_(value) {
  const raw = String(value == null ? '' : value).trim();
  if (!raw) return;
  const canon = _adm_normalizeLabName_(raw) || raw;
  if (_ADM_CLOSED_LABS.indexOf(canon) !== -1) {
    throw new Error('접수가 중단된 실험실로는 변경할 수 없습니다: ' + raw +
      ' (중단된 실: ' + _ADM_CLOSED_LABS.join(', ') + ')');
  }
}

/* ===== 메일 발송 함수 (신청서 GAS의 동명 함수와 동등 동작) ===== */

function _adm_sendStudentFirstApproveEmail_(rec, comment) {
  const email = _adm_getStudentEmail_(rec['대표자학번']);
  if (!email) return { ok: false, error: '학번 누락' };
  const e = _adm_escapeHtml_;
  const subject = '[실험실 1차 승인] ' + e(rec['대표자이름']) + '님의 신청이 1차 승인되었습니다';
  const lines = [
    e(rec['대표자이름']) + '님, 과학 실험·실습실 사용 신청이 지도교사에 의해 1차 승인되었습니다.',
    '',
    '• 신청 ID: ' + e(rec['신청ID']),
    '• 실험실: ' + e(rec['신청실험실']),
    '• 실험 날짜: ' + _adm_normalizeDateYMD_(rec['실험할날짜']),
    '• 실험·실습 주제: ' + e(rec['실험제목'] || '')
  ];
  if (comment && String(comment).trim()) lines.push('', '<b>지도교사 의견:</b> ' + e(comment));
  lines.push('', '실험실 담당교사의 최종 승인을 거쳐 확정됩니다.', '최종 승인/반려 결과는 이메일로 안내됩니다.');
  return _adm_sendMail_(email, subject, _adm_buildEmailHtml_('실험실 1차 승인 안내', lines));
}

function _adm_sendStudentRejectEmail_(rec, comment) {
  const email = _adm_getStudentEmail_(rec['대표자학번']);
  if (!email) return { ok: false, error: '학번 누락' };
  const e = _adm_escapeHtml_;
  const subject = '[실험·실습실 신청 반려] ' + e(rec['대표자이름']) + '님의 신청이 반려되었습니다';
  const lines = [
    e(rec['대표자이름']) + '님, 과학 실험·실습실 사용 신청이 지도교사에 의해 반려되었습니다.',
    '',
    '• 신청 ID: ' + e(rec['신청ID']),
    '• 실험실: ' + e(rec['신청실험실']),
    '• 실험 날짜: ' + _adm_normalizeDateYMD_(rec['실험할날짜']),
    '• 실험·실습 주제: ' + e(rec['실험제목'] || ''),
    '',
    '<b>반려 사유:</b> ' + (e(comment) || '(사유 없음)'),
    '',
    '내용을 수정하여 다시 신청해 주세요.'
  ];
  return _adm_sendMail_(email, subject, _adm_buildEmailHtml_('실험·실습실 신청 1차 반려 안내', lines));
}

function _adm_sendLabTeacherFinalEmail_(rec, appId) {
  // [MA1+MA2+MA3] 신청서 sendLabTeacherFinalEmail_ 와 동일 패턴 적용
  //   throw → return {ok:false, error} + 진단 정보(시트 등록 실험실 목록) 포함
  const labData = SpreadsheetApp.openById(LAB_TEACHER_SSID).getSheets()[0].getDataRange().getValues();
  const [labHdr, ...labRows] = labData;
  const labIdx = labHdr.findIndex(h => { const t = String(h).trim(); return t === '담당 실험실' || t === '담당실험실'; });
  const mailIdx = labHdr.findIndex(h => { const t = String(h).trim(); return t === '이메일 주소' || t === '이메일주소'; });
  if (labIdx === -1) {
    const err = 'LAB_TEACHER 시트 "담당 실험실" 열 없음 (현재 헤더: ' +
      labHdr.map(h => String(h).trim()).join(' | ') + ')';
    Logger.log('[_adm_sendLabTeacherFinalEmail_] ' + err);
    return { ok: false, error: err };
  }
  if (mailIdx === -1) {
    const err = 'LAB_TEACHER 시트 "이메일 주소" 열 없음 (현재 헤더: ' +
      labHdr.map(h => String(h).trim()).join(' | ') + ')';
    Logger.log('[_adm_sendLabTeacherFinalEmail_] ' + err);
    return { ok: false, error: err };
  }

  const labName = String(rec['신청실험실'] || '').trim();
  const wantCanon = _adm_normalizeLabName_(labName) || labName;
  const ENGINEERING_ROOMS = ['융합기술실', '창의공학실', '공작기계실', 'FAB Lab', 'Tech & Art LAB'];
  const groupCanons = [];
  if (ENGINEERING_ROOMS.indexOf(wantCanon) >= 0) groupCanons.push('공학ZONE','공학Zone','공학존');
  if (wantCanon === '코딩실') groupCanons.push('IT 공학실','컴퓨터실','IT실','IT 실험실');

  const toRow = labRows.find(r => {
    const cell = String(r[labIdx] || '').trim();
    if (!cell) return false;
    if (cell === labName) return true;
    const cellCanon = _adm_normalizeLabName_(cell) || cell;
    if (cellCanon === wantCanon) return true;
    if (groupCanons.length && groupCanons.indexOf(cell) >= 0) return true;
    if (groupCanons.length && groupCanons.indexOf(cellCanon) >= 0) return true;
    return false;
  });

  if (!toRow || !toRow[mailIdx]) {
    const registered = labRows
      .map(r => String(r[labIdx] || '').trim())
      .filter(Boolean);
    const reason = !toRow
      ? '시트에서 매칭되는 행을 찾지 못함'
      : '매칭은 되었으나 이메일 컬럼이 비어 있음';
    const detail = [
      '사유: ' + reason,
      '학생 신청 실험실: "' + labName + '" (정규화: "' + wantCanon + '")',
      groupCanons.length ? '시도한 그룹 폴백 키: ' + groupCanons.join(', ') : '그룹 폴백 키: 없음',
      '시트에 등록된 실험실: ' + (registered.length ? registered.join(', ') : '(비어있음)'),
      '조치: LAB_TEACHER 시트에 위 실험실 행을 추가하거나, 별칭/그룹명을 정확히 등록하세요.'
    ].join(' / ');
    Logger.log('[_adm_sendLabTeacherFinalEmail_] 담당교사 매칭 실패 — ' + detail);
    return { ok: false, error: detail };
  }
  const teacherEmail = String(toRow[mailIdx]).trim();

  const e = _adm_escapeHtml_;
  // ★ SEC-P3: HMAC 토큰 부착
  const _tok = _adm_genApprovalToken_(appId, 'final', teacherEmail);
  const url = getApproveBaseUrl_() + '?id=' + encodeURIComponent(appId) + '&stage=final&t=' + encodeURIComponent(_tok);
  const subject = '[실험실 최종 승인 요청] ' + e(rec['대표자학번']) + ' ' + e(rec['대표자이름']);
  const body = _adm_buildEmailHtml_('실험실 최종 승인 요청', [
    '지도교사의 1차 승인이 완료된 신청입니다. 최종 승인/반려를 처리해주세요.',
    '',
    '• 대표자: ' + e(rec['대표자이름']) + ' (' + e(rec['대표자학번']) + ')',
    '• 실험실: ' + e(rec['신청실험실']),
    '• 날짜/시간: ' + _adm_normalizeDateYMD_(rec['실험할날짜']) + ' / ' + e(rec['신청시간']),
    '• 실험·실습 주제: ' + e(rec['실험제목'] || '')
  ], url, '최종 승인 처리하기');
  return _adm_sendMail_(teacherEmail, subject, body);
}

function _adm_sendStudentFinalApproveEmail_(rec, comment) {
  const email = _adm_getStudentEmail_(rec['대표자학번']);
  if (!email) return { ok: false, error: '학번 누락' };
  const e = _adm_escapeHtml_;
  const subject = '[실험·실습실 최종 승인] ' + e(rec['대표자이름']) + '님의 실험·실습실 사용이 승인되었습니다';
  const lines = [
    e(rec['대표자이름']) + '님, 과학 실험·실습실 사용 신청이 최종 승인되었습니다.',
    '',
    '• 신청 ID: ' + e(rec['신청ID']),
    '• 실험실: ' + e(rec['신청실험실']),
    '• 실험 날짜: ' + _adm_normalizeDateYMD_(rec['실험할날짜']),
    '• 시간: ' + e(rec['신청시간']),
    '• 실험·실습 주제: ' + e(rec['실험제목'] || '')
  ];
  if (comment && String(comment).trim()) lines.push('', '<b>담당교사 의견:</b> ' + e(comment));
  lines.push('', '실험 당일 안전장구를 반드시 착용하시고, 실험·실습실 안전 수칙을 준수해 주세요.', '실험·실습실 사용 후 반드시 뒷정리를 완료해 주세요.');
  return _adm_sendMail_(email, subject, _adm_buildEmailHtml_('실험실 최종 승인 완료', lines));
}

function _adm_sendStudentFinalRejectEmail_(rec, comment) {
  const email = _adm_getStudentEmail_(rec['대표자학번']);
  if (!email) return { ok: false, error: '학번 누락' };
  const e = _adm_escapeHtml_;
  const subject = '[실험실 최종 반려] ' + e(rec['대표자이름']) + '님의 신청이 반려되었습니다';
  const lines = [
    e(rec['대표자이름']) + '님, 과학 실험·실습실 사용 신청이 담당교사에 의해 최종 반려되었습니다.',
    '',
    '• 신청 ID: ' + e(rec['신청ID']),
    '• 실험실: ' + e(rec['신청실험실']),
    '• 실험 날짜: ' + _adm_normalizeDateYMD_(rec['실험할날짜']),
    '• 실험·실습 주제: ' + e(rec['실험제목'] || ''),
    '',
    '<b>반려 사유:</b> ' + (e(comment) || '(사유 없음)'),
    '',
    '내용을 수정하여 다시 신청해 주세요.'
  ];
  return _adm_sendMail_(email, subject, _adm_buildEmailHtml_('실험실 최종 반려 안내', lines));
}

function _adm_sendTeacherFinalResultEmail_(rec, decision, comment) {
  const email = String(rec['지도교사이메일'] || '').trim();
  if (!email) return { ok: false, error: '지도교사 이메일 누락' };
  const e = _adm_escapeHtml_;
  const isApproved = decision === '승인';
  const subject = isApproved
    ? '[실험실 최종 승인 완료] ' + e(rec['대표자이름']) + ' (' + e(rec['대표자학번']) + ')'
    : '[실험실 최종 반려] ' + e(rec['대표자이름']) + ' (' + e(rec['대표자학번']) + ')';
  const lines = [
    e(rec['대표자이름']) + ' (' + e(rec['대표자학번']) + ') 학생의 실험·실습실 사용 신청이 최종 ' + (isApproved ? '승인' : '반려') + '되었습니다.',
    '',
    '• 실험실: ' + e(rec['신청실험실']),
    '• 날짜/시간: ' + _adm_normalizeDateYMD_(rec['실험할날짜']) + ' / ' + e(rec['신청시간']),
    '• 실험·실습 주제: ' + e(rec['실험제목'] || '')
  ];
  if (comment && String(comment).trim()) {
    lines.push('', '<b>' + (isApproved ? '승인 의견' : '반려 사유') + ':</b> ' + e(comment));
  } else if (!isApproved) {
    lines.push('', '<b>반려 사유:</b> (사유 없음)');
  }
  return _adm_sendMail_(email, subject, _adm_buildEmailHtml_(isApproved ? '최종 승인 완료 안내' : '최종 반려 안내', lines));
}

function _adm_sendAdminFallback_(stage, recipientLabel, reason, rec) {
  const e = _adm_escapeHtml_;
  const reasonText = Array.isArray(reason) ? reason.join(' / ') : String(reason || '');
  const lines = [
    '<b>[' + e(stage) + '] 자동 메일 발송 실패</b>',
    '시스템이 아래 대상자에게 메일을 자동 발송하지 못했습니다. 수동 처리가 필요합니다.',
    '',
    '• 대상: ' + e(recipientLabel),
    '• 실패 사유: ' + e(reasonText)
  ];
  if (rec && typeof rec === 'object') {
    lines.push('',
      '• 신청 ID: ' + e(rec['신청ID'] || ''),
      '• 대표자: ' + e(rec['대표자이름'] || '') + ' (' + e(rec['대표자학번'] || '') + ')',
      '• 실험실: ' + e(rec['신청실험실'] || ''),
      '• 날짜: ' + _adm_normalizeDateYMD_(rec['실험할날짜']) + ' / ' + e(rec['신청시간'] || ''),
      '• 실험·실습 주제: ' + e(rec['실험제목'] || '')
    );
  }
  const url = rec && rec['신청ID'] ? (getApproveBaseUrl_() + '?id=' + encodeURIComponent(rec['신청ID']) + '&stage=final') : '';
  const subject = '[수동 처리 요청] ' + stage + ' - ' + recipientLabel + ' 메일 발송 실패';
  return _adm_sendMail_(SCIENCE_EMAIL, subject, _adm_buildEmailHtml_('메일 자동 발송 실패 알림', lines, url, '최종 승인 처리하기'));
}

/* ===================================================================
 * 📨 메일 재발송 (관리자 수동) — 승인자가 자동 메일을 수신하지 못했을 때
 *   - 지도교사 1차 승인 메일 (1·2층 양식)
 *   - 최종 승인자 메일 (1·2층 → 담당교사 / 신규 양식 → 단일 승인자)
 *   메일 본문은 신청서 GAS의 sendTeacherApprovalEmail_ / sendLabTeacherFinalEmail_ /
 *   sendNewLabApproverEmail_ 과 동등하게 구성한다 (자동 메일과 동일 양식).
 * =================================================================== */

/** [재발송] 지도교사 1차 승인 요청 메일 — 신청서 측 sendTeacherApprovalEmail_ 와 동일. */
function _adm_sendTeacherApprovalEmail_(rec, appId) {
  // [v4.18/S9] 레코드에 이메일이 없으면 교사 명단 시트에서 지도교사 이름으로 조회
  const _r = _adm_resolveTeacherEmail_(rec);
  const email = _r.email;
  if (!email) {
    Logger.log('[_adm_sendTeacherApprovalEmail_] 지도교사 이메일 확정 실패 - appId: ' + appId);
    return { ok: false, error: '지도교사 이메일을 신청 기록과 교사 명단 어디에서도 찾지 못했습니다. (지도교사: ' + ((rec && rec['지도교사이름']) || '미지정') + ')' };
  }
  const e = _adm_escapeHtml_;
  // ★ SEC-P3: HMAC 토큰 부착
  const _tok = _adm_genApprovalToken_(appId, 'approve', email);
  const url = getApproveBaseUrl_() + '?id=' + encodeURIComponent(appId) + '&t=' + encodeURIComponent(_tok);
  const subject = '[실험·실습실 1차 승인 요청] ' + e(rec['대표자이름'] || '') + ' (' + e(rec['대표자학번'] || '') + ')';
  const body = _adm_buildEmailHtml_('실험·실습실 1차 승인 요청', [
    '학생이 과학 실험·실습실 사용을 신청했습니다. 확인 후 승인/반려 처리를 해주세요.',
    '',
    '• 대표자: ' + e(rec['대표자이름'] || '') + ' (' + e(rec['대표자학번'] || '') + ')',
    '• 실험실: ' + e(rec['신청실험실'] || ''),
    '• 날짜/시간: ' + _adm_normalizeDateYMD_(rec['실험할날짜']) + ' / ' + e(rec['신청시간'] || ''),
    '• 실험·실습 주제: ' + e(rec['실험제목'] || '')
  ], url, '1차 승인 처리하기');
  return _adm_sendMail_(email, subject, body);
}

/* ===== 신규 양식(IT/가정/공학) 단일 승인 메일 설정 — 신청서 GAS NEW_LAB_CONFIG 와 1:1 동등 ===== */
const _ADM_NEW_LAB_CONFIG = {
  it: {
    sheetCategory: 'IT실',
    title: 'S동 2층 IT 관련 실습실',
    labTeacherSheetKey: '컴퓨터실',
    confirmItems: [
      '직접 실습실에 가서 지도해야 하는 과정 여부 (필요 시 임장 시간 함께 기재)',
      '활동 장소 적절성 확인',
      '컴퓨터 전원 끄기·멀티탭 사용 등 전기 안전 교육 완료 여부'
    ]
  },
  home: {
    sheetCategory: '가정실습실',
    title: 'N동 가정실습실',
    labTeacherSheetKey: '가정실',
    confirmItems: [
      '직접 실습실에 가서 지도해야 하는 과정 여부 (필요 시 임장 시간 함께 기재)',
      '실습에 필요한 장비와 도구 적절성',
      '실습 장비 사용법에 대한 사전 교육 완료 여부',
      '실습 후 정리 방법에 대한 사전 교육 완료 여부'
    ]
  },
  engineering: {
    // [2026-08] Tech & Art LAB 분리 — 신청서 NEW_LAB_CONFIG 와 저장값을 맞춘다.
    sheetCategory: 'N동 공학 ZONE',
    title: 'N동 공학 ZONE',
    labTeacherSheetKey: '공학존',
    confirmItems: [
      '직접 실습실에 가서 지도해야 하는 과정 여부 (필요 시 임장 시간 함께 기재)',
      '실습에 필요한 장비와 도구 적절성',
      '실습 장비 사용법에 대한 사전 교육 완료 여부',
      '실습 후 정리 방법에 대한 사전 교육 완료 여부'
    ]
  },
  techart: {
    // [2026-08] S동 3층 Tech & Art LAB — 공학 ZONE 에서 분리된 단일 승인 양식
    sheetCategory: 'Tech & Art LAB',
    title: 'S동 3층 Tech & Art LAB',
    labTeacherSheetKey: 'Tech & Art LAB',
    confirmItems: [
      '직접 실습실에 가서 지도해야 하는 과정 여부 (필요 시 임장 시간 함께 기재)',
      '실습에 필요한 장비와 도구 적절성',
      '실습 장비 사용법에 대한 사전 교육 완료 여부',
      '실습 후 정리 방법에 대한 사전 교육 완료 여부'
    ]
  }
};

/** rec의 '양식종류' 값으로 신규 양식 카테고리 추정. 1·2층 양식이면 빈 문자열. */
function _adm_getNewLabCategory_(rec) {
  const raw = String((rec && rec['양식종류']) || '').trim();
  const mapped = SHEET_CAT_MAP_[raw];
  // [2026-08] techart 누락 시 Tech & Art LAB 신청이 단일 승인 양식으로 인식되지 않아
  //   메일 재발송·안내가 2단 승인 경로를 타던 문제 수정.
  if (mapped === 'it' || mapped === 'home' || mapped === 'engineering' || mapped === 'techart') return mapped;
  return '';
}

/** 카테고리 → 단일 승인자 메일 (LAB_TEACHER 시트의 labTeacherSheetKey 행 조회, 5분 캐싱) */
/**
 * [v4.18/S9] 지도교사 이메일 확정 — 승인 요청 메일 수신자.
 *   1순위: 신청 레코드의 '지도교사이메일'
 *   2순위: '지도교사이름' 으로 **교사 명단 시트**(TEACHER_LIST_SSID)에서 조회
 *   신청 레코드에 이메일이 비어 있거나(구 데이터), 교사가 주소를 바꾼 경우에도
 *   명단 기준으로 정확한 승인자를 찾아 재발송할 수 있게 한다.
 * @returns {{email:string, source:''|'record'|'teacher-list', name:string}}
 */
function _adm_resolveTeacherEmail_(rec) {
  const name = String((rec && rec['지도교사이름']) || '').trim();
  const recEmail = String((rec && rec['지도교사이메일']) || '').trim();
  if (recEmail) return { email: recEmail, source: 'record', name: name };
  if (!name) return { email: '', source: '', name: '' };
  try {
    const rows = SpreadsheetApp.openById(TEACHER_LIST_SSID).getSheets()[0].getDataRange().getValues();
    if (!rows.length) return { email: '', source: '', name: name };
    const hdr = rows[0].map(h => String(h || '').trim());
    let nameIdx = hdr.indexOf('교사이름');
    if (nameIdx === -1) nameIdx = hdr.indexOf('교사 이름');
    if (nameIdx === -1) nameIdx = 0;
    let mailIdx = hdr.indexOf('이메일주소');
    if (mailIdx === -1) mailIdx = hdr.indexOf('이메일 주소');
    if (mailIdx === -1) return { email: '', source: '', name: name };
    const norm = s => String(s || '').trim().replace(/\s+/g, '');
    const target = rows.slice(1).find(r => norm(r[nameIdx]) === norm(name));
    if (target) {
      const e = String(target[mailIdx] || '').trim();
      if (e) return { email: e, source: 'teacher-list', name: name };
    }
    Logger.log('[_adm_resolveTeacherEmail_] 교사 명단에서 미발견: ' + name);
  } catch (err) {
    Logger.log('[_adm_resolveTeacherEmail_] 교사 명단 조회 실패: ' + (err && err.message ? err.message : err));
  }
  return { email: '', source: '', name: name };
}

/**
 * [v4.18/S8] 실습실 담당 선생님 조회 — "참고 안내" 메일 수신자용.
 *   ※ 승인 권한은 지도교사에게 있음(2026-08 단일 승인 정책). 이 조회는 승인자를 찾는 것이
 *      아니라 "내 실습실에 신청이 들어왔다"를 알릴 대상을 찾는 용도.
 *   ※ 예전 _adm_getNewLabApproverEmail_(카테고리 대표 1명)을 대체 — IT실처럼 실별 담당이
 *      다른 경우를 표현하지 못했고, 애초에 승인자 조회 용도 자체가 폐기됨.
 *   신청서 GAS 의 getLabRoomOwnerEmails_ 와 동일 정책.
 * @param {string[]|string} rooms 실습실 이름(배열 또는 콤마 문자열)
 * @returns {Array<{room:string, email:string}>} 이메일 기준 중복 제거
 */
function _adm_getLabRoomOwnerEmails_(rooms) {
  let list = [];
  if (Array.isArray(rooms)) list = rooms.slice();
  else list = String(rooms || '').split(',');
  list = list.map(r => String(r || '').trim()).filter(Boolean);
  if (!list.length) return [];

  const out = [];
  const seen = {};
  try {
    const labData = SpreadsheetApp.openById(LAB_TEACHER_SSID).getSheets()[0].getDataRange().getValues();
    const [labHdr, ...labRows] = labData;
    const labIdx = labHdr.findIndex(h => { const t = String(h).trim(); return t === '담당 실험실' || t === '담당실험실'; });
    const mailIdx = labHdr.findIndex(h => { const t = String(h).trim(); return t === '이메일 주소' || t === '이메일주소'; });
    if (labIdx === -1 || mailIdx === -1) {
      Logger.log('[_adm_getLabRoomOwnerEmails_] 담당교사 시트 헤더 없음');
      return [];
    }
    // 그룹 한 줄 등록 폴백 — IT 그룹은 담당교사 시트에 '멀티미디어실' 한 행뿐이라
    //   컴퓨터실·코딩실 신청도 이 행으로 폴백해야 안내가 나간다. (신청서 GAS 와 동일 규칙)
    const ENGINEERING_ROOMS = ['융합기술실', '창의공학실', '공작기계실', 'FAB Lab', 'Tech & Art LAB'];
    const IT_ROOMS = ['컴퓨터실', '코딩실', '멀티미디어실'];
    const norm = s => String(s || '').trim().toLowerCase().replace(/\s+/g, '');

    list.forEach(room => {
      const wantCanon = _adm_normalizeLabName_(room) || room;
      const groupCanons = [];
      if (ENGINEERING_ROOMS.indexOf(wantCanon) >= 0) groupCanons.push('공학zone', '공학존');
      if (IT_ROOMS.indexOf(wantCanon) >= 0) groupCanons.push('컴퓨터실', '코딩실', '멀티미디어실', 'it실');

      // [2-pass] 1차: 실 이름 정확/정규화 일치 (시트 행 순서와 무관하게 정확 매칭 우선)
      let row = labRows.find(r => {
        const cell = String(r[labIdx] || '').trim();
        if (!cell) return false;
        if (cell === room) return true;
        return (_adm_normalizeLabName_(cell) || cell) === wantCanon;
      });
      // 2차: 그룹 등록명 폴백
      if (!row && groupCanons.length) {
        row = labRows.find(r => {
          const cell = String(r[labIdx] || '').trim();
          if (!cell) return false;
          const cellCanon = _adm_normalizeLabName_(cell) || cell;
          return groupCanons.indexOf(norm(cell)) >= 0 || groupCanons.indexOf(norm(cellCanon)) >= 0;
        });
      }
      if (!row) { Logger.log('[_adm_getLabRoomOwnerEmails_] 담당교사 미등록: ' + room); return; }
      const email = String(row[mailIdx] || '').trim();
      if (!email || seen[email.toLowerCase()]) return;
      seen[email.toLowerCase()] = true;
      out.push({ room: room, email: email });
    });
  } catch (e) {
    Logger.log('[_adm_getLabRoomOwnerEmails_] 시트 조회 실패: ' + (e && e.message ? e.message : e));
  }
  return out;
}

/** [재발송] 신규 양식 단일 승인자 메일 — 신청서 측 sendNewLabApproverEmail_ 와 동일. */
function _adm_sendNewLabApproverEmail_(category, rec, appId) {
  const cfg = _ADM_NEW_LAB_CONFIG[category];
  if (!cfg) return { ok: false, error: '알 수 없는 양식 카테고리: ' + category };
  // [v4.18/S8] 승인자 = 학생이 선택한 지도교사 (신청서 GAS 의 2026-08 단일 승인 정책과 일치).
  //   기존에는 실습실 담당 계정을 승인자로 조회했으나, 그 방식은 신청서 측에서 이미 폐기됨
  //   (지도교사=실담당인 경우가 많고, 담당이 2인일 때 라우팅이 애매해 지도교사로 통일).
  // [v4.18/S9] 레코드에 이메일이 없으면 **교사 명단 시트**에서 지도교사 이름으로 조회.
  const _r = _adm_resolveTeacherEmail_(rec);
  let email = _r.email;
  let usingFallback = false;
  if (!email) {
    email = SCIENCE_EMAIL;
    usingFallback = true;
  }
  const e = _adm_escapeHtml_;
  // ★ SEC-P3: HMAC 토큰 부착
  const _tok = _adm_genApprovalToken_(appId, 'final', email);
  const url = getApproveBaseUrl_() + '?id=' + encodeURIComponent(appId) + '&stage=final&t=' + encodeURIComponent(_tok);
  const labLabel = String((rec && rec['신청실험실']) || '').trim();
  const lines = [
    '학생이 ' + e(cfg.title) + ' 사용을 신청했습니다.',
    '내용을 확인한 뒤 승인 또는 반려 처리해 주세요.',
    '',
    '• 양식 종류: ' + e(cfg.sheetCategory),
    '• 대표자: ' + e(rec['대표자이름'] || '') + ' (' + e(rec['대표자학번'] || '') + ')',
    '• 신청 실습실: ' + e(labLabel),
    '• 날짜/시간: ' + _adm_normalizeDateYMD_(rec['실험할날짜']) + ' / ' + e(rec['신청시간'] || ''),
    '• 지도교사: ' + e(rec['지도교사이름'] || ''),
    '• 실험·실습 주제: ' + e(rec['실험제목'] || '')
  ];
  if (Array.isArray(cfg.confirmItems) && cfg.confirmItems.length) {
    lines.push('', '<b>📋 지도 선생님 확인 사항</b> (종이 신청서에 직접 표기해 주세요)');
    cfg.confirmItems.forEach(item => lines.push('☐ ' + e(item)));
  }
  if (usingFallback) {
    lines.push('',
      '<b>⚠ 안내:</b> 지도교사(' + e(rec['지도교사이름'] || '미지정') + ')의 이메일을 ' +
      '신청 기록과 교사 명단 어디에서도 찾지 못해 학과 메일로 폴백 발송되었습니다. ' +
      '교사 명단 시트에 해당 교사가 등록돼 있는지 확인해 주세요.'
    );
  } else if (_r.source === 'teacher-list') {
    lines.push('',
      '<b>안내:</b> 이 신청에는 지도교사 이메일이 비어 있어 <b>교사 명단</b>에서 ' +
      e(_r.name) + ' 선생님의 주소를 찾아 발송했습니다.'
    );
  }
  const subject = '[' + cfg.title + ' 사용 승인 요청] ' + e(rec['대표자이름'] || '') + ' (' + e(rec['대표자학번'] || '') + ')';
  const body = _adm_buildEmailHtml_(cfg.title + ' 사용 승인 요청', lines, url, '승인 처리하기');
  return _adm_sendMail_(email, subject, body);
}

/**
 * [신규 양식 전용] 지도교사 안내 메일 (승인 권한 없음, 정보 전달용) — 신청서 측 sendTeacherInfoEmailForNewLab_와 동일.
 *  - 단일 승인 흐름에서 지도교사가 학생 활동을 인지할 수 있도록 안내.
 *  - 메일에 승인 링크는 포함하지 않음.
 */
function _adm_sendLabOwnerInfoEmail_(category, rec, appId) {
  const cfg = _ADM_NEW_LAB_CONFIG[category];
  if (!cfg) return { ok: false, error: '알 수 없는 양식 카테고리: ' + category };

  // [v4.18/S8] 수신자 = 실습실 담당 선생님 (기존: 지도교사 — 이제 지도교사가 승인자라 중복이었음)
  const roomsRaw = String((rec && rec['사용실험실목록']) || '').trim()
                || String((rec && rec['신청실험실']) || '').trim();
  const owners = _adm_getLabRoomOwnerEmails_(roomsRaw);
  if (!owners.length) {
    Logger.log('[_adm_sendLabOwnerInfoEmail_] 담당 선생님 미등록 - appId: ' + appId + ', rooms: ' + roomsRaw);
    return { ok: false, error: '담당교사 시트에서 실습실 담당자를 찾지 못했습니다: ' + roomsRaw };
  }

  const e = _adm_escapeHtml_;
  const labLabel = roomsRaw;
  let sent = 0, lastErr = '';

  owners.forEach(o => {
    const lines = [
      '<b>본 메일은 실습실 담당 선생님 안내용</b>입니다. 승인 처리는 <b>학생이 선택한 지도교사</b>가 하므로 별도의 승인 작업은 필요하지 않습니다.',
      '담당하시는 <b>' + e(o.room) + '</b> 사용 신청이 접수되어 안내드립니다.',
      '',
      '• 양식 종류: ' + e(cfg.sheetCategory),
      '• 대표자: ' + e(rec['대표자이름'] || '') + ' (' + e(rec['대표자학번'] || '') + ')',
      '• 신청 실습실: ' + e(labLabel),
      '• 날짜/시간: ' + _adm_normalizeDateYMD_(rec['실험할날짜']) + ' / ' + e(rec['신청시간'] || ''),
      '• 지도교사: ' + e(rec['지도교사이름'] || '') + ' (승인 담당)',
      '• 실험·실습 주제: ' + e(rec['실험제목'] || '')
    ];
    if (rec['동반자명단']) lines.push('• 동반 학생: ' + e(rec['동반자명단']));
    if (rec['총인원수'])   lines.push('• 총 인원: ' + e(String(rec['총인원수'])) + '명');
    lines.push('',
      '<b>안내:</b> 승인/반려는 지도교사가 처리하며 결과는 학생에게 자동 안내됩니다. 실습실 사용에 문제가 있다면 지도교사 또는 학과(' + e(SCIENCE_EMAIL) + ')로 연락해 주세요.'
    );

    const subject = '[실습실 사용 안내] ' + e(o.room) + ' — ' + e(rec['대표자이름'] || '') + ' 학생 신청';
    const body = _adm_buildEmailHtml_('실습실 담당 선생님 안내', lines);
    const r = _adm_sendMail_(o.email, subject, body);
    if (r && r.ok) sent++;
    else lastErr = (r && r.error) || '발송 실패';
  });

  return sent > 0
    ? { ok: true, sent: sent, recipients: owners.map(o => o.email).join(', ') }
    : { ok: false, error: lastErr || '발송 실패' };
}

/**
 * ✅ 클라이언트 진입점 — 관리자 페이지에서 메일을 수동 재발송.
 * @param {string} appId  신청 ID
 * @param {string} kind   'teacher' (지도교사 1차) | 'final' (최종 승인자) | 'info' (지도교사 안내 — 단일 양식 전용)
 *   - kind='teacher': 1·2층 양식만 1차 메일. 신규 양식이면 단일 승인자에게 라우팅.
 *   - kind='final': 1·2층은 LAB_TEACHER 매칭, 신규 양식은 단일 승인자.
 *   - kind='info': 신규 양식 전용. 지도교사에게 정보 안내 메일 (승인 링크 없음).
 *                 1·2층 양식에서는 사용 불가 (지도교사가 이미 승인자라 의미 없음).
 * @returns {{ok:boolean, error?:string, recipient?:string, kind?:string, routed?:string}}
 */
function resendApprovalRequestEmail(appId, kind) {
  // ★ P0 SEC: 권한 가드 — 학과(SCIENCE_EMAIL) / ADMIN_EMAILS / 교사 시트 등록자만 호출 가능
  const _sessionEmail = String((function(){ try { return Session.getActiveUser().getEmail() || ''; } catch(_){return '';} })()).trim().toLowerCase();
  if (!_sessionEmail) {
    throw new Error('세션 정보를 가져올 수 없습니다. 로그아웃 후 다시 로그인해 주세요.');
  }
  let _allowed = false;
  // 학과 메일
  if (_sessionEmail === String(SCIENCE_EMAIL || '').toLowerCase()) _allowed = true;
  // ADMIN_EMAILS 속성
  if (!_allowed) {
    try {
      const _adminList = (PropertiesService.getScriptProperties().getProperty('ADMIN_EMAILS') || '')
        .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
      if (_adminList.indexOf(_sessionEmail) !== -1) _allowed = true;
    } catch (_) {}
  }
  // 교사 시트 등록 이메일
  if (!_allowed) {
    try {
      const _rows = SpreadsheetApp.openById(TEACHER_LIST_SSID).getSheets()[0].getDataRange().getValues();
      if (_rows.length > 1) {
        const _hdr = _rows[0];
        const _emailIdx = _hdr.indexOf('이메일주소') !== -1 ? _hdr.indexOf('이메일주소') : _hdr.indexOf('이메일 주소');
        if (_emailIdx !== -1) {
          for (let i = 1; i < _rows.length; i++) {
            if (String(_rows[i][_emailIdx] || '').trim().toLowerCase() === _sessionEmail) {
              _allowed = true; break;
            }
          }
        }
      }
    } catch (_) {}
  }
  if (!_allowed) {
    try { logAdminAction_('메일 재발송 차단', String(appId || ''), '권한 없음 - 호출자=' + _sessionEmail); } catch(_) {}
    throw new Error('메일 재발송 권한이 없습니다. 교사 또는 관리자 계정으로만 호출할 수 있습니다.');
  }

  if (!appId) return { ok: false, error: '신청 ID가 필요합니다.' };
  const k = String(kind || '').trim().toLowerCase();
  if (k !== 'teacher' && k !== 'final' && k !== 'info') {
    return { ok: false, error: '발송 종류는 teacher | final | info 이어야 합니다.' };
  }

  let rec;
  try {
    rec = getApplicationById(appId);
  } catch (e) {
    return { ok: false, error: '신청 조회 실패: ' + (e.message || e) };
  }
  if (!rec) return { ok: false, error: '신청을 찾을 수 없습니다: ' + appId };

  const newLabCat = _adm_getNewLabCategory_(rec);
  const isNewLab  = !!newLabCat;

  let result, recipientLabel, routed = '';
  try {
    if (k === 'teacher') {
      if (isNewLab) {
        // 신규 양식은 1차 단계가 없음 — 지도교사 단일 승인으로 라우팅
        result = _adm_sendNewLabApproverEmail_(newLabCat, rec, appId);
        recipientLabel = '지도교사 ' + (rec['지도교사이름'] || '') + ' <' + (_adm_resolveTeacherEmail_(rec).email || '확인 실패') + '> (단일 승인)';
        routed = 'newlab-single';
      } else {
        result = _adm_sendTeacherApprovalEmail_(rec, appId);
        recipientLabel = '지도교사 ' + (rec['지도교사이름'] || '') + ' <' + (_adm_resolveTeacherEmail_(rec).email || '확인 실패') + '>';
        routed = 'teacher';
      }
    } else if (k === 'final') {
      if (isNewLab) {
        result = _adm_sendNewLabApproverEmail_(newLabCat, rec, appId);
        recipientLabel = '지도교사 ' + (rec['지도교사이름'] || '') + ' <' + (_adm_resolveTeacherEmail_(rec).email || '확인 실패') + '> (단일 승인)';
        routed = 'newlab-single';
      } else {
        result = _adm_sendLabTeacherFinalEmail_(rec, appId);
        recipientLabel = '실험실 담당교사 (' + (rec['신청실험실'] || '') + ')';
        routed = 'lab-final';
      }
    } else { // 'info'
      if (!isNewLab) {
        return { ok: false, error: '실습실 담당 선생님 안내 메일은 단일 승인 양식(IT/가정/공학)에서만 발송합니다. 1·2층 양식은 실험실 담당교사가 최종 승인자이므로 별도 안내가 필요 없습니다.' };
      }
      // [v4.18/S8] 지도교사 안내 → 실습실 담당 선생님 안내로 전환
      //   (지도교사는 이제 승인자이므로 승인 요청 메일과 중복이었음)
      result = _adm_sendLabOwnerInfoEmail_(newLabCat, rec, appId);
      recipientLabel = '실습실 담당 선생님' + (result && result.recipients ? ' <' + result.recipients + '>' : '');
      routed = 'lab-owner-info';
    }
  } catch (e) {
    result = { ok: false, error: e && e.message ? e.message : String(e) };
    recipientLabel = (k === 'teacher' ? '지도교사' : (k === 'final' ? '최종 승인자' : '지도교사 안내'));
  }

  // 관리자 로그 — 결과를 '관리자로그' 시트에 기록 (실패해도 본 흐름은 영향 없음)
  try {
    const stageLbl = (k === 'teacher') ? '지도교사 1차'
                   : (k === 'final')   ? '최종 승인자'
                   :                     '실습실 담당 선생님 안내(단일 양식)';
    logAdminAction_(
      '메일 재발송',
      appId,
      stageLbl +
      ' / 대상: ' + recipientLabel +
      ' / 결과: ' + (result && result.ok ? '성공' : '실패 — ' + ((result && result.error) || ''))
    );
  } catch (_) {}

  return {
    ok: !!(result && result.ok),
    error: (result && result.error) || '',
    recipient: recipientLabel,
    kind: k,
    routed: routed
  };
}

/**
 * ✅ 관리자 측 승인/반려 후 자동 메일 발송 — 4개 entry 함수에서 호출.
 *  prevState/newState: { 지도승인여부: '...', 최종승인여부: '...' }
 *  변경된 필드를 감지해서 학생/담당교사/지도교사에게 적절한 메일 자동 발송.
 *  멱등성: 이미 동일 상태인 경우 발송 skip.
 */
function notifyAfterAdminAction_(appId, prevState, newState, comment) {
  if (!appId) return;
  let rec;
  try {
    rec = getApplicationById(appId);
    if (!rec) { Logger.log('[notifyAfterAdminAction_] 신청 없음: ' + appId); return; }
  } catch (e) {
    Logger.log('[notifyAfterAdminAction_] getApplicationById 에러: ' + e.message);
    return;
  }
  const prevS1 = String((prevState && prevState['지도승인여부']) || '').trim();
  const newS1  = String((newState  && newState['지도승인여부']) || '').trim();
  const prevSF = String((prevState && prevState['최종승인여부']) || '').trim();
  const newSF  = String((newState  && newState['최종승인여부']) || '').trim();

  // [P1-2] 신규 LAB(IT/가정/공학) 단일 승인 흐름 보호 — '지도승인여부' 단계 자체가 없으므로
  //   관리자가 실수로 '지도승인여부'를 변경해도 1차 승인/반려 메일을 발송하지 않는다.
  //   (정상 흐름: mapStatusToApprovals 가 신규 LAB 인지하면 '지도승인여부'='' 강제. 이 가드는 fail-safe.)
  // [2026-08] 하드코딩 목록 대신 공용 판정 함수 사용 — 양식이 추가돼도 자동 반영된다.
  //   (기존 목록엔 'N동 공학 ZONE'·'Tech & Art LAB' 이 빠져 있어 새 양식이 2단 승인으로 취급됐다)
  const isNewLab = isNewLab_(rec);

  // 1차 승인 (대기/빈값 → 승인) — 신규 LAB 은 1차 단계 자체가 없으므로 skip
  // [v4.18/S1] newSF==='승인' (대기→최종승인 점프 저장) 이면 1차 흐름 생략 —
  //   이미 최종 처리된 건에 담당교사 "최종 승인 요청" 메일이 나가고 학생이 메일 2통 받던 문제
  if (!isNewLab && prevS1 !== '승인' && newS1 === '승인' && newSF !== '승인') {
    const r1 = _adm_sendStudentFirstApproveEmail_(rec, comment);
    if (!r1.ok) {
      _adm_sendAdminFallback_('1차 승인', '학생 ' + (rec['대표자이름']||'') + ' (' + (rec['대표자학번']||'') + ')', r1.error || '알 수 없는 오류', rec);
    }
    // [MA3] _adm_sendLabTeacherFinalEmail_ 가 throw 대신 {ok:false,error} 반환으로 통일됨.
    //   기존 try-catch → 명시적 if(!r2.ok) 분기. 예상 외 예외도 대비해 감싸기는 유지.
    let labMailErr = '';
    try {
      const r2 = _adm_sendLabTeacherFinalEmail_(rec, appId);
      if (!r2.ok) labMailErr = r2.error || '발송 실패';
    } catch (e) {
      labMailErr = e && e.message ? e.message : String(e);
    }
    if (labMailErr) {
      _adm_sendAdminFallback_('최종 승인 요청', '담당교사 (' + (rec['신청실험실']||'') + ')', labMailErr, rec);
    }
  }

  // 1차 반려 — 신규 LAB 은 1차 단계 자체가 없으므로 skip
  if (!isNewLab && prevS1 !== '반려' && newS1 === '반려') {
    const r = _adm_sendStudentRejectEmail_(rec, comment);
    if (!r.ok) {
      _adm_sendAdminFallback_('1차 반려', '학생 ' + (rec['대표자이름']||'') + ' (' + (rec['대표자학번']||'') + ')', r.error || '알 수 없는 오류', rec);
    }
  }

  // 최종 승인
  if (prevSF !== '승인' && newSF === '승인') {
    const r1 = _adm_sendStudentFinalApproveEmail_(rec, comment);
    if (!r1.ok) {
      _adm_sendAdminFallback_('최종 승인', '학생 ' + (rec['대표자이름']||'') + ' (' + (rec['대표자학번']||'') + ')', r1.error || '알 수 없는 오류', rec);
    }
    const r2 = _adm_sendTeacherFinalResultEmail_(rec, '승인', comment);
    if (!r2.ok) {
      _adm_sendAdminFallback_('최종 결과 안내(지도교사)', '지도교사 ' + (rec['지도교사이름']||''), r2.error || '알 수 없는 오류', rec);
    }
  }

  // 최종 반려
  if (prevSF !== '반려' && newSF === '반려') {
    const r1 = _adm_sendStudentFinalRejectEmail_(rec, comment);
    if (!r1.ok) {
      _adm_sendAdminFallback_('최종 반려', '학생 ' + (rec['대표자이름']||'') + ' (' + (rec['대표자학번']||'') + ')', r1.error || '알 수 없는 오류', rec);
    }
    const r2 = _adm_sendTeacherFinalResultEmail_(rec, '반려', comment);
    if (!r2.ok) {
      _adm_sendAdminFallback_('최종 결과 안내(지도교사)', '지도교사 ' + (rec['지도교사이름']||''), r2.error || '알 수 없는 오류', rec);
    }
  }
}

/* ==================================================
 *  끝
 * ================================================== */