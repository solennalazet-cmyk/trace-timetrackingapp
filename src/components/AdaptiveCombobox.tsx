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
  /** When true and the items list is empty, show the inline dots loader
   *  instead of the empty "Type to add new" / "No results" state. */
  loading?: boolean;
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
  loading = false,
}: AdaptiveComboboxProps) => {
  const isMobile = useIsMobile();
  const [sheetOpen, setSheetOpen] = useState(false);
  const ignoreOpenUntilRef = useRef(0);

  const handleSheetOpenChange = useCallback((next: boolean) => {
    const now = Date.now();
    if (next) {
      // Ignore an open request that arrives right after a close (the same tap
      // replayed as a synthetic click).
      if (sheetOpen || now < ignoreOpenUntilRef.current) return;
    } else {
      ignoreOpenUntilRef.current = now + 250;
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
          className={cn(
            "flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background touch-manipulation select-none",
            !displayValue && "text-muted-foreground"
          )}
          onClick={(e) => {
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
          loading={loading}
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
      loading={loading}
    />
  );
};

export { type ComboboxItem };
export default AdaptiveCombobox;
