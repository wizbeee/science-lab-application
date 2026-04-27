"""
SafeLoop — 라우터 엔트리.

st.navigation 으로 역할(학교/교육청) 기반 페이지 목록을 동적 구성한다.
JS 기반 사이드바 필터링은 폐기 — Streamlit 네이티브 방식이 더 견고하다.

세션 상태의 'role' 값에 따라 사이드바에 노출되는 페이지 자체가 달라진다.
"""
from __future__ import annotations

from pathlib import Path

import streamlit as st
from dotenv import load_dotenv

from modules.session import ensure_state

load_dotenv(Path(__file__).parent / ".env")

st.set_page_config(
    page_title="SafeLoop",
    page_icon="/",
    layout="centered",
    initial_sidebar_state="auto",
)

ensure_state()
role = st.session_state.get("role", "학교")

# ─────────────────────────────────────────
# 사이드바 로고 — 모든 페이지 공통
# (st.navigation 호출 전 with st.sidebar 로 작성하면 메뉴 위에 표시됨)
# ─────────────────────────────────────────
with st.sidebar:
    st.markdown(
        """
        <div style="padding: 14px 0 14px 0; border-bottom: 1px solid #E5E5E8; margin-bottom: 6px;">
            <div style="font-size:13px; letter-spacing:0.32em; color:#D50000; font-weight:700; line-height:1.2; text-transform:uppercase;">SAFELOOP</div>
            <div style="font-size:15px; color:#0A0A0B; font-weight:500; margin-top:3px; letter-spacing:-0.01em;">세이프루프</div>
        </div>
        """,
        unsafe_allow_html=True,
    )

# ─────────────────────────────────────────
# 페이지 목록 — 역할별 구성
# ─────────────────────────────────────────
home_page = st.Page("home.py", title="홈", default=True)

if role == "학교":
    pages = [
        home_page,
        st.Page("pages/1_점검시작.py", title="점검 시작"),
        st.Page("pages/2_AI점검.py", title="AI 점검"),
        st.Page("pages/3_결과저장.py", title="결과 저장"),
        st.Page("pages/4_본교현황.py", title="본교 현황"),
        st.Page("pages/5_전국대시보드.py", title="전국 대시보드"),
        st.Page("pages/6_데이터순환.py", title="데이터 순환"),
        st.Page("pages/8_설정.py", title="설정"),
        st.Page("pages/9_프로젝트소개.py", title="프로젝트 소개"),
    ]
else:  # 교육청
    pages = [
        home_page,
        st.Page("pages/7_교육청수신함.py", title="교육청 수신함"),
        st.Page("pages/5_전국대시보드.py", title="전국 대시보드"),
        st.Page("pages/6_데이터순환.py", title="데이터 순환"),
        st.Page("pages/8_설정.py", title="설정"),
        st.Page("pages/9_프로젝트소개.py", title="프로젝트 소개"),
    ]

pg = st.navigation(pages, position="sidebar")
pg.run()
