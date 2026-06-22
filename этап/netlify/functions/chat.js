const https = require("https");

exports.handler = async function(event, context) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  let about;
  try {
    const body = JSON.parse(event.body);
    about = body.about;
  } catch(e) {
    return { statusCode: 400, body: "Bad Request" };
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, body: JSON.stringify({ error: "OPENAI_API_KEY не настроен" }) };
  }

  const prompt = `Ты — эксперт по онлайн-нишам и монетизации. 
Пользователь рассказал о себе: "${about}"

На основе этого предложи 5 конкретных ниш для онлайн-бизнеса или заработка. 
Для каждой ниши:
1. Название ниши
2. Почему она подходит именно этому человеку
3. Как начать (первый шаг)
4. Примерный доход через 3-6 месяцев

Отвечай по-русски, тепло и мотивирующе.`;

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
          if (json.error) {
            resolve({ statusCode: 500, body: JSON.stringify({ error: json.error.message }) });
          } else {
            const result = json.choices[0].message.content;
            resolve({
              statusCode: 200,
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ result })
            });
          }
        } catch(e) {
          resolve({ statusCode: 500, body: JSON.stringify({ error: "Ошибка разбора ответа OpenAI" }) });
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
