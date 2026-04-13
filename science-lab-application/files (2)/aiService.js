// ============================================================
// aiService.js - AI Plus 기능
// Claude / GPT-4o / Gemini 선택 지원
// 기안문·계획안·아이디어·세특·메일 초안
// ============================================================

// ── 제공자별 API 호출 ────────────────────────────────────────

async function callClaude(apiKey, messages, systemPrompt) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-opus-4-6',
      max_tokens: 2048,
      system: systemPrompt,
      messages
    })
  });
  if (!res.ok) throw new Error(`Claude API 오류: ${res.status}`);
  const data = await res.json();
  return data.content?.[0]?.text || '';
}

async function callOpenAI(apiKey, messages, systemPrompt) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [{ role: 'system', content: systemPrompt }, ...messages]
    })
  });
  if (!res.ok) throw new Error(`OpenAI API 오류: ${res.status}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

async function callGemini(apiKey, messages, systemPrompt) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `${systemPrompt}\n\n${messages.map(m => m.content).join('\n')}` }] }]
      })
    }
  );
  if (!res.ok) throw new Error(`Gemini API 오류: ${res.status}`);
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

// ── 통합 AI 호출 ────────────────────────────────────────────
export async function callAI({ provider, apiKey, userMessage, systemPrompt = '당신은 교사 업무를 돕는 전문 AI 비서입니다. 한국어로 답변하세요.' }) {
  if (!apiKey) throw new Error('API 키가 설정되지 않았습니다.');

  const messages = [{ role: 'user', content: userMessage }];

  switch (provider) {
    case 'claude':  return callClaude(apiKey, messages, systemPrompt);
    case 'openai':  return callOpenAI(apiKey, messages, systemPrompt);
    case 'gemini':  return callGemini(apiKey, messages, systemPrompt);
    default: throw new Error('지원하지 않는 AI 제공자입니다.');
  }
}

// ── 기능별 특화 함수 ─────────────────────────────────────────

// 1. 기안문 작성
export async function generateDraft({ provider, apiKey, type, purpose, details }) {
  const typeMap = {
    notice:    '학교 공문 기안문',
    plan:      '사업 계획서',
    report:    '결과 보고서',
    request:   '구매 요청서',
    approval:  '품의서'
  };

  const systemPrompt = `당신은 한국 학교 행정 문서 작성 전문가입니다.
공문 표준 양식(수신, 제목, 내용, 붙임)에 맞게 작성하세요.
격식체를 사용하고, 학교 행정 용어를 정확히 사용하세요.`;

  const userMessage = `
다음 정보를 바탕으로 ${typeMap[type] || '공문'}을 작성해 주세요.

목적: ${purpose}
세부 내용: ${details}

[작성 형식]
수신: 
제목: 
내용:
(본문을 세 문단으로 구성: 배경 및 목적 → 주요 내용 → 협조 요청)
붙임: (해당 시)

격식 있는 행정 문서로 작성해 주세요.`;

  return callAI({ provider, apiKey, userMessage, systemPrompt });
}

// 2. 수업 지도안 초안
export async function generateLessonPlan({ provider, apiKey, subject, unit, grade, objectives, duration = 50 }) {
  const systemPrompt = `당신은 한국 고등학교 교육과정 전문가입니다.
2022 개정 교육과정에 맞는 수업 지도안을 작성하세요.`;

  const userMessage = `
다음 정보로 수업 지도안 초안을 작성해 주세요.

과목: ${subject}
단원: ${unit}
학년: ${grade}
학습 목표: ${objectives}
수업 시간: ${duration}분

[작성 형식]
1. 학습 목표 (3개 내외)
2. 교수·학습 활동
   - 도입 (5분): 
   - 전개 (${Math.floor(duration * 0.75)}분): 
   - 정리 (${Math.floor(duration * 0.15)}분): 
3. 평가 방법
4. 준비물`;

  return callAI({ provider, apiKey, userMessage, systemPrompt });
}

// 3. 세특 문장 생성
export async function generateSETP({ provider, apiKey, subject, observations, studentInfo }) {
  const systemPrompt = `당신은 한국 고등학교 학생부 세부능력 및 특기사항 작성 전문가입니다.
구체적인 학습 활동과 성장 과정을 중심으로, 학교생활기록부 기재 기준에 맞게 작성하세요.
주어를 생략하고 '~함', '~임', '~을 보임' 형식으로 작성하세요.
500자 이내로 작성하세요.`;

  const userMessage = `
다음 관찰 내용을 바탕으로 세특을 작성해 주세요.

과목: ${subject}
학생 정보: ${studentInfo || '미제공'}
관찰 내용:
${observations}

학교생활기록부 기재 형식에 맞게 세특을 작성해 주세요.`;

  return callAI({ provider, apiKey, userMessage, systemPrompt });
}

// 4. 수업·업무 아이디어
export async function generateIdea({ provider, apiKey, category, topic, context }) {
  const catMap = {
    lesson:   '수업 활동',
    event:    '학교 행사',
    homework: '과제 및 프로젝트',
    club:     '동아리 활동',
    admin:    '업무 개선'
  };

  const systemPrompt = `당신은 창의적인 교육 아이디어 전문가입니다.
실용적이고 현장에서 바로 적용 가능한 아이디어를 제안하세요.`;

  const userMessage = `
다음 주제로 ${catMap[category] || '아이디어'}를 5가지 제안해 주세요.

주제: ${topic}
맥락: ${context || ''}

각 아이디어는 다음 형식으로:
**[아이디어 제목]**
- 방법: 
- 기대 효과:
- 준비물/소요 시간:`;

  return callAI({ provider, apiKey, userMessage, systemPrompt });
}

// 5. 메일·공문 초안
export async function generateEmail({ provider, apiKey, recipient, purpose, keyPoints, tone = 'formal' }) {
  const systemPrompt = `당신은 한국 학교 교육 현장의 이메일·공문 작성 전문가입니다.`;

  const userMessage = `
다음 조건으로 이메일을 작성해 주세요.

수신: ${recipient}
목적: ${purpose}
핵심 내용: ${keyPoints}
톤: ${tone === 'formal' ? '격식체(공문 형식)' : '친근한 업무 메일'}

[이메일 구성]
제목: 
본문:
(인사말 → 본론 → 마무리 → 서명)`;

  return callAI({ provider, apiKey, userMessage, systemPrompt });
}

// 6. 문서 요약
export async function summarizeDocument({ provider, apiKey, content, maxLength = 300 }) {
  const userMessage = `
다음 문서를 ${maxLength}자 이내로 핵심만 요약해 주세요.

[문서 내용]
${content}

요약 형식:
- 목적:
- 주요 내용 (3~5줄):
- 조치 필요 사항:`;

  return callAI({ provider, apiKey, userMessage });
}

// 7. 일반 AI 채팅
export async function chat({ provider, apiKey, message, history = [] }) {
  const systemPrompt = `당신은 교사의 수업·업무·행정을 돕는 AI 비서입니다.
친절하고 전문적으로 한국어로 답변하세요.`;

  if (!apiKey) throw new Error('API 키가 설정되지 않았습니다.');

  const messages = [
    ...history,
    { role: 'user', content: message }
  ];

  switch (provider) {
    case 'claude':  return callClaude(apiKey, messages, systemPrompt);
    case 'openai':  return callOpenAI(apiKey, messages, systemPrompt);
    case 'gemini':  return callGemini(apiKey, messages, systemPrompt);
    default: throw new Error('지원하지 않는 AI 제공자');
  }
}
