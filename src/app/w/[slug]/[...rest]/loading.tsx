import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="mx-auto max-w-2xl py-10" aria-busy="true">
      <div className="flex flex-col items-center rounded-[var(--radius-card)] border border-line bg-surface p-12">
        <Skeleton className="size-16 rounded-2xl" />
        <Skeleton className="mt-6 h-7 w-64" />
        <Skeleton className="mt-3 h-4 w-80 max-w-full" />
        <Skeleton className="mt-2 h-4 w-72 max-w-full" />
      </div>
    </div>
  );
}
