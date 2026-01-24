Отлично. Ниже — пошагово, как будто мы вместе собираем проект в Cursor. Я буду писать **что сделать → зачем → что должно получиться**.

Будем делать **Next.js (всё в одном) + Tailwind + 2 API (step и voice)**.

---

# Шаг 0. Проверь, что готово

**Нужно:**

* установлен **Node.js** (лучше LTS)
* Cursor открыт в пустой папке проекта

**Как понять, что Node есть:**
Открой терминал в Cursor (обычно снизу) и введи:

```bash
node -v
npm -v
```

Если показывает версии — всё ок.

---

# Шаг 1. Создай Next.js проект

В терминале Cursor (внутри твоей папки) введи:

```bash
npx create-next-app@latest .
```

> Почему с точкой `.`?
> Чтобы проект создался **в текущей папке**, которую ты уже открыла.

Когда появятся вопросы — выбирай так:

* **TypeScript?** → `Yes`
  (меньше багов, Cursor лучше подсказывает)
* **ESLint?** → `No`
  (чтобы не ругался и не мешал новичку)
* **Tailwind CSS?** → `Yes`
  (быстро сделать красивый интерфейс)
* **`src/` directory?** → `No`
  (проще структура)
* **App Router?** → `Yes`
  (современный Next)
* **Turbopack?** → `No` или `Yes` (не критично)
  (если сомневаешься — `No`)

✅ **Что должно получиться:**
В папке появятся файлы `app/`, `package.json`, `next.config.*` и т.д.

---

# Шаг 2. Запусти проект

В терминале:

```bash
npm run dev
```

Открой в браузере:
`http://localhost:3000`

✅ **Что должно получиться:**
Страница Next.js “Welcome”.

> Зачем этот шаг?
> Мы проверяем, что всё запускается ДО того, как писать код.

---

# Шаг 3. Сделай простую страницу (наш 1 экран)

Открой файл:

`app/page.tsx`

Полностью замени содержимое на такой минимальный интерфейс:

```tsx
export default function Home() {
  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-xl space-y-4">
        <h1 className="text-3xl font-semibold">One Step</h1>
        <p className="text-sm opacity-80">
          Скажи или напиши, что ты откладываешь — я дам один маленький шаг на 10 минут.
        </p>

        <textarea
          className="w-full rounded-xl border p-3 min-h-[120px]"
          placeholder="Например: Я откладываю подготовку к экзамену..."
        />

        <button className="w-full rounded-xl bg-black text-white p-3">
          Получить один шаг
        </button>

        <div className="rounded-xl border p-4">
          <div className="text-xs opacity-70 mb-2">Твой следующий шаг:</div>
          <div className="text-lg">—</div>
          <div className="text-xs opacity-70 mt-3">
            Ты можешь остановиться после этого шага.
          </div>
        </div>

        <button className="w-full rounded-xl border p-3">Done</button>
      </div>
    </main>
  );
}
```

✅ **Что должно получиться:**
Красивая простая страница с полем ввода и кнопками.

> Зачем?
> Сначала делаем “скелет”, чтобы видеть продукт глазами. AI подключим потом.

---

# Шаг 4. Добавь состояние (чтобы текст “жил”)

Теперь сделаем, чтобы:

* текст из textarea сохранялся
* кнопка “Получить шаг” потом будет вызывать API
* шаг показывался в карточке

Заменяй `app/page.tsx` на это:

```tsx
"use client";

import { useState } from "react";

export default function Home() {
  const [thought, setThought] = useState("");
  const [step, setStep] = useState<string>("—");
  const [loading, setLoading] = useState(false);

  async function handleGetStep() {
    setLoading(true);
    try {
      // пока просто заглушка
      setStep("Сегодня (10 минут): открой документ и напиши заголовок.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-xl space-y-4">
        <h1 className="text-3xl font-semibold">One Step</h1>
        <p className="text-sm opacity-80">
          Скажи или напиши, что ты откладываешь — я дам один маленький шаг на 10 минут.
        </p>

        <textarea
          value={thought}
          onChange={(e) => setThought(e.target.value)}
          className="w-full rounded-xl border p-3 min-h-[120px]"
          placeholder="Например: Я откладываю подготовку к экзамену..."
        />

        <button
          onClick={handleGetStep}
          disabled={!thought.trim() || loading}
          className="w-full rounded-xl bg-black text-white p-3 disabled:opacity-50"
        >
          {loading ? "Думаю..." : "Получить один шаг"}
        </button>

        <div className="rounded-xl border p-4">
          <div className="text-xs opacity-70 mb-2">Твой следующий шаг:</div>
          <div className="text-lg">{step}</div>
          <div className="text-xs opacity-70 mt-3">
            Ты можешь остановиться после этого шага.
          </div>
        </div>

        <button
          onClick={() => {
            setThought("");
            setStep("—");
          }}
          className="w-full rounded-xl border p-3"
        >
          Done
        </button>
      </div>
    </main>
  );
}
```

