exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json"
  };

  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };
  if (event.httpMethod !== "POST")    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };

  const OPENAI_KEY = process.env.OPENAI_API_KEY;
  const PASSWORD   = process.env.COURSE_PASSWORD || "kira2026";

  if (!OPENAI_KEY) return {
    statusCode: 500, headers,
    body: JSON.stringify({ error: "⚠️ API-ключ не настроен. Добавь OPENAI_API_KEY в Environment Variables на Netlify." })
  };

  let body;
  try { body = JSON.parse(event.body); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ error: "Неверный запрос" }) }; }

  if (body.password !== PASSWORD) return {
    statusCode: 403, headers,
    body: JSON.stringify({ error: "Неверный код доступа. Проверь код и попробуй снова." })
  };

  const models = ["gpt-4o-mini", "gpt-4o", "gpt-3.5-turbo"];
  const model  = process.env.AI_MODEL || models[0];

  const makeReq = async (mdl, useCompletionTokens) => {
    const payload = {
      model: mdl,
      messages: body.messages || [{ role: "user", content: body.prompt }],
      temperature: 0.7,
      [useCompletionTokens ? "max_completion_tokens" : "max_tokens"]: 1200
    };
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${OPENAI_KEY}` },
      body: JSON.stringify(payload)
    });
    return r;
  };

  try {
    let res = await makeReq(model, true);
    if (!res.ok) res = await makeReq(model, false);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const msg = err?.error?.message || res.statusText;
      return { statusCode: res.status, headers, body: JSON.stringify({ error: `OpenAI: ${msg}` }) };
    }
    const data = await res.json();
    const answer = data.choices?.[0]?.message?.content || "";
    return { statusCode: 200, headers, body: JSON.stringify({ answer }) };
  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
