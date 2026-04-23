# SafeLoop 시연 앱 — 프로그램 명세서

**작성일**: 2026-04-23
**대상 세션**: Claude Code (이 문서를 그대로 입력해 작업 시작)
**팀**: 세이프루프 (SafeLoop)
**대회**: 제8회 교육 공공데이터 AI 활용대회 (2026.05.31 마감)
**목적**: 발표·심사용 시연 데모 웹앱. 슬라이드만으로는 전달 어려운 "사진 → 점검표 자동 생성" 라이브 검증.

---

## 0. 빠른 시작 (Claude Code 첫 명령)

```bash
# 작업 디렉토리
cd "C:\Users\danie\Desktop\Claude Code\공공데이터 공모전 입상"

# 새 디렉토리 생성
mkdir safeloop_demo
cd safeloop_demo

# 본 명세서를 README로 복사
cp "../SafeLoop_시연앱_프로그램명세서.md" ./README.md
```

이 문서를 Claude Code에 통째로 붙여 넣으면 모든 구현 정보가 들어갑니다.

---

## 1. 프로젝트 개요

### 1-1. 한 문장 정체성

> **공공데이터로 시작해, 공공데이터로 돌아오는 학교 안전 순환 시스템의 시연 데모**

### 1-2. 기존 자산 (모두 활용)

상위 디렉토리(`../공공데이터 공모전 입상/`)에 이미 있는 것:

| 자산 | 위치 | 역할 |
|---|---|---|
| `poc_run.py` | 상위 폴더 | L1·L2·L3 AI 비전 파이프라인 (검증된 코드) |
| `processed_photos/`, `processed_photos_physics/` | 상위 폴더 | 화학실 6장·물리실 7장 샘플 사진 |
| `poc_logs/*.json` | 상위 폴더 | 기존 PoC 분석 결과 (재현용) |
| `master_school_data.csv` | 상위 폴더 | 11,841개교 결합 데이터 |
| `high_risk_schools.csv` | 상위 폴더 | S1 위험군 526개교 |
| `sido_summary.csv` | 상위 폴더 | 시도교육청별 집계 |
| `cluster_summary.csv` | 상위 폴더 | K-Means 클러스터 요약 |
| `sensitivity_result.csv` | 상위 폴더 | 가중치 ±20% 민감도 분석 |
| `validation/V1_점검표비교_v3.xlsx` | 상위 폴더 | 점검표 비교 데이터 |
| `.env` | 상위 폴더 | `ANTHROPIC_API_KEY=sk-ant-...` |
| `dashboard.html` | 상위 폴더 | 기존 정적 대시보드 (참고용) |

### 1-3. 시연 앱이 보여줘야 하는 것 (대회 심사 관점)

1. **Stage 1 작동**: 526개교 식별이 진짜였음 (대시보드 라이브)
2. **Stage 2 작동**: 사진 한 장 → AI가 진짜 27항목 점검표 생성 (라이브 데모)
3. **Stage 3 작동**: 점검 결과 → 안전 점수 자동 산출 (시연)
4. **Stage 4 시각화**: 데이터 순환 + 정책 활용 흐름도

---

## 2. 기술 스택 (확정)

| 영역 | 선택 | 이유 |
|---|---|---|
| Frontend | **Streamlit** | Python만으로 빠른 웹앱, Streamlit Cloud 무료 배포 |
| Backend | Python 3.10+ | poc_run.py와 동일 환경 |
| AI | **Claude Vision API** (anthropic SDK) | 검증된 L1·L2·L3 코드 재사용 |
| 데이터 | pandas, numpy | CSV 처리·집계 |
| 시각화 | **plotly** + altair | 인터랙티브 대시보드 |
| 환경 변수 | python-dotenv (개발) / st.secrets (배포) | API 키 보호 |
| 배포 | **Streamlit Community Cloud** | 무료, GitHub 연동 |

### 2-1. requirements.txt

```
streamlit>=1.30.0
pandas>=2.0.0
numpy>=1.24.0
plotly>=5.18.0
altair>=5.0.0
anthropic>=0.40.0
python-dotenv>=1.0.0
openpyxl>=3.1.0
Pillow>=10.0.0
httpx>=0.27.0
```

### 2-2. 환경 변수 (.env)

