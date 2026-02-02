// FALLBACK: UI prepends "Today (10 min):", so we only return the step content
const FALLBACK = "—";

// Список глаголов действия для валидации шага (разнесены EN/RU)
const ACTION_VERBS_EN = [
  "open", "write", "click", "search", "read", "watch", "create", "edit", "delete",
  "send", "reply", "call", "text", "email", "upload", "download", "install",
  "start", "begin", "launch", "run", "execute", "play", "listen", "view",
  "check", "review", "update", "save", "share", "post", "publish", "submit",
  "fill", "complete", "finish", "mark", "select", "choose", "pick", "add",
  "remove", "move", "copy", "paste", "cut", "rename", "organize", "sort",
  "find", "locate", "navigate", "visit", "go", "enter", "type", "input",
];

// RU — whitelist в повелительной форме (без эвристик типа "заканчивается на й/и/ь")
const ACTION_VERBS_RU = [
  "открой", "напиши", "нажми", "найди", "прочитай", "посмотри", "создай", "отредактируй", "удали",
  "отправь", "ответь", "позвони", "загрузи", "скачай", "установи",
  "запусти", "выполни", "включи", "выключи", "проверь", "обнови", "сохрани", "опубликуй",
  "заполни", "заверши", "отметь", "выбери", "добавь", "убери", "перемести", "скопируй",
  "вставь", "вырежи", "переименуй", "организуй", "перейди", "введи",
  "поставь", "достань", "налей", "протри", "собери", "сделай", "возьми", "положи",
  "приготовь", "подготовь", "закрой", "настрой",
  // cooking & common life actions (повелительная форма)
  "свари", "пожарь", "нарежь", "разогрей", "помой", "почисти", "замеси",
];

const ACTION_VERBS_EN_SET = new Set(ACTION_VERBS_EN);
const ACTION_VERBS_RU_SET = new Set(ACTION_VERBS_RU);

// RU infinitives to allow modal starts like "Нужно открыть ..." without relaxing into broad heuristics.
const ACTION_VERBS_RU_INFINITIVE = [
  "открыть", "создать", "написать", "прочитать", "посмотреть",
  "проверить", "обновить", "сохранить",
  "включить", "выключить", "настроить",
  "заполнить", "завершить", "отметить", "выбрать",
  "добавить", "убрать", "переместить",
  "скопировать", "вставить", "вырезать", "переименовать",
  "перейти", "ввести", "найти",
  "отправить", "ответить", "позвонить",
  "достать", "поставить", "взять", "положить", "собрать",
  "удалить", "установить", "скачать", "загрузить", "запустить", "выполнить",
  // cooking & common life actions
  "приготовить", "сварить", "пожарить", "нарезать", "разогреть", "помыть", "почистить", "замесить",
];
const ACTION_VERBS_RU_INFINITIVE_SET = new Set(ACTION_VERBS_RU_INFINITIVE);

function isAllowedModalActionStart(step: string): boolean {
  const trimmed = (step ?? "").trim();
  if (!trimmed) return false;
  const words = trimmed.toLowerCase().split(/\s+/).slice(0, 8);
  if (words.length < 3) return false;

  const modal = words[0].replace(/[.,!?;:]/g, "");
  if (!/^(нужно|надо|следует|стоит|можно|должна|должен|должны|обязана|обязан|обязаны)$/i.test(modal)) return false;

  const verb = words[1].replace(/[.,!?;:]/g, "");
  if (!ACTION_VERBS_RU_INFINITIVE_SET.has(verb)) return false;

  // "конкретный объект" — хотя бы один не-пустой токен после глагола
  // (не идеальная семантика, но резко снижает пустые "Нужно открыть ..." без объекта)
  const rest = words.slice(2).join(" ").trim();
  if (!rest) return false;
  if (rest.length < 3) return false;

  return true;
}

/**
 * Проверяет, что шаг начинается с глагола действия
 * Поддерживает английские и русские глаголы
 */
function startsWithActionVerb(step: string): boolean {
  const trimmed = step.trim();
  if (!trimmed) return false;
  
  // Берем первое слово (до пробела)
  const firstWord = trimmed.split(/\s+/)[0];
  if (!firstWord) return false;
  
  // Убираем знаки препинания
  const cleanWord = firstWord.replace(/[.,!?;:]/g, "").toLowerCase();
  if (!cleanWord) return false;
  
  // Проверка 1: Если английский - проверяем по списку
  const isEnglish = /^[a-z]+$/i.test(cleanWord);
  if (isEnglish) {
    // Проверяем первые слова (до 3 слов) на наличие глагола действия
    const words = trimmed.toLowerCase().split(/\s+/).slice(0, 3);
    for (const word of words) {
      const w = word.replace(/[.,!?;:]/g, "");
      if (ACTION_VERBS_EN_SET.has(w)) {
        return true;
      }
    }
    return false;
  }
  
  // Проверка 2: Если русский - проверяем по whitelist
  const isRussian = /^[а-яё]+$/i.test(cleanWord);
  if (isRussian) {
    // Разрешаем модальные конструкции типа "Нужно открыть ..." при наличии глагола действия и объекта
    if (isAllowedModalActionStart(trimmed)) return true;

    // Проверяем по whitelist русских глаголов (строгое совпадение первого слова)
    if (ACTION_VERBS_RU_SET.has(cleanWord)) {
      return true;
    }
  }
  
  return false;
}

/**
 * Проверяет, что шаг не является explanation (не начинается с описательных фраз)
 * Поддерживает английские и русские паттерны
 */
