"""
이중 저장 모듈 — Human-readable + Machine-readable 동시 생성.

Human-readable: PDF, Excel(.xlsx), CSV
Machine-readable: 원본 JSON + 교육청 발송 패키지 JSON + 공공데이터 환원 패키지 JSON

저장 경로: school_storage/{학교코드}/{점검ID}/
"""
from __future__ import annotations

import datetime
import hashlib
import io
import json
import uuid
import zipfile
from pathlib import Path

import pandas as pd
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    Paragraph, Spacer, Table, TableStyle, SimpleDocTemplate, PageBreak,
)

from modules.data_loader import anonymize_code

ROOT = Path(__file__).resolve().parent.parent
STORAGE_DIR = ROOT / "school_storage"
EDU_RECEIPT_DIR = ROOT / "mock_edu_receipt"
STORAGE_DIR.mkdir(exist_ok=True)
EDU_RECEIPT_DIR.mkdir(exist_ok=True)


# ─────────────────────────────────────────
# 한글 폰트 등록 (ReportLab)
# ─────────────────────────────────────────
_FONT_REGISTERED = False


def _ensure_font() -> str:
    """시스템 폰트를 찾아 PDF에 한글 지원."""
    global _FONT_REGISTERED
    if _FONT_REGISTERED:
        return "KoreanFont"

    candidates = [
        "C:/Windows/Fonts/malgun.ttf",
        "C:/Windows/Fonts/malgunbd.ttf",
        "C:/Windows/Fonts/NanumGothic.ttf",
        "/usr/share/fonts/truetype/nanum/NanumGothic.ttf",
        "/System/Library/Fonts/AppleSDGothicNeo.ttc",
    ]
    for path in candidates:
        if Path(path).exists():
            try:
                pdfmetrics.registerFont(TTFont("KoreanFont", path))
                _FONT_REGISTERED = True
                return "KoreanFont"
            except Exception:
                continue
    return "Helvetica"


# ─────────────────────────────────────────
# 저장 경로
# ─────────────────────────────────────────
def session_dir(school_code: str, session_id: str) -> Path:
    safe_code = str(school_code).replace("/", "_")
    path = STORAGE_DIR / safe_code / session_id
    path.mkdir(parents=True, exist_ok=True)
    return path


def new_session_id() -> str:
    return datetime.datetime.now().strftime("%Y%m%d-%H%M%S") + "-" + uuid.uuid4().hex[:6]


# ─────────────────────────────────────────
# Machine-readable: JSON 3종
# ─────────────────────────────────────────
def build_master_record(session: dict) -> dict:
    """세션 상태 전체를 원본 JSON으로 직렬화."""
    school = session.get("school") or {}
    active_space = session.get("active_space") or {}
    return {
        "schema_version": "1.0",
        "record_type": "safeloop_inspection_master",
        "session_id": session.get("session_id"),
        "timestamp": datetime.datetime.now().isoformat(),
        "school": {
            "code": school.get("정보공시 학교코드"),
            "name": school.get("학교명"),
            "sido": school.get("시도교육청"),
            "region": school.get("지역"),
            "level": school.get("학교급"),
            "establishment": school.get("설립구분"),
        },
        "space": {
            "id": active_space.get("space_id"),
            "type": active_space.get("type"),
            "nickname": active_space.get("nickname"),
        },
        "ai_pipeline": {
            "stage1": session.get("stage1_result"),
            "stage2_raw": session.get("stage2_result"),
            "stage2_confirmed": session.get("stage2_confirmed"),
            "stage3": session.get("stage3_result"),
        },
        "inspection": {
            "item_scores": session.get("item_scores"),
            "score_result": session.get("score_result"),
        },
        "recommendations": session.get("recommendations"),
        "approval": {
            "eduline": session.get("eduline"),
            "edufine_approved": session.get("edufine_approved"),
        },
    }


