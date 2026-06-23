const https = require("https");

exports.handler = async function(event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const { message } = JSON.parse(event.body);
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return { statusCode: 500, body: JSON.stringify({ error: "API ключ не найден" }) };
  }

  const payload = JSON.stringify({
    model: "gpt-3.5-turbo",
    messages: [
      {
        role: "system",
        content: "Ты — эксперт по онлайн-нишам. Анализируй информацию о человеке и предлагай 5 конкретных ниш для онлайн-заработка с объяснением почему они подходят."
      },
      {
        role: "user",
        content: message
      }
    ],
    max_tokens: 1000,
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
        "Content-Length": Buffer.byteLength(payload)
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
            const reply = json.choices[0].message.content;
            resolve({ statusCode: 200, body: JSON.stringify({ reply }) });
          }
        } catch(e) {
          resolve({ statusCode: 500, body: JSON.stringify({ error: "Ошибка парсинга ответа" }) });
        }
      });
    });

    req.on("error", (e) => {
      resolve({ statusCode: 500, body: JSON.stringify({ error: e.message }) });
    });

    req.write(payload);
    req.end();
  });
};