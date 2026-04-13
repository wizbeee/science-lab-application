// ============================================================
// aiService.js - AI Plus 기능
// Claude / GPT / Gemini / Groq / Ollama / OpenRouter
// ============================================================

// ── 메인 프로세스 IPC 프록시 (CORS 우회) ────────────────────
async function ipcFetch(url, headers, body) {
  if (window.electronAPI?.ai?.call) {
    const res = await window.electronAPI.ai.call({ url, headers, body });
    if (!res.ok) {
      const errMsg = res.data?.error?.message || res.raw || `HTTP ${res.status}`;
      throw new Error(errMsg);
    }
    return res.data;
  }
  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`API 오류: ${res.status}`);
  return res.json();
}

// ── 제공자별 API 호출 ────────────────────────────────────────

async function callClaude(apiKey, messages, systemPrompt, model = 'claude-sonnet-4-6') {
  const data = await ipcFetch(
    'https://api.anthropic.com/v1/messages',
    { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    { model, max_tokens: 2048, system: systemPrompt, messages }
  );
  if (data.error) throw new Error(data.error.message);
  return data.content?.[0]?.text || '';
}

async function callGemini(apiKey, messages, systemPrompt, model = 'gemini-2.0-flash') {
  const combined = `${systemPrompt}\n\n${messages.map(m => `${m.role === 'user' ? '사용자' : 'AI'}: ${m.content}`).join('\n')}`;
  const data = await ipcFetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    { 'Content-Type': 'application/json' },
    { contents: [{ parts: [{ text: combined }] }] }
  );
  if (data.error) throw new Error(data.error.message);
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Gemini 응답 없음 (API 키·할당량 확인)');
  return text;
}

// OpenAI 호환 범용 함수 — GPT, Groq, OpenRouter, Ollama 공용
async function callOpenAICompat(baseUrl, apiKey, messages, systemPrompt, model, extraHeaders = {}) {
  const headers = { 'Content-Type': 'application/json', ...extraHeaders };
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
  const data = await ipcFetch(baseUrl, headers, {
    model,
    messages: [{ role: 'system', content: systemPrompt }, ...messages],
    max_tokens: 2048,
  });
  if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
  return data.choices?.[0]?.message?.content || '';
}

async function callOpenAI(apiKey, messages, systemPrompt, model = 'gpt-4o-mini') {
  return callOpenAICompat(
    'https://api.openai.com/v1/chat/completions',
    apiKey, messages, systemPrompt, model
  );
}

async function callGroq(apiKey, messages, systemPrompt, model = 'llama-3.3-70b-versatile') {
  return callOpenAICompat(
    'https://api.groq.com/openai/v1/chat/completions',
    apiKey, messages, systemPrompt, model
  );
}

async function callOpenRouter(apiKey, messages, systemPrompt, model = 'meta-llama/llama-3.3-70b-instruct:free') {
  return callOpenAICompat(
    'https://openrouter.ai/api/v1/chat/completions',
    apiKey, messages, systemPrompt, model,
    { 'HTTP-Referer': 'https://smart-desktop.local', 'X-Title': 'Smart Desktop' }
  );
}

async function callOllama(ollamaUrl, messages, systemPrompt, model = 'llama3.2') {
  const base = (ollamaUrl || 'http://localhost:11434').replace(/\/$/, '');
  return callOpenAICompat(
    `${base}/v1/chat/completions`,
    null, messages, systemPrompt, model
  );
}

// ── 통합 AI 호출 ────────────────────────────────────────────
export async function callAI({
  provider, apiKey, userMessage, model, ollamaUrl,
  systemPrompt = '당신은 교사 업무를 돕는 전문 AI 비서입니다. 반드시 한국어로만 답변하세요. 영어 사용 금지. 마크다운 기호(**, *, #, -, ` 등) 사용 금지. 평문으로 작성하세요.'
}) {
  if (provider !== 'ollama' && !apiKey) throw new Error('API 키가 설정되지 않았습니다.');
  const messages = [{ role: 'user', content: userMessage }];

  switch (provider) {
    case 'claude':      return callClaude(apiKey, messages, systemPrompt, model);
    case 'openai':      return callOpenAI(apiKey, messages, systemPrompt, model);
    case 'gemini':      return callGemini(apiKey, messages, systemPrompt, model);
    case 'groq':        return callGroq(apiKey, messages, systemPrompt, model);
    case 'openrouter':  return callOpenRouter(apiKey, messages, systemPrompt, model);
    case 'ollama':      return callOllama(ollamaUrl, messages, systemPrompt, model);
    default: throw new Error('지원하지 않는 AI 제공자입니다.');
  }
}

