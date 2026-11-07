import { cn } from "@/lib/cn";

type Tone = "neutral" | "accent" | "success" | "warning" | "danger" | "info";
const tones: Record<Tone, string> = {
  neutral: "bg-sunken text-muted",
  accent: "bg-accent-soft text-accent",
  success: "bg-[color-mix(in_oklch,var(--success)_14%,var(--surface))] text-success",
  warning: "bg-[color-mix(in_oklch,var(--warning)_16%,var(--surface))] text-warning",
  danger: "bg-[color-mix(in_oklch,var(--danger)_14%,var(--surface))] text-danger",
  info: "bg-[color-mix(in_oklch,var(--info)_14%,var(--surface))] text-info",
};

export function Badge({ tone = "neutral", className, ...props }: React.HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn("inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium", tones[tone], className)}
      {...props}
    />
  );
}
