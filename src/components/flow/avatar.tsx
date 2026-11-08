import type { FlowAvatar as AvatarId } from "@/lib/flow/models";
import { cn } from "@/lib/cn";

// Flow's looks: small marks drawn in SVG on the theme's accent colour, so
// they suit every theme in light and dark mode. All original drawings.

const MARKS: Record<AvatarId, React.ReactNode> = {
  orb: (
    <>
      <circle cx="12" cy="12" r="6.5" fill="currentColor" opacity="0.25" />
      <circle cx="12" cy="12" r="4" fill="currentColor" />
      <path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </>
  ),
  falcon: <path d="M3.5 9.5c3-1.8 6.4-2.2 9.4-.8l2.6-3.2 1 3.9c1.7.9 3 2.4 3.9 4.3-2.6-.9-5-1-7.3-.3L10 17.5l-.6-4.3c-2-.4-4-1.5-5.9-3.7Z" fill="currentColor" />,
  palm: (
    <>
      <path d="M12 21v-9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M12 12c-1.5-3.5-4.5-4.6-8-3.6 2.6.2 4.6 1.4 6 3.6M12 12c1.5-3.5 4.5-4.6 8-3.6-2.6.2-4.6 1.4-6 3.6M12 12c-.6-3.4.6-6.2 3.8-8-1.6 2.2-2.4 4.8-2.2 7.6M12 12c.4-3.2-1-6-4.4-7.6 1.8 2 2.8 4.4 2.8 7" fill="currentColor" />
    </>
  ),
  pearl: (
    <>
      <path d="M4 13.5C4 9 7.6 6 12 6s8 3 8 7.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="12" cy="14" r="4.2" fill="currentColor" />
      <circle cx="10.6" cy="12.6" r="1.2" fill="var(--surface)" opacity="0.7" />
    </>
  ),
  crescent: (
    <>
      <path d="M15.5 4.5a8 8 0 1 0 4 12.8A6.5 6.5 0 0 1 15.5 4.5Z" fill="currentColor" />
      <path d="m17.5 7 .6 1.5 1.5.6-1.5.6-.6 1.5-.6-1.5-1.5-.6 1.5-.6Z" fill="currentColor" />
    </>
  ),
  dhow: (
    <>
      <path d="M12 3.5v13M12 4.5c3.8 2.6 6 6.3 6.5 10.5H12M12 6.5C9.4 8.4 7.6 11.2 7 15h5" fill="currentColor" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M3.5 17h17l-2.2 3.2H5.7Z" fill="currentColor" />
    </>
  ),
  star: <path d="M12 2.5 14 7l4.7-1.2L17.5 10.5 21.5 12l-4 1.5 1.2 4.7L14 17l-2 4.5-2-4.5-4.7 1.2 1.2-4.7-4-1.5 4-1.5L5.3 5.8 10 7Z" fill="currentColor" />,
  spark: (
    <>
      <path d="M12 3c.7 4.2 2.8 6.3 7 7-4.2.7-6.3 2.8-7 7-.7-4.2-2.8-6.3-7-7 4.2-.7 6.3-2.8 7-7Z" fill="currentColor" />
      <path d="M18.5 15.5c.3 1.6 1 2.3 2.5 2.5-1.5.3-2.2 1-2.5 2.5-.3-1.5-1-2.2-2.5-2.5 1.5-.2 2.2-.9 2.5-2.5Z" fill="currentColor" opacity="0.7" />
    </>
  ),
};

export function FlowAvatar({ avatar, className, busy }: { avatar: AvatarId; className?: string; busy?: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "relative grid shrink-0 place-items-center rounded-xl bg-gradient-to-br from-accent to-[color-mix(in_oklch,var(--accent)_55%,#f2c060)] text-accent-fg shadow-sm",
        busy && "flow-busy",
        className ?? "size-8",
      )}
    >
      <svg viewBox="0 0 24 24" className="size-[62%]">
        {MARKS[avatar] ?? MARKS.orb}
      </svg>
    </span>
  );
}
