import { useState, useEffect } from "react";
import { format, startOfWeek } from "date-fns";
import { CalendarIcon } from "lucide-react";
import type { DateRange } from "react-day-picker";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface DateRangePickerProps {
  from: Date;
  to: Date;
  onChange: (from: Date, to: Date) => void;
  weekStartsOn?: 0 | 1 | 2 | 3 | 4 | 5 | 6;
}

export default function DateRangePicker({ from, to, onChange, weekStartsOn = 1 }: DateRangePickerProps) {
  const [open, setOpen] = useState(false);
  const [range, setRange] = useState<DateRange | undefined>({ from, to });

  useEffect(() => {
    // Each time the popover opens, clear the selection so the user's next
    // click is unambiguously the new start date (otherwise react-day-picker
    // extends the previously completed range and the popover closes
    // immediately with the wrong end date).
    if (open) setRange(undefined);
  }, [open]);

  const handleRangeChange = (next: DateRange | undefined) => {
    // If a complete range already exists and the user clicks again, restart
    // selection from that date rather than extending the existing range.
    if (range?.from && range?.to && next?.from) {
      setRange({ from: next.from, to: undefined });
      return;
    }
    setRange(next);
    if (next?.from && next?.to) {
      const start = next.from <= next.to ? next.from : next.to;
      const end = next.from <= next.to ? next.to : next.from;
      onChange(start, end);
      setOpen(false);
    }
  };

  const handleQuickRange = (getValue: () => { from: Date; to: Date }) => {
    const r = getValue();
    setRange(r);
    onChange(r.from, r.to);
    setOpen(false);
  };

  const formatDay = (d: Date) => format(d, "EEE d MMM");

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "justify-start text-left font-normal gap-2 rounded-xl h-9 text-xs w-full",
          )}
        >
          <CalendarIcon className="h-3.5 w-3.5 text-muted-foreground" />
          <span>
            {formatDay(from)} — {formatDay(to)}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <div className="px-4 pt-3 pb-1">
          <p className="text-xs font-medium text-foreground">
            {range?.from && !range?.to
              ? "📅 Now pick an end date"
              : "📅 Pick a start date"}
          </p>
          {range?.from && !range?.to && (
            <p className="text-[10px] text-muted-foreground mt-0.5">
              From: {formatDay(range.from)}
            </p>
          )}
        </div>

        <Calendar
          mode="range"
          selected={range}
          onSelect={handleRangeChange}
          defaultMonth={range?.from ?? from}
          numberOfMonths={1}
          className={cn("p-3 pointer-events-auto")}
          weekStartsOn={weekStartsOn}
        />

        <div className="px-3 pb-3 flex flex-wrap gap-1.5">
          {QUICK_RANGES.map((qr) => (
            <button
              key={qr.label}
              onClick={() => handleQuickRange(qr.getValue)}
              className="px-2.5 py-1 text-[10px] font-medium rounded-full border border-border text-muted-foreground hover:bg-muted transition-colors"
            >
              {qr.label}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
