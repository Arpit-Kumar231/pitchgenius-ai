import { useMemo } from "react";
import DOMPurify from "dompurify";
import { z } from "zod";

export const customHtmlSchema = z.object({
  html: z.string().min(1),
  background: z.string().optional(),
  notes: z.string().optional(),
});

/**
 * Renders fully AI-generated HTML/CSS for a 1920x1080 slide canvas.
 * The model is instructed to use inline styles + a single optional <style>
 * block scoped to .ai-slide-root. We sanitize aggressively: no scripts,
 * no event handlers, no remote scripts.
 */
export function CustomHtml({ data }: { data: z.infer<typeof customHtmlSchema> }) {
  const safe = useMemo(
    () =>
      DOMPurify.sanitize(data.html, {
        USE_PROFILES: { html: true, svg: true, svgFilters: true },
        FORBID_TAGS: ["script", "iframe", "object", "embed", "link", "meta", "base"],
        FORBID_ATTR: ["onerror", "onload", "onclick", "onmouseover", "onfocus", "onblur"],
        ADD_TAGS: ["style"],
      }),
    [data.html]
  );
  return (
    <div
      className="ai-slide-root"
      style={{
        width: 1920,
        height: 1080,
        background: data.background || "#0a1628",
        color: "white",
        fontFamily: "Inter, system-ui, sans-serif",
        position: "relative",
        overflow: "hidden",
      }}
      dangerouslySetInnerHTML={{ __html: safe }}
    />
  );
}