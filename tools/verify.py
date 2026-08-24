#!/usr/bin/env python3
"""배포 전 전수 검증. 실패 항목만 출력하고 종료코드로 결과를 알린다."""
import re, os, sys, json, subprocess

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FORM  = os.path.join(ROOT, "과학실험실 신청서")
ADMIN = os.path.join(ROOT, "과학실험실 관리자")
fails, warns = [], []
def fail(cat, msg): fails.append((cat, msg))
def warn(cat, msg): warns.append((cat, msg))

def read(base, fn): return open(os.path.join(base, fn), encoding="utf-8").read()
def files(base, ext): return sorted(f for f in os.listdir(base) if f.endswith(ext))

def strip_scriptlets(t): return re.sub(r"<\?[!=]?=?.*?\?>", '""', t, flags=re.S)
def scripts_of(base, fn):
    t = strip_scriptlets(read(base, fn))
    return [t] if fn.endswith(".gs") else re.findall(r"<script[^>]*>(.*?)</script>", t, flags=re.S)

# ---------- 1. 구문 ----------
for base, label in ((FORM, "신청서"), (ADMIN, "관리자")):
    for fn in files(base, ".html") + files(base, ".gs"):
        for i, b in enumerate(scripts_of(base, fn)):
            if not b.strip(): continue
            open("/tmp/_v.js", "w", encoding="utf-8").write(b)
            r = subprocess.run(["node", "--check", "/tmp/_v.js"], capture_output=True, text=True)
            if r.returncode:
                fail("구문", f"{label}/{fn} script#{i+1}: {r.stderr.strip().splitlines()[0] if r.stderr.strip() else '오류'}")

# ---------- 2. 클라이언트 → 서버 호출 ----------
SKIP = {"withSuccessHandler", "withFailureHandler", "withUserObject", "run"}
def rpc_targets(base):
    calls = {}
    for fn in files(base, ".html"):
        t = read(base, fn)
        for m in re.finditer(r"google\.script\.run", t):
            tail = t[m.end():m.end()+20000]; pos = 0
            while True:
                mm = re.match(r"\s*\.\s*([A-Za-z0-9_$]+)\s*\(", tail[pos:])
                if not mm: break
                name = mm.group(1); i = pos + mm.end(); d = 1
                while i < len(tail) and d:
                    if tail[i] == "(": d += 1
                    elif tail[i] == ")": d -= 1
                    i += 1
                if name not in SKIP:
                    calls.setdefault(name, set()).add(f"{fn}:{t[:m.start()].count(chr(10))+1}"); break
                pos = i
    return calls
for base, label in ((FORM, "신청서"), (ADMIN, "관리자")):
    server = set(re.findall(r"^function\s+([A-Za-z0-9_$]+)", read(base, "Code.gs"), re.M))
    for name, where in rpc_targets(base).items():
        if name not in server:
            fail("RPC", f"{label}: 서버에 없는 함수 호출 {name}() ← {', '.join(sorted(where))}")

# ---------- 3. include / 템플릿 파일 ----------
for base, label in ((FORM, "신청서"), (ADMIN, "관리자")):
    refs = set()
    for fn in files(base, ".html") + files(base, ".gs"):
        t = read(base, fn)
        refs |= set(re.findall(r"include\(\s*['\"]([^'\"]+)['\"]", t))
        refs |= set(re.findall(r"createTemplateFromFile\(\s*['\"]([^'\"]+)['\"]", t))
        refs |= set(re.findall(r"createHtmlOutputFromFile\(\s*['\"]([^'\"]+)['\"]", t))
    for n in refs:
        if not os.path.exists(os.path.join(base, n + ".html")):
            fail("파일참조", f"{label}: {n}.html 없음")

# ---------- 4. 서버 내부 헬퍼 정의 ----------
for base, label in ((FORM, "신청서"), (ADMIN, "관리자")):
    src = read(base, "Code.gs")
    s = re.sub(r"/\*.*?\*/", "", src, flags=re.S); s = re.sub(r"//[^\n]*", "", s)
    defined = set(re.findall(r"function\s+([A-Za-z0-9_$]+)\s*\(", s))
    defined |= set(re.findall(r"(?:var|let|const)\s+([A-Za-z0-9_$]+)\s*=", s))
    for c in set(re.findall(r"(?<![.\w$])([A-Za-z_$][A-Za-z0-9_$]*)\s*\(", s)):
        if c.endswith("_") and c not in defined:
            fail("헬퍼", f"{label}: 정의되지 않은 {c}()")

