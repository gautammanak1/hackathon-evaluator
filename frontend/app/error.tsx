"use client";

import * as React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  React.useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gh-bg px-4 text-center">
      <h1 className="text-xl font-semibold text-gh-text">Something went wrong</h1>
      <p className="mt-2 max-w-md text-sm text-gh-muted">{error.message || "An unexpected error occurred."}</p>
      <div className="mt-6 flex gap-3">
        <Button type="button" onClick={() => reset()}>
          Try again
        </Button>
        <Button variant="outline" asChild>
          <Link href="/">Home</Link>
        </Button>
      </div>
    </div>
  );
}
