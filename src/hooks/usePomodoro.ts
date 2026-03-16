import { useState, useEffect, useCallback, useRef } from "react";
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import { invoke } from "@tauri-apps/api/core";

export type TimerMode = "work" | "break";

export interface PomodoroPreset {
  label: string;
  work: number; // minutes
  break: number; // minutes
}

export const PRESETS: PomodoroPreset[] = [
  { label: "25 / 5", work: 25, break: 5 },
  { label: "50 / 10", work: 50, break: 10 },
  { label: "75 / 15", work: 75, break: 15 },
];

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export { formatTime };

export function usePomodoro() {
  const [preset, setPreset] = useState<PomodoroPreset>(PRESETS[0]);
  const [mode, setMode] = useState<TimerMode>("work");
  const [secondsLeft, setSecondsLeft] = useState(PRESETS[0].work * 60);
  const [isRunning, setIsRunning] = useState(false);
  const [completedSessions, setCompletedSessions] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const targetEndRef = useRef<number>(0);
  const secondsLeftRef = useRef(secondsLeft);
  secondsLeftRef.current = secondsLeft;
  // Set to true by transition code so the effect re-run preserves targetEndRef
  const isTransitionRef = useRef(false);

  const totalSeconds = mode === "work" ? preset.work * 60 : preset.break * 60;
  const progress = 1 - secondsLeft / totalSeconds;

  // Sync timer display to menu bar tray title only when NOT running.
  // When running, the native Rust background thread handles tray updates
  // independently of the WebView (which macOS may suspend).
  useEffect(() => {
    if (!isRunning) {
      invoke("update_tray_title", { title: `🍅 ${formatTime(secondsLeft)}` }).catch(() => {});
    }
  }, [secondsLeft, isRunning]);

  const notify = useCallback(async (title: string, body: string) => {
    let granted = await isPermissionGranted().catch(() => false);
    if (!granted) {
      const perm = await requestPermission().catch(() => "denied");
      granted = perm === "granted";
    }
    if (granted) {
      sendNotification({ title, body });
    }
  }, []);

  const switchMode = useCallback(
    (newMode: TimerMode) => {
      setMode(newMode);
      const secs = newMode === "work" ? preset.work * 60 : preset.break * 60;
      setSecondsLeft(secs);
    },
    [preset]
  );

  useEffect(() => {
    if (!isRunning) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      invoke("stop_tray_countdown").catch(() => {});
      return;
    }

    if (!isTransitionRef.current) {
      targetEndRef.current = Date.now() + secondsLeftRef.current * 1000;
    }
    isTransitionRef.current = false;

    invoke("start_tray_countdown", {
      targetEndMs: targetEndRef.current,
      prefix: mode === "work" ? "🍅" : "☕",
    }).catch(() => {});

    // Guard prevents the transition firing twice if the interval ticks before
    // effect cleanup when the WebView wakes from macOS throttling.
    let transitioned = false;

    const tick = () => {
      const remaining = Math.ceil((targetEndRef.current - Date.now()) / 1000);
      if (remaining <= 0) {
        if (transitioned) return;
        transitioned = true;
        if (mode === "work") {
          notify("Break time! ☕", `Great work! Take a ${preset.break}-minute break.`);
          setCompletedSessions((s) => s + 1);
          const newDuration = preset.break * 60;
          targetEndRef.current = Date.now() + newDuration * 1000;
          invoke("start_tray_countdown", {
            targetEndMs: targetEndRef.current,
            prefix: "☕",
          }).catch(() => {});
          isTransitionRef.current = true;
          setMode("break");
          setSecondsLeft(newDuration);
        } else {
          notify("Back to work! 🔥", `Break's over. ${preset.work} minutes of focus ahead.`);
          const newDuration = preset.work * 60;
          targetEndRef.current = Date.now() + newDuration * 1000;
          invoke("start_tray_countdown", {
            targetEndMs: targetEndRef.current,
            prefix: "🍅",
          }).catch(() => {});
          isTransitionRef.current = true;
          setMode("work");
          setSecondsLeft(newDuration);
        }
      } else {
        setSecondsLeft(remaining);
      }
    };

    intervalRef.current = setInterval(tick, 250);

    // When macOS throttles the WebView (window hidden), the interval may not
    // fire while the timer expires. Fire an immediate tick when the page
    // becomes visible again so the transition happens without delay.
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [isRunning, mode, preset, notify]);

  const selectPreset = useCallback((p: PomodoroPreset) => {
    setPreset(p);
    setMode("work");
    setSecondsLeft(p.work * 60);
    setIsRunning(false);
  }, []);

  const setCustomTime = useCallback((workMinutes: number) => {
    const breakMinutes = Math.max(1, Math.round(workMinutes / 5));
    const p: PomodoroPreset = {
      label: `${workMinutes} / ${breakMinutes}`,
      work: workMinutes,
      break: breakMinutes,
    };
    setPreset(p);
    setMode("work");
    setSecondsLeft(workMinutes * 60);
    setIsRunning(false);
  }, []);

  const toggle = useCallback(() => {
    setIsRunning((r) => !r);
  }, []);

  const reset = useCallback(() => {
    setIsRunning(false);
    setSecondsLeft(mode === "work" ? preset.work * 60 : preset.break * 60);
  }, [mode, preset]);

  const skip = useCallback(() => {
    setIsRunning(false);
    const newMode = mode === "work" ? "break" : "work";
    switchMode(newMode);
  }, [mode, switchMode]);

  return {
    preset,
    presets: PRESETS,
    selectPreset,
    setCustomTime,
    mode,
    secondsLeft,
    totalSeconds,
    progress,
    isRunning,
    toggle,
    reset,
    skip,
    completedSessions,
  };
}
