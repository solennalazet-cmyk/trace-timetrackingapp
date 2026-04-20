import { useState, useCallback, useRef } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import CreatableCombobox, { type ComboboxItem } from "@/components/CreatableCombobox";
import MobileSelectSheet from "@/components/MobileSelectSheet";

interface AdaptiveComboboxProps {
  items: ComboboxItem[];
  value: string;
  displayValue: string;
  placeholder: string;
  label: string; // Used as the sheet title on mobile
  onSelect: (id: string, name: string) => void;
  onCreate: (name: string) => Promise<ComboboxItem | null>;
  /** Optional ref to a scrollable ancestor — only used on desktop */
  scrollContainerRef?: React.RefObject<HTMLElement>;
  allowCreate?: boolean;
}

const AdaptiveCombobox = ({
  items,
  value,
  displayValue,
  placeholder,
  label,
  onSelect,
  onCreate,
  scrollContainerRef,
  allowCreate = true,
}: AdaptiveComboboxProps) => {
  const isMobile = useIsMobile();
  const [sheetOpen, setSheetOpen] = useState(false);
  // Guard against rapid double-taps re-triggering the drawer mid-animation.
  // vaul's open transition is ~500ms; we lock for slightly longer.
  const lastToggleAtRef = useRef(0);

  const handleSheetOpenChange = useCallback((next: boolean) => {
    const now = Date.now();
    if (next && now - lastToggleAtRef.current < 600) return;
    lastToggleAtRef.current = now;
    setSheetOpen(next);
  }, []);

  const openSheet = useCallback(() => {
    handleSheetOpenChange(true);
  }, [handleSheetOpenChange]);

  const handleMobileSelect = useCallback(
    (id: string, name: string) => {
      onSelect(id, name);
    },
    [onSelect]
  );

  const handleMobileCreate = useCallback(
    async (name: string) => {
      const created = await onCreate(name);
      if (created) {
        onSelect(created.id, created.name);
      }
      return created;
    },
    [onCreate, onSelect]
  );

  if (isMobile) {
    return (
      <>
        <button
          type="button"
          // touch-manipulation removes 300ms tap delay & double-fire risk on Android.
          // select-none avoids long-press selection that can synthesize an extra event.
          className={cn(
            "flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background touch-manipulation select-none",
            !displayValue && "text-muted-foreground"
          )}
          onClick={(e) => {
            // Prevent the click from bubbling to any parent that might also react.
            e.stopPropagation();
            openSheet();
          }}
        >
          <span className="truncate pointer-events-none">{displayValue || placeholder}</span>
          <ChevronDown className="h-4 w-4 opacity-50 shrink-0 ml-1 pointer-events-none" />
        </button>
        <MobileSelectSheet
          open={sheetOpen}
          onOpenChange={handleSheetOpenChange}
          items={items}
          value={value}
          title={label}
          placeholder={`Search ${label.toLowerCase()}…`}
          allowCreate={allowCreate}
          onSelect={handleMobileSelect}
          onCreate={handleMobileCreate}
        />
      </>
    );
  }

  return (
    <CreatableCombobox
      items={items}
      value={value}
      displayValue={displayValue}
      placeholder={placeholder}
      onSelect={onSelect}
      onCreate={onCreate}
      scrollContainerRef={scrollContainerRef}
    />
  );
};

export { type ComboboxItem };
export default AdaptiveCombobox;
