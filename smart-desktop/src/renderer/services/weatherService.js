// ============================================================
// weatherService.js - 대한민국 기상청 + 에어코리아 API
// 기상청 초단기실황/단기예보 (공공데이터포털)
// 에어코리아 미세먼지 (공공데이터포털)
// API키 없으면 OpenWeatherMap fallback → 샘플 데이터
// ============================================================

// ── 기상청 API 설정 ──────────────────────────────────────────
// 공공데이터포털: https://www.data.go.kr/data/15084084/openapi.do
// 발급받은 일반 인증키(Decoding)를 설정에서 입력
const KMA_BASE = 'https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0';

// ── 위경도 → 기상청 격자 좌표 변환 (Lambert Conformal Conic) ──
function latLonToGrid(lat, lon) {
  const RE = 6371.00877, GRID = 5.0, SLAT1 = 30.0, SLAT2 = 60.0;
  const OLAT = 38.0, OLON = 126.0, XO = 43, YO = 136;
  const DEGRAD = Math.PI / 180.0;
  const re = RE / GRID;
  const slat1 = SLAT1 * DEGRAD, slat2 = SLAT2 * DEGRAD;
  const olon = OLON * DEGRAD, olat = OLAT * DEGRAD;

  let sn = Math.tan(Math.PI * 0.25 + slat2 * 0.5) / Math.tan(Math.PI * 0.25 + slat1 * 0.5);
  sn = Math.log(Math.cos(slat1) / Math.cos(slat2)) / Math.log(sn);
  let sf = Math.tan(Math.PI * 0.25 + slat1 * 0.5);
  sf = (Math.pow(sf, sn) * Math.cos(slat1)) / sn;
  let ro = Math.tan(Math.PI * 0.25 + olat * 0.5);
  ro = (re * sf) / Math.pow(ro, sn);

  let ra = Math.tan(Math.PI * 0.25 + lat * DEGRAD * 0.5);
  ra = (re * sf) / Math.pow(ra, sn);
  let theta = lon * DEGRAD - olon;
  if (theta > Math.PI) theta -= 2.0 * Math.PI;
  if (theta < -Math.PI) theta += 2.0 * Math.PI;
  theta *= sn;

  return {
    nx: Math.floor(ra * Math.sin(theta) + XO + 0.5),
    ny: Math.floor(ro - ra * Math.cos(theta) + YO + 0.5)
  };
}

// 기상청 API 기준 시간 계산 (초단기실황: 매시 정각, 단기예보: 0200/0500/0800/1100/1400/1700/2000/2300)
function getBaseDateTime() {
  const now = new Date();
  // 40분 전을 기준으로 (API 데이터 생성까지 약 30~40분 소요)
  now.setMinutes(now.getMinutes() - 40);
  const date = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const time = `${String(now.getHours()).padStart(2, '0')}00`;
  return { base_date: date, base_time: time };
}

function getFcstBaseTime() {
  const now = new Date();
  const hours = [2, 5, 8, 11, 14, 17, 20, 23];
  const h = now.getHours();
  // 현재 시간에서 가장 최근의 발표 시각 찾기
  let baseH = hours[0];
  for (const bh of hours) {
    if (h >= bh + 1) baseH = bh; // +1: 데이터 생성 시간 고려
  }
  const d = new Date(now);
  if (h < 3) { // 새벽에는 전날 23시 기준
    d.setDate(d.getDate() - 1);
    baseH = 23;
  }
  const date = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  return { base_date: date, base_time: String(baseH).padStart(2, '0') + '00' };
}

// 날씨 상태 → 이모지
const weatherMap = {
  '맑음': '☀️', '구름많음': '⛅', '흐림': '☁️',
  '비': '🌧️', '비/눈': '🌨️', '눈': '❄️', '소나기': '🌦️',
  '천둥번개': '⛈️', '안개': '🌫️'
};
const skyMap = { 1: '맑음', 3: '구름많음', 4: '흐림' };
const ptyMap = { 0: null, 1: '비', 2: '비/눈', 3: '눈', 4: '소나기', 5: '비', 6: '비/눈', 7: '눈' };