# ---------- 5. 인라인 핸들러 (죽은 버튼) ----------
JS_GLOBALS = set("""if for while switch return typeof function catch alert confirm prompt parseInt parseFloat
setTimeout setInterval clearTimeout clearInterval String Number Boolean Array Object JSON Math Date RegExp
encodeURIComponent decodeURIComponent isNaN console new delete void document window Event Set Map""".split())
def closure(base, name, seen=None):
    seen = seen or set()
    if name in seen: return ""
    seen.add(name)
    p = os.path.join(base, name + ".html")
    if not os.path.exists(p): return ""
    t = open(p, encoding="utf-8").read()
    out = t
    for inc in re.findall(r"include\(\s*['\"]([^'\"]+)['\"]", t):
        out += closure(base, inc, seen)
    return out
PAGES = {FORM: ["form","form2f","form_it","form_home","form_engineering","form_techart","gateway","approve","finalApprove","chem_search"],
         ADMIN: ["admin","common_list","student_list","teacher_schedule","m_spa","entry"]}
for base, roots in PAGES.items():
    label = "신청서" if base == FORM else "관리자"
    for root in roots:
        t = closure(base, root)
        if not t: fail("페이지", f"{label}: {root}.html 없음"); continue
        defined = set(re.findall(r"function\s+([A-Za-z0-9_$]+)\s*\(", t))
        defined |= set(re.findall(r"(?:var|let|const)\s+([A-Za-z0-9_$]+)\s*=", t))
        defined |= set(re.findall(r"window\.([A-Za-z0-9_$]+)\s*=", t))
        called = set()
        for m in re.finditer(r'on(?:click|change|input|submit|keyup|keydown|focus|blur)\s*=\s*"([^"]*)"', t):
            body = m.group(1)
            for c in re.findall(r"(?<![.\w$])([A-Za-z_$][A-Za-z0-9_$]*)\s*\(", body):
                called.add(c)
        for c in sorted(called - defined - JS_GLOBALS):
            fail("죽은버튼", f"{label}/{root}: 정의되지 않은 핸들러 {c}()")

# ---------- 6. 실습실 이름 일관성 ----------
fsrc = read(FORM, "Code.gs"); asrc = read(ADMIN, "Code.gs")
def block(src, head, end):
    i = src.index(head); j = src.index(end, i); return src[i:j+len(end)]
canon  = set(re.findall(r"'([^']+)'", block(fsrc, "const CANONICAL_LABS_ = [", "\n];")))
policy = set(re.findall(r"^\s*'([^']+)':\s*\{ stage", block(fsrc, "const LAB_APPROVAL_POLICY_ = {", "\n};"), re.M))
newcfg = set()
for m in re.finditer(r"rooms:\s*\[([^\]]*)\]", block(fsrc, "const NEW_LAB_CONFIG = {", "\n};")):
    newcfg |= set(re.findall(r"'([^']+)'", m.group(1)))
floors = set()
for m in re.finditer(r"labs:\s*\[([^\]]*)\]", block(fsrc, "const FLOOR_GROUPS_ = [", "\n];"), re.S):
    floors |= set(re.findall(r"'([^']+)'", m.group(1)))
admcanon = set(re.findall(r"'([^']+)'", block(asrc, "const _ADM_CANONICAL_LABS = [", "\n];")))

for r in sorted(policy - canon): fail("실이름", f"정책에 있으나 CANONICAL_LABS_ 에 없음: {r}")
for r in sorted(canon - policy): fail("실이름", f"CANONICAL_LABS_ 에 있으나 승인 정책 없음: {r}")
for r in sorted(newcfg - policy): fail("실이름", f"NEW_LAB_CONFIG.rooms 인데 승인 정책 없음: {r}")
for r in sorted(floors - canon): fail("실이름", f"FLOOR_GROUPS_ 에 있으나 CANONICAL_LABS_ 에 없음: {r}")
for r in sorted(canon - floors): warn("실이름", f"CANONICAL_LABS_ 인데 어느 층 그룹에도 없음: {r}")
for r in sorted(canon - admcanon): fail("실이름", f"신청서 정식 이름이 관리자 목록에 없음: {r}")

