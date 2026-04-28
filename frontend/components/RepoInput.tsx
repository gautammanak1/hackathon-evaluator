"use client";

import { cn } from "@/lib/utils";
import { InputHTMLAttributes } from "react";

export function RepoInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        "w-full rounded-md border border-gh-border bg-[#010409] px-4 py-3 text-sm text-gray-100",
        "placeholder:text-gh-muted focus:border-gh-accent focus:outline-none focus:ring-1 focus:ring-gh-accent",
        "disabled:cursor-not-allowed disabled:opacity-50",
        props.className,
      )}
    />
  );
}
