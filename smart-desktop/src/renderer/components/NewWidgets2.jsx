// ============================================================
// NewWidgets2.jsx - 신규 위젯 모음 Part 2
// #8, #17, #21, #23, #25, #40, #42, #45, #46, #50
// ============================================================

import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../AppContext';

const c = (theme, light, dark) => theme.darkMode ? dark : light;

// ============================================================
// #8 그래프 뷰 위젯 — 메모 간 연결 시각화 (간단 버전)
// ============================================================
export function GraphViewWidget() {
  const { state } = useApp();
  const { theme, memos } = state;
  const canvasRef = useRef(null);
  const [nodes, setNodes] = useState([]);

  useEffect(() => {
    // 메모에서 [[링크]] 패턴 추출하여 노드/엣지 생성
    const memoList = memos || [];
    const nodeMap = {};
    memoList.forEach((m, i) => {
      const label = (m.text || '').split('\n')[0]?.slice(0, 15) || `메모 ${i + 1}`;
      nodeMap[m.id] = { id: m.id, label, x: 50 + Math.random() * 200, y: 30 + Math.random() * 120, links: [] };
      // [[링크]] 패턴 찾기
      const matches = (m.text || '').match(/\[\[(.+?)\]\]/g) || [];
      matches.forEach(match => {
        const target = match.slice(2, -2);
        nodeMap[m.id].links.push(target);
      });
    });
    setNodes(Object.values(nodeMap));
  }, [memos]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || nodes.length === 0) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width = canvas.parentElement.clientWidth;
    const h = canvas.height = canvas.parentElement.clientHeight;
    ctx.clearRect(0, 0, w, h);

    // 엣지 그리기
    ctx.strokeStyle = theme.accentColor + '40';
    ctx.lineWidth = 1;
    nodes.forEach(node => {
      node.links.forEach(targetLabel => {
        const target = nodes.find(n => n.label.includes(targetLabel));
        if (target) {
          ctx.beginPath();
          ctx.moveTo(node.x, node.y);
          ctx.lineTo(target.x, target.y);
          ctx.stroke();
        }
      });
    });

    // 노드 그리기
    nodes.forEach(node => {
      ctx.fillStyle = theme.accentColor;
      ctx.beginPath();
      ctx.arc(node.x, node.y, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = theme.textColor;
      ctx.font = '9px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(node.label, node.x, node.y + 16);
    });
  }, [nodes, theme]);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>🕸 그래프 뷰</div>
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        {nodes.length > 0 ? (
          <canvas ref={canvasRef} style={{ width: '100%', height: '100%' }} />
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#9ca3af', fontSize: 10, textAlign: 'center' }}>
            메모에 [[링크]] 패턴을<br/>사용하면 연결이 표시됩니다
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// #17 음성 → 할일 변환 위젯
// ============================================================
export function VoiceToTodoWidget() {
  const { state, actions } = useApp();
  const { theme, todos } = state;
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [supported, setSupported] = useState(true);
  const recognitionRef = useRef(null);

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) { setSupported(false); return; }
    const recognition = new SpeechRecognition();
    recognition.lang = 'ko-KR';
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.onresult = (e) => {
      const text = Array.from(e.results).map(r => r[0].transcript).join('');
      setTranscript(text);
      if (e.results[0].isFinal) {
        // 최종 결과 → 할일로 추가
        if (text.trim()) {
          actions.addTodo({ text: text.trim(), done: false, due: '' });
          setTimeout(() => setTranscript(''), 1500);
        }
        setListening(false);
      }
    };
    recognition.onerror = () => setListening(false);
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
  }, []); // eslint-disable-line

  const toggle = () => {
    if (listening) { recognitionRef.current?.stop(); setListening(false); }
    else { setTranscript(''); recognitionRef.current?.start(); setListening(true); }
  };

  if (!supported) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', fontSize: 11, textAlign: 'center' }}>
        이 브라우저는 음성 인식을<br/>지원하지 않습니다
      </div>
    );
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, textAlign: 'center' }}>
      <div style={{ fontSize: 12, fontWeight: 600 }}>🎤 음성 → 할일</div>
      <button onClick={toggle} style={{
        width: 56, height: 56, borderRadius: '50%', border: 'none', cursor: 'pointer',
        background: listening ? '#ef4444' : theme.accentColor, color: '#fff',
        fontSize: 24, display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: listening ? '0 0 0 8px rgba(239,68,68,0.2)' : 'none',
        animation: listening ? 'pulse 1.5s infinite' : 'none'
      }}>🎤</button>
      <div style={{ fontSize: 11, color: listening ? '#ef4444' : c(theme, '#9ca3af', '#64748b'), minHeight: 20 }}>
        {listening ? (transcript || '듣는 중...') : '버튼을 눌러 말하세요'}
      </div>
      {transcript && !listening && <div style={{ fontSize: 10, color: '#10b981' }}>✅ 할일에 추가됨</div>}
      <style>{`@keyframes pulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.05); } }`}</style>
    </div>
  );
}

