// ============================================================
// weatherService.js - 날씨 & 미세먼지 API
// OpenWeatherMap (무료) + 에어코리아 미세먼지
// ============================================================

const OWM_API_KEY = process.env.REACT_APP_OWM_KEY || 'demo';

// 날씨 상태 → 한국어 + 이모지 변환
const weatherMap = {
  Thunderstorm: { label: '천둥번개', emoji: '⛈️' },
  Drizzle:      { label: '이슬비',   emoji: '🌦️' },
  Rain:         { label: '비',       emoji: '🌧️' },
  Snow:         { label: '눈',       emoji: '❄️' },
  Mist:         { label: '안개',     emoji: '🌫️' },
  Fog:          { label: '짙은안개', emoji: '🌫️' },
  Clear:        { label: '맑음',     emoji: '☀️' },
  Clouds:       { label: '구름',     emoji: '⛅' }
};

export async function fetchWeather(lat = 36.7798, lon = 127.0043) {
  // demo 키일 때는 샘플 데이터 반환
  if (OWM_API_KEY === 'demo') {
    return getDemoWeather();
  }

  try {
    const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${OWM_API_KEY}&units=metric&lang=kr`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('날씨 API 오류');
    const data = await res.json();

    const main = data.weather[0]?.main || 'Clear';
    const mapped = weatherMap[main] || { label: '맑음', emoji: '☀️' };

    return {
      temp: Math.round(data.main.temp),
      feelsLike: Math.round(data.main.feels_like),
      tempMin: Math.round(data.main.temp_min),
      tempMax: Math.round(data.main.temp_max),
      humidity: data.main.humidity,
      windSpeed: Math.round(data.wind.speed * 3.6), // m/s → km/h
      description: mapped.label,
      emoji: mapped.emoji,
      city: data.name,
      sunrise: new Date(data.sys.sunrise * 1000).toLocaleTimeString('ko', { hour: '2-digit', minute: '2-digit' }),
      sunset: new Date(data.sys.sunset * 1000).toLocaleTimeString('ko', { hour: '2-digit', minute: '2-digit' })
    };
  } catch (e) {
    console.warn('날씨 API 실패, 샘플 사용:', e.message);
    return getDemoWeather();
  }
}

// 미세먼지 등급 계산
export function getDustGrade(value) {
  if (value <= 30)  return { label: '좋음',    color: '#3b82f6', bg: '#dbeafe' };
  if (value <= 80)  return { label: '보통',    color: '#22c55e', bg: '#dcfce7' };
  if (value <= 150) return { label: '나쁨',    color: '#f97316', bg: '#fed7aa' };
  return              { label: '매우나쁨', color: '#ef4444', bg: '#fee2e2' };
}

// 에어코리아 공공 API (무료, 인증키 필요)
export async function fetchDust(stationName = '아산') {
  // 실제 서비스 시 data.go.kr 에어코리아 API 사용
  // 여기서는 샘플 반환
  return {
    pm10: 38,   // 미세먼지 μg/m³
    pm25: 18,   // 초미세먼지
    pm10Grade: getDustGrade(38),
    pm25Grade: getDustGrade(18),
    dataTime: new Date().toLocaleString('ko')
  };
}

// 주간 예보 (5일)
export async function fetchForecast(lat = 36.7798, lon = 127.0043) {
  if (OWM_API_KEY === 'demo') return getDemoForecast();

  try {
    const url = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${OWM_API_KEY}&units=metric&lang=kr&cnt=5`;
    const res = await fetch(url);
    const data = await res.json();

    return data.list.slice(0, 5).map(item => {
      const main = item.weather[0]?.main || 'Clear';
      const mapped = weatherMap[main] || { emoji: '☀️' };
      return {
        time: new Date(item.dt * 1000).toLocaleTimeString('ko', { hour: '2-digit', minute: '2-digit' }),
        temp: Math.round(item.main.temp),
        emoji: mapped.emoji
      };
    });
  } catch {
    return getDemoForecast();
  }
}

function getDemoWeather() {
  const now = new Date();
  const hour = now.getHours();
  const emoji = hour >= 6 && hour < 18 ? '⛅' : '🌙';
  return {
    temp: 18, feelsLike: 16, tempMin: 12, tempMax: 21,
    humidity: 52, windSpeed: 8,
    description: '구름 조금', emoji,
    city: '아산', sunrise: '06:28', sunset: '18:42'
  };
}

function getDemoForecast() {
  const emojis = ['☀️', '⛅', '🌧️', '☀️', '⛅'];
  const temps  = [16, 14, 12, 18, 20];
  return Array.from({ length: 5 }, (_, i) => ({
    time: `${(i + 1) * 3}시간 후`,
    temp: temps[i],
    emoji: emojis[i]
  }));
}
