"""
SafeLoop — 홈 엔트리 포인트.

공공데이터로 시작해, 공공데이터로 돌아옵니다.
"""
from __future__ import annotations

from pathlib import Path

import streamlit as st
from dotenv import load_dotenv

from modules.session import ensure_state, reset_all
from modules.ui import apply_theme, divider

load_dotenv(Path(__file__).parent / ".env")

st.set_page_config(
    page_title="SafeLoop",
    page_icon="/",
    layout="centered",
    initial_sidebar_state="collapsed",
)

apply_theme()
ensure_state()

# ─────────────────────────────────────────
# 히어로
# ─────────────────────────────────────────
st.markdown(
    """
    <div style="text-align:center; padding: 80px 0 40px 0;">
      <div style="font-size:11px; letter-spacing:0.4em; font-weight:600; color:#D50000; margin-bottom:14px; text-transform:uppercase;">SAFELOOP</div>
      <div style="font-size:42px; font-weight:800; color:#0A0A0B; letter-spacing:-0.03em; line-height:1.1; margin-bottom:14px;">
        학교 안전, 지금 바로 점검
      </div>
      <div style="font-size:15px; color:#6B6B70; letter-spacing:-0.01em;">
        공공데이터로 시작해, 공공데이터로 돌아옵니다.
      </div>
    </div>
    """,
    unsafe_allow_html=True,
)

# ─────────────────────────────────────────
# 중앙 CTA
# ─────────────────────────────────────────
col_l, col_c, col_r = st.columns([1, 2, 1])
with col_c:
    if st.button("점검하러 가기", type="primary", use_container_width=True, key="go_inspect"):
        st.switch_page("pages/1_점검시작.py")
    st.markdown(
        "<div style='text-align:center; margin-top:8px; font-size:12px; color:#9A9A9F;'>"
        "모바일·태블릿 권장 · 약 3분 소요"
        "</div>",
        unsafe_allow_html=True,
    )

# ─────────────────────────────────────────
# 운영 모드 / 역할
# ─────────────────────────────────────────
st.markdown("<div style='height:56px'></div>", unsafe_allow_html=True)
divider()

mode_c1, mode_c2 = st.columns(2)
with mode_c1:
    demo = st.toggle(
        "시연 모드",
        value=st.session_state.get("demo_mode", True),
        help="샘플 사진·자동 값 채우기를 허용합니다. 실 운영에선 꺼두세요.",
    )
    st.session_state["demo_mode"] = demo
with mode_c2:
    role = st.radio(
        "역할",
        options=["학교 담당자", "교육청 담당자"],
        index=0 if st.session_state.get("role", "학교") == "학교" else 1,
        horizontal=True,
        label_visibility="collapsed",
    )
    st.session_state["role"] = "학교" if role == "학교 담당자" else "교육청"

if st.session_state["role"] == "교육청":
    st.info("교육청 담당자 모드입니다. 아래 버튼으로 수신함을 여세요.")
    if st.button("교육청 수신함 열기", use_container_width=True):
        st.switch_page("pages/7_교육청수신함.py")

# ─────────────────────────────────────────
# 사이드바 안내
# ─────────────────────────────────────────
with st.sidebar:
    st.markdown(
        "<div style='font-size:11px; letter-spacing:0.4em; color:#D50000; font-weight:600;'>"
        "SAFELOOP</div>"
        "<div style='font-size:14px; color:#6B6B70; margin-bottom:16px;'>세이프루프</div>",
        unsafe_allow_html=True,
    )
    st.markdown("**점검 흐름**")
    st.markdown(
        "<span style='color:#6B6B70; font-size:13px;'>"
        "1. 점검 시작<br>2. AI 점검<br>3. 결과 저장·발송"
        "</span>",
        unsafe_allow_html=True,
    )
    st.markdown("**조회**")
    st.markdown(
        "<span style='color:#6B6B70; font-size:13px;'>"
        "본교 현황<br>전국 대시보드<br>데이터 순환"
        "</span>",
        unsafe_allow_html=True,
    )
    st.divider()
    if st.button("세션 초기화", use_container_width=True):
        reset_all()
        st.rerun()
