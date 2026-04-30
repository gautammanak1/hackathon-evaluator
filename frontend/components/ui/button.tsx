import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "border border-black bg-black text-white hover:-translate-y-0.5 hover:bg-[#404040] shadow-sm",
        secondary: "border border-[#404040] bg-[#404040] text-white hover:-translate-y-0.5 hover:bg-black shadow-sm",
        outline:
          "border border-black bg-white text-black hover:-translate-y-0.5 hover:bg-[#E8E8E8]",
        ghost: "text-black hover:bg-[#E8E8E8] min-h-10",
        danger: "border border-black bg-white text-black underline hover:bg-[#E8E8E8]",
      },
      size: {
        default: "min-h-12 px-4 py-2 md:h-10 md:min-h-10",
        sm: "h-8 rounded-md px-3 text-xs min-h-10",
        lg: "min-h-12 rounded-md px-8",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
