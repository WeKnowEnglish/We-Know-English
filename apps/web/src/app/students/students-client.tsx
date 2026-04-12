"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { createStudentAction, deleteStudentAction } from "@/app/actions/tracker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { ClassRoom, Student, StudentClassEnrollment } from "@/lib/tracker-types";

type StudentsClientProps = {
  organizationId: string;
  initialStudents: Student[];
  initialClasses: ClassRoom[];
  initialEnrollments: StudentClassEnrollment[];
};

export function StudentsClient({
  organizationId,
  initialStudents,
  initialClasses,
  initialEnrollments,
}: StudentsClientProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [items, setItems] = useState<Student[]>(initialStudents);
  const [classes] = useState<ClassRoom[]>(initialClasses);
  const [enrollments, setEnrollments] = useState<StudentClassEnrollment[]>(initialEnrollments);

  useEffect(() => {
    setItems(initialStudents);
    setEnrollments(initialEnrollments);
  }, [initialStudents, initialEnrollments]);

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [gender, setGender] = useState<"female" | "male" | "other">("female");
  const [birthday, setBirthday] = useState("");
  const [level, setLevel] = useState("Beginner");
  const [selectedClassId, setSelectedClassId] = useState<string>("none");
  const [formError, setFormError] = useState<string | null>(null);

  const classMap = useMemo(() => new Map(classes.map((classRoom) => [classRoom.id, classRoom])), [classes]);

  const createStudent = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedName = fullName.trim();
    if (!trimmedName) return;
    setFormError(null);
    startTransition(async () => {
      const result = await createStudentAction(organizationId, {
        fullName: trimmedName,
        email: email.trim(),
        gender,
        birthday,
        level,
        classId: selectedClassId,
      });
      if (!result.ok) {
        setFormError(result.error);
        return;
      }
      setFullName("");
      setEmail("");
      setBirthday("");
      setLevel("Beginner");
      setGender("female");
      setSelectedClassId("none");
      setShowCreateForm(false);
      router.refresh();
    });
  };

  const deleteStudent = (studentId: string, studentName: string) => {
    const confirmed = window.confirm(`Delete student "${studentName}"?`);
    if (!confirmed) return;
    startTransition(async () => {
      const result = await deleteStudentAction(organizationId, studentId);
      if (!result.ok) {
        window.alert(result.error);
        return;
      }
      router.refresh();
    });
  };

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Students</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Teacher database for enrollment tracking. Students can join multiple classes and move between levels. Email is
            optional until a parent completes registration.
          </p>
        </div>
        <Button type="button" size="sm" onClick={() => setShowCreateForm((v) => !v)}>
          {showCreateForm ? "Close form" : "Add student"}
        </Button>
      </div>

      {showCreateForm ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Create student</CardTitle>
            <CardDescription>Add core student info. Birthday and class assignment are optional.</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="grid gap-3 md:grid-cols-5" onSubmit={createStudent}>
              <input
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                placeholder="Student name"
                className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
              />
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="Student email (optional)"
                className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
              />
              <select
                value={gender}
                onChange={(event) => setGender(event.target.value as "female" | "male" | "other")}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
              >
                <option value="female">Female</option>
                <option value="male">Male</option>
                <option value="other">Other</option>
              </select>
              <input
                type="date"
                value={birthday}
                onChange={(event) => setBirthday(event.target.value)}
                title="Birthday (optional)"
                className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
              />
              <select
                value={level}
                onChange={(event) => setLevel(event.target.value)}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
              >
                <option value="Beginner">Beginner</option>
                <option value="Intermediate">Intermediate</option>
                <option value="Advanced">Advanced</option>
              </select>
              <select
                value={selectedClassId}
                onChange={(event) => setSelectedClassId(event.target.value)}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
              >
                <option value="none">Optional class</option>
                {classes.map((classRoom) => (
                  <option key={classRoom.id} value={classRoom.id}>
                    {classRoom.name}
                  </option>
                ))}
              </select>
              <div className="md:col-span-5 flex flex-wrap gap-2">
                <Button type="submit" size="sm" disabled={pending}>
                  Save student
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setShowCreateForm(false);
                    setFullName("");
                    setEmail("");
                    setBirthday("");
                    setLevel("Beginner");
                    setGender("female");
                    setSelectedClassId("none");
                    setFormError(null);
                  }}
                >
                  Cancel
                </Button>
              </div>
            </form>
            {formError ? <p className="mt-2 text-sm text-destructive">{formError}</p> : null}
          </CardContent>
        </Card>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2">
        {items.map((student) => {
          const classMemberships = enrollments
            .filter((row) => row.studentId === student.id)
            .map((row) => classMap.get(row.classId))
            .filter((classRoom): classRoom is NonNullable<typeof classRoom> => Boolean(classRoom));
          const hasEmail = Boolean(student.email?.trim());
          return (
            <div key={student.id} className="group relative">
              <button
                type="button"
                aria-label={`Delete ${student.fullName}`}
                title="Delete student"
                className="pointer-events-none absolute top-2 right-2 z-10 inline-flex size-6 items-center justify-center rounded-full border border-red-300 bg-background/95 text-sm font-semibold text-red-600 opacity-0 shadow-sm transition-opacity group-hover:pointer-events-auto group-hover:opacity-100 hover:bg-red-50"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  deleteStudent(student.id, student.fullName);
                }}
              >
                ×
              </button>
              <Link href={`/students/${student.id}`}>
                <Card className="h-full transition-colors hover:bg-accent/40">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">{student.fullName}</CardTitle>
                    <CardDescription>
                      {student.level} · {student.gender} · {student.birthday || "—"}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">{hasEmail ? student.email : "No email yet"}</Badge>
                      <Badge
                        variant={
                          student.accountStatus === "active"
                            ? "secondary"
                            : student.accountStatus === "invited"
                              ? "outline"
                              : "outline"
                        }
                      >
                        {student.accountStatus}
                      </Badge>
                      {!student.linkedAuthUserId && hasEmail ? (
                        <button
                          type="button"
                          className="text-xs text-primary underline-offset-4 hover:underline"
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            window.location.href = `/signup?role=student&email=${encodeURIComponent(student.email)}&name=${encodeURIComponent(student.fullName)}`;
                          }}
                        >
                          Invite signup
                        </button>
                      ) : null}
                    </div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Class enrollments</p>
                    <div className="flex flex-wrap gap-2">
                      {classMemberships.length ? (
                        classMemberships.map((classRoom) => (
                          <Badge key={classRoom.id} variant="secondary">
                            {classRoom.name}
                          </Badge>
                        ))
                      ) : (
                        <span className="text-sm text-muted-foreground">No class assigned yet.</span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            </div>
          );
        })}
      </section>
    </main>
  );
}
