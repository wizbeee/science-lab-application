"""
Step 3~5 — 사진 촬영 + AI 3단계 파이프라인 + 설비 사용자 확정 + 현장 점검.

촬영 UI — 샷별 카드 (명칭 → 가이드 문구 → 카메라 → 촬영 결과):
공간 무관 공통 6샷. 각 샷마다 독립된 카메라 위젯. 최소 3샷 이상 확보 시 AI 분석 활성화.
"""
from __future__ import annotations

from pathlib import Path

import pandas as pd
import plotly.graph_objects as go
import streamlit as st

from modules.ai_vision import api_key_available, run_stage1, run_stage2, run_stage3
from modules.laws import CATEGORIES
from modules.recommend import recommend_from_scores
from modules.score import calculate_safety_score
from modules.session import ensure_state, require_school
from modules.ui import apply_theme, divider, hero, section

st.set_page_config(page_title="AI 점검 · SafeLoop", page_icon="/", layout="wide")
apply_theme()
ensure_state()

school = require_school()
if not school:
    if st.button("← 학교 찾기로"):
        st.switch_page("pages/1_점검시작.py")
    st.stop()

space = st.session_state.get("active_space")
if not space:
    st.warning("점검할 공간이 선택되지 않았습니다.")
    if st.button("← 공간 선택으로"):
        st.switch_page("pages/1_점검시작.py")
    st.stop()

hero(
    "STEP 02",
    "AI 맞춤 점검",
    f"{school['학교명']} · {space['type']}"
    + (f" · {space.get('nickname')}" if space.get("nickname") else ""),
)

# ─────────────────────────────────────────
# 촬영 샷 정의 — 사용자 움직임 기반 (문 → 우측 → 좌측)
#   필수 3장(광각)이면 AI가 공간·설비를 자동 인식.
#   보조 1장(근접)은 AI가 놓친 항목을 보완할 때만 사용.
# ─────────────────────────────────────────
SHOTS: list[dict] = [
    {
        "key": "wide_front",
        "no": "01",
        "title": "정면 · 문을 열고 들어서면 보이는 장면",
        "guide": "출입문을 등지고 서서, 앞쪽 전경이 프레임에 한 번에 담기도록 촬영하세요. "
                 "천장 · 바닥 · 양쪽 벽면 일부가 모두 보이면 가장 좋습니다. 가로 구도 권장.",
        "required": True,
    },
    {
        "key": "wide_right",
        "no": "02",
        "title": "오른쪽 · 몸을 오른쪽으로 돌려 바라본 장면",
        "guide": "같은 자리에서 오른쪽으로 몸을 돌려, 오른쪽 벽면과 그 앞에 놓인 집기 · 수납장 · 벽 부착물이 "
                 "한 프레임에 담기도록 촬영하세요.",
        "required": True,
    },
    {
        "key": "wide_left",
        "no": "03",
        "title": "왼쪽 · 몸을 왼쪽으로 돌려 바라본 장면",
        "guide": "이번엔 왼쪽으로 몸을 돌려, 왼쪽 벽면과 집기, 그리고 들어왔던 출입구 쪽이 "
                 "함께 보이도록 촬영하세요.",
        "required": True,
    },
    {
        "key": "close_supplement",
        "no": "04",
        "title": "보완 촬영 · AI가 놓친 항목만 근접 (선택)",
        "guide": "먼저 위 3장을 올리고 AI 분석을 실행하세요. AI가 특정 설비를 인식하지 못했거나 "
                 "'모호' 상태로 표시한 경우에만 해당 설비 · 표지 · 천장 감지기 등을 가까이서 추가 촬영합니다. "
                 "AI가 이미 인식했다면 이 단계는 건너뛰어도 됩니다.",
        "required": False,
    },
]


def _shots_dict() -> dict:
    """세션에 샷별 저장소 초기화 — 각 샷은 사진 리스트."""
    return {s["key"]: [] for s in SHOTS}


# 세션 초기화 + 구 스키마 마이그레이션 (dict → list)
if "shots" not in st.session_state:
    st.session_state["shots"] = _shots_dict()
