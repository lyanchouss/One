import test from "node:test";
import assert from "node:assert/strict";

import {
  extractAnchors,
  classifyTask,
  classifyDomain,
  fallbackActionFromThought,
  parseModelJson,
  isValidStep,
  validateTextRelevanceAnyTopic,
  validateResponseRelevance,
  computeMaxOutputTokens,
  isTruncatedJson,
} from "../app/api/step/route.ts";
import {
  normalizeModelResponse,
  safeParseJson,
  validateResponseSchema,
  extractRawTextFromResponse,
} from "../app/api/_llm/gemini.ts";

test("anchors + category: чемодан в отпуск => packing + action contains anchor", () => {
  const thought = "я откладываю сборку чемодана в отпуск";
  const anchors = extractAnchors(thought);
  const category = classifyTask(thought);
  const domain = classifyDomain(thought);

  assert.equal(category, "packing");
  assert.equal(domain, "travel");
  assert.ok(anchors.includes("чемодана") || anchors.includes("чемодан"));

  const action = fallbackActionFromThought(thought, category, anchors, domain);
  const a = action.toLowerCase();
  assert.ok(anchors.some((w) => a.includes(w)));
  assert.ok(a.includes("чемод"));
});

test("anchors + category: отчет по химии => study_docs + action about doc/report", () => {
  const thought = "мне нужно сделать отчет по химии";
  const anchors = extractAnchors(thought);
  const category = classifyTask(thought);
  const domain = classifyDomain(thought);

  assert.equal(category, "study_docs");
  assert.equal(domain, "study");
  assert.ok(anchors.some((w) => w.includes("отчет") || w.includes("отч")));
  assert.ok(anchors.some((w) => w.includes("хими")));

  const action = fallbackActionFromThought(thought, category, anchors, domain).toLowerCase();
  assert.ok(action.includes("отч"));
  assert.ok(anchors.some((w) => action.includes(w)));
});

test("category: сообщение преподавателю => communication", () => {
  const thought = "нужно написать сообщение преподавателю";
  assert.equal(classifyTask(thought), "communication");
  assert.equal(classifyDomain(thought), "work"); // коммуникации чаще рабочие/учебные, не бытовые

  const anchors = extractAnchors(thought);
  const domain = classifyDomain(thought);
  const action = fallbackActionFromThought(thought, "communication", anchors, domain).toLowerCase();
  assert.ok(action.includes("чат") || action.includes("почт") || action.includes("сообщ"));
  assert.ok(anchors.length === 0 || anchors.some((w) => action.includes(w)));
});

test("category: убрать комнату => home", () => {
  const thought = "надо убрать комнату";
  assert.equal(classifyTask(thought), "home");
  assert.equal(classifyDomain(thought), "home");

  const anchors = extractAnchors(thought);
  const domain = classifyDomain(thought);
  const action = fallbackActionFromThought(thought, "home", anchors, domain).toLowerCase();
  assert.ok(action.includes("убер") || action.includes("зон"));
  assert.ok(anchors.length === 0 || anchors.some((w) => action.includes(w)));
});

test("category: проект в курсоре/код => coding", () => {
  const thought = "надо начать проект в курсоре/код";
  assert.equal(classifyTask(thought), "coding");
  assert.equal(classifyDomain(thought), "work");

  const anchors = extractAnchors(thought);
  const domain = classifyDomain(thought);
  const action = fallbackActionFromThought(thought, "coding", anchors, domain).toLowerCase();
  assert.ok(action.includes("cursor") || action.includes("проект") || action.includes("todo"));
  assert.ok(anchors.length === 0 || anchors.some((w) => action.includes(w)));
});

test("parseModelJson: strips ```json fences and extracts first object", () => {
  const raw = "```json\n{\"domain\":\"travel\",\"step\":\"Собери чемодан\",\"micro_hack\":\"Начни с одежды\",\"done_check\":\"В чемодане 5 вещей\"}\n```";
  const parsed = parseModelJson(raw);
  assert.ok(parsed);
  assert.equal(parsed!.domain, "travel");
  assert.equal(parsed!.step, "Собери чемодан");
  assert.equal(parsed!.micro_hack, "Начни с одежды");
  assert.equal(parsed!.done_check, "В чемодане 5 вещей");
});

