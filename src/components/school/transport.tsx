"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { motion } from "motion/react";
import { ArrowLeft, ArrowRight, Bus, HeartPulse, Loader2, Pencil, Phone, Plus, Printer, Search, Trash2, UserMinus, Users } from "lucide-react";
import { useI18n } from "@/components/providers";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button, buttonClass } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Sheet } from "@/components/ui/sheet";
import { Modal } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, inputClass } from "@/components/ui/input";
import { cn } from "@/lib/cn";
import { pick, type MessageKey } from "@/lib/i18n";
import { findRiders, saveRoute, setRider, type RouteInput } from "@/app/actions/campus";

interface Stop {
  id: string;
  name: string;
  rawName: string;
  rawNameAr: string | null;
  pickup: string | null;
  dropoff: string | null;
  riders: number;
}

export interface Route {
  id: string;
  code: string;
  name: string;
  rawName: string;
  rawNameAr: string | null;
  campusId: string;
  campus: string;
  color: string | null;
  driverName: string | null;
  driverPhone: string | null;
  attendantName: string | null;
  attendantPhone: string | null;
  plate: string | null;
  capacity: number;
  annualFee: number;
  riders: number;
  stops: Stop[];
}

/** A route drawn as a line with its stops, like a transit map. */
function RouteLine({ route, compact }: { route: Route; compact?: boolean }) {
  return (
    <ol className="relative ms-1.5 space-y-2 border-s-2 ps-4" style={{ borderColor: route.color ?? "var(--accent)" }}>
      {route.stops.map((st, i) => (
        <motion.li key={st.id} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }} className="relative text-sm">
          <span className="absolute -start-[1.4rem] top-1 size-3 rounded-full border-2 bg-surface" style={{ borderColor: route.color ?? "var(--accent)" }} />
          <span className="flex items-baseline justify-between gap-2">
            <span className="truncate">{st.name}</span>
            <span className="shrink-0 text-xs tabular text-muted" dir="ltr">
              {st.pickup}
              {!compact && st.dropoff ? ` · ${st.dropoff}` : ""}
            </span>
          </span>
        </motion.li>
      ))}
    </ol>
  );
}

