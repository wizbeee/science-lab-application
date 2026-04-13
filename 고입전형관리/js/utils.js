// utils.js - 공통 유틸리티
const Utils = {
  // ─── 과목/학기 상수 ───
  SEMESTERS: ['2-1', '2-2', '3-1', '3-2'],
  SUBJECTS: ['국어', '도덕', '사회', '역사', '수학', '과학', '기가', '영어', '체육', '미술', '음악'],
  CONVERTED_SUBJECTS: ['국어', '수학', '과학', '영어'],
  GED_SUBJECTS: ['국어', '영어', '수학', '사회', '과학', '도덕'],
  AVERAGE_SUBJECTS: ['도덕', '사회', '역사', '기가', '음악', '미술', '체육'],

  ADMISSION_TYPES: ['일반전형', '사회통합전형', '지역우선선발'],
  RESULT_TYPES: ['합격', '불합격', '대기', '추가합격'],

  // ─── 통계 ───
  mean(arr) {
    if (!arr.length) return 0;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
  },

  median(arr) {
    if (!arr.length) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  },

  stdDev(arr) {
    if (arr.length < 2) return 0;
    const m = this.mean(arr);
    return Math.sqrt(arr.reduce((sum, v) => sum + (v - m) ** 2, 0) / (arr.length - 1));
  },

  min(arr) { return arr.length ? Math.min(...arr) : 0; },
  max(arr) { return arr.length ? Math.max(...arr) : 0; },

  percentile(arr, p) {
    if (!arr.length) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const idx = (p / 100) * (sorted.length - 1);
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
  },

  quartiles(arr) {
    return {
      q1: this.percentile(arr, 25),
      q2: this.median(arr),
      q3: this.percentile(arr, 75)
    };
  },

  // 동적 분포 범위 생성 (데이터 범위에 맞게, 최대 15~20구간)
  autoRanges(arr, step) {
    if (!arr.length) return [];
    const minVal = this.min(arr);
    const maxVal = this.max(arr);
    const span = maxVal - minVal;
    // step 자동 결정: 구간이 12~20개 되도록
    if (!step) {
      if (span <= 20) step = 1;
      else if (span <= 50) step = 2;
      else if (span <= 100) step = 5;
      else if (span <= 200) step = 10;
      else step = Math.ceil(span / 15 / 5) * 5; // 5의 배수로 반올림
    }
    const lo = Math.floor(minVal / step) * step;
    const hi = Math.ceil(maxVal / step) * step;
    const ranges = [];
    for (let i = hi - step; i >= lo; i -= step) {
      ranges.push({ label: `${i}~${i + step - 1}`, min: i, max: i + step - 0.001 });
    }
    if (ranges.length) ranges[0].max = hi + 1;
    return ranges;
  },

  // 점수 분포 (구간별 인원 수)
  distribution(arr, ranges) {
    if (!ranges) {
      // 데이터 범위에 따라 자동 결정
      if (!arr.length) return [];
      const maxVal = this.max(arr);
      if (maxVal > 110) {
        ranges = this.autoRanges(arr, 10);
      } else {
        ranges = [
          { label: '90~100', min: 90, max: 100.01 },
          { label: '80~89', min: 80, max: 89.99 },
          { label: '70~79', min: 70, max: 79.99 },
          { label: '60~69', min: 60, max: 69.99 },
          { label: '50~59', min: 50, max: 59.99 },
        { label: '50 미만', min: 0, max: 49.99 }
        ];
      }
    }
    return ranges.map(r => ({
      ...r,
      count: arr.filter(v => v >= r.min && v <= r.max).length
    }));
  },

  // ─── 포맷 ───
  formatNumber(n, decimals = 2) {
    if (n == null || isNaN(n)) return '-';
    return Number(n).toFixed(decimals);
  },

  formatDate(dateStr) {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    if (isNaN(d)) return dateStr;
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  },

  // 주민번호 마스킹 (앞 6자리만 표시)
  maskSSN(ssn) {
    if (!ssn) return '-';
    return ssn.substring(0, 6) + '-*******';
  },

  // ─── 헤더 매핑 (Excel → DB) ───
  HEADER_MAP: {
    // 기본 필드 (다양한 변형 포함)
    '접수번호': '접수번호', '수험번호': '수험번호',
    '임시반': '임시반', '임시 반': '임시반',
    '임시학번': '임시학번', '임시 학번': '임시학번',
    '리로ID': '리로ID', '리로 ID': '리로ID', '리로id': '리로ID',
    '성명(한글)': '성명', '이름': '성명', '한글성명': '성명',
    // '성명' 단독은 processRows에서 컨텍스트로 판단 (회사 성명 vs 지원자 성명)
    '주민등록번호': '주민등록번호', '주민번호': '주민등록번호',
    '생년월일': '생년월일', '생일': '생년월일',
    '성별': '성별',
    '주소': '주소', '자택주소': '주소', '현주소': '주소',
    '우편번호': '우편번호',
    '연락처(본인)': '연락처_본인', '본인연락처': '연락처_본인', '휴대폰': '연락처_본인', '핸드폰': '연락처_본인', '연락처': '연락처_본인',
    '연락처(보호자)': '연락처_보호자', '보호자연락처': '연락처_보호자', '보호자 연락처': '연락처_보호자',
    '졸업년도(예정)': '졸업년도', '졸업년도': '졸업년도', '졸업예정년도': '졸업년도',
    '출신중': '출신중', '출신중학교': '출신중', '출신 중학교': '출신중', '중학교': '출신중', '출신학교': '출신중',
    '출신학교 주소': '출신학교주소', '출신학교주소': '출신학교주소', '출신중 주소': '출신학교주소',
    '지역': '지역', '지역구분': '지역',
    '시': '시', '시군구': '시',
    '출신중 나이스 코드': '출신중나이스코드', '나이스코드': '출신중나이스코드', '출신중나이스코드': '출신중나이스코드',
    '출신중 학년 반 번호': '출신중학년반번호', '학년반번호': '출신중학년반번호', '출신중학년반번호': '출신중학년반번호',
    '최종 학력': '최종학력', '최종학력': '최종학력',
    '전형구분': '전형구분', '전형 구분': '전형구분', '전형유형': '전형구분',
    '사회통합전형 항목': '사회통합전형항목', '사회통합전형항목': '사회통합전형항목',
    '사회통합전형 세부항목': '사회통합전형세부항목', '사회통합전형세부항목': '사회통합전형세부항목',
    '사회통합전형 세부항목1': '사회통합전형세부항목1', '사회통합전형세부항목1': '사회통합전형세부항목1',
    '회사명': '회사명', '부서명': '부서명', '사원번호': '사원번호', '근무지역': '근무지역',
    '무단 결석': '무단결석', '무단결석': '무단결석',
    '무단 지각, 조퇴, 결과': '무단지각조퇴결과', '무단지각조퇴결과': '무단지각조퇴결과', '무단지각': '무단지각조퇴결과',
    '담임교사 이름': '담임교사이름', '담임교사이름': '담임교사이름', '담임교사': '담임교사이름', '담임': '담임교사이름',
    '교과성적': '교과성적', '교과 성적': '교과성적',
    '출석': '출석', '출석점수': '출석', '출석 점수': '출석',
    '1단계 최종점수': '1단계최종점수', '1단계최종점수': '1단계최종점수', '1단계점수': '1단계최종점수',
    '면접점수': '면접점수', '면접 점수': '면접점수', '면접': '면접점수',
    '감점': '감점',
    '최종점수': '최종점수', '최종 점수': '최종점수', '총점': '최종점수',
    '합불여부': '합불여부', '합격여부': '합불여부', '합불 여부': '합불여부', '합격/불합격': '합불여부',
    '도덕(평균)': '도덕평균', '사회(평균)': '사회평균', '역사(평균)': '역사평균',
    '기가(평균)': '기가평균', '음악(평균)': '음악평균', '미술(평균)': '미술평균', '체육(평균)': '체육평균'
  },

  // 성적 헤더 매핑 (학기-과목 패턴 인식, 환산점수 제외)
  parseGradeHeader(header) {
    // "2-1학기 국어" → { 학기: '2-1', 과목: '국어' }
    // 환산점수 포함된 헤더는 제외
    if (header.includes('환산점수')) return null;
    const match = header.match(/^(\d-\d)학기\s+(.+?)$/);
    if (match) return { 학기: match[1], 과목: match[2] };
    return null;
  },

  // 환산점수 헤더 매핑
  parseConvertedHeader(header) {
    // "2-1학기 국어(환산점수)" → { 학기: '2-1', 과목: '국어' }
    const match = header.match(/^(\d-\d)학기\s+(.+?)\(환산점수\)$/);
    if (match) return { 학기: match[1], 과목: match[2] };
    return null;
  },

  // 검정고시 헤더 매핑
  parseGedHeader(header) {
    // "검정고시(국어)" → '국어'
    const match = header.match(/^검정고시\((.+?)\)$/);
    if (match) return match[1];
    return null;
  },

  // ─── DOM 유틸 ───
  $(selector) { return document.querySelector(selector); },
  $$(selector) { return document.querySelectorAll(selector); },

  createElement(tag, attrs = {}, children = []) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'className') el.className = v;
      else if (k === 'textContent') el.textContent = v;
      else if (k === 'innerHTML') el.innerHTML = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
      else el.setAttribute(k, v);
    }
    for (const child of children) {
      if (typeof child === 'string') el.appendChild(document.createTextNode(child));
      else if (child) el.appendChild(child);
    }
    return el;
  },

  // ─── 색상 ───
  COLORS: [
    '#3B82F6', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6',
    '#EC4899', '#06B6D4', '#F97316', '#14B8A6', '#6366F1',
    '#84CC16', '#D946EF', '#0EA5E9', '#F43F5E', '#22C55E'
  ],

  getColor(index) {
    return this.COLORS[index % this.COLORS.length];
  },

  // ─── 정렬 ───
  sortBy(arr, key, asc = true) {
    return [...arr].sort((a, b) => {
      const va = a[key], vb = b[key];
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (typeof va === 'number' && typeof vb === 'number') return asc ? va - vb : vb - va;
      return asc ? String(va).localeCompare(String(vb), 'ko') : String(vb).localeCompare(String(va), 'ko');
    });
  },

  // ─── 현재 연도 추정 ───
  getCurrentYear() {
    return new Date().getFullYear();
  },

  // 숫자 파싱 (빈값이면 null)
  parseNum(v) {
    if (v == null || v === '') return null;
    const n = Number(v);
    return isNaN(n) ? null : n;
  }
};

window.Utils = Utils;