// ── OpenWeatherMap fallback 설정 ──────────────────────────────
const OWM_API_KEY = process.env.REACT_APP_OWM_KEY || 'demo';
const owmWeatherMap = {
  Thunderstorm: { label: '천둥번개', emoji: '⛈️' },
  Drizzle: { label: '이슬비', emoji: '🌦️' },
  Rain: { label: '비', emoji: '🌧️' },
  Snow: { label: '눈', emoji: '❄️' },
  Mist: { label: '안개', emoji: '🌫️' },
  Fog: { label: '짙은안개', emoji: '🌫️' },
  Clear: { label: '맑음', emoji: '☀️' },
  Clouds: { label: '구름', emoji: '⛅' }
};

// ── 메인 날씨 조회 ──────────────────────────────────────────
export async function fetchWeather(lat = 36.7798, lon = 127.0043, kmaKey = '') {
  // 1순위: 기상청 API (키가 있을 때)
  if (kmaKey && kmaKey !== 'demo') {
    try {
      return await fetchKMAWeather(lat, lon, kmaKey);
    } catch (e) {
      console.warn('[날씨] 기상청 API 실패, fallback:', e.message);
    }
  }

  // 2순위: OpenWeatherMap
  if (OWM_API_KEY && OWM_API_KEY !== 'demo') {
    try {
      return await fetchOWMWeather(lat, lon);
    } catch (e) {
      console.warn('[날씨] OWM 실패:', e.message);
    }
  }

  // 3순위: API 키 없음 → null 반환 (위젯에서 안내 표시)
  return null;
}

// ── 기상청 초단기실황 API ─────────────────────────────────────
async function fetchKMAWeather(lat, lon, serviceKey) {
  const { nx, ny } = latLonToGrid(lat, lon);
  const { base_date, base_time } = getBaseDateTime();

  const params = new URLSearchParams({
    serviceKey,
    numOfRows: '30',
    pageNo: '1',
    dataType: 'JSON',
    base_date,
    base_time,
    nx: String(nx),
    ny: String(ny)
  });

  const res = await fetch(`${KMA_BASE}/getUltraSrtNcst?${params}`, { timeout: 10000 });
  if (!res.ok) throw new Error(`기상청 API HTTP ${res.status}`);
  const json = await res.json();

  const items = json.response?.body?.items?.item;
  if (!items || !Array.isArray(items)) {
    throw new Error(json.response?.header?.resultMsg || '기상청 데이터 없음');
  }

  // 카테고리별 값 추출
  const get = (cat) => {
    const item = items.find(i => i.category === cat);
    return item ? parseFloat(item.obsrValue) : null;
  };

  const temp = get('T1H');     // 기온
  const rn1 = get('RN1');      // 1시간 강수량
  const pty = get('PTY');      // 강수형태 (0:없음, 1:비, 2:비/눈, 3:눈, 4:소나기)
  const reh = get('REH');      // 습도
  const wsd = get('WSD');      // 풍속
  // ⚠️ 초단기실황(getUltraSrtNcst)은 SKY를 제공하지 않음 — 단기예보에서 가져옴

  // 단기예보에서 최저/최고 기온 + 현재 시각 SKY/PTY 가져오기
  let tempMin = temp, tempMax = temp;
  let fcstSky = null, fcstPty = null;
  try {
    const fcstData = await fetchKMAFcstMinMax(nx, ny, serviceKey);
    if (fcstData) {
      tempMin = fcstData.tmn ?? temp;
      tempMax = fcstData.tmx ?? temp;
      fcstSky = fcstData.sky;
      fcstPty = fcstData.pty;
    }
  } catch {}

  // 날씨 상태 결정: PTY(강수) 우선 → 없으면 SKY(하늘상태)
  // 실황 PTY 우선 사용, 없으면 예보 PTY, 이후 예보 SKY
  const effectivePty = (pty && pty > 0) ? pty : ((fcstPty && fcstPty > 0) ? fcstPty : 0);
  let description = '맑음';
  if (effectivePty > 0 && ptyMap[effectivePty]) {
    description = ptyMap[effectivePty];
  } else if (fcstSky && skyMap[fcstSky]) {
    description = skyMap[fcstSky];
  }

  const emoji = weatherMap[description] || '☀️';
  const hour = new Date().getHours();

  return {
    temp: Math.round(temp ?? 0),
    feelsLike: Math.round((temp ?? 0) - (wsd ?? 0) * 0.5), // 간이 체감 온도
    tempMin: Math.round(tempMin),
    tempMax: Math.round(tempMax),
    humidity: Math.round(reh ?? 0),
    windSpeed: Math.round((wsd ?? 0) * 3.6), // m/s → km/h
    description,
    emoji: (hour < 6 || hour >= 20) && description === '맑음' ? '🌙' : emoji,
    city: '',
    source: 'kma'
  };
}

