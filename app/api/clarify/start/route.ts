import { extractAnchors, validateAnchors, classifyDomain, classifyTask, Domain, TaskCategory } from "../../step/route";
import {
  callGeminiJson,
  isTruncatedJson,
  safeParseJson,
  normalizeModelResponse,
  validateResponseSchema,
  type GeminiResponse,
} from "../../_llm/gemini.ts";

/**
 * Вызывает LLM с retry логикой для clarify
 * Retry при: MAX_TOKENS/LENGTH/обрезанном JSON/пустом raw
 * Schema-fix retry: если JSON валидный, но type неизвестный или обязательных полей нет
 */
async function callLLMWithRetry(
  prompt: string,
  minutes: number,
  isSchemaFix: boolean = false
): Promise<GeminiResponse | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12000);

  try {
    let attempt = 1;
    let lastResponse: GeminiResponse | null = null;

    while (attempt <= 3) {
      const temperature = attempt > 1 || isSchemaFix ? 0.4 : 0.6;
      const retryPrompt =
        attempt > 1 && !isSchemaFix
          ? `${prompt}\n\nRETRY: return ONLY valid JSON, no extra text, no markdown.`
          : isSchemaFix
          ? `${prompt}\n\nFix JSON to match schema: type must be "step" or "question", include all required fields.`
          : prompt;

      const response = await callGeminiJson(retryPrompt, {
        minutes,
        attempt,
        temperature,
        signal: controller.signal,
      });

      lastResponse = response;

      // Логирование
      console.log(`CLARIFY LLM CALL (attempt ${attempt}) >>>`, {
        finishReason: response.finishReason,
        maxOutputTokens: response.maxOutputTokens,
        rawLength: response.rawText.length,
        model: response.model,
        attempt,
      });

      // Проверяем на обрезанный JSON или пустой ответ
      const truncated = isTruncatedJson(response.rawText);
      const isMaxTokens = response.finishReason === "MAX_TOKENS" || response.finishReason === "LENGTH";
      const isEmpty = !response.rawText || response.rawText.trim().length === 0;

      // Retry при обрезке/MAX_TOKENS/пустом ответе
      if ((isMaxTokens || truncated || isEmpty) && attempt < 3) {
        console.warn(`CLARIFY: Truncated/empty response (attempt ${attempt}), retrying`, {
          finishReason: response.finishReason,
          truncated,
          isEmpty,
        });
        attempt++;
        continue;
      }

      // Если ответ не обрезан, проверяем schema
      if (!truncated && !isEmpty) {
        const parsed = safeParseJson(response.rawText);
        if (parsed) {
          const normalized = normalizeModelResponse(parsed);
          if (normalized && validateResponseSchema(normalized)) {
            // Валидный ответ
            clearTimeout(timeoutId);
            return response;
          } else if (!isSchemaFix && attempt < 3) {
            // JSON валидный, но schema не соответствует - делаем schema-fix retry
            console.warn(`CLARIFY: Schema validation failed (attempt ${attempt}), schema-fix retry`, {
              parsedType: parsed.type,
              normalized: normalized ? normalized.type : null,
            });
            clearTimeout(timeoutId);
            // Рекурсивно вызываем с isSchemaFix=true
            return callLLMWithRetry(prompt, minutes, true);
          }
        }
      }

      // Если дошли сюда и это последняя попытка - возвращаем что есть
      if (attempt >= 3) {
        clearTimeout(timeoutId);
        return response;
      }

      attempt++;
    }

    clearTimeout(timeoutId);
    return lastResponse;
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === "AbortError") {
      throw new Error("Request timeout: Gemini API took too long to respond");
    }
    throw error;
  }
}

function buildClarifyPrompt(thought: string, minutes: number, anchors: string[], domain: Domain, category: TaskCategory): string {
  const anchorsLine = anchors && anchors.length > 0 ? anchors.join(", ") : "";
  const maxLength = minutes <= 10 ? 180 : 320;
  
  return `Return ONLY valid JSON in ONE line. No commentary. No trailing text. No markdown fences.

JSON SCHEMA:
{
  "type": "step" | "question",
  "step": "string (≤${maxLength} chars, Russian, imperative verb)",
  "micro_hack": "string (Russian, one line)",
  "done_check": "string (Russian, one line)",
  "question": {
    "id": "string",
    "text": "string (≤90 chars, Russian)",
    "options": ["string", "string"] (min 2, max 3)
  }
}

REQUIREMENTS:
- type must be "step" or "question"
- if type="step": MUST include step, micro_hack, done_check (all required)
- if type="question": MUST include question: {id, text, options[min 2]}
- Output MUST be single-line JSON, no line breaks
- All fields must be strings in Russian
- domain: ${domain}, category: ${category}
${anchorsLine ? `- use anchors: ${anchorsLine}` : ""}
- micro_hack: CRITICAL - Focus on psychological state and mindset, NOT just technical tips. Help the person get into the right mental state (reduce resistance, anxiety, perfectionism). Address barriers: "не думай о результате", "это нормально, что не идеально", "начни с малого", "сопротивление пройдёт".
- done_check: CRITICAL - Focus on psychological validation and observable progress, NOT just technical completion. Acknowledge that starting is progress: "ты начал — это уже прогресс", "даже если не идеально, ты движешься", "первый шаг сделан".

User: "${thought}"`.trim();
}

