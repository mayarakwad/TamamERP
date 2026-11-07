import { Skeleton } from "@/components/ui/skeleton";

/** Placeholder shaped like a list page (header, filters, table). */
export function ListSkeleton() {
  return (
    <div aria-busy="true">
      <div className="flex items-end justify-between">
        <div>
          <Skeleton className="h-8 w-44" />
          <Skeleton className="mt-2 h-4 w-72 max-w-full" />
        </div>
        <Skeleton className="h-10 w-32" />
      </div>
      <Skeleton className="mt-6 h-9 w-full max-w-lg" />
      <Skeleton className="mt-3 h-9 w-full max-w-xs" />
      <div className="mt-4 space-y-2 rounded-[var(--radius-card)] border border-line bg-surface p-4">
        {Array.from({ length: 10 }, (_, i) => (
          <Skeleton key={i} className="h-9 w-full" />
        ))}
      </div>
    </div>
  );
}

/** Placeholder shaped like a record page (paper on the left, panels on the right). */
export function RecordSkeleton() {
  return (
    <div aria-busy="true">
      <Skeleton className="h-5 w-32" />
      <div className="mt-4 grid gap-[var(--gap)] lg:grid-cols-[1fr_22rem]">
        <Skeleton className="h-[34rem]" />
        <div className="space-y-[var(--gap)]">
          <Skeleton className="h-48" />
          <Skeleton className="h-64" />
        </div>
      </div>
    </div>
  );
}
