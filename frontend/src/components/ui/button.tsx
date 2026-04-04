import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center rounded-sm font-bold text-sm tracking-wide cursor-pointer transition-all duration-200 shadow-sm border border-border disabled:opacity-50 disabled:cursor-not-allowed",
  {
    variants: {
      variant: {
        default: "bg-card text-text hover:border-accent hover:text-accent",
        active: "bg-accent/8 border-accent text-accent shadow-card",
        danger: "border-danger/60 text-danger bg-danger/8",
        success: "border-success text-success bg-success/12",
        ghost: "border-transparent bg-transparent shadow-none",
      },
      size: {
        default: "min-h-[38px] px-2.5 py-2.5",
        sm: "min-h-[34px] px-2 py-2 text-xs",
        icon: "w-[38px] min-w-[38px] min-h-[38px] p-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants>;

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button ref={ref} className={cn(buttonVariants({ variant, size, className }))} {...props} />
  ),
);
Button.displayName = "Button";

export { Button, buttonVariants };
