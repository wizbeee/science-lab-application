// ============================================================
// WeatherWidget.jsx - 날씨 + 미세먼지 위젯
// ============================================================

import React, { useState, useEffect } from 'react';
import { useApp } from '../AppContext';
import { fetchWeather, fetchDust, fetchForecast } from '../services/weatherService';

export default function WeatherWidget() {
  const { state, actions } = useApp();
  const { theme, weather: weatherCfg } = state;

  const [data, setData] = useState(null);
  const [dust, setDust] = useState(null);
  const [forecast, setForecast] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showDetail, setShowDetail] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [w, d, f] = await Promise.all([
        fetchWeather(weatherCfg.lat, weatherCfg.lon),
        fetchDust(weatherCfg.location),
        fetchForecast(weatherCfg.lat, weatherCfg.lon)
      ]);
      setData(w);
      setDust(d);
      setForecast(f);
      actions.setCache({ weatherData: w });
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 30 * 60 * 1000); // 30분마다 갱신
    return () => clearInterval(t);
  }, [weatherCfg.lat, weatherCfg.lon]);

  if (loading) return (
    <div style={{ padding: '16px 18px', background: '#fff', borderRadius: 16, border: `1px solid ${theme.borderColor}` }}>
      <div style={{ fontSize: 13, color: '#9ca3af' }}>날씨 불러오는 중...</div>
    </div>
  );

  return (
    <div style={{ background: '#fff', borderRadius: 16, border: `1px solid ${theme.borderColor}`, overflow: 'hidden' }}>
      {/* 메인 날씨 */}
      <div style={{ padding: '14px 18px', cursor: 'pointer' }} onClick={() => setShowDetail(v => !v)}>
        <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 6 }}>🌤️ 오늘 날씨 · {weatherCfg.location}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 38 }}>{data?.emoji || '⛅'}</span>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
              <span style={{ fontSize: 30, fontWeight: 700, color: '#1f2937' }}>{data?.temp}°</span>
              <span style={{ fontSize: 14, color: '#9ca3af' }}>체감 {data?.feelsLike}°</span>
            </div>
            <div style={{ fontSize: 13, color: '#6b7280' }}>{data?.description}</div>
            <div style={{ fontSize: 11, color: '#9ca3af' }}>최저 {data?.tempMin}° / 최고 {data?.tempMax}°</div>
          </div>
          <div style={{ textAlign: 'right', fontSize: 12, color: '#9ca3af' }}>
            <div>💧 {data?.humidity}%</div>
            <div>💨 {data?.windSpeed}km/h</div>
          </div>
        </div>

        {/* 미세먼지 */}
        {dust && (
          <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
            <span style={{
              fontSize: 12, padding: '3px 9px', borderRadius: 10,
              background: dust.pm10Grade.bg, color: dust.pm10Grade.color, fontWeight: 500
            }}>
              미세 {dust.pm10} {dust.pm10Grade.label}
            </span>
            <span style={{
              fontSize: 12, padding: '3px 9px', borderRadius: 10,
              background: dust.pm25Grade.bg, color: dust.pm25Grade.color, fontWeight: 500
            }}>
              초미세 {dust.pm25} {dust.pm25Grade.label}
            </span>
          </div>
        )}
      </div>

      {/* 시간별 예보 (접힘/펼침) */}
      {showDetail && forecast.length > 0 && (
        <div style={{ borderTop: `0.5px solid ${theme.borderColor}`, padding: '10px 18px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            {forecast.map((f, i) => (
              <div key={i} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 18 }}>{f.emoji}</div>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#1f2937' }}>{f.temp}°</div>
                <div style={{ fontSize: 10, color: '#9ca3af' }}>{f.time}</div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 8, fontSize: 11, color: '#9ca3af', display: 'flex', justifyContent: 'space-between' }}>
            <span>🌅 일출 {data?.sunrise}</span>
            <span>🌆 일몰 {data?.sunset}</span>
          </div>
        </div>
      )}

      {/* 새로고침 */}
      <div style={{ borderTop: `0.5px solid ${theme.borderColor}`, padding: '6px 18px', display: 'flex', justifyContent: 'flex-end' }}>
        <button onClick={load} style={{ background: 'none', border: 'none', fontSize: 11, color: '#9ca3af', cursor: 'pointer' }}>
          🔄 새로고침
        </button>
      </div>
    </div>
  );
}
