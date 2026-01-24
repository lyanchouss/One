export async function POST(req: Request) {
  const { text } = await req.json();

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey || apiKey === "your_key_here") {
    return Response.json({ error: "ElevenLabs API key not configured" }, { status: 500 });
  }

  // Используем дефолтный voice_id (можно заменить на другой)
  const voiceId = "21m00Tcm4TlvDq8ikWAM";

  try {
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: "POST",
      headers: {
        "Accept": "audio/mpeg",
        "Content-Type": "application/json",
        "xi-api-key": apiKey,
      },
      body: JSON.stringify({
        text: text,
        model_id: "eleven_monolingual_v1",
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.5,
        },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      return Response.json({ error: "ElevenLabs API error" }, { status: 500 });
    }

    const audioBuffer = await response.arrayBuffer();

    return new Response(audioBuffer, {
      headers: {
        "Content-Type": "audio/mpeg",
      },
    });
  } catch (error) {
    return Response.json({ error: "Failed to generate audio" }, { status: 500 });
  }
}

