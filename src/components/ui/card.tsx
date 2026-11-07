import { cn } from "@/lib/cn";

export function Card({
  className,
  lift,
  glass,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { lift?: boolean; glass?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-[var(--radius-card)] border border-line shadow-card",
        glass ? "bg-glass backdrop-blur-xl" : "bg-surface",
        lift && "lift",
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({
  title,
  action,
  icon,
  className,
}: {
  title: React.ReactNode;
  action?: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center justify-between gap-3 px-[var(--pad)] pt-[var(--pad)]", className)}>
      <h2 className="flex items-center gap-2 text-sm font-semibold text-fg">
        {icon ? <span className="text-muted">{icon}</span> : null}
        {title}
      </h2>
      {action}
    </div>
  );
}

export function CardBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-[var(--pad)]", className)} {...props} />;
}
