"""
Stage 2 PoC — 학교 공간 3-Layer AI 점검표 자동 생성 시스템
==============================================================
L1: 공간 유형 식별 (Space Classification)
L2: 안전 설비 탐지 (Safety Equipment Detection)
L3: 맞춤형 점검표 생성 (Custom Checklist Generation)

대회 규정 준수: 모든 프롬프트·응답을 logs/ 에 원문 저장
"""
import os
import sys
import ssl
import base64
import json
import datetime
from pathlib import Path

# --- 네트워크 환경 보정 (SOCKS 프록시 제거, HTTP 프록시 + 시스템 CA 사용) ---
for _k in ['ALL_PROXY', 'all_proxy', 'FTP_PROXY', 'ftp_proxy',
           'GRPC_PROXY', 'grpc_proxy', 'RSYNC_PROXY']:
    os.environ.pop(_k, None)

import httpx
from anthropic import Anthropic

# ============================================================
# 설정
# ============================================================
MODEL = "claude-opus-4-5"                # L1·L2 Vision 분석용
MODEL_L3 = "claude-haiku-4-5-20251001"   # L3 텍스트 reasoning (빠른 생성)
ROOT = Path(__file__).parent
LOG_DIR = ROOT / "poc_logs"
LOG_DIR.mkdir(exist_ok=True)

CHEMISTRY_DIR = ROOT / "processed_photos"
PHYSICS_DIR = ROOT / "processed_photos_physics"

# TLS 가로채기 프록시 대응: 시스템 CA 번들 사용
_CA_BUNDLE = "/etc/ssl/certs/ca-certificates.crt"
_HTTP_PROXY = os.environ.get("HTTPS_PROXY") or os.environ.get("HTTP_PROXY")

if _HTTP_PROXY and os.path.exists(_CA_BUNDLE):
    _ssl_ctx = ssl.create_default_context(cafile=_CA_BUNDLE)
    _http_client = httpx.Client(proxy=_HTTP_PROXY, timeout=120.0, verify=_ssl_ctx)
    client = Anthropic(http_client=_http_client)
else:
    client = Anthropic()  # ANTHROPIC_API_KEY 환경변수 사용

# ============================================================
# 유틸
# ============================================================
def encode_image(path: Path) -> dict:
    """이미지를 Claude Vision API 입력 형식으로 인코딩"""
    with open(path, "rb") as f:
        data = base64.standard_b64encode(f.read()).decode("utf-8")
    return {
        "type": "image",
        "source": {"type": "base64", "media_type": "image/jpeg", "data": data},
    }

def save_log(filename: str, content: dict):
    """프롬프트·응답을 JSON 로그로 저장 (대회 규정)"""
    path = LOG_DIR / filename
    with open(path, "w", encoding="utf-8") as f:
        json.dump(content, f, ensure_ascii=False, indent=2)
    print(f"  [로그] {path.name}")

def call_claude(system: str, user_content: list, stage: str, model: str = None) -> str:
    """Claude API 호출 (시스템+사용자 메시지). model 지정 안하면 MODEL 사용."""
    mdl = model or MODEL
    print(f"  [API 호출] {stage} / model={mdl}")
    resp = client.messages.create(
        model=mdl,
        max_tokens=4096,
        system=system,
        messages=[{"role": "user", "content": user_content}],
    )
    return resp.content[0].text

# ============================================================
# L1 — 공간 유형 식별
# ============================================================
L1_SYSTEM = """당신은 한국 중·고등학교 시설 안전 점검 전문가입니다.
주어진 공간 사진을 분석해 공간 유형을 판정합니다.

판정 가능한 공간 유형:
- 화학실 / 물리실 / 생명과학실 / 지구과학실
- 기술실 / 가정실
- 음악실 / 미술실
- 강당 / 체육관 / 급식실
- 일반교실 / 특별교실(과목 불명)

판단 근거는 설비·집기·실험 기구 등 시각적 증거로만 제시하세요.
추측 또는 학교명·개인명 등 식별정보는 절대 사용하지 마세요.

출력은 아래 JSON 형식을 엄격히 따르세요:
{
  "space_type_primary": "공간 유형",
  "confidence": 0.0~1.0,
  "evidence": ["근거1", "근거2", ...],
  "secondary_hypothesis": "차선 후보 (없으면 null)",
  "notes": "특이사항"
}"""

def run_l1(space_label: str, image_paths: list[Path]) -> dict:
    print(f"\n=== L1: {space_label} 공간 식별 ===")
    user = [{"type": "text", "text": f"{len(image_paths)}장의 사진을 보고 공간 유형을 판정하세요."}]
    for p in image_paths:
        user.append(encode_image(p))
        print(f"  입력: {p.name}")
    raw = call_claude(L1_SYSTEM, user, f"L1-{space_label}")
    save_log(f"L1_{space_label}_raw.json", {
        "timestamp": datetime.datetime.now().isoformat(),
        "model": MODEL,
        "system_prompt": L1_SYSTEM,
        "image_inputs": [p.name for p in image_paths],
        "raw_response": raw,
    })
    try:
        parsed = json.loads(raw.strip().removeprefix("```json").removesuffix("```").strip())
    except json.JSONDecodeError:
        # JSON 추출 fallback
        import re
        m = re.search(r"\{[\s\S]*\}", raw)
        parsed = json.loads(m.group()) if m else {"raw": raw}
    return parsed

