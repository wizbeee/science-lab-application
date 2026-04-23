"""
AI 비전 파이프라인 — 단계 1(공간 식별) · 단계 2(설비 탐지) · 단계 3(맞춤 점검표).

modules.ai_providers 의 Adapter(Anthropic · OpenAI · …)를 투명 교체하며 호출.
해시 기반 디스크 캐싱으로 동일 입력 재분석 시 API 호출 생략.
사진에 샷 메타데이터(03-1 식 라벨)를 주입해 설비→사진 매핑 품질 향상.
"""
from __future__ import annotations

import hashlib
import json
import re
import time
from pathlib import Path
from typing import Optional

from modules.ai_providers import get_provider
from modules.prompts import STAGE1_SYSTEM, STAGE2_SYSTEM, STAGE3_SYSTEM

ROOT = Path(__file__).resolve().parent.parent
CACHE_DIR = ROOT / "school_storage" / "_ai_cache"
CACHE_DIR.mkdir(parents=True, exist_ok=True)


# ─────────────────────────────────────────
# 캐시
# ─────────────────────────────────────────
def _hash_images(images: list[bytes]) -> str:
    h = hashlib.sha256()
    for b in images:
        h.update(hashlib.sha256(b).digest())
    return h.hexdigest()[:16]


def _cache_path(stage: str, key: str, provider_id: str) -> Path:
    return CACHE_DIR / f"{stage}_{provider_id}_{key}.json"


def _read_cache(stage: str, key: str, provider_id: str) -> Optional[dict]:
    p = _cache_path(stage, key, provider_id)
    if p.exists():
        try:
            return json.loads(p.read_text(encoding="utf-8"))
        except Exception:
            return None
    return None


def _write_cache(stage: str, key: str, provider_id: str, payload: dict) -> None:
    _cache_path(stage, key, provider_id).write_text(
        json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8"
    )


def _parse_json(raw: str) -> dict:
    cleaned = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        match = re.search(r"\{[\s\S]*\}", cleaned)
        if match:
            try:
                return json.loads(match.group())
            except Exception:
                pass
        return {"raw": raw, "parse_error": True}


# ─────────────────────────────────────────
# 파이프라인
# ─────────────────────────────────────────
def run_stage1(images: list[bytes], use_cache: bool = True,
               image_labels: Optional[list[str]] = None) -> dict:
    """단계 1 — 공간 유형 식별."""
    provider = get_provider()
    cache_key = _hash_images(images)
    if use_cache:
        cached = _read_cache("stage1", cache_key, provider.id)
        if cached:
            cached["_cached"] = True
            return cached

    labels_hint = ""
    if image_labels:
        labels_hint = "\n첨부된 이미지 라벨(순서대로): " + ", ".join(image_labels)

    text = f"{len(images)}장의 사진을 보고 공간 유형을 판정하세요.{labels_hint}"
    t0 = time.time()
    raw = provider.call(STAGE1_SYSTEM, text, images, tier="vision")
    elapsed = time.time() - t0

    parsed = _parse_json(raw)
    parsed["_elapsed_sec"] = round(elapsed, 2)
    parsed["_provider"] = provider.label
    parsed["_cached"] = False

    if use_cache and not parsed.get("parse_error"):
        _write_cache("stage1", cache_key, provider.id, parsed)
    return parsed


def run_stage2(images: list[bytes], space_type: str, use_cache: bool = True,
               image_labels: Optional[list[str]] = None) -> dict:
    """단계 2 — 안전 설비 탐지."""
    provider = get_provider()
    cache_key = f"{_hash_images(images)}_{space_type}"
    if use_cache:
        cached = _read_cache("stage2", cache_key, provider.id)
        if cached:
            cached["_cached"] = True
            return cached

    labels_hint = ""
    if image_labels:
        labels_hint = (
            "\n\n첨부 사진의 라벨(순서대로): " + ", ".join(image_labels) +
            "\n각 설비의 `image_ref` 필드에는 위 라벨 중 하나를 그대로 써 주세요."
        )

    text = (
        f"이 공간은 '{space_type}'으로 식별되었습니다. 해당 공간 유형에서 필요한 안전설비를 탐지해주세요."
        + labels_hint
    )
    t0 = time.time()
    raw = provider.call(STAGE2_SYSTEM, text, images, tier="vision")
    elapsed = time.time() - t0

    parsed = _parse_json(raw)
    parsed["_elapsed_sec"] = round(elapsed, 2)
    parsed["_provider"] = provider.label
    parsed["_cached"] = False

    if use_cache and not parsed.get("parse_error"):
        _write_cache("stage2", cache_key, provider.id, parsed)
    return parsed


def run_stage3(stage1_result: dict, stage2_result: dict, use_cache: bool = True) -> dict:
    """단계 3 — 맞춤형 점검표 생성."""
    provider = get_provider()
    clean1 = {k: v for k, v in stage1_result.items() if not k.startswith("_")}
    clean2 = {k: v for k, v in stage2_result.items() if not k.startswith("_")}
    payload = json.dumps({"stage1": clean1, "stage2": clean2}, ensure_ascii=False, sort_keys=True)
    cache_key = hashlib.sha256(payload.encode("utf-8")).hexdigest()[:16]

    if use_cache:
        cached = _read_cache("stage3", cache_key, provider.id)
        if cached:
            cached["_cached"] = True
            return cached

    text = (
        f"단계 1 결과:\n{json.dumps(clean1, ensure_ascii=False, indent=2)}\n\n"
        f"단계 2 결과:\n{json.dumps(clean2, ensure_ascii=False, indent=2)}\n\n"
        "위 결과를 근거로 이 공간만을 위한 맞춤형 점검표를 생성하세요."
    )
    t0 = time.time()
    raw = provider.call(STAGE3_SYSTEM, text, [], tier="text")
    elapsed = time.time() - t0

    parsed = _parse_json(raw)
    parsed["_elapsed_sec"] = round(elapsed, 2)
    parsed["_provider"] = provider.label
    parsed["_cached"] = False

    if use_cache and not parsed.get("parse_error"):
        _write_cache("stage3", cache_key, provider.id, parsed)
    return parsed


def load_image_bytes(path: Path) -> bytes:
    return Path(path).read_bytes()


def api_key_available() -> bool:
    return get_provider().available()


def current_provider_label() -> str:
    return get_provider().label
