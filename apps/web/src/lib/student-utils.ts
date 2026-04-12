export function makeStudentId() {
  return `stu_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}

export function makeAvatar(name: string) {
  const words = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return "ST";
  const first = words[0]?.[0] ?? "";
  const second = words[1]?.[0] ?? words[0]?.[1] ?? "";
  return `${first}${second}`.toUpperCase();
}
