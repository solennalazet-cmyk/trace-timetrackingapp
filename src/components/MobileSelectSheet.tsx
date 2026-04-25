import { useState, useRef, useCallback, useEffect } from "react";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Check, Plus, Loader2, Search } from "lucide-react";
import { cn } from "@/lib/utils";
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
  onSelect: (id: string, name: string) => void;
  onCreate?: (name: string) => Promise<ComboboxItem | null>;
}

const MobileSelectSheet = ({
  open,
  onOpenChange,
  items,
  value,
  title,
  placeholder = "Search…",
  allowCreate = true,
  creating: externalCreating,
  onSelect,
  onCreate,
}: MobileSelectSheetProps) => {
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const actionLockRef = useRef(false);

  const isCreating = externalCreating || creating;

  useEffect(() => {
    if (open) {
      actionLockRef.current = false;
      setSearch("");
      // IMPORTANT: do NOT auto-focus the search input. Auto-focus triggers the
      // mobile keyboard *after* the drawer's open animation finishes, which
      // reflows the viewport mid-interaction and causes a tap on one button to
      // land on a different button (the "double trigger" bug). The user can
      // tap the search field if they want to filter — that's an explicit
      // intent and the reflow then happens before any selection tap.
    }
  }, [open]);

  // Blur any focused element (closes the soft keyboard) before mutating state
  // so the keyboard collapse doesn't reflow the viewport during navigation.
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
      dismissKeyboard();
      onSelect(item.id, item.name);
      onOpenChange(false);
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

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      shouldScaleBackground={false}
      // Prevent vaul from mutating <body> styles. When this sheet is rendered
      // inside a Radix Dialog (Assignment / Manual / Call modals), both libs
      // try to lock the body, producing a visible double-reflow that feels
      // like the sheet opens twice. Disabling vaul's body styling avoids that.
      noBodyStyles
      setBackgroundColorOnScale={false}
    >
      <DrawerContent className="max-h-[85dvh] flex flex-col">
        <DrawerHeader className="pb-2">
          <DrawerTitle>{title}</DrawerTitle>
        </DrawerHeader>

        {/* Search bar */}
        <div className="px-4 pb-3">
          <div className="flex items-center gap-2 rounded-lg border border-input bg-background px-3 h-10">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
            <input
              ref={inputRef}
              className="flex-1 bg-transparent outline-none text-sm placeholder:text-muted-foreground min-w-0"
              placeholder={placeholder}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              disabled={isCreating}
            />
            {isCreating && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          </div>
        </div>

        {/* List */}
        <div
          className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-2 pb-[max(1rem,env(safe-area-inset-bottom))]"
          style={{ WebkitOverflowScrolling: "touch", touchAction: "pan-y" }}
        >
          {filtered.length === 0 && !showAddOption && (
            <div className="py-8 text-center text-sm text-muted-foreground">
              {items.length === 0 ? "Type to add new" : "No results"}
            </div>
          )}

          {/* Add option */}
          {showAddOption && (
            <button
              type="button"
              className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium text-primary-text active:bg-accent"
              onClick={handleCreate}
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
                "flex w-full items-center gap-3 rounded-lg px-3 py-3 text-sm active:bg-accent",
                value === item.id && "bg-accent/50 font-medium"
              )}
              onClick={() => handleSelect(item)}
            >
              <div className="w-5 h-5 flex items-center justify-center shrink-0">
                {value === item.id && <Check className="h-4 w-4 text-primary-text" />}
              </div>
              <span className="truncate">{item.name}</span>
            </button>
          ))}
        </div>
      </DrawerContent>
    </Drawer>
  );
};

export default MobileSelectSheet;
