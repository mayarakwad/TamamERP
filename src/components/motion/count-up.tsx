"use client";

import { useEffect, useRef, useState } from "react";
import { animate } from "motion/react";
import { useReducedMotion } from "@/components/providers";

/**
 * A number that counts up to its value when it first appears (and glides when
 * the value changes). Screen readers get the final value immediately.
 */
export function CountUp({ value, format, duration = 1.1, className }: { value: number; format: (n: number) => string; duration?: number; className?: string }) {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(0);
  const from = useRef(0);

  useEffect(() => {
    if (reduced) {
      from.current = value;
      return;
    }
    const controls = animate(from.current, value, {
      duration,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => setShown(v),
    });
    from.current = value;
    return () => controls.stop();
  }, [value, reduced, duration]);

  const display = reduced ? value : shown;

  return (
    <span className={className}>
      <span aria-hidden className="tabular">{format(Math.round(display))}</span>
      <span className="sr-only">{format(value)}</span>
    </span>
  );
}
