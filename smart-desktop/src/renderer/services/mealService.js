// ============================================================
// mealService.js - NEIS 학교 급식 API
// 교육부 나이스 오픈 API (무료, API 키 없이도 작동)
// 기본값: 제주영지학교 (T10 / 9290083)
// ============================================================

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
    .map(item => item.replace(/\([\d.,]+\)/g, '').replace(/<[^>]+>/g, '').trim())
    .filter(Boolean);
}

export async function fetchMeal(
  officeCode = 'N10',
  schoolCode = '8140366',
  date = new Date()
) {
  const dateStr = formatDate(date);

  try {
    // API 키 없이도 작동 (기본 쿼리)
    const url = `${BASE_URL}?Type=json&ATPT_OFCDC_SC_CODE=${officeCode}&SD_SCHUL_CODE=${schoolCode}&MLSV_YMD=${dateStr}`;
    const res = await fetch(url);
    const data = await res.json();

    if (data.RESULT?.CODE === 'INFO-200') {
      return { date: dateStr, meals: [], message: '급식 정보가 없습니다 (주말/공휴일)' };
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
    console.warn('급식 API 실패:', e.message);
    return { date: dateStr, meals: [], message: '급식 정보를 불러올 수 없습니다' };
  }
}

// 주간 급식 (5일치)
export async function fetchWeeklyMeal(officeCode = 'T10', schoolCode = '9290083') {
  const today = new Date();
  const results = [];

  for (let i = 0; i < 5; i++) {
    const day = today.getDay();
    const monday = new Date(today);
    monday.setDate(today.getDate() - (day === 0 ? 6 : day - 1));
    const target = new Date(monday);
    target.setDate(monday.getDate() + i);
    const meal = await fetchMeal(officeCode, schoolCode, target);
    results.push({ ...meal, dayLabel: ['월', '화', '수', '목', '금'][i] });
  }

  return results;
}
