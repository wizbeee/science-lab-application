# 과학실험실 3개 프로그램 UI/UX 완전 재설계 계획

## Context
과학실험실 관리 시스템은 3개 프로그램(신청서, 관리자, 학생조회)으로 구성되어 있으나, 각각 독립적으로 개발되어 디자인 언어가 통일되지 않고, 사용자별 최적화가 부족함. 특히 학생용 신청서는 모바일 UX가 미흡하고, 관리자 대시보드는 필터 영역이 과밀하며, 학생 조회는 다크모드 미지원 등 일관성이 없음.

---

## Phase 1: 통합 디자인 시스템 구축 (기반)

### 새 파일 생성
- **`design_system.html`** — 3개 프로그램 공통 CSS 변수, 타이포그래피, 컴포넌트 스타일
- **`utils.html`** — 공통 JS 유틸리티 (toast, confirm, loading, focus trap, escapeHtml)

### 디자인 토큰
```
색상: --ds-primary (#4285F4), --ds-success (#34a853), --ds-danger (#ea4335), --ds-warning (#fbbc04)
배경: 3단계 (primary/secondary/tertiary) + 다크모드 대응
타이포: 'Pretendard', 'Apple SD Gothic Neo', 'Segoe UI', sans-serif
그림자: sm/md/lg 3단계, 라운딩: 6/10/16px
```

### alert() 전면 교체
- 모든 `alert()` → `showToast(msg, type)` (정보성) 또는 `showConfirmDialog()` (확인 필요)
- Toast: 화면 하단 4초 자동 소멸, 타입별 아이콘
- Confirm: Promise 기반, 포커스 트래핑, ESC 닫기

### 접근성 기본 적용
- 모든 대화상자: `role="dialog"`, `aria-modal`, `aria-labelledby`, 포커스 트래핑
- 에러 상태: 색상 + 아이콘 + 텍스트 (3중 표시)
- `aria-live="polite"` 영역으로 상태 변경 알림
- F12 차단 및 복붙 제한 **제거** (form.html ~276-287줄)

---

## Phase 2: 신청서 — 학생 중심 모바일 퍼스트

### 사용자: 학생 (주로 모바일)

### 2-1. form.html + form2f.html 통합 → `form_unified.html`
- `floorType` 파라미터로 1F/2-3F 분기 (Code.gs `doGet()`에서 주입)
- 시약 섹션: `floorType === '1F'`일 때만 렌더링
- 실험실 목록: JS config 객체로 동적 생성 (하드코딩 option 제거)
- 테마 색상: CSS 변수 `--ds-form-accent`로 Blue/Green 전환
- **약 800줄 중복 코드 제거**

### 2-2. 모바일 위저드 스텝 폼 (768px 이하)
```
① 기본정보 → ② 일정 → ③ 실험내용 → ④ 시약(1F만) → ⑤ 안전·교사 → ⑥ 확인·제출
```
- 상단 스텝 인디케이터 (완료✓ / 현재● / 미진행○)
- 스텝별 유효성 검사 후 다음 진행
- 스텝 전환 시 localStorage 자동 저장
- 데스크톱(768px+): 단일 스크롤 + 왼쪽 사이드바 진행 표시

### 2-3. 인라인 유효성 검사
- 현재: 순차 alert (첫 에러만 표시) → **변경: 모든 에러 동시 표시**
- 각 필드 아래 `<span class="ds-field-error" role="alert">` 배치
- `validateForm()` → `{fieldId, message}[]` 배열 반환
- 첫 에러 필드로 자동 스크롤 + 상단 요약 배너 "X개 항목을 확인해 주세요"

### 2-4. 확인 다이얼로그 간소화
- 현재: 4개 질문 + 각각 "아니오" 경고 팝업 → **제거**
- 변경: 위저드 마지막 "확인·제출" 스텝에서 읽기전용 요약 + 단일 체크박스
  - "위 내용을 확인했으며, 안전 수칙 위반 시 실험실 사용 제한에 동의합니다"
  - 체크 시 제출 버튼 활성화

