import { judgeDefinition, QuizJudgeError } from "../../../../lib/server/quiz-judge";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return Response.json({ error: { code: "invalid_origin", message: "Use the quiz from this game." } }, { status: 403 });
  try {
    if (Number(request.headers.get("content-length")) > 8192) throw new QuizJudgeError("invalid_answer", "Answer is too long.", 400);
    const raw = await request.text();
    if (raw.length > 8192) throw new QuizJudgeError("invalid_answer", "Answer is too long.", 400);
    let input: unknown;
    try { input = JSON.parse(raw); } catch { throw new QuizJudgeError("invalid_answer", "Invalid answer format.", 400); }
    const judgment = await judgeDefinition(input);
    return Response.json(judgment, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const known = error instanceof QuizJudgeError;
    return Response.json({ error: { code: known ? error.code : "judge_unavailable", message: known ? error.message : "The judge is unavailable. Please retry." } }, { status: known ? error.status : 503 });
  }
}