else:
    migrated = {}
    for s in SHOTS:
        v = st.session_state["shots"].get(s["key"])
        if v is None:
            migrated[s["key"]] = []
        elif isinstance(v, dict):
            migrated[s["key"]] = [v]
        elif isinstance(v, list):
            migrated[s["key"]] = v
        else:
            migrated[s["key"]] = []
    st.session_state["shots"] = migrated

shots_state: dict = st.session_state["shots"]

total_photos = sum(len(v) for v in shots_state.values())
required_filled = sum(1 for s in SHOTS if s["required"] and shots_state.get(s["key"]))
required_total = sum(1 for s in SHOTS if s["required"])

# ─────────────────────────────────────────
# 위저드 상태 (한 구도씩 한 화면)
# ─────────────────────────────────────────
WIZARD_STEPS = [
    ("shoot_1", "01 정면", "wide_front"),
    ("shoot_2", "02 우측", "wide_right"),
    ("shoot_3", "03 좌측", "wide_left"),
    ("ai_run", "AI 분석", None),
    ("supplement", "보완", "close_supplement"),
    ("review", "결과", None),
]
_STEP_KEYS = [s[0] for s in WIZARD_STEPS]
_SHOT_OF_STEP = {s[0]: s[2] for s in WIZARD_STEPS}

if "wizard_step" not in st.session_state:
    st.session_state["wizard_step"] = "shoot_1"
# 방어: 잘못된 스텝 값 리셋
if st.session_state["wizard_step"] not in _STEP_KEYS:
    st.session_state["wizard_step"] = "shoot_1"

# 클래식 모드 토글 (한 번에 전체 보기)
col_toggle_l, col_toggle_r = st.columns([3, 1])
with col_toggle_r:
    classic_mode = st.toggle(
        "전체 한 번에 보기",
        value=st.session_state.get("classic_mode", False),
        key="classic_mode",
        help="위저드 대신 기존 방식(모든 구도가 한 화면).",
    )
step = st.session_state["wizard_step"]


def _go_to_step(target: str) -> None:
    """스텝 이동 · rerun."""
    if target in _STEP_KEYS:
        st.session_state["wizard_step"] = target
        st.rerun()


def _render_progress(current: str) -> None:
    """상단 진행 인디케이터 · 현재/완료/대기 색 구분."""
    cur_idx = _STEP_KEYS.index(current) if current in _STEP_KEYS else 0
    pieces = []
    for i, (k, label, _) in enumerate(WIZARD_STEPS):
        if i < cur_idx:
            color, weight = "#0A0A0B", "500"
        elif i == cur_idx:
            color, weight = "#D50000", "700"
        else:
            color, weight = "#9A9A9F", "500"
        pieces.append(
            f"<span style='color:{color};font-weight:{weight};'>{label}</span>"
        )
    sep = "<span style='color:#D1D1D4;margin:0 10px;'>—</span>"
    st.markdown(
        "<div style='font-size:13px;margin:0 0 18px 0;letter-spacing:0.02em;"
        "padding:10px 14px;border:1px solid #E5E5E8;border-radius:6px;"
        "background:#FAFAFA;'>" + sep.join(pieces) + "</div>",
        unsafe_allow_html=True,
    )


