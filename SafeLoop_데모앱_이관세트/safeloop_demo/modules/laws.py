"""
법령 근거 매핑 — 27 표준 항목 × 6 핵심 법령.

핵심 법령:
- 학교보건법
- 교육시설법 (교육시설 등의 안전 및 유지관리 등에 관한 법률)
- 학교안전법 (학교안전사고 예방 및 보상에 관한 법률)
- 산업안전보건법 (산안법)
- 소방시설법
- 위험물안전관리법

각 항목의 근거는 validation/V1_점검표비교_v3.xlsx 매핑 결과를 참고하여 정리.
실제 법령 조항은 국가법령정보센터 기준으로 표기.
"""

LAW_BASIS: dict[str, dict] = {
    # 비상 대응
    "비상샤워": {
        "category": "비상 대응",
        "weight": 10,
        "law": "교육시설법 시행규칙",
        "article": "교육시설 안전·유지관리기준 제47조",
        "note": "실험실 비상샤워 설치 기준",
    },
    "세안기": {
        "category": "비상 대응",
        "weight": 10,
        "law": "교육시설법 시행규칙",
        "article": "교육시설 안전·유지관리기준 제47조",
        "note": "실험실 세안기 설치 기준",
    },
    "가스차단밸브": {
        "category": "비상 대응",
        "weight": 9,
        "law": "위험물안전관리법",
        "article": "제5조, 제17조",
        "note": "가스 공급 비상 차단 의무",
    },
    "소화기": {
        "category": "비상 대응",
        "weight": 10,
        "law": "소방시설법",
        "article": "제11조 및 별표 4",
        "note": "특정소방대상물 소화설비 설치 기준",
    },
    "소화포": {
        "category": "비상 대응",
        "weight": 6,
        "law": "학교보건법",
        "article": "시행규칙 제3조",
        "note": "과학실 화재 대응 용품",
    },
    "응급처치함": {
        "category": "비상 대응",
        "weight": 7,
        "law": "학교보건법",
        "article": "제9조",
        "note": "학교 응급처치 준비물",
    },
    # 환기·배기
    "흄후드": {
        "category": "환기·배기",
        "weight": 9,
        "law": "산업안전보건법",
        "article": "제114조, 제118조",
        "note": "유해물질 국소배기 설비",
    },
    "국소배기장치": {
        "category": "환기·배기",
        "weight": 8,
        "law": "산업안전보건법",
        "article": "제114조",
        "note": "유해가스·증기 배출",
    },
    "기계환기구": {
        "category": "환기·배기",
        "weight": 6,
        "law": "학교보건법",
        "article": "시행규칙 제3조 별표 4의2",
        "note": "교실 공기 질 기준",
    },
    "천장디퓨저": {
        "category": "환기·배기",
        "weight": 4,
        "law": "학교보건법",
        "article": "시행규칙 제3조",
        "note": "공조 설비 보조",
    },
    # 보관·격리
    "시약장(잠금)": {
        "category": "보관·격리",
        "weight": 9,
        "law": "산업안전보건법",
        "article": "제114조 및 시행규칙",
        "note": "유해화학물질 잠금 보관 의무",
    },
    "가스용기보관함": {
        "category": "보관·격리",
        "weight": 8,
        "law": "위험물안전관리법",
        "article": "시행규칙 별표 4",
        "note": "고압가스 보관함 기준",
    },
    "폐액용기": {
        "category": "보관·격리",
        "weight": 7,
        "law": "산업안전보건법",
        "article": "제114조",
        "note": "폐수·폐액 별도 수거",
    },
    "개인보호구함": {
        "category": "보관·격리",
        "weight": 5,
        "law": "산업안전보건법",
        "article": "제38조",
        "note": "PPE 지급·보관",
    },
    # 감지·경보
    "화재감지기": {
        "category": "감지·경보",
        "weight": 10,
        "law": "소방시설법",
        "article": "제11조, 별표 4",
        "note": "자동화재탐지설비 기준",
    },
    "가스누출감지기": {
        "category": "감지·경보",
        "weight": 10,
        "law": "위험물안전관리법",
        "article": "시행규칙 별표 4",
        "note": "가스 누출 경보",
    },
    "비상벨": {
        "category": "감지·경보",
        "weight": 8,
        "law": "교육시설법",
        "article": "제10조 및 시행규칙",
        "note": "비상 호출 설비",
    },
    "연기감지기": {
        "category": "감지·경보",
        "weight": 9,
        "law": "소방시설법",
        "article": "별표 4",
        "note": "연기 감지 화재 경보",
    },
    # 개인보호구
    "보안경": {
        "category": "개인보호구",
        "weight": 8,
        "law": "산업안전보건법",
        "article": "제38조",
        "note": "실험자 보안경 착용",
    },
    "실험복": {
        "category": "개인보호구",
        "weight": 7,
        "law": "산업안전보건법",
        "article": "제38조",
        "note": "유해물질 접촉 방지 의복",
    },
    "장갑": {
        "category": "개인보호구",
        "weight": 7,
        "law": "산업안전보건법",
        "article": "제38조",
        "note": "화학물질 접촉 방지",
    },
    "방독면": {
        "category": "개인보호구",
        "weight": 6,
        "law": "산업안전보건법",
        "article": "제38조, 제114조",
        "note": "독성가스 호흡기 보호",
    },
    "실험화": {
        "category": "개인보호구",
        "weight": 5,
        "law": "산업안전보건법",
        "article": "제38조",
        "note": "낙하물·비산 방지 신발",
    },
    # 안내·표지
    "MSDS비치": {
        "category": "안내·표지",
        "weight": 8,
        "law": "산업안전보건법",
        "article": "제114조",
        "note": "물질안전보건자료 비치·교육",
    },
    "안전수칙게시": {
        "category": "안내·표지",
        "weight": 5,
        "law": "학교안전법",
        "article": "제8조",
        "note": "안전교육 및 게시 의무",
    },
    "비상대응 포스터": {
        "category": "안내·표지",
        "weight": 4,
        "law": "학교안전법",
        "article": "제8조",
        "note": "비상 행동요령 게시",
    },
    "가스차단 표지": {
        "category": "안내·표지",
        "weight": 4,
        "law": "위험물안전관리법",
        "article": "시행규칙 별표",
        "note": "비상 밸브 위치 표시",
    },
}

STANDARD_ITEMS: list[str] = list(LAW_BASIS.keys())

CATEGORIES: list[str] = [
    "비상 대응",
    "환기·배기",
    "보관·격리",
    "감지·경보",
    "개인보호구",
    "안내·표지",
]


def items_by_category(category: str) -> list[str]:
    return [name for name, info in LAW_BASIS.items() if info["category"] == category]


def law_for(item_name: str) -> dict:
    return LAW_BASIS.get(item_name, {})


CORE_LAWS = [
    "학교보건법",
    "교육시설법",
    "학교안전법",
    "산업안전보건법",
    "소방시설법",
    "위험물안전관리법",
]
