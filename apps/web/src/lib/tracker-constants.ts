import type { CEFRLevel, ClassGradeLevel } from "@/lib/tracker-types";

export const classGradeLevels: ClassGradeLevel[] = ["K", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"];

const gradeShortLabel: Record<ClassGradeLevel, string> = {
  K: "K",
  "1": "1",
  "2": "2",
  "3": "3",
  "4": "4",
  "5": "5",
  "6": "6",
  "7": "7",
  "8": "8",
  "9": "9",
  "10": "10",
  "11": "11",
  "12": "12",
};

const gradeLongLabel: Record<ClassGradeLevel, string> = {
  K: "Kindergarten",
  "1": "Grade 1",
  "2": "Grade 2",
  "3": "Grade 3",
  "4": "Grade 4",
  "5": "Grade 5",
  "6": "Grade 6",
  "7": "Grade 7",
  "8": "Grade 8",
  "9": "Grade 9",
  "10": "Grade 10",
  "11": "Grade 11",
  "12": "Grade 12",
};

export function classGradeLevelLongLabel(level: ClassGradeLevel): string {
  return gradeLongLabel[level];
}

/** Sort grades in K, 1, … 12 order. */
export function sortClassGrades(grades: ClassGradeLevel[]): ClassGradeLevel[] {
  const order = new Map(classGradeLevels.map((g, i) => [g, i]));
  return [...grades].sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
}

/** Comma-separated short labels for tiles (e.g. "K, 3, 4"). */
export function formatClassGradesShort(grades: ClassGradeLevel[]): string {
  if (!grades.length) return "—";
  return sortClassGrades(grades)
    .map((g) => gradeShortLabel[g])
    .join(", ");
}

/** Readable list for sentences (e.g. "Kindergarten, Grade 3, Grade 4"). */
export function formatClassGradesLong(grades: ClassGradeLevel[]): string {
  if (!grades.length) return "";
  return sortClassGrades(grades)
    .map((g) => gradeLongLabel[g])
    .join(", ");
}

export const cefrLevels: CEFRLevel[] = ["A1", "A2", "B1", "B2", "C1", "C2"];
