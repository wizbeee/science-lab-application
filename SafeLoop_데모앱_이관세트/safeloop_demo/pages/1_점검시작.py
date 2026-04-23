"""
Step 1~2 — 학교 식별 + 인증 + 공간 선택/등록.

학교 찾기 3가지 방식(탭):
1) GPS 자동 (편의용 — HTTPS 필요)
2) 학교명 검색
3) 지역 단계 검색 (시도 → 시군구 → 학교)

인증은 '학교 식별번호'(정보공시 코드, 자동 표시) + '담당자 인증번호'(수동 입력) 2요소.
"""
from __future__ import annotations

import uuid

import streamlit as st

from modules.data_loader import (
    get_school_by_code,
    issue_auth_code,
    list_schools,
    list_sido,
    list_sigungu,
    search_schools_by_name,
    verify_auth_code,
)
from modules.session import ensure_state
from modules.ui import apply_theme, divider, hero, section

st.set_page_config(page_title="점검 시작 · SafeLoop", page_icon="/", layout="centered")
apply_theme()
ensure_state()

hero("STEP 01", "점검 시작", "학교를 찾아 인증한 뒤, 점검할 공간을 선택하세요.")

# ─────────────────────────────────────────
# 1) 학교 찾기
# ─────────────────────────────────────────
section("01", "학교 찾기")

current = st.session_state.get("school")
if current:
    st.markdown(
        f"<div class='sl-card sl-card-accent'>"
        f"<div style='font-size:12px;color:#6B6B70;letter-spacing:0.1em;margin-bottom:4px;'>선택된 학교</div>"
        f"<div style='font-size:18px;font-weight:700;color:#0A0A0B;margin-bottom:4px;'>{current.get('학교명')}</div>"
        f"<div style='font-size:13px;color:#6B6B70;'>{current.get('시도교육청')} · {current.get('지역')} · "
        f"{current.get('학교급')} · {current.get('설립구분')}</div>"
        f"</div>",
        unsafe_allow_html=True,
    )
    if st.button("다른 학교 선택", key="change_school"):
        st.session_state["school"] = None
        st.session_state["auth_verified"] = False
        st.rerun()

if not current:
    tab_name, tab_region, tab_gps = st.tabs(["학교명으로", "지역으로", "GPS 자동"])

    # -- 학교명 검색 --
    with tab_name:
        q = st.text_input("학교명", placeholder="예: 원촌중학교", key="search_q",
                          label_visibility="collapsed")
        if q:
            df = search_schools_by_name(q)
            if df.empty:
                st.info("검색 결과가 없습니다. 다른 키워드로 시도하세요.")
            else:
                st.caption(f"{len(df)}개 일치")
                for i, row in df.iterrows():
                    c1, c2 = st.columns([5, 1])
                    with c1:
                        st.markdown(
                            f"**{row['학교명']}**  "
                            f"<span class='sl-pill'>{row['학교급']}</span>"
                            f"<span class='sl-pill'>{row['설립구분']}</span>  \n"
                            f"<span style='color:#6B6B70;font-size:12px'>"
                            f"{row['시도교육청']} · {row['지역']}</span>",
                            unsafe_allow_html=True,
                        )
                    with c2:
                        if st.button("선택", key=f"pick_name_{i}_{row['정보공시 학교코드']}"):
                            full = get_school_by_code(row["정보공시 학교코드"])
                            st.session_state["school"] = full
                            st.session_state["auth_verified"] = False
                            st.rerun()

    # -- 지역 단계 검색 --
    with tab_region:
        c1, c2 = st.columns(2)
        with c1:
            sido = st.selectbox("시도교육청", ["선택"] + list_sido(), key="sel_sido_tab")
        with c2:
            if sido != "선택":
                sgg = st.selectbox("시군구", ["선택"] + list_sigungu(sido), key="sel_sigungu_tab")
            else:
                sgg = "선택"
        if sido != "선택" and sgg != "선택":
            df = list_schools(sido, sgg)
            q2 = st.text_input("학교명 추가 필터 (선택)", key="region_q",
                               placeholder="이 지역 내 학교명 필터", label_visibility="collapsed")
            if q2:
                df = df[df["학교명"].str.contains(q2, na=False)]
            if df.empty:
                st.info("해당 지역에 학교가 없습니다.")
            else:
                st.caption(f"{len(df)}개 학교")
                for i, row in df.head(80).iterrows():
                    c1, c2 = st.columns([5, 1])
                    with c1:
                        st.markdown(
                            f"**{row['학교명']}**  "
                            f"<span class='sl-pill'>{row['학교급']}</span>"
                            f"<span class='sl-pill'>{row['설립구분']}</span>  \n"
                            f"<span style='color:#6B6B70;font-size:12px'>{row['지역']}</span>",
                            unsafe_allow_html=True,
                        )
                    with c2:
                        if st.button("선택", key=f"pick_region_{i}_{row['정보공시 학교코드']}"):
                            full = get_school_by_code(row["정보공시 학교코드"])
                            st.session_state["school"] = full
                            st.session_state["auth_verified"] = False
                            st.rerun()

    # -- GPS --
    with tab_gps:
        st.markdown(
            "<div class='sl-card'>"
            "<b>GPS 자동 탐색</b><br>"
            "<span style='color:#6B6B70;font-size:13px'>"
            "현재 위치로 가장 가까운 학교를 자동 탐색합니다(편의용). "
            "iOS Safari에선 <b>HTTPS 접속</b>이 필요합니다."
            "</span></div>",
            unsafe_allow_html=True,
        )
        try:
            from streamlit_geolocation import streamlit_geolocation  # type: ignore
            loc = streamlit_geolocation()
            if loc and loc.get("latitude") and loc.get("longitude"):
                st.success(f"현재 위치: {loc['latitude']:.5f}, {loc['longitude']:.5f}")
                st.caption("시연 앱은 주소→좌표 DB가 없어 후보만 제시합니다. 학교명/지역 탭으로 선택하세요.")
            else:
                st.caption("브라우저 위치 권한을 허용해주세요.")
        except Exception:
            st.warning("GPS 컴포넌트를 사용할 수 없습니다. 학교명/지역 탭을 이용하세요.")

