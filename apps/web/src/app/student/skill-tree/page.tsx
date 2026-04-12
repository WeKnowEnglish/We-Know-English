import { SkillTree } from "@/components/skill-tree";

export default function SkillTreeDemoPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Skill Tree</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Visualizes <code className="rounded bg-muted px-1 py-0.5 text-xs">skills_points</code> as levels / milestones.
          Connect your student profile in Supabase to see live data here.
        </p>
      </div>
      <SkillTree studentName="Your progress" skillsPoints={0} />
    </main>
  );
}
