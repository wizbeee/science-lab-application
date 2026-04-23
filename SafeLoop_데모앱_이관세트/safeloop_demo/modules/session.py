"""
Streamlit 세션 상태 헬퍼.

단계별(Step 1~7) 데이터를 세션 상태에 누적 저장하고,
페이지 간에 일관되게 전달한다.
"""
from __future__ import annotations

from typing import Any

import streamlit as st

DEFAULT_STATE = {
    # 학교 식별 (Step 1)
    "school": None,          # {"정보공시 학교코드": ..., "학교명": ..., ...}
    "auth_verified": False,

    # 공간 (Step 2)
    "active_space": None,    # {"space_id": "...", "type": "화학실", "nickname": "3층 A"}
    "registered_spaces": [], # 학교별 공간 목록

    # 촬영 (Step 3)
    "captured_images": [],   # [{"name": "...", "bytes": b"...", "source": "camera|sample"}]

    # AI 파이프라인 (Step 4)
    "stage1_result": None,
    "stage2_result": None,
    "stage2_confirmed": None,   # 사용자 확정 결과
    "stage3_result": None,

    # 현장 점검 (Step 5)
    "item_scores": {},          # {항목: 0/0.5/1}
    "score_result": None,

    # AI 추천 (Step 6)
    "recommendations": None,

    # 저장 (Step 7)
    "saved_session_id": None,
    "eduline": None,           # 결재라인
    "edu_package_ready": False,
    "edu_app_sent": False,
    "edufine_approved": False,

    # 모드
    "demo_mode": True,          # 심사·시연용: 샘플 사진 허용
    "role": "학교",             # "학교" | "교육청"

    # 전국 대시보드
    "filter_sido": None,

    # AI 공급자
    "ai_provider": None,        # None=자동, "anthropic" | "openai" 등
    "api_key_anthropic": "",
    "api_key_openai": "",

    # UX
    "_auth_prefill": "",        # 인증번호 자동 입력 버퍼
    "_seen_auth_help": False,
}


def ensure_state() -> None:
    for k, v in DEFAULT_STATE.items():
        if k not in st.session_state:
            st.session_state[k] = v if not isinstance(v, (list, dict)) else type(v)(v)


def reset_inspection() -> None:
    """한 공간 점검 세션 초기화 (다른 공간 이어서 점검 시)."""
    for k in [
        "active_space", "captured_images",
        "stage1_result", "stage2_result", "stage2_confirmed", "stage3_result",
        "item_scores", "score_result", "recommendations",
        "saved_session_id", "edu_package_ready", "edu_app_sent", "edufine_approved",
    ]:
        st.session_state[k] = DEFAULT_STATE[k] if not isinstance(DEFAULT_STATE[k], (list, dict)) \
            else type(DEFAULT_STATE[k])(DEFAULT_STATE[k])


def reset_all() -> None:
    for k in DEFAULT_STATE:
        st.session_state[k] = DEFAULT_STATE[k] if not isinstance(DEFAULT_STATE[k], (list, dict)) \
            else type(DEFAULT_STATE[k])(DEFAULT_STATE[k])


def get(key: str, default: Any = None) -> Any:
    ensure_state()
    return st.session_state.get(key, default)


def set_(key: str, value: Any) -> None:
    ensure_state()
    st.session_state[key] = value


def require_school() -> dict | None:
    """학교 선택·인증 완료 여부 확인. 미완료면 경고 표시 + None 반환."""
    ensure_state()
    school = st.session_state.get("school")
    if not school or not st.session_state.get("auth_verified"):
        st.warning("먼저 **학교 찾기** 페이지에서 학교를 선택하고 인증하세요.")
        return None
    return school