### 2-5. 시약 테이블 모바일 카드화
- 모바일: 9열 테이블 → 카드 리스트 (시약명, 상태, 농도, 사용량, 폐기, MSDS 세로 배치)
- 데스크톱: 테이블 유지 + sticky 헤더, zebra-stripe, 넉넉한 패딩

### 2-6. 로딩 표시 개선
- 비차단 로딩 (시약DB, 교사목록, 캘린더): 상단 얇은 프로그레스 바 + 해당 영역 인라인 스피너
- 차단 로딩 (제출, 저장): 반투명 오버레이 + 중앙 스피너 카드

### 2-7. 승인 페이지 리스타일
- `approve.html`: 읽기 필드를 접힌 카드 섹션으로 그룹화 (학생정보, 일정, 실험, 안전, 시약, 교사)
- `finalApprove.html`: 동일 카드 그룹 + 디자인 시스템 적용
- 라디오 터치 타겟 44x44px 이상

### 2-8. gateway.html 접근성
- 카드에 `role="link"`, `tabindex="0"`, Enter/Space 키보드 핸들러
- `aria-label` 추가 ("1층 과학실험실 신청 - 화학, 생물 계열")

---

## Phase 3: 관리자 — 파워유저 데스크톱 최적화

### 사용자: 교사 (주로 데스크톱)

### 3-1. 필터 영역 접기/펼치기
- **접힌 상태 (기본)**: 활성 필터를 칩으로 표시 "2024-04 | 화학실험실 | 대기중 ✕"
- **펼친 상태**: 2열 그리드 (날짜범위, 실험실, 상태, 검색)
- 빠른 프리셋 칩: "오늘", "이번 주", "이번 달", "대기중만"
- "전체 초기화" 버튼

### 3-2. 정렬 간소화
- 4단계 정렬 → **2단계 최대**
- 기본: 드롭다운 1개 (날짜순/실험실별/상태별/이름순)
- 테이블 헤더 클릭 정렬 유지 (화살표 표시)

### 3-3. 결과 건수 + 페이지네이션
- 테이블 위: "총 142건 (필터 적용: 38건)" 표시
- 500건 초과 시 서버사이드 페이지네이션 + "더 보기" 버튼
- 로딩 중 스켈레톤 행 표시

### 3-4. 인라인 편집 강화
- 편집된 셀: 왼쪽 amber 보더 하이라이트
- 하단 스티키 바: "3건 변경됨 [저장] [취소]"
- `beforeunload` 미저장 변경 경고
- 기존 Ctrl+S 단축키 유지

### 3-5. 통계 API 통합
- `getApplicationsWithStats()` → 단일 `getAdminData()` 호출 (이중 API 제거)
- stat 카드 클릭 → 해당 상태 필터 즉시 적용

### 3-6. 중복 파일 통합
- `common_list.*` + `chemical_list.*` → 단일 템플릿 (카테고리 파라미터)
- `common_styles.html` → `design_system.html` 통합

### 3-7. 전역 변수 네임스페이싱
```javascript
const AdminApp = {
  state: { records: [], filters: {}, sort: {}, editQueue: new Map() },
  api: { fetchRecords, saveChanges, getStats },
  ui: { renderTable, updateFilters, showToast },
  init() { ... }
};
```

---

## Phase 4: 학생 조회 — 상태 확인 특화 모바일

### 사용자: 학생 (주로 모바일)

### 4-1. 다크모드 지원
- `design_system.html` 적용으로 자동 획득
- `prefers-color-scheme` 미디어쿼리 기본 반영
- 토글 버튼 헤더에 추가

