"use client";

import { useEffect } from "react";
import { animate, motion, useMotionValue, useReducedMotion, useSpring, useTransform } from "motion/react";

interface AnimatedNumberProps {
  value: number;
  className?: string;
  format?: (value: number) => string;
  /** "roll" springs toward each new value; "count" tweens from 0 once, for a reveal. */
  mode?: "roll" | "count";
  duration?: number;
}

const defaultFormat = (value: number) => Math.round(value).toLocaleString();

export function AnimatedNumber({ value, className, format = defaultFormat, mode = "roll", duration = 1.1 }: AnimatedNumberProps) {
  const reduce = useReducedMotion();
  const raw = useMotionValue(mode === "count" && !reduce ? 0 : value);
  const spring = useSpring(raw, { duration: 0.6, bounce: 0 });
  const source = mode === "roll" && !reduce ? spring : raw;
  const text = useTransform(source, (latest) => format(latest));

  useEffect(() => {
    if (reduce) {
      raw.set(value);
      return;
    }
    if (mode === "count") {
      const controls = animate(raw, value, { duration, ease: [0.23, 1, 0.32, 1] });
      return () => controls.stop();
    }
    raw.set(value);
  }, [value, mode, duration, raw, reduce]);

  return <motion.span className={className}>{text}</motion.span>;
}
