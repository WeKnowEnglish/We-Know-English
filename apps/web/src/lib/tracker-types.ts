/** present / late billable; absent_unexcused billable; absent_excused not billed for session */
export type AttendanceStatus = "present" | "late" | "absent_excused" | "absent_unexcused";
export type CEFRLevel = "A1" | "A2" | "B1" | "B2" | "C1" | "C2";

/** Single grade level; classes may include one or many in `ClassRoom.grades`. */
export type ClassGradeLevel = "K" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "11" | "12";

export type ClassScheduleSlot = {
  id: string;
  startsAt: string;
};

export type WeeklyRepeatConfig = {
  weekdays: number[];
  timeLocal: string;
};

export type WeeklyRepeatRule = {
  id: string;
  weekdays: number[];
  timeLocal: string;
  /** First calendar day this pattern applies (local YYYY-MM-DD). Omit for legacy rules (no lower bound). */
  repeatFrom?: string;
  repeatUntil: string;
};

export type ClassRoom = {
  id: string;
  name: string;
  /** One or more grades (e.g. only Grade 3, or Grades 3 and 4). */
  grades: ClassGradeLevel[];
  cefrLevel: CEFRLevel;
  joinCode: string;
  nextSessionAt: string;
  updatedAt: string;
  scheduleSlots?: ClassScheduleSlot[];
  weeklyRepeat?: WeeklyRepeatConfig;
  weeklyRepeatRules?: WeeklyRepeatRule[];
};

export type StudentClassEnrollment = {
  studentId: string;
  classId: string;
  joinedAt: string;
};

export type StudentAccountStatus = "unlinked" | "invited" | "active";

export type Student = {
  id: string;
  fullName: string;
  avatar: string;
  gender: "female" | "male" | "other";
  birthday: string;
  /** Empty string means not set yet (optional until parent registers). */
  email: string;
  accountStatus: StudentAccountStatus;
  linkedAuthUserId?: string;
  lastLoginAt?: string;
  level: string;
  skillsPoints: number;
};

export type FeedItemType = "photo" | "achievement" | "note";

export type FeedEntry = {
  id: string;
  studentId: string;
  type: FeedItemType;
  content: string | null;
  mediaUrl: string | null;
  createdAt: string;
};
