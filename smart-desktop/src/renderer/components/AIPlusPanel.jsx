// ============================================================
// AIPlusPanel.jsx - AI Plus 기능 패널
// 기안문·계획안·세특·아이디어·채팅
// ============================================================

import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '../AppContext';
import {
  generateDraft, generateLessonPlan, generateSETP,
  generateIdea, generateEmail, summarizeDocument, chat
} from '../services/aiService';

const MODES = [
  { id: 'chat',    label: '💬 AI 채팅',   desc: '자유로운 질문' },
  { id: 'draft',   label: '📄 기안문',    desc: '공문 자동 작성' },
  { id: 'lesson',  label: '📚 수업계획',  desc: '지도안 초안' },
  { id: 'setp',    label: '✏️ 세특',      desc: '세특 문장 생성' },
  { id: 'idea',    label: '💡 아이디어',  desc: '수업·업무 아이디어' },
  { id: 'email',   label: '📧 메일초안',  desc: '메일·공문 작성' },
  { id: 'summary', label: '📋 요약',      desc: '문서 핵심 요약' }
];

export default function AIPlusPanel({ onClose }) {
  const { state } = useApp();
  const { theme, ai } = state;

  const [mode, setMode] = useState('chat');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState('');
  const [error, setError] = useState('');
  const [chatHistory, setChatHistory] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [lastChatMsg, setLastChatMsg] = useState(null); // 재시도용 마지막 메시지 저장
  const resultRef = useRef();
  const isMountedRef = useRef(true);
  useEffect(() => { isMountedRef.current = true; return () => { isMountedRef.current = false; }; }, []);

  // 폼 데이터
  const [form, setForm] = useState({
    // 기안문
    draftType: 'notice', draftPurpose: '', draftDetails: '',
    // 수업 계획
    subject: '', unit: '', grade: '2학년', objectives: '',
    // 세특
    observations: '', studentInfo: '',
    // 아이디어
    ideaCategory: 'lesson', ideaTopic: '', ideaContext: '',
    // 메일
    recipient: '', emailPurpose: '', keyPoints: '', emailTone: 'formal',
    // 요약
    docContent: ''
  });

  const setF = (key, val) => setForm(f => ({ ...f, [key]: val }));

  const handleGenerate = async () => {
    if (!ai.apiKey) { setError('설정 → AI Plus에서 API 키를 먼저 등록해 주세요.'); return; }
    setLoading(true); setError(''); setResult('');

    try {
      let res = '';
      const base = { provider: ai.provider, apiKey: ai.apiKey };

      switch (mode) {
        case 'draft':
          res = await generateDraft({ ...base, type: form.draftType, purpose: form.draftPurpose, details: form.draftDetails });
          break;
        case 'lesson':
          res = await generateLessonPlan({ ...base, subject: form.subject, unit: form.unit, grade: form.grade, objectives: form.objectives });
          break;
        case 'setp':
          res = await generateSETP({ ...base, subject: form.subject, observations: form.observations, studentInfo: form.studentInfo });
          break;
        case 'idea':
          res = await generateIdea({ ...base, category: form.ideaCategory, topic: form.ideaTopic, context: form.ideaContext });
          break;
        case 'email':
          res = await generateEmail({ ...base, recipient: form.recipient, purpose: form.emailPurpose, keyPoints: form.keyPoints, tone: form.emailTone });
          break;
        case 'summary':
          res = await summarizeDocument({ ...base, content: form.docContent });
          break;
        default: break;
      }

      if (isMountedRef.current) {
        setResult(res);
        setTimeout(() => resultRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
      }
    } catch (e) {
      if (isMountedRef.current) setError(e.message);
    } finally {
      if (isMountedRef.current) setLoading(false);
    }
  };

  const handleChat = async (retryMsg = null) => {
    const msg = retryMsg || chatInput.trim();
    if (!msg || !ai.apiKey) return;
    if (!retryMsg) setChatInput('');
    const newHistory = [...chatHistory, { role: 'user', content: msg }];
    setChatHistory(newHistory);
    setLastChatMsg(msg);
    setLoading(true);
    setError('');

    try {
      const res = await chat({ provider: ai.provider, apiKey: ai.apiKey, message: msg, history: chatHistory });
      if (isMountedRef.current) {
        setChatHistory([...newHistory, { role: 'assistant', content: res }]);
        setLastChatMsg(null);
      }
    } catch (e) {
      if (isMountedRef.current) setError(e.message);
    } finally {
      if (isMountedRef.current) setLoading(false);
    }
  };

  const dm = theme.darkMode;
  const cd = (light, dark) => dm ? dark : light;

  const inputStyle = {
    width: '100%', border: `1.5px solid ${cd('#e5e7eb', '#475569')}`, borderRadius: 9,
    padding: '10px 13px', fontSize: 13, outline: 'none', fontFamily: 'inherit',
    color: cd('#1f2937', '#e2e8f0'), background: cd('#fff', '#0f172a'), resize: 'vertical'
  };

  const labelStyle = { fontSize: 12, color: cd('#6b7280', '#94a3b8'), display: 'block', marginBottom: 5, fontWeight: 500 };

  const copyResult = () => {
    navigator.clipboard.writeText(result);
  };

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(0,0,0,0.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 8000,
      fontFamily: `'${theme.fontFamily || 'Malgun Gothic'}', 'Apple SD Gothic Neo', 'Noto Sans KR', 'Segoe UI Emoji', 'Noto Color Emoji', 'Apple Color Emoji', sans-serif`
    }} onClick={onClose}>
      <div style={{
        background: cd('#fff', '#1e293b'), borderRadius: 20,
        width: 780, maxHeight: '88vh',
        display: 'flex', overflow: 'hidden',
        boxShadow: '0 24px 60px rgba(0,0,0,0.4)',
        border: dm ? '1px solid #334155' : 'none'
      }} onClick={e => e.stopPropagation()}>

        {/* 좌측: 모드 선택 */}
        <div style={{ width: 160, background: cd('#f9fafb', '#0f172a'), borderRight: `0.5px solid ${cd('#f0f0f0', '#334155')}`, padding: '20px 0', flexShrink: 0 }}>
          <div style={{ padding: '0 14px 16px', fontSize: 14, fontWeight: 700, color: cd('#1f2937', '#e2e8f0') }}>
            ✦ AI Plus
          </div>
          <div style={{ fontSize: 11, color: cd('#9ca3af', '#64748b'), padding: '0 14px 8px' }}>
            {ai.provider === 'claude' ? 'Claude' : ai.provider === 'openai' ? 'GPT-4o' : 'Gemini'}
          </div>
          {MODES.map(m => (
            <button key={m.id} onClick={() => { setMode(m.id); setResult(''); setError(''); }}
              style={{
                width: '100%', padding: '10px 14px', background: mode === m.id ? theme.accentColor + '20' : 'none',
                border: 'none', cursor: 'pointer', textAlign: 'left',
                borderLeft: `3px solid ${mode === m.id ? theme.accentColor : 'transparent'}`,
                transition: 'all 0.15s'
              }}>
              <div style={{ fontSize: 13, fontWeight: mode === m.id ? 600 : 400, color: mode === m.id ? theme.accentColor : cd('#374151', '#cbd5e1') }}>{m.label}</div>
              <div style={{ fontSize: 10, color: cd('#9ca3af', '#64748b'), marginTop: 2 }}>{m.desc}</div>
            </button>
          ))}
        </div>

        {/* 우측: 컨텐츠 */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: '18px 24px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: cd('#1f2937', '#e2e8f0') }}>
              {MODES.find(m => m.id === mode)?.label}
            </div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: cd('#9ca3af', '#64748b') }}>✕</button>
          </div>

          <div style={{ flex: 1, overflow: 'auto', padding: '16px 24px' }}>

            {/* ── 채팅 모드 ── */}
            {mode === 'chat' && (
              <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 400 }}>
                <div style={{ flex: 1, overflowY: 'auto', marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {chatHistory.length === 0 && (
                    <div style={{ textAlign: 'center', color: '#9ca3af', fontSize: 13, paddingTop: 40 }}>
                      무엇이든 물어보세요<br />
                      <span style={{ fontSize: 12 }}>수업 준비, 업무, 행정 등 자유롭게 대화하세요</span>
                    </div>
                  )}
                  {chatHistory.map((m, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                      <div style={{
                        maxWidth: '80%', padding: '10px 14px', borderRadius: 12, fontSize: 13, lineHeight: 1.7,
                        background: m.role === 'user' ? theme.accentColor : cd('#f3f4f6', '#334155'),
                        color: m.role === 'user' ? '#fff' : cd('#1f2937', '#e2e8f0'),
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'keep-all'
                      }}>{m.content}</div>
                    </div>
                  ))}
                  {loading && (
                    <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                      <div style={{ background: cd('#f3f4f6', '#334155'), padding: '10px 16px', borderRadius: 12, fontSize: 13, color: cd('#9ca3af', '#64748b') }}>
                        생각하는 중...
                      </div>
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input value={chatInput} onChange={e => setChatInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleChat()}
                    placeholder="메시지를 입력하세요 (Enter 전송)"
                    style={{ ...inputStyle, resize: 'none', flex: 1 }}
                  />
                  <button onClick={handleChat} disabled={loading || !chatInput.trim()}
                    style={{ background: theme.accentColor, color: '#fff', border: 'none', borderRadius: 9, padding: '0 18px', cursor: 'pointer', fontWeight: 600, opacity: loading ? 0.6 : 1 }}>
                    전송
                  </button>
                </div>
              </div>
            )}

            {/* ── 기안문 ── */}
            {mode === 'draft' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <label style={labelStyle}>문서 종류</label>
                  <select value={form.draftType} onChange={e => setF('draftType', e.target.value)} style={inputStyle}>
                    <option value="notice">공문 기안문</option>
                    <option value="plan">사업 계획서</option>
                    <option value="report">결과 보고서</option>
                    <option value="request">구매 요청서</option>
                    <option value="approval">품의서</option>
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>목적 / 제목</label>
                  <input placeholder="예: 2025 과학탐구 대회 개최 협조 요청" value={form.draftPurpose}
                    onChange={e => setF('draftPurpose', e.target.value)} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>세부 내용</label>
                  <textarea rows={4} placeholder="날짜, 장소, 대상, 예산 등 핵심 정보를 입력하세요"
                    value={form.draftDetails} onChange={e => setF('draftDetails', e.target.value)} style={inputStyle} />
                </div>
              </div>
            )}

            {/* ── 수업 계획 ── */}
            {mode === 'lesson' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {[
                  { key: 'subject', label: '과목', placeholder: '예: 화학II' },
                  { key: 'unit', label: '단원 / 주제', placeholder: '예: 산화-환원 반응' },
                  { key: 'grade', label: '학년·반', placeholder: '예: 2학년 3반' },
                  { key: 'objectives', label: '학습 목표', placeholder: '예: 산화수 변화를 이용해 산화-환원 반응을 설명할 수 있다.' }
                ].map(f => (
                  <div key={f.key}>
                    <label style={labelStyle}>{f.label}</label>
                    <input placeholder={f.placeholder} value={form[f.key]}
                      onChange={e => setF(f.key, e.target.value)} style={inputStyle} />
                  </div>
                ))}
              </div>
            )}

            {/* ── 세특 ── */}
            {mode === 'setp' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <label style={labelStyle}>과목</label>
                  <input placeholder="예: 화학II" value={form.subject}
                    onChange={e => setF('subject', e.target.value)} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>학생 특이사항 (선택)</label>
                  <input placeholder="예: 발표력 우수, 실험 참여도 높음" value={form.studentInfo}
                    onChange={e => setF('studentInfo', e.target.value)} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>관찰 내용 / 활동 기록</label>
                  <textarea rows={5} placeholder="수업에서 보여준 활동, 발표 내용, 탐구 과정 등을 자유롭게 입력하세요"
                    value={form.observations} onChange={e => setF('observations', e.target.value)} style={inputStyle} />
                </div>
              </div>
            )}

            {/* ── 아이디어 ── */}
            {mode === 'idea' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <label style={labelStyle}>카테고리</label>
                  <select value={form.ideaCategory} onChange={e => setF('ideaCategory', e.target.value)} style={inputStyle}>
                    <option value="lesson">수업 활동</option>
                    <option value="event">학교 행사</option>
                    <option value="homework">과제·프로젝트</option>
                    <option value="club">동아리 활동</option>
                    <option value="admin">업무 개선</option>
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>주제 / 키워드</label>
                  <input placeholder="예: 전기화학, 배터리 원리" value={form.ideaTopic}
                    onChange={e => setF('ideaTopic', e.target.value)} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>추가 맥락 (선택)</label>
                  <input placeholder="학년, 수준, 제약 조건 등" value={form.ideaContext}
                    onChange={e => setF('ideaContext', e.target.value)} style={inputStyle} />
                </div>
              </div>
            )}

            {/* ── 메일 초안 ── */}
            {mode === 'email' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {[
                  { key: 'recipient', label: '수신자', placeholder: '예: 학부모님 / 교감선생님 / 담당 업체' },
                  { key: 'emailPurpose', label: '목적', placeholder: '예: 상담 일정 안내' },
                  { key: 'keyPoints', label: '핵심 내용', placeholder: '예: 3월 15일 오후 2시, 학생의 성적 및 진로 상담' }
                ].map(f => (
                  <div key={f.key}>
                    <label style={labelStyle}>{f.label}</label>
                    <input placeholder={f.placeholder} value={form[f.key]}
                      onChange={e => setF(f.key, e.target.value)} style={inputStyle} />
                  </div>
                ))}
                <div>
                  <label style={labelStyle}>톤</label>
                  <select value={form.emailTone} onChange={e => setF('emailTone', e.target.value)} style={inputStyle}>
                    <option value="formal">격식체 (공문·공식)</option>
                    <option value="friendly">친근한 업무 메일</option>
                  </select>
                </div>
              </div>
            )}

            {/* ── 요약 ── */}
            {mode === 'summary' && (
              <div>
                <label style={labelStyle}>요약할 내용 붙여넣기</label>
                <textarea rows={8} placeholder="공문, 회의록, 기사 등을 붙여넣으세요"
                  value={form.docContent} onChange={e => setF('docContent', e.target.value)} style={inputStyle} />
              </div>
            )}

            {/* 오류 + 재시도 버튼 */}
            {error && (
              <div style={{ background: '#fee2e2', borderRadius: 10, padding: '10px 14px', marginTop: 12, fontSize: 13, color: '#991b1b', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <span>⚠️ {error}</span>
                <button
                  onClick={() => mode === 'chat' && lastChatMsg ? handleChat(lastChatMsg) : handleGenerate()}
                  style={{ background: '#991b1b', color: '#fff', border: 'none', borderRadius: 7, padding: '4px 12px', fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}>
                  🔄 재시도
                </button>
              </div>
            )}

            {/* 결과 */}
            {result && (
              <div ref={resultRef} style={{ marginTop: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: cd('#374151', '#e2e8f0') }}>✦ AI 생성 결과</div>
                  <button onClick={copyResult} style={{
                    background: theme.accentColor + '20', color: theme.accentColor,
                    border: 'none', borderRadius: 7, padding: '5px 12px', fontSize: 12, cursor: 'pointer'
                  }}>📋 복사</button>
                </div>
                <div style={{
                  background: cd('#f9fafb', '#0f172a'), borderRadius: 12, padding: '16px',
                  fontSize: 13, color: cd('#1f2937', '#e2e8f0'), lineHeight: 1.8,
                  whiteSpace: 'pre-wrap', maxHeight: 300, overflowY: 'auto',
                  border: `1px solid ${cd('#e5e7eb', '#334155')}`,
                  wordBreak: 'keep-all'
                }}>{result}</div>
              </div>
            )}
          </div>

          {/* 하단 버튼 (채팅 제외) */}
          {mode !== 'chat' && (
            <div style={{ padding: '14px 24px', borderTop: `0.5px solid ${cd('#f0f0f0', '#334155')}` }}>
              <button onClick={handleGenerate} disabled={loading}
                style={{
                  width: '100%', background: loading ? '#d1d5db' : theme.accentColor,
                  color: '#fff', border: 'none', borderRadius: 10,
                  padding: '13px', fontSize: 15, fontWeight: 600,
                  cursor: loading ? 'not-allowed' : 'pointer'
                }}>
                {loading ? '⏳ 생성 중...' : '✦ AI로 생성하기'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
