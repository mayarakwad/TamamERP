"use client";

import { useState } from "react";
import { Popover } from "radix-ui";
import { Command } from "cmdk";
import { Check, ChevronsUpDown, Plus, Search } from "lucide-react";
import { useI18n } from "@/components/providers";
import { cn } from "@/lib/cn";
import { normalizeSearch } from "@/lib/text";
import { fieldClass } from "./input";

export interface ComboOption {
  value: string;
  label: string;
  /** Second line (SKU, phone, price …) */
  hint?: string;
  /** Extra words to match (Arabic name, code …) */
  keywords?: string[];
}

/** Every typed word must appear (Arabic letter forms and digits normalized); "create" sorts last. */
function matchWords(value: string, search: string, keywords?: string[]) {
  if (value.startsWith("__create")) return 0.001;
  const hay = normalizeSearch([value, ...(keywords ?? [])].join(" "));
  const terms = normalizeSearch(search).split(/\s+/).filter(Boolean);
  if (!terms.length) return 1;
  if (!terms.every((t) => hay.includes(t))) return 0;
  // Names that start with what you typed come first.
  return normalizeSearch(keywords?.[0] ?? "").startsWith(terms[0]) ? 1 : 0.5;
}

/** A searchable select. Type to filter; Enter picks; works the same in RTL. */
export function Combobox({
  value,
  onChange,
  options,
  placeholder,
  searchPlaceholder,
  empty,
  onCreate,
  createLabel,
  invalid,
  className,
  id,
  compact,
}: {
  value: string | null;
  onChange: (value: string) => void;
  options: ComboOption[];
  placeholder: string;
  searchPlaceholder?: string;
  empty?: string;
  /** Offer "Create …" with the typed text */
  onCreate?: (text: string) => void;
  createLabel?: (text: string) => string;
  invalid?: boolean;
  className?: string;
  id?: string;
  compact?: boolean;
}) {
  const { t, dir } = useI18n();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = options.find((o) => o.value === value);
  return (
    <Popover.Root open={open} onOpenChange={(o) => (setOpen(o), o || setQuery(""))}>
      <Popover.Trigger asChild>
        <button
          id={id}
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-invalid={invalid}
          className={cn(fieldClass, "flex w-full items-center justify-between gap-2 text-start", compact && "h-9 rounded-lg px-2.5 text-sm", className)}
        >
          <span className={cn("min-w-0 truncate", !selected && "text-subtle")}>{selected ? selected.label : placeholder}</span>
          <ChevronsUpDown className="size-4 shrink-0 text-subtle" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content dir={dir} align="start" sideOffset={6} className="z-50 w-[var(--radix-popover-trigger-width)] min-w-72 overflow-hidden rounded-xl border border-line bg-surface shadow-lift data-[state=open]:animate-[pop-in_140ms_var(--ease-out-soft)]">
          <Command loop filter={matchWords}>
            <div className="flex items-center gap-2 border-b border-line px-3">
              <Search className="size-4 text-subtle" />
              <Command.Input value={query} onValueChange={setQuery} placeholder={searchPlaceholder ?? t("common.search")} className="h-10 flex-1 bg-transparent text-sm outline-none placeholder:text-subtle" />
            </div>
            <Command.List className="max-h-72 overflow-y-auto p-1">
              <Command.Empty className="px-3 py-6 text-center text-sm text-muted">{empty ?? t("palette.empty")}</Command.Empty>
              {options.map((o) => (
                <Command.Item
                  key={o.value}
                  value={o.value}
                  keywords={[o.label, o.hint ?? "", ...(o.keywords ?? [])]}
                  onSelect={() => {
                    onChange(o.value);
                    setOpen(false);
                    setQuery("");
                  }}
                  className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-sm data-[selected=true]:bg-sunken"
                >
                  <Check className={cn("size-4 shrink-0 text-accent", o.value === value ? "opacity-100" : "opacity-0")} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{o.label}</span>
                    {o.hint && <span className="block truncate text-xs text-muted">{o.hint}</span>}
                  </span>
                </Command.Item>
              ))}
              {onCreate && query.trim().length > 1 && (
                <Command.Item
                  value={`__create ${query}`}
                  keywords={[query]}
                  onSelect={() => {
                    onCreate(query.trim());
                    setOpen(false);
                    setQuery("");
                  }}
                  className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-accent data-[selected=true]:bg-sunken"
                >
                  <Plus className="size-4" />
                  {createLabel ? createLabel(query.trim()) : query.trim()}
                </Command.Item>
              )}
            </Command.List>
          </Command>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
