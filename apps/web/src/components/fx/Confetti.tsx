"use client";

import { useMemo } from "react";
import { motion, useReducedMotion } from "motion/react";

const colors = ["#6a4cf5", "#d44df0", "#ff7a3d", "#ff5577", "#0099ff", "#ffffff"];

export function Confetti({ pieces = 44 }: { pieces?: number }) {
  const reduce = useReducedMotion();
  const bits = useMemo(
    () =>
      Array.from({ length: pieces }, (_, index) => {
        const angle = (index / pieces) * Math.PI * 2 + Math.random() * 0.4;
        const distance = 140 + Math.random() * 180;
        return {
          id: index,
          color: colors[index % colors.length],
          x: Math.cos(angle) * distance,
          y: Math.sin(angle) * distance * 0.6 - 60,
          fall: 180 + Math.random() * 160,
          spin: (Math.random() - 0.5) * 720,
          delay: Math.random() * 0.08,
          wide: Math.random() > 0.5,
        };
      }),
    [pieces],
  );

  if (reduce) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-20 overflow-visible" aria-hidden>
      {bits.map((bit) => (
        <motion.span
          key={bit.id}
          className="absolute top-1/2 left-1/2 block rounded-[2px]"
          style={{ background: bit.color, width: bit.wide ? 10 : 6, height: bit.wide ? 6 : 10 }}
          initial={{ opacity: 1, transform: "translate(0px, 0px) rotate(0deg)" }}
          animate={{
            opacity: [1, 1, 0],
            transform: [
              "translate(0px, 0px) rotate(0deg)",
              `translate(${bit.x}px, ${bit.y}px) rotate(${bit.spin / 2}deg)`,
              `translate(${bit.x * 1.1}px, ${bit.y + bit.fall}px) rotate(${bit.spin}deg)`,
            ],
          }}
          transition={{ duration: 1.6, delay: bit.delay, times: [0, 0.35, 1], ease: [0.23, 1, 0.32, 1] }}
        />
      ))}
    </div>
  );
}
