import { motion } from "framer-motion";

interface CircularProgressProps {
  progress: number;
  size?: number;
  strokeWidth?: number;
  isBreak?: boolean;
}

const CircularProgress = ({ progress, size = 140, strokeWidth = 4, isBreak = false }: CircularProgressProps) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - progress);

  return (
    <svg width={size} height={size} className="rotate-[-90deg]">
      {/* Track */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="hsl(var(--timer-track))"
        strokeWidth={strokeWidth}
      />
      {/* Progress */}
      <motion.circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={isBreak ? "hsl(var(--timer-ring-rest))" : "hsl(var(--timer-ring))"}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        initial={false}
        animate={{ strokeDashoffset: offset }}
        transition={{ duration: 0.5, ease: "easeOut" }}
      />
    </svg>
  );
};

export default CircularProgress;
