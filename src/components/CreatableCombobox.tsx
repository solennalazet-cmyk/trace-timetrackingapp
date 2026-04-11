import { useState, useRef, useEffect, useCallback, type TouchEvent } from "react";
import { Check, ChevronDown, Plus, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ComboboxItem {
  id: string;
  name: string;
}

interface CreatableComboboxProps {
  items: ComboboxItem[];
  value: string; // selected id
  displayValue: string; // displayed text when selected
  placeholder: string;
  onSelect: (id: string, name: string) => void;
  onCreate: (name: string) => Promise<ComboboxItem | null>;
  /** Optional ref to a scrollable ancestor — dropdown closes on scroll */
  scrollContainerRef?: React.RefObject<HTMLElement>;
}

const CreatableCombobox = ({
  items,
  value,
  displayValue,
  placeholder,
  onSelect,
  onCreate,
  scrollContainerRef,
}: CreatableComboboxProps) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [pendingName, setPendingName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const touchStartYRef = useRef<number | null>(null);
  const touchMovedRef = useRef(false);

  const filtered = items.filter((item) =>
    item.name.toLowerCase().includes(search.toLowerCase())
  );

  const exactMatch = items.some(
    (item) => item.name.toLowerCase() === search.trim().toLowerCase()
  );

  const showAddOption = search.trim().length > 0 && !exactMatch;

  const closeDropdown = useCallback(() => {
    setOpen(false);
    setSearch("");
  }, []);

  // Close on outside click / touch
  useEffect(() => {
    if (!open) return;

    const handler = (e: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        closeDropdown();
      }
    };

    document.addEventListener("mousedown", handler);
    document.addEventListener("touchstart", handler, { passive: true });
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("touchstart", handler);
    };
  }, [open, closeDropdown]);

  // Close dropdown when parent scroll container scrolls
  useEffect(() => {
    if (!open) return;
    const el = scrollContainerRef?.current;
    if (!el) return;

    const onScroll = () => closeDropdown();
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [open, scrollContainerRef, closeDropdown]);

  // Clear pendingName once parent displayValue catches up
  useEffect(() => {
    if (pendingName && displayValue === pendingName) {
      setPendingName("");
    }
  }, [displayValue, pendingName]);

  const handleFocus = () => {
    setOpen(true);
    setSearch("");
  };

  const handleSelect = (item: ComboboxItem) => {
    onSelect(item.id, item.name);
    setSearch("");
    setOpen(false);
  };

  const handleTouchStart = (event: TouchEvent<HTMLButtonElement>) => {
    touchStartYRef.current = event.touches[0]?.clientY ?? null;
    touchMovedRef.current = false;
  };

  const handleTouchMove = (event: TouchEvent<HTMLButtonElement>) => {
    const startY = touchStartYRef.current;
    const currentY = event.touches[0]?.clientY;

    if (startY == null || currentY == null) return;
    if (Math.abs(currentY - startY) > 8) {
      touchMovedRef.current = true;
    }
  };

  const runIfNotScrolling = (callback: () => void) => {
    if (touchMovedRef.current) {
      return;
    }

    callback();
  };

  const handleCreate = async () => {
    if (creating) return;
    const name = search.trim();
    if (!name) return;
    setCreating(true);
    setPendingName(name);
    setSearch("");
    setOpen(false);

    const created = await onCreate(name);
    if (created) {
      onSelect(created.id, created.name);
    } else {
      setPendingName("");
    }
    setCreating(false);
  };

  const inputDisplay = open ? search : (pendingName || displayValue);

  return (
    <div ref={containerRef} className="relative">
      <div
        className={cn(
          "flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background cursor-text",
          open && "ring-2 ring-ring ring-offset-2"
        )}
        onClick={() => {
          inputRef.current?.focus();
        }}
      >
        <input
          ref={inputRef}
          className="flex-1 bg-transparent outline-none placeholder:text-muted-foreground min-w-0"
          placeholder={displayValue || placeholder}
          value={inputDisplay}
          onChange={(e) => {
            setSearch(e.target.value);
            if (!open) setOpen(true);
          }}
          onFocus={handleFocus}
          disabled={creating}
        />
        {creating ? (
          <Loader2 className="h-4 w-4 opacity-50 shrink-0 ml-1 animate-spin" />
        ) : (
          <ChevronDown className="h-4 w-4 opacity-50 shrink-0 ml-1" />
        )}
      </div>

      {open && (
        <div
          className="absolute z-50 mt-1 w-full max-h-48 overflow-y-auto overscroll-contain rounded-md border bg-popover text-popover-foreground shadow-md"
          style={{ WebkitOverflowScrolling: "touch", touchAction: "pan-y" }}
        >
          {filtered.length === 0 && !showAddOption && (
            <div className="py-3 text-center text-sm text-muted-foreground">
              {items.length === 0 ? "Type to add new" : "No results"}
            </div>
          )}

          {filtered.map((item) => (
            <button
              key={item.id}
              type="button"
              className="relative flex w-full items-center rounded-sm px-3 py-2 text-sm outline-none hover:bg-accent hover:text-accent-foreground cursor-pointer"
              onClick={() => runIfNotScrolling(() => handleSelect(item))}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
            >
              {value === item.id && (
                <Check className="h-4 w-4 mr-2 shrink-0" />
              )}
              <span className={cn(value !== item.id && "ml-6")}>{item.name}</span>
            </button>
          ))}

          {showAddOption && (
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-sm px-3 py-2 text-sm outline-none hover:bg-accent hover:text-accent-foreground cursor-pointer text-timer-display font-medium"
              onClick={() => runIfNotScrolling(handleCreate)}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
            >
              <Plus className="h-4 w-4 shrink-0" />
              Add &lsquo;{search.trim()}&rsquo;
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default CreatableCombobox;
