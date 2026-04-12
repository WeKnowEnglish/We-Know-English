type DraftInput = {
  studentName: string;
  lessonFocus: string;
  tags: string[];
};

function normalizeTag(tag: string) {
  return tag.replace(/^#/, "").replaceAll("_", " ");
}

export function buildNarrativeDraft(input: DraftInput) {
  const normalizedTags = input.tags.slice(0, 3).map(normalizeTag);
  const highlights = normalizedTags.length > 0 ? normalizedTags.join(", ") : "steady effort";

  return [
    `${input.studentName} stayed focused during ${input.lessonFocus} and showed ${highlights}.`,
    `We practiced target skills with guided examples, and progress was visible throughout the session.`,
    `For next class, we will reinforce this with short review activities to build confidence.`,
  ].join(" ");
}

export function isThreeSentenceDraft(text: string) {
  const sentences = text
    .split(/[.!?]+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  return sentences.length === 3;
}
