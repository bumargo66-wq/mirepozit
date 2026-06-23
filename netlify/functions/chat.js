const https = require("https");

exports.handler = async function(event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch(e) {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON" }) };
  }

  const { name, message } = body;
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return { statusCode: 500, body: JSON.stringify({ error: "API key not configured" }) };
  }

  const prompt = `Ты — эксперт по онлайн-заработку и выбору ниши. Пользователя зовут ${name || "друг"}.

Вот что они рассказали о себе:
${message}

На основе этого предложи 5 конкретных ниш для онлайн-заработка. Для каждой ниши:
- Название ниши
- Почему подходит именно этому человеку
- С чего начать (1-2 шага)
- Примерный доход через 3-6 месяцев

Отвечай на русском языке, дружелюбно и конкретно.`;

  const requestBody = JSON.stringify({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    max_tokens: 1500,
    temperature: 0.7
  });

  return new Promise((resolve) => {
    const options = {
      hostname: "api.openai.com",
      path: "/v1/chat/completions",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + apiKey,
        "Content-Length": Buffer.byteLength(requestBody)
      }
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
        try {
          const json = JSON.parse(data);
          if (json.choices && json.choices[0]) {
            resolve({
              statusCode: 200,
              headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
              body: JSON.stringify({ reply: json.choices[0].message.content })
            });
          } else {
            resolve({
              statusCode: 500,
              body: JSON.stringify({ error: json.error ? json.error.message : "OpenAI error" })
            });
          }
        } catch(e) {
          resolve({ statusCode: 500, body: JSON.stringify({ error: "Parse error" }) });
        }
      });
    });

    req.on("error", (e) => {
      resolve({ statusCode: 500, body: JSON.stringify({ error: e.message }) });
    });

    req.write(requestBody);
    req.end();
  });
};