def _render_shot_card(s: dict) -> None:
    """샷 카드 한 장 렌더(기존 루프 본문 추출)."""
    key = s["key"]
    photos = shots_state.setdefault(key, [])
    count = len(photos)
    status_html = (
        f"<span class='sl-status-ok'>● {count}장 촬영됨</span>"
        if count else "<span class='sl-status-empty'>○ 촬영 대기</span>"
    )
    required_label = "필수" if s["required"] else "선택"
    required_pill_class = "sl-pill-red" if s["required"] else "sl-pill"

    st.markdown(
        f"<div class='sl-card' style='margin-bottom:0;'>"
        f"<div class='sl-shot-head'>"
        f"<div class='sl-shot-num'>{s['no']}</div>"
        f"<div class='sl-shot-title'>{s['title']}</div>"
        f"<div style='margin-left:auto;'>"
        f"<span class='sl-pill {required_pill_class}'>{required_label}</span>"
        f"{status_html}"
        f"</div></div>"
        f"<div class='sl-shot-guide'>{s['guide']}</div>"
        f"</div>",
        unsafe_allow_html=True,
    )

    with st.container():
        if photos:
            thumb_cols = st.columns(min(4, max(1, count)))
            for idx, p in enumerate(photos):
                with thumb_cols[idx % len(thumb_cols)]:
                    st.image(p["bytes"], caption=f"{s['no']}-{idx+1}",
                             use_container_width=True)
                    if st.button("삭제", key=f"del_{key}_{idx}", use_container_width=True):
                        photos.pop(idx)
                        st.rerun()

        counter_key = f"cam_ctr_{key}"
        if counter_key not in st.session_state:
            st.session_state[counter_key] = 0
        cam_widget_key = f"cam_{key}_{st.session_state[counter_key]}"

        st.markdown(
            """
            <script>
            (function(){
                function patch(){
                    const inputs = window.parent.document.querySelectorAll('section[data-testid="stFileUploaderDropzone"] input[type="file"]');
                    inputs.forEach(el => {
                        if (!el.hasAttribute('capture')) {
                            el.setAttribute('accept', 'image/*');
                            el.setAttribute('capture', 'environment');
                        }
                    });
                }
                patch();
                setTimeout(patch, 300);
                setTimeout(patch, 1000);
            })();
            </script>
            """,
            unsafe_allow_html=True,
        )
        st.markdown(
            "<div style='font-size:12px;color:#6B6B70;margin-bottom:4px;'>"
            "버튼을 누르면 <b>카메라가 바로 실행</b>됩니다 (PC는 파일 선택 창)."
            "</div>",
            unsafe_allow_html=True,
        )
        snap = st.file_uploader(
            f"이 구도 촬영하기 · {s['title']}",
            type=["jpg", "jpeg", "png", "webp", "heic"],
            accept_multiple_files=True,
            key=cam_widget_key,
            label_visibility="collapsed",
        )
        if snap:
            added = False
            existing_bytes = {p["bytes"] for p in photos}
            for f in snap:
                new_bytes = f.getvalue()
                if new_bytes not in existing_bytes:
                    photos.append({
                        "name": f"{key}_{len(photos)+1}.jpg",
                        "bytes": new_bytes,
                        "source": "camera",
                    })
                    existing_bytes.add(new_bytes)
                    added = True
            if added:
                st.session_state[counter_key] += 1
                st.rerun()

        if photos:
            if st.button("이 구도 전체 비우기", key=f"clear_shot_{key}"):
                shots_state[key] = []
                st.session_state[counter_key] = st.session_state.get(counter_key, 0) + 1
                st.rerun()

    st.markdown("<div style='height:10px;'></div>", unsafe_allow_html=True)


def _render_wizard_nav(prev_step: str | None, next_step: str | None,
                        next_label: str = "다음 →", next_disabled: bool = False,
                        next_type: str = "primary") -> None:
    """하단 이전/다음 버튼."""
    st.markdown("<div style='height:8px;'></div>", unsafe_allow_html=True)
    c_prev, c_spacer, c_next = st.columns([1, 2, 1])
    with c_prev:
        if prev_step:
            if st.button("← 이전", key=f"nav_prev_{step}", use_container_width=True):
                _go_to_step(prev_step)
    with c_next:
        if next_step:
            if st.button(next_label, key=f"nav_next_{step}",
                         use_container_width=True, disabled=next_disabled,
                         type=next_type):
                _go_to_step(next_step)


# ─────────────────────────────────────────
# (A) 촬영 · 위저드 or 클래식
# ─────────────────────────────────────────
if classic_mode:
    section(
        "01", "사진 촬영",
        f"누적 {total_photos}장 · 필수 구도 {required_filled}/{required_total} 충족"
        + (" · AI 분석 가능" if total_photos >= 3 and required_filled >= required_total
           else ""),
    )
    st.markdown(
        "<div style='font-size:13px; color:#6B6B70; margin-bottom:12px; line-height:1.65;'>"
        "<b style='color:#0A0A0B;'>촬영은 3장이면 충분합니다.</b> "
        "문을 열고 들어선 그 자리에서 <b>정면 → 오른쪽 → 왼쪽</b> 순서로 몸을 돌려 3장 찍으세요. "
        "AI가 이 광각 사진에서 공간 유형과 설비를 자동으로 인식합니다. "
        "AI가 놓친 항목이 있을 때만 맨 아래 <b>보완 촬영(선택)</b> 을 사용하세요. "
        "<b>iPhone은 HTTPS 접속 필요.</b>"
        "</div>",
        unsafe_allow_html=True,
    )