// 단기예보에서 최저/최고 기온 + 현재 시각 SKY/PTY 조회
async function fetchKMAFcstMinMax(nx, ny, serviceKey) {
  const { base_date, base_time } = getFcstBaseTime();
  const params = new URLSearchParams({
    serviceKey, numOfRows: '1000', pageNo: '1', dataType: 'JSON',
    base_date, base_time, nx: String(nx), ny: String(ny)
  });

  const res = await fetch(`${KMA_BASE}/getVilageFcst?${params}`, { timeout: 10000 });
  if (!res.ok) return null;
  const json = await res.json();
  const items = json.response?.body?.items?.item;
  if (!items) return null;

  const tmn = items.find(i => i.category === 'TMN');
  const tmx = items.find(i => i.category === 'TMX');

  // 현재 시각과 가장 가까운 예보 시각의 SKY, PTY 찾기
  const now = new Date();
  const nowDate = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const nowHour = now.getHours();
  const skyItems = items.filter(i => i.category === 'SKY' && i.fcstDate === nowDate);
  const ptyItems = items.filter(i => i.category === 'PTY' && i.fcstDate === nowDate);
  // 현재 시각 이하 중 가장 큰 (직전 또는 동일) fcstTime
  const pickNearest = (arr) => {
    if (!arr.length) return null;
    let best = null;
    for (const it of arr) {
      const h = parseInt(it.fcstTime.substring(0, 2), 10);
      if (h <= nowHour && (!best || h > parseInt(best.fcstTime.substring(0, 2), 10))) best = it;
    }
    return best || arr[0];
  };
  const nearestSky = pickNearest(skyItems);
  const nearestPty = pickNearest(ptyItems);

  return {
    tmn: tmn ? parseFloat(tmn.fcstValue) : null,
    tmx: tmx ? parseFloat(tmx.fcstValue) : null,
    sky: nearestSky ? parseInt(nearestSky.fcstValue, 10) : null,
    pty: nearestPty ? parseInt(nearestPty.fcstValue, 10) : null
  };
}

// ── OpenWeatherMap fallback ──────────────────────────────────
async function fetchOWMWeather(lat, lon) {
  const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${OWM_API_KEY}&units=metric&lang=kr`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('OWM API 오류');
  const data = await res.json();
  const main = data.weather[0]?.main || 'Clear';
  const mapped = owmWeatherMap[main] || { label: '맑음', emoji: '☀️' };
  return {
    temp: Math.round(data.main.temp),
    feelsLike: Math.round(data.main.feels_like),
    tempMin: Math.round(data.main.temp_min),
    tempMax: Math.round(data.main.temp_max),
    humidity: data.main.humidity,
    windSpeed: Math.round(data.wind.speed * 3.6),
    description: mapped.label,
    emoji: mapped.emoji,
    city: data.name,
    source: 'owm'
  };
}

// ── 미세먼지 (에어코리아) ─────────────────────────────────────
export function getDustGrade(value) {
  if (value <= 30)  return { label: '좋음',    color: '#3b82f6', bg: '#dbeafe' };
  if (value <= 80)  return { label: '보통',    color: '#22c55e', bg: '#dcfce7' };
  if (value <= 150) return { label: '나쁨',    color: '#f97316', bg: '#fed7aa' };
  return              { label: '매우나쁨', color: '#ef4444', bg: '#fee2e2' };
}

export async function fetchDust(stationName = '아산', airKey = '') {
  if (airKey && airKey !== 'demo') {
    try {
      const params = new URLSearchParams({
        serviceKey: airKey,
        returnType: 'json',
        numOfRows: '1',
        pageNo: '1',
        stationName,
        dataTerm: 'DAILY',
        ver: '1.0'
      });
      const res = await fetch(`https://apis.data.go.kr/B552584/ArpltnInforInqireSvc/getMsrstnAcctoRltmMesureDnsty?${params}`, { timeout: 10000 });
      if (!res.ok) throw new Error('에어코리아 API 오류');
      const json = await res.json();
      const item = json.response?.body?.items?.[0];
      if (item) {
        const pm10 = parseInt(item.pm10Value) || 0;
        const pm25 = parseInt(item.pm25Value) || 0;
        return {
          pm10, pm25,
          pm10Grade: getDustGrade(pm10),
          pm25Grade: getDustGrade(pm25),
          dataTime: item.dataTime || new Date().toLocaleString('ko'),
          source: 'airkorea'
        };
      }
    } catch (e) {
      console.warn('[미세먼지] 에어코리아 API 실패:', e.message);
    }
  }

  // API 키 없음 → null
  return null;
}

