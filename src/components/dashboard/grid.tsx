"use client";

import { useMemo, useState, useTransition } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, rectSortingStrategy, sortableKeyboardCoordinates, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { AnimatePresence, motion } from "motion/react";
import { EyeOff, GripVertical, LayoutGrid, Plus, RotateCcw, Check } from "lucide-react";
import { useI18n } from "@/components/providers";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { saveDashboardLayout, type DashboardLayout } from "@/app/actions/dashboard";

export type WidgetSpan = "full" | "wide" | "half" | "narrow" | "third";

export interface Widget {
  id: string;
  title: string;
  span: WidgetSpan;
  node: React.ReactNode;
}

const SPAN: Record<WidgetSpan, string> = {
  full: "md:col-span-12",
  wide: "md:col-span-12 xl:col-span-8",
  half: "md:col-span-6 xl:col-span-7",
  narrow: "md:col-span-6 xl:col-span-5",
  third: "md:col-span-6 xl:col-span-4",
};

function normalize(widgets: Widget[], saved: DashboardLayout | null): DashboardLayout {
  const ids = widgets.map((w) => w.id);
  if (!saved) return { order: ids, hidden: [] };
  const order = saved.order.filter((id) => ids.includes(id));
  for (const id of ids) if (!order.includes(id)) order.push(id); // new widgets appear at the end
  return { order, hidden: saved.hidden.filter((id) => ids.includes(id)) };
}

export function DashboardGrid({ slug, widgets, saved, header }: { slug: string; widgets: Widget[]; saved: DashboardLayout | null; header?: React.ReactNode }) {
  const { t } = useI18n();
  const [layout, setLayout] = useState(() => normalize(widgets, saved));
  const [editing, setEditing] = useState(false);
  const [, startSaving] = useTransition();
  const byId = useMemo(() => new Map(widgets.map((w) => [w.id, w])), [widgets]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const persist = (next: DashboardLayout | null) => startSaving(() => saveDashboardLayout(slug, next));

  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const order = arrayMove(layout.order, layout.order.indexOf(String(e.active.id)), layout.order.indexOf(String(e.over.id)));
    const next = { ...layout, order };
    setLayout(next);
    persist(next);
  };
  const hide = (id: string) => {
    const next = { ...layout, hidden: [...layout.hidden, id] };
    setLayout(next);
    persist(next);
  };
  const show = (id: string) => {
    const next = { ...layout, hidden: layout.hidden.filter((h) => h !== id) };
    setLayout(next);
    persist(next);
  };
  const reset = () => {
    setLayout(normalize(widgets, null));
    persist(null);
  };

  const visible = layout.order.filter((id) => !layout.hidden.includes(id) && byId.has(id));

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">{header}</div>
        <div className="no-print flex items-center gap-2">
          {editing && (
            <Button variant="ghost" size="sm" onClick={reset}>
              <RotateCcw className="size-3.5" /> {t("dashboard.resetLayout")}
            </Button>
          )}
          <Button variant={editing ? "primary" : "secondary"} size="sm" onClick={() => setEditing((e) => !e)} aria-pressed={editing}>
            {editing ? <Check className="size-3.5" /> : <LayoutGrid className="size-3.5" />}
            {editing ? t("dashboard.doneCustomizing") : t("dashboard.customize")}
          </Button>
        </div>
      </div>

      <AnimatePresence>
        {editing && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="mb-4 flex flex-wrap items-center gap-2 rounded-2xl border border-dashed border-accent-line bg-accent-soft/60 px-4 py-3 text-sm">
              <span className="text-muted">{t("dashboard.customizeHint")}</span>
              {layout.hidden.length > 0 && (
                <>
                  <span className="mx-1 h-4 w-px bg-line" />
                  <span className="text-xs font-medium text-subtle">{t("dashboard.hiddenWidgets")}:</span>
                  {layout.hidden.map((id) => (
                    <button key={id} onClick={() => show(id)} className="inline-flex items-center gap-1 rounded-full border border-line bg-surface px-2.5 py-1 text-xs hover:border-accent-line">
                      <Plus className="size-3" /> {byId.get(id)?.title}
                    </button>
                  ))}
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={visible} strategy={rectSortingStrategy}>
          <div className="grid grid-flow-dense grid-cols-1 gap-[var(--gap)] md:grid-cols-12">
            {visible.map((id, i) => {
              const w = byId.get(id)!;
              return (
                <SortableWidget key={id} widget={w} index={i} editing={editing} onHide={() => hide(id)} hideLabel={t("dashboard.hide")} />
              );
            })}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}

function SortableWidget({ widget, index, editing, onHide, hideLabel }: { widget: Widget; index: number; editing: boolean; onHide: () => void; hideLabel: string }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: widget.id, disabled: !editing });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition, animationDelay: `${index * 45}ms` }}
      className={cn("page-enter relative min-w-0", SPAN[widget.span], isDragging && "z-20 opacity-90", editing && "rounded-[var(--radius-card)] ring-2 ring-accent-line ring-offset-2 ring-offset-bg")}
    >
      {editing && (
        <div className="absolute end-2 top-2 z-10 flex items-center gap-1">
          <button
            type="button"
            {...attributes}
            {...listeners}
            className="grid size-8 cursor-grab touch-none place-items-center rounded-lg border border-line bg-surface text-muted shadow-sm active:cursor-grabbing"
            aria-label={widget.title}
          >
            <GripVertical className="size-4" />
          </button>
          <button type="button" onClick={onHide} className="grid size-8 place-items-center rounded-lg border border-line bg-surface text-muted shadow-sm hover:text-danger" aria-label={`${hideLabel}: ${widget.title}`}>
            <EyeOff className="size-4" />
          </button>
        </div>
      )}
      <div className={cn("h-full", editing && "pointer-events-none select-none")}>{widget.node}</div>
    </div>
  );
}