else:
    _render_progress(step)

# 시연 모드 — 샘플 일괄 로드
if st.session_state.get("demo_mode"):
    with st.expander("시연 모드 · 샘플 사진 일괄 로드", expanded=False):
        sample_choice = st.radio(
            "샘플 공간",
            ["화학실 샘플 (6장)", "물리실 샘플 (7장)"],
            horizontal=True,
            key="sample_choice",
        )
        if st.button("샘플 불러와서 구도별 분배", use_container_width=True):
            root = Path(__file__).resolve().parent.parent / "sample_images"
            sub = "chemistry_lab" if "화학실" in sample_choice else "physics_lab"
            paths = sorted((root / sub).glob("*.jpg"))
            # 리셋 후 분배: 앞 3장은 광각 3샷에 1:1, 나머지는 보완 샷에 누적
            for s in SHOTS:
                shots_state[s["key"]] = []
            wide_keys = [s["key"] for s in SHOTS if s["required"]]
            for i, p in enumerate(paths):
                target = wide_keys[i] if i < len(wide_keys) else "close_supplement"
                shots_state[target].append({
                    "name": p.name, "bytes": p.read_bytes(), "source": "sample",
                })
            for k in ["stage1_result", "stage2_result", "stage2_confirmed", "stage3_result"]:
                st.session_state[k] = None
            st.rerun()

def _reset_all() -> None:
    st.session_state["shots"] = _shots_dict()
    for _s in SHOTS:
        _ck = f"cam_ctr_{_s['key']}"
        if _ck in st.session_state:
            st.session_state[_ck] += 1
    for _k in ["stage1_result", "stage2_result", "stage2_confirmed", "stage3_result",
               "item_scores", "score_result", "recommendations"]:
        st.session_state[_k] = None
    st.session_state["wizard_step"] = "shoot_1"
    st.rerun()


_SHOT_BY_KEY = {s["key"]: s for s in SHOTS}

if classic_mode:
    # ─── 클래식: 기존처럼 전체 샷을 한 화면에 ───
    _has_ai_result = bool(st.session_state.get("stage2_result"))
    for s in SHOTS:
        if s["key"] == "close_supplement" and not _has_ai_result:
            continue
        _render_shot_card(s)
    colR1, colR2 = st.columns([4, 1])
    with colR2:
        if st.button("전체 초기화", key="reset_shots_classic"):
            _reset_all()
