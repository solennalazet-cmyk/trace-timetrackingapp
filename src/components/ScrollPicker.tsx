import { useRef, useEffect, useCallback } from "react";

interface ScrollPickerColumnProps {
  values: number[];
  selected: number;
  onChange: (val: number) => void;
  label: string;
}

const ITEM_HEIGHT = 48;
const VISIBLE_ITEMS = 5;
const CENTER_INDEX = Math.floor(VISIBLE_ITEMS / 2);

const ScrollPickerColumn = ({ values, selected, onChange, label }: ScrollPickerColumnProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const isUserScrolling = useRef(false);
  const scrollTimeout = useRef<ReturnType<typeof setTimeout>>();

  const scrollToIndex = useCallback((index: number, smooth = false) => {
    const el = containerRef.current;
    if (!el) return;
    const top = index * ITEM_HEIGHT;
    el.scrollTo({ top, behavior: smooth ? "smooth" : "auto" });
  }, []);

  // Scroll to selected value on mount / when selected changes externally
  useEffect(() => {
    if (isUserScrolling.current) return;
    const idx = values.indexOf(selected);
    if (idx >= 0) scrollToIndex(idx);
  }, [selected, values, scrollToIndex]);

  const handleScroll = () => {
    isUserScrolling.current = true;
    if (scrollTimeout.current) clearTimeout(scrollTimeout.current);
    scrollTimeout.current = setTimeout(() => {
      const el = containerRef.current;
      if (!el) return;
      const index = Math.round(el.scrollTop / ITEM_HEIGHT);
      const clamped = Math.max(0, Math.min(values.length - 1, index));
      scrollToIndex(clamped, true);
      if (values[clamped] !== selected) {
        onChange(values[clamped]);
      }
      isUserScrolling.current = false;
    }, 80);
  };

  const padding = CENTER_INDEX * ITEM_HEIGHT;

  return (
    <div className="flex flex-col items-center flex-1">
      <span className="text-[10px] font-semibold tracking-wider uppercase text-muted-foreground mb-1">{label}</span>
      <div
        className="relative overflow-hidden"
        style={{ height: VISIBLE_ITEMS * ITEM_HEIGHT }}
      >
        {/* Highlight band for center item */}
        <div
          className="absolute left-0 right-0 pointer-events-none z-10 border-y border-border"
          style={{ top: CENTER_INDEX * ITEM_HEIGHT, height: ITEM_HEIGHT }}
        />
        {/* Fade masks */}
        <div
          className="absolute top-0 left-0 right-0 pointer-events-none z-20"
          style={{
            height: CENTER_INDEX * ITEM_HEIGHT,
            background: "linear-gradient(to bottom, hsl(var(--background)), hsl(var(--background) / 0))",
          }}
        />
        <div
          className="absolute bottom-0 left-0 right-0 pointer-events-none z-20"
          style={{
            height: CENTER_INDEX * ITEM_HEIGHT,
            background: "linear-gradient(to top, hsl(var(--background)), hsl(var(--background) / 0))",
          }}
        />
        <div
          ref={containerRef}
          className="h-full overflow-y-auto scrollbar-hide overscroll-contain"
          style={{
            scrollSnapType: "y mandatory",
            WebkitOverflowScrolling: "touch",
          }}
          onScroll={handleScroll}
        >
          {/* Top padding so first item can center */}
          <div style={{ height: padding }} />
          {values.map((val) => {
            const isSelected = val === selected;
            return (
              <div
                key={val}
                className="flex items-center justify-center select-none"
                style={{
                  height: ITEM_HEIGHT,
                  scrollSnapAlign: "start",
                }}
              >
                <span
                  className={
                    isSelected
                      ? "text-3xl font-bold text-foreground transition-all"
                      : "text-xl font-medium text-muted-foreground/50 transition-all"
                  }
                  style={{ fontFamily: "'Space Grotesk', monospace" }}
                >
                  {String(val).padStart(2, "0")}
                </span>
              </div>
            );
          })}
          {/* Bottom padding so last item can center */}
          <div style={{ height: padding }} />
        </div>
      </div>
    </div>
  );
};

interface ScrollPickerProps {
  hours: number;
  minutes: number;
  seconds: number;
  onChangeHours: (h: number) => void;
  onChangeMinutes: (m: number) => void;
  onChangeSeconds: (s: number) => void;
  maxHours?: number;
}

const ScrollPicker = ({
  hours, minutes, seconds,
  onChangeHours, onChangeMinutes, onChangeSeconds,
  maxHours = 23,
}: ScrollPickerProps) => {
  const hourValues = Array.from({ length: maxHours + 1 }, (_, i) => i);
  const minuteValues = Array.from({ length: 60 }, (_, i) => i);
  const secondValues = Array.from({ length: 60 }, (_, i) => i);

  return (
    <div className="flex items-center gap-0 w-full max-w-[300px] mx-auto">
      <ScrollPickerColumn values={hourValues} selected={hours} onChange={onChangeHours} label="Hours" />
      <div className="flex flex-col items-center justify-center pt-5" style={{ height: 5 * ITEM_HEIGHT }}>
        <span className="text-2xl font-bold text-muted-foreground">:</span>
      </div>
      <ScrollPickerColumn values={minuteValues} selected={minutes} onChange={onChangeMinutes} label="Min" />
      <div className="flex flex-col items-center justify-center pt-5" style={{ height: 5 * ITEM_HEIGHT }}>
        <span className="text-2xl font-bold text-muted-foreground">:</span>
      </div>
      <ScrollPickerColumn values={secondValues} selected={seconds} onChange={onChangeSeconds} label="Sec" />
    </div>
  );
};

export default ScrollPicker;
