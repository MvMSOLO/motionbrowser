export type SearchHit = { title: string; url: string };

const AMP = "&" + "amp;";
const QUOT = "&" + "quot;";
const APOS_HEX = "&" + "#x27;";
const APOS_DEC = "&" + "#39;";
const LT = "&" + "lt;";
const GT = "&" + "gt;";

export function unwrapDuckDuckGoHref(href: string): string | null {
  try {
    const absolute = href.startsWith("//") ? `https:${href}` : href;
    const url = new URL(absolute, "https://duckduckgo.com");
    const wrapped = url.searchParams.get("uddg");
    const target = wrapped ? new URL(wrapped) : url;
    if (target.protocol !== "https:") return null;
    if (!target.hostname || target.hostname === "duckduckgo.com") return null;
    return target.toString();
  } catch {
    return null;
  }
}

export function parseDuckDuckGoHtml(html: string): SearchHit[] {
  const hits: SearchHit[] = [];
  const seen = new Set<string>();
  const pattern = /<a\b[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of html.matchAll(pattern)) {
    const url = unwrapDuckDuckGoHref(match[1].replaceAll(AMP, "&"));
    const title = decodeBasic(match[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
    if (!url || !title || seen.has(url)) continue;
    seen.add(url);
    hits.push({ title: title.slice(0, 180), url });
    if (hits.length >= 8) break;
  }
  return hits;
}

function decodeBasic(value: string): string {
  return value
    .replaceAll(AMP, "&")
    .replaceAll(QUOT, '"')
    .replaceAll(APOS_HEX, "'")
    .replaceAll(APOS_DEC, "'")
    .replaceAll(LT, "<")
    .replaceAll(GT, ">");
}