function getFallbackStepFromThought(thought: string, minutes: number, anchors?: string[], domain?: Domain, category?: TaskCategory): string {
  const t = (thought ?? "").toLowerCase();
  const fromAnchors = anchors && anchors.length > 0 ? anchors : extractAnchors(thought);
  const mainAnchor = fromAnchors[0];

  // Используем домен и категорию для более точного fallback
  if (domain === "cooking") {
    return "Достань кастрюлю, налей в неё воду и поставь на плиту, чтобы начать готовить.";
  }
  
  if (domain === "phone") {
    return "Открой настройки на телефоне, зайди в Wi-Fi и подключись к нужной сети.";
  }

  // Travel/packing: чемодан/поездка/билеты
  if (domain === "travel" || category === "packing" || /(чемодан|поездк|отпуск|перел[её]т|самол[её]т|аэропорт|билет|паспорт|виза|отел|гостин)/i.test(t)) {
    return minutes >= 15
      ? "Достань чемодан, открой его на полу и сложи внутрь гигиену (щётка/паста/дезодорант/косметичка) + зарядку, не трогая одежду."
      : "Достань чемодан, открой его на полу и сложи внутрь только гигиену (щётка/паста/дезодорант/косметичка), не трогая одежду.";
  }

  if (domain === "study" || category === "study_docs" || /(хими|отч[её]т|реферат|эссе|домашк|конспект|экзамен|уч[её]б)/i.test(t)) {
    return "Открой документ с отчётом и создай 3 подзаголовка: «Введение», «Основная часть», «Выводы».";
  }
  
  if (/(презентац|слайды|ppt|powerpoint)/i.test(t)) {
    return "Открой презентацию и создай 3 слайда-заглушки: «Проблема», «Решение», «Следующий шаг».";
  }
  
  if (domain === "home" || category === "home" || /(уборк|комнат|пыл|мусор|вещи|пол|стол|кухн)/i.test(t)) {
    return "Протри кухонный стол и убери с него 10 лишних предметов в их места.";
  }
  
  // Проверяем, не является ли это удалением/очисткой
  const isDeletion = /(удал|очист|стерет|выброс|убери|почист|очист|разобрать|разобрать почту|почистить почту|очистить почту|удалить сообщен|удалить письм)/i.test(t);
  
  if ((category === "communication" || /(сообщен|написат|преподавател|учител|чат|письм|email|почт)/i.test(t)) && !isDeletion) {
    return "Открой чат/почту преподавателя и набросай 2 предложения: цель письма и конкретный вопрос.";
  }
  
  // Очистка/удаление почты
  if (isDeletion && /(почт|сообщен|письм|email|e-mail)/i.test(t)) {
    return "Открой почту и удали 10 старых сообщений, начиная с самых старых.";
  }
  
  if (category === "coding" || /(код|курс[оo]р|cursor|проект|репозитор|git|next|api)/i.test(t)) {
    return "Открой проект в Cursor и создай файл README.md с 3 строками: цель, стек, как запустить.";
  }

  const target =
    mainAnchor && mainAnchor.length > 0
      ? `${mainAnchor}`
      : "документ или файл, с которым связана твоя задача";

  return minutes >= 15
    ? `Открой ${target} и добавь 2–3 понятных подзаголовка, чтобы стало ясно, что делать дальше.`
    : `Открой ${target} и допиши один конкретный подзаголовок или фразу, которая продвинет задачу вперёд.`;
}