def build_edu_package(master: dict) -> dict:
    """교육청(KEIIS 연계) 발송용 패키지 — 식별 유지·구조화."""
    score = (master.get("inspection") or {}).get("score_result") or {}
    return {
        "schema_version": "1.0",
        "record_type": "keiis_submission",
        "submission_timestamp": datetime.datetime.now().isoformat(),
        "basis_law": "교육시설법 제10조 제3항 — 안전·유지관리기준 자체 점검",
        "school_identified": master.get("school"),
        "space": master.get("space"),
        "safety_score": score.get("score"),
        "grade": score.get("grade"),
        "category_scores": score.get("category_scores"),
        "detected_equipment": ((master.get("ai_pipeline") or {}).get("stage2_confirmed") or {}).get("detected_equipment"),
        "absent_equipment": ((master.get("ai_pipeline") or {}).get("stage2_confirmed") or {}).get("likely_absent_equipment"),
        "checklist_items": ((master.get("ai_pipeline") or {}).get("stage3") or {}).get("items"),
        "recommendations": master.get("recommendations"),
        "approval_trail": master.get("approval"),
    }


def build_opendata_package(master: dict) -> dict:
    """공공데이터 환원용 패키지 — 완전 익명화 + 집계 친화."""
    school = master.get("school") or {}
    score = (master.get("inspection") or {}).get("score_result") or {}
    s2_conf = ((master.get("ai_pipeline") or {}).get("stage2_confirmed") or {})
    stage3 = ((master.get("ai_pipeline") or {}).get("stage3") or {})

    return {
        "schema_version": "1.0",
        "record_type": "opendata_anonymous_inspection",
        "release_timestamp": datetime.datetime.now().isoformat(),
        "basis_law": "공공데이터법 — 업무 부산물 개방",
        "school_anonymous_id": anonymize_code(school.get("code") or ""),
        "sido": school.get("sido"),
        "school_level": school.get("level"),
        "establishment": school.get("establishment"),
        "space_type": (master.get("space") or {}).get("type"),
        "safety_score": score.get("score"),
        "grade": score.get("grade"),
        "category_scores": score.get("category_scores"),
        "detected_count": len((s2_conf.get("detected_equipment") or [])),
        "absent_count": len((s2_conf.get("likely_absent_equipment") or [])),
        "checklist_item_count": len((stage3.get("items") or [])),
    }


# ─────────────────────────────────────────
# Human-readable: CSV · Excel · PDF
# ─────────────────────────────────────────
def build_checklist_dataframe(master: dict) -> pd.DataFrame:
    items = (((master.get("ai_pipeline") or {}).get("stage3") or {}).get("items")) or []
    scores = ((master.get("inspection") or {}).get("item_scores")) or {}
    rows = []
    for itm in items:
        no = itm.get("no")
        title = itm.get("title", "")
        val = scores.get(str(no)) or scores.get(no) or scores.get(title) or ""
        label = {1.0: "양호", 0.5: "불량", 0.0: "부재"}.get(float(val), "미입력") if val != "" else "미입력"
        rows.append({
            "번호": no,
            "카테고리": itm.get("category"),
            "점검 제목": title,
            "점검 방법": itm.get("method"),
            "합격 기준": itm.get("criterion"),
            "법적 근거": itm.get("basis"),
            "항목 유형": itm.get("item_type"),
            "우선순위": itm.get("priority"),
            "점검 결과": label,
        })
    return pd.DataFrame(rows)


def build_csv(master: dict) -> bytes:
    df = build_checklist_dataframe(master)
    return df.to_csv(index=False, encoding="utf-8-sig").encode("utf-8-sig")


