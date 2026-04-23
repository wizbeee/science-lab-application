"""
AI 안전 설비·시설·장비 추천 모듈.

부재·불량 설비 → 법령 근거 + 우선순위 기반 추천 리스트 생성.
비용·구매처는 의도적으로 제외 (핵심서사: "예산은 부수 요소").
"""
from __future__ import annotations

from modules.laws import LAW_BASIS


def _priority_label(weight: int) -> tuple[str, str]:
    if weight >= 9:
        return ("★★★", "즉시 조치")
    if weight >= 7:
        return ("★★", "우선 조치")
    return ("★", "권고 조치")


def recommend_from_scores(item_scores: dict[str, float]) -> list[dict]:
    """항목별 점수를 받아 불량·부재 항목에 대한 추천 리스트 반환."""
    recs: list[dict] = []
    for name, info in LAW_BASIS.items():
        s = float(item_scores.get(name, 0.0))
        if s >= 1.0:
            continue  # 양호는 추천 불필요
        stars, action = _priority_label(info["weight"])
        reason = "부재 — 신규 설치 필요" if s == 0.0 else "불량 — 점검·교체 필요"
        recs.append({
            "item": name,
            "category": info["category"],
            "priority": stars,
            "action": action,
            "weight": info["weight"],
            "law": info["law"],
            "article": info["article"],
            "note": info["note"],
            "current_status": {1.0: "양호", 0.5: "불량", 0.0: "부재"}.get(s, "미입력"),
            "reason": reason,
        })
    recs.sort(key=lambda r: (-r["weight"], r["category"]))
    return recs


def recommend_from_ai_result(stage2_result: dict) -> list[dict]:
    """AI 단계 2의 likely_absent_equipment 기반 추천."""
    absent = stage2_result.get("likely_absent_equipment", []) or []
    recs: list[dict] = []
    for entry in absent:
        name = entry.get("name", "")
        # LAW_BASIS에서 부분 일치
        matched_key = None
        for std in LAW_BASIS:
            if std in name or name in std:
                matched_key = std
                break
        if not matched_key:
            continue
        info = LAW_BASIS[matched_key]
        stars, action = _priority_label(info["weight"])
        recs.append({
            "item": matched_key,
            "category": info["category"],
            "priority": stars,
            "action": action,
            "weight": info["weight"],
            "law": info["law"],
            "article": info["article"],
            "note": info["note"],
            "reason": entry.get("reason", "AI 인식 결과 부재로 판정"),
        })
    recs.sort(key=lambda r: (-r["weight"], r["category"]))
    return recs
