"use client";

import { FormEvent, useState } from "react";
import { students } from "@/lib/sample-data";

type MomentDraft = {
  studentId: string;
  sessionLabel: string;
  note: string;
  fileName: string;
  createdAt: string;
};

export default function MomentsPage() {
  const [moments, setMoments] = useState<MomentDraft[]>([]);
  const [selectedStudent, setSelectedStudent] = useState(students[0]?.id ?? "");
  const hasStudents = students.length > 0;

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const fileName = (form.get("photo") as File | null)?.name ?? "camera_capture.jpg";
    const sessionLabel = String(form.get("sessionLabel") ?? "");
    const note = String(form.get("note") ?? "");

    setMoments((current) => [
      {
        studentId: selectedStudent,
        sessionLabel,
        note,
        fileName,
        createdAt: new Date().toISOString(),
      },
      ...current,
    ]);
    event.currentTarget.reset();
  };

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-5 px-6 py-8">
      <h1 className="text-2xl font-semibold">Moment Capture</h1>
      <p className="text-sm text-zinc-600">
        This UI is mobile-first and designed for one-hand use during class.
      </p>

      <form className="space-y-3 rounded-xl border border-zinc-200 bg-white p-4" onSubmit={onSubmit}>
        <label className="block text-sm">
          Student
          <select
            className="mt-1 w-full rounded-lg border border-zinc-300 p-2"
            value={selectedStudent}
            onChange={(event) => setSelectedStudent(event.target.value)}
            disabled={!hasStudents}
          >
            {!hasStudents ? (
              <option value="">No students — connect Supabase data later</option>
            ) : (
              students.map((student) => (
                <option key={student.id} value={student.id}>
                  {student.fullName}
                </option>
              ))
            )}
          </select>
        </label>
        <label className="block text-sm">
          Session label
          <input
            name="sessionLabel"
            className="mt-1 w-full rounded-lg border border-zinc-300 p-2"
            placeholder="Tue 5PM Phonics Group"
            required
          />
        </label>
        <label className="block text-sm">
          Quick note
          <textarea name="note" className="mt-1 w-full rounded-lg border border-zinc-300 p-2" rows={3} />
        </label>
        <label className="block text-sm">
          Capture/upload
          <input name="photo" type="file" accept="image/*" capture="environment" className="mt-1 block w-full text-sm" />
        </label>
        <button
          type="submit"
          disabled={!hasStudents}
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm text-white hover:bg-zinc-800 disabled:opacity-50"
        >
          Save Moment Draft
        </button>
      </form>

      <section className="space-y-3">
        {moments.map((moment, index) => (
          <article key={`${moment.createdAt}-${index}`} className="rounded-xl border border-zinc-200 bg-white p-4">
            <div className="text-sm font-medium">
              {students.find((student) => student.id === moment.studentId)?.fullName}
            </div>
            <div className="text-xs text-zinc-600">{moment.sessionLabel}</div>
            <div className="mt-2 text-sm">{moment.note || "No note provided."}</div>
            <div className="mt-2 text-xs text-zinc-500">
              {moment.fileName} - tagged at {new Date(moment.createdAt).toLocaleString()}
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}
