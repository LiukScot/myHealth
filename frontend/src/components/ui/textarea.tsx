import { forwardRef, type TextareaHTMLAttributes } from "react";
import { cn } from "../../lib/utils";

const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        "w-full max-w-full min-h-[72px] resize-y rounded-sm border border-border bg-card-strong px-2.5 py-2.5 text-base text-text shadow-sm outline-none transition-colors duration-200",
        "focus:border-accent focus:bg-accent/8",
        "focus-visible:outline-none focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/38",
        className,
      )}
      {...props}
    />
  ),
);
Textarea.displayName = "Textarea";

export { Textarea };
