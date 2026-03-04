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

  const totalSeconds = mode === "work" ? preset.work * 60 : preset.break * 60;
  const progress = 1 - secondsLeft / totalSeconds;

  // Sync timer display to menu bar tray title
  useEffect(() => {
    invoke("update_tray_title", { title: `🍅 ${formatTime(secondsLeft)}` }).catch(() => {});
  }, [secondsLeft]);

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
      return;
    }

    intervalRef.current = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          if (mode === "work") {
            notify("Break time! ☕", `Great work! Take a ${preset.break}-minute break.`);
            setCompletedSessions((s) => s + 1);
            setMode("break");
            return preset.break * 60;
          } else {
            notify("Back to work! 🔥", `Break's over. ${preset.work} minutes of focus ahead.`);
            setMode("work");
            return preset.work * 60;
          }
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
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