// ============================================================
// #21 사진 프레임 위젯
// ============================================================
export function PhotoFrameWidget() {
  const { state } = useApp();
  const { theme } = state;
  const [photos, setPhotos] = useState(() => {
    try { return JSON.parse(localStorage.getItem('photo-frame') || '[]'); } catch { return []; }
  });
  const [current, setCurrent] = useState(0);

  // 자동 슬라이드쇼 (10초)
  useEffect(() => {
    if (photos.length <= 1) return;
    const t = setInterval(() => setCurrent(c => (c + 1) % photos.length), 10000);
    return () => clearInterval(t);
  }, [photos.length]);

  const addPhoto = () => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = 'image/*'; input.multiple = true;
    input.onchange = (e) => {
      const files = Array.from(e.target.files);
      files.forEach(file => {
        const reader = new FileReader();
        reader.onload = (ev) => {
          setPhotos(prev => {
            const updated = [...prev, { id: Date.now() + Math.random(), src: ev.target.result, name: file.name }];
            localStorage.setItem('photo-frame', JSON.stringify(updated));
            return updated;
          });
        };
        reader.readAsDataURL(file);
      });
    };
    input.click();
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <span style={{ fontSize: 12, fontWeight: 600 }}>🖼 사진 프레임</span>
        <button onClick={addPhoto} style={{ background: theme.accentColor, color: '#fff', border: 'none', borderRadius: 5, padding: '2px 8px', fontSize: 10, cursor: 'pointer' }}>+</button>
      </div>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderRadius: 8, background: c(theme, '#f3f4f6', '#0f172a') }}>
        {photos.length > 0 ? (
          <img src={photos[current % photos.length]?.src} alt="" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 6 }} />
        ) : (
          <div style={{ color: '#9ca3af', fontSize: 11, textAlign: 'center' }}>+ 버튼으로<br/>사진을 추가하세요</div>
        )}
      </div>
      {photos.length > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 3, marginTop: 4 }}>
          {photos.map((_, i) => (
            <div key={i} onClick={() => setCurrent(i)} style={{ width: 6, height: 6, borderRadius: 3, cursor: 'pointer', background: i === current % photos.length ? theme.accentColor : c(theme, '#d1d5db', '#475569') }} />
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================
// #23/#39 RSS/뉴스 피드 위젯
// ============================================================
export function RSSFeedWidget() {
  const { state } = useApp();
  const { theme } = state;
  const [feeds, setFeeds] = useState([]);
  const [loading, setLoading] = useState(false);
  const [feedUrl, setFeedUrl] = useState(() => localStorage.getItem('rss-url') || '');

  const defaultFeeds = [
    { title: '교육부 최신 소식', link: 'https://moe.go.kr', date: '최근', source: '교육부' },
    { title: '2026 교육과정 개정 안내', link: 'https://moe.go.kr', date: '최근', source: '교육부' },
    { title: '디지털 교육 혁신 방안', link: 'https://moe.go.kr', date: '최근', source: '교육부' },
  ];

  const loadFeed = async (url) => {
    if (!url) { setFeeds(defaultFeeds); return; }
    setLoading(true);
    try {
      // RSS → JSON 변환 서비스 사용
      const res = await fetch(`https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(url)}`);
      const data = await res.json();
      if (data.items) {
        setFeeds(data.items.slice(0, 8).map(item => ({
          title: item.title, link: item.link,
          date: new Date(item.pubDate).toLocaleDateString('ko', { month: 'short', day: 'numeric' }),
          source: data.feed?.title || 'RSS'
        })));
      }
    } catch { setFeeds(defaultFeeds); }
    setLoading(false);
  };

  useEffect(() => { loadFeed(feedUrl); }, []); // eslint-disable-line

  const saveFeedUrl = () => { localStorage.setItem('rss-url', feedUrl); loadFeed(feedUrl); };
  const openLink = (url) => {
    if (window.electronAPI?.shell) window.electronAPI.shell.openExternal(url);
    else window.open(url, '_blank');
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>📰 뉴스 피드</div>
      <div style={{ display: 'flex', gap: 3, marginBottom: 4 }}>
        <input value={feedUrl} onChange={e => setFeedUrl(e.target.value)} onKeyDown={e => e.key === 'Enter' && saveFeedUrl()}
          placeholder="RSS URL (비우면 샘플)"
          style={{ flex: 1, border: `1px solid ${theme.borderColor}`, borderRadius: 5, padding: '3px 6px', fontSize: 9, outline: 'none', background: c(theme, '#fff', '#0f172a'), color: theme.textColor }} />
        <button onClick={saveFeedUrl} style={{ background: theme.accentColor, color: '#fff', border: 'none', borderRadius: 5, padding: '3px 6px', fontSize: 9, cursor: 'pointer' }}>적용</button>
      </div>
      <div style={{ flex: 1, overflow: 'auto' }}>
        {loading && <div style={{ textAlign: 'center', color: '#9ca3af', fontSize: 10, padding: 8 }}>로딩 중...</div>}
        {feeds.map((f, i) => (
          <div key={i} onClick={() => openLink(f.link)}
            style={{ padding: '5px 0', borderBottom: `0.5px solid ${theme.borderColor}`, cursor: 'pointer' }}
            onMouseEnter={e => e.currentTarget.style.background = c(theme, '#f9fafb', '#1e293b')}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
            <div style={{ fontSize: 11, fontWeight: 500, lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{f.title}</div>
            <div style={{ fontSize: 9, color: c(theme, '#9ca3af', '#64748b'), marginTop: 2 }}>{f.source} · {f.date}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// #25 커맨드 팔레트 (Ctrl+K / Cmd+K)
// ============================================================
export function CommandPalette({ onClose }) {
  const { state, actions } = useApp();
  const { theme, widgets } = state;
  const [query, setQuery] = useState('');
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const commands = [
    { id: 'settings', label: '설정 열기', icon: '⚙️', action: () => { actions.setUI({ settingsOpen: true }); onClose(); } },
    { id: 'edit', label: '화면 편집 모드', icon: '✏️', action: () => { actions.setUI({ editMode: true }); onClose(); } },
    { id: 'dark', label: '다크모드 전환', icon: '🌙', action: () => { actions.setTheme({ darkMode: !theme.darkMode }); onClose(); } },
    { id: 'google', label: 'Google 열기', icon: '🌐', action: () => { window.open('https://google.com', '_blank'); onClose(); } },
    { id: 'gmail', label: 'Gmail 열기', icon: '📧', action: () => { window.open('https://mail.google.com', '_blank'); onClose(); } },
    { id: 'neis', label: 'NEIS 열기', icon: '🏫', action: () => { window.open('https://neis.go.kr', '_blank'); onClose(); } },
    { id: 'calendar', label: 'Google Calendar', icon: '📅', action: () => { window.open('https://calendar.google.com', '_blank'); onClose(); } },
    { id: 'classroom', label: 'Classroom', icon: '🎓', action: () => { window.open('https://classroom.google.com', '_blank'); onClose(); } },
    // 위젯 토글 명령
    ...Object.keys(widgets).map(k => ({
      id: `toggle-${k}`, label: `위젯: ${k} ${widgets[k] ? '끄기' : '켜기'}`, icon: widgets[k] ? '🟢' : '⚪',
      action: () => { actions.setWidgets({ [k]: !widgets[k] }); onClose(); }
    })),
  ];

  const filtered = query ? commands.filter(c => c.label.toLowerCase().includes(query.toLowerCase())) : commands.slice(0, 12);

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 99999, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '15vh' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 420, background: c(theme, '#fff', '#1e293b'), borderRadius: 14, boxShadow: '0 20px 60px rgba(0,0,0,0.3)', overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', borderBottom: `1px solid ${theme.borderColor}` }}>
          <input ref={inputRef} value={query} onChange={e => setQuery(e.target.value)}
            onKeyDown={e => { if (e.key === 'Escape') onClose(); if (e.key === 'Enter' && filtered[0]) filtered[0].action(); }}
            placeholder="명령 검색... (Esc로 닫기)"
            style={{ width: '100%', border: 'none', outline: 'none', fontSize: 15, background: 'transparent', color: theme.textColor, fontFamily: 'inherit' }} />
        </div>
        <div style={{ maxHeight: 320, overflow: 'auto', padding: '4px 0' }}>
          {filtered.map(cmd => (
            <button key={cmd.id} onClick={cmd.action}
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '8px 16px', background: 'none', border: 'none', cursor: 'pointer', color: theme.textColor, textAlign: 'left', fontSize: 13 }}
              onMouseEnter={e => e.currentTarget.style.background = c(theme, '#f3f4f6', '#334155')}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              <span style={{ fontSize: 16 }}>{cmd.icon}</span>
              <span>{cmd.label}</span>
            </button>
          ))}
          {filtered.length === 0 && <div style={{ padding: '12px 16px', color: '#9ca3af', fontSize: 12 }}>결과 없음</div>}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// #40 AI 문서 요약 위젯
// ============================================================
export function AISummaryWidget() {
  const { state } = useApp();
  const { theme, ai } = state;
  const [input, setInput] = useState('');
  const [summary, setSummary] = useState('');
  const [loading, setLoading] = useState(false);

  const summarize = async () => {
    if (!input.trim() || !ai.apiKey) return;
    setLoading(true);
    try {
      const { chat } = await import('../services/aiService');
      const result = await chat({
        provider: ai.provider || 'gemini',
        apiKey: ai.apiKey,
        message: `다음 텍스트를 3줄로 핵심 요약해줘. 한국어로:\n\n${input}`,
        history: [], model: ai.model, ollamaUrl: ai.ollamaUrl
      });
      setSummary(result);
    } catch (e) { setSummary('❌ ' + e.message); }
    setLoading(false);
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>📄 AI 요약</div>
      <textarea value={input} onChange={e => setInput(e.target.value)}
        placeholder="요약할 텍스트를 붙여넣으세요..."
        style={{ flex: 1, minHeight: 50, width: '100%', border: `1px solid ${theme.borderColor}`, borderRadius: 6, padding: '6px 8px', fontSize: 10, resize: 'none', fontFamily: 'inherit', outline: 'none', background: c(theme, '#fafafa', '#0f172a'), color: theme.textColor, lineHeight: 1.4, boxSizing: 'border-box' }} />
      <button onClick={summarize} disabled={loading || !input.trim() || !ai.apiKey}
        style={{ margin: '4px 0', background: theme.accentColor, color: '#fff', border: 'none', borderRadius: 6, padding: '5px', fontSize: 11, cursor: 'pointer', opacity: (loading || !input.trim()) ? 0.5 : 1 }}>
        {loading ? '⏳ 요약 중...' : '✨ AI 요약'}
      </button>
      {summary && (
        <div style={{ background: c(theme, '#f0fdf4', '#0f172a'), borderRadius: 6, padding: '6px 8px', fontSize: 10, color: theme.textColor, lineHeight: 1.5, maxHeight: 80, overflow: 'auto', border: `1px solid ${c(theme, '#bbf7d0', '#1e3a5f')}` }}>
          {summary}
        </div>
      )}
      {!ai.apiKey && <div style={{ fontSize: 9, color: '#f59e0b', textAlign: 'center' }}>설정 → AI에서 API 키 등록 필요</div>}
    </div>
  );
}

// ============================================================
// #42 업적 배지 & XP 시스템 위젯
// ============================================================
export function XPBadgeWidget() {
  const { state } = useApp();
  const { theme, todos, memos } = state;

  const [xpData, setXpData] = useState(() => {
    try { return JSON.parse(localStorage.getItem('xp-system') || '{}'); } catch { return {}; }
  });

  // XP 계산: 완료한 할일, 메모 수, 로그인 일수 등
  const completedTodos = (todos || []).filter(t => t.done).length;
  const memoCount = (memos || []).length;
  const totalXP = (xpData.earnedXP || 0) + completedTodos * 10 + memoCount * 5;
  const level = Math.floor(totalXP / 100) + 1;
  const xpInLevel = totalXP % 100;

  const BADGES = [
    { id: 'first_todo', label: '첫 할일 완료', emoji: '⭐', req: completedTodos >= 1 },
    { id: 'todo_10', label: '할일 10개 완료', emoji: '🏅', req: completedTodos >= 10 },
    { id: 'todo_50', label: '할일 50개 완료', emoji: '🏆', req: completedTodos >= 50 },
    { id: 'memo_5', label: '메모 5개 작성', emoji: '📝', req: memoCount >= 5 },
    { id: 'level_5', label: '레벨 5 달성', emoji: '💎', req: level >= 5 },
    { id: 'level_10', label: '레벨 10 달성', emoji: '👑', req: level >= 10 },
  ];

  const earned = BADGES.filter(b => b.req);

  const RANK_LABELS = ['🥉 브론즈', '🥈 실버', '🥇 골드', '💎 다이아'];
  const rank = level >= 20 ? 3 : level >= 10 ? 2 : level >= 5 ? 1 : 0;

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>🎮 업적 & XP</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <div style={{ fontSize: 24, fontWeight: 700, color: theme.accentColor }}>Lv.{level}</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 9, color: c(theme, '#9ca3af', '#64748b'), marginBottom: 2 }}>{RANK_LABELS[rank]} · {totalXP} XP</div>
          <div style={{ height: 8, background: c(theme, '#f3f4f6', '#334155'), borderRadius: 4, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${xpInLevel}%`, background: theme.accentColor, borderRadius: 4, transition: 'width 0.3s' }} />
          </div>
          <div style={{ fontSize: 8, color: '#9ca3af', textAlign: 'right' }}>{xpInLevel}/100</div>
        </div>
      </div>
      <div style={{ fontSize: 10, fontWeight: 600, marginBottom: 4 }}>획득 배지 ({earned.length}/{BADGES.length})</div>
      <div style={{ flex: 1, display: 'flex', flexWrap: 'wrap', gap: 4, alignContent: 'start', overflow: 'auto' }}>
        {BADGES.map(b => (
          <div key={b.id} title={b.label} style={{
            width: 36, height: 36, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: b.req ? theme.accentColor + '20' : c(theme, '#f3f4f6', '#334155'),
            fontSize: 18, opacity: b.req ? 1 : 0.3, cursor: 'default'
          }}>{b.emoji}</div>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// #45 스트레칭 가이드 위젯
// ============================================================
export function StretchWidget() {
  const { state } = useApp();
  const { theme } = state;
  const [active, setActive] = useState(false);
  const [current, setCurrent] = useState(0);
  const [seconds, setSeconds] = useState(30);

  const STRETCHES = [
    { name: '목 스트레칭', desc: '고개를 천천히 좌우로 기울이세요', emoji: '🧘' },
    { name: '어깨 돌리기', desc: '어깨를 크게 5회 돌려주세요', emoji: '💪' },
    { name: '손목 스트레칭', desc: '손을 펴고 반대 손으로 당기세요', emoji: '🤲' },
    { name: '허리 비틀기', desc: '의자에 앉아 상체를 좌우로 돌리세요', emoji: '🔄' },
    { name: '눈 운동', desc: '먼 곳과 가까운 곳을 번갈아 보세요', emoji: '👁' },
    { name: '심호흡', desc: '4초 들이쉬고 4초 내쉬세요', emoji: '🌬️' },
  ];

  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => {
      setSeconds(s => {
        if (s <= 0) {
          setCurrent(c => {
            if (c + 1 >= STRETCHES.length) { setActive(false); return 0; }
            return c + 1;
          });
          return 30;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [active]); // eslint-disable-line

  const stretch = STRETCHES[current];

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, textAlign: 'center' }}>
      <div style={{ fontSize: 12, fontWeight: 600 }}>🧘 스트레칭 가이드</div>
      {active ? (
        <>
          <div style={{ fontSize: 36 }}>{stretch.emoji}</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: theme.accentColor }}>{stretch.name}</div>
          <div style={{ fontSize: 11, color: c(theme, '#6b7280', '#94a3b8') }}>{stretch.desc}</div>
          <div style={{ fontSize: 24, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: seconds <= 5 ? '#f59e0b' : theme.textColor }}>{seconds}초</div>
          <div style={{ fontSize: 9, color: '#9ca3af' }}>{current + 1}/{STRETCHES.length} 동작</div>
          <button onClick={() => setActive(false)} style={{ background: '#ef4444', color: '#fff', border: 'none', borderRadius: 6, padding: '4px 12px', fontSize: 10, cursor: 'pointer' }}>중지</button>
        </>
      ) : (
        <>
          <div style={{ fontSize: 28 }}>🧘</div>
          <div style={{ fontSize: 11, color: c(theme, '#6b7280', '#94a3b8') }}>6가지 스트레칭 동작<br/>각 30초씩 안내</div>
          <button onClick={() => { setCurrent(0); setSeconds(30); setActive(true); }}
            style={{ background: theme.accentColor, color: '#fff', border: 'none', borderRadius: 8, padding: '6px 16px', fontSize: 12, cursor: 'pointer' }}>▶ 시작</button>
        </>
      )}
    </div>
  );
}

// ============================================================
// #46 스크린타임 트래커 위젯
// ============================================================
export function ScreenTimeWidget() {
  const { state } = useApp();
  const { theme } = state;
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;

  const [data, setData] = useState(() => {
    try { return JSON.parse(localStorage.getItem('screentime') || '{}'); } catch { return {}; }
  });
  const [startTime] = useState(Date.now());
  const [elapsed, setElapsed] = useState(0);

  // 실시간 경과시간 카운트
  useEffect(() => {
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - startTime) / 1000)), 60000);
    return () => {
      clearInterval(t);
      // 세션 종료 시 저장
      const mins = Math.floor((Date.now() - startTime) / 60000);
      const updated = { ...data, [todayStr]: (data[todayStr] || 0) + mins };
      localStorage.setItem('screentime', JSON.stringify(updated));
    };
  }, []); // eslint-disable-line

  const todayMins = (data[todayStr] || 0) + Math.floor(elapsed / 60);
  const hours = Math.floor(todayMins / 60);
  const mins = todayMins % 60;

  // 최근 7일
  const last7 = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today); d.setDate(d.getDate() - (6 - i));
    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    return { day: ['일','월','화','수','목','금','토'][d.getDay()], mins: data[key] || 0, isToday: key === todayStr };
  });
  const maxMins = Math.max(...last7.map(d => d.mins), todayMins, 60);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>📱 스크린타임</div>
      <div style={{ textAlign: 'center', marginBottom: 8 }}>
        <div style={{ fontSize: 24, fontWeight: 700, color: theme.accentColor }}>{hours}시간 {mins}분</div>
        <div style={{ fontSize: 10, color: c(theme, '#9ca3af', '#64748b') }}>오늘 사용 시간</div>
      </div>
      <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end', gap: 3, padding: '0 4px' }}>
        {last7.map((d, i) => (
          <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
            <div style={{ width: '100%', height: `${Math.max(4, (d.isToday ? todayMins : d.mins) / maxMins * 60)}px`, background: d.isToday ? theme.accentColor : c(theme, '#e5e7eb', '#334155'), borderRadius: 3, transition: 'height 0.3s' }} />
            <div style={{ fontSize: 8, color: d.isToday ? theme.accentColor : c(theme, '#9ca3af', '#64748b'), fontWeight: d.isToday ? 700 : 400 }}>{d.day}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// #50 이메일 미리보기 위젯 (기존 mail 위젯과 별도 — 간단 버전)
// ============================================================
export function EmailPreviewWidget() {
  const { state } = useApp();
  const { theme, google, cache } = state;
  const unread = cache.gmailUnread || 0;

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 600 }}>📬 메일 미리보기</span>
        {unread > 0 && <span style={{ background: '#ef4444', color: '#fff', fontSize: 9, padding: '1px 6px', borderRadius: 8, fontWeight: 700 }}>{unread}</span>}
      </div>
      {google.connected ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <div style={{ fontSize: 28 }}>{unread > 0 ? '📬' : '📭'}</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: unread > 0 ? '#ef4444' : '#10b981' }}>
            {unread > 0 ? `${unread}개 읽지 않음` : '모두 읽음'}
          </div>
          <button onClick={() => {
            if (window.electronAPI?.shell) window.electronAPI.shell.openExternal('https://mail.google.com');
            else window.open('https://mail.google.com', '_blank');
          }} style={{ background: theme.accentColor, color: '#fff', border: 'none', borderRadius: 6, padding: '4px 12px', fontSize: 11, cursor: 'pointer' }}>
            Gmail 열기 →
          </button>
        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', fontSize: 11, textAlign: 'center' }}>
          설정 → Google에서<br/>계정을 연동하세요
        </div>
      )}
    </div>
  );
}

// ============================================================
// #18 시스템 모니터 위젯 (강화)
// ============================================================
export function SystemMonitorWidget() {
  const { state } = useApp();
  const { theme } = state;
  const [stats, setStats] = useState({ cpu: 0, ram: 0, ramTotal: 0, disk: 0, diskTotal: 0 });

  useEffect(() => {
    const update = () => {
      if (window.electronAPI?.system?.getStats) {
        window.electronAPI.system.getStats().then(data => { if (data) setStats(data); });
      } else {
        setStats(s => ({ cpu: Math.round(Math.random() * 30 + 10), ram: 6144, ramTotal: 16384, disk: 120, diskTotal: 512 }));
      }
    };
    update();
    const t = setInterval(update, 5000);
    return () => clearInterval(t);
  }, []);

  const Gauge = ({ label, value, max, unit, color }) => {
    const pct = max > 0 ? Math.min(100, Math.round(value / max * 100)) : value;
    return (
      <div style={{ marginBottom: 6 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, marginBottom: 2 }}>
          <span>{label}</span>
          <span style={{ fontWeight: 600, color: pct > 80 ? '#ef4444' : color }}>{max > 0 ? `${value}/${max}${unit}` : `${pct}%`}</span>
        </div>
        <div style={{ height: 8, background: c(theme, '#f3f4f6', '#334155'), borderRadius: 4, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${pct}%`, background: pct > 80 ? '#ef4444' : color, borderRadius: 4, transition: 'width 0.5s' }} />
        </div>
      </div>
    );
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>💻 시스템 모니터</div>
      <div style={{ flex: 1 }}>
        <Gauge label="🔲 CPU" value={stats.cpu} max={0} unit="%" color="#3b82f6" />
        <Gauge label="🧠 RAM" value={Math.round(stats.ram / 1024 * 10) / 10} max={Math.round(stats.ramTotal / 1024 * 10) / 10} unit="GB" color="#8b5cf6" />
        {stats.diskTotal > 0 && <Gauge label="💾 디스크" value={stats.disk} max={stats.diskTotal} unit="GB" color="#10b981" />}
      </div>
    </div>
  );
}

// ============================================================
// #20 D-Day 카운트다운 대시보드 위젯
// ============================================================
export function CountdownDashWidget() {
  const { state } = useApp();
  const { theme, ddays } = state;

  const items = (ddays || []).map(d => {
    const diff = new Date(d.date) - new Date(new Date().toDateString());
    return { ...d, days: Math.ceil(diff / 86400000) };
  }).filter(d => d.days >= 0).sort((a, b) => a.days - b.days).slice(0, 4);

  const getEmoji = (days) => days === 0 ? '🎉' : days <= 3 ? '🔥' : days <= 7 ? '⚡' : '📅';

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>⏳ 카운트다운</div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {items.length === 0 && <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', fontSize: 11 }}>D-Day를 등록하세요</div>}
        {items.map(d => (
          <div key={d.id} style={{ background: c(theme, '#f9fafb', '#0f172a'), borderRadius: 10, padding: '8px 10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 20 }}>{getEmoji(d.days)}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, fontWeight: 600 }}>{d.label}</div>
                <div style={{ fontSize: 9, color: c(theme, '#9ca3af', '#64748b') }}>{d.date}</div>
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, color: d.days <= 3 ? '#ef4444' : theme.accentColor }}>
                {d.days === 0 ? 'D-Day!' : `D-${d.days}`}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// #31 네트워크 속도 모니터 위젯
// ============================================================
export function NetworkMonitorWidget() {
  const { state } = useApp();
  const { theme } = state;
  const [speed, setSpeed] = useState({ down: 0, type: '' });
  const [history, setHistory] = useState([]);

  useEffect(() => {
    const update = () => {
      const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
      if (conn) setSpeed({ down: conn.downlink || 0, type: conn.effectiveType || '' });
      fetch('/icon.png?' + Date.now(), { cache: 'no-store' }).then(r => r.blob()).then(blob => {
        const mbps = parseFloat((blob.size * 8 / 0.5 / 1024 / 1024).toFixed(1));
        setSpeed(prev => ({ ...prev, down: mbps }));
        setHistory(prev => [...prev.slice(-19), mbps]);
      }).catch(() => {});
    };
    update();
    const t = setInterval(update, 10000);
    return () => clearInterval(t);
  }, []);

  const maxH = Math.max(...history, 1);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>🌐 네트워크</div>
      <div style={{ textAlign: 'center', marginBottom: 4 }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: theme.accentColor }}>{speed.down} Mbps</div>
        <div style={{ fontSize: 9, color: c(theme, '#9ca3af', '#64748b') }}>속도 {speed.type && `· ${speed.type}`}</div>
      </div>
      <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end', gap: 1 }}>
        {history.map((v, i) => (
          <div key={i} style={{ flex: 1, height: `${Math.max(4, (v / maxH) * 100)}%`, background: theme.accentColor + (i === history.length - 1 ? '' : '60'), borderRadius: 2 }} />
        ))}
      </div>
    </div>
  );
}

// ============================================================
// #32 스토리지 분석기 위젯
// ============================================================
export function StorageWidget() {
  const { state } = useApp();
  const { theme } = state;
  const [storage, setStorage] = useState(null);

  useEffect(() => {
    if (navigator.storage?.estimate) {
      navigator.storage.estimate().then(est => {
        setStorage({ used: Math.round(est.usage / (1024 * 1024)), total: Math.round(est.quota / (1024 * 1024 * 1024) * 10) / 10 });
      }).catch(() => {});
    }
  }, []);

  const localSize = (() => {
    let total = 0;
    try { for (let i = 0; i < localStorage.length; i++) total += (localStorage.getItem(localStorage.key(i)) || '').length; } catch {}
    return Math.round(total / 1024);
  })();

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
      <div style={{ fontSize: 12, fontWeight: 600 }}>💾 저장소</div>
      <div style={{ fontSize: 28 }}>💾</div>
      {storage ? (
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: theme.accentColor }}>{storage.used}MB</div>
          <div style={{ fontSize: 9, color: c(theme, '#9ca3af', '#64748b') }}>/ {storage.total}GB 사용</div>
        </div>
      ) : (
        <div style={{ fontSize: 10, color: '#9ca3af' }}>측정 중...</div>
      )}
      <div style={{ fontSize: 10, color: c(theme, '#9ca3af', '#64748b') }}>앱 데이터: {localSize}KB</div>
    </div>
  );
}

// ============================================================
// #34 OCR 텍스트 추출 위젯
// ============================================================
export function OCRWidget() {
  const { state } = useApp();
  const { theme } = state;
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);

  const extractFromClipboard = async () => {
    setLoading(true);
    try {
      const text = await navigator.clipboard.readText();
      if (text) { setResult(text); setLoading(false); return; }
    } catch {}
    setResult('클립보드에서 텍스트를 읽을 수 없습니다.\n직접 텍스트를 붙여넣으세요.');
    setLoading(false);
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>🔍 텍스트 추출</div>
      <button onClick={extractFromClipboard} disabled={loading}
        style={{ background: theme.accentColor, color: '#fff', border: 'none', borderRadius: 6, padding: '5px', fontSize: 11, cursor: 'pointer', marginBottom: 4 }}>
        {loading ? '⏳...' : '📋 클립보드에서 가져오기'}
      </button>
      <textarea value={result} onChange={e => setResult(e.target.value)}
        placeholder="텍스트를 붙여넣거나 클립보드 버튼 사용"
        style={{ flex: 1, width: '100%', border: `1px solid ${theme.borderColor}`, borderRadius: 6, padding: '6px 8px', fontSize: 10, resize: 'none', fontFamily: 'inherit', outline: 'none', background: c(theme, '#fafafa', '#0f172a'), color: theme.textColor, lineHeight: 1.4, boxSizing: 'border-box' }} />
      {result && (
        <button onClick={() => navigator.clipboard.writeText(result)}
          style={{ marginTop: 3, background: c(theme, '#f3f4f6', '#334155'), border: 'none', borderRadius: 5, padding: '3px', fontSize: 9, cursor: 'pointer', color: theme.textColor }}>📋 복사</button>
      )}
    </div>
  );
}

// ============================================================
// #16 위치 기반 리마인더 위젯
// ============================================================
export function LocationReminderWidget() {
  const { state } = useApp();
  const { theme } = state;
  const [reminders, setReminders] = useState(() => {
    try { return JSON.parse(localStorage.getItem('loc-reminders') || '[]'); } catch { return []; }
  });
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: '', radius: 200, message: '' });
  const [currentPos, setCurrentPos] = useState(null);

  const save = (updated) => { setReminders(updated); localStorage.setItem('loc-reminders', JSON.stringify(updated)); };

  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(pos => {
      setCurrentPos({ lat: pos.coords.latitude, lon: pos.coords.longitude });
    }, () => {}, { enableHighAccuracy: false });
  }, []);

  const addReminder = () => {
    if (!form.name || !currentPos) return;
    save([...reminders, { id: Date.now(), ...form, lat: currentPos.lat, lon: currentPos.lon, triggered: false }]);
    setForm({ name: '', radius: 200, message: '' }); setAdding(false);
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <span style={{ fontSize: 12, fontWeight: 600 }}>📍 위치 알림</span>
        <button onClick={() => setAdding(!adding)} style={{ background: theme.accentColor, color: '#fff', border: 'none', borderRadius: 5, padding: '2px 8px', fontSize: 10, cursor: 'pointer' }}>{adding ? '취소' : '+'}</button>
      </div>
      {currentPos && <div style={{ fontSize: 8, color: '#9ca3af', marginBottom: 3 }}>현재: {currentPos.lat.toFixed(3)}, {currentPos.lon.toFixed(3)}</div>}
      {adding && (
        <div style={{ background: c(theme, '#f9fafb', '#0f172a'), borderRadius: 8, padding: 8, marginBottom: 4 }}>
          <input placeholder="장소명" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
            style={{ width: '100%', border: `1px solid ${theme.borderColor}`, borderRadius: 5, padding: '4px 6px', fontSize: 11, marginBottom: 4, outline: 'none', background: c(theme, '#fff', '#1e293b'), color: theme.textColor }} />
          <input placeholder="알림 메시지" value={form.message} onChange={e => setForm({ ...form, message: e.target.value })}
            style={{ width: '100%', border: `1px solid ${theme.borderColor}`, borderRadius: 5, padding: '4px 6px', fontSize: 11, marginBottom: 4, outline: 'none', background: c(theme, '#fff', '#1e293b'), color: theme.textColor }} />
          <button onClick={addReminder} style={{ width: '100%', background: theme.accentColor, color: '#fff', border: 'none', borderRadius: 5, padding: '4px', fontSize: 11, cursor: 'pointer' }}>
            📍 현재 위치에 등록
          </button>
        </div>
      )}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {reminders.map(r => (
          <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 0', borderBottom: `0.5px solid ${theme.borderColor}` }}>
            <span style={{ fontSize: 14 }}>{r.triggered ? '✅' : '📍'}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, fontWeight: 600 }}>{r.name}</div>
              <div style={{ fontSize: 9, color: '#9ca3af' }}>{r.message || '알림'}</div>
            </div>
            <button onClick={() => save(reminders.filter(rr => rr.id !== r.id))} style={{ background: 'none', border: 'none', fontSize: 8, cursor: 'pointer', color: '#9ca3af' }}>✕</button>
          </div>
        ))}
        {reminders.length === 0 && !adding && <div style={{ textAlign: 'center', color: '#9ca3af', fontSize: 11, padding: '12px 0' }}>장소 도착 시 알림</div>}
      </div>
    </div>
  );
}

