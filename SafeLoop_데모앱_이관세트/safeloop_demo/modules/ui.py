"""
공통 UI 테마 및 헬퍼.

세이프루프 브랜드: Swiss International 스타일.
- 색상: #0A0A0B (잉크), #D50000 (포인트), #FFFFFF (배경), #E5E5E8 (보더), #6B6B70 (서브)
- 이모지 대신 번호·얇은 구분선 사용
- 모바일(태블릿·폰) 우선, 터치 타겟 44px 최소
"""
from __future__ import annotations

import streamlit as st


_CSS = """
<style>
/* ───────── 글로벌 ───────── */
html, body, [class*="css"], .stApp, .main, .block-container {
    font-family: 'Pretendard', 'Inter', -apple-system, BlinkMacSystemFont,
                 'Segoe UI', 'Noto Sans KR', sans-serif;
    -webkit-font-smoothing: antialiased;
    color: #0A0A0B;
}
.main .block-container { padding-top: 2.2rem; padding-bottom: 4rem; max-width: 960px; }
h1, h2, h3, h4 { letter-spacing: -0.02em; font-weight: 700; }
h1 { font-size: 28px; }
h2 { font-size: 22px; }
h3 { font-size: 18px; }

/* 기본 텍스트 */
p, li, label, div[data-testid="stMarkdownContainer"] { color: #0A0A0B; }

/* 상단 내비게이션 줄 숨김 (배포 깔끔) */
#MainMenu, footer { visibility: hidden; }
header[data-testid="stHeader"] { background: transparent; }

/* ───────── 히어로 ───────── */
.sl-hero { padding: 24px 0 12px 0; border-bottom: 1px solid #E5E5E8; margin-bottom: 24px; }
.sl-kicker {
    font-size: 11px; letter-spacing: 0.32em; font-weight: 600;
    color: #D50000; text-transform: uppercase; margin-bottom: 10px;
}
.sl-title { font-size: 32px; font-weight: 800; line-height: 1.15; color: #0A0A0B; margin: 0 0 8px 0; letter-spacing: -0.03em; }
.sl-subtitle { font-size: 14px; color: #6B6B70; margin: 0 0 4px 0; }

/* ───────── 섹션 헤더 ───────── */
.sl-section { margin-top: 28px; margin-bottom: 12px; }
.sl-num {
    display: inline-block; font-size: 11px; letter-spacing: 0.32em;
    color: #D50000; font-weight: 600; margin-bottom: 6px;
    text-transform: uppercase;
}
.sl-h { font-size: 20px; font-weight: 700; color: #0A0A0B; margin: 0 0 4px 0; letter-spacing: -0.02em; }
.sl-h-sub { font-size: 13px; color: #6B6B70; margin: 0 0 12px 0; }

/* ───────── 카드 ───────── */
.sl-card {
    border: 1px solid #E5E5E8; border-radius: 6px; padding: 18px 20px;
    background: #FFF; margin-bottom: 14px;
}
.sl-card-accent { border-left: 3px solid #D50000; }

/* ───────── 분리선 ───────── */
hr, .sl-hr { border: 0; border-top: 1px solid #E5E5E8; margin: 24px 0; }

/* ───────── 버튼 ───────── */
div.stButton > button {
    border-radius: 4px; font-weight: 600; letter-spacing: -0.01em;
    transition: all 0.15s ease; min-height: 44px;
}
div.stButton > button[kind="primary"] {
    background: #0A0A0B; color: #FFF; border: 1px solid #0A0A0B;
}
div.stButton > button[kind="primary"]:hover { background: #D50000; border-color: #D50000; }
div.stButton > button[kind="secondary"] {
    background: #FFF; color: #0A0A0B; border: 1px solid #D1D1D4;
}
div.stButton > button[kind="secondary"]:hover { border-color: #0A0A0B; }
div.stButton > button:focus-visible { outline: 2px solid #D50000; outline-offset: 2px; }

/* 다운로드 버튼도 동일 톤 */
.stDownloadButton > button {
    border-radius: 4px; font-weight: 600; min-height: 44px;
    background: #FFF; border: 1px solid #D1D1D4; color: #0A0A0B;
}
.stDownloadButton > button:hover { border-color: #0A0A0B; background: #FAFAFA; }

/* ───────── 입력 요소 ───────── */
input, textarea, select { font-family: inherit !important; border-radius: 4px !important; }
[data-baseweb="input"] input, [data-baseweb="textarea"] textarea {
    min-height: 44px; font-size: 15px;
}
label { font-weight: 500; color: #0A0A0B; }

/* 라디오 버튼 (양호/불량/부재 등) */
div[role="radiogroup"] > label { padding: 6px 14px; border: 1px solid transparent; border-radius: 999px; }

/* ───────── 메트릭 ───────── */
[data-testid="stMetric"] {
    background: #FFF; border: 1px solid #E5E5E8;
    border-radius: 6px; padding: 14px 18px;
}
[data-testid="stMetricLabel"] { font-size: 11px !important; letter-spacing: 0.12em; text-transform: uppercase; color: #6B6B70 !important; font-weight: 600; }
[data-testid="stMetricValue"] { font-size: 26px !important; font-weight: 800 !important; color: #0A0A0B !important; }
[data-testid="stMetricDelta"] { font-size: 12px !important; color: #6B6B70 !important; }

/* ───────── 탭 ───────── */
.stTabs [data-baseweb="tab-list"] { gap: 2px; border-bottom: 1px solid #E5E5E8; }
.stTabs [data-baseweb="tab"] {
    font-weight: 600; padding: 10px 14px; border-radius: 0;
    color: #6B6B70; background: transparent;
}
.stTabs [aria-selected="true"] { color: #0A0A0B; border-bottom: 2px solid #D50000; }

/* ───────── 모바일 ───────── */
@media (max-width: 768px) {
    .main .block-container { padding: 1.2rem 1rem 3rem 1rem; }
    .sl-title { font-size: 26px; }
    h1 { font-size: 24px; }
    div.stButton > button, .stDownloadButton > button { min-height: 48px; font-size: 15px; }
    [data-testid="stMetricValue"] { font-size: 22px !important; }
}

/* ───────── 사이드바 ───────── */
[data-testid="stSidebar"] { border-right: 1px solid #E5E5E8; }
[data-testid="stSidebar"] .block-container { padding-top: 1.6rem; }
[data-testid="stSidebarNav"] li a {
    font-size: 13px !important; font-weight: 500; padding: 8px 12px !important;
    border-radius: 4px; color: #0A0A0B !important;
}
[data-testid="stSidebarNav"] li a:hover { background: #FAFAFA; }
[data-testid="stSidebarNav"] li a[aria-current="page"] {
    background: #0A0A0B; color: #FFF !important; font-weight: 600;
}

/* ───────── 표 ───────── */
[data-testid="stDataFrame"] { border: 1px solid #E5E5E8; border-radius: 6px; overflow: hidden; }

/* ───────── 알림 ───────── */
[data-testid="stAlert"] { border-radius: 6px; border: 1px solid #E5E5E8; }

/* 카메라 / 업로더 박스 */
[data-testid="stCameraInput"] > div, [data-testid="stFileUploader"] > section {
    border: 1px dashed #D1D1D4; border-radius: 6px; padding: 12px; background: #FAFAFA;
}

/* ───────── 커스텀 컴포넌트 ───────── */
.sl-pill {
    display: inline-block; padding: 2px 10px; font-size: 11px; font-weight: 600;
    letter-spacing: 0.06em; border-radius: 999px; background: #FAFAFA;
    border: 1px solid #E5E5E8; color: #6B6B70; margin-right: 6px;
}
.sl-pill-red { background: #FFF2F2; color: #D50000; border-color: #F8D0D0; }
.sl-pill-dark { background: #0A0A0B; color: #FFF; border-color: #0A0A0B; }

.sl-dot {
    display: inline-block; width: 6px; height: 6px; border-radius: 50%;
    background: #D1D1D4; margin-right: 6px; vertical-align: middle;
}
.sl-dot-on { background: #D50000; }

.sl-shot-head {
    display: flex; align-items: baseline; gap: 14px; margin-bottom: 6px;
}
.sl-shot-num {
    font-size: 11px; letter-spacing: 0.2em; color: #D50000;
    font-weight: 700; min-width: 24px;
}
.sl-shot-title { font-size: 17px; font-weight: 700; color: #0A0A0B; }
.sl-shot-guide { font-size: 13px; color: #6B6B70; line-height: 1.55; margin-bottom: 10px; }

.sl-status-ok { color: #1B8A3A; font-weight: 600; font-size: 12px; }
.sl-status-empty { color: #9A9A9F; font-weight: 500; font-size: 12px; }
</style>
"""


