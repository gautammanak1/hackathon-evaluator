"use client";

export function ParticleBackground() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute -left-10 top-10 h-44 w-44 rounded-full bg-cyan-500/10 blur-3xl" />
      <div className="absolute right-10 top-20 h-60 w-60 rounded-full bg-violet-500/10 blur-3xl" />
      <div className="absolute bottom-10 left-1/3 h-40 w-40 rounded-full bg-emerald-500/10 blur-3xl" />
    </div>
  );
}
