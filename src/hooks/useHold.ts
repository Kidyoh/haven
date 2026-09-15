import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Press-and-hold for anything that must not fire by accident. One pointer
 * path for mouse, touch and pen (touch no longer also fires emulated mouse
 * events that start a second hold), plus Space/Enter for keyboards.
 */
export function useHold({
  durationMs,
  onComplete,
  disabled = false,
}: {
  durationMs: number;
  onComplete: () => void;
  disabled?: boolean;
}) {
  const [progress, setProgress] = useState(0);
  const [holding, setHolding] = useState(false);
  const startedAt = useRef<number | null>(null);
  const doneTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progressTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const clearTimers = () => {
    if (doneTimer.current) clearTimeout(doneTimer.current);
    if (progressTimer.current) clearInterval(progressTimer.current);
    doneTimer.current = progressTimer.current = null;
  };

  const end = useCallback(() => {
    if (startedAt.current === null) return;
    startedAt.current = null;
    clearTimers();
    setHolding(false);
    setProgress(0);
  }, []);

  const begin = useCallback(() => {
    if (disabled || startedAt.current !== null) return;
    startedAt.current = Date.now();
    setHolding(true);
    setProgress(0);
    navigator.vibrate?.(15);

    progressTimer.current = setInterval(() => {
      if (startedAt.current === null) return;
      setProgress(Math.min(1, (Date.now() - startedAt.current) / durationMs));
    }, 30);

    doneTimer.current = setTimeout(() => {
      startedAt.current = null;
      clearTimers();
      setHolding(false);
      setProgress(0);
      navigator.vibrate?.(60);
      onCompleteRef.current();
    }, durationMs);
  }, [disabled, durationMs]);

  useEffect(() => clearTimers, []);
  useEffect(() => {
    if (disabled) end();
  }, [disabled, end]);

  const isActivationKey = (key: string) => key === " " || key === "Enter";

  const handlers = {
    onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* not supported (e.g. jsdom): the hold still works while the pointer stays put */
      }
      begin();
    },
    onPointerUp: end,
    onPointerCancel: end,
    onLostPointerCapture: end,
    onKeyDown: (e: React.KeyboardEvent<HTMLElement>) => {
      if (!isActivationKey(e.key)) return;
      e.preventDefault();
      if (!e.repeat) begin();
    },
    onKeyUp: (e: React.KeyboardEvent<HTMLElement>) => {
      if (isActivationKey(e.key)) end();
    },
    onBlur: end,
    // Stop the long-press menu / text selection callout on phones.
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  };

  return { progress, holding, handlers };
}
