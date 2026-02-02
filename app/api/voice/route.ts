export async function POST(req: Request) {
  try {
    const { text } = await req.json();

    if (!text || typeof text !== "string") {
      return Response.json(
        { error: "Text is required and must be a string" },
        { status: 400 }
      );
    }

    const apiKey = process.env.ELEVENLABS_API_KEY;
    
    // Отладочное логирование (только в dev режиме)
    if (process.env.NODE_ENV === "development") {
      console.log("ELEVENLABS_API_KEY exists:", !!apiKey);
      console.log("ELEVENLABS_API_KEY length:", apiKey?.length || 0);
      console.log("ELEVENLABS_API_KEY starts with 'sk_':", apiKey?.startsWith("sk_") || false);
    }
    
    if (!apiKey || apiKey === "your_key_here" || apiKey.trim() === "") {
      console.error("ElevenLabs API key not configured. Key value:", apiKey ? `[${apiKey.length} chars]` : "undefined");
      return Response.json(
        { error: "ElevenLabs API key not configured. Please set ELEVENLABS_API_KEY in .env and restart the dev server" },
        { status: 500 }
      );
    }

    // Используем дефолтный voice_id (можно заменить на другой)
    const voiceId = "21m00Tcm4TlvDq8ikWAM";

    // Пробуем без model_id сначала (используется дефолтная модель)
    const requestBody: any = {
      text: text,
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.5,
      },
    };
    
    // Опционально: можно добавить model_id, если нужна конкретная модель
    // requestBody.model_id = "eleven_turbo_v2_5";
    
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: "POST",
      headers: {
        "Accept": "audio/mpeg",
        "Content-Type": "application/json",
        "xi-api-key": apiKey,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      let errorDetails = "";
      try {
        const errorJson = await response.json();
        errorDetails = JSON.stringify(errorJson, null, 2);
        console.error("ElevenLabs API error (JSON):", response.status, errorJson);
      } catch {
        const errorText = await response.text();
        errorDetails = errorText;
        console.error("ElevenLabs API error (text):", response.status, errorText);
      }
      
      return Response.json(
        { 
          error: `ElevenLabs API error (${response.status})`,
          details: errorDetails,
          status: response.status 
        },
        { status: response.status }
      );
    }

    const audioBuffer = await response.arrayBuffer();

    return new Response(audioBuffer, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Failed to generate audio:", error);
    return Response.json(
      { 
        error: "Failed to generate audio",
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}

