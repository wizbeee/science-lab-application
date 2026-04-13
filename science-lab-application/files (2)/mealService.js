// ============================================================
// mealService.js - NEIS 학교 급식 API
// 교육부 나이스 오픈 API (무료, 인증키 필요)
// 충남삼성고: 충남교육청(J10) / 학교코드 J100005773
// ============================================================

const NEIS_KEY = process.env.REACT_APP_NEIS_KEY || 'demo';
const BASE_URL = 'https://open.neis.go.kr/hub/mealServiceDietInfo';

function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

// 급식 메뉴 파싱 (HTML 태그 및 알레르기 번호 제거)
function parseMeal(rawDish) {
  if (!rawDish) return [];
  return rawDish
    .split('<br/>')
    .map(item => item.replace(/\d+\.\s*/g, '').replace(/<[^>]+>/g, '').trim())
    .filter(Boolean);
}

export async function fetchMeal(
  officeCode = 'J10',
  schoolCode = 'J100005773',
  date = new Date()
) {
  const dateStr = formatDate(date);

  if (NEIS_KEY === 'demo') {
    return getDemoMeal(date);
  }

  try {
    const url = `${BASE_URL}?KEY=${NEIS_KEY}&Type=json&ATPT_OFCDC_SC_CODE=${officeCode}&SD_SCHUL_CODE=${schoolCode}&MLSV_YMD=${dateStr}`;
    const res = await fetch(url);
    const data = await res.json();

    if (data.RESULT?.CODE === 'INFO-200') {
      // 급식 정보 없음
      return { date: dateStr, meals: [], message: '오늘 급식 정보가 없습니다.' };
    }

    const rows = data.mealServiceDietInfo?.[1]?.row || [];
    const meals = rows.map(row => ({
      mealType: row.MMEAL_SC_NM,  // 조식/중식/석식
      dishes: parseMeal(row.DDISH_NM),
      calories: row.CAL_INFO,
      origin: row.ORPLC_INFO,
      nutrients: row.NTR_INFO
    }));

    return { date: dateStr, meals, message: null };
  } catch (e) {
    console.warn('급식 API 실패, 샘플 사용:', e.message);
    return getDemoMeal(date);
  }
}

// 주간 급식 (5일치)
export async function fetchWeeklyMeal(officeCode = 'J10', schoolCode = 'J100005773') {
  const today = new Date();
  const results = [];

  for (let i = 0; i < 5; i++) {
    const d = new Date(today);
    const day = today.getDay();
    // 이번 주 월요일부터
    const monday = new Date(today);
    monday.setDate(today.getDate() - (day === 0 ? 6 : day - 1));
    const target = new Date(monday);
    target.setDate(monday.getDate() + i);
    const meal = await fetchMeal(officeCode, schoolCode, target);
    results.push({ ...meal, dayLabel: ['월', '화', '수', '목', '금'][i] });
  }

  return results;
}

function getDemoMeal(date) {
  const day = date.getDay();
  const menus = {
    0: ['흑미밥', '된장찌개', '제육볶음', '깍두기', '과일'],
    1: ['잡곡밥', '미역국', '닭갈비', '콩나물무침', '배추김치'],
    2: ['쌀밥', '순두부찌개', '삼치구이', '시금치나물', '깍두기'],
    3: ['현미밥', '갈비탕', '돼지불고기', '도라지무침', '배추김치'],
    4: ['흑미밥', '대구탕', '제육볶음', '브로콜리무침', '깍두기'],
    5: ['영양밥', '육개장', '돈가스', '콩나물국', '배추김치'],
    6: ['쌀밥', '콩나물국', '달걀후라이', '김치', '과일']
  };

  return {
    date: formatDate(date),
    meals: [{
      mealType: '중식',
      dishes: menus[day] || menus[1],
      calories: `${Math.floor(Math.random() * 200 + 700)} Kcal`,
      origin: null,
      nutrients: null
    }],
    message: null
  };
}