```
ANTHROPIC_API_KEY=sk-ant-api03-...
```

배포 시 Streamlit Secrets로 관리:
```toml
# .streamlit/secrets.toml (배포 시)
ANTHROPIC_API_KEY = "sk-ant-api03-..."
```

코드에서 접근:
```python
import os
try:
    import streamlit as st
    API_KEY = st.secrets.get("ANTHROPIC_API_KEY", os.environ.get("ANTHROPIC_API_KEY"))
except:
    API_KEY = os.environ.get("ANTHROPIC_API_KEY")
```

---

## 3. 디렉토리 구조 (확정)

```
safeloop_demo/
├── app.py                          # 메인 진입 페이지 (홈)
├── pages/
│   ├── 1_📊_대시보드.py             # Stage 1
│   ├── 2_📷_AI_맞춤_점검.py         # Stage 2 (핵심 시연)
│   ├── 3_📈_안전_점수.py            # Stage 3
│   ├── 4_🔁_데이터_순환.py          # Stage 4 시각화
│   └── 5_ℹ️_프로젝트_소개.py        # 팀 + 4단계 흐름
├── modules/
│   ├── __init__.py
│   ├── ai_vision.py                # L1·L2·L3 (poc_run.py 래퍼)
│   ├── score.py                    # 안전 점수 산출
│   ├── recommend.py                # AI 추천
│   ├── data_loader.py              # CSV 로드 캐싱
│   └── prompts.py                  # L1·L2·L3 시스템 프롬프트 (poc_run.py에서 추출)
├── data/                           # 상위 폴더에서 복사
│   ├── master_school_data.csv
│   ├── high_risk_schools.csv
│   ├── sido_summary.csv
│   ├── cluster_summary.csv
│   └── sensitivity_result.csv
├── sample_images/                  # 시연용 샘플
│   ├── chemistry_lab/              # processed_photos 복사
│   └── physics_lab/                # processed_photos_physics 복사
├── assets/
│   ├── logo.png                    # SafeLoop 로고 (선택)
│   └── style.css                   # 커스텀 CSS (선택)
├── .streamlit/
│   ├── config.toml                 # 테마·레이아웃
│   └── secrets.toml                # 배포 시 (gitignore)
├── .env                            # 로컬 (gitignore)
├── .gitignore
├── requirements.txt
└── README.md                       # 본 문서
```

---

## 4. 페이지 기능 명세 (5페이지)

### 4-1. `app.py` — 홈 (랜딩)

**역할**: 첫 방문자에게 프로젝트 정체성 전달

**기능**:
- 헤더: "세이프루프 (SafeLoop) — 학교 안전 순환 시스템"
- 대형 카피: "공공데이터로 시작해, 공공데이터로 돌아옵니다"
- 4단계 흐름도 (Stage 1·2·3·4 + 순환 화살표)
- 핵심 수치 3개 카드:
  - 분석 학교: 11,841개교
  - 위험군 식별: 526개교
  - AI 점검표 항목: 27개 (공간 맞춤)
- 좌측 사이드바: 5개 페이지 네비게이션
- 하단 푸터: 팀명·대회명·날짜

**Streamlit 컴포넌트**:
```python
st.set_page_config(page_title="세이프루프", page_icon="🏫", layout="wide")
st.title("세이프루프 (SafeLoop)")
st.subheader("공공데이터로 시작해, 공공데이터로 돌아옵니다")

col1, col2, col3 = st.columns(3)
col1.metric("분석 학교", "11,841개교")
col2.metric("위험군", "526개교", "S1 즉시 개입군")
col3.metric("AI 점검 항목", "27개", "공간 맞춤")
```

---

### 4-2. `pages/1_📊_대시보드.py` — Stage 1

**역할**: 11,841개교 위험도 분석 결과 라이브 시각화

**기능**:

| 섹션 | 내용 | 데이터 소스 |
|---|---|---|
| 4-2-A | 시도별 위험도 분포 (지도/막대 차트) | `sido_summary.csv` |
| 4-2-B | 학교급별 위험군 비율 | `master_school_data.csv` |
| 4-2-C | S1 위험군 526개교 명단 (페이지네이션 테이블) | `high_risk_schools.csv` (학교명 익명화 권장) |
| 4-2-D | K-Means 3 클러스터 시각화 (산점도) | `cluster_summary.csv` |
| 4-2-E | 가중치 민감도 (±20%) | `sensitivity_result.csv` |