test("anchors + domain: должна приготовить ужин => anchor prefers object (ужин), domain=cooking", () => {
  const thought = "я должна приготовить ужин";
  const anchors = extractAnchors(thought);
  const domain = classifyDomain(thought);
  assert.equal(domain, "cooking");
  assert.ok(anchors.includes("ужин"));
  // главное: модальные слова не должны стать якорями
  assert.ok(!anchors.includes("должна"));
});

test("domain: cooking should tolerate typos like 'пригоовить'", () => {
  const thought = "надо пригоовить ужин";
  assert.equal(classifyDomain(thought), "cooking");
  const anchors = extractAnchors(thought);
  assert.ok(anchors.includes("ужин"));
});

// Тесты для isValidStep с minutes >= 15 и новой логикой hasTimeOrProcess
test("isValidStep: 15+ минут - валидный шаг с количеством", () => {
  const step = "Открой документ отчёта и создай 5 подзаголовков для структуры";
  assert.ok(isValidStep(step, 15));
  assert.ok(isValidStep(step, 20));
});

test("isValidStep: 15+ минут - валидный шаг с временным индикатором", () => {
  const step = "Открой файл проекта и отредактируй его в течение 10 минут";
  assert.ok(isValidStep(step, 15));
  assert.ok(isValidStep(step, 20));
});

test("isValidStep: 15+ минут - валидный шаг с 'пока'", () => {
  const step = "Приготовь суп в кастрюле и пока он варится, нарежь овощи";
  assert.ok(isValidStep(step, 15));
});

test("isValidStep: 15+ минут - валидный шаг с 'continue' (в середине)", () => {
  // continue должен быть в шаге для hasTimeOrProcess, но не в начале
  const step = "Open the project file and then continue editing until you finish";
  assert.ok(isValidStep(step, 15));
});

test("isValidStep: 15+ минут - валидный шаг с 'while' (в середине)", () => {
  const step = "Create the document file and then check it while it saves";
  assert.ok(isValidStep(step, 15));
});

test("isValidStep: 15+ минут - валидный шаг с 'keep' (в середине)", () => {
  const step = "Open the document file and then keep writing until done";
  assert.ok(isValidStep(step, 15));
});

test("isValidStep: 15+ минут - валидный шаг с количеством минут", () => {
  const step = "Открой файл проекта и затем отредактируй его 20 минут";
  assert.ok(isValidStep(step, 15));
});

test("isValidStep: 15+ минут - валидный шаг с 'до тех пор'", () => {
  const step = "Собери вещи в чемодан и затем проверь их до тех пор пока не закончишь";
  assert.ok(isValidStep(step, 15));
});

test("isValidStep: 15+ минут - невалидный шаг без количества и без времени/процесса", () => {
  const step = "Открой документ и затем создай подзаголовки";
  assert.ok(!isValidStep(step, 15));
  assert.ok(!isValidStep(step, 20));
});

test("isValidStep: 15+ минут - невалидный шаг без связки", () => {
  const step = "Открой документ создай подзаголовки за 10 минут";
  assert.ok(!isValidStep(step, 15));
});

test("isValidStep: 15+ минут - невалидный шаг без двух частей", () => {
  const step = "Открой и 10 минут";
  assert.ok(!isValidStep(step, 15));
});

test("isValidStep: 15+ минут - валидный шаг с количеством И временем", () => {
  const step = "Открой документ отчёта и создай 5 подзаголовков в течение 15 минут";
  assert.ok(isValidStep(step, 15));
});

test("isValidStep: 10 минут - не требует количество/время", () => {
  const step = "Открой документ и создай подзаголовки";
  assert.ok(isValidStep(step, 10));
  assert.ok(isValidStep(step, 5));
});

test("isValidStep: 15+ минут - валидный шаг с числительными", () => {
  const step = "Открой файл проекта и затем создай три раздела для отчёта";
  assert.ok(isValidStep(step, 15));
});

test("isValidStep: 15+ минут - валидный шаг с 'после' и временем", () => {
  const step = "Приготовь ужин в кастрюле и после того как закипит, вари его 20 минут";
  assert.ok(isValidStep(step, 15));
});