### 4-2. 모바일 상태 카드 뷰 (기본)
- 테이블 대신 **상태 카드** (실험실, 날짜, 시간, 실험제목, 상태 배지)
- 3단계 스테퍼 → 인라인 축약 표시 (●—●—○)
- 카드 탭 → 아코디언 확장 (상세 인라인 표시)
- 기존 2회 순차 API → 단일 `getApplicationDetail(appId)` 통합

### 4-3. 서버 페이지네이션 활성화
- 기존 미사용 `getRecordsPage()` 연결
- 초기 20건 로드 + "더 보기" 버튼
- 클라이언트 필터는 로드된 데이터에 적용

### 4-4. 캘린더 이벤트 위임
- 셀별 addEventListener → 컨테이너 단일 리스너 + `event.target.closest()`

### 4-5. 디자인 통일
- `design_system.html` 적용으로 색상/타이포/컴포넌트 3개 프로그램 일관성 확보

---

## 구현 우선순위 (영향도 × 난이도)

| 순서 | 작업 | 영향 | 난이도 | 대상 |
|------|------|------|--------|------|
| 1 | design_system.html + utils.html 생성 | ★★★★★ | 중 | 전체 |
| 2 | alert→toast 교체 + F12 차단 제거 | ★★★★ | 하 | 신청서 |
| 3 | form.html + form2f.html 통합 | ★★★★★ | 상 | 신청서 |
| 4 | 인라인 유효성 검사 | ★★★★ | 중 | 신청서 |
| 5 | 위저드 스텝 폼 (모바일) | ★★★★★ | 상 | 신청서 |
| 6 | 필터 접기/정렬 간소화 | ★★★★ | 중 | 관리자 |
| 7 | 학생조회 다크모드 + 카드뷰 | ★★★ | 중 | 학생조회 |
| 8 | 시약 테이블 모바일 카드 | ★★★ | 중 | 신청서 |
| 9 | 관리자 중복파일 통합 | ★★★ | 중 | 관리자 |
| 10 | 서버 페이지네이션 활성화 | ★★ | 하 | 학생조회 |

---

## 핵심 수정 파일

### 신청서 (`science-lab-application`)
- `과학실험실 신청서/Code.gs` — 라우팅, 템플릿 변수 주입
- `과학실험실 신청서/form.html` → `form_unified.html`로 대체
- `과학실험실 신청서/form2f.html` → 삭제 (통합 후)
- `과학실험실 신청서/gateway.html` — 접근성 개선
- `과학실험실 신청서/approve.html` — 카드 그룹화 리스타일
- `과학실험실 신청서/finalApprove.html` — 디자인 시스템 적용

### 관리자 (`significant-figures-game` 브랜치)
- `관리자 프로그램/admin_head.html` — 필터/정렬 CSS
- `관리자 프로그램/admin_body.html` — 필터 칩, 결과 건수
- `관리자 프로그램/admin_scripts.html` — 네임스페이싱, API 통합
- `관리자 프로그램/common_styles.html` → design_system 통합
- `관리자 프로그램/chemical_list*` + `common_list*` → 통합

### 학생조회 (`significant-figures-game` 브랜치)
- `학생 조회 프로그램/index.html` — 다크모드, 카드뷰, 페이지네이션
- `학생 조회 프로그램/Code.gs` — 통합 상세 API

### 신규 생성
- `design_system.html` — 공통 CSS 변수 + 컴포넌트
- `utils.html` — 공통 JS 유틸리티

---

## 검증 방법
1. Google Apps Script에서 각 프로그램 배포 후 모바일/데스크톱 브라우저 테스트
2. 신청서: 1F/2-3F 양쪽 폼 제출 → 승인 → 최종승인 전체 흐름 확인
3. 관리자: 필터/정렬/인라인 편집/저장 동작 확인
4. 학생조회: 조회/필터/캘린더/PDF 생성 확인
5. 접근성: 키보드만으로 전체 워크플로우 완료 가능 여부
6. 다크모드: 관리자 + 학생조회 전체 페이지 확인
