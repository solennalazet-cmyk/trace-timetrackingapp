import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { EXPORT_COLUMN_OPTIONS, type ExportColumnKey } from "@/lib/export-columns";

interface ExportColumnsPickerProps {
  value: ExportColumnKey[];
  onChange: (next: ExportColumnKey[]) => void;
  className?: string;
}

const ExportColumnsPicker = ({ value, onChange, className }: ExportColumnsPickerProps) => {
  const toggle = (key: ExportColumnKey) => {
    onChange(value.includes(key) ? value.filter((k) => k !== key) : [...value, key]);
  };

  return (
    <div className={cn("grid grid-cols-2 gap-x-3 gap-y-2.5", className)}>
      {EXPORT_COLUMN_OPTIONS.map(({ key, label }) => {
        const active = value.includes(key);
        return (
          <button
            key={key}
            type="button"
            role="checkbox"
            aria-checked={active}
            onClick={() => toggle(key)}
            className="flex items-center gap-2.5 text-left py-1 group"
          >
            <span
              className={cn(
                "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition-colors",
                active
                  ? "bg-primary border-primary text-[hsl(222,34%,16%)]"
                  : "bg-transparent border-foreground/30 group-hover:border-foreground/60"
              )}
            >
              {active && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
            </span>
            <span className="text-sm text-secondary-foreground leading-tight">{label}</span>
          </button>
        );
      })}
    </div>
  );
};

export default ExportColumnsPicker;
