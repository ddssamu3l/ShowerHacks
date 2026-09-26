"use client";

import { useEffect, useRef, useState } from "react";
import { QUIZ_MAX_ANSWER_LENGTH, type GameState } from "@vibecodemaxxing/contracts";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

export function QuizCard({ state, onDraft, onSubmit }: {
  state: Extract<GameState, { phase: "typing" }>;
  onDraft: (text: string) => void;
  onSubmit: (text: string) => boolean;
}) {
  const question = state.quiz!;
  const [now, setNow] = useState(() => performance.now());
  const input = useRef<HTMLTextAreaElement>(null);
  const composing = useRef(false);
  useEffect(() => {
    input.current?.focus({ preventScroll: true });
    const timer = window.setInterval(() => setNow(performance.now()), 50);
    return () => clearInterval(timer);
  }, []);
  const left = Math.max(0, question.timeLimitMs - (now - state.typingStartedAtMs));
  const answer = state.quizDraft ?? "";
  const urgent = left <= 5000;

  return (
    <Card className="gap-2.5 rounded-2xl bg-prompt px-4 py-3.5 text-black ring-0 sm:px-5">
      <div className="flex items-center justify-between gap-4">
        <span className="text-xs font-semibold tracking-[0.12em] text-black/55 uppercase">Definition sprint · round {state.turnIndex + 1}/{state.turnCount}</span>
        <span className={`font-mono text-lg tabular-nums ${urgent ? "text-red-700" : "text-black"}`} role="timer" aria-label={`${Math.ceil(left / 1000)} seconds remaining`}>{(left / 1000).toFixed(1)}s</span>
      </div>
      <Progress value={100 * left / question.timeLimitMs} className="h-1 bg-black/10" indicatorClassName={urgent ? "bg-red-700 transition-none" : "bg-black transition-none"} />
      <div className="grid items-center gap-3 md:grid-cols-[minmax(170px,0.5fr)_minmax(0,1.5fr)]">
        <div className="grid gap-1.5">
          <h2 className="font-display text-[clamp(1.75rem,2.7vw,2.5rem)] font-medium leading-none tracking-[-0.04em]">{question.word}</h2>
          <p id="quiz-hint" className="max-w-sm text-xs leading-relaxed text-black/60">Define it in your own words. Meaning comes first.</p>
        </div>
        <form className="grid gap-2" onSubmit={(event) => { event.preventDefault(); if (left > 0 && answer.trim()) onSubmit(answer); }}>
          <label htmlFor="quiz-answer" className="sr-only">Your definition of {question.word}</label>
          <textarea
            ref={input} id="quiz-answer" value={answer} rows={2} maxLength={QUIZ_MAX_ANSWER_LENGTH}
            aria-describedby="quiz-hint quiz-timing" placeholder={`What does ${question.word.toLowerCase()} mean?`}
            className="h-[64px] min-h-[64px] w-full resize-none rounded-xl border border-black/15 bg-black/[0.04] px-3 py-2 text-base leading-6 text-black outline-none placeholder:text-black/40 focus:border-black/60 focus:ring-2 focus:ring-black/10 disabled:opacity-60"
            disabled={left <= 0} autoComplete="off" spellCheck={false}
            onChange={(event) => onDraft(event.target.value)}
            onPaste={(event) => event.preventDefault()} onDrop={(event) => event.preventDefault()}
            onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                if (composing.current || event.nativeEvent.isComposing || event.keyCode === 229) return;
                event.preventDefault();
                if (left > 0 && answer.trim()) onSubmit(answer);
              }
            }}
          />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p id="quiz-timing" className="text-xs text-black/55">{question.timeLimitMs / 1000}s total · auto-submits at zero</p>
            <Button type="submit" size="sm" disabled={!answer.trim() || left <= 0} className="bg-black text-white hover:bg-black/80">Submit definition ↵</Button>
          </div>
        </form>
      </div>

    </Card>
  );
}

export function QuizJudgingCard({ state, onRetry, onSkip }: {
  state: Extract<GameState, { phase: "judging" }>;
  onRetry: () => void;
  onSkip: () => void;
}) {
  return (
    <Card className="justify-center gap-2.5 rounded-2xl bg-prompt px-5 py-4 text-black ring-0">
      <p className="text-xs font-semibold tracking-[0.12em] text-black/55 uppercase">Definition sprint · {state.question.word}</p>
      <h2 className="font-display text-2xl font-medium tracking-[-0.03em]">{state.error ? "The judge needs a moment." : "Checking the meaning…"}</h2>
      <p className="text-sm text-black/60">Answer locked at {(state.durationMs / 1000).toFixed(1)}s. Judging time does not affect your score.</p>
      <p className="max-h-14 overflow-auto rounded-xl bg-black/5 px-3 py-2 text-sm">{state.submittedText}</p>
      {state.error ? (
        <div className="grid gap-3">
          <p role="alert" className="text-sm text-red-700">{state.error}</p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={onRetry} className="bg-black text-white hover:bg-black/80">Retry judging</Button>
            <Button onClick={onSkip} variant="outline" className="border-black/20 bg-transparent text-black hover:bg-black/10">Continue for 0 points</Button>
          </div>
        </div>
      ) : <p role="status" className="text-sm text-black/60">Comparing your answer with the reference definition.</p>}
    </Card>
  );
}
