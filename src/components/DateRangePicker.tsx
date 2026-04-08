import { useState } from "react";
import { format, startOfWeek, endOfWeek } from "date-fns";
import { CalendarIcon } from "lucide-react";
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
  const [step, setStep] = useState<"from" | "to">("from");
  const [tempFrom, setTempFrom] = useState<Date | undefined>(from);

  const QUICK_RANGES = [
    { label: "This week", getValue: () => {
      const now = new Date();
      const s = startOfWeek(now, { weekStartsOn });
      const e = new Date(s);
      e.setDate(e.getDate() + 6);
      return { from: s, to: e };
    }},
    { label: "Last 7 days", getValue: () => {
      const now = new Date();
      return { from: new Date(now.getTime() - 6 * 86400000), to: now };
    }},
    { label: "Last 30 days", getValue: () => {
      const now = new Date();
      return { from: new Date(now.getTime() - 29 * 86400000), to: now };
    }},
    { label: "This month", getValue: () => {
      const now = new Date();
      return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: now };
    }},
  ];

  const handleSelect = (day: Date | undefined) => {
    if (!day) return;
    if (step === "from") {
      setTempFrom(day);
      setStep("to");
    } else {
      const start = tempFrom!;
      const end = day;
      if (end < start) {
        onChange(end, start);
      } else {
        onChange(start, end);
      }
      setOpen(false);
      setStep("from");
    }
  };

  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen);
    if (isOpen) {
      setStep("from");
      setTempFrom(from);
    }
  };

  const handleQuickRange = (getValue: () => { from: Date; to: Date }) => {
    const range = getValue();
    onChange(range.from, range.to);
    setOpen(false);
  };

  const formatDay = (d: Date) =>
    format(d, "EEE d MMM");

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
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
          <p className="text-xs font-medium text-primary">
            {step === "from"
              ? "📅 Pick a start date"
              : "📅 Now pick an end date"}
          </p>
          {step === "to" && tempFrom && (
            <p className="text-[10px] text-muted-foreground mt-0.5">
              From: {formatDay(tempFrom)}
            </p>
          )}
        </div>

        <Calendar
          mode="single"
          selected={step === "from" ? tempFrom : undefined}
          onSelect={handleSelect}
          defaultMonth={step === "to" && tempFrom ? tempFrom : from}
          disabled={(date) => {
            if (step === "to" && tempFrom) return false;
            return date > new Date();
          }}
          className={cn("p-3 pointer-events-auto")}
          weekStartsOn={weekStartsOn}
          modifiers={{
            rangeStart: step === "to" && tempFrom ? tempFrom : undefined as any,
          }}
          modifiersStyles={{
            rangeStart: {
              background: "hsl(var(--primary))",
              color: "hsl(var(--primary-foreground))",
              borderRadius: "50%",
            },
          }}
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