// ── 주간 예보 ────────────────────────────────────────────────
export async function fetchForecast(lat = 36.7798, lon = 127.0043, kmaKey = '') {
  // 기상청 단기예보
  if (kmaKey && kmaKey !== 'demo') {
    try {
      const { nx, ny } = latLonToGrid(lat, lon);
      const { base_date, base_time } = getFcstBaseTime();
      const params = new URLSearchParams({
        serviceKey: kmaKey, numOfRows: '300', pageNo: '1', dataType: 'JSON',
        base_date, base_time, nx: String(nx), ny: String(ny)
      });
      const res = await fetch(`${KMA_BASE}/getVilageFcst?${params}`, { timeout: 10000 });
      if (res.ok) {
        const json = await res.json();
        const items = json.response?.body?.items?.item || [];
        // 시간별 기온(TMP) 추출
        const tmpItems = items.filter(i => i.category === 'TMP');
        const skyItems = items.filter(i => i.category === 'SKY');
        const ptyItems = items.filter(i => i.category === 'PTY');
        const forecasts = [];
        const seen = new Set();
        for (const t of tmpItems.slice(0, 8)) {
          const key = `${t.fcstDate}_${t.fcstTime}`;
          if (seen.has(key)) continue;
          seen.add(key);
          const sky = skyItems.find(s => s.fcstDate === t.fcstDate && s.fcstTime === t.fcstTime);
          const pty = ptyItems.find(p => p.fcstDate === t.fcstDate && p.fcstTime === t.fcstTime);
          let desc = skyMap[parseInt(sky?.fcstValue)] || '맑음';
          const ptyVal = parseInt(pty?.fcstValue);
          if (ptyVal > 0 && ptyMap[ptyVal]) desc = ptyMap[ptyVal];
          forecasts.push({
            time: `${t.fcstTime.substring(0, 2)}시`,
            temp: Math.round(parseFloat(t.fcstValue)),
            emoji: weatherMap[desc] || '☀️'
          });
        }
        if (forecasts.length > 0) return forecasts.slice(0, 5);
      }
    } catch (e) {
      console.warn('[예보] 기상청 단기예보 실패:', e.message);
    }
  }

  // OWM fallback
  if (OWM_API_KEY && OWM_API_KEY !== 'demo') {
    try {
      const url = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${OWM_API_KEY}&units=metric&lang=kr&cnt=5`;
      const res = await fetch(url);
      const data = await res.json();
      return data.list.slice(0, 5).map(item => {
        const main = item.weather[0]?.main || 'Clear';
        const mapped = owmWeatherMap[main] || { emoji: '☀️' };
        return {
          time: new Date(item.dt * 1000).toLocaleTimeString('ko', { hour: '2-digit', minute: '2-digit' }),
          temp: Math.round(item.main.temp),
          emoji: mapped.emoji
        };
      });
    } catch {}
  }

  return [];
}

// ── 샘플 데이터 ──────────────────────────────────────────────
function getDemoWeather() {
  const hour = new Date().getHours();
  return {
    temp: 18, feelsLike: 16, tempMin: 12, tempMax: 21,
    humidity: 52, windSpeed: 8,
    description: '구름 조금', emoji: hour >= 6 && hour < 18 ? '⛅' : '🌙',
    city: '아산', source: 'sample'
  };
}

function getDemoForecast() {
  const emojis = ['☀️', '⛅', '🌧️', '☀️', '⛅'];
  const temps = [16, 14, 12, 18, 20];
  return Array.from({ length: 5 }, (_, i) => ({
    time: `${(i + 1) * 3}시간 후`, temp: temps[i], emoji: emojis[i]
  }));
}
