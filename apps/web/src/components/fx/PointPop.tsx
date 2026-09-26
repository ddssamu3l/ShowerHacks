"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

export interface Pop {
  id: number;
  text: string;
}

export function PointPops({ pops, className }: { pops: Pop[]; className?: string }) {
  const reduce = useReducedMotion();
  return (
    <AnimatePresence>
      {pops.map((pop) => (
        <motion.span
          key={pop.id}
          className={cn(
            "pointer-events-none absolute -top-5 left-1/2 z-10 font-sans text-sm font-semibold whitespace-nowrap tabular-nums",
            className,
          )}
          initial={{ opacity: 0, transform: reduce ? "translate(-50%, 0)" : "translate(-50%, 6px) scale(0.9)" }}
          animate={{ opacity: 1, transform: reduce ? "translate(-50%, 0)" : "translate(-50%, -10px) scale(1)" }}
          exit={{ opacity: 0, transform: reduce ? "translate(-50%, 0)" : "translate(-50%, -26px) scale(1)" }}
          transition={{ type: "spring", duration: 0.45, bounce: 0.3 }}
        >
          {pop.text}
        </motion.span>
      ))}
    </AnimatePresence>
  );
}
