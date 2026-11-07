import { cn } from "@/lib/cn";

/** An empty screen that explains what goes here and what to do next. */
export function EmptyState({ icon, title, body, action, className }: { icon: React.ReactNode; title: React.ReactNode; body?: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center rounded-[var(--radius-card)] border border-dashed border-line px-6 py-14 text-center", className)}>
      <span className="grid size-14 place-items-center rounded-2xl bg-accent-soft text-accent">{icon}</span>
      <h2 className="mt-5 text-lg font-semibold">{title}</h2>
      {body && <p className="mt-1.5 max-w-md text-sm text-muted">{body}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