test("isValidStep: 15+ минут - валидный шаг с 'потом' и процессом", () => {
  const step = "Открой проект в редакторе и потом проверь его пока не закончишь";
  assert.ok(isValidStep(step, 15));
});

// Тесты для новых модальных глаголов (должна, должен, должны, обязана, обязан, обязаны)
test("isValidStep: модальный глагол 'должна' с действием", () => {
  const step = "Должна открыть документ отчёта и создать структуру";
  assert.ok(isValidStep(step, 10));
});

test("isValidStep: модальный глагол 'должен' с действием", () => {
  const step = "Должен написать письмо клиенту и отправить его";
  assert.ok(isValidStep(step, 10));
});

test("isValidStep: модальный глагол 'должны' с действием", () => {
  const step = "Должны создать презентацию и добавить слайды";
  assert.ok(isValidStep(step, 10));
});

test("isValidStep: модальный глагол 'обязана' с действием", () => {
  const step = "Обязана проверить настройки телефона и включить wi-fi";
  assert.ok(isValidStep(step, 10));
});

test("isValidStep: модальный глагол 'обязан' с действием", () => {
  const step = "Обязан отправить отчёт и сохранить копию";
  assert.ok(isValidStep(step, 10));
});

test("isValidStep: модальный глагол 'обязаны' с действием", () => {
  const step = "Обязаны собрать чемодан и проверить документы";
  assert.ok(isValidStep(step, 10));
});

// Тесты для новых глаголов действия (cooking & common life actions)
test("isValidStep: глагол 'приготовить'", () => {
  const step = "Приготовь ужин в кастрюле и нарежь 3 овоща";
  assert.ok(isValidStep(step, 15));
});

test("isValidStep: глагол 'сварить'", () => {
  const step = "Свари суп в кастрюле и добавь 5 специй";
  assert.ok(isValidStep(step, 15));
});

test("isValidStep: глагол 'пожарить'", () => {
  const step = "Пожарь овощи на сковороде и затем добавь соус в течение 10 минут";
  assert.ok(isValidStep(step, 15));
});

test("isValidStep: глагол 'нарезать'", () => {
  const step = "Нарежь 4 овоща на доске и затем положи их в кастрюлю";
  assert.ok(isValidStep(step, 15));
});

test("isValidStep: глагол 'разогреть'", () => {
  const step = "Разогрей еду в микроволновке и затем поставь на стол в течение 5 минут";
  assert.ok(isValidStep(step, 15));
});

test("isValidStep: глагол 'помыть'", () => {
  const step = "Помой 10 тарелок в раковине и затем убери их в шкаф";
  assert.ok(isValidStep(step, 15));
});

test("isValidStep: глагол 'почистить'", () => {
  const step = "Почисти 5 овощей ножом и затем нарежь их на доске";
  assert.ok(isValidStep(step, 15));
});

test("isValidStep: глагол 'замесить'", () => {
  const step = "Замеси тесто в миске и затем оставь его на 30 минут";
  assert.ok(isValidStep(step, 15));
});

// Тесты для validateTextRelevanceAnyTopic
test("validateTextRelevanceAnyTopic: проходит с якорем", () => {
  const text = "Открой документ отчёта и создай структуру";
  const anchors = ["отчёт", "документ"];
  const domain = "study";
  const category = "study_docs";
  assert.ok(validateTextRelevanceAnyTopic(text, anchors, domain, category));
});

test("validateTextRelevanceAnyTopic: проходит с domain hint (cooking)", () => {
  const text = "Приготовь суп в кастрюле на плите";
  const anchors: string[] = [];
  const domain = "cooking";
  const category = "general";
  assert.ok(validateTextRelevanceAnyTopic(text, anchors, domain, category));
});

test("validateTextRelevanceAnyTopic: проходит с category hint (packing)", () => {
  const text = "Собери вещи в чемодан и проверь паспорт";
  const anchors: string[] = [];
  const domain = "travel";
  const category = "packing";
  assert.ok(validateTextRelevanceAnyTopic(text, anchors, domain, category));
});

test("validateTextRelevanceAnyTopic: проходит с category hint (coding)", () => {
  const text = "Открой проект в cursor и создай git commit";
  const anchors: string[] = [];
  const domain = "work";
  const category = "coding";
  assert.ok(validateTextRelevanceAnyTopic(text, anchors, domain, category));
});

