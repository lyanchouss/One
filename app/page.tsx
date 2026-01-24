"use client";

import { useState } from "react";

export default function Home() {
  const [thought, setThought] = useState("");
  const [step, setStep] = useState<string>("—");
  const [loading, setLoading] = useState(false);

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

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-xl space-y-4">
        <h1 className="text-3xl font-semibold">One Step</h1>
        <p className="text-sm opacity-80">
          Tell or write what you're procrastinating on — I'll give you one small step for 10 minutes.
        </p>

        <textarea
          value={thought}
          onChange={(e) => setThought(e.target.value)}
          className="w-full rounded-xl border p-3 min-h-[120px]"
          placeholder="For example: I'm procrastinating on exam preparation..."
        />

        <button
          onClick={handleGetStep}
          disabled={!thought.trim() || loading}
          className="w-full rounded-xl bg-black text-white p-3 disabled:opacity-50"
        >
          {loading ? "Thinking..." : "Get one step"}
        </button>

        <div className="rounded-xl border p-4">
          <div className="text-xs opacity-70 mb-2">Your next step:</div>
          <div className="text-lg">{step}</div>
          <div className="text-xs opacity-70 mt-3">
            You can stop after this step.
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