# ─────────────────────────────────────────
# 2) 인증 — 식별번호 vs 인증번호 분리
# ─────────────────────────────────────────
if st.session_state.get("school") and not st.session_state.get("auth_verified"):
    divider()
    section("02", "담당자 인증",
            "학교 식별번호는 공개 정보로 자동 표시됩니다. 담당자 인증번호만 입력하세요.")

    school = st.session_state["school"]
    code = school.get("정보공시 학교코드")
    expected = issue_auth_code(code)

    # 식별번호 (자동 표시)
    st.markdown(
        f"<div class='sl-card'>"
        f"<div style='font-size:11px; letter-spacing:0.2em; color:#6B6B70; margin-bottom:4px;'>학교 식별번호 (자동)</div>"
        f"<div style='font-family:monospace; font-size:20px; font-weight:700; color:#0A0A0B; letter-spacing:0.04em;'>{code}</div>"
        f"<div style='font-size:12px; color:#9A9A9F; margin-top:4px;'>교육부 정보공시가 부여한 공개 식별자입니다. 입력 불필요.</div>"
        f"</div>",
        unsafe_allow_html=True,
    )

    # 인증번호 안내 — 혼란 해소
    with st.expander("ⓘ 담당자 인증번호란? (처음이라면 먼저 읽어보세요)", expanded=not st.session_state.get("_seen_auth_help")):
        st.markdown(
            "**담당자 인증번호**는 점검을 등록할 자격이 있는 **담당 교사·시설관리자**를 증명하는 6자리 숫자 비밀번호입니다.\n\n"
            "- **학교 코드**(예: `S120002870`)는 위에 자동 표시됩니다 — 공개 정보, 입력 불필요\n"
            "- **담당자 인증번호**는 학교·교육청이 담당자에게 개별 발급하는 **비공개 번호**입니다\n"
            "- 실제 운영 시: 교육청에서 교사별로 발급 → 메일·공문으로 전달\n"
            "- **이 앱은 시연용**이므로 실제 발급 체계가 없어, 우측의 <span style='color:#D50000;font-weight:700'>시연 모드 번호</span>를 그대로 입력하거나 **자동 입력** 버튼을 누르면 됩니다",
            unsafe_allow_html=True,
        )
        st.session_state["_seen_auth_help"] = True

    # 인증번호 (수동 입력 + 시연용 자동 입력)
    colA, colB = st.columns([3, 2])

    # 입력값 소스: 자동입력 버튼 누르면 세션에 저장 → 위젯에 주입
    default_val = st.session_state.get("_auth_prefill", "")

    with colA:
        auth_input = st.text_input(
            "담당자 인증번호 (6자리 숫자)",
            value=default_val,
            max_chars=6, placeholder="예: 000000",
            help="실제 운영: 교육청 발급. 시연 중: 우측 빨강 카드 번호 입력 or '자동 입력' 버튼.",
            key="auth_input",
        )
        submit = st.button("인증 확인", type="primary", use_container_width=True)

    with colB:
        if st.session_state.get("demo_mode"):
            st.markdown(
                f"<div class='sl-card' style='background:#FFF2F2; border-color:#F8D0D0;'>"
                f"<div class='sl-num' style='margin-bottom:2px;'>시연 모드 전용</div>"
                f"<div style='font-size:13px; color:#6B6B70;'>이 학교의 인증번호</div>"
                f"<div style='font-family:monospace; font-size:28px; font-weight:800; color:#D50000; letter-spacing:0.08em; margin:4px 0;'>{expected}</div>"
                f"<div style='font-size:11px; color:#9A9A9F;'>실제 운영 시 비공개.</div>"
                f"</div>",
                unsafe_allow_html=True,
            )
            if st.button("↓ 자동 입력", key="auto_fill_auth", use_container_width=True):
                st.session_state["_auth_prefill"] = expected
                st.rerun()
        else:
            st.caption("시연 모드 OFF — 인증번호는 교육청·학교장 발급분을 사용하세요.")

    if submit:
        if not auth_input or len(auth_input) != 6 or not auth_input.isdigit():
            st.error("인증번호는 6자리 숫자여야 합니다.")
        elif verify_auth_code(code, auth_input):
            st.session_state["auth_verified"] = True
            st.session_state["_auth_prefill"] = ""
            st.success("인증되었습니다.")
            st.rerun()
        else:
            st.error("인증번호가 일치하지 않습니다.")