**중요**: `high_risk_schools.csv`에 실제 학교명이 있다면 익명화 처리 필수 (학교 코드만 표시 또는 `초001`, `중024` 같은 가명)

**필터**:
- 시도교육청 선택 (드롭다운)
- 학교급 선택 (초·중·고)
- 위험 등급 (S1/S2/일반)

**시각화**:
```python
import plotly.express as px

fig = px.bar(sido_df, x='시도교육청', y='고위험_학교수',
             title='시도별 고위험 학교 분포',
             color='고위험_비율')
st.plotly_chart(fig, use_container_width=True)
```

---

### 4-3. `pages/2_📷_AI_맞춤_점검.py` — Stage 2 (★ 핵심 시연)

**역할**: 사진 업로드 → AI가 8초~1분 만에 맞춤 점검표 자동 생성. 심사위원에게 보여줄 가장 중요한 페이지.

**기능 흐름**:

```
[1] 사진 업로드 또는 샘플 선택
  ├─ Drag & Drop 영역 (사용자 사진 업로드)
  └─ 샘플 사진 갤러리 (sample_images/ 13장)
        ↓
[2] 처리 시작 버튼 (st.button)
        ↓
[3] L1 단계: 공간 분류 (Claude Vision)
  └─ 결과: 공간 유형 + 신뢰도 + 근거
  └─ st.spinner / st.progress
        ↓
[4] L2 단계: 설비 인식 (Claude Vision)
  └─ 결과: detected (15+개) / likely_absent (9+개) / ambiguous
  └─ 카테고리별 표시
        ↓
[5] L3 단계: 점검표 생성 (Claude Haiku)
  └─ 결과: 12~18 항목 맞춤 점검표 + 법령 근거
  └─ 표 형태 표시
        ↓
[6] 종합 결과 표시
  ├─ 공간 유형
  ├─ 인식된 설비 vs 누락 설비
  ├─ 자동 생성 점검표 (다운로드 버튼: PDF/CSV)
  ├─ 법령 근거 (확장 가능 expandable)
  └─ 처리 시간 (실측 표시 — 슬라이드 11 "약 8초"의 실제 검증)
```

**시연 흐름의 임팩트 포인트**:
- 처리 진행 단계마다 결과 즉시 표시 (한 번에 다 보여주지 않고)
- 처리 시간 표시 (예: "L1 7.2초 · L2 38.4초 · L3 4.1초 · 총 49.7초")
- 마지막에 "📋 자동 생성된 점검표를 학교에서 바로 사용할 수 있습니다" 메시지

**구현 코드 골격** (`modules/ai_vision.py` 호출):
```python
import streamlit as st
from modules.ai_vision import run_l1, run_l2, run_l3
import time

uploaded = st.file_uploader("화학실·물리실 사진 업로드", type=['jpg', 'jpeg', 'png'])
sample = st.selectbox("또는 샘플 선택", ["샘플 없음", "화학실 샘플 1", "물리실 샘플 1", ...])

if st.button("AI 점검표 자동 생성"):
    with st.spinner("L1 공간 분류 중..."):
        t1 = time.time()
        l1 = run_l1(image)
        t1_elapsed = time.time() - t1
    st.success(f"L1: {l1['space_type_primary']} (신뢰도 {l1['confidence']:.0%}) · {t1_elapsed:.1f}초")

    with st.spinner("L2 설비 인식 중..."):
        t2 = time.time()
        l2 = run_l2(image, l1['space_type_primary'])
        t2_elapsed = time.time() - t2
    st.success(f"L2: 설비 {len(l2['detected_equipment'])}개 인식 · {t2_elapsed:.1f}초")
    
    # L2 결과 표시 (탐지/부재/모호 카테고리별)
    
    with st.spinner("L3 맞춤 점검표 생성 중..."):
        t3 = time.time()
        l3 = run_l3(l1, l2)
        t3_elapsed = time.time() - t3
    st.success(f"L3: {len(l3['items'])}항목 점검표 · {t3_elapsed:.1f}초")
    
    # 점검표 표 형태 표시
    st.dataframe(pd.DataFrame(l3['items']))
    
    # 다운로드 버튼
    st.download_button("📥 점검표 CSV 다운로드", csv_data, "점검표.csv")
```

