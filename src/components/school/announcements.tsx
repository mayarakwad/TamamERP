"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { motion } from "motion/react";
import { Building, GraduationCap, Loader2, Megaphone, Pin, Plus, Send, Trash2, Users } from "lucide-react";
import { useI18n } from "@/components/providers";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet } from "@/components/ui/sheet";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Textarea, inputClass } from "@/components/ui/input";
import { Switch } from "@/components/ui/controls";
import type { MessageKey } from "@/lib/i18n";
import { deleteAnnouncement, publishAnnouncement, type AnnouncementInput } from "@/app/actions/campus";

interface Item {
  id: string;
  title: string;
  body: string;
  audience: string;
  campus: string | null;
  grade: string | null;
  pinned: boolean;
  author: string;
  publishedAt: string;
}

export function AnnouncementsView({ slug, canManage, items, campuses, grades }: { slug: string; canManage: boolean; items: Item[]; campuses: { id: string; name: string }[]; grades: { id: string; name: string }[] }) {
  const { t, fmt } = useI18n();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const remove = (id: string) =>
    start(async () => {
      const res = await deleteAnnouncement(slug, id);
      if (!res.ok) return void toast.error(t(res.error as MessageKey));
      router.refresh();
    });
  return (
    <div>
      <PageHeader
        title={t("announcements.title")}
        subtitle={t("announcements.subtitle")}
        actions={
          canManage && (
            <Button onClick={() => setOpen(true)}>
              <Plus className="size-4" /> {t("announcements.new")}
            </Button>
          )
        }
      />
      {!items.length ? (
        <EmptyState icon={<Megaphone className="size-6" />} title={t("announcements.emptyTitle")} body={t("announcements.emptyBody")} />
      ) : (
        <div className="mx-auto max-w-3xl space-y-[var(--gap)]">
          {items.map((a, i) => (
            <motion.div key={a.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 8) * 0.04 }}>
              <Card className={a.pinned ? "border-accent-line" : undefined}>
                <CardBody>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="mb-1.5 flex flex-wrap gap-1.5">
                        {a.pinned && (
                          <Badge tone="accent">
                            <Pin className="size-3" /> {t("announcements.pinnedBadge")}
                          </Badge>
                        )}
                        <Badge>
                          <Users className="size-3" /> {t(`announcements.audience_${a.audience}` as MessageKey)}
                        </Badge>
                        {a.campus && (
                          <Badge>
                            <Building className="size-3" /> {a.campus}
                          </Badge>
                        )}
                        {a.grade && (
                          <Badge>
                            <GraduationCap className="size-3" /> {a.grade}
                          </Badge>
                        )}
                      </div>
                      <h2 className="text-lg font-semibold">{a.title}</h2>
                    </div>
                    {canManage && (
                      <button type="button" aria-label={t("announcements.delete")} onClick={() => remove(a.id)} disabled={pending} className="grid size-8 shrink-0 place-items-center rounded-lg text-subtle hover:bg-sunken hover:text-danger">
                        <Trash2 className="size-4" />
                      </button>
                    )}
                  </div>
                  <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-fg/90">{a.body}</p>
                  <p className="mt-3 text-xs text-subtle">{t("announcements.by", { name: a.author, date: fmt.date(a.publishedAt) })}</p>
                </CardBody>
              </Card>
            </motion.div>
          ))}
        </div>
      )}
      {canManage && <AnnouncementSheet slug={slug} open={open} onClose={() => setOpen(false)} campuses={campuses} grades={grades} />}
    </div>
  );
}

function AnnouncementSheet({ slug, open, onClose, campuses, grades }: { slug: string; open: boolean; onClose: () => void; campuses: { id: string; name: string }[]; grades: { id: string; name: string }[] }) {
  const { t } = useI18n();
  const router = useRouter();
  const [pending, start] = useTransition();
  const blank = (): AnnouncementInput => ({ audience: "everyone", campusId: "", gradeId: "", title: "", titleAr: "", body: "", bodyAr: "", pinned: false });
  const [form, setForm] = useState<AnnouncementInput>(blank);
  const [was, setWas] = useState(false);
  if (open !== was) {
    setWas(open);
    if (open) setForm(blank());
  }
  const submit = () =>
    start(async () => {
      const res = await publishAnnouncement(slug, form);
      if (!res.ok) return void toast.error(t(res.error as MessageKey));
      toast.success(t("announcements.published", { count: res.count }));
      onClose();
      router.refresh();
    });
  return (
    <Sheet
      open={open}
      onOpenChange={(o) => !o && !pending && onClose()}
      title={t("announcements.new")}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button onClick={submit} disabled={pending || form.title.trim().length < 2 || form.body.trim().length < 2}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} {t("announcements.publish")}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label={t("announcements.audience")} htmlFor="an-aud">
            <select id="an-aud" className={inputClass} value={form.audience} onChange={(e) => setForm({ ...form, audience: e.target.value as AnnouncementInput["audience"] })}>
              {(["everyone", "staff", "parents"] as const).map((a) => (
                <option key={a} value={a}>
                  {t(`announcements.audience_${a}`)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t("announcements.campus")} htmlFor="an-campus">
            <select id="an-campus" className={inputClass} value={form.campusId} onChange={(e) => setForm({ ...form, campusId: e.target.value })}>
              {campuses.length > 1 && <option value="">{t("announcements.allCampuses")}</option>}
              {campuses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          {form.audience === "parents" && (
            <Field label={t("announcements.grade")} htmlFor="an-grade">
              <select id="an-grade" className={inputClass} value={form.gradeId} onChange={(e) => setForm({ ...form, gradeId: e.target.value })}>
                <option value="">{t("announcements.allGrades")}</option>
                {grades.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </Field>
          )}
        </div>
        <Field label={t("announcements.titleEn")} htmlFor="an-title">
          <Input id="an-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} autoFocus />
        </Field>
        <Field label={t("announcements.bodyEn")} htmlFor="an-body">
          <Textarea id="an-body" rows={5} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
        </Field>
        <Field label={t("announcements.titleAr")} htmlFor="an-title-ar">
          <Input id="an-title-ar" dir="rtl" value={form.titleAr} onChange={(e) => setForm({ ...form, titleAr: e.target.value })} />
        </Field>
        <Field label={t("announcements.bodyAr")} htmlFor="an-body-ar">
          <Textarea id="an-body-ar" dir="rtl" rows={5} value={form.bodyAr} onChange={(e) => setForm({ ...form, bodyAr: e.target.value })} />
        </Field>
        <Switch checked={!!form.pinned} onChange={(v) => setForm({ ...form, pinned: v })} label={t("announcements.pinned")} />
      </div>
    </Sheet>
  );
}
