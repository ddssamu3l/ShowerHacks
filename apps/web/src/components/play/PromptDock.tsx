"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { GameState } from "@vibecodemaxxing/contracts";
import { SCORING } from "@vibecodemaxxing/contracts";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { PointPops, type Pop } from "../fx/PointPop";
import { useTimers } from "../fx/useTimers";

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

function TypingCard({ state, go, onSubmit }: { state: Extract<GameState, { phase: "typing" }>; go: boolean; onSubmit: (text: string) => boolean }) {
  const [draft, setDraft] = useState("");
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
  const onPace = length / SCORING.targetCharactersPerSecond;
  const heat = seconds <= onPace ? "text-white" : seconds <= onPace * 1.6 ? "text-heat" : "text-miss";
  const activeWord = typedWords.length - 1;

  return (
    <Card className="spotlight-violet on-spotlight relative gap-3 overflow-visible rounded-[20px] bg-spotlight-violet px-5 py-5 text-white ring-0">
      <form
        className="grid gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (draft.length > 0) onSubmit(draft);
        }}
      >
        <div className="flex items-center justify-between gap-3">
          <span className="text-[13px] font-medium text-white/80">
            Prompt {state.turnIndex + 1} of {state.turnCount}
          </span>
          <div className="flex items-center gap-2">
            <AnimatePresence>
              {streak >= 2 && (
                <motion.span
                  key={streak}
                  className="rounded-full bg-black/30 px-3 py-1 text-[13px] font-semibold text-heat tabular-nums"
                  initial={{ opacity: 0, transform: "scale(0.85)" }}
                  animate={{ opacity: 1, transform: "scale(1)" }}
                  exit={{ opacity: 0, transform: "scale(0.95)" }}
                  transition={{ type: "spring", duration: 0.35, bounce: 0.4 }}
                >
                  ×{streak} streak
                </motion.span>
              )}
            </AnimatePresence>
            <span className={cn("rounded-full bg-black/30 px-3 py-1 font-mono text-base tabular-nums transition-colors duration-300", heat)}>
              {seconds.toFixed(1)}s
            </span>
          </div>
        </div>

        <p className="font-mono text-[clamp(18px,1.7vw,24px)] leading-[1.6] break-words" aria-label={target}>
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
                  <PointPops pops={pops[wordIndex] ?? []} className="rounded-full bg-white px-1.5 py-0.5 font-sans text-xs leading-none text-spotlight-violet" />
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
          className="h-12 rounded-[10px] border-white/15 bg-black/25 px-3.5 font-mono text-[15px] text-white placeholder:text-white/50 focus-visible:border-white/60 focus-visible:ring-white/25 dark:bg-black/25"
          onChange={(event) => changeDraft(event.target.value)}
          onPaste={(event) => event.preventDefault()}
          onDrop={(event) => event.preventDefault()}
          onKeyDown={(event) => {
            if (event.key === "Enter" && event.nativeEvent.isComposing) event.preventDefault();
          }}
        />
      </form>

      <AnimatePresence>
        {go && (
          <motion.p
            className="pointer-events-none absolute inset-0 grid place-items-center font-display text-7xl font-semibold tracking-[-0.05em] text-white"
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
    <Card className="gap-3 rounded-[20px] px-5 py-5 ring-signal/40">
      <div className="flex items-baseline justify-between">
        <span className="text-[13px] font-medium text-signal">Agent is working. Go scrub.</span>
        <span className="font-mono text-lg text-signal tabular-nums">{(left / 1000).toFixed(1)}s</span>
      </div>
      <Progress value={100 * (1 - left / total)} className="h-2" indicatorClassName="bg-signal transition-none" />
      <div className="flex items-center gap-3">
        <motion.span
          className="spotlight-violet rounded-full px-3 py-1 text-sm font-semibold text-white tabular-nums"
          initial={{ opacity: 0, transform: "scale(0.85)" }}
          animate={{ opacity: 1, transform: "scale(1)" }}
          transition={{ type: "spring", duration: 0.45, bounce: 0.4 }}
        >
          +{Math.round(state.typingResult.score)} typing
        </motion.span>
        <p className="text-sm text-muted-foreground">
          {Math.round(state.typingResult.accuracy * 100)}% accurate. The next prompt appears when the agent finishes.
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
  onSubmit: (text: string) => boolean;
}

export function PromptDock({ state, countdown, go, onStart, onSubmit }: PromptDockProps) {
  if (state.phase === "ready") {
    if (countdown !== null) {
      return (
        <Card className="spotlight-magenta min-h-[132px] justify-center rounded-[20px] bg-spotlight-magenta text-white ring-0">
          <motion.p
            key={countdown}
            className="text-center font-display text-7xl font-semibold tracking-[-0.05em] tabular-nums"
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
      <Card className="min-h-[132px] justify-center gap-3 rounded-[20px] px-5 py-5">
        <div className="flex items-center justify-between gap-6">
          <div className="grid gap-1">
            <p className="font-display text-2xl font-medium tracking-[-0.03em]">Ready, {state.nickname}?</p>
            <p className="text-sm text-muted-foreground">
              {state.turnCount} prompts. The clock starts the moment each prompt appears.
            </p>
          </div>
          <Button size="lg" onClick={onStart}>
            Start
          </Button>
        </div>
      </Card>
    );
  }

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
    <Card className="gap-3 rounded-[20px] px-5 py-5">
      <p className="font-display text-2xl font-medium tracking-[-0.03em]">Run finished. Adding up your score.</p>
    </Card>
  );
}
