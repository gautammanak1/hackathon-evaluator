import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition-transform focus:outline-none focus:ring-2 focus:ring-black focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-black bg-black text-white",
        secondary: "border-[#808080] bg-[#E8E8E8] text-black",
        outline: "border-[#808080] text-black bg-white",
        destructive: "border-black bg-white text-black underline",
        muted: "border-[#C0C0C0] bg-[#F8F8F8] text-[#404040]",
        warn: "border-[#808080] bg-[#E8E8E8] text-black",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