// ============================================================
// 단위 변환기 위젯
// ============================================================
export function UnitConverterWidget() {
  const { state } = useApp();
  const { theme } = state;
  const [category, setCategory] = useState('length');
  const [fromVal, setFromVal] = useState('1');
  const [fromUnit, setFromUnit] = useState('');
  const [toUnit, setToUnit] = useState('');

  const UNITS = {
    length: { label: '길이', units: { m: '미터', cm: '센티미터', mm: '밀리미터', km: '킬로미터', in: '인치', ft: '피트', mi: '마일' },
      convert: (v, f, t) => { const toM = { m:1, cm:0.01, mm:0.001, km:1000, in:0.0254, ft:0.3048, mi:1609.34 }; return v * toM[f] / toM[t]; } },
    weight: { label: '무게', units: { kg: '킬로그램', g: '그램', mg: '밀리그램', lb: '파운드', oz: '온스', ton: '톤' },
      convert: (v, f, t) => { const toKg = { kg:1, g:0.001, mg:0.000001, lb:0.4536, oz:0.02835, ton:1000 }; return v * toKg[f] / toKg[t]; } },
    temp: { label: '온도', units: { C: '섭씨(°C)', F: '화씨(°F)', K: '켈빈(K)' },
      convert: (v, f, t) => { let c = f === 'C' ? v : f === 'F' ? (v-32)*5/9 : v-273.15; return t === 'C' ? c : t === 'F' ? c*9/5+32 : c+273.15; } },
    area: { label: '넓이', units: { sqm: 'm²', pyeong: '평', sqft: 'ft²', acre: '에이커', ha: '헥타르' },
      convert: (v, f, t) => { const toSqm = { sqm:1, pyeong:3.306, sqft:0.0929, acre:4046.86, ha:10000 }; return v * toSqm[f] / toSqm[t]; } },
  };

  const cat = UNITS[category];
  const unitKeys = Object.keys(cat.units);
  if (!fromUnit || !cat.units[fromUnit]) { setTimeout(() => { setFromUnit(unitKeys[0]); setToUnit(unitKeys[1]); }, 0); }

  const result = fromUnit && toUnit && fromVal ? cat.convert(parseFloat(fromVal) || 0, fromUnit, toUnit) : 0;

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>📐 단위 변환</div>
      <div style={{ display: 'flex', gap: 3, marginBottom: 6 }}>
        {Object.entries(UNITS).map(([k, v]) => (
          <button key={k} onClick={() => { setCategory(k); const keys = Object.keys(v.units); setFromUnit(keys[0]); setToUnit(keys[1]); }}
            style={{ flex: 1, padding: '3px', borderRadius: 5, fontSize: 9, border: 'none', cursor: 'pointer',
              background: category === k ? theme.accentColor : c(theme, '#f3f4f6', '#334155'),
              color: category === k ? '#fff' : theme.textColor }}>{v.label}</button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginBottom: 4 }}>
        <input type="number" value={fromVal} onChange={e => setFromVal(e.target.value)}
          style={{ flex: 1, border: `1px solid ${theme.borderColor}`, borderRadius: 6, padding: '5px 6px', fontSize: 13, outline: 'none', fontFamily: 'inherit', background: c(theme, '#fff', '#0f172a'), color: theme.textColor, textAlign: 'right' }} />
        <select value={fromUnit} onChange={e => setFromUnit(e.target.value)}
          style={{ width: 70, border: `1px solid ${theme.borderColor}`, borderRadius: 6, padding: '4px', fontSize: 10, outline: 'none', background: c(theme, '#fff', '#0f172a'), color: theme.textColor }}>
          {unitKeys.map(k => <option key={k} value={k}>{cat.units[k]}</option>)}
        </select>
      </div>
      <div style={{ textAlign: 'center', fontSize: 14, margin: '2px 0' }}>↓</div>
      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
        <div style={{ flex: 1, border: `1px solid ${theme.borderColor}`, borderRadius: 6, padding: '5px 6px', fontSize: 13, fontWeight: 700, textAlign: 'right', background: c(theme, '#f9fafb', '#0f172a'), color: theme.accentColor }}>
          {result % 1 === 0 ? result : result.toFixed(4)}
        </div>
        <select value={toUnit} onChange={e => setToUnit(e.target.value)}
          style={{ width: 70, border: `1px solid ${theme.borderColor}`, borderRadius: 6, padding: '4px', fontSize: 10, outline: 'none', background: c(theme, '#fff', '#0f172a'), color: theme.textColor }}>
          {unitKeys.map(k => <option key={k} value={k}>{cat.units[k]}</option>)}
        </select>
      </div>
    </div>
  );
}

