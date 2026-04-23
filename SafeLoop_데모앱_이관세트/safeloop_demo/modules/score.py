"""
안전 점수 산출 — V-1 v3 공식.

S = Σ(wᵢ × sᵢ) / Σwᵢ × 100
점수 의미: sᵢ ∈ {1.0(양호), 0.5(불량), 0.0(부재)}
등급: A(90+) / B(80+) / C(70+) / D(60+) / E(그 외)
"""
from __future__ import annotations

from modules.laws import CATEGORIES, LAW_BASIS, STANDARD_ITEMS, items_by_category


def get_grade(score: float) -> str:
    if score >= 90:
        return "A"
    if score >= 80:
        return "B"
    if score >= 70:
        return "C"
    if score >= 60:
        return "D"
    return "E"


def grade_description(grade: str) -> str:
    return {
        "A": "매우 양호 — 법령 기준 충족 및 추가 권고 사항 일부만 개선 필요",
        "B": "양호 — 주요 설비 충족, 일부 개선 필요",
        "C": "보통 — 핵심 설비 중 일부 불량·누락, 개선 계획 권고",
        "D": "미흡 — 다수 핵심 설비 부재 또는 불량, 시급한 개선 필요",
        "E": "위험 — 비상대응·감지 설비 다수 부재, 즉시 조치 필요",
    }.get(grade, "")


def calculate_safety_score(item_scores: dict[str, float]) -> dict:
    """
    Args:
        item_scores: {"비상샤워": 1.0, "세안기": 0.5, ...}
                     값이 주어지지 않은 항목은 0.0 으로 간주
    Returns:
        {
          "score": float (0~100),
          "grade": "A~E",
          "category_scores": {카테고리명: {"score": ..., "weight_sum": ..., "items": [...]}},
          "raw": {항목: 점수},
        }
    """
    total_weighted = 0.0
    total_weight = 0.0
    category_breakdown: dict[str, dict] = {c: {"weighted": 0.0, "weight": 0.0, "items": []} for c in CATEGORIES}
    raw: dict[str, float] = {}

    for name, info in LAW_BASIS.items():
        s = float(item_scores.get(name, 0.0))
        w = float(info["weight"])
        raw[name] = s
        cat = info["category"]
        total_weighted += w * s
        total_weight += w
        category_breakdown[cat]["weighted"] += w * s
        category_breakdown[cat]["weight"] += w
        category_breakdown[cat]["items"].append({"name": name, "score": s, "weight": w})

    score_pct = (total_weighted / total_weight * 100.0) if total_weight > 0 else 0.0

    category_scores = {}
    for cat, info in category_breakdown.items():
        pct = (info["weighted"] / info["weight"] * 100.0) if info["weight"] > 0 else 0.0
        category_scores[cat] = {
            "score": round(pct, 1),
            "weight_sum": info["weight"],
            "items": info["items"],
        }

    grade = get_grade(score_pct)

    return {
        "score": round(score_pct, 1),
        "grade": grade,
        "grade_description": grade_description(grade),
        "category_scores": category_scores,
        "raw": raw,
    }


def score_from_checklist(
    ai_items: list[dict], item_scores: dict[str, float]
) -> dict:
    """AI 생성 점검표 항목에서 표준 항목으로 매핑하여 점수 산출.

    각 AI 항목의 title에 포함된 표준 항목명을 매칭한다. 매칭 실패 항목은 제외.
    """
    mapped: dict[str, float] = {}
    for itm in ai_items:
        title = str(itm.get("title", "")) + " " + str(itm.get("category", ""))
        for std in STANDARD_ITEMS:
            if std in title and std not in mapped:
                mapped[std] = item_scores.get(itm.get("no", std), 0.0)
                break
    mapped.update(item_scores)
    return calculate_safety_score(mapped)