# 층 그룹 키가 실 이름의 부분문자열이면 안 됨
keys = re.findall(r"keys:\s*\[([^\]]*)\]", block(fsrc, "const FLOOR_GROUPS_ = [", "\n];"))
allkeys = [k for grp in keys for k in re.findall(r"'([^']+)'", grp)]
for k in allkeys:
    for lab in canon:
        if k.replace(" ", "") in lab.lower().replace(" ", ""):
            fail("층그룹", f"그룹 키 '{k}' 가 실 이름 '{lab}' 의 부분문자열 — 그룹 전체로 번짐")

# ---------- 7. 폼 체크박스/옵션 값이 정책에 있는지 ----------
for fn, cat in [("form_it.html","it"),("form_home.html","home"),
                ("form_engineering.html","engineering"),("form_techart.html","techart")]:
    t = read(FORM, fn)
    vals = set(re.findall(r'name="labRoom"\s+value="([^"]+)"', t))
    vals = {v.replace("&amp;", "&") for v in vals}
    for v in vals:
        if v not in policy: fail("폼값", f"{fn}: 체크박스 '{v}' 에 승인 정책 없음")
for fn in ["form.html", "form2f.html"]:
    t = read(FORM, fn)
    m = re.search(r'<select id="lab"[^>]*>(.*?)</select>', t, re.S)
    if not m: fail("폼값", f"{fn}: 실험실 select 를 찾지 못함"); continue
    for v in re.findall(r"<option[^>]*>([^<]+)</option>", m.group(1)):
        v = v.strip()
        if v and v != "선택" and v not in policy:
            fail("폼값", f"{fn}: 옵션 '{v}' 에 승인 정책 없음")

# ---------- 8. 게이트웨이 → doGet 라우팅 ----------
pages = set(re.findall(r"goToForm\('([^']+)'", read(FORM, "gateway.html")))
routed = {"form", "form2f"} | set(re.findall(r"formPage:\s*'([^']+)'", fsrc))
for p in sorted(pages - routed): fail("라우팅", f"게이트웨이가 여는 page={p} 를 doGet 이 처리하지 않음")
for p in sorted(pages):
    if not os.path.exists(os.path.join(FORM, p + ".html")): fail("라우팅", f"page={p} 의 템플릿 파일 없음")
for p in sorted(routed - pages): warn("라우팅", f"doGet 은 처리하나 게이트웨이에 카드 없음: page={p}")

# ---------- 9. 양식종류 저장값 ↔ 카테고리 매핑 ----------
sheetcats = set(re.findall(r"sheetCategory:\s*'([^']+)'", fsrc))
fmap = set(re.findall(r"^\s*'([^']+)':\s*'(?:it|home|engineering|techart)'", block(fsrc, "const SHEET_CATEGORY_MAP_ = {", "\n};"), re.M))
for c in sorted(sheetcats - fmap): fail("양식종류", f"신청서가 저장하는 '{c}' 가 categoryFromSheetValue_ 매핑에 없음")
amap_src = block(asrc, "const SHEET_CAT_MAP_ = {", "\n};")
amap = set(re.findall(r"^\s*'([^']+)':", amap_src, re.M))
for c in sorted(sheetcats - amap): fail("양식종류", f"신청서가 저장하는 '{c}' 가 관리자 SHEET_CAT_MAP_ 에 없음")
for fn in ["admin_scripts.html", "m_admin_scripts.html", "student_list_scripts.html", "teacher_schedule_scripts.html"]:
    t = read(ADMIN, fn)
    m = re.search(r"SHEET_CAT_MAP\s*=\s*\{(.*?)\};", t, re.S)
    if not m: continue
    have = set(re.findall(r"'([^']+)':", m.group(1)))
    for c in sorted(sheetcats - have):
        fail("양식종류", f"관리자/{fn}: 저장값 '{c}' 매핑 없음")

