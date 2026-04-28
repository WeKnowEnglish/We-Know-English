"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  archiveClassPostAction,
  createClassPostDraftAction,
  publishClassPostAction,
  addStudentTagToClassPostAction,
  addTagToClassPostAction,
  uploadClassPostMediaAction,
} from "@/app/actions/class-feed";
import type { ClassFeedPost, Student } from "@/lib/tracker-types";

type Props = {
  organizationId: string;
  classId: string;
  className: string;
  students: Student[];
  posts: ClassFeedPost[];
  feedError: string | null;
};

export function ClassFeedClient({ organizationId, classId, className, students, posts, feedError }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [feedFilter, setFeedFilter] = useState<"published" | "drafts" | "all">("published");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [tagsText, setTagsText] = useState("");
  const [publishNow, setPublishNow] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const studentMap = useMemo(() => new Map(students.map((s) => [s.id, s.fullName])), [students]);
  const filteredPosts = useMemo(() => {
    if (feedFilter === "all") return posts;
    if (feedFilter === "drafts") return posts.filter((post) => post.status === "draft");
    return posts.filter((post) => post.status === "published");
  }, [feedFilter, posts]);

  const addFiles = (picked: FileList | null) => {
    if (!picked || picked.length === 0) return;
    const next = Array.from(picked);
    setFiles((prev) => [...prev, ...next]);
  };

  const toggleStudent = (studentId: string) => {
    setSelectedStudentIds((prev) =>
      prev.includes(studentId) ? prev.filter((id) => id !== studentId) : [...prev, studentId],
    );
  };

  const submitDraft = () => {
    setMessage(null);
    const tags = tagsText
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    if (!body.trim()) {
      setMessage("Post body is required.");
      return;
    }

    startTransition(async () => {
      const created = await createClassPostDraftAction({
        organizationId,
        classId,
        title: title.trim() || undefined,
        body,
      });
      if (!created.ok) {
        setMessage(created.error);
        return;
      }

      for (const studentId of selectedStudentIds) {
        await addStudentTagToClassPostAction({
          organizationId,
          classId,
          postId: created.postId,
          studentId,
        });
      }

      for (const tag of tags) {
        await addTagToClassPostAction({
          organizationId,
          classId,
          postId: created.postId,
          tag,
        });
      }

      for (const file of files) {
        const uploaded = await uploadClassPostMediaAction({
          organizationId,
          classId,
          postId: created.postId,
          file,
        });
        if (!uploaded.ok) {
          setMessage(uploaded.error);
          return;
        }
      }

      if (publishNow) {
        const published = await publishClassPostAction({
          organizationId,
          classId,
          postId: created.postId,
        });
        if (!published.ok) {
          setMessage(published.error);
          return;
        }
      }

      setTitle("");
      setBody("");
      setSelectedStudentIds([]);
      setTagsText("");
      setFiles([]);
      setPublishNow(false);
      setMessage(publishNow ? "Post published." : "Draft saved.");
      router.refresh();
    });
  };

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{className} · Class Feed</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Create one class post, then publish when ready for parent/student visibility.
        </p>
        {feedError ? (
          <p className="mt-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            Feed read error: {feedError}
          </p>
        ) : null}
      </header>

      <section className="rounded-xl border border-border bg-card p-4">
        <h2 className="text-base font-semibold">New post</h2>
        <div className="mt-3 space-y-3">
          <label className="block text-sm">
            Title (optional)
            <input
              className="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Warm-up wins"
            />
          </label>
          <label className="block text-sm">
            Body
            <textarea
              className="mt-1 min-h-24 w-full rounded-md border border-input bg-background p-3 text-sm"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="What happened in class?"
            />
          </label>
          <label className="block text-sm">
            Quick tags (comma-separated)
            <input
              className="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={tagsText}
              onChange={(e) => setTagsText(e.target.value)}
              placeholder="phonics, engagement, reading"
            />
          </label>
          <div>
            <p className="text-sm">Tag students</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {students.length === 0 ? (
                <span className="text-sm text-muted-foreground">No enrolled students yet.</span>
              ) : (
                students.map((student) => {
                  const selected = selectedStudentIds.includes(student.id);
                  return (
                    <button
                      key={student.id}
                      type="button"
                      onClick={() => toggleStudent(student.id)}
                      className={`rounded-full border px-3 py-1 text-sm ${selected ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background"}`}
                    >
                      {student.fullName}
                    </button>
                  );
                })
              )}
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-sm">Media uploads</p>
            <label className="block text-sm text-muted-foreground">
              Upload from gallery
              <input
                type="file"
                multiple
                accept="image/*"
                className="mt-1 block w-full text-sm"
                onChange={(e) => addFiles(e.target.files)}
              />
            </label>
            <label className="block text-sm text-muted-foreground">
              Take photo with camera
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="mt-1 block w-full text-sm"
                onChange={(e) => addFiles(e.target.files)}
              />
            </label>
            {files.length > 0 ? (
              <p className="text-xs text-muted-foreground">
                Selected files: {files.map((f) => f.name).join(", ")}
              </p>
            ) : null}
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={publishNow} onChange={(e) => setPublishNow(e.target.checked)} />
            Publish immediately after saving draft
          </label>
          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={isPending}
              className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50"
              onClick={submitDraft}
            >
              {isPending ? "Saving..." : "Save post"}
            </button>
            {message ? <span className="text-sm text-muted-foreground">{message}</span> : null}
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold">Timeline</h2>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className={`rounded-md border px-3 py-1 text-sm ${feedFilter === "published" ? "border-primary text-primary" : "border-border"}`}
              onClick={() => setFeedFilter("published")}
            >
              Published
            </button>
            <button
              type="button"
              className={`rounded-md border px-3 py-1 text-sm ${feedFilter === "drafts" ? "border-primary text-primary" : "border-border"}`}
              onClick={() => setFeedFilter("drafts")}
            >
              Drafts
            </button>
            <button
              type="button"
              className={`rounded-md border px-3 py-1 text-sm ${feedFilter === "all" ? "border-primary text-primary" : "border-border"}`}
              onClick={() => setFeedFilter("all")}
            >
              All
            </button>
          </div>
        </div>
        {filteredPosts.length === 0 ? (
          <p className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
            No {feedFilter === "all" ? "" : `${feedFilter} `}posts yet for this class.
          </p>
        ) : (
          filteredPosts.map((post) => (
            <article key={post.id} className="rounded-xl border border-border bg-card p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-base font-medium">{post.title ?? "Untitled post"}</h3>
                <span className="rounded-full border border-border px-2 py-0.5 text-xs uppercase tracking-wide">
                  {post.status}
                </span>
              </div>
              <p className="mt-2 text-sm whitespace-pre-wrap">{post.body}</p>
              {post.tags.length > 0 ? (
                <p className="mt-2 text-xs text-muted-foreground">Tags: {post.tags.join(", ")}</p>
              ) : null}
              {post.studentIds.length > 0 ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  Students: {post.studentIds.map((id) => studentMap.get(id) ?? "Student").join(", ")}
                </p>
              ) : null}
              {post.media.length > 0 ? (
                <p className="mt-1 text-xs text-muted-foreground">Media files: {post.media.length}</p>
              ) : null}
              <p className="mt-2 text-xs text-muted-foreground">
                Created {new Date(post.createdAt).toLocaleString()}
                {post.publishedAt ? ` · Published ${new Date(post.publishedAt).toLocaleString()}` : ""}
              </p>
              <div className="mt-3 flex items-center gap-2">
                {post.status === "draft" ? (
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() =>
                      startTransition(async () => {
                        const result = await publishClassPostAction({ organizationId, classId, postId: post.id });
                        setMessage(result.ok ? "Post published." : result.error);
                        router.refresh();
                      })
                    }
                    className="rounded-md border border-border px-3 py-1 text-sm"
                  >
                    Publish
                  </button>
                ) : null}
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() =>
                    startTransition(async () => {
                      const result = await archiveClassPostAction({ organizationId, classId, postId: post.id });
                      setMessage(result.ok ? "Post archived." : result.error);
                      router.refresh();
                    })
                  }
                  className="rounded-md border border-border px-3 py-1 text-sm"
                >
                  Archive
                </button>
              </div>
            </article>
          ))
        )}
      </section>
    </main>
  );
}
