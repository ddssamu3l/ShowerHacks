"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { TYPING_SCORING, type GameState, type KeystrokeEvent } from "@vibecodemaxxing/contracts";
import { timeLimitMs } from "@vibecodemaxxing/game-engine";
import { activityForTurn, activityLabel } from "../design/activity";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { PointPops, type Pop } from "../fx/PointPop";
import { useTimers } from "../fx/useTimers";

import { QuizCard, QuizJudgingCard } from "./QuizCard";

const ease = [0.23, 1, 0.32, 1] as const;

function useNow(active: boolean) {
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    if (!active) return;
    let raf = 0;
    const loop = () => {
      setNow(performance.now());
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [active]);
  return now;
}

function Enter({ children }: { children: ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, transform: "translateY(8px)" }}
      animate={{ opacity: 1, transform: "translateY(0px)" }}
      transition={{ duration: 0.2, ease }}
    >
      {children}
    </motion.div>
  );
}

function streakOf(target: string[], typed: string[], complete: boolean) {
  const finished = complete ? typed.length : typed.length - 1;
  let streak = 0;
  for (let index = finished - 1; index >= 0; index--) {
    if (typed[index] !== target[index]) break;
    streak += 1;
  }
  return streak;
}

type Submit = (text: string, keystrokes: KeystrokeEvent[]) => boolean;