// ============================================================
// 학급 좌석표 위젯
// ============================================================
export function SeatingChartWidget() {
  const { state } = useApp();
  const { theme } = state;
  const [rows, setRows] = useState(5);
  const [cols, setCols] = useState(6);
  const [seats, setSeats] = useState(() => {
    try { return JSON.parse(localStorage.getItem('seating-chart') || 'null'); } catch { return null; }
  });
  const [editing, setEditing] = useState(null);

  const save = (updated) => { setSeats(updated); localStorage.setItem('seating-chart', JSON.stringify(updated)); };

  const initSeats = () => {
    const grid = {};
    for (let r = 0; r < rows; r++) for (let cc = 0; cc < cols; cc++) grid[`${r}-${cc}`] = '';
    save(grid);
  };

  const shuffle = () => {
    if (!seats) return;
    const names = Object.values(seats).filter(Boolean);
    for (let i = names.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [names[i], names[j]] = [names[j], names[i]]; }
    const newSeats = {};
    const keys = Object.keys(seats);
    let ni = 0;
    keys.forEach(k => { newSeats[k] = ni < names.length ? names[ni++] : ''; });
    save(newSeats);
  };

  if (!seats) {
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
        <div style={{ fontSize: 12, fontWeight: 600 }}>🪑 학급 좌석표</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ textAlign: 'center' }}><div style={{ fontSize: 9, color: '#9ca3af' }}>줄</div>
            <input type="number" min={2} max={10} value={rows} onChange={e => setRows(Number(e.target.value))}
              style={{ width: 36, border: `1px solid ${theme.borderColor}`, borderRadius: 5, padding: '3px', fontSize: 12, textAlign: 'center', outline: 'none', background: c(theme, '#fff', '#1e293b'), color: theme.textColor }} /></div>
          <span style={{ fontSize: 14 }}>×</span>
          <div style={{ textAlign: 'center' }}><div style={{ fontSize: 9, color: '#9ca3af' }}>열</div>
            <input type="number" min={2} max={10} value={cols} onChange={e => setCols(Number(e.target.value))}
              style={{ width: 36, border: `1px solid ${theme.borderColor}`, borderRadius: 5, padding: '3px', fontSize: 12, textAlign: 'center', outline: 'none', background: c(theme, '#fff', '#1e293b'), color: theme.textColor }} /></div>
        </div>
        <button onClick={initSeats} style={{ background: theme.accentColor, color: '#fff', border: 'none', borderRadius: 8, padding: '6px 16px', fontSize: 12, cursor: 'pointer' }}>좌석표 만들기</button>
      </div>
    );
  }

  const seatKeys = Object.keys(seats);
  const maxRow = Math.max(...seatKeys.map(k => parseInt(k.split('-')[0]))) + 1;
  const maxCol = Math.max(...seatKeys.map(k => parseInt(k.split('-')[1]))) + 1;

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <span style={{ fontSize: 12, fontWeight: 600 }}>🪑 좌석표</span>
        <div style={{ display: 'flex', gap: 3 }}>
          <button onClick={shuffle} style={{ background: theme.accentColor, color: '#fff', border: 'none', borderRadius: 5, padding: '2px 6px', fontSize: 9, cursor: 'pointer' }}>🔀 섞기</button>
          <button onClick={() => save(null)} style={{ background: c(theme, '#f3f4f6', '#334155'), border: 'none', borderRadius: 5, padding: '2px 6px', fontSize: 9, cursor: 'pointer', color: theme.textColor }}>초기화</button>
        </div>
      </div>
      <div style={{ textAlign: 'center', fontSize: 9, color: '#9ca3af', marginBottom: 4 }}>[ 교 탁 ]</div>
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: `repeat(${maxCol}, 1fr)`, gap: 2, alignContent: 'start' }}>
        {Array.from({ length: maxRow * maxCol }, (_, i) => {
          const r = Math.floor(i / maxCol), cc = i % maxCol;
          const key = `${r}-${cc}`;
          const name = seats[key] || '';
          return (
            <div key={key} onClick={() => setEditing(key)}
              style={{ height: 22, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: name ? (theme.accentColor + '15') : c(theme, '#f3f4f6', '#334155'),
                border: `0.5px solid ${name ? theme.accentColor + '40' : 'transparent'}`,
                cursor: 'pointer', fontSize: 8, fontWeight: name ? 600 : 400, color: name ? theme.textColor : '#d1d5db' }}>
              {editing === key ? (
                <input autoFocus value={name} onChange={e => save({ ...seats, [key]: e.target.value })}
                  onBlur={() => setEditing(null)} onKeyDown={e => e.key === 'Enter' && setEditing(null)}
                  style={{ width: '100%', height: '100%', border: 'none', outline: 'none', textAlign: 'center', fontSize: 8, background: 'transparent', color: theme.textColor, fontFamily: 'inherit' }} />
              ) : (name || '·')}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================
// 메트로놈 위젯 — 음악/체육 수업용 BPM 박자기
// ============================================================
export function MetronomeWidget() {
  const { state } = useApp();
  const { theme } = state;
  const [bpm, setBpm] = useState(120);
  const [playing, setPlaying] = useState(false);
  const [beat, setBeat] = useState(0);
  const [beatsPerMeasure, setBeatsPerMeasure] = useState(4);
  const timerRef = useRef(null);
  const audioCtxRef = useRef(null);

  const playClick = (isAccent) => {
    if (!audioCtxRef.current) audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    const ctx = audioCtxRef.current;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.frequency.value = isAccent ? 1000 : 800;
    gain.gain.value = 0.3;
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
    osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.1);
  };

  const start = () => {
    setPlaying(true); setBeat(0);
    let b = 0;
    const interval = 60000 / bpm;
    const tick = () => {
      playClick(b % beatsPerMeasure === 0);
      setBeat(b % beatsPerMeasure);
      b++;
      timerRef.current = setTimeout(tick, interval);
    };
    tick();
  };

  const stop = () => { setPlaying(false); clearTimeout(timerRef.current); };

  useEffect(() => () => clearTimeout(timerRef.current), []);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
      <div style={{ fontSize: 12, fontWeight: 600 }}>🎵 메트로놈</div>
      <div style={{ display: 'flex', gap: 4 }}>
        {Array.from({ length: beatsPerMeasure }, (_, i) => (
          <div key={i} style={{ width: 16, height: 16, borderRadius: '50%', background: playing && beat === i ? theme.accentColor : c(theme, '#e5e7eb', '#334155'), transition: 'background 0.1s' }} />
        ))}
      </div>
      <div style={{ fontSize: 28, fontWeight: 800, color: theme.accentColor }}>{bpm}</div>
      <div style={{ fontSize: 10, color: c(theme, '#9ca3af', '#64748b') }}>BPM</div>
      <input type="range" min={40} max={220} value={bpm} onChange={e => { setBpm(Number(e.target.value)); if (playing) { stop(); start(); } }}
        style={{ width: '80%' }} disabled={playing} />
      <div style={{ display: 'flex', gap: 4 }}>
        {[3, 4, 6].map(n => (
          <button key={n} onClick={() => setBeatsPerMeasure(n)}
            style={{ padding: '2px 8px', borderRadius: 5, border: 'none', fontSize: 10, cursor: 'pointer',
              background: beatsPerMeasure === n ? theme.accentColor : c(theme, '#f3f4f6', '#334155'),
              color: beatsPerMeasure === n ? '#fff' : theme.textColor }}>{n}박</button>
        ))}
      </div>
      <button onClick={playing ? stop : start}
        style={{ background: playing ? '#ef4444' : theme.accentColor, color: '#fff', border: 'none', borderRadius: 8, padding: '6px 20px', fontSize: 12, cursor: 'pointer' }}>
        {playing ? '⏹ 정지' : '▶ 시작'}
      </button>
    </div>
  );
}

// ============================================================
// QR코드 생성 위젯
// ============================================================
export function QRCodeWidget() {
  const { state } = useApp();
  const { theme } = state;
  const [text, setText] = useState('');
  const [qrUrl, setQrUrl] = useState('');

  const generate = () => {
    if (!text.trim()) return;
    // Google Charts QR API (무료, 외부 라이브러리 불필요)
    const encoded = encodeURIComponent(text.trim());
    setQrUrl(`https://chart.googleapis.com/chart?cht=qr&chs=200x200&chl=${encoded}&choe=UTF-8`);
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>📱 QR코드 생성</div>
      <div style={{ display: 'flex', gap: 3, marginBottom: 6 }}>
        <input value={text} onChange={e => setText(e.target.value)} onKeyDown={e => e.key === 'Enter' && generate()}
          placeholder="URL 또는 텍스트 입력"
          style={{ flex: 1, border: `1px solid ${theme.borderColor}`, borderRadius: 6, padding: '5px 8px', fontSize: 11, outline: 'none', fontFamily: 'inherit', background: c(theme, '#fff', '#0f172a'), color: theme.textColor }} />
        <button onClick={generate} style={{ background: theme.accentColor, color: '#fff', border: 'none', borderRadius: 6, padding: '5px 8px', fontSize: 11, cursor: 'pointer' }}>생성</button>
      </div>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {qrUrl ? (
          <img src={qrUrl} alt="QR Code" style={{ maxWidth: '100%', maxHeight: '100%', borderRadius: 8, background: '#fff', padding: 8 }} />
        ) : (
          <div style={{ color: '#9ca3af', fontSize: 11, textAlign: 'center' }}>URL이나 텍스트를 입력하고<br/>생성 버튼을 누르세요</div>
        )}
      </div>
      {qrUrl && <div style={{ fontSize: 9, color: '#9ca3af', textAlign: 'center', marginTop: 2 }}>수업 자료 링크 공유에 활용하세요</div>}
    </div>
  );
}

// ============================================================
// 학급 투표 위젯
// ============================================================
export function ClassVoteWidget() {
  const { state } = useApp();
  const { theme } = state;
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [votes, setVotes] = useState(null); // null = 투표 전, {} = 투표 중
  const [history, setHistory] = useState(() => {
    try { return JSON.parse(localStorage.getItem('class-votes') || '[]'); } catch { return []; }
  });

  const startVote = () => {
    if (!question.trim() || options.filter(Boolean).length < 2) return;
    const v = {};
    options.filter(Boolean).forEach(o => { v[o] = 0; });
    setVotes(v);
  };

  const addVote = (option) => {
    setVotes(prev => ({ ...prev, [option]: (prev[option] || 0) + 1 }));
  };

  const endVote = () => {
    const result = { id: Date.now(), question, votes: { ...votes }, date: new Date().toLocaleDateString('ko') };
    const updated = [result, ...history].slice(0, 10);
    setHistory(updated);
    localStorage.setItem('class-votes', JSON.stringify(updated));
    setVotes(null); setQuestion(''); setOptions(['', '']);
  };

  const totalVotes = votes ? Object.values(votes).reduce((a, b) => a + b, 0) : 0;

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>🗳 학급 투표</div>
      {!votes ? (
        <>
          <input value={question} onChange={e => setQuestion(e.target.value)} placeholder="투표 질문"
            style={{ width: '100%', border: `1px solid ${theme.borderColor}`, borderRadius: 6, padding: '5px 8px', fontSize: 11, outline: 'none', fontFamily: 'inherit', marginBottom: 4, background: c(theme, '#fff', '#0f172a'), color: theme.textColor }} />
          {options.map((o, i) => (
            <input key={i} value={o} onChange={e => { const n = [...options]; n[i] = e.target.value; setOptions(n); }}
              placeholder={`선택지 ${i + 1}`}
              style={{ width: '100%', border: `1px solid ${theme.borderColor}`, borderRadius: 6, padding: '4px 8px', fontSize: 10, outline: 'none', fontFamily: 'inherit', marginBottom: 3, background: c(theme, '#fff', '#0f172a'), color: theme.textColor }} />
          ))}
          <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
            <button onClick={() => setOptions([...options, ''])} style={{ flex: 1, background: c(theme, '#f3f4f6', '#334155'), border: 'none', borderRadius: 5, padding: '3px', fontSize: 9, cursor: 'pointer', color: theme.textColor }}>+ 선택지</button>
            <button onClick={startVote} style={{ flex: 1, background: theme.accentColor, color: '#fff', border: 'none', borderRadius: 5, padding: '3px', fontSize: 9, cursor: 'pointer' }}>투표 시작</button>
          </div>
          {history.length > 0 && (
            <div style={{ flex: 1, overflow: 'auto' }}>
              <div style={{ fontSize: 9, color: '#9ca3af', marginBottom: 2 }}>이전 투표</div>
              {history.slice(0, 3).map(h => (
                <div key={h.id} style={{ fontSize: 9, padding: '3px 0', borderBottom: `0.5px solid ${theme.borderColor}`, color: c(theme, '#6b7280', '#94a3b8') }}>
                  {h.question} ({h.date})
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, color: theme.accentColor }}>{question}</div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {Object.entries(votes).map(([opt, count]) => {
              const pct = totalVotes > 0 ? Math.round(count / totalVotes * 100) : 0;
              return (
                <button key={opt} onClick={() => addVote(opt)}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px', borderRadius: 6, border: 'none', cursor: 'pointer', background: c(theme, '#f9fafb', '#1e293b'), color: theme.textColor, textAlign: 'left', position: 'relative', overflow: 'hidden' }}>
                  <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${pct}%`, background: theme.accentColor + '20', borderRadius: 6 }} />
                  <span style={{ flex: 1, fontSize: 11, fontWeight: 600, position: 'relative' }}>{opt}</span>
                  <span style={{ fontSize: 10, fontWeight: 700, color: theme.accentColor, position: 'relative' }}>{count}표 ({pct}%)</span>
                </button>
              );
            })}
          </div>
          <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
            <span style={{ fontSize: 10, color: '#9ca3af', flex: 1, alignSelf: 'center' }}>총 {totalVotes}표</span>
            <button onClick={endVote} style={{ background: '#ef4444', color: '#fff', border: 'none', borderRadius: 6, padding: '4px 12px', fontSize: 10, cursor: 'pointer' }}>투표 종료</button>
          </div>
        </>
      )}
    </div>
  );
}

// ============================================================
// 수업 종소리 위젯 — 커스텀 알림음
// ============================================================
export function ClassBellWidget() {
  const { state } = useApp();
  const { theme } = state;
  const [bells, setBells] = useState(() => {
    try { return JSON.parse(localStorage.getItem('class-bells') || '[]'); } catch { return []; }
  });
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ time: '', label: '', sound: 'bell1' });
  const audioCtxRef = useRef(null);

  const save = (updated) => { setBells(updated); localStorage.setItem('class-bells', JSON.stringify(updated)); };

  const SOUNDS = {
    bell1: { label: '🔔 기본 종', freq: 880, dur: 0.5 },
    bell2: { label: '🎵 차임벨', freq: 660, dur: 0.8 },
    bell3: { label: '📢 알림음', freq: 1200, dur: 0.3 },
    bell4: { label: '🎶 멜로디', freq: 523, dur: 1.0 },
  };

  const playSound = (soundId) => {
    if (!audioCtxRef.current) audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    const ctx = audioCtxRef.current;
    const s = SOUNDS[soundId] || SOUNDS.bell1;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.frequency.value = s.freq;
    osc.type = 'sine';
    gain.gain.setValueAtTime(0.4, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + s.dur);
    osc.start(ctx.currentTime); osc.stop(ctx.currentTime + s.dur);
  };

  const addBell = () => {
    if (!form.time || !form.label) return;
    save([...bells, { id: Date.now(), ...form }]);
    setForm({ time: '', label: '', sound: 'bell1' }); setAdding(false);
  };

  // 매분 체크하여 종 울리기
  useEffect(() => {
    const check = () => {
      const now = new Date();
      const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      bells.forEach(b => { if (b.time === hhmm) playSound(b.sound); });
    };
    const t = setInterval(check, 60000);
    return () => clearInterval(t);
  }, [bells]); // eslint-disable-line

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 600 }}>🔔 수업 종소리</span>
        <button onClick={() => setAdding(!adding)} style={{ background: theme.accentColor, color: '#fff', border: 'none', borderRadius: 5, padding: '2px 8px', fontSize: 10, cursor: 'pointer' }}>{adding ? '취소' : '+'}</button>
      </div>
      {adding && (
        <div style={{ background: c(theme, '#f9fafb', '#0f172a'), borderRadius: 8, padding: 8, marginBottom: 6 }}>
          <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
            <input type="time" value={form.time} onChange={e => setForm({ ...form, time: e.target.value })}
              style={{ flex: 1, border: `1px solid ${theme.borderColor}`, borderRadius: 5, padding: '3px', fontSize: 11, outline: 'none', background: c(theme, '#fff', '#1e293b'), color: theme.textColor }} />
            <input value={form.label} onChange={e => setForm({ ...form, label: e.target.value })} placeholder="이름"
              style={{ flex: 1, border: `1px solid ${theme.borderColor}`, borderRadius: 5, padding: '3px', fontSize: 11, outline: 'none', background: c(theme, '#fff', '#1e293b'), color: theme.textColor }} />
          </div>
          <div style={{ display: 'flex', gap: 2, marginBottom: 4 }}>
            {Object.entries(SOUNDS).map(([k, v]) => (
              <button key={k} onClick={() => { setForm({ ...form, sound: k }); playSound(k); }}
                style={{ flex: 1, padding: '3px', borderRadius: 4, border: 'none', fontSize: 9, cursor: 'pointer',
                  background: form.sound === k ? theme.accentColor : c(theme, '#f3f4f6', '#334155'),
                  color: form.sound === k ? '#fff' : theme.textColor }}>{v.label}</button>
            ))}
          </div>
          <button onClick={addBell} style={{ width: '100%', background: theme.accentColor, color: '#fff', border: 'none', borderRadius: 5, padding: '4px', fontSize: 11, cursor: 'pointer' }}>추가</button>
        </div>
      )}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {bells.sort((a, b) => a.time.localeCompare(b.time)).map(b => (
          <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 0', borderBottom: `0.5px solid ${theme.borderColor}` }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: theme.accentColor, fontVariantNumeric: 'tabular-nums', minWidth: 40 }}>{b.time}</span>
            <span style={{ flex: 1, fontSize: 11 }}>{b.label}</span>
            <button onClick={() => playSound(b.sound)} style={{ background: 'none', border: 'none', fontSize: 12, cursor: 'pointer' }}>🔊</button>
            <button onClick={() => save(bells.filter(bb => bb.id !== b.id))} style={{ background: 'none', border: 'none', fontSize: 8, cursor: 'pointer', color: '#9ca3af' }}>✕</button>
          </div>
        ))}
        {bells.length === 0 && !adding && <div style={{ textAlign: 'center', color: '#9ca3af', fontSize: 11, padding: '12px 0' }}>시간별 종소리를 등록하세요</div>}
      </div>
    </div>
  );
}