# ─────────────────────────────────────────
# 3) 공간 선택 / 등록
# ─────────────────────────────────────────
if st.session_state.get("auth_verified"):
    divider()
    section("03", "점검할 공간 선택")

    spaces = st.session_state.get("registered_spaces", [])
    school_code = st.session_state["school"].get("정보공시 학교코드")
    spaces_here = [s for s in spaces if s.get("school_code") == school_code]

    tab_pick, tab_new = st.tabs(["등록된 공간", "새 공간 등록"])

    with tab_pick:
        if not spaces_here:
            st.info("아직 등록된 공간이 없습니다. 오른쪽 탭에서 새 공간을 등록하세요.")
        else:
            for sp in spaces_here:
                c1, c2 = st.columns([5, 1])
                with c1:
                    nick = sp.get("nickname") or "별칭 없음"
                    st.markdown(
                        f"<div class='sl-card' style='margin-bottom:8px; padding:14px 16px;'>"
                        f"<b>{sp['type']}</b> · <span style='color:#6B6B70'>{nick}</span>"
                        f"</div>",
                        unsafe_allow_html=True,
                    )
                with c2:
                    if st.button("선택", key=f"pick_space_{sp['space_id']}"):
                        st.session_state["active_space"] = sp

    with tab_new:
        SPACE_TYPES = [
            "화학실", "물리실", "생명과학실", "지구과학실",
            "기술실", "가정실", "음악실", "미술실",
            "강당", "체육관", "급식실", "일반교실", "특별교실(과목 불명)",
        ]
        c1, c2 = st.columns([1, 2])
        with c1:
            sp_type = st.selectbox("공간 유형", SPACE_TYPES)
        with c2:
            sp_nickname = st.text_input("별칭 (선택)", placeholder="예: 3층 화학실 A", max_chars=40)
        if st.button("등록·선택", type="primary"):
            new_sp = {
                "space_id": uuid.uuid4().hex[:10],
                "school_code": school_code,
                "type": sp_type,
                "nickname": sp_nickname.strip() or None,
            }
            st.session_state.setdefault("registered_spaces", []).append(new_sp)
            st.session_state["active_space"] = new_sp
            st.rerun()

    if st.session_state.get("active_space"):
        divider()
        nick = st.session_state["active_space"].get("nickname") or "별칭 없음"
        st.markdown(
            f"<div class='sl-card sl-card-accent'>"
            f"<div class='sl-num'>현재 선택</div>"
            f"<div style='font-size:18px; font-weight:700;'>"
            f"{st.session_state['active_space']['type']} "
            f"<span style='font-weight:500; color:#6B6B70'>· {nick}</span>"
            f"</div></div>",
            unsafe_allow_html=True,
        )
        if st.button("AI 점검으로 이동", type="primary", use_container_width=True):
            st.switch_page("pages/2_AI점검.py")
