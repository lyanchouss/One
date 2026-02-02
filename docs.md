

## ✅ 1) Подними maxOutputTokens в /api/clarify/start (и сделай auto-retry)

Найди **callLLM** (или аналог) в `app/api/clarify/start/route.ts` (или где у тебя clarify).

Замени `generationConfig` на такое:

```ts
generationConfig: {
  temperature: 0.2,
  // ВАЖНО: для clarify всегда даём запас, иначе JSON часто не закрывается
  maxOutputTokens: 256,
  topP: 0.8,
  topK: 20,
  stopSequences: [],
}
```

И добавь **авто-повтор**, если Gemini вернул `MAX_TOKENS`:

```ts
async function callGeminiText(prompt: string, maxTokens: number, signal: AbortSignal) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${process.env.GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: maxTokens,
          topP: 0.8,
          topK: 20,
          stopSequences: [],
        },
      }),
      signal,
    }
  );

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  const finishReason = data?.candidates?.[0]?.finishReason ?? "";

  return { text, finishReason };
}

async function callLLM(prompt: string, minutes?: number): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12000);

  try {
    // 1-я попытка
    let { text, finishReason } = await callGeminiText(prompt, 256, controller.signal);

    // если снова обрезало — повтор с большим лимитом
    if (finishReason === "MAX_TOKENS" || finishReason === "LENGTH" || (text && text.trim().endsWith('"'))) {
      ({ text } = await callGeminiText(prompt, 512, controller.signal));
    }

    return text;
  } finally {
    clearTimeout(timeoutId);
  }
}
```

---

## ✅ 2) Укороти prompt для clarify (там нельзя “многословие”)

Clarify — это не “генерация шага”, там не нужен огромный промпт, few-shot и правила на страницу.

Сделай prompt для clarify максимально коротким, например:

```ts
const prompt = `
Верни ТОЛЬКО JSON (без текста), строго в одну строку:
{"type":"step","step":"...","micro_hack":"...","done_check":"..."}
ИЛИ если не хватает данных:
{"type":"questions","questions":[{"id":"q1","question":"..."},{"id":"q2","question":"..."}]}

Правила:
- только русский
- никаких переносов строк
- максимум 2 вопроса
- вопросы конкретные (место/объект/ограничение), без "где это происходит" и без повторов

Запрос пользователя: "${thought}"
`.trim();
```

---

## ✅ 3) Добавь “жёсткий лимит” на длину ответа (чтобы JSON был короткий)

В clarify промпте добавь:

* “каждый вопрос ≤ 90 символов”
* “step ≤ 200 символов”
* “всё в одну строку”



---

## ✅ 4) Мини-патч к парсеру (чтобы быстро диагностировать)

Сейчас у тебя “Failed to parse → default”.
Добавь лог, чтобы видеть **какой maxOutputTokens реально ушёл** и **finishReason** (ты уже логируешь, это хорошо). Ещё полезно:

```ts
if (finishReason === "MAX_TOKENS") {
  console.warn("CLARIFY: max tokens too low or prompt too long. Increase maxOutputTokens.");
}
```

-
