"use client";

import { useCallback, useEffect, useRef } from "react";

/** Timeouts and intervals that are all cleared when the component unmounts. */
export function useTimers() {
  const timeouts = useRef(new Set<number>());
  const intervals = useRef(new Set<number>());

  useEffect(() => {
    const pendingTimeouts = timeouts.current;
    const pendingIntervals = intervals.current;
    return () => {
      pendingTimeouts.forEach((id) => window.clearTimeout(id));
      pendingIntervals.forEach((id) => window.clearInterval(id));
      pendingTimeouts.clear();
      pendingIntervals.clear();
    };
  }, []);

  const later = useCallback((callback: () => void, ms: number) => {
    const id = window.setTimeout(() => {
      timeouts.current.delete(id);
      callback();
    }, ms);
    timeouts.current.add(id);
    return id;
  }, []);

  const every = useCallback((callback: () => void, ms: number) => {
    const id = window.setInterval(callback, ms);
    intervals.current.add(id);
    return id;
  }, []);

  const stopEvery = useCallback((id: number) => {
    window.clearInterval(id);
    intervals.current.delete(id);
  }, []);

  return { later, every, stopEvery };
}