test("validateTextRelevanceAnyTopic: не проходит без якоря и без domain/category hints (other/general)", () => {
  const text = "Сделай что-то общее";
  const anchors: string[] = [];
  const domain = "other";
  const category = "general";
  assert.ok(!validateTextRelevanceAnyTopic(text, anchors, domain, category));
});

test("validateTextRelevanceAnyTopic: не проходит с нерелевантным текстом", () => {
  const text = "Сделай что-то универсальное";
  const anchors: string[] = [];
  const domain = "cooking";
  const category = "general";
  assert.ok(!validateTextRelevanceAnyTopic(text, anchors, domain, category));
});

test("validateTextRelevanceAnyTopic: проходит с phone domain hint", () => {
  const text = "Настрой wi-fi на телефоне и проверь подключение";
  const anchors: string[] = [];
  const domain = "phone";
  const category = "general";
  assert.ok(validateTextRelevanceAnyTopic(text, anchors, domain, category));
});

test("validateTextRelevanceAnyTopic: проходит с home category hint", () => {
  const text = "Убери посуду со стола и помой её в раковине";
  const anchors: string[] = [];
  const domain = "home";
  const category = "home";
  assert.ok(validateTextRelevanceAnyTopic(text, anchors, domain, category));
});

test("validateTextRelevanceAnyTopic: проходит с communication category hint", () => {
  const text = "Напиши письмо на email и отправь его клиенту";
  const anchors: string[] = [];
  const domain = "work";
  const category = "communication";
  assert.ok(validateTextRelevanceAnyTopic(text, anchors, domain, category));
});

// Тесты для validateResponseRelevance с category параметром
test("validateResponseRelevance: проходит с валидным step и релевантными текстами", () => {
  const step = "Открой документ отчёта и создай 5 подзаголовков";
  const micro_hack = "Начни с структуры документа";
  const done_check = "В документе есть 5 подзаголовков";
  const minutes = 15;
  const anchors = ["отчёт", "документ"];
  const domain = "study";
  const category = "study_docs";
  assert.ok(validateResponseRelevance(step, micro_hack, done_check, minutes, anchors, domain, category));
});

test("validateResponseRelevance: проходит с domain hints без якорей", () => {
  const step = "Приготовь суп в кастрюле и затем вари его 20 минут";
  const micro_hack = "Начни с кастрюли и воды на плите";
  const done_check = "В кастрюле кипит суп";
  const minutes = 15;
  const anchors: string[] = [];
  const domain = "cooking";
  const category = "general";
  assert.ok(validateResponseRelevance(step, micro_hack, done_check, minutes, anchors, domain, category));
});

test("validateResponseRelevance: не проходит с нерелевантным step", () => {
  const step = "Сделай что-то универсальное";
  const micro_hack = "Начни с кастрюли";
  const done_check = "В кастрюле кипит суп";
  const minutes = 15;
  const anchors: string[] = [];
  const domain = "cooking";
  const category = "general";
  assert.ok(!validateResponseRelevance(step, micro_hack, done_check, minutes, anchors, domain, category));
});

test("validateResponseRelevance: не проходит с нерелевантным micro_hack", () => {
  const step = "Приготовь суп в кастрюле и затем вари его 20 минут";
  const micro_hack = "Сделай что-то общее";
  const done_check = "В кастрюле кипит суп";
  const minutes = 15;
  const anchors: string[] = [];
  const domain = "cooking";
  const category = "general";
  assert.ok(!validateResponseRelevance(step, micro_hack, done_check, minutes, anchors, domain, category));
});

test("validateResponseRelevance: не проходит с нерелевантным done_check", () => {
  const step = "Приготовь суп в кастрюле и затем вари его 20 минут";
  const micro_hack = "Начни с кастрюли и воды на плите";
  const done_check = "Сделано что-то универсальное";
  const minutes = 15;
  const anchors: string[] = [];
  const domain = "cooking";
  const category = "general";
  assert.ok(!validateResponseRelevance(step, micro_hack, done_check, minutes, anchors, domain, category));
});