# ============================================================
# L2 — 안전 설비 탐지
# ============================================================
L2_SYSTEM = """당신은 학교 안전 설비 탐지 전문가입니다.
주어진 공간 사진들에서 **시각적으로 식별 가능한** 안전 설비를 모두 나열하세요.

탐지 대상 카테고리:
1. 비상 대응: 비상샤워, 세안기, 가스차단밸브, 소화기, 소화포, 응급처치함
2. 환기·배기: 흄후드, 국소배기장치, 기계환기구, 천장디퓨저
3. 보관·격리: 시약장(잠금), 가스용기보관함, 폐액용기, 개인보호구함
4. 감지·경보: 화재감지기, 가스누출감지기, 비상벨, 연기감지기
5. 개인보호구(PPE): 보안경, 실험복, 장갑, 방독면, 실험화
6. 안내·표지: MSDS비치, 안전수칙게시, 비상대응 포스터, 가스차단 표지

규칙:
- 사진에서 실제로 **보이는 것만** 기재 (추측 금지)
- 있으나 **세부상태 확인 불가**한 것은 status="존재확인"
- 품질·작동상태가 확인된 경우 status="상태양호" 또는 "상태불량"

출력 JSON 형식:
{
  "detected_equipment": [
    {"category": "...", "name": "설비명", "status": "존재확인|상태양호|상태불량", "image_ref": "lab_pNN_XXX.jpg", "note": "추가설명"}
  ],
  "likely_absent_equipment": [
    {"category": "...", "name": "해당 공간 유형에 일반적으로 필요하나 사진에서 식별되지 않음", "reason": "..."}
  ],
  "ambiguous_items": ["확실하지 않은 항목"]
}"""

def run_l2(space_label: str, space_type: str, image_paths: list[Path]) -> dict:
    print(f"\n=== L2: {space_label} 안전설비 탐지 ===")
    user = [{"type": "text",
             "text": f"이 공간은 L1 판정 결과 '{space_type}'입니다. 해당 공간 유형에서 필요한 안전설비를 탐지해주세요."}]
    for p in image_paths:
        user.append(encode_image(p))
        print(f"  입력: {p.name}")
    raw = call_claude(L2_SYSTEM, user, f"L2-{space_label}")
    save_log(f"L2_{space_label}_raw.json", {
        "timestamp": datetime.datetime.now().isoformat(),
        "model": MODEL,
        "system_prompt": L2_SYSTEM,
        "image_inputs": [p.name for p in image_paths],
        "space_type_from_l1": space_type,
        "raw_response": raw,
    })
    try:
        parsed = json.loads(raw.strip().removeprefix("```json").removesuffix("```").strip())
    except json.JSONDecodeError:
        import re
        m = re.search(r"\{[\s\S]*\}", raw)
        parsed = json.loads(m.group()) if m else {"raw": raw}
    return parsed

# ============================================================
# L3 — 맞춤형 점검표 생성
# ============================================================
L3_SYSTEM = """당신은 학교 시설 안전 점검 체크리스트 설계 전문가입니다.
L1(공간 식별)과 L2(설비 탐지) 결과를 바탕으로, 이 공간만을 위한 맞춤형 점검 체크리스트를 생성합니다.

설계 원칙:
1. 항목 수: 10~18개 (관리 가능 범위)
2. 각 항목은 (a) 해당 공간에서 점검 필요한 설비·요소, (b) 점검 방법(관찰·측정·기록), (c) 합격 기준을 포함
3. **탐지된 설비는 '상태 점검' 항목으로 작성**
4. **누락된 핵심 설비는 '설치 권고 및 후속 조치' 항목으로 작성**
5. 일반적 학교 점검 항목과 차별화되는 공간 특이 항목을 반드시 포함
6. 법적 근거(고등학교 안전점검 지침, 학교보건법, 산업안전보건법 등) 가능하면 병기

출력 JSON:
{
  "space_type": "...",
  "checklist_name": "OO실 맞춤형 안전 점검표",
  "items": [
    {
      "no": 1,
      "category": "대분류",
      "title": "점검 제목",
      "method": "점검 방법",
      "criterion": "합격 기준",
      "basis": "법적·지침 근거 (없으면 null)",
      "item_type": "상태점검 | 설치권고",
      "priority": "상|중|하"
    }
  ],
  "rationale": "이 공간에만 맞춤화된 이유 (100~200자)"
}"""

