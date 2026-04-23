"""
Stage 4 — 데이터 순환 + 정책 활용 흐름도.

[1] Sankey 다이어그램 — 학교 → 에듀파인 결재 → 교육청 → KEIIS → 공공데이터포털 → 대시보드 B
[2] 내 제출 데이터 타임라인 — 현재 진행 단계 시각화 (Mock)
[3] 정책 활용 시나리오 — 공립 재정지원 / 사립 권고 / 매칭 지원
"""
from __future__ import annotations

import datetime

import plotly.graph_objects as go
import streamlit as st

from modules.session import ensure_state
from modules.ui import apply_theme, divider, hero, section

st.set_page_config(page_title="데이터 순환 · SafeLoop", page_icon="/", layout="wide")
apply_theme()
ensure_state()

hero("STAGE 04",
     "데이터 순환 · 정책 활용",
     "기존 제도(에듀파인·KEIIS·공공데이터포털)를 존중하며 데이터 품질만 AI로 혁신합니다.")

# ─────────────────────────────────────────
# [1] Sankey 순환 구조
# ─────────────────────────────────────────
section("01", "데이터 흐름 (Sankey)")

labels = [
    "공공데이터포털 (기존)",        # 0
    "Stage 1 대시보드 B",            # 1
    "위험군 526개교",                # 2
    "학교 현장 (SafeLoop 앱)",       # 3
    "AI 맞춤 점검 결과",              # 4
    "학교 클라우드 저장",             # 5
    "에듀파인 결재",                  # 6
    "교육청 수신·검증",               # 7
    "KEIIS 업로드",                  # 8
    "익명화·집계",                    # 9
    "공공데이터포털 환원",            # 10
    "대시보드 B 고도화 (BEFORE→AFTER)", # 11
    "교육청 정책 결정",                # 12
]
sources = [0, 1, 2, 3, 4, 5, 6, 7, 7, 8, 9, 10, 11, 7]
targets = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 10, 11, 1, 12]
values = [100, 60, 60, 60, 60, 60, 60, 40, 20, 20, 20, 20, 30, 40]

fig = go.Figure(data=[go.Sankey(
    arrangement="snap",
    node=dict(
        pad=18, thickness=18, line=dict(color="#0A0A0B", width=0.6),
        label=labels,
        color=[
            "#8BC34A", "#4CAF50", "#FFC107", "#D50000", "#D50000",
            "#8E24AA", "#5C6BC0", "#29B6F6", "#26C6DA", "#66BB6A",
            "#43A047", "#2E7D32", "#1B5E20", "#FF5722",
        ],
    ),
    link=dict(source=sources, target=targets, value=values,
              color=["rgba(200,200,200,0.4)"] * len(sources))
)])
fig.update_layout(height=520, margin=dict(l=20, r=20, t=20, b=20), font=dict(size=11))
st.plotly_chart(fig, use_container_width=True)

st.caption("※ 화살표 `7 → 1` 이 순환의 핵심 — 교육청 수신 → KEIIS → 익명화 → 공공데이터 환원 → 대시보드 B 고도화 → 다시 위험군 식별에 활용.")

# ─────────────────────────────────────────
# [2] 내 제출 데이터 타임라인
# ─────────────────────────────────────────
divider()
section("02", "내 제출 데이터 여정")

saved = st.session_state.get("saved_session_id")
school = st.session_state.get("school")
if not saved:
    st.info("아직 저장된 점검 결과가 없습니다. 결과 저장·발송 페이지에서 저장 후 돌아와주세요.")
else:
    stages = [
        ("✅", "학교 클라우드 저장 완료", True, "오늘"),
        ("✅", "결재용 공문 패키지 생성", True, "오늘"),
        (
            "✅" if st.session_state.get("edufine_approved") else "◐",
            "에듀파인 결재 진행/완료",
            st.session_state.get("edufine_approved", False),
            "1~3일 소요",
        ),
        (
            "✅" if st.session_state.get("edu_app_sent") else "◯",
            "교육청 수신함 직접 전송",
            st.session_state.get("edu_app_sent", False),
            "결재 직후",
        ),
        ("◯", "교육청 검증·취합", False, "1~2주"),
        ("◯", "KEIIS 업로드 (시설 점검 통합)", False, "교육청 재량"),
        ("◯", "익명화·집계 처리", False, "자동"),
        ("◯", "공공데이터포털 등록", False, "분기"),
        ("◯", "대시보드 B 반영 (AFTER 고도화)", False, "등록 후 즉시"),
    ]

    for mark, label, done, note in stages:
        color = "#4CAF50" if done else ("#FFC107" if mark == "◐" else "#BDBDBD")
        st.markdown(
            f"<div style='padding:8px 12px;margin:4px 0;border-left:4px solid {color};"
            f"background:{'#F0F7F0' if done else '#FAFAFA'};border-radius:6px;'>"
            f"<span style='font-size:18px'>{mark}</span> "
            f"<b>{label}</b> "
            f"<span style='color:#888;font-size:12px;margin-left:8px'>· {note}</span></div>",
            unsafe_allow_html=True,
        )

    if school:
        st.caption(
            f"학교: {school.get('학교명')} · 세션 ID: `{saved}` · "
            f"조회 시각: {datetime.datetime.now():%Y-%m-%d %H:%M}"
        )

# ─────────────────────────────────────────
# [3] 정책 활용 시나리오
# ─────────────────────────────────────────
divider()
section("03", "교육청 정책 활용 시나리오")

c1, c2, c3 = st.columns(3)
with c1:
    st.markdown(
        """
        ### 공립학교
        **직접 재정 투입**
        - 지방교육재정교부금 우선 배정
        - 부재 핵심 설비 일괄 설치
        - 점검 주기 단축
        """
    )
with c2:
    st.markdown(
        """
        ### 사립학교
        **권고 + 매칭 지원**
        - 학교법인에 개선 권고
        - 매칭 지원(교부금·법인 자부담) 검토
        - 사립학교법 준수 범위 내
        """
    )
with c3:
    st.markdown(
        """
        ### 모니터링
        **반복 점검·효과 측정**
        - 개선 전/후 안전점수 비교
        - 대시보드 B의 AFTER 해상도 활용
        - 다음 분기 정책 보완
        """
    )

divider()
st.info(
    "**기존 제도 존중 원칙** — SafeLoop은 에듀파인·KEIIS·공공데이터포털을 대체하지 않습니다. "
    "법적 근거(공공데이터법 · 교육시설법 제10조 3항 · 공공데이터는 업무 부산물 개방)를 그대로 두고, "
    "학교의 업무 부산물이 더 정확하게·구조화되어 기존 경로로 흘러가도록 돕는 역할만 합니다."
)