test("validateResponseRelevance: проходит с category hint (packing)", () => {
  const step = "Собери 10 вещей в чемодан и затем проверь паспорт";
  const micro_hack = "Начни с чемодана на полу";
  const done_check = "В чемодане лежат вещи и паспорт";
  const minutes = 15;
  const anchors: string[] = [];
  const domain = "travel";
  const category = "packing";
  assert.ok(validateResponseRelevance(step, micro_hack, done_check, minutes, anchors, domain, category));
});

test("validateResponseRelevance: проходит с category hint (coding)", () => {
  const step = "Открой проект в cursor и создай 3 git commit";
  const micro_hack = "Начни с открытия cursor";
  const done_check = "В git есть новый commit";
  const minutes = 15;
  const anchors: string[] = [];
  const domain = "work";
  const category = "coding";
  assert.ok(validateResponseRelevance(step, micro_hack, done_check, minutes, anchors, domain, category));
});

// Тесты для проверки, что русские повелительные формы проходят валидацию
test("isValidStep: русский повелительный глагол не из whitelist должен проходить", () => {
  const step = "Приготовь ужин в кастрюле и нарежь овощи";
  assert.ok(isValidStep(step, 10));
});

test("isValidStep: русский повелительный глагол с окончанием на 'и' должен проходить", () => {
  const step = "Собери вещи в сумку и положи их на полку";
  assert.ok(isValidStep(step, 10));
});

test("isValidStep: русский повелительный глагол с окончанием на 'й' должен проходить", () => {
  const step = "Открой файл проекта и добавь туда код";
  assert.ok(isValidStep(step, 10));
});

test("isValidStep: русский повелительный глагол с окончанием на 'ь' должен проходить", () => {
  const step = "Помой посуду в раковине и убери её в шкаф";
  assert.ok(isValidStep(step, 10));
});

// Тесты для проверки тематического fallback
test("fallbackActionFromThought: cooking domain возвращает тематический шаг", () => {
  const thought = "нужно приготовить ужин";
  const category = classifyTask(thought);
  const domain = classifyDomain(thought);
  const anchors = extractAnchors(thought);
  const fallback = fallbackActionFromThought(thought, category, anchors, domain);
  
  assert.equal(domain, "cooking");
  assert.ok(fallback.includes("кастрюл") || fallback.includes("плит") || fallback.includes("готов"));
  assert.ok(!fallback.includes("документ") && !fallback.includes("файл"));
});

test("fallbackActionFromThought: phone domain возвращает тематический шаг", () => {
  const thought = "надо настроить вайфай на айфоне";
  const category = classifyTask(thought);
  const domain = classifyDomain(thought);
  const anchors = extractAnchors(thought);
  const fallback = fallbackActionFromThought(thought, category, anchors, domain);
  
  assert.equal(domain, "phone");
  assert.ok(fallback.includes("настройк") || fallback.includes("wi-fi") || fallback.includes("телефон"));
  assert.ok(!fallback.includes("документ") && !fallback.includes("файл"));
});

test("fallbackActionFromThought: study domain возвращает тематический шаг", () => {
  const thought = "откладываю отчёт по химии";
  const category = classifyTask(thought);
  const domain = classifyDomain(thought);
  const anchors = extractAnchors(thought);
  const fallback = fallbackActionFromThought(thought, category, anchors, domain);
  
  assert.equal(domain, "study");
  assert.ok(fallback.includes("документ") || fallback.includes("отчёт") || fallback.includes("подзаголов"));
  assert.ok(!fallback.includes("кастрюл") && !fallback.includes("чемодан"));
});

test("fallbackActionFromThought: travel domain возвращает тематический шаг", () => {
  const thought = "нужно собрать чемодан";
  const category = classifyTask(thought);
  const domain = classifyDomain(thought);
  const anchors = extractAnchors(thought);
  const fallback = fallbackActionFromThought(thought, category, anchors, domain);
  
  assert.equal(domain, "travel");
  assert.ok(fallback.includes("чемодан") || fallback.includes("гигиен"));
  assert.ok(!fallback.includes("документ") && !fallback.includes("кастрюл"));
});