def run_l3(space_label: str, l1_result: dict, l2_result: dict) -> dict:
    print(f"\n=== L3: {space_label} 맞춤형 점검표 생성 ===")
    payload = f"""L1 결과:
{json.dumps(l1_result, ensure_ascii=False, indent=2)}

L2 결과:
{json.dumps(l2_result, ensure_ascii=False, indent=2)}

위 결과를 근거로 이 공간만을 위한 맞춤형 점검표를 생성하세요."""
    user = [{"type": "text", "text": payload}]
    raw = call_claude(L3_SYSTEM, user, f"L3-{space_label}", model=MODEL_L3)
    save_log(f"L3_{space_label}_raw.json", {
        "timestamp": datetime.datetime.now().isoformat(),
        "model": MODEL_L3,
        "system_prompt": L3_SYSTEM,
        "input_l1": l1_result,
        "input_l2": l2_result,
        "raw_response": raw,
    })
    try:
        parsed = json.loads(raw.strip().removeprefix("```json").removesuffix("```").strip())
    except json.JSONDecodeError:
        import re
        m = re.search(r"\{[\s\S]*\}", raw)
        parsed = json.loads(m.group()) if m else {"raw": raw}
    return parsed

# ============================================================
# 메인
# ============================================================
def run_space_pipeline(space_label: str, image_dir: Path,
                       manual_space_type: str = None) -> dict:
    """한 공간에 대해 L1→L2→L3 전체 파이프라인 실행.

    manual_space_type:
        None         → AI 자동 판정 모드 (기존 동작, L1 API 호출)
        "화학실" 등  → 수동 지정 모드 (L1 API 호출 생략, 교사 입력 사용)
    """
    images = sorted(image_dir.glob("*.jpg"))
    print(f"\n{'='*60}\n공간: {space_label}  ({len(images)}장)\n{'='*60}")

    if manual_space_type:
        # [수동 모드] L1 API 호출 생략, 교사 입력을 그대로 사용
        l1_result = {
            "space_type_primary": manual_space_type,
            "confidence": 1.0,
            "evidence": ["담당 교사 직접 입력"],
            "secondary_hypothesis": None,
            "notes": "L1 자동 판정을 생략하고 교사가 공간 유형을 직접 지정",
            "source": "manual",
        }
        print(f"  → L1 수동 지정: {manual_space_type} (교사 입력)")
    else:
        # [자동 모드] 기존 L1 호출
        l1_images = [p for p in images if "wide" in p.name.lower()] or images[:2]
        l1_result = run_l1(space_label, l1_images)
        l1_result["source"] = "ai_auto"
        print(f"  → L1 판정: {l1_result.get('space_type_primary')} (conf={l1_result.get('confidence')})")

    # L2: 전체 이미지 사용
    space_type = l1_result.get('space_type_primary', '알 수 없음')
    l2_result = run_l2(space_label, space_type, images)
    print(f"  → L2 탐지: {len(l2_result.get('detected_equipment', []))}개 설비")

    # L3
    l3_result = run_l3(space_label, l1_result, l2_result)
    print(f"  → L3 생성: {len(l3_result.get('items', []))}개 점검 항목")

    # 종합 결과 저장
    combined = {
        "space_label": space_label,
        "timestamp": datetime.datetime.now().isoformat(),
        "l1_source": l1_result.get("source", "ai_auto"),
        "L1": l1_result,
        "L2": l2_result,
        "L3": l3_result,
    }
    save_log(f"{space_label}_combined.json", combined)
    return combined

if __name__ == "__main__":
    print("Stage 2 PoC — 학교 공간 3-Layer AI 점검표 생성")
    print(f"모델: {MODEL}")
    print(f"로그 디렉토리: {LOG_DIR}")

    results = {}
    # 화학실: 자동 판정 모드 (AI가 사진만 보고 공간 유형 식별)
    results["화학실"] = run_space_pipeline("화학실", CHEMISTRY_DIR)
    # 물리실: 수동 지정 모드 (교사가 공간 유형 직접 입력, L1 API 생략)
    results["물리실"] = run_space_pipeline("물리실", PHYSICS_DIR, manual_space_type="물리실")

    # 최종 비교 리포트 저장
    save_log("comparison_report.json", {
        "timestamp": datetime.datetime.now().isoformat(),
        "spaces": list(results.keys()),
        "summary": {
            label: {
                "l1_source": r.get("l1_source", "ai_auto"),
                "l1_type": r["L1"].get("space_type_primary"),
                "l1_confidence": r["L1"].get("confidence"),
                "l2_detected_count": len(r["L2"].get("detected_equipment", [])),
                "l2_absent_count": len(r["L2"].get("likely_absent_equipment", [])),
                "l3_item_count": len(r["L3"].get("items", [])),
            } for label, r in results.items()
        },
        "full_results": results,
    })
    print("\n\n=== 완료 ===")
    print(f"모든 로그: {LOG_DIR}")
