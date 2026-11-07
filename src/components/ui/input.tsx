import { cn } from "@/lib/cn";

/** Field look without a width (for selects that sit inline). */
export const fieldClass =
  "h-11 rounded-xl border border-line bg-surface px-3.5 text-fg placeholder:text-subtle shadow-sm transition-[border-color,box-shadow] outline-none focus:border-accent-line focus:ring-4 focus:ring-[var(--ring)]/20 aria-[invalid=true]:border-danger";

export const inputClass = `w-full ${fieldClass}`;

export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return <input className={cn(inputClass, className)} {...props} />;
}

export function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return <textarea className={cn(inputClass, "h-auto min-h-24 py-2.5", className)} {...props} />;
}

export function Field({
  label,
  hint,
  error,
  htmlFor,
  children,
  className,
}: {
  label: React.ReactNode;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  htmlFor?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={htmlFor} className="block text-sm font-medium text-fg">
        {label}
      </label>
      {children}
      {error ? (
        <p className="text-xs text-danger">{error}</p>
      ) : hint ? (
        <p className="text-xs text-muted">{hint}</p>
      ) : null}
    </div>
  );
}
