"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";
import { CameraView } from "../camera/CameraView";
import { useCamera, usePoseSnapshot } from "../camera/CameraProvider";
import { PixiWater } from "../shower/PixiWater";
import { designSessions } from "../design/session";
import { nicknameProblem, readPlayer, savePlayer } from "../design/run-storage";
import { useInWater } from "../play/useInWater";

export function Lobby() {
  const router = useRouter();
  const { status, request } = useCamera();
  const pose = usePoseSnapshot();
  const [nickname, setNickname] = useState("");
  const [sessionId, setSessionId] = useState(designSessions[0].id);
  const [touched, setTouched] = useState(false);
  const water = useInWater();

  useEffect(() => {
    request();
    const saved = readPlayer();
    if (saved) {
      setNickname(saved.nickname);
      setSessionId(saved.sessionId);
    }
  }, [request]);

  const problem = nicknameProblem(nickname);
  const cameraReady = status === "ready";

  const go = (inputMode: "camera" | "mock") => {
    setTouched(true);
    if (problem) return;
    savePlayer({ nickname: nickname.trim(), sessionId, inputMode });
    router.push("/play");
  };

  const checks = [
    { label: "Camera on", done: ["loading-model", "ready"].includes(status) },
    { label: "Body tracking loaded", done: cameraReady },
    { label: "Head and shoulders in frame", done: pose.tracking },
    { label: "Hands in view", done: pose.handsVisible },
  ];

  return (
    <main className="mx-auto grid min-h-svh max-w-[1200px] items-center gap-12 px-6 py-12 md:px-10 lg:grid-cols-[1.15fr_0.85fr] lg:gap-20">
      <section className="flex flex-col gap-10">
        <div className="flex flex-col items-start gap-5">
          <Badge variant="secondary" className="h-7 px-3 text-[13px]">
            Maximum vibes. Questionable code.
          </Badge>
          <h1 className="font-display text-[clamp(3rem,7vw,5.3rem)] leading-[0.95] font-medium tracking-[-0.05em]">
            Vibecodemaxxing
          </h1>
          <p className="max-w-md text-lg leading-[1.3] text-muted-foreground">
            Type the prompt fast. While the agent &ldquo;works,&rdquo; get under the water and scrub. Typing and
            showering are worth half your score each.
          </p>
        </div>

        <form
          className="flex max-w-md flex-col gap-6"
          onSubmit={(event) => {
            event.preventDefault();
            go("camera");
          }}
        >
          <div className="grid gap-2">
            <Label htmlFor="nickname" className="text-muted-foreground">
              Name on the leaderboard
            </Label>
            <Input
              id="nickname"
              value={nickname}
              maxLength={48}
              autoComplete="off"
              placeholder="vibecoder_9000"
              className="h-11 rounded-[10px] bg-card px-3.5 font-mono text-[15px] dark:bg-card"
              onChange={(event) => setNickname(event.target.value)}
              onBlur={() => setTouched(true)}
              aria-invalid={touched && Boolean(problem)}
            />
            {touched && problem && <p className="text-[13px] text-destructive">{problem}</p>}
          </div>

          <div className="grid gap-2">
            <Label className="text-muted-foreground">Session</Label>
            <RadioGroup value={sessionId} onValueChange={setSessionId} className="gap-2">
              {designSessions.map((session) => {
                const seconds = Math.round(session.turns.reduce((sum, turn) => sum + turn.agent.durationMs, 0) / 1000);
                return (
                  <Label
                    key={session.id}
                    htmlFor={`session-${session.id}`}
                    className={cn(
                      "flex cursor-pointer items-start gap-3 rounded-[20px] p-5 font-normal transition-[transform,background-color] duration-200 ease-[var(--ease-out)] active:scale-[0.99]",
                      session.id === sessionId
                        ? "spotlight-cartridge bg-spotlight-violet text-white"
                        : "bg-card ring-1 ring-border hover:bg-accent",
                    )}
                  >
                    <RadioGroupItem
                      id={`session-${session.id}`}
                      value={session.id}
                      className="mt-1 border-white/60 data-checked:border-white data-checked:bg-white"
                    />
                    <span className="grid gap-1">
                      <span className="font-display text-xl font-medium tracking-[-0.03em]">{session.title}</span>
                      <span className="font-mono text-xs text-white/85">
                        {session.turns.length} prompts · {seconds}s of showering
                      </span>
                      <span className="text-sm leading-[1.4] text-white/75">{session.description}</span>
                    </span>
                  </Label>
                );
              })}
            </RadioGroup>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <motion.span
              key={cameraReady ? "ready" : "waiting"}
              className="inline-flex"
              initial={false}
              animate={cameraReady ? { transform: ["scale(1)", "scale(1.06)", "scale(1)"] } : undefined}
              transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
            >
              <Button type="submit" size="lg" disabled={!cameraReady}>
                {cameraReady ? "Start" : "Waiting for the camera"}
              </Button>
            </motion.span>
            <Button type="button" size="lg" variant="secondary" onClick={() => go("mock")}>
              Practice without a camera
            </Button>
          </div>
        </form>
      </section>

      <section className="mx-auto flex w-full max-w-[420px] flex-col gap-3" aria-label="Camera check">
        <CameraView onBodyX={water.setBodyX}>
          <PixiWater active onMove={water.setWaterX} />
        </CameraView>
        <Card
          className={cn(
            "rounded-[20px] transition-[background-color,box-shadow] duration-300",
            water.inWater && "spotlight-water bg-[#0a6fd6] text-white ring-0",
          )}
        >
          <CardHeader>
            <CardTitle className="text-[15px]">
              {water.inWater ? "You're under the water." : "Try it: step under the water."}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-2 text-sm">
              {checks.map((check) => (
                <li
                  key={check.label}
                  className={cn(
                    "flex items-center gap-2.5",
                    check.done ? "" : water.inWater ? "text-white/70" : "text-muted-foreground",
                  )}
                >
                  <span
                    className={cn(
                      "grid size-4 place-items-center rounded-full ring-1 transition-colors",
                      check.done ? "bg-primary text-primary-foreground ring-primary" : "ring-border",
                    )}
                  >
                    <AnimatePresence>
                      {check.done && (
                        <motion.span
                          className="grid place-items-center"
                          initial={{ opacity: 0, transform: "scale(0.6)" }}
                          animate={{ opacity: 1, transform: "scale(1)" }}
                          exit={{ opacity: 0, transform: "scale(0.8)" }}
                          transition={{ type: "spring", duration: 0.35, bounce: 0.5 }}
                        >
                          <Check className="size-3" strokeWidth={3} />
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </span>
                  {check.label}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