test("fallbackActionFromThought: home domain возвращает тематический шаг", () => {
  const thought = "надо убрать комнату";
  const category = classifyTask(thought);
  const domain = classifyDomain(thought);
  const anchors = extractAnchors(thought);
  const fallback = fallbackActionFromThought(thought, category, anchors, domain);
  
  assert.equal(domain, "home");
  assert.ok(fallback.includes("убер") || fallback.includes("предмет") || fallback.includes("зон"));
  assert.ok(!fallback.includes("документ") && !fallback.includes("кастрюл"));
});

test("fallbackActionFromThought: communication category возвращает тематический шаг", () => {
  const thought = "нужно написать сообщение преподавателю";
  const category = classifyTask(thought);
  const domain = classifyDomain(thought);
  const anchors = extractAnchors(thought);
  const fallback = fallbackActionFromThought(thought, category, anchors, domain);
  
  assert.equal(category, "communication");
  assert.ok(fallback.includes("чат") || fallback.includes("почт") || fallback.includes("сообщ"));
  assert.ok(!fallback.includes("документ") && !fallback.includes("кастрюл"));
});

test("fallbackActionFromThought: coding category возвращает тематический шаг", () => {
  const thought = "надо начать проект в курсоре";
  const category = classifyTask(thought);
  const domain = classifyDomain(thought);
  const anchors = extractAnchors(thought);
  const fallback = fallbackActionFromThought(thought, category, anchors, domain);
  
  assert.equal(category, "coding");
  assert.ok(fallback.includes("проект") || fallback.includes("todo") || fallback.includes("cursor"));
  assert.ok(!fallback.includes("документ") && !fallback.includes("кастрюл"));
});

test("fallbackActionFromThought: walk domain возвращает тематический шаг", () => {
  const thought = "хочу прогуляться";
  const category = classifyTask(thought);
  const domain = classifyDomain(thought);
  const anchors = extractAnchors(thought);
  const fallback = fallbackActionFromThought(thought, category, anchors, domain);
  
  // Проверяем, что fallback содержит ключевые слова для walk, даже если domain = "other"
  assert.ok(fallback.includes("выйти") || fallback.includes("пройдись") || fallback.includes("улиц"));
  assert.ok(!fallback.includes("документ") && !fallback.includes("кастрюл"));
});

test("fallbackActionFromThought: deletion email возвращает тематический шаг", () => {
  const thought = "нужно почистить почту";
  const category = classifyTask(thought);
  const domain = classifyDomain(thought);
  const anchors = extractAnchors(thought);
  const fallback = fallbackActionFromThought(thought, category, anchors, domain);
  
  assert.ok(fallback.includes("почт") && fallback.includes("удал"));
  // Проверяем, что это не communication fallback (не содержит "набросай")
  assert.ok(!fallback.includes("набросай"));
  // "сообщ" может быть в "сообщений", что нормально для deletion
});

// Тесты для проверки, что общий fallback не возвращается для конкретных запросов
test("fallbackActionFromThought: не возвращает общий fallback для cooking", () => {
  const thought = "должна приготовить суп";
  const category = classifyTask(thought);
  const domain = classifyDomain(thought);
  const anchors = extractAnchors(thought);
  const fallback = fallbackActionFromThought(thought, category, anchors, domain);
  
  assert.ok(!fallback.includes("документ") && !fallback.includes("файл"));
  assert.ok(fallback.length > 20); // не слишком короткий
});

test("fallbackActionFromThought: не возвращает общий fallback для phone", () => {
  const thought = "надо настроить wi-fi";
  const category = classifyTask(thought);
  const domain = classifyDomain(thought);
  const anchors = extractAnchors(thought);
  const fallback = fallbackActionFromThought(thought, category, anchors, domain);
  
  assert.ok(!fallback.includes("документ") && !fallback.includes("файл"));
  assert.ok(fallback.length > 20);
});

test("fallbackActionFromThought: не возвращает общий fallback для study", () => {
  const thought = "откладываю домашку по математике";
  const category = classifyTask(thought);
  const domain = classifyDomain(thought);
  const anchors = extractAnchors(thought);
  const fallback = fallbackActionFromThought(thought, category, anchors, domain);
  
  assert.ok(!fallback.includes("кастрюл") && !fallback.includes("чемодан"));
  assert.ok(fallback.length > 20);
});

