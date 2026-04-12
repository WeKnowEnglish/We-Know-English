/**
 * One-time import: localStorage-shaped JSON → Supabase (service role).
 *
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, WKE_IMPORT_ORG_ID (uuid)
 * Arg: path to JSON file { students, classes, enrollments }
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const orgId = process.env.WKE_IMPORT_ORG_ID;
const filePath = process.argv[2];

if (!url || !serviceKey || !orgId || !filePath) {
  console.error(
    "Usage: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... WKE_IMPORT_ORG_ID=... node import-wke-localstorage.mjs export.json",
  );
  process.exit(1);
}

const raw = JSON.parse(readFileSync(filePath, "utf8"));
const studentsIn = Array.isArray(raw.students) ? raw.students : [];
const classesIn = Array.isArray(raw.classes) ? raw.classes : [];
const enrollmentsIn = Array.isArray(raw.enrollments) ? raw.enrollments : [];

const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

const studentIdMap = new Map();
const classIdMap = new Map();

for (const s of studentsIn) {
  const newId = randomUUID();
  studentIdMap.set(s.id, newId);
  const profile = {
    avatar: s.avatar ?? "",
    gender: s.gender ?? "other",
    accountStatus: s.accountStatus ?? "unlinked",
    lastLoginAt: s.lastLoginAt ?? null,
  };
  const { error } = await supabase.from("students").insert({
    id: newId,
    organization_id: orgId,
    full_name: s.fullName ?? "Student",
    level: s.level ?? "Beginner",
    email: s.email?.trim() ? String(s.email).trim().toLowerCase() : null,
    birthdate: s.birthday || null,
    skills_points: typeof s.skillsPoints === "number" ? s.skillsPoints : 0,
    profile,
  });
  if (error) {
    console.error("student insert", s.id, error.message);
    process.exit(1);
  }
  console.log("student", s.id, "→", newId);
}

const LEGACY_BAND_TO_GRADES = {
  "K-2": ["K", "1", "2"],
  "3-5": ["3", "4", "5"],
  "6-8": ["6", "7", "8"],
  "9-12": ["9", "10", "11", "12"],
};

function gradesForClassExport(c) {
  if (Array.isArray(c.grades) && c.grades.length) return c.grades;
  const band = c.gradeBand;
  if (typeof band === "string" && LEGACY_BAND_TO_GRADES[band]) return [...LEGACY_BAND_TO_GRADES[band]];
  return ["4"];
}

for (const c of classesIn) {
  const newId = randomUUID();
  classIdMap.set(c.id, newId);
  const settings = {
    grades: gradesForClassExport(c),
    cefrLevel: c.cefrLevel,
    joinCode: c.joinCode,
    nextSessionAt: c.nextSessionAt,
    updatedAt: c.updatedAt,
    scheduleSlots: c.scheduleSlots ?? [],
    weeklyRepeat: c.weeklyRepeat ?? null,
    weeklyRepeatRules: c.weeklyRepeatRules ?? [],
  };
  const { error } = await supabase.from("classes").insert({
    id: newId,
    organization_id: orgId,
    name: c.name ?? "Class",
    class_type: "small_group",
    duration_minutes: 50,
    title: c.name ?? "Class",
    settings,
  });
  if (error) {
    console.error("class insert", c.id, error.message);
    process.exit(1);
  }
  console.log("class", c.id, "→", newId);
}

for (const e of enrollmentsIn) {
  const sid = studentIdMap.get(e.studentId);
  const cid = classIdMap.get(e.classId);
  if (!sid || !cid) {
    console.warn("skip enrollment (missing id)", e);
    continue;
  }
  const { error } = await supabase.from("enrollments").insert({
    organization_id: orgId,
    class_id: cid,
    student_id: sid,
  });
  if (error) {
    console.error("enrollment", error.message);
    process.exit(1);
  }
}

console.log("Done. Clear browser localStorage keys wke:students, wke:classes, wke:class_enrollments.");
