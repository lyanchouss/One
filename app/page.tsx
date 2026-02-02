"use client";

import { useState, useEffect } from "react";

type Mode = "idle" | "questions" | "result";

type Question = {
  id: string;
  text: string;
  options?: string[];
};

type Answer = {
  id: string;
  question: string;
  answer: string;
};

type ClarifyResponse =
  | { type: "step"; step: string; micro_hack: string; done_check: string }
  | { type: "question"; question: { id: "q1"; text: string; options: string[] } };

export default function Home() {
  const [mode, setMode] = useState<Mode>("idle");
  const [thought, setThought] = useState("");
  const [minutes, setMinutes] = useState<number>(15);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [currentAnswer, setCurrentAnswer] = useState("");
  const [step, setStep] = useState<string>("—");
  const [microHack, setMicroHack] = useState<string>("");
  const [doneCheck, setDoneCheck] = useState<string>("");
  const [stepMinutes, setStepMinutes] = useState<number>(10);
  const [loading, setLoading] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [isTimerRunning, setIsTimerRunning] = useState(false);

  async function handleGetStep() {
    if (!thought.trim()) return;

    setLoading(true);
    try {
      // Start clarification flow
      const res = await fetch("/api/clarify/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ thought, minutes }),
      });

      if (!res.ok) {
        let errorMessage = `Server error: ${res.status}`;
        try {
          const errorData = await res.json();
          errorMessage = errorData.error || errorMessage;
        } catch {
          const errorText = await res.text();
          errorMessage = errorText || errorMessage;
        }
        throw new Error(errorMessage);
      }

      const data: ClarifyResponse = await res.json();

      if (data?.type === "step") {
        const receivedStep = data.step ?? "—";
        if (!receivedStep || receivedStep.trim() === "" || receivedStep === "—") {
          throw new Error("Шаг не получен");
        }
        setStep(receivedStep);
        setMicroHack(data.micro_hack ?? "");
        setDoneCheck(data.done_check ?? "");
        setStepMinutes(minutes);
        setMode("result");
        return;
      }

      if (data?.type === "question") {
        const q = data.question;
        if (!q || !q.text || !Array.isArray(q.options) || q.options.length < 2) {
          throw new Error("Вопрос не получен");
        }

        // Set up single-question flow
        setQuestions([{ id: q.id, text: q.text, options: q.options }]);
        setAnswers([]);
        setCurrentQuestionIndex(0);
        setCurrentAnswer("");
        setMode("questions");
        return;
      }

      throw new Error("Некорректный ответ от сервера");
    } catch (e) {
      console.error("Error starting clarification:", e);
      const errorMessage = e instanceof Error ? e.message : String(e);
      
      if (errorMessage.includes("NetworkError") || errorMessage.includes("Failed to fetch") || errorMessage.includes("network")) {
        alert(`Ошибка сети: Не удалось подключиться к серверу.\n\nПроверьте:\n1. Сервер запущен (npm run dev)\n2. Сервер доступен по адресу http://localhost:3000\n3. Нет блокировки файрволом`);
      } else {
        alert(`Не удалось начать уточнение: ${errorMessage}\n\nПроверьте:\n1. Сервер запущен\n2. Консоль браузера для деталей`);
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleNextQuestion() {
    if (!currentAnswer.trim()) return;

    const currentQuestion = questions[currentQuestionIndex];
    if (!currentQuestion) return;

    // Save answer
    const newAnswer: Answer = {
      id: currentQuestion.id,
      question: currentQuestion.text,
      answer: currentAnswer.trim(),
    };

    const newAnswers = [...answers, newAnswer];
    setAnswers(newAnswers);

    // Check if this is the last question
    if (currentQuestionIndex === questions.length - 1) {
      // Generate final step
      await generateFinalStep(newAnswers);
    } else {
      // Move to next question
      setCurrentQuestionIndex(currentQuestionIndex + 1);
      setCurrentAnswer("");
    }
  }

  async function generateFinalStep(finalAnswers: Answer[]) {
    setLoading(true);
    try {
      const res = await fetch("/api/step", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ thought, minutes, answers: finalAnswers }),
      });

      if (!res.ok) {
        let errorMessage = `Server error: ${res.status}`;
        try {
          const errorData = await res.json();
          errorMessage = errorData.error || errorMessage;
        } catch {
          const errorText = await res.text();
          errorMessage = errorText || errorMessage;
        }
        throw new Error(errorMessage);
      }

      const data = await res.json();
      const receivedStep = data.step ?? "—";

      if (!receivedStep || receivedStep.trim() === "" || receivedStep === "—") {
        throw new Error("Шаг не получен");
      }

      setStep(receivedStep);
      setMicroHack(data.micro_hack ?? "");
      setDoneCheck(data.done_check ?? "");
      setStepMinutes(minutes);
      setMode("result");
    } catch (e) {
      console.error("Error getting step:", e);
      const errorMessage = e instanceof Error ? e.message : String(e);
      
      if (errorMessage.includes("NetworkError") || errorMessage.includes("Failed to fetch") || errorMessage.includes("network")) {
        alert(`Ошибка сети: Не удалось подключиться к серверу.\n\nПроверьте:\n1. Сервер запущен (npm run dev)\n2. Сервер доступен по адресу http://localhost:3000\n3. Нет блокировки файрволом`);
      } else {
        alert(`Не удалось получить шаг: ${errorMessage}\n\nПроверьте:\n1. Сервер запущен\n2. Консоль браузера для деталей`);
      }
      
      setStep("—");
      setMicroHack("");
      setDoneCheck("");
    } finally {
      setLoading(false);
    }
  }

  async function handleSpeak() {
    if (!step || step === "—") return;

    setIsSpeaking(true);
    try {
      const textToSpeak = `Сегодня (${stepMinutes} мин): ${step}`;
      const res = await fetch("/api/voice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: textToSpeak }),
      });

      if (!res.ok) {
        const contentType = res.headers.get("content-type");
        if (contentType?.includes("application/json")) {
          const errorData = await res.json();
          const errorMessage = errorData.error || `Ошибка API голоса: ${res.status}`;
          const errorDetails = errorData.details ? `\n\nДетали: ${errorData.details}` : "";
          throw new Error(`${errorMessage}${errorDetails}`);
        } else {
          const errorText = await res.text();
          throw new Error(`Ошибка API голоса: ${res.status} - ${errorText}`);
        }
      }

      const contentType = res.headers.get("content-type");
      if (!contentType?.includes("audio")) {
        const errorText = await res.text();
        throw new Error(`Ожидалось аудио, получено ${contentType}: ${errorText}`);
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);

      if (audioUrl) URL.revokeObjectURL(audioUrl);

      setAudioUrl(url);

      const audio = new Audio(url);
      await audio.play();
    } catch (e) {
      console.error("Voice error:", e);
      const errorMessage = e instanceof Error ? e.message : String(e);
      
      if (errorMessage.includes("NetworkError") || errorMessage.includes("Failed to fetch") || errorMessage.includes("network")) {
        alert(`Ошибка сети: Не удалось подключиться к сервису голоса.\n\nПроверьте:\n1. Сервер запущен (npm run dev)\n2. Сервер доступен по адресу http://localhost:3000\n3. Нет блокировки файрволом`);
      } else {
        alert(`Не получилось озвучить шаг: ${errorMessage}\n\nПроверьте:\n1. Файл .env с ELEVENLABS_API_KEY\n2. Ключ ElevenLabs валидный\n3. Консоль браузера для деталей`);
      }
    } finally {
      setIsSpeaking(false);
    }
  }

  function handleDone() {
    setMode("idle");
    setThought("");
    setStep("—");
    setMicroHack("");
    setDoneCheck("");
    setQuestions([]);
    setAnswers([]);
    setCurrentQuestionIndex(0);
    setCurrentAnswer("");
    setStepMinutes(10);
    setIsTimerRunning(false);
    setTimeLeft(null);
  }

  useEffect(() => {
    return () => {
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
    };
  }, [audioUrl]);

  // Сброс таймера при изменении step или loading
  useEffect(() => {
    if (step === "—" || loading) {
      setIsTimerRunning(false);
      setTimeLeft(null);
    }
  }, [step, loading]);

  // Таймер обратного отсчета
  useEffect(() => {
    // Таймер запускается только когда пользователь нажал кнопку
    if (!isTimerRunning) {
      return;
    }

    // Стартуем на minutes * 60 секунд
    setTimeLeft(minutes * 60);

    // Интервал для обновления каждую секунду
    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev === null || prev <= 0) {
          return 0;
        }
        
        const newTime = prev - 1;
        
        // Когда время заканчивается
        if (newTime === 0) {
          console.log("Time is up");
          setIsTimerRunning(false);
        }
        
        return newTime;
      });
    }, 1000);

    // Очистка интервала при размонтировании или изменении зависимостей
    return () => {
      clearInterval(interval);
    };
  }, [isTimerRunning, minutes]);

  // Функция для запуска таймера
  const handleStartTimer = () => {
    setIsTimerRunning(true);
  };

  // Форматирование времени в MM:SS
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  };

  const currentQuestion = questions[currentQuestionIndex];
  const isLastQuestion = currentQuestionIndex === questions.length - 1;
  const canShowTimer = step !== "—" && !loading;
  const shouldShowTimer = canShowTimer && isTimerRunning && timeLeft !== null;

  return (
    <main className="min-h-screen flex items-center justify-center p-6 relative" style={{ background: 'linear-gradient(135deg, #E5E5E5 0%, #F0F0F0 50%, #FFFFFF 100%)' }}>
      <div className="w-full max-w-xl space-y-6 relative z-10">
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-slate-600 via-gray-600 to-slate-700 bg-clip-text text-transparent">
            One Step
          </h1>
          <p className="text-base text-[#7a6a6a]">
            Расскажи или напиши, что откладываешь — я дам тебе один маленький шаг.
          </p>
        </div>

        {mode === "idle" && (
          <>
            <textarea
              value={thought}
              onChange={(e) => setThought(e.target.value)}
              className="w-full rounded-2xl border-2 border-[#f0e0e0] bg-white/80 backdrop-blur-sm p-4 min-h-[120px] text-[#5a4a4a] placeholder:text-[#b8a8a8] focus:outline-none focus:ring-2 focus:ring-slate-400 focus:border-slate-400 transition-all shadow-sm hover:shadow-md"
              placeholder="Например: Мне нужно написать отчет..."
            />

            <div className="flex items-center gap-3">
              <span className="text-sm text-[#7a6a6a] font-medium">Время:</span>
              <div className="flex gap-2 rounded-xl bg-white/60 backdrop-blur-sm border-2 border-[#f0e0e0] p-1.5">
                {[5, 10, 15, 20].map((m) => (
                  <button
                    key={m}
                    onClick={() => setMinutes(m)}
                    className={`px-4 py-1.5 text-sm rounded-lg transition-all font-medium ${
                      minutes === m
                        ? "bg-gradient-to-r from-slate-500 to-gray-600 text-white shadow-md scale-105"
                        : "text-[#7a6a6a] hover:bg-slate-100/50"
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
              <span className="text-sm text-[#7a6a6a]">min</span>
            </div>

            <button
              onClick={handleGetStep}
              disabled={!thought.trim() || loading}
              className="w-full rounded-2xl bg-gradient-to-r from-slate-600 via-gray-600 to-slate-700 text-white p-4 font-semibold shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all transform hover:scale-[1.02] active:scale-[0.98]"
            >
              {loading ? "Думаю..." : "Получить шаг"}
            </button>
          </>
        )}

        {mode === "questions" && currentQuestion && (
          <>
            <div className="rounded-2xl border-2 border-[#f0e0e0] bg-white/80 backdrop-blur-sm p-6 space-y-5 shadow-lg">
              <div className="text-xs text-[#b8a8a8] font-medium">
                Вопрос {currentQuestionIndex + 1}/{questions.length}
              </div>
              <div className="text-xl text-[#5a4a4a] font-medium leading-relaxed">{currentQuestion.text}</div>

              {currentQuestion.options && currentQuestion.options.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {currentQuestion.options.map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => setCurrentAnswer(opt)}
                      className={`rounded-xl border-2 px-4 py-2.5 text-sm transition-all font-medium ${
                        currentAnswer === opt 
                          ? "bg-gradient-to-r from-slate-500 to-gray-600 text-white border-transparent shadow-md scale-105" 
                          : "border-[#f0e0e0] text-[#7a6a6a] hover:bg-slate-100/50 hover:border-slate-300"
                      }`}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              )}

              <input
                type="text"
                value={currentAnswer}
                onChange={(e) => setCurrentAnswer(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && currentAnswer.trim()) {
                    handleNextQuestion();
                  }
                }}
                className="w-full rounded-xl border-2 border-[#f0e0e0] bg-white/60 backdrop-blur-sm p-3.5 text-[#5a4a4a] placeholder:text-[#b8a8a8] focus:outline-none focus:ring-2 focus:ring-slate-400 focus:border-slate-400 transition-all"
                placeholder="Твой ответ..."
                autoFocus
              />
              <button
                onClick={handleNextQuestion}
                disabled={!currentAnswer.trim() || loading}
                className="w-full rounded-2xl bg-gradient-to-r from-slate-600 via-gray-600 to-slate-700 text-white p-4 font-semibold shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all transform hover:scale-[1.02] active:scale-[0.98]"
              >
                {loading ? "Генерирую шаг..." : isLastQuestion ? "Получить шаг" : "Далее"}
              </button>
            </div>
          </>
        )}

        {mode === "result" && (
          <>
            <div className="rounded-2xl border-2 border-[#f0e0e0] bg-white/80 backdrop-blur-sm p-6 shadow-lg">
              <div className="flex items-center justify-between mb-3">
                <div className="text-xs text-[#b8a8a8] font-medium">Твой следующий шаг:</div>
                {canShowTimer && (
                  <div className="flex items-center gap-3">
                    {shouldShowTimer ? (
                      <div className="text-lg font-mono font-semibold text-slate-600">
                        {formatTime(timeLeft)}
                      </div>
                    ) : (
                      <button
                        onClick={handleStartTimer}
                        className="px-4 py-2 text-sm font-medium rounded-xl bg-gradient-to-r from-slate-500 to-gray-600 text-white hover:from-slate-600 hover:to-gray-700 shadow-md transition-all"
                      >
                        Запустить таймер
                      </button>
                    )}
                  </div>
                )}
              </div>
              <div className="flex items-start justify-between gap-3 mb-4">
                <div className="text-lg text-[#5a4a4a] font-medium leading-relaxed">
                  {step !== "—" ? `Сегодня (${stepMinutes} мин): ${step}` : step}
                </div>
                <button
                  onClick={handleSpeak}
                  disabled={isSpeaking || step === "—"}
                  className="rounded-xl border-2 border-[#f0e0e0] bg-gradient-to-r from-slate-500 to-gray-600 text-white px-5 py-2.5 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:from-slate-600 hover:to-gray-700 hover:shadow-md transition-all flex-shrink-0 flex items-center justify-center min-w-[60px]"
                  title="Воспроизвести голос"
                >
                  {isSpeaking ? (
                    <div className="sound-wave text-white">
                      <span></span>
                      <span></span>
                      <span></span>
                      <span></span>
                      <span></span>
                    </div>
                  ) : (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M11 5L6 9H2v6h4l5 4V5z"></path>
                      <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
                    </svg>
                  )}
                </button>
              </div>
              {(microHack || doneCheck) && (
                <div className="mt-4 space-y-3 pt-4 border-t border-[#f0e0e0]">
                  {microHack && (
                    <div className="text-sm text-[#7a6a6a] bg-slate-50/50 rounded-xl p-3 border border-slate-200">
                      <span className="text-xs text-[#b8a8a8] font-medium block mb-1">Микро-хак:</span>
                      {microHack}
                    </div>
                  )}
                  {doneCheck && (
                    <div className="text-sm text-[#7a6a6a] bg-gray-50/50 rounded-xl p-3 border border-gray-200">
                      <span className="text-xs text-[#b8a8a8] font-medium block mb-1">Готово, когда:</span>
                      {doneCheck}
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}

        {mode !== "idle" && (
          <button
            onClick={handleDone}
            className="w-full rounded-2xl border-2 border-[#f0e0e0] bg-white/60 backdrop-blur-sm p-3.5 text-[#7a6a6a] font-medium hover:bg-slate-100/50 hover:border-slate-300 transition-all shadow-sm hover:shadow-md"
          >
            Готово
          </button>
        )}
      </div>
    </main>
  );
}
