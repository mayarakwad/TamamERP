import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div aria-busy="true">
      <div className="flex items-end justify-between">
        <div>
          <Skeleton className="h-8 w-40" />
          <Skeleton className="mt-2 h-4 w-64" />
        </div>
        <Skeleton className="h-10 w-32" />
      </div>
      <Skeleton className="mt-6 h-10 w-full max-w-xl" />
      <div className="mt-4 space-y-2 rounded-[var(--radius-card)] border border-line bg-surface p-4">
        {Array.from({ length: 9 }, (_, i) => (
          <Skeleton key={i} className="h-9 w-full" />
        ))}
      </div>
    </div>
  );
}