def build_excel(master: dict) -> bytes:
    df_checklist = build_checklist_dataframe(master)
    buf = io.BytesIO()
    with pd.ExcelWriter(buf, engine="openpyxl") as writer:
        # 시트 1: 요약
        school = master.get("school") or {}
        space = master.get("space") or {}
        score = (master.get("inspection") or {}).get("score_result") or {}
        summary = pd.DataFrame([
            ["학교명", school.get("name", "")],
            ["학교코드", school.get("code", "")],
            ["지역", school.get("region", "")],
            ["학교급", school.get("level", "")],
            ["공간 유형", space.get("type", "")],
            ["공간 별칭", space.get("nickname", "")],
            ["안전 점수", score.get("score", "")],
            ["등급", score.get("grade", "")],
            ["점검 일시", master.get("timestamp", "")],
            ["근거 법령", "교육시설법 제10조 3항 자체 점검"],
        ], columns=["항목", "값"])
        summary.to_excel(writer, sheet_name="요약", index=False)

        # 시트 2: 점검표
        df_checklist.to_excel(writer, sheet_name="점검표", index=False)

        # 시트 3: 카테고리별 점수
        cat_scores = (score.get("category_scores") or {})
        cat_df = pd.DataFrame([
            {"카테고리": k, "점수(%)": v.get("score"), "가중치 합계": v.get("weight_sum")}
            for k, v in cat_scores.items()
        ])
        if not cat_df.empty:
            cat_df.to_excel(writer, sheet_name="카테고리점수", index=False)

        # 시트 4: 추천
        recs = master.get("recommendations") or []
        if recs:
            rec_df = pd.DataFrame(recs)
            rec_df.to_excel(writer, sheet_name="안전설비추천", index=False)

    buf.seek(0)
    return buf.read()