// Тесты для computeMaxOutputTokens
test("computeMaxOutputTokens: минимум 512 всегда", () => {
  assert.ok(computeMaxOutputTokens(5, 100) >= 512);
  assert.ok(computeMaxOutputTokens(10, 100) >= 512);
});

test("computeMaxOutputTokens: для 15-20 минут минимум 768", () => {
  assert.ok(computeMaxOutputTokens(15, 100) >= 768);
  assert.ok(computeMaxOutputTokens(20, 100) >= 768);
});

test("computeMaxOutputTokens: для длинных промптов добавляется +256", () => {
  const short = computeMaxOutputTokens(10, 500);
  const long = computeMaxOutputTokens(10, 1500);
  assert.ok(long >= short + 256 || long >= 768); // либо +256, либо уже 768+
});

test("computeMaxOutputTokens: верхний предел 1536", () => {
  assert.ok(computeMaxOutputTokens(20, 5000) <= 1536);
});

// Тесты для parseModelJson с обрезанным JSON
test("parseModelJson: обрезанный JSON возвращает null", () => {
  const raw = '{"type":"step","step":"Ска';
  const parsed = parseModelJson(raw);
  assert.equal(parsed, null);
});

test("parseModelJson: обрезанный JSON с незакрытой кавычкой возвращает null", () => {
  const raw = '{"type":"step","step":"Скач';
  const parsed = parseModelJson(raw);
  assert.equal(parsed, null);
});

test("parseModelJson: нормальный JSON парсится успешно", () => {
  const raw = '{"domain":"travel","step":"Собери чемодан","micro_hack":"Начни с одежды","done_check":"В чемодане 5 вещей"}';
  const parsed = parseModelJson(raw);
  assert.ok(parsed);
  assert.equal(parsed!.domain, "travel");
  assert.equal(parsed!.step, "Собери чемодан");
});

test("parseModelJson: JSON с markdown fences парсится успешно", () => {
  const raw = '```json\n{"domain":"travel","step":"Собери чемодан","micro_hack":"Начни с одежды","done_check":"В чемодане 5 вещей"}\n```';
  const parsed = parseModelJson(raw);
  assert.ok(parsed);
  assert.equal(parsed!.domain, "travel");
  assert.equal(parsed!.step, "Собери чемодан");
  assert.equal(parsed!.micro_hack, "Начни с одежды");
  assert.equal(parsed!.done_check, "В чемодане 5 вещей");
});

// Тесты для isTruncatedJson
test("isTruncatedJson: обрезанный JSON начинающийся с { но без закрывающей }", () => {
  const raw = '{"type":"step","step":"Скач';
  assert.ok(isTruncatedJson(raw));
});

test("isTruncatedJson: обрезанный JSON заканчивающийся на незакрытую кавычку", () => {
  const raw = '{"type":"step","step":"Ска';
  assert.ok(isTruncatedJson(raw));
});

test("isTruncatedJson: нормальный JSON не считается обрезанным", () => {
  const raw = '{"domain":"travel","step":"Собери чемодан","micro_hack":"Начни с одежды","done_check":"В чемодане 5 вещей"}';
  assert.ok(!isTruncatedJson(raw));
});

test("isTruncatedJson: пустая строка не считается обрезанным", () => {
  assert.ok(!isTruncatedJson(""));
  assert.ok(!isTruncatedJson("   "));
});

// Тесты для normalizeModelResponse
test("normalizeModelResponse: нормализует doneCheck -> done_check", () => {
  const json = {
    type: "step",
    step: "Открой документ",
    micro_hack: "Начни с структуры",
    doneCheck: "В документе есть разделы",
  };
  const normalized = normalizeModelResponse(json);
  assert.ok(normalized);
  assert.equal(normalized!.type, "step");
  assert.equal(normalized!.done_check, "В документе есть разделы");
});

test("normalizeModelResponse: нормализует microHack -> micro_hack", () => {
  const json = {
    type: "step",
    step: "Открой документ",
    microHack: "Начни с структуры",
    done_check: "В документе есть разделы",
  };
  const normalized = normalizeModelResponse(json);
  assert.ok(normalized);
  assert.equal(normalized!.type, "step");
  assert.equal(normalized!.micro_hack, "Начни с структуры");
});