function isNotExplanation(step: string): boolean {
  const s = step.toLowerCase().trim();
  
  // Запрещённые начала, которые указывают на explanation, а не на действие
  const explanationPatterns = [
    // English patterns
    /^(this|that|it|the problem|the issue|the difficulty|the challenge)/,
    /^(you|your|you're|you are)/,
    /^(it's|it is|there is|there are)/,
    /^(the|a|an)\s+(problem|issue|difficulty|challenge|task|thing)/,
    /^(because|since|as|when|if|although|while)/,
    /^(explain|describe|understand|realize|recognize|notice)/,
    // Russian patterns
    /^(это|эта|этот|проблема|задача|трудность|вызов)/,
    /^(ты|твой|твоя|твоё|вы|ваш|ваша|ваше)/,
    /^(потому что|так как|когда|если|хотя|пока)/,
    /^(объясни|опиши|понял|поняла|понять|осознай|заметил|заметила)/,
    // NOTE: модальные слова сами по себе не ban-им.
    // Они OK, если дальше есть глагол действия + конкретный объект (например "Нужно открыть файл ...").
    /^(нельзя)/,
  ];
  
  if (explanationPatterns.some(pattern => pattern.test(s))) return false;

  // Если начинается с модального слова — считаем explanation, только если это НЕ "модал + действие + объект"
  if (/^(нужно|надо|следует|стоит|можно|должна|должен|должны|обязана|обязан|обязаны)\b/i.test(s)) {
    return isAllowedModalActionStart(step);
  }

  return true;
}

/**
 * Проверяет, что шаг не является вопросом
 */
function isNotQuestion(step: string): boolean {
  const s = step.trim();
  // Проверяем наличие вопросительных знаков и вопросительных слов
  if (s.includes("?")) return false;
  const questionWords = [
    /^(как|что|где|когда|кто|почему|зачем|какой|какая|какое|какие|сколько|чей|чья|чьё|чьи)\b/i,
    /^(how|what|where|when|who|why|which|how many|how much)\b/i,
  ];
  if (questionWords.some(pattern => pattern.test(s))) return false;
  return true;
}

/**
 * Проверяет, что шаг не является планом или размышлением
 */
function isNotPlanOrThink(step: string): boolean {
  const s = step.toLowerCase().trim();
  const planPatterns = [
    /^(план|планируй|спланируй|составь план|сделай план|напиши план)/i,
    /^(думай|подумай|размышляй|обдумай|проанализируй|проанализировать)/i,
    /^(список|составь список|сделай список|напиши список)/i,
    /^(мотивац|мотивируй|мотивировать)/i,
    /^(разбей|разбить|раздели|разделить)/i,
    /^(plan|think|analyze|break down|list|motivate)/i,
  ];
  if (planPatterns.some(pattern => pattern.test(s))) return false;
  return true;
}

/**
 * Проверяет, что шаг начинается с повелительной формы (русский или английский)
 * Более мягкая проверка: не требует точного совпадения с ACTION_VERBS
 */
function startsWithImperative(step: string): boolean {
  const trimmed = step.trim();
  if (!trimmed) return false;
  
  const firstWord = trimmed.split(/\s+/)[0];
  if (!firstWord) return false;
  
  const cleanWord = firstWord.replace(/[.,!?;:]/g, "").toLowerCase();
  if (!cleanWord) return false;
  
  // Для английского: проверяем по списку (более строго)
  const isEnglish = /^[a-z]+$/i.test(cleanWord);
  if (isEnglish) {
    const words = trimmed.toLowerCase().split(/\s+/).slice(0, 3);
    for (const word of words) {
      const w = word.replace(/[.,!?;:]/g, "");
      if (ACTION_VERBS_EN_SET.has(w)) {
        return true;
      }
    }
    return false;
  }
  
  // Для русского: более мягкая проверка
  const isRussian = /^[а-яё]+$/i.test(cleanWord);
  if (isRussian) {
    // Разрешаем модальные конструкции
    if (isAllowedModalActionStart(trimmed)) return true;
    
    // Проверяем по whitelist (строгое совпадение)
    if (ACTION_VERBS_RU_SET.has(cleanWord)) {
      return true;
    }
    
    // Дополнительная проверка: если слово заканчивается на повелительные окончания
    // (и, й, ь) и имеет длину >= 4, считаем валидным
    // Это позволяет принимать русские повелительные формы, не входящие в whitelist
    if (cleanWord.length >= 4 && /[иийь]$/.test(cleanWord)) {
      // Проверяем, что это не служебное слово
      const stopWords = new Set(["это", "эта", "этот", "эти", "этот", "эта", "эти"]);
      if (!stopWords.has(cleanWord)) {
        return true;
      }
    }
  }
  
  return false;
}

/**
 * Валидация шага: проверяет, что это валидный action step
 * Язык-нейтральная проверка: поддерживает английские и русские шаги
 * Для русских шагов не требует строгого соответствия ACTION_VERBS
 */
export function isValidStep(step: string, minutes: number = 10): boolean {
  if (!step || step.trim().length === 0) return false;
  
  // Проверка длины: одна строка, лимиты зависят от времени
  // 180 для 5/10 минут, 320 для 15/20 минут
  const maxLength = minutes <= 10 ? 180 : 320;
  if (step.length > maxLength) return false;
  if (step.includes('\n')) return false;
  
  // Минимальная длина шага
  if (step.trim().length < 10) return false;
  
  // Шаг не должен быть вопросом
  if (!isNotQuestion(step)) return false;
  
  // Шаг не должен быть планом или размышлением
  if (!isNotPlanOrThink(step)) return false;
  
  // Шаг должен начинаться с повелительной формы (более мягкая проверка для русского)
  if (!startsWithImperative(step)) return false;
  
  // Шаг не должен быть explanation
  if (!isNotExplanation(step)) return false;

  // Для 15–20 минут шаг должен быть "насыщенным":
  // минимум 2 действия (через связку) + (количество ИЛИ время/процесс).
  if (minutes >= 15) {
    const s = step.toLowerCase();
    // Используем (^|\s) и (\s|$) вместо \b для работы с кириллицей и английским
    const hasLinker = /(^|\s)(и|затем|после|потом|and|then)(\s|$)/i.test(s);
    const hasQuantity =
      /\d+/.test(s) ||
      /(^|\s)(один|одна|одно|два|две|три|четыре|пять|шесть|семь|восемь|девять|десять)(\s|$)/i.test(s) ||
      /\d+\s*(пункт(а|ов)?|шаг(а|ов)?|вещ(ь|и|ей)?|строк(а|и)?|слайд(а|ов)?|подзаголов(ок|ка|ков))(\s|$)/i.test(s);

    const hasTimeOrProcess =
      /(\d+\s*мин(ут(ы)?)?|(^|\s)(в течение|пока|до тех пор|продолжай|непрерывно|постоянно)(\s|$)|(^|\s)(continue|until|while|keep)(\s|$|\b))/i.test(s);

    // Разделяем по связкам, используя пробелы для кириллицы и английского
    const parts = s.split(/(^|\s)(и|затем|после|потом|and|then)(\s|$)/i).map(p => p.trim()).filter(p => p && !/^(и|затем|после|потом|and|then)$/i.test(p));
    const hasTwoParts = parts.filter(p => p.split(/\s+/).length >= 3).length >= 2;

    if (!(hasLinker && hasTwoParts && (hasQuantity || hasTimeOrProcess))) return false;
  }
  
  return true;
}

/**
 * Проверяет, что шаг слишком короткий для выбранного времени
 */
function isTooShortForTime(step: string, minutes: number): boolean {
  if (minutes < 15) return false; // Для 5-10 минут не проверяем
  
  const s = step.toLowerCase();
  const stepLength = step.length;
  
  // Для 15-20 минут шаг должен быть достаточно насыщенным
  // Проверяем признаки короткого шага:
  // 1. Очень короткая длина (< 40 символов для 15-20 минут)
  // 2. Простые односложные действия без процесса
  // 3. Отсутствие указаний на продолжительность или процесс
  
  if (stepLength < 40) return true;
  
  // Проверяем, содержит ли шаг признаки процесса/продолжительности
  const processIndicators = [
    /в течение/i,
    /пока/i,
    /до тех пор/i,
    /продолжай/i,
    /непрерывно/i,
    /постоянно/i,
    /for \d+/i,
    /until/i,
    /while/i,
    /keep/i,
    /continue/i,
  ];
  
  const hasProcess = processIndicators.some(pattern => pattern.test(s));
  
  // Если шаг короткий и не содержит признаков процесса - слишком короткий
  if (stepLength < 60 && !hasProcess) {
    // Проверяем, не является ли это простым односложным действием
    const simpleActionPatterns = [
      /^(открой|напиши|прочитай|посмотри|создай|удали|отправь|позвони|проверь|сохрани|выбери|добавь|убери|найди|введи|вставь|скопируй|открой|закрой|включи|выключи)\s+[^,]{0,30}$/i,
      /^(open|write|read|watch|create|delete|send|call|check|save|choose|add|remove|find|enter|insert|copy|open|close|turn on|turn off)\s+[^,]{0,30}$/i,
    ];
    
    if (simpleActionPatterns.some(pattern => pattern.test(step))) {
      return true; // Слишком простое действие для 15-20 минут
    }
  }
  
  return false;
}

function isBad(step: string, minutes: number = 10) {
  const s = step.toLowerCase();
  
  // Generic/obvious steps that are not helpful
  const genericPatterns = [
    /^начни/i,
    /^сделай что-нибудь/i,
    /^поработай над/i,
    /^попробуй/i,
    /^сфокусируйся/i,
    /^сделай прогресс/i,
    /^начни работать/i,
    /^start/i,
    /^begin/i,
    /^work on/i,
    /^try to/i,
    /^focus on/i,
    /^make progress/i,
    // NOTE: do NOT ban whole categories like "study/learn/clean" here — we want specific actions.
    /^займись/i,
    /^просто/i,
    /^постарайся/i,
  ];
  
  if (genericPatterns.some(pattern => pattern.test(step))) return true;
  
  const banned = ["plan", "think", "list", "motivat", "analyze", "break down", "планируй", "думай", "список"];
  if (step.includes("\n")) return true;
  if (s.includes("phrase about") || s.includes("sentence about")) return true;
  if (banned.some((w) => s.includes(w))) return true;
  
  // Правило для "открой файл/документ/проект": запрещаем ТОЛЬКО реально пустые
  // вроде "Открой документ" / "Open the document" без конкретики.
  // Разрешаем, если есть конкретный объект (название/путь) или контекст (раздел/страница/вкладка/и далее действие).
  const openBareRu = /^открой\s+(?:файл|документ|проект)\s*$/i;
  const openBareEn = /^open\s+(?:the\s+)?(?:file|document|project)\s*$/i;
  if (openBareRu.test(step) || openBareEn.test(step)) return true;
  const openRu = /^открой\s+(?:файл|документ|проект)\b/i;
  const openEn = /^open\s+(?:the\s+)?(?:file|document|project)\b/i;
  if (openRu.test(step) || openEn.test(step)) {
    const hasSpecificity =
      /[«»"']/i.test(step) || // есть название в кавычках
      /\b(?:README|\.md|\.txt|\.docx?|\.pdf|\.pptx?|\.xlsx?|\.js|\.ts|\.py)\b/i.test(step) || // есть расширение/имя
      /\/|\\|:\//.test(step) || // есть путь
      /\b(?:раздел|глава|страниц|таблиц|приложен|вкладк|чат|письмо)\b/i.test(s) || // есть конкретный объект/контекст
      /\b(?:и|and)\b/i.test(s); // есть продолжение действия ("и ...")
    if (!hasSpecificity) return true;
  }
  
  // Проверка на слишком общие шаги без конкретного объекта
  const tooGeneric = [
    /^напиши (что-то|текст)$/i,
    /^сделай (задачу|работу)$/i,
    /^работай над (задачей|проектом)$/i,
    /^убери дом$/i,
    /^соберись$/i,
    /^clean your home$/i,
    /^work on your project$/i,
  ];
  if (tooGeneric.some(pattern => pattern.test(step))) return true;
  
  // Отдельная проверка против универсальных шаблонов (они убивают конкретику)
  // Эти фразы считаем invalid всегда.
  const universalTemplates = [
    /основн(?:ой|ая|ое)\s+(?:документ|файл)/i,
    /\bпо\s+задач[её]\b/i,
    /небольш(?:ой|ая|ое)\s+кусок/i,
    /перв(?:ый|ая|ое)\s+раздел/i,
  ];
  if (universalTemplates.some((p) => p.test(step))) return true;

  // Проверка соответствия времени: для 15-20 минут шаг не должен быть слишком коротким
  if (isTooShortForTime(step, minutes)) return true;
  
  return false;
}

export type TaskCategory = "packing" | "study_docs" | "home" | "communication" | "coding" | "general";

// Домены для Gemini/One Step протокола
export type Domain = "cooking" | "phone" | "study" | "walk" | "travel" | "work" | "home" | "other";

function normalizeForMatching(text: string): string {
  return (text ?? "")
    .toLowerCase()
    .replace(/[""«»"']/g, " ")
    .replace(/[`~!@#$%^&*()_\-+=\[\]{}\\|;:,.<>/?№]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasConcreteTokens(text: string): boolean {
  const t = normalizeForMatching(text);
  if (!t) return false;

  const stop = new Set([
    "я","мне","меня","мой","моя","моё","мои",
    "нужно","надо","следует","стоит","можно","должна","должен","должны","обязана","обязан","обязаны",
    "сделай","сделать","делать","начни","просто","попробуй",
    "по","для","в","во","на","и","а","но","это","этот","эта","эти","чтобы","сегодня","завтра","сейчас","потом",
    // универсальные шаблоны
    "общее","универсальное","шаг","шаги","задача","задачи","вещь","вещи","что-то","чтото","что то",
    "основной","основная","основное","основные","документ","файл","проект","кусок","раздел",
  ]);

  const tokens = t.split(" ").filter(Boolean).filter(w => w.length >= 4 && !stop.has(w));

  // Требуем хотя бы 1 "содержательный" токен, чтобы не пропускать "Сделай шаг"
  return tokens.length >= 1;
}

function collapseRepeatedLetters(text: string): string {
  // "пригоовить" -> "приговить", "ссуп" -> "суп"
  return (text ?? "").replace(/(.)\1+/g, "$1");
}

// ШАГ B — Anchor keywords: шаг обязан использовать слова из thought
export function extractAnchors(thought: string): string[] {
  const normalized = normalizeForMatching(thought);
  if (!normalized) return [];

  const stop = new Set([
    "я", "мне", "меня", "мой", "моя", "моё", "мои",
    "нужно", "надо", "хочу", "хотел", "хотела", "сделать", "сделай", "делать",
    // модальные/обязательность (критично для якорей)
    "должна", "должен", "должны",
    "нужно", "надо", "следует", "стоит",
    "обязана", "обязан", "обязаны",
    // частые "глагольные" якоря, которые ломают конкретику (например "Открой собрать ...")
    "собрать", "собирать", "собери", "собирай",
    "откладываю", "отложил", "отложила", "откладывать",
    "по", "для", "в", "во", "на", "и", "а", "но", "это", "этот", "эта", "эти",
    "чтобы", "просто", "пожалуйста", "сегодня", "завтра", "сейчас", "потом",
    "быстро", "срочно", "немедленно", "поскорее", "вчера", "снова", "опять",
    "уже", "еще", "ещё", "вроде", "как", "там", "тут", "очень", "немного",
    "над", "под", "из", "до", "после", "при", "без", "про",
    "нужен", "нужна", "нужно", "нужны",
    "сборка", // часто служебное слово рядом с чемоданом: якорь = "чемодан" важнее
  ]);

  const tokens = normalized
    .split(" ")
    .map((w) => w.trim())
    .filter(Boolean)
    .filter((w) => w.length >= 3)
    .filter((w) => !stop.has(w));

  if (tokens.length === 0) return [];

  // Упрощённые "информативные" сигналы: слова после предлогов и рядом с объектами
  const preps = new Set(["в", "во", "на", "про", "по", "для", "из", "с", "к", "о", "об", "обо"]);
  const objectHints = new Set([
    "документ", "файл", "отчет", "отчёт", "таблица", "презентация", "слайды",
    "чемодан", "паспорт", "билеты", "аэропорт",
    "wi-fi", "wifi", "вайфай", "телефон", "айфон", "iphone",
    "почта", "email", "e-mail", "письмо", "чат",
    // cooking objects
    "еда", "ужин", "обед", "завтрак", "суп", "кастрюля", "плита", "вода", "сковорода", "духовка", "кухня", "ингредиенты",
    "cursor", "readme", "api", "next", "git",
  ]);

  // Доменные триггеры cooking (включая частые опечатки)
  const cookingSignalRe = /(суп|рецепт|готовк|приготов|пригов|пригоов|плита|кастрюл|сковород|духовк|варк|жарк|нарез|ингредиент|кухн)/i;
  const hasCookingSignal = cookingSignalRe.test(collapseRepeatedLetters(normalized));

  const score: Record<string, number> = {};
  const bump = (w: string, v: number) => {
    const ww = (w ?? "").trim();
    if (!ww) return;
    score[ww] = (score[ww] ?? 0) + v;
  };

  for (let i = 0; i < tokens.length; i++) {
    const w = tokens[i];
    // Базовый приоритет: слабый (не хотим "первые слова" по умолчанию)
    bump(w, 1);

    // слова похожие на "технич. объекты"
    if (/[a-z]/i.test(w) || /\d/.test(w) || w.includes(".")) bump(w, 4);

    // рядом с object-hints
    if (objectHints.has(w)) bump(w, 6);
    if (objectHints.has(w) && tokens[i + 1]) bump(tokens[i + 1], 4);

    // слово после предлога
    if (preps.has(w) && tokens[i + 1]) bump(tokens[i + 1], 6);

    // cooking: если есть cooking-сигналы в мысли — отдаём приоритет cooking-объектам,
    // а не первым словам.
    if (hasCookingSignal) {
      if (/(еда|ужин|обед|завтрак|суп|кастрюл|плит|сковород|духовк|кухн|ингредиент|вода)/i.test(w)) bump(w, 8);
    }
  }

  const sorted = Array.from(new Set(tokens))
    .sort((a, b) => (score[b] ?? 0) - (score[a] ?? 0))
    .slice(0, 4);

  // Если мысль короткая — всё равно вернём максимум 2–4, но не заставляем минимум 2
  return sorted;
}

export function classifyTask(thought: string): TaskCategory {
  const t = normalizeForMatching(thought);
  if (!t) return "general";

  // Для коротких токенов типа "чат/смс/pr" используем границы по пробелам,
  // чтобы не ловить подстроки (например "НАЧАТЬ" содержит "чат").
  const padded = ` ${t} `;

  // Проверяем, не является ли это действием удаления/очистки (не communication)
  const deletionActions = /(удал|очист|стерет|выброс|убери|почист|очист|разобрать|разобрать почту|почистить почту|очистить почту|удалить сообщен|удалить письм)/i;
  const isDeletion = deletionActions.test(t);

  // Если это удаление/очистка почты/сообщений - это не communication, пропускаем дальше
  if (isDeletion && /(почт|сообщен|письм|email|e-mail)/i.test(t)) {
    // Продолжаем проверку других категорий
  } else {
    // Если есть явные коммуникационные маркеры И это НЕ удаление — это communication,
    // даже если одновременно встречаются "проект/код/git/next/..." (coding).
    // Но "преподаватель" сам по себе не означает communication - нужен контекст действия
    const communicationMarkers = /(написат|позвон|звонок|созвон|телеграм|whatsapp)/i;
    const communicationWithContext = /(написат|отправить|ответить).*(преподавател|учител|менеджер|сообщен|письм|email|e-mail)/i;
    if ((communicationMarkers.test(t) || communicationWithContext.test(t)) && !isDeletion) return "communication";
  }

  const rules: Array<[TaskCategory, RegExp]> = [
    ["packing", /(чемодан|поездк|отпуск|перел[её]т|самол[её]т|аэропорт|билет|паспорт|виза|отел|гостин)/i],
    ["study_docs", /(отч[её]т|эссе|домашк|конспект|презентац|доклад|реферат|курсов|хими|математ|физик|биолог)/i],
    ["home", /(уборк|кухн|комнат|стирк|посуд|ванн|пыл|мусор|пол|стол|раковин|шкаф)/i],
    // coding после явного communication override выше
    ["coding", /(код|баг|cursor|курс[оo]р|проект|readme|git|next|api|pull request|commit|branch|type(script)?)/i],
  ];

  for (const [cat, re] of rules) {
    if (re.test(t)) return cat;
  }

  // короткие токены (по пробельным границам)
  if (/(^|\s)чат(\s|$)/i.test(padded)) return "communication";
  if (/(^|\s)смс(\s|$)/i.test(padded)) return "communication";
  if (/(^|\s)pr(\s|$)/i.test(padded)) return "coding";

  return "general";
}

export function classifyDomain(thought: string): Domain {
  const t0 = normalizeForMatching(thought);
  const t = collapseRepeatedLetters(t0);
  if (!t) return "other";
  const padded = ` ${t} `;

  // Проверяем, не является ли это действием удаления/очистки почты
  const deletionActions = /(удал|очист|стерет|выброс|убери|почист|очист|разобрать|разобрать почту|почистить почту|очистить почту|удалить сообщен|удалить письм)/i;
  const isDeletion = deletionActions.test(t);
  const isEmailDeletion = isDeletion && /(почт|сообщен|письм|email|e-mail)/i.test(t);

  // cooking
  if (/(суп|рецепт|готовк|приготов|пригов|пригоов|плита|кастрюл|сковород|духовк|варк|жарк|нарез|ингредиент|кухн)/i.test(t)) return "cooking";
  // phone / settings / connectivity
  if (/(телефон|айфон|iphone|андроид|android|настройк|wi[\s-]?fi|вайфай|bluetooth|блютуз|приложен|смс|звонок|камера|будильник|уведомлен)/i.test(t)) return "phone";
  // study / learning / docs for school (но не очистка почты)
  if (!isEmailDeletion && /(уч[её]б|домашк|урок|лекци|конспект|экзамен|зач[её]т|реферат|эссе|доклад|презентац|курсов|лаборатор|отч[её]т)/i.test(t)) return "study";
  // walk / going outside / movement
  if (/(прогулк|погулять|выйти|парк|шаги|пробежк|бег|маршрут)/i.test(t)) return "walk";
  // travel / trip / packing / tickets
  if (/(поездк|отпуск|перел[её]т|самол[её]т|аэропорт|билет|паспорт|виза|отел|гостин|чемодан)/i.test(t)) return "travel";
  // work / professional tasks (но не очистка почты - это other или home)
  if (!isEmailDeletion && /(работ|заказчик|клиент|дедлайн|митинг|созвон|таск|jira|трелло|отч[её]т|презентац|таблиц|excel|документ|письмо|email|e-mail|проект|преподавател|учител|менеджер|начальник|коллег)/i.test(t)) return "work";
  // home chores (очистка почты может быть home, если это про организацию)
  if (/(уборк|дом|квартир|комнат|стирк|посуд|ванн|пыл|мусор|пол|стол|раковин|шкаф)/i.test(t)) return "home";

  // short tokens
  if (/(^|\s)wi[\s-]?fi(\s|$)/i.test(padded)) return "phone";
  if (/(^|\s)смс(\s|$)/i.test(padded)) return "phone";

  return "other";
}

function buildFewShot(category: TaskCategory): string {
  // 2 примера на категорию максимум, строго JSON, русский.
  const examples: Record<TaskCategory, string[]> = {
    packing: [
      `{"domain":"travel","step":"Достань чемодан, открой его на полу и за 10 минут сложи внутрь только гигиену (щётка/паста/дезодорант/косметичка), не трогая одежду.","micro_hack":"Не думай о всём чемодане — просто гигиена, это снимет давление и сопротивление.","done_check":"Ты начал — в чемодане лежит гигиена, это уже прогресс, даже если не всё собрано."}`,
      `{"domain":"travel","step":"Поставь чемодан рядом и собери в одну косметичку все мелочи для ванной (шампунь/гель/крем), затем убери косметичку в чемодан.","micro_hack":"Одна категория за раз — не думай о остальном, это уберёт тревогу.","done_check":"Косметичка собрана и лежит в чемодане — ты движешься вперёд, это главное."}`,
    ],
    study_docs: [
      `{"domain":"study","step":"Открой документ «Отчёт по химии» и создай 4 подзаголовка: «Цель», «Оборудование», «Ход работы», «Вывод».","micro_hack":"Не стремись к идеалу — просто структура и буллеты, это нормально и снимет перфекционизм.","done_check":"Ты начал — в документе есть 4 подзаголовка, это уже прогресс, даже если не всё заполнено."}`,
      `{"domain":"study","step":"Создай черновик отчёта и вставь 3 коротких подзаголовка для раздела «Ход работы», оставив «TODO» в деталях.","micro_hack":"«TODO» вместо деталей — это нормально, не думай о результате, просто начни.","done_check":"В черновике есть подзаголовки «Ход работы» и минимум 3 строки с «TODO» — ты движешься, это главное."}`,
    ],
    home: [
      `{"domain":"home","step":"Протри кухонный стол и убери с него всё лишнее в 2 коробки: «на место» и «выбросить».","micro_hack":"Не стремись к идеалу — две коробки достаточно, это снимет давление и сопротивление.","done_check":"Ты начал — стол чище, есть 2 коробки, это уже прогресс, даже если не всё идеально."}`,
      `{"domain":"home","step":"Собери с пола в комнате 15 предметов и сложи их в одну стопку у двери для разборки позже.","micro_hack":"Счёт до 15 помогает не залипать — не думай о результате, просто считай и двигайся.","done_check":"У двери стоит стопка из ~15 предметов — ты движешься вперёд, это главное."}`,
    ],
    communication: [
      `{"domain":"work","step":"Открой чат с преподавателем и набросай 2 предложения: контекст + конкретный вопрос (пока не отправляй).","micro_hack":"Не думай о том, как это звучит — просто начни с шаблона, это снимет тревогу.","done_check":"Ты начал — в черновике есть 2 предложения, это уже прогресс, даже если не идеально."}`,
      `{"domain":"work","step":"Создай черновик письма на email и заполни тему + 1 строку просьбы.","micro_hack":"Сначала тема — не думай о результате, просто начни, сопротивление пройдёт.","done_check":"Есть тема письма и одна строка текста в черновике — ты движешься, это главное."}`,
    ],
    coding: [
      `{"domain":"work","step":"Открой проект в Cursor и создай файл TODO.md с 5 буллетами следующего шага.","micro_hack":"Не думай о деталях — просто буллеты «глагол + объект», это нормально и снимет перфекционизм.","done_check":"Ты начал — в TODO.md есть минимум 5 буллетов, это уже прогресс, даже если не всё детально."}`,
      `{"domain":"work","step":"Открой файл README.md и добавь раздел «Запуск» с 2 командами: install и dev.","micro_hack":"Не придумывай с нуля — скопируй команды, это снимет напряжение и сопротивление.","done_check":"В README.md появился раздел «Запуск» с 2 командами — ты движешься вперёд, это главное."}`,
    ],
    general: [
      `{"domain":"other","step":"Открой то, с чем связан твой запрос, и выпиши 3 конкретных уточняющих слова прямо в тексте (например, «какой файл/какая страница/какая кастрюля»).","micro_hack":"Не думай о результате — просто выпиши слова, это снимет тревогу и сопротивление.","done_check":"Ты начал — в тексте появились 3 уточняющих слова, это уже прогресс, даже если не всё ясно."}`,
      `{"domain":"other","step":"Подготовь 3 вещи по теме из запроса (файл/предмет/вкладка) и положи их перед собой, чтобы следующий шаг занял меньше минуты.","micro_hack":"Подготовка окружения снижает сопротивление — не думай о задаче, просто подготовь.","done_check":"Три нужные вещи/файла открыты или лежат рядом — ты движешься, это главное."}`,
    ],
  };

  return examples[category].join("\n");
}

function buildPrompt(
  thought: string,
  minutes: number,
  category: TaskCategory,
  domain: Domain,
  anchors: string[],
  answers?: Array<{ id: string; question: string; answer: string }>,
  isRetry: boolean = false
): string {
  // Build context from answers if provided
  let answersContext = "";
  if (answers && answers.length > 0) {
    answersContext = "\n\nContext from user's answers (USE THIS to create a specific step):\n";
    answers.forEach((a) => {
      answersContext += `Q: ${a.question}\nA: ${a.answer}\n`;
    });
    answersContext += "\nIMPORTANT: Use the context from these answers to create a SPECIFIC, CONCRETE step. The step should directly address the location, blocker, or constraint mentioned in the answers.";
  }

  // Лимиты длины в зависимости от времени
  const maxLength = minutes <= 10 ? 180 : 320;

  const anchorsLine = anchors.length > 0 ? anchors.join(", ") : "";
  const anchorRequirement = anchors.length > 0
    ? `- If ANCHORS is not empty: step MUST include at least ONE anchor word (exact token).`
    : `- If ANCHORS is empty: step MUST include at least one concrete object from the topic (not "документ/файл/задача").`;

  const strictLineRule = isRetry
    ? `CRITICAL RETRY RULES:
- Output MUST be valid JSON only (no text before/after).
- Do NOT use markdown fences like \`\`\`json.
- Do NOT add trailing commas.
${anchorRequirement}
- micro_hack/done_check should include an anchor OR a clear domain object (e.g. cooking→кастрюля/плита/вода; phone→настройки/wi-fi; travel→чемодан/паспорт).`
    : `CRITICAL RULES:
- Output MUST be valid JSON only (no text before/after).
- Do NOT use markdown fences like \`\`\`json.`;

  const fewShot = buildFewShot(category);

  return `
Return ONLY valid JSON in ONE line. No commentary. No trailing text. No markdown fences.

JSON SCHEMA:
{
  "domain": "cooking|phone|study|walk|travel|work|home|other",
  "step": "string (≤${maxLength} chars, Russian, imperative verb)",
  "micro_hack": "string (Russian, one line)",
  "done_check": "string (Russian, one line)"
}

REQUIREMENTS:
- type must be "step" (implicit, no type field needed)
- if type="step": MUST include step, micro_hack, done_check (all required)
- Output MUST be single-line JSON, no line breaks
- All fields must be strings in Russian
- domain:
  - MUST be exactly one of: cooking, phone, study, walk, travel, work, home, other.
  - MUST match the user's thought topic.
- step:
  - starts with an action verb (e.g. "Открой/Напиши/Создай/Заполни/Протри/Собери/Переименуй/Отправь").
  - ONE concrete action (no философии, no мотивации, no планов).
  - MUST be directly tied to the user's thought and answers.
${anchorRequirement}
  - You MUST NOT replace anchors with abstractions like "документ/файл/проект/задача/кусок".
  - Forbidden generic templates: "основной документ/файл", "по задаче", "небольшой кусок", "первый раздел".
  - Avoid "поставь таймер", unless the user asked for timers explicitly.
- micro_hack:
  - CRITICAL: Focus on psychological state and mindset, NOT just technical tips.
  - Help the person get into the right mental state to start (reduce resistance, anxiety, perfectionism).
  - Address psychological barriers: "не думай о результате", "это нормально, что не идеально", "начни с малого", "сопротивление пройдёт".
  - Must reference objects from the topic (e.g. суп→кастрюля/вода/плита; телефон→настройки/wi-fi; отчёт→документ/таблица; отпуск→даты/билеты).
  - Should include an anchor OR a clear domain object from the topic.
  - One line, no lists.
- done_check:
  - CRITICAL: Focus on psychological validation and observable progress, NOT just technical completion.
  - Acknowledge that starting is progress: "ты начал — это уже прогресс", "даже если не идеально, ты движешься", "первый шаг сделан".
  - a concrete observable result tied to topic ("в кастрюле закипела вода", "включён wi-fi и сеть подключена", "в документе создан раздел", "куплены билеты").
  - Should include an anchor OR a clear domain object from the topic.

TASK CATEGORY: ${category}
DOMAIN (target, must match): ${domain}
ANCHORS: ${anchorsLine}

FEW-SHOT EXAMPLES (follow this style; output MUST still match the user's thought):
${fewShot}

USE CASE EXAMPLES (showing full analysis and expected output):

Use case 1 — Cooking (domain: cooking, category: general, anchors: ["ужин"]):
User: "я должна приготовить ужин"
Analysis: Recognizes modal construction ("должна"), extracts anchor "ужин", generates step with concrete physical objects (кастрюля/плита/вода).
Output: {"domain":"cooking","step":"Достань кастрюлю, налей в неё воду и поставь на плиту, чтобы начать готовить ужин.","micro_hack":"Не думай о всём ужине — просто начни с воды, это снимет давление и сопротивление.","done_check":"Ты начал — кастрюля стоит на плите, вода внутри, это уже прогресс, даже если не всё готово."}

Use case 2 — Phone settings (domain: phone, category: general, anchors: ["вайфай","айфон"]):
User: "надо настроить вайфай на айфоне"
Analysis: Recognizes technical objects (настройки/сеть), allows step through domain hints even without exact anchor match.
Output: {"domain":"phone","step":"Открой настройки на айфоне, зайди в Wi-Fi и подключись к нужной сети.","micro_hack":"Не думай о проблемах — просто открой настройки, это снимет тревогу и сопротивление.","done_check":"Ты начал — Wi-Fi включён или ты в настройках, это уже прогресс, даже если не всё настроено."}

Use case 3 — Study report (domain: study, category: study_docs, anchors: ["отчёт","химии"]):
User: "откладываю отчёт по химии"
Analysis: Removes "откладываю" as non-action word, forms step with concrete artifact (документ).
Output: {"domain":"study","step":"Открой документ отчёта по химии и создай 4 подзаголовка: цель, оборудование, ход работы, вывод.","micro_hack":"Не стремись к идеалу — просто структура, это нормально и снимет перфекционизм.","done_check":"Ты начал — в документе есть 4 подзаголовка, это уже прогресс, даже если не всё заполнено."}

Use case 4 — Travel packing (domain: travel, category: packing, anchors: ["чемодан"]):
User: "нужно собрать чемодан"
Analysis: Applies "одна категория" rule, forms step with clear ending.
Output: {"domain":"travel","step":"Достань чемодан, открой его на полу и за 10 минут сложи внутрь только гигиену.","micro_hack":"Не думай о всём чемодане — просто гигиена, это снимет давление и сопротивление.","done_check":"Ты начал — в чемодане лежит гигиена, это уже прогресс, даже если не всё собрано."}

Use case 5 — Coding work (domain: work, category: coding, anchors: ["readme"]):
User: "я прокрастинирую с README"
Analysis: Understands abstract task → transforms into artifact, avoids universal templates.
Output: {"domain":"work","step":"Открой README.md и добавь раздел \"Запуск\" с двумя командами.","micro_hack":"Не придумывай с нуля — скопируй команды, это снимет напряжение и сопротивление.","done_check":"Ты начал — в README есть раздел \"Запуск\", это уже прогресс, даже если не всё идеально."}

Use case 6 — Vague request (domain: other, category: general, anchors: []):
User: "не могу начать"
Analysis: No anchors, allows step only with concrete object, not universal template.
Output: {"domain":"other","step":"Подготовь перед собой 3 предмета, связанные с задачей (файл, вкладку или физический объект).","micro_hack":"Не думай о задаче — просто подготовь окружение, это снимет тревогу и сопротивление.","done_check":"Ты начал — три предмета готовы и лежат рядом, это уже прогресс, даже если не всё ясно."}

${answersContext}

User: "${thought}"
`.trim();
}

function validateStep(step: string, minutes: number): boolean {
  if (!step || step.trim().length === 0) return false;
  return isValidStep(step, minutes) && !isBad(step, minutes);
}

function isSingleLineText(s: string): boolean {
  return typeof s === "string" && s.trim().length > 0 && !s.includes("\n");
}

function validateTopicRelevance(text: string, anchors: string[]): boolean {
  if (!isSingleLineText(text)) return false;
  if (anchors && anchors.length > 0) return validateAnchors(text, anchors);
  return true;
}

function validateSupportTextRelevance(text: string, anchors: string[], domain: Domain): boolean {
  if (!isSingleLineText(text)) return false;
  if (!anchors || anchors.length === 0) return true;

  if (validateAnchors(text, anchors)) return true;

  const t = normalizeForMatching(text);
  const domainHints: Record<Domain, RegExp[]> = {
    cooking: [/(кастрюл|плит|вода|ингредиент|сковород|духовк|кип)/i],
    phone: [/(телефон|айфон|iphone|android|настройк|wi[\s-]?fi|вайфай|bluetooth|уведомлен|приложен)/i],
    study: [/(отч[её]т|документ|конспект|презентац|таблиц|раздел|подзаголов)/i],
    walk: [/(прогулк|маршрут|парк|шаги|выйти|кроссовк|улиц)/i],
    travel: [/(чемодан|паспорт|билет|аэропорт|виза|отел|гостин|перел[её]т)/i],
    work: [/(письмо|email|e-mail|чат|клиент|заказчик|митинг|созвон|таблиц|документ)/i],
    home: [/(уборк|комнат|кухн|стол|посуд|ванн|мусор|пыл)/i],
    other: [],
  };

  const patterns = domainHints[domain] ?? [];
  if (patterns.length === 0) return false; // если якоря есть, но домен "other" — требуем якорь
  return patterns.some((re) => re.test(t));
}

// --- NEW: relevance check that works for ANY domain/category (anchor OR strong domain/category objects) ---
export function validateTextRelevanceAnyTopic(
  text: string,
  anchors: string[],
  domain: Domain,
  category: TaskCategory
): boolean {
  if (!isSingleLineText(text)) return false;

  // 1) Best: contains an anchor
  if (anchors && anchors.length > 0 && validateAnchors(text, anchors)) return true;

  // 2) Otherwise: allow strong topical objects from domain/category (prevents "universal template" leakage)
  const t = normalizeForMatching(text);

  const domainHints: Record<Domain, RegExp[]> = {
    cooking: [/(кастрюл|плит|вода|ингредиент|сковород|духовк|нож|доск|кип|варк|жарк|нарез|соус|соль|спец)/i],
    phone: [/(телефон|айфон|iphone|android|настройк|wi[\s-]?fi|вайфай|bluetooth|камера|уведомлен|приложен|сеть|парол|перезагру)/i],
    study: [/(отч[её]т|документ|конспект|презентац|таблиц|раздел|подзаголов|черновик|лекци|экзамен|задач)/i],
    walk: [/(прогулк|маршрут|парк|шаги|выйти|кроссовк|улиц|домой)/i],
    travel: [/(чемодан|паспорт|билет|аэропорт|виза|брон|отел|гостин|перел[её]т|посадоч)/i],
    work: [/(клиент|заказчик|дедлайн|митинг|созвон|письмо|email|e-mail|чат|таблиц|документ|презентац|инвойс|счет)/i],
    home: [/(уборк|дом|квартир|комнат|кухн|стол|посуд|ванн|мусор|пыл|пол|раковин|шкаф)/i],
    other: [],
  };

  const categoryHints: Record<TaskCategory, RegExp[]> = {
    packing: [/(чемодан|паспорт|билет|аэропорт|поездк|отпуск|виза)/i],
    study_docs: [/(отч[её]т|документ|конспект|презентац|раздел|подзаголов|черновик|таблиц)/i],
    home: [/(уборк|посуд|мусор|пол|стол|шкаф|раковин|кухн)/i],
    communication: [/(сообщен|письмо|email|e-mail|чат|созвон|позвон|ответ)/i],
    coding: [/(код|cursor|git|commit|branch|pr|readme|api|next|typescript|ts|js|bug|тест)/i],
    general: [],
  };

  const hints = [...(domainHints[domain] ?? []), ...(categoryHints[category] ?? [])];

  if (hints.length > 0 && hints.some((re) => re.test(t))) return true;

  // 3) For weak domain/category (other/general) with no strong hints:
  // allow only if text still contains at least one concrete token (prevents universal templates)
  if (hints.length === 0 && (domain === "other" || category === "general") && hasConcreteTokens(text)) return true;

  return false;
}

// Импортируем общие функции из LLM модуля
// Используем расширение .ts для Node.js тестов, Next.js разрешит без расширения
import {
  callGeminiJson,
  isTruncatedJson,
  safeParseJson,
  normalizeModelResponse,
  validateResponseSchema,
  computeMaxOutputTokens,
  type GeminiResponse,
} from "../_llm/gemini.ts";

// Re-export для обратной совместимости с тестами
export { computeMaxOutputTokens, isTruncatedJson };

/**
 * Вызывает LLM с retry логикой
 * Retry при: MAX_TOKENS/LENGTH/обрезанном JSON/пустом raw
 * Schema-fix retry: если JSON валидный, но type неизвестный или обязательных полей нет
 */
async function callLLMWithRetry(
  prompt: string,
  minutes: number,
  isSchemaFix: boolean = false
): Promise<GeminiResponse | null> {
  const controller = new AbortController();
  const timeoutMs = minutes >= 15 ? 20000 : 10000;
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    let attempt = 1;
    let lastResponse: GeminiResponse | null = null;

    while (attempt <= 3) {
      const temperature = attempt > 1 || isSchemaFix ? 0.4 : 0.5;
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
      console.log(`STEP LLM CALL (attempt ${attempt}) >>>`, {
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
        console.warn(`STEP: Truncated/empty response (attempt ${attempt}), retrying`, {
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
            console.warn(`STEP: Schema validation failed (attempt ${attempt}), schema-fix retry`, {
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

export function validateAnchors(action: string, anchors: string[]): boolean {
  if (!anchors || anchors.length === 0) return true; // если якорей нет, не блокируем (но в большинстве кейсов они будут)
  const a = normalizeForMatching(action);
  if (!a) return false;

  // Match by word boundaries using normalized text (space-separated tokens).
  // This avoids false matches like "чат" inside "начать".
  const padded = ` ${a} `;
  const tokens = a.split(" ").filter(Boolean);

  return anchors.some((anchorRaw) => {
    const aw = normalizeForMatching(anchorRaw);
    if (!aw) return false;

    // Multi-token anchors: require exact phrase match by space boundaries.
    if (aw.includes(" ")) {
      return padded.includes(` ${aw} `);
    }

    // Exact token match first
    if (tokens.includes(aw)) return true;

    // RU light stemming: for longer anchors, allow matching by first 4–5 letters.
    // Example: "чемодан" should match "чемодана".
    const isRu = /^[а-яё]+$/i.test(aw);
    if (isRu && aw.length >= 6) {
      const stemLen = aw.length >= 8 ? 5 : 4;
      const stem = aw.slice(0, stemLen);
      return tokens.some((t) => t.startsWith(stem));
    }

    return false;
  });
}

// Обратная совместимость для тестов
export function parseModelJson(rawText: string): { domain: Domain; step: string; micro_hack: string; done_check: string } | null {
  const parsed = safeParseJson(rawText);
  const normalized = parsed ? normalizeModelResponse(parsed) : null;

  if (normalized && normalized.type === "step") {
    // Извлекаем domain из parsed
    const domainRaw = parsed && typeof parsed.domain === "string" ? String(parsed.domain).trim() : "";
    const domain: Domain =
      domainRaw === "cooking" ||
      domainRaw === "phone" ||
      domainRaw === "study" ||
      domainRaw === "walk" ||
      domainRaw === "travel" ||
      domainRaw === "work" ||
      domainRaw === "home" ||
      domainRaw === "other"
        ? (domainRaw as Domain)
        : "other";
    return {
      domain,
      step: normalized.step,
      micro_hack: normalized.micro_hack,
      done_check: normalized.done_check,
    };
  }

  return null;
}

function fallbackMicroHack(category: TaskCategory, anchors: string[]): string {
  const a0 = anchors?.[0] ?? "";
  const anchor = a0 ? `«${a0}»` : "";
  switch (category) {
    case "packing":
      return a0
        ? `Не думай о всём чемодане — просто гигиена для ${anchor}, это снимет давление и сопротивление.`
        : "Не думай о всём чемодане — просто гигиена, это снимет давление и сопротивление.";
    case "study_docs":
      return a0
        ? `Не стремись к идеалу в ${anchor} — просто каркас с подзаголовками, это нормально и снимет перфекционизм.`
        : "Не стремись к идеалу — просто каркас с подзаголовками, это нормально и снимет перфекционизм.";
    case "communication":
      return a0
        ? `Не думай о том, как это звучит по ${anchor} — просто набросай черновик, это снимет тревогу.`
        : "Не думай о том, как это звучит — просто набросай черновик, это снимет тревогу.";
    case "home":
      return a0
        ? `Не залипай на идеал для ${anchor} — просто считай до 10, это снимет сопротивление.`
        : "Не залипай на идеал — просто считай до 10, это снимет сопротивление.";
    case "coding":
      return a0
        ? `Не думай о результате в ${anchor} — просто добавь маленький артефакт, это снимет напряжение.`
        : "Не думай о результате — просто добавь маленький артефакт, это снимет напряжение.";
    default:
      return a0
        ? `Не стремись к идеалу по ${anchor} — просто «черновой» первый шаг, это нормально.`
        : "Не стремись к идеалу — просто «черновой» первый шаг, это нормально.";
  }
}

function fallbackDoneCheck(category: TaskCategory, anchors: string[]): string {
  const a0 = anchors?.[0] ?? "";
  const anchor = a0 ? `«${a0}»` : "";
  switch (category) {
    case "packing":
      return a0
        ? `Ты начал — в чемодане лежит гигиена для ${anchor}, это уже прогресс, даже если не всё собрано.`
        : "Ты начал — в чемодане лежит гигиена, это уже прогресс, даже если не всё собрано.";
    case "study_docs":
      return a0
        ? `Ты начал — в ${anchor} есть подзаголовки, это уже прогресс, даже если не всё заполнено.`
        : "Ты начал — в документе есть подзаголовки, это уже прогресс, даже если не всё заполнено.";
    case "communication":
      return a0
        ? `Ты начал — черновик по ${anchor} готов, это уже прогресс, даже если не идеально.`
        : "Ты начал — черновик сообщения готов, это уже прогресс, даже если не идеально.";
    case "home":
      return a0
        ? `Ты начал — ${anchor} убран или собраны предметы, это уже прогресс, даже если не всё идеально.`
        : "Ты начал — одна зона стала чище, это уже прогресс, даже если не всё идеально.";
    case "coding":
      return a0
        ? `Ты начал — в ${anchor} появился артефакт, это уже прогресс, даже если не всё готово.`
        : "Ты начал — есть один видимый артефакт, это уже прогресс, даже если не всё готово.";
    default:
      return a0
        ? `Ты начал — по ${anchor} есть один конкретный результат, это уже прогресс, даже если не всё ясно.`
        : "Ты начал — есть один конкретный результат, это уже прогресс, даже если не всё ясно.";
  }
}

// ШАГ E — Fallback: если всё сломалось
// Тематический fallback на основе ключевых слов из запроса
export function fallbackActionFromThought(thought: string, category: TaskCategory, anchors: string[], domain?: Domain): string {
  const a0 = anchors[0] ?? "";
  const a1 = anchors[1] ?? a0;
  const t = normalizeForMatching(thought);

  // Важно: fallback всегда должен содержать якорь (если он есть)
  const anchorPhrase = a0 ? `«${a0}»` : "";

  // Тематический fallback на основе domain и ключевых слов
  if (domain === "cooking" || /(суп|рецепт|готовк|приготов|пригов|пригоов|плита|кастрюл|сковород|духовк|варк|жарк|нарез|ингредиент|кухн|ужин|обед|завтрак)/i.test(t)) {
    return a0
      ? `Достань кастрюлю, налей в неё воду и поставь на плиту, чтобы начать готовить ${a0}.`
      : "Достань кастрюлю, налей в неё воду и поставь на плиту, чтобы начать готовить.";
  }

  if (domain === "phone" || /(телефон|айфон|iphone|андроид|android|настройк|wi[\s-]?fi|вайфай|bluetooth|блютуз|приложен|смс|звонок|камера|будильник|уведомлен)/i.test(t)) {
    return "Открой настройки на телефоне, зайди в Wi-Fi и подключись к нужной сети.";
  }

  if (domain === "study" || category === "study_docs" || /(отч[её]т|эссе|домашк|конспект|презентац|доклад|реферат|курсов|хими|математ|физик|биолог|уч[её]б|урок|лекци|экзамен|зач[её]т)/i.test(t)) {
    return a0
      ? `Открой документ ${anchorPhrase} и создай структуру: 4 подзаголовка и по 1 буллету под каждым.`
      : "Открой документ отчёта и создай структуру: 4 подзаголовка и по 1 буллету под каждым.";
  }

  if (domain === "travel" || category === "packing" || /(чемодан|поездк|отпуск|перел[её]т|самол[её]т|аэропорт|билет|паспорт|виза|отел|гостин)/i.test(t)) {
    return a0
      ? `Достань ${a0} (чемодан), открой его на полу и за 10 минут сложи внутрь только гигиену (щётка/паста/косметичка), не трогая одежду.`
      : "Достань чемодан, открой его на полу и за 10 минут сложи внутрь только гигиену (щётка/паста/косметичка), не трогая одежду.";
  }

  if (domain === "home" || category === "home" || /(уборк|дом|квартир|комнат|стирк|посуд|ванн|пыл|мусор|пол|стол|раковин|шкаф)/i.test(t)) {
    return a0
      ? `Убери зону ${anchorPhrase}: собери 10 предметов в одну стопку «на место».`
      : "Убери одну зону: собери 10 предметов в одну стопку «на место».";
  }

  // Проверяем, не является ли это удалением/очисткой
  const isDeletion = /(удал|очист|стерет|выброс|убери|почист|очист|разобрать|разобрать почту|почистить почту|очистить почту|удалить сообщен|удалить письм)/i.test(t);
  
  // Очистка/удаление почты - проверяем раньше communication
  if (isDeletion && /(почт|сообщен|письм|email|e-mail)/i.test(t)) {
    return "Открой почту и удали 10 старых сообщений, начиная с самых старых.";
  }

  // Coding category - проверяем раньше communication/work
  if (category === "coding" || /(код|курс[оo]р|cursor|проект|репозитор|git|next|api|readme|commit|branch|pr)/i.test(t)) {
    // Используем более подходящий anchor: предпочитаем "проект" или "cursor" над "начать"
    const codingAnchor = anchors.find(a => /(проект|cursor|код|git|readme|api)/i.test(a)) || a0 || a1;
    return codingAnchor
      ? `Открой ${codingAnchor} и создай TODO.md с 5 буллетами следующего шага.`
      : "Открой проект и создай TODO.md с 5 буллетами следующего шага.";
  }

  // Walk domain - проверяем раньше communication/work
  // Проверяем и по normalized thought, и по anchors (включая инфинитив "прогуляться")
  const walkKeywords = /(прогулк|погулять|прогуляться|выйти|парк|шаги|пробежк|бег|маршрут)/i;
  const hasWalkKeyword = walkKeywords.test(t) || anchors.some(a => walkKeywords.test(a));
  if (domain === "walk" || hasWalkKeyword) {
    return "Оденься по погоде и выйди на улицу, пройдись 5 минут в любом направлении.";
  }
  
  if ((category === "communication" || domain === "work" || /(сообщен|написат|преподавател|учител|чат|письм|email|почт)/i.test(t)) && !isDeletion) {
    return a0
      ? `Открой чат/почту про ${anchorPhrase} и набросай 2 предложения: контекст и один вопрос (не отправляй).`
      : "Открой чат/почту и набросай 2 предложения: контекст и один вопрос (не отправляй).";
  }

  // Общий fallback с якорем
  return a0
    ? `Сделай первый конкретный шаг по ${anchorPhrase}: подготовь 3 пункта/предмета для старта.`
    : "Сделай первый конкретный шаг: подготовь 3 пункта/предмета для старта.";
}

export function validateResponseRelevance(
  step: string,
  micro_hack: string,
  done_check: string,
  minutes: number,
  anchors: string[],
  domain: Domain,
  category: TaskCategory
): boolean {
  // step must be valid AND relevant by (anchor OR strong topical objects)
  if (!validateStep(step, minutes)) return false;
  if (!validateTextRelevanceAnyTopic(step, anchors, domain, category)) return false;

  // support texts: anchor OR domain/category objects
  if (!validateTextRelevanceAnyTopic(micro_hack, anchors, domain, category)) return false;
  if (!validateTextRelevanceAnyTopic(done_check, anchors, domain, category)) return false;
  return true;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const thought = String(body?.thought ?? "").trim();
    if (!thought) {
      return Response.json({
        step: FALLBACK,
        micro_hack: "",
        done_check: "",
      });
    }

    // Validate and set minutes
    const rawMinutes = body?.minutes;
    let minutes = 10; // default
    if (typeof rawMinutes === "number" && [5, 10, 15, 20].includes(rawMinutes)) {
      minutes = rawMinutes;
    }

    // Validate and parse answers array
    let answers: Array<{ id: string; question: string; answer: string }> | undefined;
    if (body?.answers && Array.isArray(body.answers)) {
      const validAnswers = body.answers
        .filter((a: unknown) => 
          a && 
          typeof a === "object" && 
          "id" in a && 
          "question" in a && 
          "answer" in a &&
          typeof (a as { id: unknown }).id === "string" && 
          typeof (a as { question: unknown }).question === "string" && 
          typeof (a as { answer: unknown }).answer === "string"
        )
        .map((a: { id: string; question: string; answer: string }) => ({
          id: String(a.id).trim(),
          question: String(a.question).trim(),
          answer: String(a.answer).trim(),
        }))
        .filter((a: { id: string; question: string; answer: string }) => a.id.length > 0 && a.question.length > 0 && a.answer.length > 0);
      
      if (validAnswers.length > 0) {
        answers = validAnswers;
      }
    }

    const category = classifyTask(thought);
    const domain = classifyDomain(thought);
    const anchors = extractAnchors(thought);
    const prompt = buildPrompt(thought, minutes, category, domain, anchors, answers, false);

    let step = "";
    let micro_hack = "";
    let done_check = "";
    let outDomain: Domain = domain;

    try {
      const response = await callLLMWithRetry(prompt, minutes);

      if (!response || !response.rawText || response.rawText.trim().length === 0) {
        console.warn("FALLBACK REASON: Empty response from Gemini", {
          thought,
          category,
          domain,
          anchors,
          finishReason: response?.finishReason,
        });
      } else {
        // Парсим и нормализуем ответ
        const parsed = safeParseJson(response.rawText);
        const normalized = parsed ? normalizeModelResponse(parsed) : null;

        if (normalized && normalized.type === "step") {
          // Проверяем валидность и релевантность
          const isValid = validateResponseRelevance(
            normalized.step,
            normalized.micro_hack,
            normalized.done_check,
            minutes,
            anchors,
            domain,
            category
          );

          if (isValid) {
            step = normalized.step;
            micro_hack = normalized.micro_hack;
            done_check = normalized.done_check;
            // Извлекаем domain из parsed, если есть
            if (parsed && typeof parsed.domain === "string") {
              const domainRaw = parsed.domain.trim();
              if (
                domainRaw === "cooking" ||
                domainRaw === "phone" ||
                domainRaw === "study" ||
                domainRaw === "walk" ||
                domainRaw === "travel" ||
                domainRaw === "work" ||
                domainRaw === "home" ||
                domainRaw === "other"
              ) {
                outDomain = domainRaw as Domain;
              }
            }
          } else {
            console.warn("FALLBACK REASON: Response validation failed", {
              thought,
              category,
              domain,
              anchors,
              step: normalized.step.substring(0, 100),
            });
          }
        } else {
          console.warn("FALLBACK REASON: Invalid or missing step in response", {
            thought,
            category,
            domain,
            anchors,
            normalizedType: normalized?.type,
            hasParsed: !!parsed,
          });
        }
      }
    } catch (error: any) {
      console.error("Error calling LLM:", error.message);
    }

    // Final fallback: если action всё ещё пустой или невалидный
    if (!step || step.length === 0 || !validateResponseRelevance(step, micro_hack, done_check, minutes, anchors, outDomain || domain, category)) {
      console.warn("FALLBACK REASON: Final validation failed, using thematic fallback", {
        thought,
        category,
        domain: outDomain || domain,
        anchors,
        stepLength: step.length,
        stepValid: step ? validateStep(step, minutes) : false,
      });
      step = fallbackActionFromThought(thought, category, anchors, outDomain || domain);
      micro_hack = fallbackMicroHack(category, anchors);
      done_check = fallbackDoneCheck(category, anchors);
      outDomain = domain;
    }

    return Response.json({
      domain: outDomain,
      step: step || FALLBACK,
      micro_hack: micro_hack || "",
      done_check: done_check || "",
    });
  } catch (e: any) {
    console.error("POST /api/step error:", e);
    // Return fallback - can't read request body again
    return Response.json({
      domain: "other",
      step: FALLBACK,
      micro_hack: "",
      done_check: "",
    });
  }
}