function getDefaultStep(
  thought: string,
  minutes: number,
  anchors?: string[],
  domain?: Domain,
  category?: TaskCategory
): { type: "step"; step: string; micro_hack: string; done_check: string } {
  const fromAnchors = anchors && anchors.length > 0 ? anchors : extractAnchors(thought);
  const a0 = fromAnchors?.[0] ?? "";
  const anchor = a0 ? `«${a0}»` : "";
  
  // Адаптируем micro_hack и done_check под домен/категорию с фокусом на психологическое состояние
  let micro_hack = a0
    ? `Не думай о результате по ${anchor} — просто сделай черновиком, это снимет напряжение.`
    : "Не думай о результате — просто сделай черновиком, это снимет напряжение.";
  let done_check = a0
    ? `Ты начал — по ${anchor} появился результат, это уже прогресс, даже если не идеально.`
    : "Ты начал — результат появился, это уже прогресс, даже если не идеально.";

  if (domain === "cooking") {
    micro_hack = "Не думай о всём ужине — просто начни с воды в кастрюле, это снимет давление.";
    done_check = "Ты начал — кастрюля стоит на плите, вода внутри, это уже прогресс.";
  } else if (domain === "phone") {
    micro_hack = "Не думай о проблемах — просто открой настройки, это снимет тревогу.";
    done_check = "Ты начал — Wi-Fi включён или ты в настройках, это уже прогресс.";
  } else if (domain === "travel" || category === "packing") {
    micro_hack = "Не думай о всём чемодане — просто гигиена, это снимет давление и сопротивление.";
    done_check = "Ты начал — в чемодане лежит гигиена, это уже прогресс, даже если не всё собрано.";
  } else if (domain === "home" || category === "home") {
    micro_hack = "Не залипай на идеал — просто считай до 10, это снимет сопротивление.";
    done_check = "Ты начал — стол чище или собраны предметы, это уже прогресс, даже если не всё идеально.";
  } else if (category === "communication") {
    micro_hack = "Не думай о том, как это звучит — просто начни с шаблона, это снимет тревогу.";
    done_check = "Ты начал — в черновике есть 2 предложения, это уже прогресс, даже если не идеально.";
  } else if (category === "coding") {
    micro_hack = "Не придумывай с нуля — скопируй команды, это снимет напряжение и сопротивление.";
    done_check = "Ты начал — в README появился раздел, это уже прогресс, даже если не всё готово.";
  } else if (domain === "study" || category === "study_docs") {
    micro_hack = "Не стремись к идеалу — просто структура, это нормально и снимет перфекционизм.";
    done_check = "Ты начал — в документе есть подзаголовки, это уже прогресс, даже если не всё заполнено.";
  }
  
  return {
    type: "step",
    step: getFallbackStepFromThought(thought, minutes, fromAnchors, domain, category),
    micro_hack,
    done_check
  };
}

/**
 * Извлекает JSON-объект из текста (с responseMimeType: "application/json" ответ должен быть чистым JSON)
 * Возвращает {type: "step", step, micro_hack, done_check} или {type: "question", question: {id, text, options}} или null
 */
// Обратная совместимость - используем общие функции
function parseClarifyResponse(text: string): 
  | { type: "step"; step: string; micro_hack: string; done_check: string }
  | { type: "question"; question: { id: string; text: string; options: string[] } }
  | null {
  const parsed = safeParseJson(text);
  return parsed ? normalizeModelResponse(parsed) : null;
}


export async function POST(req: Request) {
  let minutes = 10; // default
  
  try {
    const body = await req.json();
    const thought = String(body?.thought ?? "").trim();
    const anchors = extractAnchors(thought);
    const domain = classifyDomain(thought);
    const category = classifyTask(thought);
    
    // Validate and set minutes
    const rawMinutes = body?.minutes;
    if (typeof rawMinutes === "number" && [5, 10, 15, 20].includes(rawMinutes)) {
      minutes = rawMinutes;
    }
    
    if (!thought) {
      // Если нет thought, возвращаем дефолтный шаг
      return Response.json(getDefaultStep("", minutes, [], domain, category));
    }

    try {
      const prompt = buildClarifyPrompt(thought, minutes, anchors, domain, category);
      const response = await callLLMWithRetry(prompt, minutes);

      if (!response || !response.rawText || response.rawText.trim().length === 0) {
        console.warn("CLARIFY: Empty response from Gemini", {
          finishReason: response?.finishReason,
          thought,
          domain,
          category,
        });
        return Response.json(getDefaultStep(thought, minutes, anchors, domain, category));
      }

      // Парсим и нормализуем ответ
      const parsed = safeParseJson(response.rawText);
      const normalized = parsed ? normalizeModelResponse(parsed) : null;

      if (normalized) {
        // Валидация ответа типа "step"
        if (normalized.type === "step") {
          // Проверяем, что step не пустой и содержит хотя бы один anchor
          if (
            normalized.step &&
            normalized.step.trim().length > 0 &&
            validateAnchors(normalized.step, anchors)
          ) {
            return Response.json(normalized);
          }
        }

        // Валидация ответа типа "question"
        if (normalized.type === "question") {
          // Проверяем, что вопрос валидный
          if (
            normalized.question.text &&
            normalized.question.text.trim().length > 0 &&
            normalized.question.text.length <= 90 &&
            normalized.question.options &&
            normalized.question.options.length >= 2 &&
            normalized.question.options.length <= 3
          ) {
            return Response.json(normalized);
          }
        }
      }

      // Если парсинг не удался или ответ невалиден - возвращаем дефолтный шаг
      console.warn("CLARIFY: Failed to parse or invalid response, using default step", {
        finishReason: response.finishReason,
        normalizedType: normalized?.type,
        hasParsed: !!parsed,
        thought,
        domain,
        category,
      });

      return Response.json(getDefaultStep(thought, minutes, anchors, domain, category));
    } catch (error: any) {
      console.error("CLARIFY: Error calling LLM:", error.message);
      return Response.json(getDefaultStep(thought, minutes, anchors, domain, category));
    }
  } catch (e: any) {
    console.error("POST /api/clarify/start error:", e);
    // Return safe default on error
    const defaultDomain = classifyDomain("");
    const defaultCategory = classifyTask("");
    return Response.json(getDefaultStep("", minutes, [], defaultDomain, defaultCategory));
  }
}

