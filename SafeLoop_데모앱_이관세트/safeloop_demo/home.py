"""
홈 페이지 — 역할 토글 + 메인 CTA.

라우팅은 app.py 의 st.navigation 이 담당하며, 이 파일은 홈에서 보일 본문이다.
역할 변경 시 즉시 rerun → app.py 가 새 역할 기반으로 페이지 목록을 재구성.
"""
from __future__ import annotations

import streamlit as st

from modules.session import ensure_state
from modules.ui import apply_theme

apply_theme()
ensure_state()

# ─────────────────────────────────────────
# 히어로
# ─────────────────────────────────────────
st.markdown(
    """
    <div style="text-align:center; padding: 60px 0 32px 0;">
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
# 운영 모드 / 역할 — CTA보다 먼저 묻는다 (역할이 CTA를 결정)
# ─────────────────────────────────────────
mode_c1, mode_c2 = st.columns(2)
with mode_c1:
    demo = st.toggle(
        "시연 모드",
        value=st.session_state.get("demo_mode", True),
        help="샘플 사진·자동 값 채우기를 허용합니다. 실 운영에선 꺼두세요.",
        key="home_demo_toggle",
    )
    st.session_state["demo_mode"] = demo
with mode_c2:
    role = st.radio(
        "역할",
        options=["학교 담당자", "교육청 담당자"],
        index=0 if st.session_state.get("role", "학교") == "학교" else 1,
        horizontal=True,
        label_visibility="collapsed",
        key="home_role_radio",
    )
    new_role = "학교" if role == "학교 담당자" else "교육청"
    if new_role != st.session_state.get("role"):
        # 역할 변경 즉시 rerun → app.py 의 navigation 이 새 페이지 목록 구성
        st.session_state["role"] = new_role
        st.rerun()

st.markdown("<div style='height:24px'></div>", unsafe_allow_html=True)

# ─────────────────────────────────────────
# 중앙 CTA — 역할별 단일 버튼
# ─────────────────────────────────────────
col_l, col_c, col_r = st.columns([1, 2, 1])
with col_c:
    if st.session_state["role"] == "학교":
        if st.button("점검하러 가기", type="primary",
                     use_container_width=True, key="go_inspect"):
            st.switch_page("pages/1_점검시작.py")
        st.markdown(
            "<div style='text-align:center; margin-top:8px; font-size:12px; color:#9A9A9F;'>"
            "학교 담당자 모드 · 모바일·태블릿 권장 · 약 3분 소요"
            "</div>",
            unsafe_allow_html=True,
        )
    else:
        if st.button("교육청 수신함 열기", type="primary",
                     use_container_width=True, key="go_office"):
            st.switch_page("pages/7_교육청수신함.py")
        st.markdown(
            "<div style='text-align:center; margin-top:8px; font-size:12px; color:#9A9A9F;'>"
            "교육청 담당자 모드 · 학교에서 발송한 점검 결과를 검토합니다"
            "</div>",
            unsafe_allow_html=True,
        )