---

### 4-4. `pages/3_📈_안전_점수.py` — Stage 3

**역할**: 점검 결과 입력 → 안전 점수 자동 산출 (V-1 v3 지표 시연)

**기능**:

| 섹션 | 내용 |
|---|---|
| 4-4-A | 27 표준 항목 입력 폼 (각 항목 0/0.5/1 라디오 버튼) |
| 4-4-B | 가중치 자동 적용 (법령 기준, 1~10) |
| 4-4-C | 점수 자동 계산: S = Σ(wᵢ×sᵢ) / Σwᵢ × 100 |
| 4-4-D | 등급 표시 (A~E) + 색상 게이지 차트 |
| 4-4-E | 비교: AI vs 교육부 표준 (V-1 v3 결과 표시) |

**입력 단순화 옵션**:
- 빠른 시연용 "샘플 데이터로 채우기" 버튼 (모든 항목 임의 채움)
- 또는 카테고리별 일괄 설정 (비상대응 모두 양호 등)

**구현**:
```python
from modules.score import calculate_safety_score

scores = {}
for item in STANDARD_ITEMS:  # 27 항목
    cols = st.columns([3, 2])
    cols[0].write(item['name'])
    scores[item['name']] = cols[1].radio(
        "충족도", [1.0, 0.5, 0.0], 
        format_func=lambda x: {1.0: "양호", 0.5: "불량", 0.0: "부재"}[x],
        key=item['name'], horizontal=True
    )

if st.button("안전 점수 계산"):
    result = calculate_safety_score(scores)
    st.metric("안전 점수", f"{result['score']:.1f}점", result['grade'])
    
    # 게이지 차트
    fig = create_gauge(result['score'])
    st.plotly_chart(fig)
```

---

### 4-5. `pages/4_🔁_데이터_순환.py` — Stage 4 시각화

**역할**: 데이터 순환 구조 + 정책 활용 흐름을 인터랙티브 다이어그램으로

**기능**:
- 4단계 + 순환 다이어그램 (plotly Sankey 또는 mermaid)
- 각 단계 클릭 시 상세 설명 expandable
- "공공데이터 환원 → 대시보드 정교화" 시뮬레이션
  - BEFORE: 학교 단위 1개 지표
  - AFTER: 학교 × 공간 × 항목 단위 세부 점수
- "학교 안전 정책 결정에 활용" 예시 시나리오

**간단 구현**:
```python
import plotly.graph_objects as go

# Sankey 다이어그램
fig = go.Figure(data=[go.Sankey(
    node = dict(
        label = ["공공데이터", "대시보드", "위험군 526교", 
                 "AI 맞춤 점검표", "현장 점검", "데이터 수집",
                 "공공데이터 환원", "대시보드 고도화", "정책 결정"],
        color = "blue"
    ),
    link = dict(
        source = [0, 1, 2, 3, 4, 5, 6, 6],
        target = [1, 2, 3, 4, 5, 6, 1, 8],  # 6→1 순환
        value = [10, 10, 10, 10, 10, 10, 8, 8]
    )
)])

st.plotly_chart(fig, use_container_width=True)
```

---

### 4-6. `pages/5_ℹ️_프로젝트_소개.py`

**역할**: 팀·대회·기술스택·법령근거·향후계획 정리

**기능**:
- 팀명 / 대회명 / 작성일
- 4단계 + 순환 구조 다이어그램
- 차별점 3가지
- 6개 핵심 법령 매핑 표
- 확장 로드맵 (PHASE 1·2·3)
- 향후 계획 (Stage 3 실질 점검 앱, Stage 5 정책 시뮬레이터)
- GitHub / 발표 PPT 링크

---

## 5. 핵심 모듈 명세

### 5-1. `modules/ai_vision.py`

**역할**: poc_run.py의 L1·L2·L3 함수를 Streamlit에서 호출 가능하도록 래핑

