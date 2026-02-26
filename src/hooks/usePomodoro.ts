import { useState, useEffect, useCallback, useRef } from "react";

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

export function usePomodoro() {
  const [preset, setPreset] = useState<PomodoroPreset>(PRESETS[0]);
  const [mode, setMode] = useState<TimerMode>("work");
  const [secondsLeft, setSecondsLeft] = useState(PRESETS[0].work * 60);
  const [isRunning, setIsRunning] = useState(false);
  const [completedSessions, setCompletedSessions] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const totalSeconds = mode === "work" ? preset.work * 60 : preset.break * 60;
  const progress = 1 - secondsLeft / totalSeconds;

  const sendNotification = useCallback((title: string, body: string) => {
    if ("Notification" in window && Notification.permission === "granted") {
      new Notification(title, { body, icon: "/favicon.ico" });
    }
  }, []);

  const requestNotificationPermission = useCallback(async () => {
    if ("Notification" in window && Notification.permission === "default") {
      await Notification.requestPermission();
    }
  }, []);

  const switchMode = useCallback((newMode: TimerMode) => {
    setMode(newMode);
    const secs = newMode === "work" ? preset.work * 60 : preset.break * 60;
    setSecondsLeft(secs);
  }, [preset]);

  useEffect(() => {
    if (!isRunning) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }

    intervalRef.current = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          // Timer complete
          if (mode === "work") {
            sendNotification("Break time! ☕", `Great work! Take a ${preset.break}-minute break.`);
            setCompletedSessions((s) => s + 1);
            setMode("break");
            return preset.break * 60;
          } else {
            sendNotification("Back to work! 🔥", `Break's over. ${preset.work} minutes of focus ahead.`);
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
  }, [isRunning, mode, preset, sendNotification]);

  const selectPreset = useCallback((p: PomodoroPreset) => {
    setPreset(p);
    setMode("work");
    setSecondsLeft(p.work * 60);
    setIsRunning(false);
  }, []);

  const toggle = useCallback(() => {
    if (!isRunning) requestNotificationPermission();
    setIsRunning((r) => !r);
  }, [isRunning, requestNotificationPermission]);

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
