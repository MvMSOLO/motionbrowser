import { createServerFn } from "@tanstack/react-start";
import { parseDuckDuckGoHtml, type SearchHit } from "./search-parse";

export const searchWeb = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    if (!input || typeof input !== "object" || !("query" in input)) throw new Error("Missing search");
    const query = String((input as { query: unknown }).query).trim().slice(0, 180);
    if (!query) throw new Error("Empty search");
    return { query };
  })
  .handler(async ({ data }): Promise<{ hits: SearchHit[]; error: string | null }> => {
    try {
      const response = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(data.query)}`, {
        redirect: "follow",
        signal: AbortSignal.timeout(8000),
        headers: { "user-agent": "MotionBrowser/0.1" },
      });
      if (!response.ok) return { hits: [], error: "Qidiruv javob bermadi. Uni tashqarida ochishingiz mumkin." };
      const html = (await response.text()).slice(0, 200_000);
      return { hits: parseDuckDuckGoHtml(html), error: null };
    } catch {
      return { hits: [], error: "Qidiruvga ulanib bo‘lmadi. Uni tashqarida ochishingiz mumkin." };
    }
  });