function TypingCard({ state, go, onSubmit }: { state: Extract<GameState, { phase: "typing" }>; go: boolean; onSubmit: Submit }) {
  const [draft, setDraft] = useState("");
  const keystrokes = useRef<KeystrokeEvent[]>([]);
  const [pops, setPops] = useState<Record<number, Pop[]>>({});
  const [shakes, setShakes] = useState<Record<number, number>>({});
  const settled = useRef(new Set<number>());
  const popId = useRef(0);
  const { later } = useTimers();
  const now = useNow(true);

  const target = state.targetPrompt;
  const targetWords = useMemo(() => target.split(" "), [target]);
  const typedWords = draft.split(" ");
  const complete = draft === target;
  const length = Array.from(target).length;

  const settle = (index: number, right: boolean) => {
    if (settled.current.has(index)) return;
    settled.current.add(index);
    if (!right) {
      setShakes((current) => ({ ...current, [index]: (current[index] ?? 0) + 1 }));
      return;
    }
    const share = Math.max(1, Math.round((100 * (Array.from(targetWords[index]).length + 1)) / length));
    const id = ++popId.current;
    setPops((current) => ({ ...current, [index]: [...(current[index] ?? []), { id, text: `+${share}` }] }));
    later(() => {
      setPops((current) => ({ ...current, [index]: (current[index] ?? []).filter((pop) => pop.id !== id) }));
    }, 650);
  };

  const changeDraft = (next: string) => {
    setDraft(next);
    const words = next.split(" ");
    const finished = next === target ? words.length : words.length - 1;
    for (let index = 0; index < Math.min(finished, targetWords.length); index++) {
      settle(index, words[index] === targetWords[index]);
    }
  };

  const streak = streakOf(targetWords, typedWords, complete);
  const seconds = Math.max(0, (now - state.typingStartedAtMs) / 1000);
  const limit = timeLimitMs(length) / 1000;
  const par = limit / TYPING_SCORING.timeLimitFactor;
  const speedLeft = Math.max(0, 1 - seconds / limit);
  const heat = seconds <= par ? "bg-black/[0.06] text-black" : seconds <= limit * 0.66 ? "bg-heat text-black" : "bg-miss text-white";
  const activeWord = typedWords.length - 1;

  return (
    <Card className="on-inverse relative gap-2 overflow-visible rounded-2xl bg-prompt px-4 py-3.5 text-black ring-0">
      <form
        className="grid gap-2.5"
        onSubmit={(event) => {
          event.preventDefault();
          if (draft.length > 0) onSubmit(draft, keystrokes.current);
        }}
      >
        <div className="flex items-center justify-between gap-3">
          <span className="text-[13px] font-medium text-black/60">
            Prompt {state.turnIndex + 1} of {state.turnCount}
          </span>
          <div className="flex items-center gap-2">
            <AnimatePresence>
              {streak >= 2 && (
                <motion.span
                  key={streak}
                  className="rounded-full bg-black px-3 py-1 text-[13px] font-semibold text-white tabular-nums"
                  initial={{ opacity: 0, transform: "scale(0.85)" }}
                  animate={{ opacity: 1, transform: "scale(1)" }}
                  exit={{ opacity: 0, transform: "scale(0.95)" }}
                  transition={{ type: "spring", duration: 0.35, bounce: 0.4 }}
                >
                  ×{streak} streak
                </motion.span>
              )}
            </AnimatePresence>
            <span className={cn("rounded-full px-3 py-1 font-mono text-base tabular-nums transition-colors duration-300", heat)}>
              {seconds.toFixed(1)}s
            </span>
          </div>
        </div>

        <Progress
          value={speedLeft * 100}
          aria-label="Speed points left"
          className="h-1 bg-black/10"
          indicatorClassName={cn("transition-none", speedLeft > 0.34 ? "bg-black" : "bg-miss")}
        />

        <p className="font-mono text-[clamp(16px,1.35vw,20px)] leading-[1.45] break-words" aria-label={target}>
          {targetWords.map((word, wordIndex) => {
            const typed = Array.from(typedWords[wordIndex] ?? "");
            const letters = Array.from(word);
            const typedWord = wordIndex < typedWords.length;
            return (
              <span key={wordIndex}>
                <span
                  key={shakes[wordIndex] ?? 0}
                  className={cn("relative inline-block", shakes[wordIndex] && "animate-[shake_320ms_var(--ease-out)]")}
                >
                  <PointPops pops={pops[wordIndex] ?? []} className="rounded-full bg-black px-1.5 py-0.5 font-sans text-xs leading-none text-white" />
                  {letters.map((char, index) => {
                    const charState = !typedWord || index >= typed.length ? "pending" : typed[index] === char ? "right" : "wrong";
                    const caret = wordIndex === activeWord && index === typed.length;
                    return (
                      <span key={index} className={`char char-${charState}`} data-caret={caret || undefined}>
                        {char}
                      </span>
                    );
                  })}
                  {typed.slice(letters.length).map((char, index) => (
                    <span key={`extra-${index}`} className="char char-wrong">
                      {char}
                    </span>
                  ))}
                  {wordIndex === activeWord && typed.length >= letters.length && <span className="char char-end" data-caret />}
                </span>
                {wordIndex < targetWords.length - 1 && <span className="char char-pending"> </span>}
              </span>
            );
          })}
        </p>

        <Input
          value={draft}
          autoFocus
          spellCheck={false}
          autoComplete="off"
          aria-label="Type the prompt, then press Enter"
          placeholder="Type the prompt above, then press Enter"
          className="h-10 rounded-[10px] border-black/10 bg-black/[0.04] px-3.5 font-mono text-[15px] text-black placeholder:text-black/55 focus-visible:border-black/50 focus-visible:ring-black/10 dark:bg-black/[0.04]"
          onChange={(event) => changeDraft(event.target.value)}
          onPaste={(event) => event.preventDefault()}
          onDrop={(event) => event.preventDefault()}
          onKeyDown={(event) => {
            if (event.key === "Enter" && event.nativeEvent.isComposing) event.preventDefault();
            if (event.key === "Backspace" || (event.key.length === 1 && !event.metaKey && !event.ctrlKey)) {
              keystrokes.current.push({ key: event.key, atMs: performance.now() - state.typingStartedAtMs });
            }
          }}
        />
      </form>

      <AnimatePresence>
        {go && (
          <motion.p
            className="pointer-events-none absolute inset-0 grid place-items-center rounded-2xl bg-prompt/85 font-display text-5xl font-semibold tracking-[-0.05em] text-black"
            initial={{ opacity: 0, transform: "scale(1.25)" }}
            animate={{ opacity: 1, transform: "scale(1)" }}
            exit={{ opacity: 0, transform: "scale(0.96)" }}
            transition={{ duration: 0.25, ease }}
            aria-hidden
          >
            GO!
          </motion.p>
        )}
      </AnimatePresence>
    </Card>
  );
}

