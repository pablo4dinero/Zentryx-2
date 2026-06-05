// Simple HTML/XSS sanitization — removes all HTML tags from user input
export function sanitize(input: string | null | undefined): string {
  if (!input) return "";
  // Remove all HTML tags and decode entities
  return input
    .replace(/<script[^>]*>.*?<\/script>/gi, "") // Remove script tags
    .replace(/<[^>]+>/g, "") // Remove all HTML tags
    .trim();
}

export function sanitizeFields<T extends Record<string, any>>(obj: T, fields: (keyof T)[]): T {
  const result = { ...obj };
  for (const field of fields) {
    if (typeof result[field] === "string") {
      result[field] = sanitize(result[field]) as any;
    }
  }
  return result;
}