✅ **Что должно получиться:**

* кнопка активна только когда есть текст
* шаг появляется (пока заглушка)
* Done очищает

> Зачем?
> Мы убедились, что UI и логика работают ещё до AI. Это ускоряет.

---

# Шаг 5. Добавь секреты (ключи) безопасно

Нам нужны ключи для:

* LLM (для генерации шага)
* ElevenLabs (для озвучки)

Создай файл в корне проекта:
**`.env.local`**

И добавь туда (пока пустые значения):

```env
LLM_API_KEY=your_key_here
ELEVENLABS_API_KEY=your_key_here
```

✅ **Что должно получиться:**
`.env.local` лежит рядом с `package.json`.

> Зачем?
> Ключи нельзя держать в коде фронта. Next.js API routes будет обращаться к ним безопасно.

---

# Шаг 6. Сделай API: /api/step (пока заглушка)

Создай папки и файл:

`app/api/step/route.ts`

Вставь:

```ts
export async function POST(req: Request) {
  const { thought } = await req.json();

  // Заглушка на старте:
  const step = `Сегодня (10 минут): открой заметки и запиши 1 конкретную фразу про: "${String(thought).slice(0, 40)}..."`;

  return Response.json({ step });
}
```

✅ **Что должно получиться:**
У нас появился backend-эндпоинт.

> Зачем?
> Даже если ты новичок — это самый простой способ иметь “сервер” без Express.

---

# Шаг 7. Подключи API к кнопке

Вернись в `app/page.tsx` и в `handleGetStep()` замени заглушку на реальный вызов:

```ts
async function handleGetStep() {
  setLoading(true);
  try {
    const res = await fetch("/api/step", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ thought }),
    });

    const data = await res.json();
    setStep(data.step ?? "—");
  } finally {
    setLoading(false);
  }
}
```

✅ **Что должно получиться:**
Ты вводишь мысль → нажимаешь → получаешь шаг (пока простой, но уже через API).

> Зачем?
> Теперь у нас правильная архитектура: UI → API → ответ.
> Позже мы просто заменим “заглушку” на настоящую генерацию.

---

# Шаг 8. Добавь “реальную выполнимость шага” (валидатор)

Это важнейшая фишка проекта: шаг должен быть реально выполним.

В `app/api/step/route.ts` добавь простую проверку:

```ts
function isBad(step: string) {
  const s = step.toLowerCase();
  const banned = ["план", "подум", "спис", "мотива", "разбер", "проанализ"];
  if (step.includes("\n")) return true;
  if (banned.some((w) => s.includes(w))) return true;
  if (step.length > 160) return true;
  return false;
}
```

И перед возвратом:

```ts
let step = `Сегодня (10 минут): открой заметки и запиши 1 конкретную фразу про: "${String(thought).slice(0, 40)}..."`;

if (isBad(step)) {
  step = "Сегодня (10 минут): открой документ и напиши заголовок.";
}
```

✅ **Что должно получиться:**
Шаг всегда короткий и без “планов/списков”.

> Зачем?
> Это и есть “не ChatGPT”: мы выдаём именно действие, а не размышления.

---

# Шаг 9. Добавим голос (ElevenLabs) — после того как текст стабилен

Сначала мы убедились, что текстовый шаг работает.

Дальше:

* создадим `app/api/voice/route.ts`
* будем получать аудио по тексту шага
* проигрывать в браузере

⚠️ Важно: я НЕ буду сейчас заставлять тебя писать сложный код, пока не подтверждено, что шаги тебе нравятся.

---

## Мини-итог: где ты окажешься после этих шагов

У тебя будет:

* веб-страница (UI)
* ввод мысли
* запрос к API
* получение одного шага
* первые правила выполнимости

Это уже **MVP**, который можно показать.

---

## Чтобы продолжить идеально

Сейчас логичный следующий шаг — **подключить реальную генерацию шага через LLM** (и сделать шаг “10/10”), а потом **озвучку ElevenLabs**.

Если ты скажешь, на каком шаге ты сейчас (1–8), я дам следующий блок **точно под твой прогресс** — без повторов и без путаницы.