**함수**:
```python
def run_l1(image_bytes: bytes) -> dict:
    """L1 공간 분류. 반환: {space_type_primary, confidence, evidence, ...}"""
    
def run_l2(image_bytes: bytes, space_type: str) -> dict:
    """L2 설비 인식. 반환: {detected_equipment, likely_absent_equipment, ambiguous_items}"""
    
def run_l3(l1_result: dict, l2_result: dict) -> dict:
    """L3 점검표 생성. 반환: {checklist_name, items, rationale}"""

def encode_image_bytes(image_bytes: bytes) -> dict:
    """Streamlit UploadedFile 또는 bytes를 Claude Vision API 형식으로 인코딩"""
```

**시스템 프롬프트는 `modules/prompts.py`에 분리** (poc_run.py에서 추출):
```python
L1_SYSTEM = """당신은 한국 중·고등학교 시설 안전 점검 전문가입니다.
주어진 공간 사진을 분석해 공간 유형을 판정합니다.
... (poc_run.py 그대로)"""

L2_SYSTEM = """당신은 학교 안전 설비 탐지 전문가입니다.
... (poc_run.py 그대로)"""

L3_SYSTEM = """당신은 학교 시설 안전 점검 체크리스트 설계 전문가입니다.
... (poc_run.py 그대로)"""
```

**모델 설정**:
```python
MODEL_VISION = "claude-opus-4-5"           # L1·L2 (poc_run.py와 동일)
MODEL_TEXT = "claude-haiku-4-5-20251001"  # L3
```

---

### 5-2. `modules/score.py`

**역할**: 안전 점수 산출 (V-1 v3 공식)

**함수**:
```python
WEIGHTS = {
    # 카테고리: 가중치 (1~10, 법령 기준)
    "비상 대응": {"비상샤워": 10, "세안기": 10, ...},
    "환기·배기": {"흄후드": 9, ...},
    # ...
}

def calculate_safety_score(item_scores: dict) -> dict:
    """
    Args:
        item_scores: {"비상샤워": 1.0, "세안기": 0.5, ...}
    Returns:
        {"score": 78.5, "grade": "C", "category_scores": {...}}
    """
    
def get_grade(score: float) -> str:
    """A(90+) / B(80+) / C(70+) / D(60+) / E"""
```

---

### 5-3. `modules/recommend.py`

**역할**: 부재 설비 → 법령 근거 추천

**함수**:
```python
LAW_BASIS = {
    "비상샤워": "교육시설 안전·유지관리기준 제47조",
    "세안기": "교육시설 안전·유지관리기준 제47조",
    "MSDS비치": "산업안전보건법 제114조",
    "흄후드": "교육시설 안전·유지관리기준 제49조",
    # ... 27 항목 전부
}

def recommend_equipment(absent_items: list, space_type: str) -> list:
    """
    Args:
        absent_items: ["비상샤워", "MSDS비치", ...]
        space_type: "화학실"
    Returns:
        [{"item": "비상샤워", "priority": "★★★", "law": "...", "reason": "..."}, ...]
    """
```

---

### 5-4. `modules/data_loader.py`

**역할**: CSV 로드 + 캐싱 + 익명화

**함수**:
```python
import streamlit as st
import pandas as pd

@st.cache_data
def load_master_data() -> pd.DataFrame:
    """11,841개교 결합 데이터 (학교명 익명화)"""
    df = pd.read_csv("data/master_school_data.csv")
    df['학교명'] = df.index.map(lambda i: f"학교_{i:05d}")  # 익명화
    return df

@st.cache_data
def load_high_risk_schools() -> pd.DataFrame:
    """S1 위험군 526개교"""
    
@st.cache_data
def load_sido_summary() -> pd.DataFrame:
    """시도별 집계"""
```

---

## 6. 개발 우선순위 (3단계)

### MVP (반드시) — 4시간

| # | 작업 | 시간 |
|:---:|---|:---:|
| 1 | 디렉토리 생성 + requirements.txt + .env 설정 | 15분 |
| 2 | `modules/ai_vision.py` (poc_run.py 래퍼) | 30분 |
| 3 | `pages/2_📷_AI_맞춤_점검.py` (★ 시연 핵심) | 1.5시간 |
| 4 | `app.py` 홈 페이지 | 30분 |
| 5 | `modules/data_loader.py` + 데이터 복사 | 30분 |
| 6 | `pages/1_📊_대시보드.py` 기본 차트 3개 | 45분 |

### Phase 1 (있으면 좋음) — 2시간