export function TransportView({ slug, routes, canManage, campuses }: { slug: string; routes: Route[]; canManage: boolean; campuses: { id: string; name: string }[] }) {
  const { t, fmt } = useI18n();
  const [editing, setEditing] = useState<Route | "new" | null>(null);
  const riders = routes.reduce((s, r) => s + r.riders, 0);
  return (
    <div>
      <PageHeader
        title={t("transport.title")}
        subtitle={t("transport.subtitle", { routes: fmt.number(routes.length), riders: fmt.number(riders) })}
        actions={
          canManage && (
            <Button onClick={() => setEditing("new")}>
              <Plus className="size-4" /> {t("transport.newRoute")}
            </Button>
          )
        }
      />
      {!routes.length ? (
        <EmptyState icon={<Bus className="size-6" />} title={t("transport.emptyTitle")} body={t("transport.emptyBody")} />
      ) : (
        <div className="grid gap-[var(--gap)] md:grid-cols-2 xl:grid-cols-3">
          {routes.map((r, i) => {
            const full = r.riders >= r.capacity;
            return (
              <motion.div key={r.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
                <Link href={`/w/${slug}/transport/${r.id}`} className="lift block h-full rounded-[var(--radius-card)] border border-line bg-surface p-4 shadow-card">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <span className="grid size-11 place-items-center rounded-xl text-white" style={{ background: r.color ?? "var(--accent)" }}>
                        <Bus className="size-5" />
                      </span>
                      <div>
                        <p className="font-semibold">{r.code}</p>
                        <p className="text-xs text-muted">{r.name}</p>
                      </div>
                    </div>
                    {full && <Badge tone="warning">{t("transport.full")}</Badge>}
                  </div>
                  <div className="mt-3">
                    <div className="flex justify-between text-xs text-muted">
                      <span>{r.campus}</span>
                      <span className="tabular">{t("transport.riders", { count: r.riders, capacity: r.capacity })}</span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-sunken">
                      <motion.div className={cn("h-full rounded-full", full ? "bg-warning" : "bg-accent")} initial={{ width: 0 }} animate={{ width: `${Math.min(100, (r.riders / r.capacity) * 100)}%` }} transition={{ duration: 0.8 }} />
                    </div>
                  </div>
                  <div className="mt-4">
                    <RouteLine route={r} compact />
                  </div>
                  <p className="mt-3 truncate text-xs text-subtle">
                    {r.driverName} · <span dir="ltr">{r.driverPhone}</span>
                  </p>
                </Link>
              </motion.div>
            );
          })}
        </div>
      )}
      {canManage && <RouteSheet slug={slug} editing={editing} onClose={() => setEditing(null)} campuses={campuses} />}
    </div>
  );
}

type Rider = { id: string; name: string; plainName: string; color: string | null; className: string; phone: string | null; medical: boolean };
type RouteWithRiders = Omit<Route, "stops"> & { stops: (Stop & { students: Rider[] })[] };

export function RouteDetail({ slug, route, canManage, campuses }: { slug: string; route: RouteWithRiders; canManage: boolean; campuses: { id: string; name: string }[] }) {
  const { t, fmt, dir } = useI18n();
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const Back = dir === "rtl" ? ArrowRight : ArrowLeft;
  const remove = (studentId: string) =>
    start(async () => {
      const res = await setRider(slug, studentId, null);
      if (!res.ok) return void toast.error(t(res.error as MessageKey));
      router.refresh();
    });
  return (
    <div className="space-y-[var(--gap)]">
      <Link href={`/w/${slug}/transport`} className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg">
        <Back className="size-4" /> {t("transport.title")}
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <span className="grid size-14 place-items-center rounded-2xl text-white" style={{ background: route.color ?? "var(--accent)" }}>
            <Bus className="size-7" />
          </span>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {route.code} · {route.name}
            </h1>
            <p className="text-sm text-muted">
              {route.campus} · {t("transport.riders", { count: route.riders, capacity: route.capacity })} · {t("transport.fee")} {fmt.money(route.annualFee)}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={`/api/w/${slug}/export/bus-riders?route=${route.id}&format=print`} target="_blank" rel="noreferrer" className={buttonClass("secondary")}>
            <Printer className="size-4" /> {t("transport.printList")}
          </a>
          {canManage && (
            <Button variant="ghost" onClick={() => setEditing(true)}>
              <Pencil className="size-4" /> {t("common.edit")}
            </Button>
          )}
        </div>
      </div>
      <div className="grid gap-[var(--gap)] lg:grid-cols-3">
        <Card className="h-fit">
          <CardBody className="space-y-3 text-sm">
            {[
              [t("transport.driver"), route.driverName, route.driverPhone],
              [t("transport.attendant"), route.attendantName, route.attendantPhone],
            ].map(([label, name, phone]) => (
              <div key={label}>
                <p className="text-xs text-muted">{label}</p>
                <p className="font-medium">{name ?? "—"}</p>
                {phone && (
                  <a href={`tel:${phone.replace(/\s/g, "")}`} className="inline-flex items-center gap-1 text-accent" dir="ltr">
                    <Phone className="size-3.5" /> {phone}
                  </a>
                )}
              </div>
            ))}
            {route.plate && (
              <div>
                <p className="text-xs text-muted">{t("transport.plate")}</p>
                <p className="font-mono">{route.plate}</p>
              </div>
            )}
          </CardBody>
        </Card>
        <div className="space-y-[var(--gap)] lg:col-span-2">
          {route.stops.map((st) => (
            <Card key={st.id}>
              <CardHeader
                title={
                  <span className="flex items-center gap-2">
                    <span className="size-3 rounded-full border-2" style={{ borderColor: route.color ?? "var(--accent)" }} />
                    {st.name}
                    <span className="text-xs font-normal tabular text-muted" dir="ltr">
                      {st.pickup} · {st.dropoff}
                    </span>
                  </span>
                }
                action={
                  canManage && (
                    <Button size="sm" variant="ghost" onClick={() => setAdding(st.id)} disabled={route.riders >= route.capacity}>
                      <Plus className="size-4" /> {t("transport.addRider")}
                    </Button>
                  )
                }
              />
              <CardBody className="grid gap-2 sm:grid-cols-2">
                {st.students.length ? (
                  st.students.map((x) => (
                    <div key={x.id} className="flex items-center gap-2.5 rounded-xl border border-line px-2.5 py-2 text-sm">
                      <Avatar name={x.plainName} color={x.color} size={30} />
                      <Link href={`/w/${slug}/students/${x.id}`} className="min-w-0 flex-1 hover:text-accent">
                        <span className="flex items-center gap-1 truncate font-medium">
                          {x.name}
                          {x.medical && <HeartPulse className="size-3.5 shrink-0 text-danger" />}
                        </span>
                        <span className="block truncate text-xs text-muted">
                          {x.className}
                          {x.phone && <span dir="ltr"> · {x.phone}</span>}
                        </span>
                      </Link>
                      {canManage && (
                        <button type="button" aria-label={t("transport.removeRider")} title={t("transport.removeRider")} onClick={() => remove(x.id)} disabled={pending} className="grid size-8 place-items-center rounded-lg text-subtle hover:bg-sunken hover:text-danger">
                          <UserMinus className="size-4" />
                        </button>
                      )}
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted">{t("transport.noRiders")}</p>
                )}
              </CardBody>
            </Card>
          ))}
        </div>
      </div>
      {canManage && (
        <>
          <RouteSheet slug={slug} editing={editing ? route : null} onClose={() => setEditing(false)} campuses={campuses} />
          <AddRider slug={slug} campusId={route.campusId} stopId={adding} onClose={() => setAdding(null)} />
        </>
      )}
    </div>
  );
}

function AddRider({ slug, campusId, stopId, onClose }: { slug: string; campusId: string; stopId: string | null; onClose: () => void }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Awaited<ReturnType<typeof findRiders>>>([]);
  const [pending, start] = useTransition();
  useEffect(() => {
    if (q.trim().length < 2) return;
    const id = setTimeout(() => findRiders(slug, campusId, q).then(setHits), 250);
    return () => clearTimeout(id);
  }, [q, slug, campusId]);
  const add = (studentId: string) =>
    start(async () => {
      if (!stopId) return;
      const res = await setRider(slug, studentId, stopId);
      if (!res.ok) return void toast.error(t(res.error as MessageKey));
      setQ("");
      setHits([]);
      onClose();
      router.refresh();
    });
  return (
    <Modal open={!!stopId} onOpenChange={(o) => !o && onClose()} title={t("transport.addRider")}>
      <div className="space-y-2">
        <div className="relative">
          <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-subtle" />
          <Input autoFocus className="ps-9" placeholder={t("transport.pickStudent")} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {hits.map((h) => (
          <button key={h.id} type="button" disabled={pending} onClick={() => add(h.id)} className="flex w-full items-center justify-between gap-2 rounded-xl border border-line px-3 py-2 text-start text-sm hover:border-accent-line">
            <span>
              <span className="block font-medium">{pick(locale, h.name, h.nameAr)}</span>
              <span className="block text-xs text-muted">{h.className}</span>
            </span>
            {h.bus && <Badge>{h.bus}</Badge>}
          </button>
        ))}
      </div>
    </Modal>
  );
}

function RouteSheet({ slug, editing, onClose, campuses }: { slug: string; editing: Route | "new" | null; onClose: () => void; campuses: { id: string; name: string }[] }) {
  const { t } = useI18n();
  const router = useRouter();
  const [pending, start] = useTransition();
  const blank = (): RouteInput =>
    editing && editing !== "new"
      ? {
          campusId: editing.campusId,
          code: editing.code,
          name: editing.rawName,
          nameAr: editing.rawNameAr ?? "",
          driverName: editing.driverName ?? "",
          driverPhone: editing.driverPhone ?? "",
          attendantName: editing.attendantName ?? "",
          attendantPhone: editing.attendantPhone ?? "",
          plate: editing.plate ?? "",
          capacity: editing.capacity,
          annualFee: (editing.annualFee / 100).toFixed(0),
          stops: editing.stops.map((s) => ({ id: s.id, name: s.rawName, nameAr: s.rawNameAr ?? "", pickup: s.pickup ?? "", dropoff: s.dropoff ?? "" })),
        }
      : { campusId: campuses[0]?.id ?? "", code: "", name: "", nameAr: "", driverName: "", driverPhone: "", attendantName: "", attendantPhone: "", plate: "", capacity: 30, annualFee: "6500", stops: [{ name: "", nameAr: "", pickup: "06:30", dropoff: "14:30" }] };
  const [form, setForm] = useState<RouteInput>(blank);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [was, setWas] = useState<typeof editing>(null);
  if (editing !== was) {
    setWas(editing);
    setForm(blank());
    setErrors({});
  }
  const stops = form.stops ?? [];
  const setStop = (i: number, patch: Partial<(typeof stops)[number]>) => setForm({ ...form, stops: stops.map((s, k) => (k === i ? { ...s, ...patch } : s)) });
  const submit = () =>
    start(async () => {
      const res = await saveRoute(slug, editing && editing !== "new" ? editing.id : null, form);
      if (!res.ok) {
        if (res.field) setErrors({ [res.field]: t(res.error as MessageKey) });
        else toast.error(t(res.error as MessageKey));
        return;
      }
      toast.success(t("transport.saved"));
      onClose();
      router.refresh();
    });
  const f = (k: keyof RouteInput, label: string, props: React.ComponentProps<"input"> = {}) => (
    <Field label={label} htmlFor={`rt-${k}`} error={errors[k]}>
      <Input id={`rt-${k}`} value={(form[k] as string) ?? ""} onChange={(e) => setForm({ ...form, [k]: e.target.value })} {...props} />
    </Field>
  );
  return (
    <Sheet
      open={!!editing}
      onOpenChange={(o) => !o && !pending && onClose()}
      title={editing === "new" ? t("transport.newRoute") : t("transport.editRoute")}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button onClick={submit} disabled={pending}>
            {pending && <Loader2 className="size-4 animate-spin" />} {t("common.save")}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-[8rem_1fr]">
          {f("code", t("transport.code"))}
          {f("name", t("transport.name"))}
        </div>
        {f("nameAr", t("transport.nameAr"), { dir: "rtl" })}
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label={t("school.campus")} htmlFor="rt-campus">
            <select id="rt-campus" className={inputClass} value={form.campusId} onChange={(e) => setForm({ ...form, campusId: e.target.value })}>
              {campuses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t("transport.capacity")} htmlFor="rt-cap">
            <Input id="rt-cap" inputMode="numeric" value={form.capacity} onChange={(e) => setForm({ ...form, capacity: Number(e.target.value.replace(/\D/g, "")) || 0 })} />
          </Field>
          {f("annualFee", t("transport.fee"), { dir: "ltr", inputMode: "decimal" })}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {f("driverName", t("transport.driver"))}
          {f("driverPhone", t("guardians.colPhone"), { dir: "ltr" })}
          {f("attendantName", t("transport.attendant"))}
          {f("attendantPhone", t("guardians.colPhone"), { dir: "ltr" })}
        </div>
        {f("plate", t("transport.plate"), { dir: "ltr" })}
        <div>
          <p className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <Users className="size-4 text-muted" /> {t("transport.stops")}
          </p>
          <div className="space-y-2">
            {stops.map((s, i) => (
              <div key={s.id ?? i} className="grid grid-cols-[1fr_1fr_5.5rem_5.5rem_2rem] items-center gap-1.5">
                <input aria-label={t("transport.stopName")} placeholder={t("transport.stopName")} className={`${inputClass} h-9 text-sm`} value={s.name} onChange={(e) => setStop(i, { name: e.target.value })} />
                <input aria-label={t("transport.nameAr")} dir="rtl" className={`${inputClass} h-9 text-sm`} value={s.nameAr} onChange={(e) => setStop(i, { nameAr: e.target.value })} />
                <input aria-label={t("transport.pickup")} type="time" className={`${inputClass} h-9 px-2 text-sm`} value={s.pickup} onChange={(e) => setStop(i, { pickup: e.target.value })} />
                <input aria-label={t("transport.dropoff")} type="time" className={`${inputClass} h-9 px-2 text-sm`} value={s.dropoff} onChange={(e) => setStop(i, { dropoff: e.target.value })} />
                <button type="button" aria-label={t("common.delete")} onClick={() => setForm({ ...form, stops: stops.filter((_, k) => k !== i) })} className="grid size-8 place-items-center rounded-lg text-subtle hover:bg-sunken hover:text-danger">
                  <Trash2 className="size-4" />
                </button>
              </div>
            ))}
            <Button size="sm" variant="ghost" onClick={() => setForm({ ...form, stops: [...stops, { name: "", nameAr: "", pickup: "", dropoff: "" }] })}>
              <Plus className="size-4" /> {t("transport.addStop")}
            </Button>
          </div>
        </div>
      </div>
    </Sheet>
  );
}
