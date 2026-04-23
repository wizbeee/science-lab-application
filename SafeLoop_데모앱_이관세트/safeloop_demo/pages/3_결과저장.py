"""
Step 6~7 — 공간별 점검 결과 확인 + AI 추천 + 이중 저장 + 에듀파인/앱 발송.

[1] 공간별 결과 확인 (당일 세션 내 여러 공간 비교 가능)
[2] AI 추천 안전 설비 (부재·불량 기준, 법령 근거 + 우선순위)
[3] 이중 저장 — Human-readable(PDF·Excel·CSV) + Machine-readable(JSON 3종)
[4] 에듀파인 발송 준비 (결재라인 지정 → 공문 품의서 + 첨부 ZIP 생성)
[5] 앱 직접 발송 (결재 완료 증빙 후에만 활성화 → 교육청 수신함으로 JSON 전송)
"""
from __future__ import annotations

import datetime

import pandas as pd
import plotly.express as px
import streamlit as st

from modules.recommend import recommend_from_scores
from modules.session import ensure_state, require_school
from modules.storage import (
    build_csv,
    build_edufine_zip,
    build_excel,
    build_master_record,
    build_official_letter_pdf,
    build_pdf_report,
    list_recent_sessions,
    save_inspection,
    send_to_edu_app,
)
from modules.ui import apply_theme, divider, hero, section

st.set_page_config(page_title="결과 저장·발송 · SafeLoop", page_icon="/", layout="wide")
apply_theme()
ensure_state()

school = require_school()
if not school:
    if st.button("← 학교 찾기로"):
        st.switch_page("pages/1_점검시작.py")
    st.stop()

sr = st.session_state.get("score_result")
if not sr:
    st.warning("점검 결과가 아직 없습니다. AI 점검을 먼저 완료하세요.")
    if st.button("← AI 점검으로"):
        st.switch_page("pages/2_AI점검.py")
    st.stop()

hero(
    "STEP 03",
    "결과 저장 · 발송",
    f"{school['학교명']} · {st.session_state['active_space']['type']} "
    f"({st.session_state['active_space'].get('nickname') or '-'})",
)

# ─────────────────────────────────────────
# (1) 공간별 점검 결과 확인
# ─────────────────────────────────────────
section("01", "점검 결과 확인")

col1, col2, col3, col4 = st.columns(4)
col1.metric("종합 점수", f"{sr['score']}점")
col2.metric("등급", sr["grade"])
col3.metric("카테고리", str(len(sr.get("category_scores", {}))))
col4.metric("적용 법령", "6개")

# 이번 세션과 과거 저장분
prior = [s for s in list_recent_sessions(limit=50)
         if s["school_code"] == school["정보공시 학교코드"]]
current_space = st.session_state["active_space"]["type"]

if prior:
    st.markdown("##### 본교 최근 점검 기록")
    df_prior = pd.DataFrame([{
        "점검일시": s["timestamp"][:16] if s["timestamp"] else "",
        "공간": f"{s['space_type']} ({s['space_nickname'] or '-'})",
        "점수": s["score"],
        "등급": s["grade"],
    } for s in prior[:10]])
    st.dataframe(df_prior, use_container_width=True, hide_index=True)
else:
    st.caption("본교의 저장된 점검 이력이 없습니다. (첫 점검)")

# 카테고리별 점수 막대
cats = sr.get("category_scores") or {}
if cats:
    st.markdown("##### 카테고리별 점수")
    cat_df = pd.DataFrame([
        {"카테고리": k, "점수": v["score"], "가중치합": v["weight_sum"]}
        for k, v in cats.items()
    ]).sort_values("점수", ascending=True)
    fig = px.bar(cat_df, x="점수", y="카테고리", orientation="h",
                 text="점수", range_x=[0, 100],
                 color="점수", color_continuous_scale=["#D50000", "#FFC107", "#4CAF50"])
    fig.update_layout(height=320, margin=dict(l=20, r=20, t=20, b=20), coloraxis_showscale=False)
    st.plotly_chart(fig, use_container_width=True)

# ─────────────────────────────────────────
# (2) AI 추천
# ─────────────────────────────────────────
divider()
section("02", "AI 추천 안전 설비", "부재·불량 설비에 대해 법령 근거와 우선순위를 함께 제시합니다.")

