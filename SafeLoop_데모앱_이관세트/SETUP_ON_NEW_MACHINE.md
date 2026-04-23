# SafeLoop — 다른 컴퓨터에서 이어 작업하기

## 0) 요구사항
- Python 3.10 이상 (권장 3.11~3.14)
- Git
- Anthropic API 키 (기본) 또는 OpenAI API 키 (선택)

## 1) 클론
```bash
git clone https://github.com/wizbeee/science-lab-application.git
cd science-lab-application
git checkout feat/safeloop-demo
```

## 2) 의존성 설치
```bash
cd "SafeLoop_데모앱_이관세트/safeloop_demo"

# (권장) 가상환경
python -m venv venv
# Windows
venv\Scripts\activate
# macOS/Linux
source venv/bin/activate

pip install -r requirements.txt
```

## 3) API 키 설정
**이전 컴퓨터의 `.env`는 커밋되지 않습니다 (보안 정책).** 새 컴퓨터에선 `.env`를 직접 만들어 주세요.

`safeloop_demo/.env` 파일 생성:
```
ANTHROPIC_API_KEY=sk-ant-api03-...
# 선택 (OpenAI 사용 시)
OPENAI_API_KEY=sk-...
```

또는 앱 실행 후 **설정 페이지 → AI 공급자** 섹션에서 키를 입력해도 됩니다 (세션 전용, 재시작 시 재입력).

## 4) 실행
```bash
python -m streamlit run app.py
# 브라우저: http://localhost:8501
```

## 5) iPhone/iPad 테스트 (HTTPS 필요)
iOS Safari는 HTTPS에서만 카메라·GPS를 허용합니다. 아래 중 하나:

### A. ngrok (가장 간단)
```bash
# 별도 터미널
ngrok http 8501
# 출력된 https://xxx.ngrok-free.app 을 iPhone에서 열기
```

### B. Cloudflare Tunnel (무료)
```bash
cloudflared tunnel --url http://localhost:8501
```

### C. Streamlit Cloud 배포
GitHub 저장소 연결 → 무료 HTTPS URL 발급 → Settings → Secrets에 `ANTHROPIC_API_KEY` 추가.

## 6) 디렉토리 구조
```
SafeLoop_데모앱_이관세트/
├── README_먼저읽기.md
├── SETUP_ON_NEW_MACHINE.md     ← 이 문서
├── .gitignore                   ← 민감 파일 차단
├── docs/                        ← 명세서·핵심서사
├── code/poc_run.py              ← 원본 AI 파이프라인
├── data/                        ← 분석 CSV 8개
├── sample_images/               ← 샘플 사진 13장
├── reference_pdfs/              ← 참고 점검표
├── validation/                  ← 검증 엑셀
├── env_config/                  ← 템플릿 (.env 는 미포함)
└── safeloop_demo/               ← 🚀 실행 앱
    ├── app.py
    ├── modules/                 ← 공용 모듈 9개
    ├── pages/                   ← 9개 페이지
    ├── data/                    ← 공공데이터 CSV
    ├── sample_images/           ← 시연 사진
    ├── requirements.txt
    └── .streamlit/config.toml
```

## 7) 커밋되지 않는 런타임 데이터
보안·용량 이유로 아래는 `.gitignore` 처리:
- `safeloop_demo/school_storage/` — 학교 클라우드 저장소 (점검 결과)
- `safeloop_demo/mock_edu_receipt/` — 교육청 수신함 Mock
- `_ai_cache/` — AI 응답 캐시

모든 폴더는 **앱 실행 시 자동 생성**됩니다.

## 8) 브랜치 작업 규칙
- `master` — 안정 버전
- `feat/safeloop-demo` — SafeLoop 개발 브랜치 (현재)
- 기타 `feat/…` — 다른 기능 브랜치

**주의**: 기존 `feat/code-stability-improvements` 브랜치에는 다른 프로젝트(significant-figures-game) 작업이 함께 있으니 섞지 마세요.

## 9) 문제 해결

| 증상 | 해결 |
|---|---|
| `ANTHROPIC_API_KEY not set` | `.env` 파일 확인 or 설정 페이지에서 키 입력 |
| iPhone에서 카메라 안 됨 | HTTPS 터널(ngrok 등) 사용 |
| `port 8501 is not available` | `--server.port=8502` 로 변경 |
| Korean PDF 깨짐 | Windows=기본 내장, Mac/Linux는 `pip install nanum-font` 또는 시스템 폰트 설치 |
| `ImportError: openai` | `pip install openai>=1.40.0` (requirements에 포함됨) |
