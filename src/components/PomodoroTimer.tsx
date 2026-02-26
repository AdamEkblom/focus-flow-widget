import { useState } from "react";
import { usePomodoro } from "@/hooks/usePomodoro";
import CircularProgress from "@/components/CircularProgress";
import { Play, Pause, RotateCcw, SkipForward } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

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
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
      {/* Session counter */}
      <motion.div
        className="mb-8 flex items-center gap-2"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        {completedSessions > 0 && (
          <span className="text-sm text-muted-foreground font-mono-display">
            {completedSessions} session{completedSessions !== 1 ? "s" : ""} completed
          </span>
        )}
      </motion.div>

      {/* Mode label */}
      <AnimatePresence mode="wait">
        <motion.h2
          key={mode}
          className={`mb-6 text-sm font-medium uppercase tracking-[0.3em] ${
            isBreak ? "text-timer-ring-rest" : "text-primary"
          }`}
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          transition={{ duration: 0.2 }}
        >
          {isBreak ? "Break" : "Focus"}
        </motion.h2>
      </AnimatePresence>

      {/* Timer ring */}
      <div className="relative mb-10">
        <CircularProgress progress={progress} isBreak={isBreak} />
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-mono-display text-6xl font-bold text-foreground tabular-nums">
            {formatTime(secondsLeft)}
          </span>
        </div>
      </div>

      {/* Controls */}
      <div className="mb-12 flex items-center gap-4">
        <button
          onClick={reset}
          className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary text-secondary-foreground transition-colors hover:bg-border"
          aria-label="Reset"
        >
          <RotateCcw size={18} />
        </button>

        <button
          onClick={toggle}
          className={`flex h-16 w-16 items-center justify-center rounded-full transition-all ${
            isBreak
              ? "bg-timer-ring-rest text-primary-foreground shadow-[0_0_30px_hsl(var(--timer-ring-rest)/0.3)]"
              : "bg-primary text-primary-foreground shadow-[0_0_30px_hsl(var(--timer-ring)/0.3)]"
          }`}
          aria-label={isRunning ? "Pause" : "Play"}
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={isRunning ? "pause" : "play"}
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.5, opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              {isRunning ? <Pause size={24} /> : <Play size={24} className="ml-0.5" />}
            </motion.div>
          </AnimatePresence>
        </button>

        <button
          onClick={skip}
          className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary text-secondary-foreground transition-colors hover:bg-border"
          aria-label="Skip"
        >
          <SkipForward size={18} />
        </button>
      </div>

      {/* Presets + Custom */}
      <div className="flex flex-col items-center gap-3">
        <div className="flex gap-2">
          {presets.map((p) => (
            <button
              key={p.label}
              onClick={() => { selectPreset(p); setCustomInput(""); }}
              className={`rounded-full px-4 py-2 text-sm font-mono-display transition-all ${
                preset.label === p.label && !customInput
                  ? "bg-primary text-primary-foreground shadow-[0_0_20px_hsl(var(--timer-ring)/0.2)]"
                  : "bg-secondary text-muted-foreground hover:text-foreground"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

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
            className="w-28 rounded-full bg-secondary px-4 py-2 text-center text-sm font-mono-display text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-primary"
          />
          {customInput && parseInt(customInput) > 0 && (
            <button
              onClick={() => {
                const val = parseInt(customInput);
                if (val > 0 && val <= 240) setCustomTime(val);
              }}
              className="rounded-full bg-primary px-3 py-2 text-xs font-mono-display text-primary-foreground transition-all hover:shadow-[0_0_20px_hsl(var(--timer-ring)/0.2)]"
            >
              {parseInt(customInput)} / {Math.max(1, Math.round(parseInt(customInput) / 5))}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default PomodoroTimer;