if st.button("추천 생성", use_container_width=False):
    st.session_state["recommendations"] = recommend_from_scores(sr.get("raw", {}))
    st.rerun()

recs = st.session_state.get("recommendations") or []
if recs:
    rec_df = pd.DataFrame(recs)[
        ["priority", "item", "category", "law", "article", "action", "reason"]
    ].rename(columns={
        "priority": "우선순위", "item": "항목", "category": "분류",
        "law": "법령", "article": "조항", "action": "조치", "reason": "사유",
    })
    st.dataframe(rec_df, use_container_width=True, hide_index=True)
    st.caption(f"총 {len(recs)}건 · 비용·구매처는 향후 확장 영역")
else:
    st.info("추천 항목이 없습니다. (전체 양호)")

# ─────────────────────────────────────────
# (3) 이중 저장
# ─────────────────────────────────────────
divider()
section("03", "학교 클라우드 저장", "사람이 읽는 형태와 기계가 읽는 형태 모두 자동 생성됩니다.")

st.markdown(
    "<div class='sl-card'>"
    "<b>사람이 읽는 형태</b> — PDF 보고서 · Excel · CSV · 공문(품의서) PDF<br>"
    "<b>기계가 읽는 형태</b> — 원본 JSON · 교육청 발송 패키지 JSON · 공공데이터 환원 패키지 JSON"
    "</div>",
    unsafe_allow_html=True,
)

col_save1, col_save2 = st.columns([2, 1])
with col_save1:
    if st.button("학교 클라우드에 저장", type="primary", use_container_width=True):
        result = save_inspection({**st.session_state, "timestamp": datetime.datetime.now().isoformat()})
        st.session_state["saved_session_id"] = result["session_id"]
        st.success(f"저장 완료 · 세션 ID `{result['session_id']}`")
        with st.expander("생성된 파일"):
            for fn in result["files"]:
                st.markdown(f"- `{fn}`")

with col_save2:
    if st.session_state.get("saved_session_id"):
        st.success("✅ 저장됨")
        st.caption(st.session_state["saved_session_id"])

# 사용자 추가 다운로드
if st.session_state.get("saved_session_id"):
    st.markdown("##### 사용자 다운로드 (원하는 포맷 개별 선택)")

    master = build_master_record({**st.session_state,
                                   "session_id": st.session_state.get("saved_session_id")})

    cd1, cd2, cd3, cd4 = st.columns(4)
    cd1.download_button(
        "보고서 PDF",
        build_pdf_report(master),
        file_name=f"점검결과보고서_{st.session_state['saved_session_id']}.pdf",
        mime="application/pdf",
        use_container_width=True,
    )
    cd2.download_button(
        "Excel",
        build_excel(master),
        file_name=f"점검결과_{st.session_state['saved_session_id']}.xlsx",
        mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        use_container_width=True,
    )
    cd3.download_button(
        "CSV",
        build_csv(master),
        file_name=f"점검결과_{st.session_state['saved_session_id']}.csv",
        mime="text/csv",
        use_container_width=True,
    )
    cd4.download_button(
        "원본 JSON",
        bytes(__import__("json").dumps(master, ensure_ascii=False, indent=2), "utf-8"),
        file_name=f"master_{st.session_state['saved_session_id']}.json",
        mime="application/json",
        use_container_width=True,
    )

# ─────────────────────────────────────────
# (4) 에듀파인 발송 준비
# ─────────────────────────────────────────
divider()
section("04", "에듀파인 발송 준비", "공식 경로 — 결재라인을 거쳐 교육청으로 전달됩니다.")

st.markdown(
    "학교 공식 보고는 **에듀파인 결재라인**을 통해 이루어집니다. "
    "앱이 결재·첨부 문서를 자동 생성하므로, 담당자는 에듀파인에 업로드 후 결재만 올리면 됩니다."
)

