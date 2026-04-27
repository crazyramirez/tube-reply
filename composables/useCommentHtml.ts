const ALLOWED_TAGS = new Set(["br", "b", "strong", "i", "em", "a"]);

export function renderCommentHtml(text: string | null | undefined): string {
  if (!text) return "";

  // Strip all tags except allowed ones, sanitize attributes on <a>
  return text.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g, (match, tag) => {
    const lower = tag.toLowerCase();
    if (!ALLOWED_TAGS.has(lower)) return "";
    if (lower === "a") {
      const hrefMatch = match.match(/href=["']([^"']+)["']/i);
      const href = hrefMatch ? hrefMatch[1] : "#";
      const safe = href.startsWith("http") ? href : "#";
      return `<a href="${safe}" target="_blank" rel="noopener noreferrer" class="text-indigo-400 underline hover:text-indigo-300">`;
    }
    if (match.startsWith("</")) return `</${lower}>`;
    return `<${lower}>`;
  });
}
