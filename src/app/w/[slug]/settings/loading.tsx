import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="mx-auto max-w-6xl" aria-busy="true">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="mt-2 h-4 w-80 max-w-full" />
      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-4 rounded-[var(--radius-card)] border border-line bg-surface p-8">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="grid gap-4 border-b border-line pb-6 last:border-0 md:grid-cols-[14rem_1fr]">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-10 w-full max-w-md" />
            </div>
          ))}
        </div>
        <Skeleton className="hidden h-64 xl:block" />
      </div>
    </div>
  );
}
