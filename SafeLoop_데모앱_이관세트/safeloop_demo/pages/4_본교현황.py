"""
대시보드 A — 본교 실시간 현황.

학교 클라우드에 저장된 점검 결과를 즉시 반영.
공공데이터 대시보드(B)와는 달리 익명화·집계 없이 식별 유지로 내부 관리용.
"""
from __future__ import annotations

import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
import streamlit as st

from modules.laws import CATEGORIES
from modules.session import ensure_state
from modules.storage import list_recent_sessions
from modules.ui import apply_theme, hero

st.set_page_config(page_title="본교 현황 · SafeLoop", page_icon="/", layout="wide")
apply_theme()
ensure_state()

school = st.session_state.get("school")
if not school:
    st.warning("학교가 선택되지 않았습니다. 점검 시작에서 학교를 선택하세요.")
    if st.button("← 점검 시작"):
        st.switch_page("pages/1_점검시작.py")
    st.stop()

hero("DASHBOARD · 내부용",
     "본교 실시간 현황",
     f"{school['학교명']} — 저장 즉시 반영 · 식별 유지 (관리자·교육청용)")

sessions = [s for s in list_recent_sessions(limit=200)
            if s["school_code"] == school["정보공시 학교코드"]]

if not sessions:
    st.info("저장된 점검이 없습니다. AI 점검 후 저장하면 이 화면에 반영됩니다.")
    st.stop()

df = pd.DataFrame(sessions)
df["timestamp_dt"] = pd.to_datetime(df["timestamp"], errors="coerce")
df = df.sort_values("timestamp_dt")

# ─────────────────────────────────────────
# 요약 카드
# ─────────────────────────────────────────
latest = df.iloc[-1]
total = len(df)
avg_score = df["score"].mean()
grade_dist = df["grade"].value_counts().to_dict()
spaces_count = df["space_type"].nunique()

c1, c2, c3, c4 = st.columns(4)
c1.metric("누적 점검 횟수", f"{total}회")
c2.metric("평균 점수", f"{avg_score:.1f}점")
c3.metric("점검된 공간 유형", f"{spaces_count}종")
c4.metric("최근 점검일", latest["timestamp"][:10] if latest["timestamp"] else "-")

# ─────────────────────────────────────────
# 점수 추이
# ─────────────────────────────────────────
st.subheader("점수 추이 (최신순)")
fig1 = px.line(
    df, x="timestamp_dt", y="score",
    color="space_type", markers=True,
    labels={"timestamp_dt": "점검 일시", "score": "안전 점수", "space_type": "공간"},
)
fig1.add_hline(y=80, line_dash="dash", line_color="#4CAF50", annotation_text="B 등급 기준")
fig1.add_hline(y=60, line_dash="dash", line_color="#FFC107", annotation_text="D 등급 기준")
fig1.update_layout(height=360, margin=dict(l=20, r=20, t=20, b=20))
st.plotly_chart(fig1, use_container_width=True)

# ─────────────────────────────────────────
# 공간 유형별
# ─────────────────────────────────────────
col_a, col_b = st.columns(2)

with col_a:
    st.subheader("공간 유형별 평균")
    space_df = df.groupby("space_type").agg(
        평균점수=("score", "mean"),
        점검횟수=("session_id", "count"),
    ).reset_index().sort_values("평균점수", ascending=True)
    fig2 = px.bar(space_df, x="평균점수", y="space_type", orientation="h",
                  text="평균점수", color="평균점수",
                  color_continuous_scale=["#D50000", "#FFC107", "#4CAF50"],
                  range_x=[0, 100])
    fig2.update_traces(texttemplate="%{text:.1f}")
    fig2.update_layout(height=320, margin=dict(l=20, r=20, t=20, b=20),
                       coloraxis_showscale=False, yaxis_title=None)
    st.plotly_chart(fig2, use_container_width=True)

with col_b:
    st.subheader("등급 분포")
    grade_df = pd.DataFrame([{"등급": g, "건수": c} for g, c in grade_dist.items()])
    fig3 = px.pie(grade_df, names="등급", values="건수",
                  color="등급",
                  color_discrete_map={"A": "#4CAF50", "B": "#8BC34A",
                                       "C": "#FFC107", "D": "#FF9800", "E": "#D50000"})
    fig3.update_layout(height=320, margin=dict(l=20, r=20, t=20, b=20))
    st.plotly_chart(fig3, use_container_width=True)

# ─────────────────────────────────────────
# 최근 세션 리스트
# ─────────────────────────────────────────
st.subheader("점검 이력")
table = df[["timestamp", "space_type", "space_nickname", "score", "grade", "session_id"]].copy()
table.columns = ["점검일시", "공간 유형", "별칭", "점수", "등급", "세션 ID"]
table = table.sort_values("점검일시", ascending=False)
st.dataframe(table, use_container_width=True, hide_index=True)

st.divider()
st.caption(
    "※ 이 페이지는 **대시보드 A — 본교 실시간 현황**입니다. "
    "공공데이터 환원 대시보드는 사이드바 **🌐 전국 대시보드**에서 확인하세요."
)
