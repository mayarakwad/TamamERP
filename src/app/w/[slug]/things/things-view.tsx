"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { motion } from "motion/react";
import { toast } from "sonner";
import { Car, Gem, Loader2, Package, Pencil, Plus, Refrigerator, ShieldAlert, ShieldCheck, ShieldOff, Smartphone, Sofa, Trash2 } from "lucide-react";
import { useI18n } from "@/components/providers";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet } from "@/components/ui/sheet";
import { Modal } from "@/components/ui/dialog";
import { Field, fieldClass, Input, inputClass, Textarea } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterChips } from "@/components/ui/filter-chips";
import { DataToolbar } from "@/components/data/toolbar";
import { Gallery, type GalleryFile } from "@/components/records/gallery";
import { pick, type MessageKey } from "@/lib/i18n";
import { cn } from "@/lib/cn";
import type { DatasetResult, Row } from "@/lib/datasets/types";
import { deletePossession, savePossession, type PossessionInput } from "@/app/actions/home";

const TYPES = ["Electronics", "Appliances", "Furniture", "Vehicle", "Jewellery", "Other"] as const;
const TYPE_ICON: Record<string, typeof Package> = { Electronics: Smartphone, Appliances: Refrigerator, Furniture: Sofa, Vehicle: Car, Jewellery: Gem, Other: Package };
const ymd = (iso: string | null) => (iso ? new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Qatar" }).format(new Date(iso)) : "");

interface Item {
  id: string;
  name: string;
  nameAr: string | null;
  category: string;
  room: string | null;
  brand: string | null;
  model: string | null;
  serial: string | null;
  purchasedOn: string | null;
  price: number | null;
  store: string | null;
  warrantyUntil: string | null;
  notes: string | null;
  files: GalleryFile[];
}

function WarrantyBadge({ state, until, now }: { state: string; until: string | null; now: Date }) {
  const { t, fmt } = useI18n();
  if (state === "none" || !until) return <Badge><ShieldOff className="size-3" /> {t("things.noWarranty")}</Badge>;
  if (state === "expired") return <Badge><ShieldOff className="size-3" /> {t("things.warrantyExpired", { date: fmt.date(until) })}</Badge>;
  if (state === "ending") return <Badge tone="warning"><ShieldAlert className="size-3" /> {t("things.warrantyEnding", { when: fmt.relative(until, now) })}</Badge>;
  return <Badge tone="success"><ShieldCheck className="size-3" /> {t("things.warrantyActive", { date: fmt.date(until) })}</Badge>;
}

export function ThingsView({ slug, now, query, result, rooms, item, canManage, canShare }: { slug: string; now: string; query: string; result: DatasetResult; rooms: string[]; item: Item | null; canManage: boolean; canShare: boolean }) {
  const { t, fmt, locale } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const [formFor, setFormFor] = useState<Item | "new" | null>(null);
  const params = new URLSearchParams(query);
  const nowD = new Date(now);
  const withParam = (k: string, v: string | null) => {
    const n = new URLSearchParams(query);
    if (v) n.set(k, v);
    else n.delete(k);
    return n.toString() ? `${pathname}?${n}` : pathname;
  };
  const total = result.rows.reduce((s, r) => s + (Number(r.cells.price) || 0), 0);
  const w = params.get("warranty");

  return (
    <div>
      <PageHeader
        title={t("things.title")}
        subtitle={result.rows.length ? t("things.totalValue", { count: fmt.number(result.rows.length), amount: fmt.money(total) }) : t("things.subtitle")}
        actions={
          <>
            <DataToolbar slug={slug} dataset="possessions" query={query} result={result} canShare={canShare} />
            {canManage && (
              <Button onClick={() => setFormFor("new")}>
                <Plus className="size-4" /> {t("things.add")}
              </Button>
            )}
          </>
        }
      />
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <FilterChips
          items={[
            { href: withParam("warranty", null), label: t("things.anyWarranty"), active: !w },
            { href: withParam("warranty", "ending"), label: t("things.endingSoon"), active: w === "ending" },
            { href: withParam("warranty", "active"), label: t("things.active"), active: w === "active" },
            { href: withParam("warranty", "expired"), label: t("things.expired"), active: w === "expired" },
          ]}
        />
        <select aria-label={t("things.room")} className={cn(fieldClass, "h-9 min-w-36 py-0 text-sm")} value={params.get("room") ?? ""} onChange={(e) => router.replace(withParam("room", e.target.value || null), { scroll: false })}>
          <option value="">{t("things.allRooms")}</option>
          {rooms.map((r) => (
            <option key={r}>{r}</option>
          ))}
        </select>
        <select aria-label={t("things.category")} className={cn(fieldClass, "h-9 min-w-36 py-0 text-sm")} value={params.get("type") ?? ""} onChange={(e) => router.replace(withParam("type", e.target.value || null), { scroll: false })}>
          <option value="">{t("things.allTypes")}</option>
          {TYPES.map((ty) => (
            <option key={ty} value={ty}>
              {t(`things.types.${ty}` as MessageKey)}
            </option>
          ))}
        </select>
      </div>

      {result.rows.length === 0 ? (
        <EmptyState icon={<Package className="size-6" />} title={t("things.emptyTitle")} body={t("things.emptyBody")} action={canManage && <Button onClick={() => setFormFor("new")}><Plus className="size-4" /> {t("things.add")}</Button>} />
      ) : (
        <div className="grid gap-[var(--gap)] sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {result.rows.map((r: Row, i) => {
            const Icon = TYPE_ICON[String(r.meta?.type)] ?? Package;
            return (
              <motion.button
                key={r.id}
                type="button"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i, 12) * 0.03 }}
                onClick={() => router.replace(withParam("item", r.id), { scroll: false })}
                className="lift overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface text-start shadow-card"
              >
                <div className="relative grid aspect-[16/10] place-items-center bg-gradient-to-br from-accent-soft to-sunken text-accent">
                  {r.meta?.photo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`/api/w/${slug}/attachments/${r.meta.photo}?size=thumb`} alt="" className="absolute inset-0 size-full object-cover" />
                  ) : (
                    <Icon className="size-10 opacity-70" />
                  )}
                </div>
                <div className="p-[var(--pad)]">
                  <p className="truncate font-medium">{r.cells.name}</p>
                  <p className="truncate text-xs text-muted">{[r.cells.brand, r.cells.room].filter(Boolean).join(" · ") || r.cells.category}</p>
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <WarrantyBadge state={String(r.meta?.state)} until={r.cells.warranty as string | null} now={nowD} />
                    {r.cells.price ? <span className="tabular text-sm font-semibold">{fmt.money(Number(r.cells.price))}</span> : null}
                  </div>
                </div>
              </motion.button>
            );
          })}
        </div>
      )}

      {item && (
        <Sheet open onOpenChange={(o) => !o && router.replace(withParam("item", null), { scroll: false })} title={pick(locale, item.name, item.nameAr)} description={t(`things.types.${item.category}` as MessageKey)} wide>
          <ItemDetail slug={slug} item={item} now={nowD} canManage={canManage} onEdit={() => setFormFor(item)} onDeleted={() => router.replace(withParam("item", null), { scroll: false })} />
        </Sheet>
      )}
      {formFor && (
        <ItemForm
          slug={slug}
          item={formFor === "new" ? null : formFor}
          rooms={rooms}
          onClose={() => setFormFor(null)}
          onCreated={(id) => router.replace(withParam("item", id), { scroll: false })}
        />
      )}
    </div>
  );
}

