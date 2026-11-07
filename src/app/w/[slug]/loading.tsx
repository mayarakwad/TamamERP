import { Skeleton } from "@/components/ui/skeleton";

// Skeletons shaped like the page that's coming, instead of a spinner.
export default function Loading() {
  return (
    <div aria-busy="true" aria-live="polite">
      <Skeleton className="h-8 w-72" />
      <Skeleton className="mt-2 h-4 w-96 max-w-full" />
      <div className="mt-6 grid grid-cols-1 gap-[var(--gap)] md:grid-cols-12">
        <Skeleton className="h-44 md:col-span-7" />
        <Skeleton className="h-44 md:col-span-5" />
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-28 md:col-span-3" />
        ))}
        <Skeleton className="h-72 md:col-span-8" />
        <Skeleton className="h-72 md:col-span-4" />
      </div>
    </div>
  );
}
