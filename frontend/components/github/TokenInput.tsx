"use client";

type Props = { value: string; onChange: (v: string) => void };

export function TokenInput({ value, onChange }: Props) {
  return (
    <input
      aria-label="GitHub token"
      type="password"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="ghp_..."
      className="w-full rounded-md border border-white/15 bg-slate-900/50 px-3 py-2 text-sm text-white"
    />
  );
}
