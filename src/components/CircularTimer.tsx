interface CircularTimerProps {
  /** 0–1, how full the arc is */
  progress?: number;
  /** Color of the active arc */
  arcColor?: string;
  /** Whether timer is pulsing */
  pulsing?: boolean;
  /** Dim ring (paused state) */
  dimmed?: boolean;
  /** Fill the entire circle (shift active) */
  filled?: boolean;
  /** Fill color for shift */
  fillColor?: string;
  /** Show a draggable handle at the end of the arc */
  showHandle?: boolean;
  children: React.ReactNode;
}

const SIZE = 240;
const STROKE = 6;
const RADIUS = (SIZE - STROKE * 2) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const CircularTimer = ({
  progress = 0,
  arcColor = "hsl(53, 98%, 77%)",
  pulsing = false,
  dimmed = false,
  filled = false,
  fillColor,
  showHandle = false,
  children,
}: CircularTimerProps) => {
  const offset = CIRCUMFERENCE - progress * CIRCUMFERENCE;

  return (
    <div
      className="relative flex items-center justify-center mx-auto"
      style={{
        width: SIZE,
        height: SIZE,
        animation: pulsing ? "timer-pulse 2s ease-in-out infinite" : undefined,
        opacity: dimmed ? 0.6 : 1,
        transition: "opacity 0.3s ease",
      }}
    >
      <svg
        width={SIZE}
        height={SIZE}
        className="absolute inset-0"
        style={{ transform: "rotate(-90deg)" }}
      >
        {/* Background ring */}
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill={filled ? fillColor || "hsl(330, 81%, 60%)" : "transparent"}
          stroke="hsl(var(--timer-ring))"
          strokeWidth={STROKE}
        />
        {/* Progress arc */}
        {progress > 0 && !filled && (
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="transparent"
            stroke={arcColor}
            strokeWidth={STROKE + 2}
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={offset}
            strokeLinecap="round"
            style={{ transition: "stroke-dashoffset 0.5s ease" }}
          />
        )}
        {/* Drag handle */}
        {showHandle && progress > 0 && !filled && (() => {
          const angle = progress * 2 * Math.PI - Math.PI / 2;
          const hx = SIZE / 2 + RADIUS * Math.cos(angle);
          const hy = SIZE / 2 + RADIUS * Math.sin(angle);
          return (
            <circle
              cx={hx}
              cy={hy}
              r={7}
              fill="white"
              stroke={arcColor}
              strokeWidth={2}
              style={{ filter: "drop-shadow(0 1px 3px rgba(0,0,0,0.25))" }}
            />
          );
        })()}
      </svg>
      {/* Centre content */}
      <div className="relative z-10 flex flex-col items-center justify-center">
        {children}
      </div>

      <style>{`
        @keyframes timer-pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.02); }
        }
      `}</style>
    </div>
  );
};

export default CircularTimer;
