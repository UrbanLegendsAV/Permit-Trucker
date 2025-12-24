import { JSDOM } from "jsdom";
import createDOMPurify from "dompurify";

const window = new JSDOM("").window;
const purify = createDOMPurify(window);

export function sanitizeHtml(dirty: string | null | undefined): string {
  if (!dirty) return "";
  return purify.sanitize(dirty, {
    ALLOWED_TAGS: [],
    ALLOWED_ATTR: [],
  });
}

export function sanitizeText(text: string | null | undefined): string {
  if (!text) return "";
  return text
    .replace(/[<>]/g, "")
    .replace(/javascript:/gi, "")
    .replace(/on\w+=/gi, "")
    .trim();
}

export function sanitizeUserInput<T extends Record<string, unknown>>(
  data: T,
  textFields: (keyof T)[]
): T {
  const sanitized = { ...data };
  for (const field of textFields) {
    const value = sanitized[field];
    if (typeof value === "string") {
      (sanitized as Record<string, unknown>)[field as string] = sanitizeHtml(value);
    }
  }
  return sanitized;
}
