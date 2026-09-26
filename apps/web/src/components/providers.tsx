"use client";

import type { ReactNode } from "react";
import { MotionConfig } from "motion/react";
import { CameraProvider } from "./camera/CameraProvider";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      <CameraProvider>{children}</CameraProvider>
    </MotionConfig>
  );
}
