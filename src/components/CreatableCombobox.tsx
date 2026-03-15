import { useState, useRef, useEffect } from "react";
import { Check, ChevronDown, Plus } from "lucide-react";
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
}

const CreatableCombobox = ({
  items,
  value,
  displayValue,
  placeholder,
  onSelect,
  onCreate,
}: CreatableComboboxProps) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const filtered = items.filter((item) =>
    item.name.toLowerCase().includes(search.toLowerCase())
  );

  const exactMatch = items.some(
    (item) => item.name.toLowerCase() === search.trim().toLowerCase()
  );

  const showAddOption = search.trim().length > 0 && !exactMatch;

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        // Restore display value if user clicked away
        if (!search.trim() && value) {
          setSearch("");
        }
      }
    };
    if (open) {
      document.addEventListener("mousedown", handler);
      return () => document.removeEventListener("mousedown", handler);
    }
  }, [open, value, search]);

  const handleFocus = () => {
    setOpen(true);
    setSearch("");
  };

  const handleSelect = (item: ComboboxItem) => {
    onSelect(item.id, item.name);
    setSearch("");
    setOpen(false);
  };

  const handleCreate = async () => {
    if (creating) return;
    const name = search.trim();
    if (!name) return;
    setCreating(true);
    // Set display value immediately so the field never goes blank
    const optimisticName = name;
    setSearch("");
    setOpen(false);
    
    const created = await onCreate(optimisticName);
    if (created) {
      onSelect(created.id, created.name);
    }
    setCreating(false);
  };

  const inputDisplay = open ? search : displayValue;

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
        />
        <ChevronDown className="h-4 w-4 opacity-50 shrink-0 ml-1" />
      </div>

      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover text-popover-foreground shadow-md max-h-48 overflow-y-auto">
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
              onMouseDown={(e) => {
                e.preventDefault();
                handleSelect(item);
              }}
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
              onMouseDown={(e) => {
                e.preventDefault();
                handleCreate();
              }}
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