# ---------- 10. 관리자 실험실 드롭다운 ----------
for fn in ["admin_body.html", "m_admin_body.html"]:
    t = read(ADMIN, fn)
    opts = {v.replace("&amp;", "&") for v in re.findall(r'<option value="([^"]+)">', t)}
    for r in sorted(policy):
        if r not in opts: fail("관리자목록", f"{fn}: 실험실 옵션에 '{r}' 없음")


# ---------- 11. 폼 전송 필드 ↔ 서버 필수값 ----------
def payload_keys(base, fn):
    t = read(base, fn)
    keys = set()
    for m in re.finditer(r"studentId\s*:", t):
        i = t.rfind("{", 0, m.start())
        if i < 0: continue
        d = 0; j = i
        while j < len(t):
            if t[j] == "{": d += 1
            elif t[j] == "}":
                d -= 1
                if d == 0: break
            j += 1
        keys |= set(re.findall(r"^\s*([A-Za-z_$][A-Za-z0-9_$]*)\s*:", t[i:j+1], re.M))
    return keys

# 서버 submitApplication_ 이 필수로 요구하는 필드
SERVER_REQUIRED = ["studentId", "studentName", "lab", "date", "timeSlot", "title", "teacher"]
FORMS = ["form.html", "form2f.html", "form_it.html", "form_home.html",
         "form_engineering.html", "form_techart.html"]
for fn in FORMS:
    ks = payload_keys(FORM, fn)
    if not ks:
        fail("전송필드", f"{fn}: 제출 payload 를 찾지 못함")
        continue
    for k in SERVER_REQUIRED:
        if k not in ks:
            fail("전송필드", f"{fn}: 서버 필수값 '{k}' 를 보내지 않음 → 제출이 항상 거부됨")
    if "teacherEmail" not in ks:
        warn("전송필드", f"{fn}: teacherEmail 미전송 (서버가 이름으로 재조회하므로 동작은 함)")
    # 신규 양식은 formCategory / labRooms 가 있어야 단일 승인 라우팅이 걸린다
    if fn not in ("form.html", "form2f.html"):
        for k in ("formCategory", "labRooms"):
            if k not in ks:
                fail("전송필드", f"{fn}: '{k}' 미전송 → 신규 양식으로 인식되지 않음")

# ---------- 12. 신규 폼 formCategory ↔ NEW_LAB_CONFIG 키 ----------
cfg_keys = set(re.findall(r"^  ([a-z]+):\s*\{", block(fsrc, "const NEW_LAB_CONFIG = {", "\n};"), re.M))
for fn in ["form_it.html", "form_home.html", "form_engineering.html", "form_techart.html"]:
    t = read(FORM, fn)
    m = re.search(r"const CATEGORY\s*=\s*<\?!=\s*JSON\.stringify\(category \|\| '([^']+)'\)", t)
    if not m:
        fail("카테고리", f"{fn}: CATEGORY 기본값을 찾지 못함")
    elif m.group(1) not in cfg_keys:
        fail("카테고리", f"{fn}: CATEGORY='{m.group(1)}' 가 NEW_LAB_CONFIG 에 없음")

# ---------- 13. 임시저장 폼키 ----------
for fn in ["form_it.html", "form_home.html", "form_engineering.html", "form_techart.html"]:
    t = read(FORM, fn)
    if ".loadDraft(" in t and "CATEGORY" not in t.split(".loadDraft(")[1][:120]:
        warn("임시저장", f"{fn}: loadDraft 에 폼 종류 키가 안 넘어가는 것으로 보임")


# ---------- 14. 폼이 보내는 값이 서버에서 실제로 저장되는가 ----------
#   put('컬럼', <식>) 의 식에 formCategory === 'x' 비교가 있으면, 그 목록에 없는
#   카테고리는 값이 버려진다. 폼에 입력란은 있는데 저장이 안 되는 사고를 막는다.
sub = fsrc[fsrc.index("function submitApplication_("):]
sub = sub[:sub.index("\nfunction ", 10)]
put_calls = []
for m in re.finditer(r"put\(\s*'([^']+)'\s*,", sub):
    i = m.start(); d = 0; j = sub.index("(", i)
    k = j
    while k < len(sub):
        if sub[k] == "(": d += 1
        elif sub[k] == ")":
            d -= 1
            if d == 0: break
        k += 1
    put_calls.append((m.group(1), sub[j:k+1]))

