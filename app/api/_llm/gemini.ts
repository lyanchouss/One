/**
 * Общий модуль для работы с Gemini API
 * Унифицирует вызовы LLM, парсинг JSON и обработку ошибок
 */

export type GeminiResponse = {
  rawText: string;
  finishReason: string;
  usage?: { promptTokens?: number; candidatesTokens?: number; totalTokens?: number };
  model?: string;
  attempt: number;
  maxOutputTokens: number;
};

export type NormalizedResponse =
  | { type: "step"; step: string; micro_hack: string; done_check: string }
  | { type: "question"; question: { id: string; text: string; options: string[] } }
  | null;

/**
 * Вычисляет maxOutputTokens на основе времени и длины промпта
 * - минимум 512 всегда
 * - для 15–20 минут минимум 768 (или 1024, если prompt длинный)
 * - если promptLengthChars > 1200, добавляем +256 к лимиту
 * - верхний предел 1536
 */
export function computeMaxOutputTokens(minutes: number, promptLengthChars: number): number {
  let base = 512; // минимум всегда 512

  // Для 15–20 минут увеличиваем базовый лимит
  if (minutes >= 15 && minutes <= 20) {
    base = promptLengthChars > 1200 ? 1024 : 768;
  }

  // Если промпт длинный, добавляем бонус
  if (promptLengthChars > 1200) {
    base += 256;
  }

  // Верхний предел 1536
  return Math.min(base, 1536);
}

/**
 * Проверяет, является ли JSON обрезанным
 */
export function isTruncatedJson(raw: string): boolean {
  if (!raw || raw.trim().length === 0) return false;
  const trimmed = raw.trim();
  // Если начинается с { но не заканчивается на }
  if (trimmed.startsWith("{") && !trimmed.endsWith("}")) return true;
  // Проверяем на незакрытые кавычки в конце (признак обрыва строки)
  if (trimmed.endsWith('"') && !trimmed.endsWith('"}')) return true;
  return false;
}

/**
 * Корректно извлекает rawText из ответа Gemini API
 * Собирает текст из всех parts всех кандидатов
 */
export function extractRawTextFromResponse(data: any): string {
  // Логируем структуру для диагностики
  const modelName = data?.modelVersion || data?.model || "unknown";
  const hasCandidates = Array.isArray(data?.candidates) && data.candidates.length > 0;
  const candidatesCount = hasCandidates ? data.candidates.length : 0;

  if (!hasCandidates) {
    console.warn("GEMINI: No candidates in response", {
      modelName,
      responseKeys: Object.keys(data || {}),
    });
    return "";
  }

  // Извлекаем текст из первого кандидата
  const candidate = data.candidates[0];
  const parts = candidate?.content?.parts;
  const partsCount = Array.isArray(parts) ? parts.length : 0;

  if (!Array.isArray(parts) || parts.length === 0) {
    console.warn("GEMINI: No parts in candidate", {
      modelName,
      hasCandidates,
      candidateKeys: Object.keys(candidate || {}),
    });
    return "";
  }

  // Собираем текст из всех parts
  const text = parts
    .map((p: any) => {
      if (typeof p?.text === "string") {
        return p.text;
      }
      return "";
    })
    .join("");

  const rawLength = text.length;

  // Логируем для диагностики
  console.log("GEMINI: Text extraction", {
    modelName,
    hasCandidates,
    candidatesCount,
    partsCount,
    rawLength,
    textPreview: text.substring(0, 100),
  });

  return text;
}

/**
 * Вызывает Gemini API и возвращает нормализованный ответ
 */