else:
    # ─── 위저드: 스텝별 한 화면 ───
    if step in ("shoot_1", "shoot_2", "shoot_3"):
        shot = _SHOT_BY_KEY[_SHOT_OF_STEP[step]]
        _render_shot_card(shot)
        shot_done = bool(shots_state.get(shot["key"]))
        prev_map = {"shoot_1": None, "shoot_2": "shoot_1", "shoot_3": "shoot_2"}
        next_map = {"shoot_1": "shoot_2", "shoot_2": "shoot_3", "shoot_3": "ai_run"}
        _render_wizard_nav(
            prev_step=prev_map[step],
            next_step=next_map[step],
            next_label=("다음 구도 →" if step != "shoot_3" else "AI 분석 단계로 →"),
            next_disabled=not shot_done,
        )
        if not shot_done:
            st.caption("이 구도를 최소 한 장 촬영하면 다음으로 진행할 수 있어요.")

    elif step == "ai_run":
        # 촬영 요약 + AI 실행 안내
        st.markdown(
            "<div class='sl-card'>"
            "<div class='sl-shot-head'>"
            "<div class='sl-shot-num'>AI</div>"
            "<div class='sl-shot-title'>사진 확인 및 AI 분석</div>"
            "</div>"
            "<div class='sl-shot-guide'>"
            "아래 3장을 AI가 분석해 공간 유형을 판정하고 안전 설비를 자동으로 탐지합니다. "
            "다시 찍고 싶다면 ‘이전’으로 돌아가세요."
            "</div></div>",
            unsafe_allow_html=True,
        )
        wide_keys = [k for k in ["wide_front", "wide_right", "wide_left"]]
        cols = st.columns(3)
        for i, k in enumerate(wide_keys):
            shot = _SHOT_BY_KEY[k]
            with cols[i]:
                st.markdown(
                    f"<div style='font-size:12px;color:#6B6B70;margin-bottom:4px;'>"
                    f"{shot['no']} · {shot['title'].split(' · ')[0]}</div>",
                    unsafe_allow_html=True,
                )
                ps = shots_state.get(k, [])
                if ps:
                    st.image(ps[0]["bytes"], use_container_width=True)
                    st.caption(f"{len(ps)}장")
                else:
                    st.warning("미촬영")

        _render_wizard_nav(
            prev_step="shoot_3",
            next_step=None,
        )  # 다음은 AI 실행 버튼이 대신함

    elif step == "supplement":
        # AI 결과 요약 + 보완 촬영 카드 + 재분석
        s2 = st.session_state.get("stage2_result") or {}
        absent = s2.get("likely_absent_equipment", []) or []
        ambiguous = s2.get("ambiguous_items", []) or []
        st.markdown(
            "<div class='sl-card'>"
            "<div class='sl-shot-head'>"
            "<div class='sl-shot-num'>04</div>"
            "<div class='sl-shot-title'>보완 촬영 (선택)</div>"
            "</div>"
            "<div class='sl-shot-guide'>"
            f"AI가 <b>{len(absent)}개 설비를 ‘없음’</b>, <b>{len(ambiguous)}개 항목을 ‘모호’</b>로 판정했습니다. "
            "실제로 존재하는데 AI가 못 본 것만 근접 촬영하세요. 없으면 건너뛰어도 됩니다."
            "</div></div>",
            unsafe_allow_html=True,
        )
        _render_shot_card(_SHOT_BY_KEY["close_supplement"])

        supplement_photos = shots_state.get("close_supplement", [])
        if supplement_photos:
            if st.button("보완 사진으로 AI 재분석", type="primary",
                         use_container_width=True, key="rerun_ai_supplement"):
                _go_to_step("ai_run")

        _render_wizard_nav(
            prev_step="ai_run",
            next_step="review",
            next_label="결과 단계로 →",
        )

    elif step == "review":
        # 결과 단계는 아래 (B)/(C)/(D)/(E) 블록이 렌더
        pass

    # 초기화 링크 (위저드에서도 접근)
    with st.expander("처음부터 다시 시작"):
        if st.button("모든 사진/결과 초기화", key="reset_wizard"):
            _reset_all()

# ─────────────────────────────────────────
# (B) AI 3단계 파이프라인
#     위저드에서는 `ai_run` 스텝에서만 실행 UI를 노출.
#     실행 완료 시 자동으로 `supplement` 스텝으로 이동.
# ─────────────────────────────────────────

# 공통 헬퍼 — 모든 샷을 평탄화 (실행·결과 모두 필요)
def _flatten_photos_with_labels() -> tuple[list[bytes], list[str]]:
    photos: list[bytes] = []
    labels: list[str] = []
    for s in SHOTS:
        for idx, p in enumerate(shots_state.get(s["key"], []), start=1):
            photos.append(p["bytes"])
            labels.append(f"{s['no']}-{idx} ({s['title']})")
    return photos, labels


all_photos, all_labels = _flatten_photos_with_labels()
total_filled = len(all_photos)
analysis_ready = total_filled >= 3 and required_filled >= required_total

_show_ai_run = classic_mode or step == "ai_run"