| # | 작업 | 시간 |
|:---:|---|:---:|
| 7 | `pages/3_📈_안전_점수.py` (V-1 v3 공식) | 1시간 |
| 8 | `pages/5_ℹ️_프로젝트_소개.py` | 30분 |
| 9 | 커스텀 CSS / Streamlit 테마 | 30분 |

### Phase 2 (시간 여유 시) — 1.5시간

| # | 작업 | 시간 |
|:---:|---|:---:|
| 10 | `pages/4_🔁_데이터_순환.py` (Sankey) | 45분 |
| 11 | `modules/recommend.py` 구현 + UI | 30분 |
| 12 | 점검표 PDF/Excel 다운로드 기능 | 15분 |

**총 예상**: 7.5시간 (단일 개발자, 집중 작업 기준)

---

## 7. 데이터 플로우

### 7-1. 사용자 입력 → 결과 표시 (페이지 2)

```
[사용자]
  ↓ 사진 업로드
[Streamlit UI]
  ↓ bytes
[modules/ai_vision.py]
  ↓ Claude API 호출
  ├─ L1 (Vision Opus)
  ├─ L2 (Vision Opus)
  └─ L3 (Haiku)
  ↓ JSON 반환
[Streamlit UI]
  ├─ 단계별 결과 표시
  ├─ 점검표 표 렌더
  └─ CSV/PDF 다운로드 버튼
```

### 7-2. CSV 캐싱 (페이지 1)

```
첫 방문:
  data/*.csv → pandas DataFrame → @st.cache_data
재방문:
  cache hit → 즉시 표시 (0초)
```

---

## 8. 환경 설정 + 실행

### 8-1. 로컬 개발

```bash
# 가상 환경
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# 의존성 설치
pip install -r requirements.txt

# 환경 변수 설정 (.env)
echo "ANTHROPIC_API_KEY=sk-ant-api03-..." > .env

# 데이터 복사 (한 번만)
mkdir -p data sample_images/chemistry_lab sample_images/physics_lab
cp ../master_school_data.csv data/
cp ../high_risk_schools.csv data/
cp ../sido_summary.csv data/
cp ../cluster_summary.csv data/
cp ../sensitivity_result.csv data/
cp ../processed_photos/*.jpg sample_images/chemistry_lab/
cp ../processed_photos_physics/*.jpg sample_images/physics_lab/

# 실행
streamlit run app.py
# → http://localhost:8501 접속
```

### 8-2. Streamlit Cloud 배포

```bash
# 1. GitHub 저장소 생성 (private 가능)
git init
git add .
git commit -m "SafeLoop 시연 데모 v1"
git remote add origin <repo>
git push

# 2. https://share.streamlit.io 접속
# 3. "New app" → GitHub 저장소 연결 → app.py 지정
# 4. Settings → Secrets에 ANTHROPIC_API_KEY 추가:
#    ANTHROPIC_API_KEY = "sk-ant-api03-..."
# 5. Deploy → URL 발급 (예: https://safeloop-demo.streamlit.app)
```

### 8-3. .gitignore (필수)

```
venv/
__pycache__/
*.pyc
.env
.streamlit/secrets.toml
data/master_school_data.csv  # 학교명 노출 위험 시 제외
*.log
poc_logs/
```

---

## 9. 구현 시 주의사항

### 9-1. 학교명 익명화 (필수)

`master_school_data.csv`, `high_risk_schools.csv`에 실제 학교명·주소가 있다면 **반드시 익명화**:
- 학교명 → "학교_00001", "학교_00002" 식
- 주소 → 시도 단위만 표시 (시군구 이하 제거)
- 정보공시 학교코드 → 해시 처리 또는 가명

배포 후 누구나 접근 가능하므로 개인정보·시설보안 정보 노출 절대 금지.

### 9-2. API 비용 관리

- L1+L2+L3 1회 호출 비용: 약 $0.05~0.15 (사진 6장 기준)
- 시연 데모는 **샘플 사진 캐싱** 권장:
  ```python
  @st.cache_data(ttl=86400)  # 24시간
  def cached_analyze(image_hash: str):
      return run_full_pipeline(image)
  ```
- 사용자 업로드 시에만 새 API 호출

### 9-3. Streamlit Cloud 무료 한도

