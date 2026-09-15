import { useState, useRef, useCallback, useEffect, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import { Check, Plus, Loader2, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import InlineDots from "@/components/InlineDots";
import type { ComboboxItem } from "@/components/CreatableCombobox";

interface MobileSelectSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: ComboboxItem[];
  value: string;
  title: string;
  placeholder?: string;
  allowCreate?: boolean;
  creating?: boolean;
  /** When true and the items list is empty, show inline dots in the list and
   *  search bar instead of the empty state. */
  loading?: boolean;
  onSelect: (id: string, name: string) => void;
  onCreate?: (name: string) => Promise<ComboboxItem | null>;
}

/**
 * Lightweight bottom sheet rendered in a portal.
 *
 * It deliberately does NOT use vaul's Drawer: this sheet is opened from inside
 * a Radix Dialog (the assignment recap), and having two libraries animate,
 * scroll-lock and re-measure the viewport at the same time is what made the
 * panel visibly bounce up and down when the soft keyboard appeared. A single
 * CSS transform transition keeps the motion to one smooth slide.
 */
const MobileSelectSheet = ({
  open,
  onOpenChange,
  items,
  value,
  title,
  placeholder = "Search…",
  allowCreate = true,
  creating: externalCreating,
  loading = false,
  onSelect,
  onCreate,
}: MobileSelectSheetProps) => {
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [mounted, setMounted] = useState(open);
  const [visible, setVisible] = useState(false);
  const [keyboardOffset, setKeyboardOffset] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const actionLockRef = useRef(false);
  const touchStartRef = useRef<{ pointerId: number; x: number; y: number } | null>(null);

  // This sheet is portalled to <body>, so it lives *outside* the Radix dialog
  // that opened it. Radix's focus scope listens for `focusin` on document and
  // yanks focus back inside the dialog — which closes the soft keyboard, the
  // user taps again, and the panel visibly bounces. Swallowing focus events at
  // the sheet root keeps focus here without disabling the dialog's trap.
  useEffect(() => {
    const node = rootRef.current;
    if (!mounted || !node) return;
    const swallow = (e: Event) => e.stopPropagation();
    node.addEventListener("focusin", swallow);
    node.addEventListener("focusout", swallow);
    // The parent dialog's scroll lock also treats this portal as "outside" and
    // would cancel touch scrolling inside the list.
    node.addEventListener("touchmove", swallow, { passive: true });
    node.addEventListener("wheel", swallow, { passive: true });
    return () => {
      node.removeEventListener("focusin", swallow);
      node.removeEventListener("focusout", swallow);
      node.removeEventListener("touchmove", swallow);
      node.removeEventListener("wheel", swallow);
    };
  }, [mounted]);

  // Keep the panel pinned to the top of the soft keyboard instead of letting
  // the browser scroll the whole layout viewport around it.
  useEffect(() => {
    if (!mounted || typeof window === "undefined" || !window.visualViewport) return;
    const vv = window.visualViewport;
    const update = () => {
      const offset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      setKeyboardOffset(offset);
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, [mounted]);

  const isCreating = externalCreating || creating;

  // Mount / unmount with a short slide transition.
  useEffect(() => {
    if (open) {
      actionLockRef.current = false;
      setSearch("");
      setMounted(true);
      const raf = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(raf);
    }
    setVisible(false);
    const t = setTimeout(() => setMounted(false), 180);
    return () => clearTimeout(t);
  }, [open]);

  // Close on Escape / hardware back-ish key.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onOpenChange(false);
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open, onOpenChange]);

  const dismissKeyboard = useCallback(() => {
    const active = document.activeElement as HTMLElement | null;
    if (active && typeof active.blur === "function") active.blur();
  }, []);

  const filtered = items.filter((item) =>
    item.name.toLowerCase().includes(search.toLowerCase())
  );

  const exactMatch = items.some(
    (item) => item.name.toLowerCase() === search.trim().toLowerCase()
  );

  const showAddOption = allowCreate && onCreate && search.trim().length > 0 && !exactMatch;

  const handleSelect = useCallback(
    (item: ComboboxItem) => {
      if (actionLockRef.current) return;
      actionLockRef.current = true;
      // Commit the selection before closing the keyboard. On mobile, blurring
      // first can move the sheet between touch-down and click and cancel the tap.
      onSelect(item.id, item.name);
      onOpenChange(false);
      dismissKeyboard();
    },
    [onSelect, onOpenChange, dismissKeyboard]
  );

  const handleCreate = useCallback(async () => {
    if (actionLockRef.current || isCreating || !onCreate) return;
    const name = search.trim();
    if (!name) return;
    actionLockRef.current = true;
    dismissKeyboard();
    setCreating(true);
    const created = await onCreate(name);
    if (created) {
      onSelect(created.id, created.name);
      onOpenChange(false);
    }
    setCreating(false);
    if (!created) actionLockRef.current = false;
  }, [isCreating, onCreate, search, onSelect, onOpenChange, dismissKeyboard]);

  // Mobile browsers may cancel the synthetic click when the keyboard changes
  // the visual viewport between touch-down and touch-up. Recognise a real tap
  // from the pointer sequence instead, while still allowing vertical scrolling.
  const touchTapHandlers = useCallback((action: () => void) => ({
    onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (event.pointerType !== "touch") {
        event.preventDefault();
        return;
      }
      touchStartRef.current = {
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    onPointerUp: (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (event.pointerType !== "touch") return;
      const start = touchStartRef.current;
      touchStartRef.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      if (
        start?.pointerId === event.pointerId &&
        Math.hypot(event.clientX - start.x, event.clientY - start.y) <= 12
      ) {
        event.preventDefault();
        event.stopPropagation();
        action();
      }
    },
    onPointerCancel: () => {
      touchStartRef.current = null;
    },
  }), []);

  if (!mounted || typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={rootRef}
      className="pointer-events-auto fixed inset-0 z-[70]"
      role="dialog"
      aria-label={title}
    >
      <div
        className={cn(
          "absolute inset-0 bg-black/50 transition-opacity duration-150",
          visible ? "opacity-100" : "opacity-0"
        )}
        onClick={() => {
          dismissKeyboard();
          onOpenChange(false);
        }}
      />

      <div
        className={cn(
          "absolute inset-x-0 bottom-0 flex flex-col rounded-t-2xl border-t bg-background shadow-lg",
          "transition-transform duration-200 ease-out will-change-transform",
          visible ? "translate-y-0" : "translate-y-full"
        )}
        style={{
          bottom: keyboardOffset,
          maxHeight: `calc(85dvh - ${keyboardOffset}px)`,
        }}
      >
        <div className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-muted" />

        <div className="flex items-center justify-between px-4 pb-2 pt-3">
          <h2 className="text-base font-semibold">{title}</h2>
          <button
            type="button"
            aria-label="Close"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground active:bg-accent"
            onClick={() => {
              dismissKeyboard();
              onOpenChange(false);
            }}
          >
            <X className="h-5 w-5 pointer-events-none" />
          </button>
        </div>

        {/* Search bar */}
        <div className="px-4 pb-3">
          <div className="flex items-center gap-2 rounded-lg border border-input bg-background px-3 h-10">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
            <input
              ref={inputRef}
              type="text"
              inputMode="text"
              autoComplete="off"
              autoCapitalize="words"
              className="flex-1 bg-transparent outline-none text-sm placeholder:text-muted-foreground min-w-0"
              placeholder={placeholder}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              disabled={isCreating}
            />
            {isCreating ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : loading && items.length === 0 ? (
              <InlineDots label={`Loading ${title}`} />
            ) : null}
          </div>
        </div>

        {/* List */}
        <div
          className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-2 pb-[max(1rem,env(safe-area-inset-bottom))]"
          style={{ WebkitOverflowScrolling: "touch", touchAction: "pan-y" }}
        >
          {filtered.length === 0 && !showAddOption && (
            loading ? (
              <div className="py-8 flex justify-center">
                <InlineDots label={`Loading ${title}`} />
              </div>
            ) : (
              <div className="py-8 text-center text-sm text-muted-foreground">
                {items.length === 0 ? "Type to add new" : "No results"}
              </div>
            )
          )}

          {showAddOption && (
            <button
              type="button"
              className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium text-nav-bg active:bg-accent touch-manipulation select-none"
              onClick={handleCreate}
              {...touchTapHandlers(handleCreate)}
              onMouseDown={(event) => event.preventDefault()}
              disabled={isCreating}
            >
              <Plus className="h-5 w-5 shrink-0" />
              <span>Add &lsquo;{search.trim()}&rsquo;</span>
            </button>
          )}

          {filtered.map((item) => (
            <button
              key={item.id}
              type="button"
              className={cn(
                "flex w-full items-center gap-3 rounded-lg px-3 py-3 text-sm active:bg-accent touch-manipulation select-none",
                value === item.id && "bg-accent/50 font-medium"
              )}
              {...touchTapHandlers(() => handleSelect(item))}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => handleSelect(item)}
            >
              <div className="w-5 h-5 flex items-center justify-center shrink-0">
                {value === item.id && <Check className="h-4 w-4 text-nav-bg" />}
              </div>
              <span className="truncate">{item.name}</span>
            </button>
          ))}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default MobileSelectSheet;