test("normalizeModelResponse: нормализует type Step -> step", () => {
  const json = {
    type: "Step",
    step: "Открой документ",
    micro_hack: "Начни с структуры",
    done_check: "В документе есть разделы",
  };
  const normalized = normalizeModelResponse(json);
  assert.ok(normalized);
  assert.equal(normalized!.type, "step");
});

test("normalizeModelResponse: нормализует type Question -> question", () => {
  const json = {
    type: "Question",
    question: {
      id: "q1",
      text: "Какой файл?",
      options: ["файл1", "файл2"],
    },
  };
  const normalized = normalizeModelResponse(json);
  assert.ok(normalized);
  assert.equal(normalized!.type, "question");
  assert.equal(normalized!.question.id, "q1");
});

test("normalizeModelResponse: возвращает null для невалидного JSON", () => {
  const json = { type: "other" };
  const normalized = normalizeModelResponse(json);
  assert.equal(normalized, null);
});

test("normalizeModelResponse: возвращает null для отсутствующих обязательных полей", () => {
  const json = { type: "step", step: "Открой документ" };
  const normalized = normalizeModelResponse(json);
  assert.equal(normalized, null);
});

test("normalizeModelResponse: возвращает null для пустых обязательных полей", () => {
  const json = { type: "step", step: "Открой документ", micro_hack: "", done_check: "" };
  const normalized = normalizeModelResponse(json);
  assert.equal(normalized, null);
});

// Тесты для extractRawTextFromResponse
test("extractRawTextFromResponse: собирает текст из всех parts", () => {
  const response = {
    candidates: [
      {
        content: {
          parts: [
            { text: '{"type":"step","step":"Открой документ"' },
            { text: ',"micro_hack":"Начни","done_check":"Готово"}' },
          ],
        },
      },
    ],
  };
  const text = extractRawTextFromResponse(response);
  assert.equal(text, '{"type":"step","step":"Открой документ","micro_hack":"Начни","done_check":"Готово"}');
});

test("extractRawTextFromResponse: возвращает пустую строку если нет candidates", () => {
  const response = {};
  const text = extractRawTextFromResponse(response);
  assert.equal(text, "");
});

test("extractRawTextFromResponse: возвращает пустую строку если нет parts", () => {
  const response = {
    candidates: [{ content: {} }],
  };
  const text = extractRawTextFromResponse(response);
  assert.equal(text, "");
});

// Тесты для validateResponseSchema
test("validateResponseSchema: валидный step проходит", () => {
  const normalized = {
    type: "step" as const,
    step: "Открой документ",
    micro_hack: "Начни с структуры",
    done_check: "В документе есть разделы",
  };
  assert.ok(validateResponseSchema(normalized));
});

test("validateResponseSchema: валидный question проходит", () => {
  const normalized = {
    type: "question" as const,
    question: {
      id: "q1",
      text: "Какой файл?",
      options: ["файл1", "файл2"],
    },
  };
  assert.ok(validateResponseSchema(normalized));
});

test("validateResponseSchema: step без полей не проходит", () => {
  const normalized = {
    type: "step" as const,
    step: "",
    micro_hack: "Начни",
    done_check: "Готово",
  };
  assert.ok(!validateResponseSchema(normalized));
});

test("validateResponseSchema: question с одной опцией не проходит", () => {
  const normalized = {
    type: "question" as const,
    question: {
      id: "q1",
      text: "Какой файл?",
      options: ["файл1"],
    },
  };
  assert.ok(!validateResponseSchema(normalized));
});

// Тест для schema-fix retry (симуляция)
test("safeParseJson + normalizeModelResponse: валидный JSON но type='other' -> должен вернуть null", () => {
  const raw = '{"type":"other","step":"Открой документ","micro_hack":"Начни","done_check":"Готово"}';
  const parsed = safeParseJson(raw);
  assert.ok(parsed);
  const normalized = normalizeModelResponse(parsed);
  // type="other" не является валидным типом, должен вернуть null
  assert.equal(normalized, null);
});

test("safeParseJson: парсит JSON с markdown fences", () => {
  const raw = '```json\n{"type":"step","step":"Открой документ","micro_hack":"Начни","done_check":"Готово"}\n```';
  const parsed = safeParseJson(raw);
  assert.ok(parsed);
  assert.equal(parsed.type, "step");
});


