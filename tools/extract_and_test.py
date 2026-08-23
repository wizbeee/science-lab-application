#!/usr/bin/env python3
"""배포 코드에서 핵심 로직을 떼어내 실제 실행으로 검증한다 (승인 정책 / 캘린더 차단 / 승인 단계)."""
import io, os, re, subprocess, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = io.open(os.path.join(ROOT, "과학실험실 신청서", "Code.gs"), encoding="utf-8").read()

def fn(name):
    i = SRC.index(f"function {name}("); d = 0; k = SRC.index("{", i)
    while k < len(SRC):
        if SRC[k] == "{": d += 1
        elif SRC[k] == "}":
            d -= 1
            if d == 0: return SRC[i:k+1]
        k += 1
def blk(head, end):
    i = SRC.index(head); j = SRC.index(end, i); return SRC[i:j+len(end)]

CONSTS = [blk("const CANONICAL_LABS_ = [", "\n];"), blk("const LAB_ALIASES_ = {", "\n};"),
          blk("const LAB_APPROVAL_POLICY_ = {", "\n};"), blk("const SUBJECT_ALIASES_ = {", "\n};"),
          blk("const SHEET_CATEGORY_MAP_ = {", "\n};"), blk("const FLOOR_GROUPS_ = [", "\n];")]
FUNCS = ["normSubject_", "parseSubjectTokens_", "teacherMatchesSubjects_", "normalizeLabName_",
         "getLabPolicy_", "isClubPurpose_", "requiredSubjectsFor_", "categoryFromSheetValue_",
         "normalizeSlot_", "expandFloorGroups_", "parseNewBlockTag_", "matchBlockByWords_",
         "parseCalendarEventForBlocks_"]
mod = "\n\n".join(CONSTS + [fn(f) for f in FUNCS]) + \
      "\nmodule.exports={requiredSubjectsFor_,teacherMatchesSubjects_,categoryFromSheetValue_," \
      "parseCalendarEventForBlocks_};\n"
io.open("/tmp/_extract.js", "w", encoding="utf-8").write(mod)
if subprocess.run(["node", "--check", "/tmp/_extract.js"]).returncode:
    print("추출본 구문 오류"); sys.exit(1)