// ── 일반 채팅 ────────────────────────────────────────────────
export async function chat({ provider, apiKey, message, history = [], model, ollamaUrl }) {
  const systemPrompt = '당신은 교사의 수업·업무·행정을 돕는 AI 비서입니다. 반드시 한국어로만 답변하세요. 영어 단어 사용 금지. 마크다운 기호(**, *, #, -, `, 코드블록 등) 절대 사용 금지. 줄바꿈만 사용하여 평문으로 작성하세요.';
  if (provider !== 'ollama' && !apiKey) throw new Error('API 키가 설정되지 않았습니다.');
  const messages = [...history, { role: 'user', content: message }];

  switch (provider) {
    case 'claude':      return callClaude(apiKey, messages, systemPrompt, model);
    case 'openai':      return callOpenAI(apiKey, messages, systemPrompt, model);
    case 'gemini':      return callGemini(apiKey, messages, systemPrompt, model);
    case 'groq':        return callGroq(apiKey, messages, systemPrompt, model);
    case 'openrouter':  return callOpenRouter(apiKey, messages, systemPrompt, model);
    case 'ollama':      return callOllama(ollamaUrl, messages, systemPrompt, model);
    default: throw new Error('지원하지 않는 AI 제공자');
  }
}

// ── 기능별 특화 함수 (모두 callAI 위임) ─────────────────────

export async function generateDraft({ provider, apiKey, type, purpose, details, model, ollamaUrl }) {
  const typeMap = { notice:'학교 공문 기안문', plan:'사업 계획서', report:'결과 보고서', request:'구매 요청서', approval:'품의서' };
  return callAI({ provider, apiKey, model, ollamaUrl,
    systemPrompt: '당신은 한국 학교 행정 문서 작성 전문가입니다. 공문 표준 양식(수신, 제목, 내용, 붙임)에 맞게 격식체로 작성하세요.',
    userMessage: `다음 정보로 ${typeMap[type]||'공문'}을 작성해 주세요.\n목적: ${purpose}\n세부 내용: ${details}\n\n[형식]\n수신:\n제목:\n내용: (배경→주요내용→협조요청 3단락)\n붙임:`
  });
}

export async function generateLessonPlan({ provider, apiKey, subject, unit, grade, objectives, duration = 50, model, ollamaUrl }) {
  return callAI({ provider, apiKey, model, ollamaUrl,
    systemPrompt: '당신은 한국 고등학교 교육과정 전문가입니다. 2022 개정 교육과정에 맞는 수업 지도안을 작성하세요.',
    userMessage: `과목: ${subject}\n단원: ${unit}\n학년: ${grade}\n학습목표: ${objectives}\n시간: ${duration}분\n\n[형식]\n1. 학습목표(3개)\n2. 교수학습활동(도입${Math.round(duration*0.1)}분/전개${Math.round(duration*0.75)}분/정리${Math.round(duration*0.15)}분)\n3. 평가방법\n4. 준비물`
  });
}

export async function generateSETP({ provider, apiKey, subject, observations, studentInfo, model, ollamaUrl }) {
  return callAI({ provider, apiKey, model, ollamaUrl,
    systemPrompt: '한국 고등학교 학생부 세부능력 및 특기사항 전문가입니다. 주어 생략, ~함/~임/~을 보임 형식, 500자 이내로 작성하세요.',
    userMessage: `과목: ${subject}\n학생정보: ${studentInfo||'미제공'}\n관찰내용:\n${observations}`
  });
}

export async function generateIdea({ provider, apiKey, category, topic, context, model, ollamaUrl }) {
  const catMap = { lesson:'수업 활동', event:'학교 행사', homework:'과제·프로젝트', club:'동아리 활동', admin:'업무 개선' };
  return callAI({ provider, apiKey, model, ollamaUrl,
    systemPrompt: '창의적인 교육 아이디어 전문가입니다. 현장에서 바로 적용 가능한 아이디어를 제안하세요.',
    userMessage: `주제: ${topic}\n카테고리: ${catMap[category]}\n맥락: ${context||''}\n\n5가지 아이디어를 **[제목]** / - 방법: / - 기대효과: / - 준비물·시간: 형식으로 제안해 주세요.`
  });
}

export async function generateEmail({ provider, apiKey, recipient, purpose, keyPoints, tone = 'formal', model, ollamaUrl }) {
  return callAI({ provider, apiKey, model, ollamaUrl,
    systemPrompt: '한국 학교 교육 현장의 이메일·공문 작성 전문가입니다.',
    userMessage: `수신: ${recipient}\n목적: ${purpose}\n핵심내용: ${keyPoints}\n톤: ${tone==='formal'?'격식체':'친근한 업무 메일'}\n\n제목:\n본문: (인사말→본론→마무리→서명)`
  });
}

export async function summarizeDocument({ provider, apiKey, content, model, ollamaUrl }) {
  return callAI({ provider, apiKey, model, ollamaUrl,
    userMessage: `다음 문서를 핵심만 요약해 주세요.\n\n${content}\n\n- 목적:\n- 주요내용(3~5줄):\n- 조치사항:`
  });
}
