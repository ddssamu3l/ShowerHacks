"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

export interface Flight {
  id: number;
  text: string;
  from: { x: number; y: number };
  to: { x: number; y: number };
  tone: "violet" | "water";
}

export function FlyingPoints({ flights, onDone }: { flights: Flight[]; onDone: (id: number) => void }) {
  const reduce = useReducedMotion();
  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {flights.map((flight) => (
        <motion.span
          key={flight.id}
          className={cn(
            "pointer-events-none fixed top-0 left-0 z-50 rounded-full px-3 py-1.5 text-sm font-semibold whitespace-nowrap text-white tabular-nums",
            flight.tone === "violet" ? "spotlight-violet" : "spotlight-water",
          )}
          initial={{ opacity: 0, transform: `translate(${flight.from.x}px, ${flight.from.y}px) translate(-50%, -50%) scale(0.9)` }}
          animate={{
            opacity: [0, 1, 1, 0],
            transform: reduce
              ? `translate(${flight.to.x}px, ${flight.to.y}px) translate(-50%, -50%) scale(1)`
              : [
                  `translate(${flight.from.x}px, ${flight.from.y}px) translate(-50%, -50%) scale(0.9)`,
                  `translate(${flight.from.x}px, ${flight.from.y - 24}px) translate(-50%, -50%) scale(1.08)`,
                  `translate(${flight.to.x}px, ${flight.to.y}px) translate(-50%, -50%) scale(0.8)`,
                  `translate(${flight.to.x}px, ${flight.to.y}px) translate(-50%, -50%) scale(0.6)`,
                ],
          }}
          transition={{ duration: reduce ? 0.4 : 0.9, times: [0, 0.25, 0.85, 1], ease: [0.77, 0, 0.175, 1] }}
          onAnimationComplete={() => onDone(flight.id)}
        >
          {flight.text}
        </motion.span>
      ))}
    </AnimatePresence>,
    document.body,
  );
}

export function centerOf(element: Element | null) {
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}
