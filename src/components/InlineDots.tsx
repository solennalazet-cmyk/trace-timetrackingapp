import { cn } from "@/lib/utils";

/**
 * Small inline "typing dots" loader — three dots fading in a horizontal line.
 * Use as a non-blocking "still working" signal on search fields, comboboxes,
 * and lists while data loads. It occupies a single inline line, never the
 * whole screen.
 */
interface InlineDotsProps {
  className?: string;
  /** Accessible label for screen readers. */
  label?: string;
}

const InlineDots = ({ className, label = "Loading" }: InlineDotsProps) => (
  <span
    role="status"
    aria-label={label}
    className={cn("inline-dots", className)}
  >
    <span />
    <span />
    <span />
  </span>
);

export default InlineDots;
