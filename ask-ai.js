// ============================================================
//  Безопасный прокси к OpenAI для Netlify Functions
//  Ключ OpenAI хранится ТОЛЬКО в переменных окружения сервера
//  и никогда не попадает в браузер ученика.
// ============================================================

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';

const cfg = {
  apiKey:         process.env.OPENAI_API_KEY,
  model:          process.env.OPENAI_MODEL || 'gpt-5.4-mini',
  allowedOrigin:  process.env.ALLOWED_ORIGIN || '*',
  coursePassword: process.env.COURSE_PASSWORD || '',
  accessCodes:   (process.env.ACCESS_CODES || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean),
  maxInputChars:  parseInt(process.env.MAX_INPUT_CHARS  || '8000', 10),
  maxOutputTokens:parseInt(process.env.MAX_OUTPUT_TOKENS || '1000', 10),
};

function headers() {
  return {
    'Access-Control-Allow-Origin':  cfg.allowedOrigin,
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json; charset=utf-8',
  };
}

function reply(status, obj) {
  return { statusCode: status, headers: headers(), body: JSON.stringify(obj) };
}

async function callOpenAI(body) {
  const r = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + cfg.apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  let data = {};
  try { data = await r.json(); } catch (e) { data = {}; }
  return { ok: r.ok, status: r.status, data: data };
}

function paramError(data, name) {
  const m = (data && data.error && data.error.message) ? String(data.error.message).toLowerCase() : '';
  return m.indexOf(name.toLowerCase()) !== -1;
}

exports.handler = async function (event) {
  // CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: headers(), body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return reply(405, { error: 'Метод не поддерживается.' });
  }
  if (!cfg.apiKey) {
    return reply(500, { error: 'Сервер не настроен: отсутствует переменная OPENAI_API_KEY.' });
  }

  let p;
  try { p = JSON.parse(event.body || '{}'); }
  catch (e) { return reply(400, { error: 'Некорректный формат запроса.' }); }

  // --- Проверка доступа (код ученика) ---
  const needCode = cfg.coursePassword || cfg.accessCodes.length > 0;
  if (needCode) {
    const code = (p.access_code || '').trim();
    const ok = (cfg.coursePassword && code === cfg.coursePassword) || (cfg.accessCodes.indexOf(code) !== -1);
    if (!ok) {
      return reply(401, { error: 'Неверный код доступа. Введите код, который выдан вместе с курсом.' });
    }
  }

  const messages = p.messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    return reply(400, { error: 'Пустой запрос.' });
  }

  // --- Ограничение длины ввода (защита от перерасхода) ---
  let chars = 0;
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    if (m && m.content) chars += String(m.content).length;
  }
  if (chars > cfg.maxInputChars) {
    return reply(413, { error: 'Слишком длинный запрос. Сократите текст и попробуйте снова.' });
  }

  // --- Тело запроса к OpenAI ---
  let body = {
    model: (p.model && String(p.model)) || cfg.model,
    messages: messages,
    max_completion_tokens: cfg.maxOutputTokens,
  };
  if (typeof p.temperature === 'number') body.temperature = p.temperature;

  try {
    let resp = await callOpenAI(body);

    // Фолбэк 1: старые модели не знают max_completion_tokens -> max_tokens
    if (!resp.ok && resp.status === 400 && paramError(resp.data, 'max_completion_tokens')) {
      delete body.max_completion_tokens;
      body.max_tokens = cfg.maxOutputTokens;
      resp = await callOpenAI(body);
    }
    // Фолбэк 2: некоторые модели не принимают temperature
    if (!resp.ok && resp.status === 400 && paramError(resp.data, 'temperature')) {
      delete body.temperature;
      resp = await callOpenAI(body);
    }

    if (!resp.ok) {
      let human = (resp.data && resp.data.error && resp.data.error.message) ? resp.data.error.message : 'Ошибка обращения к ИИ.';
      if (resp.status === 401)      human = 'Сервер: ключ OpenAI отклонён. Проверьте переменную OPENAI_API_KEY.';
      else if (resp.status === 429) human = 'Слишком много запросов или закончился баланс OpenAI. Попробуйте чуть позже.';
      else if (resp.status === 404) human = 'Указанная модель недоступна. Измените OPENAI_MODEL (например, gpt-5.4-mini).';
      return reply(resp.status, { error: human });
    }

    const answer = (resp.data.choices && resp.data.choices[0] && resp.data.choices[0].message && resp.data.choices[0].message.content) || '';
    return reply(200, { answer: answer });
  } catch (e) {
    return reply(502, { error: 'Не удалось связаться с ИИ. Попробуйте позже.' });
  }
};
