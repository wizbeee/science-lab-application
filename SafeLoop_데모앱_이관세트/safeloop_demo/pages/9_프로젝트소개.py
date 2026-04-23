"""
프로젝트 소개 — 팀·대회·법령·기술스택·로드맵.
"""
from __future__ import annotations

import pandas as pd
import streamlit as st

from modules.laws import CORE_LAWS, LAW_BASIS
from modules.session import ensure_state
from modules.ui import apply_theme, divider, hero, section

st.set_page_config(page_title="프로젝트 소개 · SafeLoop", page_icon="/", layout="wide")
apply_theme()
ensure_state()

hero("ABOUT", "세이프루프 (SafeLoop)",
     "공공데이터로 시작해, 공공데이터로 돌아옵니다. 학교 안전의 순환 구조.")

st.markdown(
    "<div class='sl-card sl-card-accent' style='margin-bottom:20px;'>"
    "공공데이터로 학교 안전도를 평가하고, AI 맞춤 점검으로 신뢰할 만한 데이터를 수집해, "
    "그 데이터가 다시 공공데이터로 환원되어 대시보드를 더 정교하게 만드는 <b>순환 구조</b>."
    "</div>",
    unsafe_allow_html=True,
)

# 팀 / 대회
c1, c2, c3 = st.columns(3)
with c1:
    st.metric("팀명", "세이프루프 SafeLoop")
with c2:
    st.metric("대회", "제8회 교육 공공데이터 AI 활용대회")
with c3:
    st.metric("마감", "2026-05-31")

divider()

# 4단계 + 순환
section("01", "4단계 + 순환 구조")
st.markdown(
    """
    | Stage | 내용 | 역할 |
    |:---:|---|---|
    | **Stage 1** | 전국 위험도 분석 (11,841개교 → 526개교 식별) | 진단 |
    | **Stage 2** | AI 맞춤 점검표 자동 생성 (3단계 AI 비전) | 정밀 점검 도구 |
    | **Stage 3** | 실질 점검 + 안전 점수 + 데이터 수집 | 데이터 축적 |
    | **Stage 4** | 에듀파인 결재 → KEIIS → 공공데이터 환원 → 정책 활용 | 의사결정 지원 |
    | **순환** | Stage 4 환원 → Stage 1 정교화 (자가 개선) | 시스템 진화 |
    """
)

divider()

# 차별점
section("02", "차별점 3가지")
cc1, cc2, cc3 = st.columns(3)
with cc1:
    st.markdown("### 1. 공간 맞춤 점검표\n일률 점검표 → **공간별 법령에 부합하는 맞춤표**를 AI가 자동 설계. 담당자의 다중 법령 매핑 부담 제거.")
with cc2:
    st.markdown("### 2. 데이터 순환\n단발 분석 → **환원 피드백 루프**. 점검 결과가 KEIIS·공공데이터포털로 흐르며 대시보드 자체가 진화.")
with cc3:
    st.markdown("### 3. 기존 제도 존중\n에듀파인·KEIIS·공공데이터포털을 **대체하지 않고 가교**. 결재라인·법적 효력 유지, 품질만 AI로 혁신.")

divider()

# 법령 근거
section("03", "6개 핵심 법령")
st.caption("AI 점검표의 모든 항목은 아래 법령의 구체 조항에 매핑되어 출력됩니다.")
for law in CORE_LAWS:
    st.markdown(f"- **{law}**")

with st.expander("27 표준 항목 × 법령 매핑"):
    rows = []
    for name, info in LAW_BASIS.items():
        rows.append({
            "항목": name,
            "카테고리": info["category"],
            "가중치": info["weight"],
            "법령": info["law"],
            "조항": info["article"],
            "비고": info["note"],
        })
    st.dataframe(pd.DataFrame(rows), use_container_width=True, hide_index=True)

divider()

# 데이터 흐름 (제도 관점)
section("04", "제도 관점 데이터 흐름")
st.markdown(
    """
    | 단계 | 시스템 | 역할 |
    |:---:|---|---|
    | 1 | 학교 점검 앱 (SafeLoop) | 현장 점검·AI 맞춤 점검표·이중 저장 |
    | 2 | 에듀파인 / K-에듀파인 | 내부 결재라인 (담당자→부장→교감→교장) |
    | 3 | 교육청 담당자 모듈 | 결재 완료 데이터 수신·검증 (옵션 2) |
    | 4 | **교육시설통합정보망 (KEIIS)** | 교육시설법 제10조 3항 자체 점검 결과 집적 (2024 개통) |
    | 5 | 공공데이터포털 | 익명화·집계 후 2차 개방 (업무 부산물 개방 원칙) |
    | 6 | 대시보드 B (SafeLoop) | 환원 데이터로 Stage 1 고도화 → 순환 완성 |
    """
)

divider()

# 확장 로드맵
section("05", "확장 로드맵")
st.markdown(
    """
    | 단계 | 내용 | 시기 |
    |:---:|---|:---:|
    | MVP | 앱 · 에듀파인 패키지 · Mock 수신함 | 2026 상반기 |
    | Phase 2 | 교육청 수신 모듈 실제 운영 · 결재 증빙 자동 파싱 | 6~12개월 |
    | Phase 3 | KEIIS API 직접 연동 · 공공데이터포털 자동 등록 | 1~3년 |
    | 확장 1 | 학교 → 도서관 · 복지관 · 공공 문화·체육 시설 일반화 | 중기 |
    | 확장 2 | 법령 RAG(국가법령정보센터 API) 구축 — 맞춤 점검표 범위 자동 확장 | 중장기 |
    """
)

divider()

# 기술 스택
section("06", "기술 스택")
c_a, c_b, c_c = st.columns(3)
with c_a:
    st.markdown("**Frontend**\n- Streamlit\n- Plotly · Altair")
with c_b:
    st.markdown("**AI**\n- Claude Opus 4.5 (Vision 단계 1·2)\n- Claude Haiku 4.5 (단계 3)")
with c_c:
    st.markdown("**Backend · 데이터**\n- Python 3.10+\n- pandas · ReportLab · openpyxl")

divider()
st.caption("© 2026 세이프루프 · 제8회 교육 공공데이터 AI 활용대회")