function ItemDetail({ slug, item, now, canManage, onEdit, onDeleted }: { slug: string; item: Item; now: Date; canManage: boolean; onEdit: () => void; onDeleted: () => void }) {
  const { t, fmt } = useI18n();
  const [confirm, setConfirm] = useState(false);
  const [pending, start] = useTransition();
  const state = !item.warrantyUntil ? "none" : new Date(item.warrantyUntil) < now ? "expired" : new Date(item.warrantyUntil).getTime() - now.getTime() < 90 * 86400_000 ? "ending" : "active";
  const facts: [string, string | null][] = [
    [t("things.room"), item.room],
    [t("things.brand"), item.brand],
    [t("things.model"), item.model],
    [t("things.serial"), item.serial],
    [t("things.purchasedOn"), item.purchasedOn ? `${fmt.date(item.purchasedOn, "long")} · ${fmt.hijri(item.purchasedOn)}` : null],
    [t("things.price"), item.price ? fmt.money(item.price) : null],
    [t("things.store"), item.store],
  ];
  return (
    <div className="space-y-6">
      <WarrantyBadge state={state} until={item.warrantyUntil} now={now} />
      <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
        {facts.filter(([, v]) => v).map(([k, v]) => (
          <div key={k}>
            <dt className="text-xs text-muted">{k}</dt>
            <dd className="mt-0.5 font-medium" dir={k === t("things.serial") ? "ltr" : undefined}>{v}</dd>
          </div>
        ))}
      </dl>
      {item.notes && <p className="rounded-xl bg-sunken/70 p-3 text-sm whitespace-pre-wrap">{item.notes}</p>}
      <div>
        <h3 className="mb-2 text-sm font-semibold">{t("things.photos")}</h3>
        <Gallery slug={slug} entityType="possession" entityId={item.id} kind="photo" files={item.files} canEdit={canManage} emptyLabel={t("things.noPhotos")} addLabel={t("things.addPhoto")} />
      </div>
      {canManage && (
        <div className="flex gap-2 border-t border-line pt-4">
          <Button variant="secondary" size="sm" onClick={onEdit}>
            <Pencil className="size-3.5" /> {t("things.edit")}
          </Button>
          <Button variant="ghost" size="sm" className="text-danger" onClick={() => setConfirm(true)}>
            <Trash2 className="size-3.5" /> {t("things.delete")}
          </Button>
        </div>
      )}
      <Modal
        open={confirm}
        onOpenChange={setConfirm}
        title={t("things.deleteConfirm")}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              variant="danger"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const res = await deletePossession(slug, item.id);
                  if (res.ok) {
                    toast.success(t("things.deleted"));
                    onDeleted();
                  }
                })
              }
            >
              {t("things.delete")}
            </Button>
          </>
        }
      />
    </div>
  );
}

