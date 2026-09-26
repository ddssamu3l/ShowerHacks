"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const STREAM_HALF_WIDTH = 0.14;

export function useInWater() {
  const waterXRef = useRef(0.5);
  const bodyXRef = useRef<number | null>(null);
  const [inWater, setInWater] = useState(false);

  const setWaterX = useCallback((x: number) => {
    waterXRef.current = x;
  }, []);
  const setBodyX = useCallback((x: number | null) => {
    bodyXRef.current = x;
  }, []);

  const isInWater = useCallback(() => {
    const body = bodyXRef.current;
    return body !== null && Math.abs(body - waterXRef.current) < STREAM_HALF_WIDTH;
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setInWater(isInWater()), 100);
    return () => window.clearInterval(timer);
  }, [isInWater]);

  return { inWater, isInWater, setWaterX, setBodyX };
}