with st.expander("결재라인 지정 (담당자 → 부장 → 교감 → 교장)"):
    eduline = st.session_state.get("eduline") or {}
    c1, c2, c3, c4 = st.columns(4)
    eduline["담당자"] = c1.text_input("담당자", value=eduline.get("담당자", ""))
    eduline["부장"] = c2.text_input("부장", value=eduline.get("부장", ""))
    eduline["교감"] = c3.text_input("교감", value=eduline.get("교감", ""))
    eduline["교장"] = c4.text_input("교장", value=eduline.get("교장", ""))
    st.session_state["eduline"] = eduline

col_pkg1, col_pkg2 = st.columns([2, 1])
with col_pkg1:
    if st.button("에듀파인 업로드용 패키지(ZIP) 생성", use_container_width=True):
        if not st.session_state.get("saved_session_id"):
            save_inspection({**st.session_state, "timestamp": datetime.datetime.now().isoformat()})
        st.session_state["edu_package_ready"] = True
        st.success("패키지가 준비되었습니다. 아래에서 다운로드하세요.")

with col_pkg2:
    if st.session_state.get("edu_package_ready"):
        zip_bytes = build_edufine_zip({**st.session_state,
                                        "session_id": st.session_state.get("saved_session_id")})
        st.download_button(
            "에듀파인 ZIP 다운로드",
            zip_bytes,
            file_name=f"에듀파인_패키지_{st.session_state.get('saved_session_id','')}.zip",
            mime="application/zip",
            use_container_width=True,
            type="primary",
        )

# 공문 품의서 단독 미리보기
if st.session_state.get("edu_package_ready"):
    master = build_master_record({**st.session_state,
                                   "session_id": st.session_state.get("saved_session_id")})
    st.download_button(
        "공문(품의서) PDF만 다운로드",
        build_official_letter_pdf(master),
        file_name="에듀파인_품의서.pdf",
        mime="application/pdf",
    )

# ─────────────────────────────────────────
# (5) 앱 직접 발송 (옵션 2)
# ─────────────────────────────────────────
divider()
section("05", "앱 직접 발송", "에듀파인 결재 완료 후 구조화 JSON을 교육청 담당자에게 직접 전송합니다.")

st.markdown(
    "에듀파인 공문과 **동일 내용의 구조화 JSON**을 교육청 담당자 수신 모듈로 직접 전송합니다. "
    "KEIIS 입력·공공데이터 환원 자동화를 위한 경로로, **에듀파인 결재 완료 후에만 활성화**됩니다."
)

col_ap1, col_ap2 = st.columns(2)
with col_ap1:
    approved = st.checkbox(
        "에듀파인 결재 완료 확인",
        value=st.session_state.get("edufine_approved", False),
        help="에듀파인에서 결재가 완료된 경우에만 체크하세요. 결재 미완료 상태에서 전송 시 학교 행정 원칙 위반.",
    )
    st.session_state["edufine_approved"] = approved

with col_ap2:
    if st.button("교육청 수신함으로 전송", type="primary", use_container_width=True,
                 disabled=not approved):
        if not st.session_state.get("saved_session_id"):
            save_inspection({**st.session_state, "timestamp": datetime.datetime.now().isoformat()})
        result = send_to_edu_app({**st.session_state,
                                   "session_id": st.session_state.get("saved_session_id")})
        if result.get("ok"):
            st.session_state["edu_app_sent"] = True
            st.success(f"전송 완료 · 수신 위치: `{result['path']}`")
            st.balloons()
        else:
            st.error(result.get("reason", "전송 실패"))

if st.session_state.get("edu_app_sent"):
    st.info(
        "교육청 수신함에서 검증·익명화 후 KEIIS 업로드 → 공공데이터 환원이 이어집니다. "
        "진행 상황은 **🔁 데이터 순환** 페이지에서 확인할 수 있습니다."
    )
    colN1, colN2 = st.columns(2)
    if colN1.button("데이터 순환 보기", use_container_width=True):
        st.switch_page("pages/6_데이터순환.py")
    if colN2.button("본교 현황 보기", use_container_width=True):
        st.switch_page("pages/4_본교현황.py")

divider()
colX, colY = st.columns(2)
if colX.button("다른 공간 이어서 점검", use_container_width=True):
    from modules.session import reset_inspection
    reset_inspection()
    st.switch_page("pages/1_점검시작.py")
if colY.button("홈으로", use_container_width=True):
    st.switch_page("app.py")