function AgentCard({ state }: { state: Extract<GameState, { phase: "agent" }> }) {
  const now = useNow(true);
  const total = state.agentEndsAtMs - state.agentStartedAtMs;
  const left = Math.max(0, state.agentEndsAtMs - now);

  return (
    <Card className="gap-2 rounded-2xl px-4 py-3 ring-signal/40">
      <div className="flex items-baseline justify-between">
        <span className="text-[13px] font-medium text-signal">Agent is working. {activityLabel[activityForTurn(state.turnIndex)].verb}</span>
        <span className="font-mono text-lg text-signal tabular-nums">{(left / 1000).toFixed(1)}s</span>
      </div>
      <Progress value={100 * (1 - left / total)} className="h-1.5" indicatorClassName="bg-signal transition-none" />
      {state.typingResult.definitionQuiz && (
        <div className="grid gap-1 rounded-xl bg-accent p-3 text-sm">
          <p className="font-medium">{state.typingResult.definitionQuiz.question.word} · {Math.round(state.typingResult.accuracy * 100)}% meaning match</p>
          <p className="text-muted-foreground">{state.typingResult.definitionQuiz.feedback}</p>
          {state.typingResult.definitionQuiz.definition && (
            <details className="text-xs text-muted-foreground">
              <summary className="cursor-pointer py-1">Reference definition</summary>
              <p className="pt-1">{state.typingResult.definitionQuiz.definition}</p>
            </details>
          )}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <motion.span
          className="rounded-full bg-foreground px-3 py-1 text-sm font-semibold text-black tabular-nums"
          initial={{ opacity: 0, transform: "scale(0.85)" }}
          animate={{ opacity: 1, transform: "scale(1)" }}
          transition={{ type: "spring", duration: 0.45, bounce: 0.4 }}
        >
          +{Math.round(state.typingResult.score)} {state.typingResult.definitionQuiz ? "definition" : "typing"}
        </motion.span>
        <p className="text-sm text-muted-foreground">
          {state.typingResult.notes.join(" · ")}. The next prompt appears when the agent finishes.
        </p>
      </div>
    </Card>
  );
}

interface PromptDockProps {
  state: GameState;
  countdown: number | null;
  go: boolean;
  onStart: () => void;
  onSubmit: Submit;
  onQuizDraft: (text: string) => void;
  onRetryQuiz: () => void;
  onSkipQuiz: () => void;
}

function PromptDockContent({ state, countdown, go, onStart, onSubmit, onQuizDraft, onRetryQuiz, onSkipQuiz }: PromptDockProps) {
  if (state.phase === "ready") {
    if (countdown !== null) {
      return (
        <Card className="min-h-[92px] justify-center rounded-2xl bg-prompt text-black ring-0">
          <motion.p
            key={countdown}
            className="text-center font-display text-5xl font-semibold tracking-[-0.05em] tabular-nums"
            initial={{ opacity: 0, transform: "scale(1.4)" }}
            animate={{ opacity: 1, transform: "scale(1)" }}
            transition={{ type: "spring", duration: 0.4, bounce: 0.35 }}
            aria-live="assertive"
          >
            {countdown}
          </motion.p>
        </Card>
      );
    }
    return (
      <Card className="min-h-[92px] justify-center gap-2 rounded-2xl px-4 py-3">
        <div className="flex items-center justify-between gap-6">
          <div className="grid gap-1">
            <p className="font-display text-2xl font-medium tracking-[-0.03em]">Ready, {state.nickname}?</p>
            <p className="text-sm text-muted-foreground">
              {state.turnCount} rounds, mixing definitions and typing. Each clock starts when the round appears.
            </p>
          </div>
          <Button size="lg" onClick={onStart}>
            Start
          </Button>
        </div>
      </Card>
    );
  }

  if (state.phase === "judging") return <QuizJudgingCard state={state} onRetry={onRetryQuiz} onSkip={onSkipQuiz} />;
  if (state.phase === "typing" && state.quiz) return <QuizCard key={state.turnId} state={state} onDraft={onQuizDraft} onSubmit={(text) => onSubmit(text, [])} />;
  if (state.phase === "typing") {
    return (
      <Enter key={`typing-${state.turnId}`}>
        <TypingCard key={state.turnId} state={state} go={go} onSubmit={onSubmit} />
      </Enter>
    );
  }

  if (state.phase === "agent") {
    return (
      <Enter key={`agent-${state.turnId}`}>
        <AgentCard state={state} />
      </Enter>
    );
  }

  return (
    <Card className="gap-2 rounded-2xl px-4 py-3">
      <p className="font-display text-2xl font-medium tracking-[-0.03em]">Run finished. Adding up your score.</p>
    </Card>
  );
}

/** The incoming card mounts immediately: transitions never extend the answer timer. */
export function PromptDock(props: PromptDockProps) {
  const reduce = useReducedMotion();
  const state = props.state;
  const key = state.phase === "typing" ? `${state.quiz ? "quiz" : "typing"}-${state.turnId}` : state.phase;
  return (
    <motion.div layout={!reduce} transition={{ duration: reduce ? 0 : 0.22, ease }} className="relative">
      <AnimatePresence initial={false} mode="popLayout">
        <motion.div key={key} initial={{ opacity: 0, y: reduce ? 0 : 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: reduce ? 0 : -8, pointerEvents: "none" }} transition={{ duration: reduce ? 0 : 0.18, ease }}>
          <PromptDockContent {...props} />
        </motion.div>
      </AnimatePresence>
    </motion.div>
  );
}
