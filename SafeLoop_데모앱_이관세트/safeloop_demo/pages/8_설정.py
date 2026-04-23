"""
설정 페이지.

- 학교 프로필 · 결재라인 기본값
- 공간 사전 등록 (일괄)
- 시연 모드 토글
- API 상태 확인
- 세션 초기화
"""
from __future__ import annotations

import uuid

import streamlit as st

from modules.ai_vision import api_key_available, current_provider_label
from modules.ai_providers import ALL_PROVIDERS, providers_status
from modules.session import ensure_state, reset_all
from modules.ui import apply_theme, divider, hero, section

st.set_page_config(page_title="설정 · SafeLoop", page_icon="/", layout="centered")
apply_theme()
ensure_state()

hero("SETTINGS", "설정", "운영 모드 · 결재라인 · 사전 등록 · 시스템 상태")

# ─────────────────────────────────────────
# 모드 토글
# ─────────────────────────────────────────
section("01", "운영 모드")
col_a, col_b = st.columns(2)
with col_a:
    demo = st.toggle("시연 모드 (샘플 사진·자동 채움 허용)",
                     value=st.session_state.get("demo_mode", True))
    st.session_state["demo_mode"] = demo
with col_b:
    role = st.radio(
        "역할",
        ["학교 담당자", "교육청 담당자"],
        horizontal=True,
        index=0 if st.session_state.get("role", "학교") == "학교" else 1,
    )
    st.session_state["role"] = "학교" if role == "학교 담당자" else "교육청"

# ─────────────────────────────────────────
# 결재라인 기본값
# ─────────────────────────────────────────
divider()
section("02", "결재라인 기본값")
st.caption("저장하면 공문 품의서에 자동 반영됩니다.")

eduline = st.session_state.get("eduline") or {}
c1, c2 = st.columns(2)
with c1:
    eduline["담당자"] = st.text_input("담당자", value=eduline.get("담당자", ""), key="cfg_담당자")
    eduline["부장"] = st.text_input("부장", value=eduline.get("부장", ""), key="cfg_부장")
with c2:
    eduline["교감"] = st.text_input("교감", value=eduline.get("교감", ""), key="cfg_교감")
    eduline["교장"] = st.text_input("교장", value=eduline.get("교장", ""), key="cfg_교장")

if st.button("결재라인 저장"):
    st.session_state["eduline"] = eduline
    st.success("저장 완료")

# ─────────────────────────────────────────
# 공간 사전 등록
# ─────────────────────────────────────────
divider()
section("03", "공간 사전 등록")
st.caption("첫 점검 전에 학교 내 공간 목록을 미리 등록할 수 있습니다.")

school = st.session_state.get("school")
if not school:
    st.warning("먼저 학교를 선택하세요. (점검 시작 페이지)")
else:
    SPACE_TYPES = [
        "화학실", "물리실", "생명과학실", "지구과학실",
        "기술실", "가정실", "음악실", "미술실",
        "강당", "체육관", "급식실", "일반교실", "특별교실(과목 불명)",
    ]
    col_type, col_nick = st.columns([1, 2])
    with col_type:
        new_type = st.selectbox("공간 유형", SPACE_TYPES)
    with col_nick:
        new_nick = st.text_input("별칭 (선택)", placeholder="예: 3층 화학실 A")

    if st.button("공간 추가"):
        st.session_state.setdefault("registered_spaces", []).append({
            "space_id": uuid.uuid4().hex[:10],
            "school_code": school.get("정보공시 학교코드"),
            "type": new_type,
            "nickname": new_nick.strip() or None,
        })
        st.success("등록 완료")
        st.rerun()

    # 등록된 공간 목록
    spaces = [s for s in st.session_state.get("registered_spaces", [])
              if s.get("school_code") == school.get("정보공시 학교코드")]
    if spaces:
        st.markdown("##### 등록된 공간")
        for idx, sp in enumerate(spaces):
            colA, colB = st.columns([5, 1])
            with colA:
                st.markdown(f"- **{sp['type']}** · {sp.get('nickname') or '별칭 없음'} "
                            f"<span style='color:#888;font-size:11px'>({sp['space_id']})</span>",
                            unsafe_allow_html=True)
            with colB:
                if st.button("삭제", key=f"del_sp_{sp['space_id']}"):
                    st.session_state["registered_spaces"] = [
                        s for s in st.session_state["registered_spaces"]
                        if s["space_id"] != sp["space_id"]
                    ]
                    st.rerun()

# ─────────────────────────────────────────
# API 상태
# ─────────────────────────────────────────
divider()
section("04", "AI 공급자",
        "Claude 이외에도 OpenAI 등 다른 공급자로 전환할 수 있습니다. "
        "프롬프트·파이프라인은 동일하며 호출 대상만 교체됩니다.")

_providers = providers_status()
_avail_map = {p["id"]: p for p in _providers}

# 현재 선택
current_choice = st.session_state.get("ai_provider") or next(
    (p["id"] for p in _providers if p["available"]), "anthropic"
)

options = [p["id"] for p in _providers]

def _fmt(pid: str) -> str:
    p = _avail_map[pid]
    mark = "✓ 사용 가능" if p["available"] else "✗ 키 필요"
    src = f" · {p['key_source']}" if p.get("key_source") else ""
    return f"{p['label']}  —  {mark}{src}"

sel = st.radio(
    "공급자 선택",
    options=options,
    index=options.index(current_choice) if current_choice in options else 0,
    format_func=_fmt,
)
st.session_state["ai_provider"] = sel

# 선택된 공급자의 키 입력
selected = _avail_map[sel]
key_field = f"api_key_{sel}"
existing = st.session_state.get(key_field, "")
placeholder = "환경변수에서 자동 감지됨" if selected["key_source"] == "환경변수" and not existing \
    else "sk-..."
new_key = st.text_input(
    f"{selected['label']} API 키",
    value=existing,
    placeholder=placeholder,
    type="password",
    help=f"환경변수 {selected['env_var']} 로도 설정 가능",
)
if new_key != existing:
    st.session_state[key_field] = new_key.strip()

if st.button("키 저장·연결 확인"):
    if api_key_available():
        st.success(f"연결됨 — {current_provider_label()}")
    else:
        st.error("이 공급자의 API 키가 감지되지 않습니다.")

# 전체 공급자 상태 요약
st.markdown("##### 전체 공급자 상태")
for p in _providers:
    status = "✅ 사용 가능" if p["available"] else "⚪ 키 없음"
    src = f" · {p['key_source']}" if p.get("key_source") else ""
    st.markdown(f"- **{p['label']}** — {status}{src}")

divider()
section("05", "시스템 상태")
if api_key_available():
    st.success(f"AI 파이프라인 사용 가능 — 현재 공급자: {current_provider_label()}")
else:
    st.error("현재 선택된 공급자의 API 키가 없습니다. 위 섹션에서 키를 입력하세요.")

# ─────────────────────────────────────────
# 세션 초기화
# ─────────────────────────────────────────
divider()
section("06", "세션 관리", "모든 세션 데이터(학교 선택·공간·촬영·AI 결과 등)를 초기화합니다.")
if st.button("전체 세션 초기화", type="secondary"):
    reset_all()
    st.success("초기화 완료")
    st.rerun()
