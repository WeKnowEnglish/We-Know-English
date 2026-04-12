/**
 * UI constants and type re-exports. Domain data lives in Supabase — do not add demo seed arrays here.
 */
export type {
  AttendanceStatus,
  CEFRLevel,
  ClassGradeLevel,
  ClassRoom,
  ClassScheduleSlot,
  FeedEntry,
  FeedItemType,
  Student,
  StudentAccountStatus,
  StudentClassEnrollment,
  WeeklyRepeatConfig,
  WeeklyRepeatRule,
} from "@/lib/tracker-types";

import type { ClassRoom, FeedEntry, Student, StudentClassEnrollment } from "@/lib/tracker-types";

export {
  cefrLevels,
  classGradeLevelLongLabel,
  classGradeLevels,
  formatClassGradesLong,
  formatClassGradesShort,
  sortClassGrades,
} from "@/lib/tracker-constants";

export const tags: string[] = [];

export const students: Student[] = [];
export const classes: ClassRoom[] = [];
export const studentClassEnrollments: StudentClassEnrollment[] = [];
export const pulseFeed: FeedEntry[] = [];
