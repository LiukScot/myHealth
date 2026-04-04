import { forwardRef, type LabelHTMLAttributes } from "react";
import { cn } from "../../lib/utils";

const Label = forwardRef<HTMLLabelElement, LabelHTMLAttributes<HTMLLabelElement>>(
  ({ className, ...props }, ref) => (
    <label
      ref={ref}
      className={cn("grid gap-1 content-start text-muted text-[13px]", className)}
      {...props}
    />
  ),
);
Label.displayName = "Label";

export { Label };
