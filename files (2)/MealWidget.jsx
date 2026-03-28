// ============================================================
// MealWidget.jsx - 학교 급식 위젯 (NEIS API)
// ============================================================

import React, { useState, useEffect } from 'react';
import { useApp } from '../AppContext';
import { fetchMeal } from '../services/mealService';

export default function MealWidget() {
  const { state } = useApp();
  const { theme, meal: mealCfg } = state;

  const [mealData, setMealData] = useState(null);
  const [viewDate, setViewDate] = useState(new Date());
  const [loading, setLoading] = useState(true);

  const load = async (date) => {
    setLoading(true);
    try {
      const data = await fetchMeal(mealCfg.officeCode, mealCfg.schoolCode, date);
      setMealData(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(viewDate); }, [viewDate]);

  const prevDay = () => {
    const d = new Date(viewDate);
    d.setDate(d.getDate() - 1);
    setViewDate(d);
  };
  const nextDay = () => {
    const d = new Date(viewDate);
    d.setDate(d.getDate() + 1);
    setViewDate(d);
  };
  const goToday = () => setViewDate(new Date());

  const isToday = viewDate.toDateString() === new Date().toDateString();
  const days = ['일', '월', '화', '수', '목', '금', '토'];

  return (
    <div style={{ background: '#fff', borderRadius: 16, padding: '14px 18px', border: `1px solid ${theme.borderColor}` }}>
      {/* 헤더 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>🍽️ 급식 정보</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button onClick={prevDay} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: '#9ca3af' }}>‹</button>
          <span style={{ fontSize: 12, color: isToday ? theme.accentColor : '#6b7280', fontWeight: isToday ? 600 : 400 }}>
            {isToday ? '오늘' : `${viewDate.getMonth() + 1}/${viewDate.getDate()}(${days[viewDate.getDay()]})`}
          </span>
          <button onClick={nextDay} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: '#9ca3af' }}>›</button>
          {!isToday && (
            <button onClick={goToday} style={{ background: theme.accentColor + '20', color: theme.accentColor, border: 'none', borderRadius: 5, padding: '2px 7px', fontSize: 11, cursor: 'pointer' }}>오늘</button>
          )}
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', color: '#d1d5db', fontSize: 13, padding: '16px 0' }}>불러오는 중...</div>
      ) : mealData?.message ? (
        <div style={{ textAlign: 'center', color: '#9ca3af', fontSize: 13, padding: '16px 0' }}>{mealData.message}</div>
      ) : mealData?.meals?.length > 0 ? (
        mealData.meals.map((meal, i) => (
          <div key={i}>
            {mealData.meals.length > 1 && (
              <div style={{ fontSize: 11, color: theme.accentColor, fontWeight: 600, marginBottom: 4 }}>{meal.mealType}</div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {meal.dishes.map((dish, j) => (
                <div key={j} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 0', borderBottom: j < meal.dishes.length - 1 ? `0.5px solid #f9fafb` : 'none' }}>
                  <div style={{ width: 4, height: 4, borderRadius: '50%', background: theme.accentColor, flexShrink: 0 }} />
                  <span style={{ fontSize: 13, color: '#374151' }}>{dish}</span>
                </div>
              ))}
            </div>
            {meal.calories && (
              <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 8, textAlign: 'right' }}>
                🔥 {meal.calories}
              </div>
            )}
          </div>
        ))
      ) : (
        <div style={{ textAlign: 'center', color: '#9ca3af', fontSize: 13, padding: '16px 0' }}>급식 정보가 없습니다</div>
      )}
    </div>
  );
}