if _show_ai_run:
    divider()
    section(
        "02", "AI 자동 분석 · 맞춤 점검표 생성",
        f"Claude 비전 AI가 사진에서 공간 유형과 설비를 직접 식별합니다 · "
        f"누적 {total_filled}장 · 필수 구도 {required_filled}/{required_total}"
        + (" · <b style=\"color:#D50000\">실행 준비 완료</b>" if analysis_ready
           else " · 필수 3장을 먼저 채우세요"),
    )

    if not api_key_available():
        st.error("ANTHROPIC_API_KEY가 설정되지 않았습니다. .env 또는 Streamlit Secrets를 확인하세요.")
    else:
        col_a, col_b = st.columns([1, 3])
        with col_a:
            use_cache = st.checkbox("캐시 사용", value=True,
                                     help="동일 사진 재분석 시 API 호출 생략.")
        with col_b:
            run_disabled = not analysis_ready
            btn_label = ("▶  AI 분석 시작 (공간 식별 → 설비 탐지 → 점검표 생성)"
                         if analysis_ready else "필수 3장 촬영 후 활성화")
            if st.button(btn_label, type="primary", use_container_width=True,
                         disabled=run_disabled, key="run_ai_btn"):
                images = all_photos
                labels = all_labels
                prog = st.progress(0, text="단계 1/3 · 공간 유형 식별 중…")
                try:
                    s1 = run_stage1(images, use_cache=use_cache, image_labels=labels)
                    st.session_state["stage1_result"] = s1
                    prog.progress(33, text=f"단계 1 완료 · {s1.get('_elapsed_sec','?')}초")

                    space_type = s1.get("space_type_primary") or space["type"]
                    prog.progress(40, text="단계 2/3 · 안전 설비 탐지 중…")
                    s2 = run_stage2(images, space_type, use_cache=use_cache,
                                    image_labels=labels)
                    st.session_state["stage2_result"] = s2
                    st.session_state["stage2_confirmed"] = None
                    prog.progress(66, text=f"단계 2 완료 · {s2.get('_elapsed_sec','?')}초")

                    prog.progress(75, text="단계 3/3 · 맞춤 점검표 생성 중…")
                    s3 = run_stage3(s1, s2, use_cache=use_cache)
                    st.session_state["stage3_result"] = s3
                    prog.progress(100, text=f"단계 3 완료 · {s3.get('_elapsed_sec','?')}초")

                    # 위저드에서는 AI 완료 후 자동으로 보완 스텝으로
                    if not classic_mode:
                        _go_to_step("supplement")
                except Exception as e:
                    st.error("AI 호출 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.")
                    with st.expander("상세 로그"):
                        st.exception(e)

# 결과 데이터 참조 (모든 스텝에서 필요)
s1 = st.session_state.get("stage1_result")
s2 = st.session_state.get("stage2_result")
s3 = st.session_state.get("stage3_result")

# 스텝별 게이트
_show_stage1 = classic_mode or step in ("ai_run", "supplement", "review")
_show_stage2_confirm = classic_mode or step in ("supplement", "review")
_show_checklist_and_score = classic_mode or step == "review"

if s1 and _show_stage1:
    st.markdown("<div class='sl-num' style='margin-top:18px;'>결과 01</div>"
                "<div class='sl-h'>공간 유형 식별</div>", unsafe_allow_html=True)
    col1, col2, col3 = st.columns([2, 1, 1])
    with col1:
        st.metric("공간 유형", s1.get("space_type_primary", "-"))
    with col2:
        conf = s1.get("confidence", 0) or 0
        st.metric("신뢰도", f"{float(conf)*100:.0f}%")
    with col3:
        tag = "캐시" if s1.get("_cached") else "신규"
        st.metric(f"처리 시간({tag})", f"{s1.get('_elapsed_sec','?')}초")
    if s1.get("evidence"):
        with st.expander("판단 근거"):
            for ev in s1["evidence"]:
                st.markdown(f"- {ev}")

