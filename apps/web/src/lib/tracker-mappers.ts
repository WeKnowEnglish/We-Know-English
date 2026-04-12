import { classGradeLevels, sortClassGrades } from "@/lib/tracker-constants";
import type { CEFRLevel, ClassGradeLevel, ClassRoom, Student, StudentAccountStatus, StudentClassEnrollment } from "@/lib/tracker-types";

type Json = Record<string, unknown>;

const DEFAULT_GRADES: ClassGradeLevel[] = ["4"];
const DEFAULT_CEFR: CEFRLevel = "A1";

/** Legacy `gradeBand` from settings before per-grade selection. */
const LEGACY_GRADE_BAND_TO_GRADES: Record<string, ClassGradeLevel[]> = {
  "K-2": ["K", "1", "2"],
  "3-5": ["3", "4", "5"],
  "6-8": ["6", "7", "8"],
  "9-12": ["9", "10", "11", "12"],
};

function isClassGradeLevel(v: unknown): v is ClassGradeLevel {
  return typeof v === "string" && (classGradeLevels as readonly string[]).includes(v);
}

function parseGradesFromSettings(s: Partial<ClassRoom> & Record<string, unknown>): ClassGradeLevel[] {
  const raw = s.grades;
  if (Array.isArray(raw)) {
    const parsed = raw.filter(isClassGradeLevel);
    if (parsed.length > 0) return sortClassGrades(parsed);
  }
  const band = s.gradeBand;
  if (typeof band === "string" && LEGACY_GRADE_BAND_TO_GRADES[band]) {
    return [...LEGACY_GRADE_BAND_TO_GRADES[band]];
  }
  return [...DEFAULT_GRADES];
}

function asString(v: unknown, fallback: string): string {
  return typeof v === "string" && v.length > 0 ? v : fallback;
}

export function classRowToClassRoom(row: {
  id: string;
  name: string;
  created_at: string;
  settings: Json | null;
}): ClassRoom {
  const s = (row.settings ?? {}) as Partial<ClassRoom> & Record<string, unknown>;
  const created = row.created_at;
  return {
    id: row.id,
    name: row.name,
    grades: parseGradesFromSettings(s),
    cefrLevel: (s.cefrLevel as CEFRLevel) ?? DEFAULT_CEFR,
    joinCode: asString(s.joinCode, "CODE00"),
    nextSessionAt: typeof s.nextSessionAt === "string" ? s.nextSessionAt : asString(s.nextSessionAt, created),
    updatedAt: asString(s.updatedAt, created),
    scheduleSlots: Array.isArray(s.scheduleSlots) ? (s.scheduleSlots as ClassRoom["scheduleSlots"]) : undefined,
    weeklyRepeat: s.weeklyRepeat as ClassRoom["weeklyRepeat"],
    weeklyRepeatRules: Array.isArray(s.weeklyRepeatRules)
      ? (s.weeklyRepeatRules as ClassRoom["weeklyRepeatRules"])
      : undefined,
  };
}

export function classRoomToSettingsPatch(classRoom: ClassRoom): Json {
  return {
    grades: sortClassGrades(classRoom.grades),
    cefrLevel: classRoom.cefrLevel,
    joinCode: classRoom.joinCode,
    nextSessionAt: classRoom.nextSessionAt,
    updatedAt: classRoom.updatedAt,
    scheduleSlots: classRoom.scheduleSlots ?? [],
    weeklyRepeat: classRoom.weeklyRepeat ?? null,
    weeklyRepeatRules: classRoom.weeklyRepeatRules ?? [],
  };
}

export function studentRowToStudent(row: {
  id: string;
  full_name: string;
  level: string | null;
  email: string | null;
  birthdate: string | null;
  skills_points: number | null;
  linked_user_id: string | null;
  profile: Json | null;
}): Student {
  const p = (row.profile ?? {}) as Json;
  const gender = p.gender === "male" || p.gender === "female" || p.gender === "other" ? p.gender : "other";
  const accountStatus = (p.accountStatus as StudentAccountStatus) ?? (row.linked_user_id ? "active" : "unlinked");
  const birthday = row.birthdate ? String(row.birthdate).slice(0, 10) : asString(p.birthday, "");
  return {
    id: row.id,
    fullName: row.full_name,
    avatar: asString(p.avatar, ""),
    gender,
    birthday,
    email: row.email?.trim() ?? "",
    accountStatus: accountStatus === "invited" || accountStatus === "active" || accountStatus === "unlinked" ? accountStatus : "unlinked",
    linkedAuthUserId: row.linked_user_id ?? undefined,
    lastLoginAt: typeof p.lastLoginAt === "string" ? p.lastLoginAt : undefined,
    level: row.level ?? asString(p.level, "Beginner"),
    skillsPoints: row.skills_points ?? 0,
  };
}

export function studentToProfilePatch(partial: {
  avatar: string;
  gender: Student["gender"];
  level: string;
  accountStatus: StudentAccountStatus;
  lastLoginAt?: string;
  birthday?: string;
}): Json {
  return {
    avatar: partial.avatar,
    gender: partial.gender,
    level: partial.level,
    accountStatus: partial.accountStatus,
    lastLoginAt: partial.lastLoginAt ?? null,
    birthday: partial.birthday ?? null,
  };
}

export function enrollmentRowToEnrollment(row: {
  student_id: string;
  class_id: string;
  created_at: string;
}): StudentClassEnrollment {
  return {
    studentId: row.student_id,
    classId: row.class_id,
    joinedAt: row.created_at,
  };
}
