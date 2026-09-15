import { ReactNode, useRef, useState, TouchEvent } from "react";

export interface SwipeAction {
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
  onAction: () => void;
  /** tailwind classes for the action background/text */
  className: string;
}

interface Props {
  actions: SwipeAction[];
  children: ReactNode;
  /** px revealed per action */
  actionWidth?: number;
  disabled?: boolean;
}

/**
 * Swipe right-to-left to reveal one or more actions (e.g. Approve / Reject).
 * Tapping the row while open closes it and swallows the click.
 */
const SwipeActionsRow = ({ actions, children, actionWidth = 84, disabled = false }: Props) => {
  const revealWidth = actionWidth * actions.length;
  const [offset, setOffset] = useState(0);
  const [open, setOpen] = useState(false);
  const startX = useRef(0);
  const startY = useRef(0);
  const startOffset = useRef(0);
  const horizontal = useRef(false);

  const close = () => { setOpen(false); setOffset(0); };

  const onTouchStart = (e: TouchEvent) => {
    if (disabled) return;
    startX.current = e.touches[0].clientX;
    startY.current = e.touches[0].clientY;
    startOffset.current = open ? -revealWidth : 0;
    horizontal.current = false;
  };
  const onTouchMove = (e: TouchEvent) => {
    if (disabled) return;
    const dx = e.touches[0].clientX - startX.current;
    const dy = e.touches[0].clientY - startY.current;
    if (!horizontal.current && Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) horizontal.current = true;
    if (!horizontal.current) return;
    let next = startOffset.current + dx;
    if (next > 0) next = 0;
    if (next < -revealWidth - 24) next = -revealWidth - 24;
    setOffset(next);
  };
  const onTouchEnd = () => {
    if (disabled) return;
    if (offset < -revealWidth / 2) { setOpen(true); setOffset(-revealWidth); }
    else close();
  };

  const onClickCapture = (e: React.MouseEvent) => {
    if (open) {
      e.stopPropagation();
      e.preventDefault();
      close();
    }
  };

  return (
    <div className="relative overflow-hidden rounded-2xl">
      <div className="absolute inset-y-0 right-0 flex" style={{ opacity: offset < -8 ? 1 : 0 }}>
        {actions.map((a) => (
          <button
            key={a.label}
            type="button"
            onClick={() => { close(); a.onAction(); }}
            aria-label={a.label}
            className={`flex flex-col items-center justify-center gap-1 text-xs font-semibold ${a.className}`}
            style={{ width: actionWidth }}
          >
            <a.Icon className="h-4 w-4" />
            {a.label}
          </button>
        ))}
      </div>

      <div
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onClickCapture={onClickCapture}
        style={{
          transform: `translateX(${offset}px)`,
          transition: offset === 0 || offset === -revealWidth ? "transform 0.2s ease" : "none",
          touchAction: "pan-y",
        }}
      >
        {children}
      </div>
    </div>
  );
};

export default SwipeActionsRow;
