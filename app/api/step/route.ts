function isBad(step: string) {
  const s = step.toLowerCase();
  const banned = ["plan", "think", "list", "motivat", "analyze", "break down"];
  if (step.includes("\n")) return true;
  if (banned.some((w) => s.includes(w))) return true;
  if (step.length > 160) return true;
  return false;
}

export async function POST(req: Request) {
  const { thought } = await req.json();

  let step = `Today (10 minutes): open your notes and write 1 specific phrase about: "${String(thought).slice(0, 40)}..."`;

  if (isBad(step)) {
    step = "Today (10 minutes): open the document and write a heading.";
  }

  return Response.json({ step });
}