function ItemForm({ slug, item, rooms, onClose, onCreated }: { slug: string; item: Item | null; rooms: string[]; onClose: () => void; onCreated: (id: string) => void }) {
  const { t } = useI18n();
  const [form, setForm] = useState<PossessionInput>({
    name: item?.name ?? "",
    nameAr: item?.nameAr ?? "",
    category: (item?.category as PossessionInput["category"]) ?? "Electronics",
    room: item?.room ?? "",
    brand: item?.brand ?? "",
    model: item?.model ?? "",
    serial: item?.serial ?? "",
    purchasedOn: ymd(item?.purchasedOn ?? null),
    price: item?.price ? (item.price / 100).toFixed(2) : "",
    store: item?.store ?? "",
    warrantyUntil: ymd(item?.warrantyUntil ?? null),
    notes: item?.notes ?? "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const set = (k: keyof PossessionInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setForm({ ...form, [k]: e.target.value });
  const quick = (years: number) => {
    const base = form.purchasedOn ? new Date(`${form.purchasedOn}T12:00:00Z`) : new Date();
    base.setUTCFullYear(base.getUTCFullYear() + years);
    setForm({ ...form, warrantyUntil: base.toISOString().slice(0, 10) });
  };
  const save = () =>
    start(async () => {
      const res = await savePossession(slug, item?.id ?? null, form);
      if (!res.ok) return setErrors({ [res.field ?? "name"]: t(res.error as MessageKey) });
      toast.success(t("things.saved"));
      onClose();
      if (!item) onCreated(res.id);
    });
  return (
    <Sheet
      open
      onOpenChange={(o) => !o && onClose()}
      title={item ? t("things.edit") : t("things.add")}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button onClick={save} disabled={pending}>
            {pending && <Loader2 className="size-4 animate-spin" />} {t("common.save")}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("things.name")} error={errors.name} htmlFor="t-name">
          <Input id="t-name" value={form.name} onChange={set("name")} placeholder='Samsung 65" TV' />
        </Field>
        <Field label={t("things.nameAr")} htmlFor="t-nameAr">
          <Input id="t-nameAr" dir="rtl" value={form.nameAr} onChange={set("nameAr")} />
        </Field>
        <Field label={t("things.category")} htmlFor="t-type">
          <select id="t-type" className={inputClass} value={form.category} onChange={set("category")}>
            {TYPES.map((ty) => (
              <option key={ty} value={ty}>
                {t(`things.types.${ty}` as MessageKey)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t("things.room")} htmlFor="t-room">
          <Input id="t-room" list="t-rooms" value={form.room} onChange={set("room")} />
          <datalist id="t-rooms">
            {rooms.map((r) => (
              <option key={r} value={r} />
            ))}
          </datalist>
        </Field>
        <Field label={t("things.brand")} htmlFor="t-brand">
          <Input id="t-brand" value={form.brand} onChange={set("brand")} />
        </Field>
        <Field label={t("things.model")} htmlFor="t-model">
          <Input id="t-model" value={form.model} onChange={set("model")} />
        </Field>
        <Field label={t("things.serial")} htmlFor="t-serial">
          <Input id="t-serial" dir="ltr" className="text-start" value={form.serial} onChange={set("serial")} />
        </Field>
        <Field label={t("things.store")} htmlFor="t-store">
          <Input id="t-store" value={form.store} onChange={set("store")} />
        </Field>
        <Field label={t("things.purchasedOn")} htmlFor="t-bought">
          <Input id="t-bought" type="date" value={form.purchasedOn} onChange={set("purchasedOn")} />
        </Field>
        <Field label={t("things.price")} error={errors.price} htmlFor="t-price">
          <Input id="t-price" inputMode="decimal" dir="ltr" value={form.price} onChange={set("price")} className="tabular" />
        </Field>
        <div className="sm:col-span-2">
          <Field label={t("things.warrantyUntil")} htmlFor="t-warranty">
            <div className="flex flex-wrap items-center gap-2">
              <Input id="t-warranty" type="date" value={form.warrantyUntil} onChange={set("warrantyUntil")} className="max-w-48" />
              <span className="text-xs text-muted">{t("things.warrantyQuick")}</span>
              {[1, 2, 3, 5].map((y) => (
                <Button key={y} size="sm" variant="secondary" onClick={() => quick(y)}>
                  {t("things.years", { count: y })}
                </Button>
              ))}
            </div>
          </Field>
        </div>
        <Field label={t("things.notes")} htmlFor="t-notes" className="sm:col-span-2">
          <Textarea id="t-notes" rows={2} value={form.notes} onChange={set("notes")} />
        </Field>
      </div>
    </Sheet>
  );
}
