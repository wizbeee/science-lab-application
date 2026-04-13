// ============================================================
// MealWidget.jsx - 학교 급식 위젯 (조식/중식/석식 탭)
// ============================================================

import React, { useState, useEffect } from 'react';
import { useApp } from '../AppContext';
import { fetchMeal } from '../services/mealService';


const MEAL_TABS = [
  { key: '조식', label: '아침', icon: '🌅' },
  { key: '중식', label: '점심', icon: '☀️' },
  { key: '석식', label: '저녁', icon: '🌙' }
];

export default function MealWidget() {
  const { state, actions } = useApp();
  const { theme, meal: mealCfg } = state;

  const [mealData, setMealData] = useState(null);
  const [viewDate, setViewDate] = useState(new Date());
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('중식');

  const load = async (date) => {
    setLoading(true);
    try {
      console.log('급식 조회:', mealCfg.officeCode, mealCfg.schoolCode, date.toISOString().slice(0,10));
      const data = await fetchMeal(mealCfg.officeCode, mealCfg.schoolCode, date);
      setMealData(data);
      // 자동 탭 선택: 시간에 따라
      const hour = new Date().getHours();
      if (hour < 9) setActiveTab('조식');
      else if (hour < 14) setActiveTab('중식');
      else setActiveTab('석식');
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(viewDate); }, [viewDate]); // eslint-disable-line react-hooks/exhaustive-deps

  const prevDay = () => { const d = new Date(viewDate); d.setDate(d.getDate() - 1); setViewDate(d); };
  const nextDay = () => { const d = new Date(viewDate); d.setDate(d.getDate() + 1); setViewDate(d); };
  const goToday = () => setViewDate(new Date());

  const isToday = viewDate.toDateString() === new Date().toDateString();
  const days = ['일', '월', '화', '수', '목', '금', '토'];

  const cd = (light, dark) => theme.darkMode ? dark : light;
  const currentMeal = mealData?.meals?.find(m => m.mealType === activeTab);
  // availableTabs는 탭 활성/비활성 표시에 사용됨

  // 학교 미설정 시 안내 화면
  if (!mealCfg?.schoolCode || !mealCfg?.officeCode) {
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '12px' }}>
        <span style={{ fontSize: 28 }}>🍽️</span>
        <div style={{ fontSize: 12, color: cd('#6b7280', '#94a3b8'), textAlign: 'center', lineHeight: 1.6 }}>
          학교 정보가 설정되지 않았습니다.<br />
          아래 버튼을 눌러 학교를 등록하세요.
        </div>
        <button
          onClick={() => actions.setUI({ settingsOpen: true, settingsTab: 'meal' })}
          style={{
            background: theme.accentColor, color: '#fff',
            border: 'none', borderRadius: 8, padding: '7px 16px',
            fontSize: 12, cursor: 'pointer', fontWeight: 600
          }}>
          ⚙️ 급식 설정하기
        </button>
      </div>
    );
  }

  return (
    <div style={{ height: '100%' }}>
      {/* 헤더 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: cd('#374151','#cbd5e1') }}>🍽️ 급식</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button onClick={prevDay} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: cd('#9ca3af','#64748b'), padding: '0 2px' }}>‹</button>
          <span style={{ fontSize: 11, color: isToday ? theme.accentColor : cd('#6b7280','#94a3b8'), fontWeight: isToday ? 600 : 400 }}>
            {isToday ? '오늘' : `${viewDate.getMonth() + 1}/${viewDate.getDate()}(${days[viewDate.getDay()]})`}
          </span>
          <button onClick={nextDay} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: cd('#9ca3af','#64748b'), padding: '0 2px' }}>›</button>
          {!isToday && (
            <button onClick={goToday} style={{ background: theme.accentColor + '20', color: theme.accentColor, border: 'none', borderRadius: 5, padding: '1px 6px', fontSize: 10, cursor: 'pointer', marginLeft: 2 }}>오늘</button>
          )}
        </div>
      </div>

      {/* 조식/중식/석식 탭 */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
        {MEAL_TABS.map(tab => {
          const available = mealData?.meals?.some(m => m.mealType === tab.key);
          const isActive = activeTab === tab.key;
          return (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              style={{
                flex: 1, padding: '5px 0', borderRadius: 7, fontSize: 11, fontWeight: isActive ? 700 : 400,
                border: 'none', cursor: available ? 'pointer' : 'default',
                background: isActive ? theme.accentColor : (available ? cd('#f3f4f6','#334155') : cd('#fafafa','#1e293b')),
                color: isActive ? '#fff' : (available ? cd('#374151','#cbd5e1') : cd('#d1d5db','#475569')),
                transition: 'all 0.15s'
              }}>
              {tab.icon} {tab.label}
            </button>
          );
        })}
      </div>

      {/* 메뉴 내용 */}
      {loading ? (
        <div style={{ textAlign: 'center', color: cd('#9ca3af','#64748b'), fontSize: 12, padding: '12px 0' }}>불러오는 중...</div>
      ) : currentMeal ? (
        <div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {currentMeal.dishes.map((dish, j) => (
              <div key={j} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 0' }}>
                <div style={{ width: 3, height: 3, borderRadius: '50%', background: theme.accentColor, flexShrink: 0 }} />
                <span style={{ fontSize: 12, color: cd('#374151','#e2e8f0') }}>{dish}</span>
              </div>
            ))}
          </div>
          {currentMeal.calories && (
            <div style={{ fontSize: 10, color: cd('#9ca3af','#64748b'), marginTop: 6, textAlign: 'right' }}>🔥 {currentMeal.calories}</div>
          )}
        </div>
      ) : (
        <div style={{ textAlign: 'center', color: cd('#9ca3af','#64748b'), fontSize: 12, padding: '12px 0' }}>
          {activeTab} 정보가 없습니다
        </div>
      )}
    </div>
  );
}
