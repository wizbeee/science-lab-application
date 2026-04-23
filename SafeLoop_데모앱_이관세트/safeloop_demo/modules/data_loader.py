"""
데이터 로더 — CSV 캐싱·학교 검색·익명화.

검색 API:
- search_schools_by_name(query)           이름 부분 일치
- list_sido()                             시도 목록
- list_sigungu(sido)                      시군구 목록
- list_schools(sido, sigungu)             학교 리스트
- get_school_by_code(code)                식별자 조회
- anonymize_code(code)                    해시 익명화
"""
from __future__ import annotations

import hashlib
import re
from functools import lru_cache
from pathlib import Path

import pandas as pd
import streamlit as st

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"


def _strip_bom(df: pd.DataFrame) -> pd.DataFrame:
    df.columns = [c.lstrip("\ufeff").strip() for c in df.columns]
    return df


@st.cache_data(show_spinner=False)
def load_master() -> pd.DataFrame:
    df = pd.read_csv(DATA_DIR / "master_school_data.csv", dtype={"정보공시 학교코드": str})
    return _strip_bom(df)


@st.cache_data(show_spinner=False)
def load_high_risk() -> pd.DataFrame:
    df = pd.read_csv(DATA_DIR / "high_risk_schools.csv", dtype={"정보공시 학교코드": str})
    return _strip_bom(df)


@st.cache_data(show_spinner=False)
def load_sido_summary() -> pd.DataFrame:
    return _strip_bom(pd.read_csv(DATA_DIR / "sido_summary.csv"))


@st.cache_data(show_spinner=False)
def load_cluster_summary() -> pd.DataFrame:
    return _strip_bom(pd.read_csv(DATA_DIR / "cluster_summary.csv"))


@st.cache_data(show_spinner=False)
def load_sensitivity() -> pd.DataFrame:
    return _strip_bom(pd.read_csv(DATA_DIR / "sensitivity_result.csv"))


@st.cache_data(show_spinner=False)
def load_sigungu_agg() -> pd.DataFrame:
    return _strip_bom(pd.read_csv(DATA_DIR / "sigungu_agg.csv"))


@st.cache_data(show_spinner=False)
def load_risk_analysis() -> pd.DataFrame:
    df = pd.read_csv(DATA_DIR / "risk_analysis_result.csv", dtype={"정보공시 학교코드": str})
    return _strip_bom(df)


# ─────────────────────────────────────────
# 검색 API
# ─────────────────────────────────────────
def list_sido() -> list[str]:
    df = load_master()
    return sorted(df["시도교육청"].dropna().unique().tolist())


def list_sigungu(sido: str) -> list[str]:
    df = load_master()
    subset = df[df["시도교육청"] == sido]
    sigungu = subset["지역"].dropna().apply(_extract_sigungu).unique().tolist()
    return sorted([s for s in sigungu if s])


def _extract_sigungu(region: str) -> str:
    """'서울특별시 강남구' → '강남구' 추출."""
    if not isinstance(region, str):
        return ""
    parts = region.strip().split()
    return parts[-1] if len(parts) >= 2 else region


def list_schools(sido: str, sigungu: str) -> pd.DataFrame:
    df = load_master()
    subset = df[df["시도교육청"] == sido].copy()
    subset["시군구"] = subset["지역"].apply(_extract_sigungu)
    subset = subset[subset["시군구"] == sigungu]
    return subset[["정보공시 학교코드", "학교명", "학교급", "설립구분", "지역"]].reset_index(drop=True)


def search_schools_by_name(query: str, limit: int = 50) -> pd.DataFrame:
    df = load_master()
    if not query:
        return df.head(0)
    mask = df["학교명"].astype(str).str.contains(re.escape(query), na=False, case=False)
    return df.loc[mask, ["정보공시 학교코드", "학교명", "학교급", "설립구분", "시도교육청", "지역"]].head(limit).reset_index(drop=True)


def get_school_by_code(code: str) -> dict | None:
    df = load_master()
    hit = df[df["정보공시 학교코드"] == str(code)]
    if hit.empty:
        return None
    return hit.iloc[0].to_dict()


def get_school_risk(code: str) -> dict | None:
    try:
        df = load_risk_analysis()
    except FileNotFoundError:
        return None
    hit = df[df["정보공시 학교코드"] == str(code)]
    if hit.empty:
        return None
    return hit.iloc[0].to_dict()


# ─────────────────────────────────────────
# 익명화
# ─────────────────────────────────────────
_ANON_SALT = "safeloop-2026-demo"


def anonymize_code(code: str) -> str:
    """학교 코드를 해시 익명화(공공데이터 환원용)."""
    if not code:
        return ""
    digest = hashlib.sha256(f"{_ANON_SALT}|{code}".encode("utf-8")).hexdigest()
    return f"ANON-{digest[:12].upper()}"


@lru_cache(maxsize=1024)
def pseudo_school_name(code: str) -> str:
    """대시보드 B(공공 공개용) 전용 가명 이름."""
    if not code:
        return "학교_미상"
    h = int(hashlib.sha256(f"{_ANON_SALT}|{code}".encode("utf-8")).hexdigest(), 16)
    return f"학교_{h % 100000:05d}"


# ─────────────────────────────────────────
# 인증번호 (시연용)
# ─────────────────────────────────────────
def issue_auth_code(school_code: str) -> str:
    """학교 코드 기반 고정 인증번호 (6자리) — 시연용."""
    h = hashlib.sha256(f"SAFELOOP-AUTH|{school_code}".encode("utf-8")).hexdigest()
    num = int(h[:8], 16) % 1_000_000
    return f"{num:06d}"


def verify_auth_code(school_code: str, code: str) -> bool:
    return str(code).strip() == issue_auth_code(school_code)