TEST = r"""
const M = require('/tmp/_extract.js');
const TEACHERS = [['강현석','생명과학'],['김동현','물리'],['김민철','물리'],['김원우','물리(테크)'],
 ['김준겸','화학'],['김태현','화학'],['도혜진','화학'],['박기석','생명과학'],['박성태','물리'],
 ['박준원','생명과학'],['신도경','생명과학'],['신수지','물리'],['이근산','물리'],['이성일','생명과학'],
 ['이수진','화학'],['이인호','화학'],['최승아','생명과학'],['홍권능','화학'],['홍주연','화학'],
 ['윤용철','정보'],['이정석','정보'],['박연서','가정'],['이대석','기술'],['장보경','학과'],
 ['홍승민','학과'],['박희선','학과'],['학과','학과'],['테스트교사','과학']];
let fail = 0;
const chk = (ok, msg) => { if (!ok) { fail++; console.log('  ❌ ' + msg); } };

// 1) 승인 정책
const SPEC = [
 [['화학실험실'],'과제연구',2,['화학']], [['화학실험실'],'동아리 활동',2,['화학','생명과학']],
 [['생물실험실'],'과제연구',2,['생명과학']], [['생물실험실'],'동아리 활동',2,['화학','생명과학']],
 [['프로젝트실험실'],'과제연구',2,['화학','생명과학']], [['첨단기기실험실'],'동아리 활동',2,['화학','생명과학']],
 [['오픈랩'],'과제연구',2,['화학','생명과학']],
 [['물리실험실'],'과제연구',2,['물리']], [['물리실험실'],'동아리 활동',2,['물리']],
 [['파동광학실험실'],'동아리 활동',2,['물리']], [['AP Lab'],'동아리 활동',2,['물리']],
 [['IT 공학실'],'동아리 활동',1,['정보']], [['코딩실'],'과제연구',1,['정보']],
 [['IT 공학실','코딩실'],'동아리 활동',1,['정보']],
 [['Tech & Art LAB'],'동아리 활동',1,['물리(테크)']], [['가정실습실'],'동아리 활동',1,['가정']],
 [['융합기술실'],'동아리 활동',1,['기술']],
 [['융합기술실','창의공학실','공작기계실','FAB Lab'],'과제연구',1,['기술']]];
for (const [rooms, purpose, stage, subs] of SPEC) {
  const r = M.requiredSubjectsFor_(rooms, purpose);
  chk(r.ok && r.stage === stage && JSON.stringify(r.subjects) === JSON.stringify(subs),
      `정책 불일치 ${rooms.join('+')} / ${purpose} → ${r.stage}단 ${JSON.stringify(r.subjects)}`);
}
// 김원우: 2층 포함 / Tech&Art 단독
const phys = M.requiredSubjectsFor_(['물리실험실'],'').subjects;
chk(TEACHERS.filter(([n,s])=>M.teacherMatchesSubjects_(s,phys)).some(([n])=>n==='김원우'),
    '물리(테크) 교사가 2층 목록에서 누락');
const ta = M.requiredSubjectsFor_(['Tech & Art LAB'],'').subjects;
const taN = TEACHERS.filter(([n,s])=>M.teacherMatchesSubjects_(s,ta)).map(([n])=>n);
chk(taN.length===1 && taN[0]==='김원우', 'Tech & Art 자격자 이상: '+taN.join(','));
// 자격 다른 실 조합은 거부
for (const rooms of [['Tech & Art LAB','융합기술실'],['화학실험실','물리실험실'],['코딩실','가정실습실']])
  chk(M.requiredSubjectsFor_(rooms,'').subjects.length===0, '조합이 거부되지 않음: '+rooms.join('+'));

// 2) 승인 단계 (submitFinalApproval_ 가드 재현)
for (const [f, single] of [['S동 1층',false],['S동 2층',false],['IT실',true],['가정실습실',true],
 ['N동 공학 ZONE',true],['Tech & Art LAB',true],['N동 공학 ZONE, Tech & Art LAB',true],['',false]]) {
  chk(!!M.categoryFromSheetValue_(f) === single, `승인 단계 오판: '${f}'`);
}

// 3) 캘린더 차단
const C = (t) => M.parseCalendarEventForBlocks_(t, '');
chk(C('[차단] 화학실험실').labs.join()==='화학실험실', '단일 실 차단');
chk(C('[차단] 화학실험실 / ET').times.join()==='ET', '실+시간 차단');
chk(C('[차단] 전체').allBlocked, '전체 차단');
chk(C('[차단] 1층').labs.length===5, '1층 그룹');
chk(C('[차단] 2층').labs.length===6, '2층 그룹');
chk(C('[차단] 3층').labs.join()==='Tech & Art LAB', '3층 그룹');
chk(C('[차단] 공학존').labs.length===4, '공학존 그룹');
chk(C('[차단] 컴퓨터실').labs.join()==='IT 공학실', '옛 이름 변환');
chk(!C('화학실험실 대청소').labs.length && !C('화학실험실 대청소').allBlocked, '차단 단어 없는 일정');
chk(!C('Staff Meeting').times.length, "영단어 속 ET 오인");
chk(C('1층 차단').labs.length===5, '자연어 층 차단');

console.log(fail === 0 ? '  ✅ 로직 검증 통과 (정책·승인단계·캘린더)' : `  실패 ${fail}건`);
process.exit(fail ? 1 : 0);
"""
io.open("/tmp/_test.js", "w", encoding="utf-8").write(TEST)
sys.exit(subprocess.run(["node", "/tmp/_test.js"]).returncode)