export async function callGeminiJson(
  prompt: string,
  options: {
    minutes: number;
    attempt?: number;
    temperature?: number;
    signal?: AbortSignal;
  }
): Promise<GeminiResponse> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Missing GEMINI_API_KEY in .env.local");

  const { minutes, attempt = 1, temperature = 0.5, signal } = options;
  const promptLength = prompt.length;
  let maxTokens = computeMaxOutputTokens(minutes, promptLength);

  // Для retry увеличиваем лимит минимум в 2 раза
  if (attempt > 1) {
    maxTokens = Math.min(maxTokens * 2, 1536);
  }

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature,
          maxOutputTokens: maxTokens,
          topP: 0.8,
          topK: 20,
          responseMimeType: "application/json", // ВСЕГДА JSON
          stopSequences: [],
        },
      }),
      signal,
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gemini error ${res.status}: ${text}`);
  }

  const data = await res.json();
  const rawText = extractRawTextFromResponse(data);
  const finishReason = data?.candidates?.[0]?.finishReason ?? "";
  const usage = data?.usageMetadata;
  const model = data?.modelVersion || data?.model;

  return {
    rawText,
    finishReason,
    usage,
    model,
    attempt,
    maxOutputTokens: maxTokens,
  };
}

/**
 * Безопасно парсит JSON с нормализацией полей
 */
export function safeParseJson(rawText: string): any | null {
  if (!rawText || rawText.trim().length === 0) return null;

  // Убираем markdown fences
  let cleaned = rawText.trim();
  cleaned = cleaned.replace(/```json\s*/gi, "");
  cleaned = cleaned.replace(/```/g, "");
  cleaned = cleaned.trim();

  try {
    return JSON.parse(cleaned);
  } catch (e: any) {
    console.warn("safeParseJson: JSON.parse failed", {
      error: e.message,
      rawTextPreview: cleaned.substring(0, 200),
      rawLength: cleaned.length,
    });
    return null;
  }
}

/**
 * Нормализует ответ модели к единому формату
 * Приводит разные варианты полей к стандартным (doneCheck -> done_check, microHack -> micro_hack)
 */
export function normalizeModelResponse(json: any): NormalizedResponse {
  if (!json || typeof json !== "object") return null;

  // Нормализуем type (Step -> step, Question -> question)
  // Если type отсутствует, но есть step - считаем type="step"
  const typeRaw = json.type || json.Type || (json.step ? "step" : json.question ? "question" : "");
  const type = typeof typeRaw === "string" ? typeRaw.toLowerCase().trim() : "";

  if (type === "step" || (!type && json.step)) {
    // Нормализуем поля step
    const step = json.step || json.Step || "";
    const micro_hack = json.micro_hack || json.microHack || json.micro_hack || "";
    const done_check = json.done_check || json.doneCheck || json.done_check || "";

    if (typeof step === "string" && typeof micro_hack === "string" && typeof done_check === "string") {
      const trimmedStep = step.trim();
      const trimmedMicroHack = micro_hack.trim();
      const trimmedDoneCheck = done_check.trim();
      
      // Проверяем, что все поля не пустые
      if (trimmedStep.length > 0 && trimmedMicroHack.length > 0 && trimmedDoneCheck.length > 0) {
        return {
          type: "step",
          step: trimmedStep,
          micro_hack: trimmedMicroHack,
          done_check: trimmedDoneCheck,
        };
      }
    }
  }

  if (type === "question") {
    const question = json.question || json.Question || {};
    if (typeof question === "object" && question !== null) {
      const id = question.id || question.Id || "";
      const text = question.text || question.Text || "";
      const options = question.options || question.Options || [];

      if (
        typeof id === "string" &&
        typeof text === "string" &&
        Array.isArray(options) &&
        options.length >= 2 &&
        options.every((opt: any) => typeof opt === "string")
      ) {
        return {
          type: "question",
          question: {
            id: id.trim(),
            text: text.trim(),
            options: options.map((opt: string) => String(opt).trim()).filter((opt: string) => opt.length > 0),
          },
        };
      }
    }
  }

  return null;
}

/**
 * Проверяет, соответствует ли ответ JSON схеме
 */
export function validateResponseSchema(normalized: NormalizedResponse): boolean {
  if (!normalized) return false;

  if (normalized.type === "step") {
    return (
      normalized.step.length > 0 &&
      normalized.micro_hack.length > 0 &&
      normalized.done_check.length > 0
    );
  }

  if (normalized.type === "question") {
    return (
      normalized.question.id.length > 0 &&
      normalized.question.text.length > 0 &&
      normalized.question.options.length >= 2 &&
      normalized.question.options.length <= 3
    );
  }

  return false;
}

