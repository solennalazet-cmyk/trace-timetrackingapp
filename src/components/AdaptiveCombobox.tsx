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
  const lastOpenRequestAtRef = useRef(0);
  const ignoreClicksUntilRef = useRef(0);
  const ignoreSyntheticClickUntilRef = useRef(0);

  const handleSheetOpenChange = useCallback((next: boolean) => {
    const now = Date.now();
    if (next) {
      // Only block re-open if we're already open OR a recent close just happened.
      // The keyboard-reflow root cause is fixed in MobileSelectSheet (no auto-focus
      // + pointer capture + interactive-widget=resizes-content), so this guard is
      // now just a small safety net (200ms) for genuinely accidental double taps.
      if (sheetOpen || now < ignoreClicksUntilRef.current) return;
      lastOpenRequestAtRef.current = now;
    } else {
      ignoreClicksUntilRef.current = now + 200;
    }
    setSheetOpen(next);
  }, [sheetOpen]);

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
      return onCreate(name);
    },
    [onCreate]
  );

  if (isMobile) {
    return (
      <>
        <button
          type="button"
          // Touch opens on pointer-up, not pointer-down: this prevents the same
          // tap from opening the sheet and then landing on an option after the
          // viewport/keyboard or drawer has moved under the user's finger.
          className={cn(
            "flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background touch-manipulation select-none",
            !displayValue && "text-muted-foreground"
          )}
          onPointerDown={(e) => {
            if (e.pointerType !== "touch") return;
            e.preventDefault();
            e.stopPropagation();
          }}
          onPointerUp={(e) => {
            if (e.pointerType !== "touch") return;
            e.preventDefault();
            e.stopPropagation();
            ignoreSyntheticClickUntilRef.current = Date.now() + 500;
            openSheet();
          }}
          onClick={(e) => {
            if (Date.now() < ignoreSyntheticClickUntilRef.current) {
              e.preventDefault();
              e.stopPropagation();
              return;
            }
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
