# 스마트 바탕화면 — 설치 및 실행 가이드

## 요구 사항
- Node.js 18 이상
- npm 9 이상
- Windows 10/11 또는 macOS 12 이상

---

## 개발 환경 실행

```bash
# 1. 의존성 설치
npm install

# 2. 개발 서버 실행 (React + Electron 동시 실행)
npm start
```

---

## 빌드 (설치 파일 생성)

```bash
# Windows (.exe 설치 파일)
npm run build:win

# macOS (.dmg)
npm run build:mac

# 빌드 결과물 위치
# dist/스마트 바탕화면 Setup 1.0.0.exe  (Windows)
# dist/스마트 바탕화면-1.0.0.dmg        (macOS)
```

---

## 프로젝트 구조

```
smart-desktop/
├── src/
│   ├── main/
│   │   ├── main.js          ← Electron 메인 프로세스
│   │   └── preload.js       ← 렌더러-메인 브릿지
│   └── renderer/
│       ├── App.jsx           ← 메인 레이아웃
│       ├── AppContext.js     ← 전역 상태 관리
│       ├── index.js          ← React 진입점
│       └── components/
│           ├── Onboarding.jsx         ← 첫 실행 7단계 마법사
│           ├── SettingsPanel.jsx      ← 설정 패널 (전체 탭)
│           ├── CurrentPeriodWidget.jsx ← 지금 이 시간 + 타이머
│           ├── TimetableWidget.jsx    ← 주간 시간표 (클릭 편집)
│           └── CalendarWidget.jsx     ← 일정 (더블클릭 등록/우클릭 삭제)
├── public/
│   └── index.html
└── package.json
```

---

## 충남삼성고 기본 설정값

| 교시 | 시작 | 종료 |
|------|------|------|
| 1교시 | 08:40 | 09:30 |
| 2교시 | 09:40 | 10:30 |
| 3교시 | 10:40 | 11:30 |
| 4교시A/점심B | 11:30 | 12:30 |
| 4교시B/점심A | 12:30 | 13:30 |
| 5교시 | 13:30 | 14:20 |
| 6교시 | 14:30 | 15:20 |
| 7교시 | 15:30 | 16:20 |
| 종례 | 16:20 | 16:30 |
| ET | 16:50 | 18:10 |
| 석식 | 18:10 | 19:10 |
| EP1 | 19:20 | 20:50 |
| EP2 | 21:10 | 22:30 |

---

## 다음 구현 단계 (2단계~)

- [ ] 날씨 API 연동 (OpenWeatherMap)
- [ ] NEIS 급식 API 연동
- [ ] Google OAuth 실제 연동
- [ ] Microsoft Graph API 연동
- [ ] 커뮤니티 서버 (공지·그룹·메시지)
- [ ] 전광판 Google Sheets 연동
- [ ] AI Plus 기능 (Claude/GPT/Gemini)
- [ ] 클립보드 히스토리
- [ ] 포커스 모드 (뽀모도로)
- [ ] 스크린샷 + 메모 도구
