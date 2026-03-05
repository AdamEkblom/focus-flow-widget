import { useState } from "react";
import { usePomodoro, formatTime } from "@/hooks/usePomodoro";
import CircularProgress from "@/components/CircularProgress";
import { Play, Pause, RotateCcw, SkipForward } from "lucide-react";

const PomodoroTimer = () => {
  const {
    preset,
    presets,
    selectPreset,
    setCustomTime,
    mode,
    secondsLeft,
    progress,
    isRunning,
    toggle,
    reset,
    skip,
    completedSessions,
  } = usePomodoro();

  const [customInput, setCustomInput] = useState("");

  const isBreak = mode === "break";

  return (
    <div
      data-tauri-drag-region
      className="flex flex-col items-center px-4 pt-3 pb-4"
    >
      {/* Header row */}
      <div className="mb-2 flex w-full items-center justify-between">
        <span
          className={`text-xs font-medium uppercase tracking-widest ${
            isBreak ? "text-timer-ring-rest" : "text-primary"
          }`}
        >
          {isBreak ? "Break" : "Focus"}
        </span>
        {completedSessions > 0 && (
          <span className="text-xs text-muted-foreground">
            {completedSessions} session{completedSessions !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Timer ring */}
      <div className="relative mb-4">
        <CircularProgress progress={progress} isBreak={isBreak} />
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-mono-display text-3xl font-bold text-foreground tabular-nums">
            {formatTime(secondsLeft)}
          </span>
        </div>
      </div>

      {/* Controls */}
      <div className="mb-4 flex items-center gap-3">
        <button
          onClick={reset}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary text-secondary-foreground transition-colors hover:bg-border"
          aria-label="Reset"
        >
          <RotateCcw size={14} />
        </button>

        <button
          onClick={toggle}
          className={`flex h-11 w-11 items-center justify-center rounded-full transition-colors ${
            isBreak
              ? "bg-timer-ring-rest text-primary-foreground"
              : "bg-primary text-primary-foreground"
          }`}
          aria-label={isRunning ? "Pause" : "Play"}
        >
          {isRunning ? <Pause size={20} /> : <Play size={20} className="ml-0.5" />}
        </button>

        <button
          onClick={skip}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary text-secondary-foreground transition-colors hover:bg-border"
          aria-label="Skip"
        >
          <SkipForward size={14} />
        </button>
      </div>

      {/* Divider */}
      <div className="mb-4 w-full border-t border-border" />

      {/* Presets */}
      <div className="flex flex-col items-center gap-2">
        <div className="flex gap-2">
          {presets.map((p) => (
            <button
              key={p.label}
              onClick={() => {
                selectPreset(p);
                setCustomInput("");
              }}
              className={`rounded-md px-3 py-1 text-xs transition-colors ${
                preset.label === p.label && !customInput
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-muted-foreground hover:text-foreground"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Custom input */}
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={1}
            max={240}
            placeholder="Custom min"
            value={customInput}
            onChange={(e) => setCustomInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                const val = parseInt(customInput);
                if (val > 0 && val <= 240) setCustomTime(val);
              }
            }}
            className="w-24 rounded-md bg-secondary px-3 py-1 text-center text-xs text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-primary"
          />
          {customInput && parseInt(customInput) > 0 && (
            <button
              onClick={() => {
                const val = parseInt(customInput);
                if (val > 0 && val <= 240) setCustomTime(val);
              }}
              className="rounded-md bg-primary px-3 py-1 text-xs text-primary-foreground transition-colors"
            >
              {parseInt(customInput)} /{" "}
              {Math.max(1, Math.round(parseInt(customInput) / 5))}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default PomodoroTimer;