- 메모리: 1GB
- 동시 사용자: ~10명
- 슬립 정책: 7일 미사용 시 자동 슬립 (재접속 시 30초 부팅)

대회 발표·심사 시점에 미리 한 번 접속해 깨워두기 권장.

### 9-4. 페이지 순서 (Streamlit 자동 정렬)

`pages/` 안의 파일은 파일명 알파벳·숫자 순으로 사이드바에 표시. 파일명 앞에 `1_`, `2_` 같은 숫자 prefix 사용:
- `1_📊_대시보드.py`
- `2_📷_AI_맞춤_점검.py`
- ...

이모지는 아이콘 효과만, 정렬은 숫자 기준.

### 9-5. 처리 시간 측정 (슬라이드 11 "약 8초" 검증)

`pages/2_📷_AI_맞춤_점검.py`에서 각 단계 처리 시간을 **반드시 측정**해서 표시:
```python
import time
t1 = time.time()
l1 = run_l1(image)
elapsed = time.time() - t1
st.metric("L1 처리 시간", f"{elapsed:.1f}초")
```

이 실측값이 슬라이드 11의 "약 8초" 표기를 정확히 교체할 근거가 됨.

### 9-6. 법령 인용 정확성

`modules/recommend.py`의 `LAW_BASIS` 딕셔너리는 **정확한 법 조항** 인용:
- "비상샤워": "교육시설 안전·유지관리기준 제47조 5항" (학교보건법 시행규칙 제3조 ❌)
- "MSDS": "산업안전보건법 제114조"
- 출처: `validation/V1_점검표비교_v3.xlsx` AI매핑_교육부 시트의 "매핑 근거" 열

### 9-7. 디자인 일관성

PPT(세이프루프 Swiss International)의 색상·톤과 일치:
- 주요 색상: `#0A0A0B` (잉크), `#D50000` (포인트 빨강), `#FFFFFF` (배경)
- 폰트: Noto Sans KR (Streamlit 기본 한글 폰트로 충분)

`.streamlit/config.toml`:
```toml
[theme]
primaryColor = "#D50000"
backgroundColor = "#FFFFFF"
secondaryBackgroundColor = "#F7F7F8"
textColor = "#0A0A0B"
font = "sans serif"
```

---

## 10. 데모 시연 시나리오 (심사 발표용)

발표자 동선:

1. **홈** (10초): "세이프루프 한 줄 소개"
2. **대시보드** (30초): "11,841개교 분석 → 526교 식별, 라이브로 보세요"
3. **AI 맞춤 점검** (90초): **★ 핵심**
   - 화학실 사진 1장 업로드 (또는 샘플 클릭)
   - "이제 약 1분 기다려주시면 AI가 자동으로 점검표를 만듭니다"
   - L1 결과 → L2 결과 → L3 점검표 순차 표시
   - "27항목 중 15개는 교육부 표준이 학교에 위임한 영역, AI가 자동 매핑"
4. **안전 점수** (30초): "이 점검표로 점검하면 자동 점수, A~E 등급"
5. **데이터 순환** (20초): "수집 데이터가 공공데이터로 환원되어 사이클 완성"
6. **마무리** (10초): "학교에서 시작해 공공 기관으로 확장 가능"

총 약 3분 30초. PPT 발표 10분 중 3-4분을 라이브 데모로 채울 수 있음.

---

## 11. 점검 체크리스트 (배포 전)

- [ ] 학교명 익명화 처리 완료
- [ ] `.env` / `secrets.toml` 깃 커밋 안 됨
- [ ] 샘플 사진 13장 업로드 정상
- [ ] AI 처리 평균 시간 측정값 있음 (슬라이드 11 교체용)
- [ ] 법령 인용 정확함 (교육시설 유지관리기준 제47조 등)
- [ ] 모바일 반응형 확인 (Streamlit 자동 처리)
- [ ] Streamlit Cloud 배포 + URL 슬라이드 1·15에 삽입
- [ ] 발표 전날 미리 접속해 슬립 깨우기

---

## 12. 향후 확장 (PoC 외 영역)

본 시연 앱은 Stage 1·2·3 일부까지. 다음은 정식 사업화 단계:

