import { cn } from "@/lib/cn";

/** Tamam mark: a rounded tile with a check whose tail sweeps like a crescent. */
export function LogoMark({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" className={cn("shrink-0", className)} aria-hidden>
      <rect width="40" height="40" rx="11" fill="var(--accent)" />
      <path
        d="M11.5 20.5l5.5 5.5L29 12.5"
        fill="none"
        stroke="var(--accent-fg)"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M29 12.5c3 4.5 2.5 12-3.5 15.5" fill="none" stroke="var(--accent-fg)" strokeOpacity=".45" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

export function Logo({ name = "Tamam", className }: { name?: string; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark />
      <span className="text-lg font-semibold tracking-tight">{name}</span>
    </span>
  );
}