def build_pdf_report(master: dict) -> bytes:
    """점검 결과 보고서(PDF) — 결재·첨부용 공식 문서 스타일."""
    font = _ensure_font()
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4,
                            leftMargin=20 * mm, rightMargin=20 * mm,
                            topMargin=18 * mm, bottomMargin=18 * mm)
    styles = getSampleStyleSheet()
    h_style = ParagraphStyle("H", parent=styles["Heading1"], fontName=font, fontSize=16,
                             alignment=1, spaceAfter=10)
    sub_style = ParagraphStyle("Sub", parent=styles["Heading2"], fontName=font, fontSize=12,
                               spaceBefore=10, spaceAfter=6, textColor=colors.HexColor("#0A0A0B"))
    body = ParagraphStyle("Body", parent=styles["BodyText"], fontName=font, fontSize=10, leading=14)

    school = master.get("school") or {}
    space = master.get("space") or {}
    score = (master.get("inspection") or {}).get("score_result") or {}
    stage1 = (master.get("ai_pipeline") or {}).get("stage1") or {}

    flow = []
    flow.append(Paragraph("학교 안전 점검 결과 보고서", h_style))
    flow.append(Paragraph(
        f"세이프루프(SafeLoop) · 교육시설법 제10조 3항 자체 점검 · 생성일 {datetime.datetime.now():%Y-%m-%d}",
        body))
    flow.append(Spacer(1, 6 * mm))

    # 기본 정보
    flow.append(Paragraph("■ 기본 정보", sub_style))
    basic = [
        ["학교명", school.get("name", "") or ""],
        ["학교코드", school.get("code", "") or ""],
        ["소재지", school.get("region", "") or ""],
        ["학교급/설립", f"{school.get('level','') or ''} / {school.get('establishment','') or ''}"],
        ["점검 공간", f"{space.get('type','') or ''} ({space.get('nickname') or '-'})"],
        ["AI 공간 식별", f"{stage1.get('space_type_primary','')} (신뢰도 {float(stage1.get('confidence',0))*100:.0f}%)"],
        ["점검 일시", str(master.get("timestamp", ""))],
    ]
    t = Table(basic, colWidths=[40 * mm, 120 * mm])
    t.setStyle(TableStyle([
        ("FONT", (0, 0), (-1, -1), font, 10),
        ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#F7F7F8")),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.grey),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
    ]))
    flow.append(t)

    # 안전 점수
    flow.append(Paragraph("■ 안전 점수", sub_style))
    sc_rows = [
        ["종합 점수", f"{score.get('score', 0)}점"],
        ["등급", f"{score.get('grade', '-')}"],
        ["등급 설명", score.get("grade_description", "")],
    ]
    for cat, info in (score.get("category_scores") or {}).items():
        sc_rows.append([f"[{cat}] 점수", f"{info.get('score', 0)}점"])
    t2 = Table(sc_rows, colWidths=[40 * mm, 120 * mm])
    t2.setStyle(TableStyle([
        ("FONT", (0, 0), (-1, -1), font, 10),
        ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#F7F7F8")),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.grey),
    ]))
    flow.append(t2)

    # 점검표
    flow.append(PageBreak())
    flow.append(Paragraph("■ AI 맞춤 점검표", sub_style))
    df = build_checklist_dataframe(master)
    if df.empty:
        flow.append(Paragraph("점검 항목이 없습니다.", body))
    else:
        header = ["No", "분류", "점검 제목", "법적 근거", "결과"]
        data = [header]
        for _, r in df.iterrows():
            data.append([
                str(r["번호"] or ""),
                str(r["카테고리"] or "")[:10],
                Paragraph(str(r["점검 제목"] or "")[:80], body),
                Paragraph(str(r["법적 근거"] or "-")[:60], body),
                str(r["점검 결과"] or ""),
            ])
        t3 = Table(data, colWidths=[12 * mm, 22 * mm, 72 * mm, 40 * mm, 18 * mm], repeatRows=1)
        t3.setStyle(TableStyle([
            ("FONT", (0, 0), (-1, -1), font, 9),
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0A0A0B")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("GRID", (0, 0), (-1, -1), 0.3, colors.grey),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ]))
        flow.append(t3)

    # 추천
    recs = master.get("recommendations") or []
    if recs:
        flow.append(PageBreak())
        flow.append(Paragraph("■ 안전 설비 추천 (부재·불량 기준)", sub_style))
        data = [["우선순위", "항목", "분류", "법적 근거", "조치"]]
        for r in recs:
            data.append([
                r.get("priority", ""),
                r.get("item", ""),
                r.get("category", ""),
                Paragraph(f"{r.get('law','')} {r.get('article','')}", body),
                r.get("action", ""),
            ])
        t4 = Table(data, colWidths=[18 * mm, 30 * mm, 24 * mm, 66 * mm, 26 * mm], repeatRows=1)
        t4.setStyle(TableStyle([
            ("FONT", (0, 0), (-1, -1), font, 9),
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#D50000")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("GRID", (0, 0), (-1, -1), 0.3, colors.grey),
        ]))
        flow.append(t4)

    # 결재란
    flow.append(Spacer(1, 10 * mm))
    flow.append(Paragraph("■ 결재", sub_style))
    eduline = master.get("approval", {}).get("eduline") or {}
    ap_data = [
        ["담당자", "부장", "교감", "교장"],
        [eduline.get("담당자", ""), eduline.get("부장", ""), eduline.get("교감", ""), eduline.get("교장", "")],
        ["(서명/인)", "(서명/인)", "(서명/인)", "(서명/인)"],
    ]
    t5 = Table(ap_data, colWidths=[40 * mm] * 4, rowHeights=[8 * mm, 10 * mm, 12 * mm])
    t5.setStyle(TableStyle([
        ("FONT", (0, 0), (-1, -1), font, 9),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.black),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#F7F7F8")),
    ]))
    flow.append(t5)

    doc.build(flow)
    buf.seek(0)
    return buf.read()


def build_official_letter_pdf(master: dict) -> bytes:
    """에듀파인 결재용 공문 (품의서 양식)."""
    font = _ensure_font()
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4,
                            leftMargin=25 * mm, rightMargin=25 * mm,
                            topMargin=22 * mm, bottomMargin=22 * mm)
    styles = getSampleStyleSheet()
    title = ParagraphStyle("T", parent=styles["Heading1"], fontName=font, fontSize=18,
                           alignment=1, spaceAfter=14)
    body = ParagraphStyle("B", parent=styles["BodyText"], fontName=font, fontSize=11,
                          leading=17, spaceBefore=6, spaceAfter=6)
    small = ParagraphStyle("S", parent=styles["BodyText"], fontName=font, fontSize=9,
                           leading=13, textColor=colors.grey)

    school = master.get("school") or {}
    space = master.get("space") or {}
    score = (master.get("inspection") or {}).get("score_result") or {}

    flow = []
    flow.append(Paragraph("학교 안전 점검 결과 보고(공문)", title))

    flow.append(Paragraph(f"수신: {school.get('sido','') or '관할 교육청'} (시설안전 담당)", body))
    flow.append(Paragraph(f"참조: 교육시설안전과", body))
    flow.append(Paragraph(f"제목: {school.get('name','')} {space.get('type','')} 안전·유지관리기준 자체 점검 결과 제출", body))
    flow.append(Spacer(1, 6 * mm))

    flow.append(Paragraph(
        "1. 관련: 「교육시설 등의 안전 및 유지관리 등에 관한 법률」 제10조 제3항 "
        "(안전·유지관리기준 준수 여부 자체 점검 의무)",
        body,
    ))
    flow.append(Paragraph(
        f"2. 우리 학교는 위 법령에 따라 {space.get('type','')} 공간에 대해 AI 비전 기반 "
        f"맞춤형 점검을 실시하였으며, 그 결과를 붙임과 같이 제출합니다.",
        body,
    ))
    flow.append(Paragraph(
        f"3. 점검 결과 종합 점수는 <b>{score.get('score','-')}점(등급 {score.get('grade','-')})</b>이며, "
        "세부 내역 및 안전 설비 추천 사항은 첨부 문서를 참조하시기 바랍니다.",
        body,
    ))
    flow.append(Paragraph(
        "4. 본 결과는 교육시설통합정보망(KEIIS) 업로드 및 공공데이터 환원 대상임을 알려드립니다.",
        body,
    ))
    flow.append(Spacer(1, 10 * mm))

    flow.append(Paragraph("<b>붙임</b>", body))
    flow.append(Paragraph("1. 점검 결과 보고서 (PDF) 1부", body))
    flow.append(Paragraph("2. 점검 데이터 (XLSX) 1부", body))
    flow.append(Paragraph("3. 기계판독용 데이터 (JSON) 1부", body))
    flow.append(Paragraph("4. 교육청 발송 패키지 (JSON) 1부", body))
    flow.append(Paragraph("5. 공공데이터 환원 패키지 (JSON, 익명화 적용) 1부.  끝.", body))
    flow.append(Spacer(1, 14 * mm))

    # 발신 학교 + 결재선
    flow.append(Paragraph(f"{school.get('name','')}장", body))
    flow.append(Spacer(1, 4 * mm))
    flow.append(Paragraph(
        "※ 본 문서는 SafeLoop AI 점검 시스템이 생성한 초안이며, "
        "에듀파인에 업로드 후 학교 내부 결재라인(담당자→부장→교감→교장)을 거쳐 발송됩니다.",
        small,
    ))
    doc.build(flow)
    buf.seek(0)
    return buf.read()


# ─────────────────────────────────────────
# 메인 저장 함수
# ─────────────────────────────────────────
def save_inspection(session: dict) -> dict:
    """세션 데이터를 학교 클라우드(모의)에 저장하고 생성된 파일 경로를 반환."""
    session_id = session.get("session_id") or new_session_id()
    session["session_id"] = session_id
    school = session.get("school") or {}
    school_code = school.get("정보공시 학교코드") or "UNKNOWN"
    out_dir = session_dir(school_code, session_id)

    master = build_master_record(session)
    edu_pkg = build_edu_package(master)
    open_pkg = build_opendata_package(master)

    # Machine-readable
    (out_dir / "master.json").write_text(
        json.dumps(master, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    (out_dir / "edu_package.json").write_text(
        json.dumps(edu_pkg, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    (out_dir / "opendata_package.json").write_text(
        json.dumps(open_pkg, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    # Human-readable
    (out_dir / "점검결과.csv").write_bytes(build_csv(master))
    (out_dir / "점검결과.xlsx").write_bytes(build_excel(master))
    (out_dir / "점검결과보고서.pdf").write_bytes(build_pdf_report(master))
    (out_dir / "에듀파인_품의서.pdf").write_bytes(build_official_letter_pdf(master))

    return {
        "session_id": session_id,
        "directory": str(out_dir),
        "files": sorted(p.name for p in out_dir.iterdir()),
    }


def build_edufine_zip(session: dict) -> bytes:
    """에듀파인 업로드용 ZIP 패키지 (공문 + 첨부 일괄)."""
    master = build_master_record(session)
    edu_pkg = build_edu_package(master)
    open_pkg = build_opendata_package(master)

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("00_에듀파인_품의서.pdf", build_official_letter_pdf(master))
        zf.writestr("01_점검결과보고서.pdf", build_pdf_report(master))
        zf.writestr("02_점검결과.xlsx", build_excel(master))
        zf.writestr("03_점검결과.csv", build_csv(master))
        zf.writestr("04_master.json",
                    json.dumps(master, ensure_ascii=False, indent=2).encode("utf-8"))
        zf.writestr("05_edu_package.json",
                    json.dumps(edu_pkg, ensure_ascii=False, indent=2).encode("utf-8"))
        zf.writestr("06_opendata_package.json",
                    json.dumps(open_pkg, ensure_ascii=False, indent=2).encode("utf-8"))
    buf.seek(0)
    return buf.read()


def send_to_edu_app(session: dict) -> dict:
    """옵션 2: 교육청 담당자 수신함으로 직접 전송 (결재 완료 후 활성화)."""
    if not session.get("edufine_approved"):
        return {"ok": False, "reason": "에듀파인 결재 완료가 확인되지 않았습니다."}

    master = build_master_record(session)
    edu_pkg = build_edu_package(master)
    school = master.get("school") or {}
    sido = school.get("sido") or "미상"

    target_dir = EDU_RECEIPT_DIR / sido
    target_dir.mkdir(parents=True, exist_ok=True)
    session_id = session.get("session_id") or new_session_id()
    fname = f"{datetime.datetime.now():%Y%m%d-%H%M%S}_{school.get('code','')}_{session_id}.json"
    (target_dir / fname).write_text(
        json.dumps(edu_pkg, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    return {"ok": True, "path": str(target_dir / fname), "sido": sido}


def list_edu_inbox(sido: str | None = None) -> list[dict]:
    """교육청 수신함 리스트."""
    items = []
    roots = [EDU_RECEIPT_DIR / sido] if sido else list(EDU_RECEIPT_DIR.iterdir())
    for root in roots:
        if not root.exists() or not root.is_dir():
            continue
        for p in sorted(root.glob("*.json"), reverse=True):
            try:
                data = json.loads(p.read_text(encoding="utf-8"))
            except Exception:
                continue
            items.append({
                "file": p.name,
                "sido": root.name,
                "path": str(p),
                "school": (data.get("school_identified") or {}).get("name"),
                "space_type": (data.get("space") or {}).get("type"),
                "score": data.get("safety_score"),
                "grade": data.get("grade"),
                "received_at": data.get("submission_timestamp"),
            })
    return items


def list_recent_sessions(limit: int = 20) -> list[dict]:
    items: list[dict] = []
    for school_dir in STORAGE_DIR.iterdir():
        if school_dir.name.startswith("_") or not school_dir.is_dir():
            continue
        for sess in school_dir.iterdir():
            if not sess.is_dir():
                continue
            master_path = sess / "master.json"
            if not master_path.exists():
                continue
            try:
                data = json.loads(master_path.read_text(encoding="utf-8"))
            except Exception:
                continue
            items.append({
                "session_id": sess.name,
                "school_code": school_dir.name,
                "school_name": (data.get("school") or {}).get("name"),
                "space_type": (data.get("space") or {}).get("type"),
                "space_nickname": (data.get("space") or {}).get("nickname"),
                "score": ((data.get("inspection") or {}).get("score_result") or {}).get("score"),
                "grade": ((data.get("inspection") or {}).get("score_result") or {}).get("grade"),
                "timestamp": data.get("timestamp"),
                "path": str(sess),
            })
    items.sort(key=lambda x: x.get("timestamp") or "", reverse=True)
    return items[:limit]
