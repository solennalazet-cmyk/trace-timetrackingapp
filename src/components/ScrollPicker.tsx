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
  const touchStartY = useRef(0);
  const scrollStartTop = useRef(0);
  const velocityY = useRef(0);
  const lastTouchY = useRef(0);
  const lastTouchTime = useRef(0);
  const animFrameRef = useRef<number>();

  const getScrollTop = () => containerRef.current?.scrollTop ?? 0;

  const setScrollTop = useCallback((top: number) => {
    if (containerRef.current) containerRef.current.scrollTop = top;
  }, []);

  const snapToNearest = useCallback((smooth = true) => {
    const el = containerRef.current;
    if (!el) return;
    const index = Math.round(el.scrollTop / ITEM_HEIGHT);
    const clamped = Math.max(0, Math.min(values.length - 1, index));
    const target = clamped * ITEM_HEIGHT;
    if (smooth) {
      el.scrollTo({ top: target, behavior: "smooth" });
    } else {
      el.scrollTop = target;
    }
    if (values[clamped] !== selected) {
      onChange(values[clamped]);
    }
  }, [values, selected, onChange]);

  // Scroll to selected value on mount / when selected changes externally
  useEffect(() => {
    if (isUserScrolling.current) return;
    const idx = values.indexOf(selected);
    if (idx >= 0) {
      setScrollTop(idx * ITEM_HEIGHT);
    }
  }, [selected, values, setScrollTop]);

  // Touch-based scrolling for reliable mobile behavior
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onTouchStart = (e: TouchEvent) => {
      isUserScrolling.current = true;
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      touchStartY.current = e.touches[0].clientY;
      scrollStartTop.current = el.scrollTop;
      lastTouchY.current = e.touches[0].clientY;
      lastTouchTime.current = Date.now();
      velocityY.current = 0;
    };

    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      const currentY = e.touches[0].clientY;
      const diff = touchStartY.current - currentY;
      const now = Date.now();
      const dt = now - lastTouchTime.current;
      if (dt > 0) {
        velocityY.current = (lastTouchY.current - currentY) / dt;
      }
      lastTouchY.current = currentY;
      lastTouchTime.current = now;

      const maxScroll = (values.length - 1) * ITEM_HEIGHT;
      const newTop = Math.max(0, Math.min(maxScroll, scrollStartTop.current + diff));
      el.scrollTop = newTop;
    };

    const onTouchEnd = () => {
      // Apply momentum
      const v = velocityY.current;
      if (Math.abs(v) > 0.3) {
        const momentum = v * 120;
        const maxScroll = (values.length - 1) * ITEM_HEIGHT;
        const target = Math.max(0, Math.min(maxScroll, el.scrollTop + momentum));
        el.scrollTo({ top: target, behavior: "smooth" });
        setTimeout(() => {
          snapToNearest(true);
          isUserScrolling.current = false;
        }, 200);
      } else {
        snapToNearest(true);
        isUserScrolling.current = false;
      }
    };

    el.addEventListener("touchstart", onTouchStart, { passive: false });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd);

    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
    };
  }, [values, snapToNearest]);

  // Mouse wheel support for desktop
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const el = containerRef.current;
    if (!el) return;
    isUserScrolling.current = true;
    const maxScroll = (values.length - 1) * ITEM_HEIGHT;
    const newTop = Math.max(0, Math.min(maxScroll, el.scrollTop + e.deltaY));
    el.scrollTop = newTop;
    clearTimeout((handleWheel as any)._timeout);
    (handleWheel as any)._timeout = setTimeout(() => {
      snapToNearest(true);
      isUserScrolling.current = false;
    }, 100);
  }, [values, snapToNearest]);

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
          className="h-full overflow-hidden scrollbar-hide overscroll-contain touch-none"
          onWheel={handleWheel}
        >
          {/* Top padding so first item can center */}
          <div style={{ height: padding }} />
          {values.map((val) => {
            const isSelected = val === selected;
            return (
              <div
                key={val}
                className="flex items-center justify-center select-none"
                style={{ height: ITEM_HEIGHT }}
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
  seconds?: number;
  onChangeHours: (h: number) => void;
  onChangeMinutes: (m: number) => void;
  onChangeSeconds?: (s: number) => void;
  maxHours?: number;
  showSeconds?: boolean;
}

const ScrollPicker = ({
  hours, minutes,
  onChangeHours, onChangeMinutes, onChangeSeconds,
  maxHours = 23,
  showSeconds = false,
  seconds = 0,
}: ScrollPickerProps) => {
  const hourValues = Array.from({ length: maxHours + 1 }, (_, i) => i);
  const minuteValues = Array.from({ length: 60 }, (_, i) => i);
  const secondValues = Array.from({ length: 60 }, (_, i) => i);

  return (
    <div className="flex items-center gap-0 w-full max-w-[260px] mx-auto">
      <ScrollPickerColumn values={hourValues} selected={hours} onChange={onChangeHours} label="Hours" />
      <div className="flex flex-col items-center justify-center pt-5" style={{ height: 5 * ITEM_HEIGHT }}>
        <span className="text-2xl font-bold text-muted-foreground">:</span>
      </div>
      <ScrollPickerColumn values={minuteValues} selected={minutes} onChange={onChangeMinutes} label="Min" />
      {showSeconds && onChangeSeconds && (
        <>
          <div className="flex flex-col items-center justify-center pt-5" style={{ height: 5 * ITEM_HEIGHT }}>
            <span className="text-2xl font-bold text-muted-foreground">:</span>
          </div>
          <ScrollPickerColumn values={secondValues} selected={seconds} onChange={onChangeSeconds} label="Sec" />
        </>
      )}
    </div>
  );
};

export default ScrollPicker;