| 단계 | 작업 |
|---|---|
| 향후 1 | Stage 3 실질 점검 모바일 앱 (담당자 점검 입력) |
| 향후 2 | 데이터 자동 수집 백엔드 + DB |
| 향후 3 | 법령 RAG 구축 (국가법령정보센터 API 자동 매핑) |
| 향후 4 | Stage 4 정책 시뮬레이터 (V-2 엑셀 → 웹 도구) |
| 향후 5 | 교육청 협업 → 공공데이터 환원 경로 구축 |

---

## 부록 A. poc_run.py 핵심 부분 (참고용)

본 파일의 L1·L2·L3 시스템 프롬프트는 `modules/prompts.py`로 그대로 옮길 것:

```python
# poc_run.py에서 발췌
L1_SYSTEM = """당신은 한국 중·고등학교 시설 안전 점검 전문가입니다.
주어진 공간 사진을 분석해 공간 유형을 판정합니다.

판정 가능한 공간 유형:
- 화학실 / 물리실 / 생명과학실 / 지구과학실
- 기술실 / 가정실
- 음악실 / 미술실
- 강당 / 체육관 / 급식실
- 일반교실 / 특별교실(과목 불명)

판단 근거는 설비·집기·실험 기구 등 시각적 증거로만 제시하세요.
추측 또는 학교명·개인명 등 식별정보는 절대 사용하지 마세요.

출력은 아래 JSON 형식을 엄격히 따르세요:
{
  "space_type_primary": "공간 유형",
  "confidence": 0.0~1.0,
  "evidence": ["근거1", "근거2", ...],
  "secondary_hypothesis": "차선 후보 (없으면 null)",
  "notes": "특이사항"
}"""

# L2, L3는 poc_run.py 그대로 복사
```

---

## 부록 B. V-1 v3 27 표준 항목 (안전 점수 입력용)

`modules/score.py`에 다음 27항목과 가중치 입력:

| 카테고리 | 항목 | 가중치 (안) |
|---|---|:---:|
| 비상 대응 | 비상샤워 | 10 |
| 비상 대응 | 세안기 | 10 |
| 비상 대응 | 가스차단밸브 | 9 |
| 비상 대응 | 소화기 | 10 |
| 비상 대응 | 소화포 | 6 |
| 비상 대응 | 응급처치함 | 7 |
| 환기·배기 | 흄후드 | 9 |
| 환기·배기 | 국소배기장치 | 8 |
| 환기·배기 | 기계환기구 | 6 |
| 환기·배기 | 천장디퓨저 | 4 |
| 보관·격리 | 시약장(잠금) | 9 |
| 보관·격리 | 가스용기보관함 | 8 |
| 보관·격리 | 폐액용기 | 7 |
| 보관·격리 | 개인보호구함 | 5 |
| 감지·경보 | 화재감지기 | 10 |
| 감지·경보 | 가스누출감지기 | 10 |
| 감지·경보 | 비상벨 | 8 |
| 감지·경보 | 연기감지기 | 9 |
| 개인보호구 | 보안경 | 8 |
| 개인보호구 | 실험복 | 7 |
| 개인보호구 | 장갑 | 7 |
| 개인보호구 | 방독면 | 6 |
| 개인보호구 | 실험화 | 5 |
| 안내·표지 | MSDS비치 | 8 |
| 안내·표지 | 안전수칙게시 | 5 |
| 안내·표지 | 비상대응 포스터 | 4 |
| 안내·표지 | 가스차단 표지 | 4 |

가중치는 사용자(교사) 검토 후 조정 가능.

---

## 부록 C. 참고 자료

- **상위 SafeLoop 핵심 서사 지침**: `../SafeLoop_핵심서사_지침_2026-04-23.md`
- **PPT 본문**: `../bento/세이프루프_swiss_v2.pptx`
- **PoC 기본 코드**: `../poc_run.py`
- **검증 자료**: `../validation/V1_점검표비교_v3.xlsx`
- **샘플 사진**: `../processed_photos/`, `../processed_photos_physics/`
- **API 키**: `../.env`

---

**Claude Code 작업 시 첫 명령어**:

> "이 명세서대로 SafeLoop 시연 앱을 만들어줘. MVP 우선순위(섹션 6)부터 시작하고, 각 단계 완료 후 작동 확인 보고."

이 명령 하나로 Claude Code가 전체 구조를 파악하고 작업을 시작할 수 있습니다.