FORM_CAT = {"form_it.html": "it", "form_home.html": "home",
            "form_engineering.html": "engineering", "form_techart.html": "techart"}
# 폼 payload 키 → 서버가 그 값을 저장하는 put 식
for fn, cat in FORM_CAT.items():
    ks = payload_keys(FORM, fn)
    for k in sorted(ks):
        if k in ("formCategory", "formType", "is7thPeriod", "labRooms"): continue
        hits = [(col, expr) for col, expr in put_calls if re.search(r"data\.%s\b" % re.escape(k), expr)]
        if not hits: continue
        for col, expr in hits:
            cats = set(re.findall(r"formCategory\s*===\s*'([a-z]+)'", expr))
            if cats and cat not in cats:
                fail("저장누락", f"{fn}: '{k}' 를 보내지만 서버가 {col} 컬럼에 저장하지 않음 "
                                 f"(허용 카테고리: {', '.join(sorted(cats))} / 이 폼: {cat})")

# ---------- 15. 저장 컬럼이 시트 헤더 목록에 정의돼 있는가 ----------
NEW_COLS = set(re.findall(r"'([^']+)'", block(fsrc, "const NEW_LAB_COLUMNS", "\n];"))) if "const NEW_LAB_COLUMNS" in fsrc else set()

# ---------- 16. 카테고리 분기 완전성 ----------
#   'engineering' 을 따지는 곳은 'techart' 도 함께 따져야 한다.
#   (Tech & Art LAB 은 공학에서 분리됐지만 저장 컬럼·화면 구성이 같다)
for base, label in ((FORM, "신청서"), (ADMIN, "관리자")):
    for fn in files(base, ".html") + files(base, ".gs"):
        t = read(base, fn)
        if "=== 'engineering'" in t and "=== 'techart'" not in t:
            fail("카테고리분기", f"{label}/{fn}: 'engineering' 분기는 있는데 'techart' 분기가 없음")


# ---------- 17. 폼이 받은 값이 최종 승인 화면에 표시되는가 ----------
#   저장은 되는데 승인자에게 안 보이면 "내용을 못 보고 승인"이 된다.
fa = read(FORM, "finalApprove.html")
# data['컬럼'] 을 쓰는 위치의 바로 위쪽 if (newCat === '...') 조건을 찾는다
def display_cats(col):
    cats = set()
    for m in re.finditer(r"data\['%s'\]" % re.escape(col), fa):
        head = fa[:m.start()]
        ifs = re.findall(r"if \(newCat === '([a-z]+)'(?:\s*\|\|\s*newCat === '([a-z]+)')?(?:\s*\|\|\s*newCat === '([a-z]+)')?\)", head)
        if not ifs:
            return None          # 조건 없이 항상 표시
        cats |= {c for c in ifs[-1] if c}
    return cats

# 폼 payload 키 → 저장 컬럼
key2col = {}
for col, expr in put_calls:
    for k in re.findall(r"data\.([A-Za-z_$][A-Za-z0-9_$]*)", expr):
        key2col.setdefault(k, set()).add(col)

SKIP_KEYS = {"formCategory","formType","is7thPeriod","labRooms","studentId","studentName",
             "teamMembers","totalParticipants","purpose","otherPurpose","date","timeSlot",
             "title","teacher","teacherEmail","lab","visitStart","visitEnd","materialsList",
             "dangerousTools","computerNumbers","soldering"}
for fn, cat in FORM_CAT.items():
    for k in sorted(payload_keys(FORM, fn) - SKIP_KEYS):
        for col in key2col.get(k, ()):
            cats = display_cats(col)
            if cats is None: continue           # 항상 표시 → 문제 없음
            if not cats: continue               # 화면에 아예 없음 → 별도 판단
            if cat not in cats:
                fail("승인화면", f"{fn}: '{k}'({col}) 이 최종 승인 화면에 표시되지 않음 "
                                 f"(표시 카테고리: {', '.join(sorted(cats))} / 이 폼: {cat})")


