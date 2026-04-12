"use client";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { TreeDeciduous } from "lucide-react";

type Milestone = { min: number; label: string; description: string };

const MILESTONES: Milestone[] = [
  { min: 0, label: "Seedling", description: "Foundations" },
  { min: 20, label: "Sprout", description: "Early skills" },
  { min: 40, label: "Sapling", description: "Growing fluency" },
  { min: 60, label: "Canopy", description: "Confident use" },
  { min: 80, label: "Summit", description: "Mastery path" },
];

function tierForPoints(points: number): Milestone {
  let current = MILESTONES[0];
  for (const m of MILESTONES) {
    if (points >= m.min) current = m;
  }
  return current;
}

export function SkillTree({
  studentName,
  skillsPoints,
  className,
}: {
  studentName: string;
  skillsPoints: number;
  className?: string;
}) {
  const clamped = Math.min(100, Math.max(0, skillsPoints));
  const tier = tierForPoints(clamped);

  return (
    <Card className={cn("w-full max-w-md", className)}>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <TreeDeciduous className="size-5 text-primary" aria-hidden />
          <CardTitle className="text-lg">Skill Tree</CardTitle>
        </div>
        <CardDescription>
          {studentName} — {clamped} / 100 skill points
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm text-muted-foreground">Current branch</span>
          <Badge variant="secondary">{tier.label}</Badge>
        </div>
        <p className="text-sm text-muted-foreground">{tier.description}</p>
        <div className="relative h-3 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-500"
            style={{ width: `${clamped}%` }}
          />
        </div>
        <Separator />
        <ul className="space-y-2">
          {MILESTONES.map((m) => {
            const unlocked = clamped >= m.min;
            return (
              <li
                key={m.label}
                className={cn(
                  "flex items-center justify-between rounded-lg border px-3 py-2 text-sm",
                  unlocked ? "border-primary/30 bg-primary/5" : "border-border opacity-60",
                )}
              >
                <span className="font-medium">{m.label}</span>
                <span className="text-muted-foreground">{unlocked ? "Unlocked" : `${m.min}+ pts`}</span>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