# (C) 단계 2 결과 사용자 확정
if s2 and _show_stage2_confirm:
    st.markdown("<div class='sl-num' style='margin-top:18px;'>결과 02</div>"
                "<div class='sl-h'>설비 탐지 · 사용자 확정</div>"
                "<div class='sl-h-sub'>AI 결과를 확인하고 필요 시 수정하세요. 수정 내역은 AI 재학습에 활용됩니다.</div>",
                unsafe_allow_html=True)

    detected = s2.get("detected_equipment", []) or []
    absent = s2.get("likely_absent_equipment", []) or []
    ambiguous = s2.get("ambiguous_items", []) or []

    confirmed = st.session_state.get("stage2_confirmed") or {
        "detected_equipment": [dict(x) for x in detected],
        "likely_absent_equipment": [dict(x) for x in absent],
        "ambiguous_items": list(ambiguous),
        "user_corrections": [],
    }

    tab_d, tab_a, tab_m = st.tabs(
        [f"탐지 {len(detected)}개", f"부재 {len(absent)}개", f"모호 {len(ambiguous)}개"]
    )

    with tab_d:
        st.caption("AI가 사진에서 실제로 확인한 설비입니다. `출처 사진`은 AI가 판단 근거로 삼은 사진입니다.")
        keep_d = []
        for i, item in enumerate(confirmed["detected_equipment"]):
            key = f"detected_{i}"
            ref = item.get("image_ref") or item.get("note_ref") or "-"
            checked = st.checkbox(
                f"**{item.get('name','?')}** — {item.get('status','')} · "
                f"{item.get('category','')}  \n"
                f"<span style='color:#9A9A9F;font-size:11px'>출처 사진: {ref}</span>",
                value=True, key=key,
            )
            if checked:
                keep_d.append(item)
            else:
                confirmed["user_corrections"].append({"type": "remove_detected", "item": item})
        confirmed["detected_equipment"] = keep_d

    with tab_a:
        st.caption("AI가 '없다'고 판단한 설비입니다. 실제로 있다면 체크하세요 → 탐지됨으로 이동합니다.")
        keep_a = []
        move_to_detected = []
        for i, item in enumerate(confirmed["likely_absent_equipment"]):
            key = f"absent_{i}"
            actually_exists = st.checkbox(
                f"**{item.get('name','?')}** — 실제로 존재함",
                value=False, key=key, help=item.get("reason", ""),
            )
            if actually_exists:
                move_to_detected.append({
                    "category": item.get("category", ""),
                    "name": item.get("name", ""),
                    "status": "존재확인(사용자 수정)",
                    "note": "사용자가 부재→탐지로 수정",
                })
                confirmed["user_corrections"].append({"type": "absent_to_detected", "item": item})
            else:
                keep_a.append(item)
        confirmed["likely_absent_equipment"] = keep_a
        confirmed["detected_equipment"].extend(move_to_detected)

    with tab_m:
        st.caption("AI가 확신하지 못한 항목입니다. 하나씩 판단해 주세요.")
        resolved = []
        for i, item_text in enumerate(confirmed["ambiguous_items"]):
            key = f"ambig_{i}"
            decision = st.radio(
                item_text,
                ["판단 유보", "존재함 (탐지)", "없음 (부재)"],
                key=key, horizontal=True,
            )
            resolved.append({"text": item_text, "decision": decision})
            if decision != "판단 유보":
                confirmed["user_corrections"].append({
                    "type": f"ambig_resolved_{decision}",
                    "item": item_text,
                })
        confirmed["ambiguous_resolutions"] = resolved

    st.session_state["stage2_confirmed"] = confirmed
    if st.button("설비 확정 저장", type="primary"):
        st.success(f"확정 완료 · 수정 {len(confirmed.get('user_corrections', []))}건 기록")

# 단계 3 결과
if s3 and _show_checklist_and_score:
    divider()
    st.markdown("<div class='sl-num'>결과 03</div>"
                "<div class='sl-h'>맞춤 점검표</div>", unsafe_allow_html=True)
    items = s3.get("items", []) or []
    st.caption(f"{s3.get('checklist_name','-')} · 총 {len(items)}개 항목")
    if s3.get("rationale"):
        st.info(f"맞춤화 근거: {s3['rationale']}")
    if items:
        df = pd.DataFrame(items)
        st.dataframe(df, use_container_width=True, hide_index=True)

    # ─────────────────────────────────────────
    # (D) 현장 점검
    # ─────────────────────────────────────────
    divider()
    section("03", "현장 점검 입력", "AI가 생성한 점검표에 현장 결과를 입력하세요.")

    if st.session_state.get("demo_mode"):
        col_a, col_b, col_c = st.columns(3)
        if col_a.button("전체 '양호'로 채우기", use_container_width=True):
            st.session_state["item_scores"] = {str(itm.get("no")): 1.0 for itm in items}
            st.rerun()
        if col_b.button("무작위 샘플 채우기", use_container_width=True):
            import random
            random.seed(42)
            st.session_state["item_scores"] = {
                str(itm.get("no")): random.choice([1.0, 1.0, 0.5, 0.0]) for itm in items
            }
            st.rerun()
        if col_c.button("입력 초기화", use_container_width=True):
            st.session_state["item_scores"] = {}
            st.rerun()

    scores: dict[str, float] = dict(st.session_state.get("item_scores") or {})
    for itm in items:
        no = str(itm.get("no"))
        basis = itm.get("basis") or ""
        basis_html = (f"<div style='color:#9A9A9F;font-size:11px;margin-top:2px;'>"
                      f"근거: {basis}</div>" if basis else "")
        st.markdown(
            f"<div style='padding:10px 0 2px 0;'>"
            f"<b style='color:#D50000'>{itm.get('no')}.</b> {itm.get('title','')}"
            f"{basis_html}</div>",
            unsafe_allow_html=True,
        )
        try:
            current = float(scores.get(no, 1.0))
        except (TypeError, ValueError):
            current = 1.0
        idx = [1.0, 0.5, 0.0].index(current) if current in [1.0, 0.5, 0.0] else 0
        val = st.radio(
            "충족도",
            options=[1.0, 0.5, 0.0],
            format_func=lambda x: {1.0: "양호", 0.5: "불량", 0.0: "부재"}[x],
            index=idx, horizontal=True, key=f"score_{no}",
            label_visibility="collapsed",
        )
        scores[no] = val
    st.session_state["item_scores"] = scores

    # (E) 점수 계산
    divider()
    if st.button("안전 점수 계산 · 추천 생성", type="primary", use_container_width=True):
        from modules.laws import STANDARD_ITEMS
        title_to_std = {}
        for itm in items:
            title = (itm.get("title", "") + " " + itm.get("category", ""))
            for std in STANDARD_ITEMS:
                if std in title:
                    title_to_std[str(itm.get("no"))] = std
                    break
        std_scores: dict[str, float] = {}
        for no, val in scores.items():
            std = title_to_std.get(no)
            if std and std not in std_scores:
                std_scores[std] = val
        result = calculate_safety_score(std_scores)
        st.session_state["score_result"] = result
        st.session_state["recommendations"] = recommend_from_scores(std_scores)
        st.success("계산 완료")
        st.rerun()

