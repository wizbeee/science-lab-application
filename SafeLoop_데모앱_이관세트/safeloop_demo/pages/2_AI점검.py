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
# 촬영 샷 정의 — 공간 무관 공통
# ─────────────────────────────────────────
SHOTS: list[dict] = [
    {
        "key": "wide_front",
        "no": "01",
        "title": "공간 전체 · 정면",
        "guide": "공간 입구에서 내부 전경 전체가 프레임에 담기도록 촬영합니다. 가로 구도 권장.",
        "required": True,
    },
    {
        "key": "wide_side",
        "no": "02",
        "title": "공간 전체 · 측면",
        "guide": "90° 돌아서 측면 벽면과 그 앞 집기·설비가 보이도록 촬영합니다.",
        "required": True,
    },
    {
        "key": "wide_rear",
        "no": "03",
        "title": "공간 전체 · 후면",
        "guide": "반대편 벽·창문·출입구 방향을 향해 전경을 촬영합니다.",
        "required": True,
    },
    {
        "key": "close_emergency",
        "no": "04",
        "title": "안전 설비 근접",
        "guide": "비상샤워 · 세안기 · 소화기 · 흄후드 등 주요 안전 설비를 가까이서 촬영합니다. "
                 "여러 설비가 있다면 개별로 분할 촬영해도 좋습니다.",
        "required": False,
    },
    {
        "key": "close_storage",
        "no": "05",
        "title": "보관·격리 설비",
        "guide": "시약장 · 가스용기 보관함 · 폐액 용기 등 보관 관련 설비를 근접 촬영합니다.",
        "required": False,
    },
    {
        "key": "close_ceiling",
        "no": "06",
        "title": "천장·감지기·안내 표지",
        "guide": "천장의 화재·연기·가스 감지기, 배기구, 안전수칙·비상대응 포스터를 촬영합니다.",
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
# (A) 샷별 촬영 카드
# ─────────────────────────────────────────
section(
    "01", "사진 촬영",
    f"누적 {total_photos}장 · 필수 구도 {required_filled}/{required_total} 충족"
    + (" · AI 분석 가능" if total_photos >= 3 and required_filled >= required_total else ""),
)

st.markdown(
    "<div style='font-size:13px; color:#6B6B70; margin-bottom:12px;'>"
    "각 구도별로 <b>한 장 이상</b> 촬영하세요. 장면이 넓거나 대상이 여러 개면 "
    "같은 구도 안에서 <b>여러 장 덧촬영</b>해도 됩니다. "
    "필수 구도 3장을 모두 채우고 총 3장 이상이면 AI 분석이 가능합니다. "
    "<b>iPhone은 HTTPS 접속 필요.</b>"
    "</div>",
    unsafe_allow_html=True,
)

# 시연 모드 — 샘플 일괄 로드
if st.session_state.get("demo_mode"):
    with st.expander("시연 모드 · 샘플 사진 일괄 로드", expanded=False):
        sample_choice = st.radio(
            "샘플 공간",
            ["화학실 샘플 (6장)", "물리실 샘플 (7장)"],
            horizontal=True,
            key="sample_choice",
        )
        if st.button("샘플 불러와서 6개 샷에 분배", use_container_width=True):
            root = Path(__file__).resolve().parent.parent / "sample_images"
            sub = "chemistry_lab" if "화학실" in sample_choice else "physics_lab"
            paths = sorted((root / sub).glob("*.jpg"))
            # 리셋 후 분배
            for s in SHOTS:
                shots_state[s["key"]] = []
            for i, p in enumerate(paths):
                # 앞 6장은 샷 1~6에 1:1, 7번째 이후는 샷 04(근접)에 덧붙임
                target = SHOTS[i]["key"] if i < len(SHOTS) else "close_emergency"
                shots_state[target].append({
                    "name": p.name, "bytes": p.read_bytes(), "source": "sample",
                })
            for k in ["stage1_result", "stage2_result", "stage2_confirmed", "stage3_result"]:
                st.session_state[k] = None
            st.rerun()

# 각 샷 카드
for s in SHOTS:
    key = s["key"]
    photos = shots_state.setdefault(key, [])
    count = len(photos)
    status_html = (
        f"<span class='sl-status-ok'>● {count}장 촬영됨</span>"
        if count else f"<span class='sl-status-empty'>○ 촬영 대기</span>"
    )
    required_label = "필수" if s["required"] else "권장"
    required_pill_class = "sl-pill-red" if s["required"] else "sl-pill"

    # 카드 헤더 (명칭 · 가이드) — 들여쓰기 제거 (마크다운 코드블록 오인 방지)
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

    # 카드 본문 — 기촬영 썸네일 그리드 + 카메라 + 전체 삭제
    with st.container():
        # 기촬영 썸네일 (삭제 개별)
        if photos:
            thumb_cols = st.columns(min(4, max(1, count)))
            for idx, p in enumerate(photos):
                with thumb_cols[idx % len(thumb_cols)]:
                    st.image(p["bytes"],
                             caption=f"{s['no']}-{idx+1}",
                             use_container_width=True)
                    if st.button("삭제", key=f"del_{key}_{idx}", use_container_width=True):
                        photos.pop(idx)
                        st.rerun()

        # 카메라 입력 (rotating key로 위젯 리셋)
        counter_key = f"cam_ctr_{key}"
        if counter_key not in st.session_state:
            st.session_state[counter_key] = 0
        cam_widget_key = f"cam_{key}_{st.session_state[counter_key]}"

        snap = st.camera_input(
            f"사진 추가 · {s['title']}",
            key=cam_widget_key,
            label_visibility="collapsed",
        )
        if snap is not None:
            new_bytes = snap.getvalue()
            # 동일 바이트 중복 방지 (rerun 시)
            if not photos or photos[-1]["bytes"] != new_bytes:
                photos.append({
                    "name": f"{key}_{len(photos)+1}.jpg",
                    "bytes": new_bytes,
                    "source": "camera",
                })
                st.session_state[counter_key] += 1
                st.rerun()

        # 이 샷 전체 비우기
        if photos:
            if st.button("이 구도 전체 비우기", key=f"clear_shot_{key}"):
                shots_state[key] = []
                st.session_state[counter_key] = st.session_state.get(counter_key, 0) + 1
                st.rerun()

    # 카드 분리
    st.markdown("<div style='height:10px;'></div>", unsafe_allow_html=True)

# 전체 초기화
colR1, colR2 = st.columns([4, 1])
with colR2:
    if st.button("전체 초기화", key="reset_shots"):
        st.session_state["shots"] = _shots_dict()
        # 카메라 위젯 카운터도 리셋
        for s in SHOTS:
            ck = f"cam_ctr_{s['key']}"
            if ck in st.session_state:
                st.session_state[ck] += 1
        for k in ["stage1_result", "stage2_result", "stage2_confirmed", "stage3_result"]:
            st.session_state[k] = None
        st.rerun()

# ─────────────────────────────────────────
# (B) AI 3단계 파이프라인
# ─────────────────────────────────────────
divider()

# 모든 샷의 사진을 평탄화 + 라벨 부여 ("03-1" 식)
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
section(
    "02", "AI 맞춤 점검표 자동 생성",
    f"누적 {total_filled}장 · 필수 구도 {required_filled}/{required_total}"
    + (" · 분석 가능" if analysis_ready else " · 조건 미충족"),
)

if not api_key_available():
    st.error("ANTHROPIC_API_KEY가 설정되지 않았습니다. .env 또는 Streamlit Secrets를 확인하세요.")
else:
    col_a, col_b = st.columns([1, 3])
    with col_a:
        use_cache = st.checkbox("캐시 사용", value=True, help="동일 사진 재분석 시 API 호출 생략.")
    with col_b:
        run_disabled = not analysis_ready
        if st.button("AI 점검표 자동 생성", type="primary", use_container_width=True,
                     disabled=run_disabled):
            images = all_photos
            labels = all_labels
            prog = st.progress(0, text="단계 1/3 · 공간 유형 식별 중…")
            try:
                s1 = run_stage1(images, use_cache=use_cache, image_labels=labels)
                st.session_state["stage1_result"] = s1
                prog.progress(33, text=f"단계 1 완료 · {s1.get('_elapsed_sec','?')}초")

                space_type = s1.get("space_type_primary") or space["type"]
                prog.progress(40, text="단계 2/3 · 안전 설비 탐지 중…")
                s2 = run_stage2(images, space_type, use_cache=use_cache, image_labels=labels)
                st.session_state["stage2_result"] = s2
                st.session_state["stage2_confirmed"] = None
                prog.progress(66, text=f"단계 2 완료 · {s2.get('_elapsed_sec','?')}초")

                prog.progress(75, text="단계 3/3 · 맞춤 점검표 생성 중…")
                s3 = run_stage3(s1, s2, use_cache=use_cache)
                st.session_state["stage3_result"] = s3
                prog.progress(100, text=f"단계 3 완료 · {s3.get('_elapsed_sec','?')}초")
            except Exception as e:
                st.error(f"AI 호출 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.")
                with st.expander("상세 로그"):
                    st.exception(e)

# 결과 표시
s1 = st.session_state.get("stage1_result")
s2 = st.session_state.get("stage2_result")
s3 = st.session_state.get("stage3_result")

if s1:
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
if s2:
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
if s3:
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
if sr:
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
