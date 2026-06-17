import { ReactNode, useRef, useState, TouchEvent } from "react";
import { Trash2 } from "lucide-react";

interface Props {
  onDelete: () => void;
  children: ReactNode;
  /** px to reveal the delete action */
  revealWidth?: number;
}

/**
 * Mobile swipe-to-reveal delete. Swipe left to expose a destructive action.
 * Tap outside or swipe right to close. Tap on the row itself closes if open.
 */
const SwipeToDeleteRow = ({ onDelete, children, revealWidth = 88 }: Props) => {
  const [offset, setOffset] = useState(0);
  const [open, setOpen] = useState(false);
  const startX = useRef(0);
  const startOffset = useRef(0);
  const moved = useRef(false);

  const onTouchStart = (e: TouchEvent) => {
    startX.current = e.touches[0].clientX;
    startOffset.current = open ? -revealWidth : 0;
    moved.current = false;
  };
  const onTouchMove = (e: TouchEvent) => {
    const dx = e.touches[0].clientX - startX.current;
    if (Math.abs(dx) > 6) moved.current = true;
    let next = startOffset.current + dx;
    if (next > 0) next = 0;
    if (next < -revealWidth - 24) next = -revealWidth - 24;
    setOffset(next);
  };
  const onTouchEnd = () => {
    if (offset < -revealWidth / 2) {
      setOpen(true);
      setOffset(-revealWidth);
    } else {
      setOpen(false);
      setOffset(0);
    }
  };

  // If user taps the row while open, close it (and swallow click)
  const onClickCapture = (e: React.MouseEvent) => {
    if (open) {
      e.stopPropagation();
      e.preventDefault();
      setOpen(false);
      setOffset(0);
    }
  };

  return (
    <div className="relative overflow-hidden rounded-xl">
      {/* Delete action background */}
      <button
        type="button"
        onClick={onDelete}
        aria-label="Delete"
        className="absolute inset-y-0 right-0 flex items-center justify-center gap-1.5 bg-destructive text-destructive-foreground font-semibold text-sm transition-opacity"
        style={{ width: revealWidth, opacity: offset < -8 ? 1 : 0 }}
      >
        <Trash2 className="h-4 w-4" />
        Delete
      </button>

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

export default SwipeToDeleteRow;