def apply_theme() -> None:
    """페이지 최상단에서 호출 — 공통 CSS 주입."""
    st.markdown(_CSS, unsafe_allow_html=True)


def hero(kicker: str, title: str, subtitle: str = "") -> None:
    """페이지 상단 히어로. 이모지 대신 얇은 키커 라벨로 위계 표시."""
    sub = f"<p class='sl-subtitle'>{subtitle}</p>" if subtitle else ""
    st.markdown(
        f"<div class='sl-hero'>"
        f"<div class='sl-kicker'>{kicker}</div>"
        f"<h1 class='sl-title'>{title}</h1>"
        f"{sub}"
        f"</div>",
        unsafe_allow_html=True,
    )


def section(num: str, title: str, subtitle: str = "") -> None:
    """번호 키커 + 섹션 제목."""
    sub = f"<div class='sl-h-sub'>{subtitle}</div>" if subtitle else ""
    st.markdown(
        f"<div class='sl-section'>"
        f"<div class='sl-num'>{num}</div>"
        f"<div class='sl-h'>{title}</div>"
        f"{sub}"
        f"</div>",
        unsafe_allow_html=True,
    )


def pill(text: str, tone: str = "default") -> str:
    """인라인 pill 태그 HTML 반환."""
    cls = {"red": "sl-pill sl-pill-red", "dark": "sl-pill sl-pill-dark"}.get(tone, "sl-pill")
    return f"<span class='{cls}'>{text}</span>"


def divider() -> None:
    st.markdown("<hr class='sl-hr'/>", unsafe_allow_html=True)