# ---------- 18. 코드가 쓰는 시트 컬럼이 실제 시트에 있는가 ----------
HDR_PATH = os.path.join(ROOT, "tools", "sheet_headers.json")
if os.path.exists(HDR_PATH):
    hdrs = json.load(open(HDR_PATH, encoding="utf-8"))
    main_cols = set(hdrs["신청기록"]) | set(hdrs.get("추가예정", []))
    chem_cols = set(hdrs["시약기록"])
    # 신청서가 put() 으로 쓰는 컬럼
    for col, _ in put_calls:
        if col not in main_cols:
            fail("시트컬럼", f"신청서 submitApplication_ 이 쓰는 '{col}' 컬럼이 신청 기록 시트에 없음")
    # submitApproval_ / submitFinalApproval_ 의 put
    for fname in ("submitApproval_", "submitFinalApproval_"):
        seg = fsrc[fsrc.index(f"function {fname}("):]
        seg = seg[:seg.index("\nfunction ", 10)]
        for col in re.findall(r"put\(\s*'([^']+)'", seg):
            if col not in main_cols:
                fail("시트컬럼", f"신청서 {fname} 이 쓰는 '{col}' 컬럼이 신청 기록 시트에 없음")
    # 관리자가 편집 대상으로 삼는 컬럼
    for m in re.finditer(r"(?:EDITABLE_FIELDS|EDITABLE)\s*=\s*\[(.*?)\]", asrc, re.S):
        for col in re.findall(r"'([^']+)'", m.group(1)):
            if col not in main_cols:
                fail("시트컬럼", f"관리자 편집 대상 '{col}' 컬럼이 신청 기록 시트에 없음")
    # 관리자 화면이 읽는 컬럼
    COMPUTED = {"chemicals", "시약목록"}      # 서버가 만들어 붙이는 값 (시트 컬럼 아님)
    for fn in files(ADMIN, ".html"):
        for ln, line in enumerate(read(ADMIN, fn).splitlines(), 1):
            cols = re.findall(r"app\['([^']+)'\]", line)
            if not cols: continue
            valid = [c for c in cols if c in main_cols or c in chem_cols or c in COMPUTED
                     or c.startswith("_")]
            # 같은 줄에 올바른 컬럼이 함께 있으면 폴백 표기로 보고 넘어간다
            if valid: continue
            for c in cols:
                warn("시트컬럼", f"관리자/{fn}:{ln}: 화면이 읽는 '{c}' 컬럼이 어느 시트에도 없음")
    if hdrs.get("_main_a1_observed") and hdrs["_main_a1_observed"] != "신청ID":
        fail("시트데이터", f"신청 기록 시트 A1 이 '신청ID' 가 아니라 '{hdrs['_main_a1_observed']}' 임 "
                          f"— 신청·승인·관리자 조회가 모두 멈춥니다. 시트에서 직접 고쳐야 합니다")


# ---------- 19. 지도교사 선택기가 참조하는 요소가 실제로 있는가 ----------
for fn in FORMS:
    t = closure(FORM, fn[:-5])
    for m in re.finditer(r"loadEligibleTeachers\(\s*\{(.*?)\}\s*\)", read(FORM, fn), re.S):
        body = m.group(1)
        for opt in ("selectId", "emailId", "hintId"):
            mm = re.search(opt + r"\s*:\s*'([^']+)'", body)
            if not mm: continue
            eid = mm.group(1)
            if not re.search(r'id="%s"' % re.escape(eid), t):
                fail("요소참조", f"{fn}: loadEligibleTeachers 의 {opt}='{eid}' 요소가 페이지에 없음")

# ---------- 결과 ----------
print("=" * 78)
print(f"검증 결과 — 실패 {len(fails)}건 / 경고 {len(warns)}건")
print("=" * 78)
if fails:
    for c, m in fails: print(f"  [실패:{c}] {m}")
if warns:
    print()
    for c, m in warns: print(f"  [경고:{c}] {m}")
if not fails: print("  ✅ 실패 항목 없음")
sys.exit(1 if fails else 0)