# 점수 결과
sr = st.session_state.get("score_result")
if sr and _show_checklist_and_score:
    divider()
    section("04", "안전 점수 결과")

    c1, c2, c3 = st.columns(3)
    c1.metric("종합 점수", f"{sr['score']}점")
    c2.metric("등급", sr["grade"])
    desc = sr.get("grade_description", "") or ""
    c3.metric("등급 설명", desc[:24] + ("…" if len(desc) > 24 else ""))

    # 게이지
    fig = go.Figure(go.Indicator(
        mode="gauge+number", value=sr["score"],
        domain={'x': [0, 1], 'y': [0, 1]}, title=None,
        gauge={
            'axis': {'range': [0, 100], 'tickcolor': "#6B6B70"},
            'bar': {'color': "#D50000"},
            'steps': [
                {'range': [0, 60], 'color': "#FFEBEB"},
                {'range': [60, 80], 'color': "#FFF5E0"},
                {'range': [80, 100], 'color': "#E8F5E9"},
            ],
            'bordercolor': "#E5E5E8",
        }
    ))
    fig.update_layout(height=260, margin=dict(l=20, r=20, t=20, b=20),
                      paper_bgcolor="#FFFFFF", font=dict(family="Inter, Pretendard, sans-serif"))
    st.plotly_chart(fig, use_container_width=True)

    # 레이더
    cats = sr.get("category_scores") or {}
    if cats:
        fig2 = go.Figure()
        fig2.add_trace(go.Scatterpolar(
            r=[cats[c]["score"] for c in CATEGORIES if c in cats],
            theta=[c for c in CATEGORIES if c in cats],
            fill="toself", line_color="#D50000", fillcolor="rgba(213,0,0,0.15)",
            name="카테고리 점수",
        ))
        fig2.update_layout(
            polar={'radialaxis': {'visible': True, 'range': [0, 100], 'gridcolor': "#E5E5E8"}},
            showlegend=False, height=340, margin=dict(l=20, r=20, t=20, b=20),
            paper_bgcolor="#FFFFFF",
        )
        st.plotly_chart(fig2, use_container_width=True)

    divider()
    colL, colR = st.columns([1, 1])
    with colL:
        if st.button("다른 공간 이어서 점검", use_container_width=True):
            from modules.session import reset_inspection
            reset_inspection()
            st.session_state["shots"] = _shots_dict()
            st.switch_page("pages/1_점검시작.py")
    with colR:
        if st.button("결과 저장·발송으로 →", type="primary", use_container_width=True):
            st.switch_page("pages/3_결과저장.py")
