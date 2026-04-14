"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createClassAction, deleteClassAction, updateClassesOrderAction } from "@/app/actions/tracker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  cefrLevels,
  classGradeLevelLongLabel,
  classGradeLevels,
  formatClassGradesShort,
  sortClassGrades,
} from "@/lib/tracker-constants";
import type { CEFRLevel, ClassGradeLevel, ClassRoom } from "@/lib/tracker-types";

type ClassesClientProps = {
  organizationId: string;
  initialClasses: ClassRoom[];
};

export function ClassesClient({ organizationId, initialClasses }: ClassesClientProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [items, setItems] = useState<ClassRoom[]>(initialClasses);
  const [view, setView] = useState<"grid" | "list">("grid");
  const [gradeFilter, setGradeFilter] = useState<ClassGradeLevel | "all">("all");
  const [cefrFilter, setCefrFilter] = useState<CEFRLevel | "all">("all");
  const [draggedClassId, setDraggedClassId] = useState<string | null>(null);
  const tileRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [name, setName] = useState("");
  const [selectedGrades, setSelectedGrades] = useState<ClassGradeLevel[]>([]);
  const [cefrLevel, setCefrLevel] = useState<CEFRLevel>("A1");
  const [formError, setFormError] = useState<string | null>(null);
  const [createPanelOpen, setCreatePanelOpen] = useState(false);

  function closeCreatePanel() {
    setCreatePanelOpen(false);
    setFormError(null);
  }

  function resetCreateForm() {
    setName("");
    setSelectedGrades([]);
    setCefrLevel("A1");
  }

  useEffect(() => {
    setItems(initialClasses);
  }, [initialClasses]);

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const gradeMatch = gradeFilter === "all" || item.grades.includes(gradeFilter);
      const cefrMatch = cefrFilter === "all" || item.cefrLevel === cefrFilter;
      return gradeMatch && cefrMatch;
    });
  }, [items, gradeFilter, cefrFilter]);

  const persistOrder = () => {
    startTransition(async () => {
      const res = await updateClassesOrderAction(
        organizationId,
        items.map((item) => item.id),
      );
      if (!res.ok) {
        window.alert(res.error);
        router.refresh();
        return;
      }
      router.refresh();
    });
  };

  function toggleGrade(g: ClassGradeLevel) {
    setSelectedGrades((prev) => {
      const has = prev.includes(g);
      if (has) return prev.filter((x) => x !== g);
      return sortClassGrades([...prev, g]);
    });
  }

  const createClass = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    if (selectedGrades.length === 0) {
      setFormError("Select at least one grade.");
      return;
    }
    setFormError(null);
    startTransition(async () => {
      const result = await createClassAction(organizationId, {
        name: trimmed,
        grades: sortClassGrades(selectedGrades),
        cefrLevel,
      });
      if (!result.ok) {
        setFormError(result.error);
        return;
      }
      resetCreateForm();
      closeCreatePanel();
      router.refresh();
    });
  };

  const reorderClassesPreview = (sourceId: string, targetId: string) => {
    if (sourceId === targetId) return;
    const sourceIndex = items.findIndex((item) => item.id === sourceId);
    const targetIndex = items.findIndex((item) => item.id === targetId);
    if (sourceIndex < 0 || targetIndex < 0) return;
    const nextItems = [...items];
    const [moved] = nextItems.splice(sourceIndex, 1);
    if (!moved) return;
    nextItems.splice(targetIndex, 0, moved);
    setItems(nextItems);
  };

  const onTileDragStart = (event: React.DragEvent<HTMLDivElement>, classId: string) => {
    setDraggedClassId(classId);
    const tile = tileRefs.current[classId];
    if (!tile) return;

    const rect = tile.getBoundingClientRect();
    const clone = tile.cloneNode(true) as HTMLDivElement;
    clone.style.position = "fixed";
    clone.style.top = "-1000px";
    clone.style.left = "-1000px";
    clone.style.width = `${rect.width}px`;
    clone.style.opacity = "1";
    clone.style.transform = "none";
    clone.style.pointerEvents = "none";
    clone.style.boxShadow = "0 10px 30px rgba(0, 0, 0, 0.2)";
    clone.style.zIndex = "9999";
    document.body.appendChild(clone);
    event.dataTransfer.setDragImage(clone, rect.width / 2, 20);
    requestAnimationFrame(() => {
      document.body.removeChild(clone);
    });
  };

  const deleteClass = (classId: string) => {
    const target = items.find((item) => item.id === classId);
    if (!target) return;
    const confirmed = window.confirm(`Delete class "${target.name}"? This will also remove its roster enrollments.`);
    if (!confirmed) return;
    startTransition(async () => {
      const result = await deleteClassAction(organizationId, classId);
      if (!result.ok) {
        window.alert(result.error);
        return;
      }
      router.refresh();
    });
  };

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Classes</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Share join codes with students and open any class to manage roster details. Use{" "}
          <strong className="text-foreground">Create Class</strong> when you need a new class.
        </p>
      </div>

      {createPanelOpen ? (
        <Card className="border-0 bg-[#d5e2ff] text-[#0c2340] shadow-md ring-1 ring-slate-900/10">
          <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
            <div className="space-y-1.5">
              <CardTitle className="text-base text-[#0c2340]">Create a class</CardTitle>
              <CardDescription className="text-[#0c2340]/75">
                Each class gets a unique code students can use to join.
              </CardDescription>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="shrink-0 border-[#0c2340]/30 bg-white/50 text-[#0c2340] hover:bg-white/80 hover:text-[#0c2340]"
              onClick={() => {
                resetCreateForm();
                closeCreatePanel();
              }}
            >
              Cancel
            </Button>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={createClass}>
              <div>
                <label className="text-sm font-medium text-[#0c2340]">Class name</label>
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Class name"
                  className="mt-1.5 h-9 w-full max-w-md rounded-md border border-slate-900/15 bg-white px-3 text-sm text-foreground shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-[#0c2340]/40 focus-visible:ring-2 focus-visible:ring-[#0c2340]/25"
                />
              </div>
              <div>
                <p className="text-sm font-medium text-[#0c2340]">Grades</p>
                <p className="mt-0.5 text-xs text-[#0c2340]/70">
                  Select one grade (e.g. only Grade 4) or several (e.g. Grades 3 and 4).
                </p>
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-2">
                  {classGradeLevels.map((g) => (
                    <label
                      key={g}
                      className={cn(
                        "flex cursor-pointer items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm text-[#0c2340]",
                        selectedGrades.includes(g)
                          ? "border-[#0c2340]/45 bg-white/90 shadow-sm"
                          : "border-[#0c2340]/20 bg-white/40 hover:bg-white/55",
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={selectedGrades.includes(g)}
                        onChange={() => toggleGrade(g)}
                        className="size-3.5 rounded border-slate-400 bg-white text-[#0c2340]"
                      />
                      <span>{classGradeLevelLongLabel(g)}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="flex flex-wrap items-end gap-3">
                <label className="text-sm font-medium text-[#0c2340]">
                  CEFR level
                  <select
                    value={cefrLevel}
                    onChange={(event) => setCefrLevel(event.target.value as CEFRLevel)}
                    className="mt-1.5 flex h-9 min-w-[8rem] rounded-md border border-slate-900/15 bg-white px-3 text-sm text-foreground shadow-xs outline-none focus-visible:border-[#0c2340]/40 focus-visible:ring-2 focus-visible:ring-[#0c2340]/25"
                  >
                    {cefrLevels.map((level) => (
                      <option key={level} value={level}>
                        {level}
                      </option>
                    ))}
                  </select>
                </label>
                <Button
                  type="submit"
                  size="sm"
                  disabled={pending}
                  className="border-0 bg-[#0c2340] text-white hover:bg-[#0f2d52] hover:text-white"
                >
                  {pending ? "Creating…" : "Create class"}
                </Button>
              </div>
              {formError ? <p className="text-sm text-red-800">{formError}</p> : null}
            </form>
          </CardContent>
        </Card>
      ) : (
        <div className="flex w-full justify-center">
          <Button
            type="button"
            size="default"
            onClick={() => setCreatePanelOpen(true)}
            className={cn(
              "h-[37px] min-h-[37px] w-1/2 max-w-xs rounded-md border-0 bg-[#0c2340] px-4 text-white shadow-sm",
              "hover:bg-[#0f2d52] hover:text-white",
              "focus-visible:ring-2 focus-visible:ring-sky-400/35 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              "dark:bg-[#0e2748] dark:hover:bg-[#123056]",
            )}
          >
            Create Class
          </Button>
        </div>
      )}

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <select
              value={gradeFilter}
              onChange={(event) => setGradeFilter(event.target.value as ClassGradeLevel | "all")}
              className="h-8 rounded-md border border-input bg-background px-2.5 text-xs shadow-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              <option value="all">All grades</option>
              {classGradeLevels.map((g) => (
                <option key={g} value={g}>
                  {classGradeLevelLongLabel(g)}
                </option>
              ))}
            </select>
            <select
              value={cefrFilter}
              onChange={(event) => setCefrFilter(event.target.value as CEFRLevel | "all")}
              className="h-8 rounded-md border border-input bg-background px-2.5 text-xs shadow-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              <option value="all">All CEFR</option>
              {cefrLevels.map((level) => (
                <option key={level} value={level}>
                  CEFR {level}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" variant={view === "grid" ? "default" : "outline"} size="sm" onClick={() => setView("grid")}>
              Grid
            </Button>
            <Button type="button" variant={view === "list" ? "default" : "outline"} size="sm" onClick={() => setView("list")}>
              List
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">Drag class tiles to reorder.</p>
        </div>

        {filteredItems.length > 0 ? (
          <div className={cn(view === "grid" ? "grid gap-4 sm:grid-cols-2 lg:grid-cols-3" : "space-y-3")}>
            {filteredItems.map((item) => (
              <div
                key={item.id}
                draggable
                ref={(element) => {
                  tileRefs.current[item.id] = element;
                }}
                onDragStart={(event) => onTileDragStart(event, item.id)}
                onDragEnd={() => {
                  persistOrder();
                  setDraggedClassId(null);
                }}
                onDragOver={(event) => event.preventDefault()}
                onDragEnter={() => {
                  if (!draggedClassId) return;
                  reorderClassesPreview(draggedClassId, item.id);
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  persistOrder();
                  setDraggedClassId(null);
                }}
                className={cn(
                  "group relative cursor-grab transition-all duration-200 ease-out active:cursor-grabbing",
                  draggedClassId === item.id && "scale-[0.98]",
                )}
              >
                <button
                  type="button"
                  draggable={false}
                  aria-label={`Delete ${item.name}`}
                  title="Delete class"
                  className="pointer-events-none absolute top-2 right-2 z-10 inline-flex size-6 items-center justify-center rounded-full border border-red-300 bg-background/95 text-sm font-semibold text-red-600 opacity-0 shadow-sm transition-opacity group-hover:pointer-events-auto group-hover:opacity-100 hover:bg-red-50"
                  onMouseDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    deleteClass(item.id);
                  }}
                >
                  ×
                </button>
                <Link href={`/onboarding/${item.id}`}>
                  <Card className="h-full transition-all duration-200 ease-out hover:bg-accent/40">
                    <CardHeader className={cn(view === "list" && "flex flex-row items-center justify-between gap-3 space-y-0")}>
                      <div>
                        <CardTitle className="text-base">{item.name}</CardTitle>
                        <CardDescription>
                          Grades {formatClassGradesShort(item.grades)} · CEFR {item.cefrLevel}
                        </CardDescription>
                      </div>
                      <Badge variant="secondary">{item.joinCode}</Badge>
                    </CardHeader>
                  </Card>
                </Link>
              </div>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="py-6 text-sm text-muted-foreground">
              {items.length === 0
                ? "No classes yet. Use Create Class to add one."
                : "No classes match your filters. Try clearing filters or create a new class."}
            </CardContent>
          </Card>
        )}
      </section>
    </main>
  );
}
