# SafeLoop 시연 앱 이관 세트

**작성일**: 2026-04-23
**용도**: 다른 컴퓨터(Claude Code 환경)에서 SafeLoop 시연 데모 웹앱 제작
**대회 마감**: 2026-05-31

---

## 폴더 구성

```
SafeLoop_데모앱_이관세트/
├── README_먼저읽기.md           ← 이 파일
├── docs/                        # 핵심 문서 2개
│   ├── SafeLoop_시연앱_프로그램명세서.md   ★ 작업 명세서
│   └── SafeLoop_핵심서사_지침_2026-04-23.md  ★ 프로젝트 흐름 지침
├── code/                        # 코드 1개
│   └── poc_run.py               ★ L1·L2·L3 AI 비전 파이프라인
├── data/                        # 분석 결과 CSV 8개
│   ├── master_school_data.csv
│   ├── high_risk_schools.csv
│   ├── sido_summary.csv
│   ├── cluster_summary.csv
│   ├── sensitivity_result.csv
│   ├── risk_analysis_result.csv
│   ├── school_code_mapping.csv
│   └── sigungu_agg.csv
├── sample_images/               # 시연용 샘플 사진 13장
│   ├── chemistry_lab/   (6장)
│   └── physics_lab/     (7장)
├── validation/                  # 검증 엑셀 2개
│   ├── V1_점검표비교_v3.xlsx    (메인 검증 자료)
│   └── V2_예산시나리오.xlsx     (보조 자료)
├── reference_pdfs/              # 참고 점검표 자료 4개
│   ├── 09-01.학교안전점검의날 체크리스트.xlsx (교육부 표준 2020)
│   ├── [서식 A-1-3] 안전점검의 날 체크리스트_ 자율점검표.pdf (서울)
│   ├── 2025_경기교육청_과학실안전관리계획.pdf (경기 47p)
│   └── 2025_충남교육청_안전점검표.pdf (충남)
└── env_config/                  # 환경 파일
    ├── .env                     ★ API 키 (절대 깃 커밋 금지)
    └── .gitignore_template
```

---

## 다른 컴퓨터에서 작업 시작 (3단계)

### 1단계: 폴더 통째로 이전
- USB · OneDrive · Google Drive · 클라우드 등으로 폴더 전체 복사
- 압축 후 전송도 가능 (`SafeLoop_데모앱_이관세트.zip`)

### 2단계: Claude Code 실행
이전한 컴퓨터에서:
```powershell
cd "이관세트가 있는 폴더 경로"
claude
```

### 3단계: 첫 명령어 입력
Claude Code 프롬프트에 다음 그대로 입력:

> ```
> docs/SafeLoop_시연앱_프로그램명세서.md 파일을 읽고, 그 명세대로
> SafeLoop 시연 앱(Streamlit 기반)을 만들어줘.
>
> - MVP 우선순위(섹션 6)부터 시작
> - 기존 자산은 모두 이 폴더 안에 있음:
>   - poc_run.py → code/poc_run.py
>   - 데이터 CSV → data/
>   - 샘플 사진 → sample_images/
>   - .env → env_config/.env
>   - 참고 점검표 → reference_pdfs/, validation/
> - 본 폴더 안에 safeloop_demo/ 디렉토리를 만들고 그 안에 앱 구성
> - 각 단계 완료 후 작동 확인 보고
>
> 함께 docs/SafeLoop_핵심서사_지침_2026-04-23.md도 참고하여
> 프로젝트 톤과 용어 규칙을 지켜줘.
> ```

이 한 명령으로 Claude Code가 명세서를 읽고 작업을 시작합니다.

---

## 주의사항

### 보안
- **`env_config/.env`** 파일에 API 키가 들어 있습니다
- 이 키가 노출되면 즉시 [Anthropic Console](https://console.anthropic.com)에서 revoke
- GitHub에 커밋 금지 (`.gitignore_template` 참조)
- 다른 컴퓨터로 옮긴 후, **사용 끝나면 이전 컴퓨터의 .env 파일은 안전한 위치 이동 또는 키 교체** 권장

### 학교 식별 정보
- `data/master_school_data.csv`, `high_risk_schools.csv`에 실제 학교명·주소가 있을 수 있습니다
- 시연 앱 배포 시 **반드시 익명화** (학교명 → "학교_00001" 식)
- 명세서 §9-1 참조

### API 비용
- AI 점검 1회 호출 비용 약 $0.05~0.15
- 시연 데모는 샘플 사진 캐싱 권장 (명세서 §9-2)

---

## 폴더 목록 요약

| 폴더 | 파일 수 | 크기 | 용도 |
|---|:---:|:---:|---|
| docs | 2 | 작음 | 작업 명세 + 서사 지침 |
| code | 1 | 작음 | 검증된 PoC 코드 |
| data | 8 | 중간 | 11,841개교 분석 결과 |
| sample_images | 13 | 중간 | 시연용 사진 |
| validation | 2 | 작음 | V-1·V-2 엑셀 |
| reference_pdfs | 4 | 큼 | 점검표 원본 (참고용) |
| env_config | 2 | 작음 | API 키 + gitignore |

**총 32개 파일**

---

## 작업 완료 후 (Streamlit Cloud 배포)

명세서 §8-2 참조. 요약:

1. `safeloop_demo/` 디렉토리를 GitHub 저장소에 push
2. https://share.streamlit.io 접속 → New app
3. GitHub 저장소 연결 → `app.py` 지정
4. Settings → Secrets에 `ANTHROPIC_API_KEY` 추가
5. Deploy → URL 발급 (예: `https://safeloop-demo.streamlit.app`)
6. 발급 받은 URL을 PPT 슬라이드 1과 15에 삽입 (본 세션에서 처리 가능)

---

**문의**: 본 프로젝트의 PPT·서사·검증 자료는 상위 폴더 `공공데이터 공모전 입상/`에 있음.
