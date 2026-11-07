import { cn } from "@/lib/cn";

export function initials(name: string) {
  const parts = name.replace(/^(Dr\.|د\.)\s*/, "").split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "?";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase();
}

export function Avatar({ name, color, size = 32, className }: { name: string; color?: string | null; size?: number; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-grid shrink-0 place-items-center rounded-full font-semibold text-white", className)}
      style={{ width: size, height: size, fontSize: size * 0.38, background: color ?? "var(--accent)" }}
    >
      {initials(name)}
    </span>
  );
}
