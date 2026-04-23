"""
AI 비전·텍스트 공급자 어댑터.

동일 인터페이스로 Anthropic Claude / OpenAI GPT-4o 를 투명 교체한다.
공급자 선택 우선순위:
  세션 상태 > 환경 변수 SAFELOOP_PROVIDER > 자동(사용 가능한 첫 공급자)

향후 Google Gemini · NAVER HyperCLOVA X 등 확장 시 같은 패턴으로 추가.
"""
from __future__ import annotations

import base64
import os
from abc import ABC, abstractmethod
from typing import Optional


class VisionProvider(ABC):
    """비전·텍스트 동시 지원 추상 공급자."""
    id: str = ""
    label: str = ""

    @abstractmethod
    def available(self) -> bool:
        """API 키가 설정되어 호출 가능한지."""

    @abstractmethod
    def call(self, system: str, text: str, images: list[bytes],
             tier: str = "vision") -> str:
        """공통 호출 — 이미지가 비어도 텍스트 응답 반환.

        tier: "vision" (사진 분석) | "text" (빠른 텍스트 생성)
        """


# ─────────────────────────────────────────
# Anthropic Claude
# ─────────────────────────────────────────
class AnthropicProvider(VisionProvider):
    id = "anthropic"
    label = "Anthropic Claude (Opus 4.5 · Haiku 4.5)"
    MODELS = {
        "vision": "claude-opus-4-5",
        "text": "claude-haiku-4-5-20251001",
    }

    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or os.environ.get("ANTHROPIC_API_KEY")

    def available(self) -> bool:
        return bool(self.api_key)

    def call(self, system: str, text: str, images: list[bytes],
             tier: str = "vision") -> str:
        from anthropic import Anthropic
        import httpx
        proxy = os.environ.get("HTTPS_PROXY") or os.environ.get("HTTP_PROXY")
        if proxy:
            client = Anthropic(api_key=self.api_key,
                                http_client=httpx.Client(proxy=proxy, timeout=120.0))
        else:
            client = Anthropic(api_key=self.api_key)

        content: list = [{"type": "text", "text": text}]
        for b in images:
            data = base64.standard_b64encode(b).decode("utf-8")
            content.append({
                "type": "image",
                "source": {"type": "base64", "media_type": "image/jpeg", "data": data},
            })
        resp = client.messages.create(
            model=self.MODELS[tier],
            max_tokens=4096,
            system=system,
            messages=[{"role": "user", "content": content}],
        )
        return resp.content[0].text


# ─────────────────────────────────────────
# OpenAI GPT-4o
# ─────────────────────────────────────────
class OpenAIProvider(VisionProvider):
    id = "openai"
    label = "OpenAI GPT-4o"
    MODELS = {
        "vision": "gpt-4o",
        "text": "gpt-4o-mini",
    }

    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or os.environ.get("OPENAI_API_KEY")

    def available(self) -> bool:
        return bool(self.api_key)

    def call(self, system: str, text: str, images: list[bytes],
             tier: str = "vision") -> str:
        from openai import OpenAI
        client = OpenAI(api_key=self.api_key)

        content: list = [{"type": "text", "text": text}]
        for b in images:
            data = base64.standard_b64encode(b).decode("utf-8")
            content.append({
                "type": "image_url",
                "image_url": {"url": f"data:image/jpeg;base64,{data}"},
            })
        resp = client.chat.completions.create(
            model=self.MODELS[tier],
            max_tokens=4096,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": content},
            ],
        )
        return resp.choices[0].message.content or ""


# ─────────────────────────────────────────
# 레지스트리
# ─────────────────────────────────────────
_PROVIDER_CLASSES: dict[str, type[VisionProvider]] = {
    AnthropicProvider.id: AnthropicProvider,
    OpenAIProvider.id: OpenAIProvider,
}

ALL_PROVIDERS: list[dict] = [
    {"id": AnthropicProvider.id, "label": AnthropicProvider.label,
     "env_var": "ANTHROPIC_API_KEY"},
    {"id": OpenAIProvider.id, "label": OpenAIProvider.label,
     "env_var": "OPENAI_API_KEY"},
]


def _key_from_session(provider_id: str) -> Optional[str]:
    try:
        import streamlit as st
        return st.session_state.get(f"api_key_{provider_id}")
    except Exception:
        return None


def get_provider(name: Optional[str] = None) -> VisionProvider:
    """현재 유효한 공급자 인스턴스 반환."""
    try:
        import streamlit as st
        chosen = name or st.session_state.get("ai_provider")
    except Exception:
        chosen = name
    chosen = chosen or os.environ.get("SAFELOOP_PROVIDER")

    if chosen and chosen in _PROVIDER_CLASSES:
        return _PROVIDER_CLASSES[chosen](api_key=_key_from_session(chosen))

    # 자동 — 첫 번째로 사용 가능한 공급자
    for p in ALL_PROVIDERS:
        inst = _PROVIDER_CLASSES[p["id"]](api_key=_key_from_session(p["id"]))
        if inst.available():
            return inst

    # 그래도 없으면 Anthropic(사용 불가 상태) 반환
    return AnthropicProvider()


def providers_status() -> list[dict]:
    """설정 UI용 — 전체 공급자의 사용 가능 여부 + 현재 키 출처."""
    out = []
    for p in ALL_PROVIDERS:
        session_key = _key_from_session(p["id"])
        env_key = os.environ.get(p["env_var"])
        inst = _PROVIDER_CLASSES[p["id"]](api_key=session_key or env_key)
        out.append({
            "id": p["id"],
            "label": p["label"],
            "env_var": p["env_var"],
            "available": inst.available(),
            "key_source": ("세션" if session_key else ("환경변수" if env_key else None)),
        })
    return out
