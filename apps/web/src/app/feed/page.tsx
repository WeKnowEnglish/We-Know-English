"use client";

import { useMemo, useState } from "react";
import { buildNarrativeDraft, isThreeSentenceDraft } from "@/lib/narrative";
import { students, tags } from "@/lib/sample-data";

export default function FeedPage() {
  const firstStudent = students[0];
  const [selectedStudentId, setSelectedStudentId] = useState(firstStudent?.id ?? "");
  const [selectedTags, setSelectedTags] = useState<string[]>(["#engaged", "#phonics"]);
  const [lessonFocus, setLessonFocus] = useState("blends and short vowels");
  const [draftText, setDraftText] = useState(
    buildNarrativeDraft({
      studentName: firstStudent?.fullName ?? "Student",
      lessonFocus: "blends and short vowels",
      tags: ["#engaged", "#phonics"],
    }),
  );

  const selectedStudent = useMemo(
    () => students.find((student) => student.id === selectedStudentId) ?? firstStudent,
    [selectedStudentId, firstStudent],
  );

  const regenerate = () => {
    setDraftText(
      buildNarrativeDraft({
        studentName: selectedStudent?.fullName ?? "Student",
        lessonFocus,
        tags: selectedTags,
      }),
    );
  };

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-5 px-6 py-8">
      <h1 className="text-2xl font-semibold">Parent Feed + Narrative Engine</h1>
      <p className="text-sm text-zinc-600">
        Quick tags convert into a polished 3-sentence update with tutor review before publishing.
      </p>

      <section className="rounded-xl border border-zinc-200 bg-white p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            Student
            <select
              className="mt-1 w-full rounded-lg border border-zinc-300 p-2"
              value={selectedStudentId}
              onChange={(event) => setSelectedStudentId(event.target.value)}
            >
              {students.length === 0 ? (
                <option value="">No students loaded</option>
              ) : (
                students.map((student) => (
                  <option key={student.id} value={student.id}>
                    {student.fullName}
                  </option>
                ))
              )}
            </select>
          </label>

          <label className="text-sm">
            Lesson focus
            <input
              className="mt-1 w-full rounded-lg border border-zinc-300 p-2"
              value={lessonFocus}
              onChange={(event) => setLessonFocus(event.target.value)}
            />
          </label>
        </div>

        <div className="mt-4">
          <p className="text-sm font-medium">Quick tags</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {tags.map((tag) => {
              const selected = selectedTags.includes(tag);
              return (
                <button
                  key={tag}
                  className={`rounded-full border px-3 py-1 text-sm ${selected ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-300 bg-white text-zinc-800"}`}
                  onClick={() =>
                    setSelectedTags((current) =>
                      current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag],
                    )
                  }
                >
                  {tag}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <button className="rounded-lg bg-zinc-900 px-4 py-2 text-sm text-white" onClick={regenerate}>
            Generate 3-Sentence Draft
          </button>
          <span className={`text-sm ${isThreeSentenceDraft(draftText) ? "text-emerald-700" : "text-rose-700"}`}>
            {isThreeSentenceDraft(draftText) ? "Valid 3-sentence draft" : "Draft must have exactly 3 sentences"}
          </span>
        </div>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-4">
        <p className="text-sm font-medium">Tutor Review</p>
        <textarea
          className="mt-2 min-h-40 w-full rounded-lg border border-zinc-300 p-3 text-sm"
          value={draftText}
          onChange={(event) => setDraftText(event.target.value)}
        />
        <button className="mt-3 rounded-lg bg-zinc-900 px-4 py-2 text-sm text-white">Publish to Parent Feed</button>
      </section>
    </main>
  );
}
