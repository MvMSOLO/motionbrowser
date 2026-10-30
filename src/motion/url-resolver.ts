export type ResolveResult =
  | { kind: "internal"; id: "lab"; label: string }
  | { kind: "navigate"; url: string; display: string }
  | { kind: "search"; query: string; provider: "duckduckgo" }
  | { kind: "error"; message: string };

const ALIASES: Record<string, string> = {
  instagram: "https://www.instagram.com/",
  insta: "https://www.instagram.com/",
  ig: "https://www.instagram.com/",
  youtube: "https://www.youtube.com/",
  yt: "https://www.youtube.com/",
  wikipedia: "https://en.wikipedia.org/",
  wiki: "https://en.wikipedia.org/",
  example: "https://example.com/",
};

const LAB_ALIASES = new Set(["lab", "motion lab", "gesture lab", "motionlab"]);

const BLOCKED_SCHEMES = new Set([
  "javascript",
  "file",
  "content",
  "data",
  "blob",
  "intent",
  "about",
  "chrome",
  "chrome-extension",
  "view-source",
]);

function ipv4ToInt(a: number, b: number, c: number, d: number): number {
  return (((a << 24) >>> 0) + (b << 16) + (c << 8) + d) >>> 0;
}

function inCidr(ip: number, base: number, bits: number): boolean {
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (ip & mask) === (base & mask);
}

function blockedIpv4Parts(a: number, b: number, c: number, d: number): boolean {
  if ([a, b, c, d].some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const ip = ipv4ToInt(a, b, c, d);
  const block = (a0: number, b0: number, c0: number, d0: number, bits: number) =>
    inCidr(ip, ipv4ToInt(a0, b0, c0, d0), bits);
  return (
    block(0, 0, 0, 0, 8) ||
    block(10, 0, 0, 0, 8) ||
    block(100, 64, 0, 0, 10) ||
    block(127, 0, 0, 0, 8) ||
    block(169, 254, 0, 0, 16) ||
    block(172, 16, 0, 0, 12) ||
    block(192, 0, 0, 0, 24) ||
    block(192, 0, 2, 0, 24) ||
    block(192, 168, 0, 0, 16) ||
    block(198, 18, 0, 0, 15) ||
    block(198, 51, 100, 0, 24) ||
    block(203, 0, 113, 0, 24) ||
    block(224, 0, 0, 0, 4) ||
    block(240, 0, 0, 0, 4)
  );
}

function parseDottedIpv4(host: string): [number, number, number, number] | "blocked" | null {
  const hex = /^(0x[0-9a-f]+)\.(0x[0-9a-f]+)\.(0x[0-9a-f]+)\.(0x[0-9a-f]+)$/i.exec(host);
  if (hex) {
    const parts = hex.slice(1).map((part) => Number.parseInt(part, 16));
    return blockedIpv4Parts(parts[0], parts[1], parts[2], parts[3]) || parts.some((n) => n > 255)
      ? "blocked"
      : [parts[0], parts[1], parts[2], parts[3]];
  }
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  // WHATWG URL parsing accepts legacy numeric IPv4 forms such as 127.1 and
  // 0177.0.0.1. Reject malformed numeric dotted hosts instead of treating
  // them as ordinary public DNS names.
  if (!match) return /^\d+(?:\.\d+){0,3}$/.test(host) ? "blocked" : null;
  if (match.slice(1).some((part) => part.length > 1 && part.startsWith("0"))) return "blocked";
  const parts = match.slice(1).map((part) => Number(part)) as [number, number, number, number];
  if (blockedIpv4Parts(parts[0], parts[1], parts[2], parts[3])) return "blocked";
  return parts;
}

function parseIpv6(input: string): Uint16Array | null {
  let host = input;
  let embedded: [number, number, number, number] | null = null;
  const lastColon = host.lastIndexOf(":");
  const tail = lastColon >= 0 ? host.slice(lastColon + 1) : "";
  if (tail.includes(".")) {
    const parsed = parseDottedIpv4(tail);
    if (parsed === "blocked" || parsed === null) return null;
    embedded = parsed;
    host = `${host.slice(0, lastColon + 1)}0:0`;
  }
  const halves = host.split("::");
  if (halves.length > 2) return null;
  const parseSide = (value: string) => (value ? value.split(":") : []);
  const left = parseSide(halves[0]);
  const right = halves.length === 2 ? parseSide(halves[1]) : [];
  const missing = 8 - left.length - right.length;
  if (halves.length === 1 && missing !== 0) return null;
  if (halves.length === 2 && missing < 1) return null;
  const groups = [...left, ...Array.from({ length: Math.max(0, missing) }, () => "0"), ...right];
  if (groups.length !== 8) return null;
  const out = new Uint16Array(8);
  for (let i = 0; i < 8; i += 1) {
    if (!/^[0-9a-f]{1,4}$/i.test(groups[i])) return null;
    out[i] = Number.parseInt(groups[i], 16);
  }
  if (embedded) {
    out[6] = (embedded[0] << 8) | embedded[1];
    out[7] = (embedded[2] << 8) | embedded[3];
  }
  return out;
}

function blockedIpv6(groups: Uint16Array): boolean {
  const zero = (count: number) => {
    for (let i = 0; i < count; i += 1) if (groups[i] !== 0) return false;
    return true;
  };
  if (zero(8)) return true;
  if (zero(7) && groups[7] === 1) return true;
  if (zero(5) && groups[5] === 0xffff) return true;
  if (zero(6)) return true;
  if ((groups[0] & 0xffc0) === 0xfe80) return true;
  if ((groups[0] & 0xfe00) === 0xfc00) return true;
  if ((groups[0] & 0xff00) === 0xff00) return true;
  if ((groups[0] & 0xffc0) === 0xfec0) return true;
  if (groups[0] === 0x2001 && groups[1] === 0x0db8) return true;
  if (groups[0] === 0x0100 && groups[1] === 0 && groups[2] === 0 && groups[3] === 0) return true;
  if (groups[0] === 0x2002) {
    const a = groups[1] >> 8;
    const b = groups[1] & 0xff;
    const c = groups[2] >> 8;
    const d = groups[2] & 0xff;
    if (blockedIpv4Parts(a, b, c, d)) return true;
  }
  return false;
}

export function isBlockedHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "").replace(/^\[|\]$/g, "").split("%")[0];
  if (!host) return true;
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return true;
  if (host === "metadata.google.internal" || host === "0.0.0.0") return true;
  if (/^\d+$/.test(host)) {
    const value = Number(host);
    if (!Number.isSafeInteger(value) || value < 0 || value > 0xffffffff) return true;
    return blockedIpv4Parts((value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255);
  }
  const dotted = parseDottedIpv4(host);
  if (dotted === "blocked") return true;
  if (dotted) return false;
  if (host.includes(":")) {
    const groups = parseIpv6(host);
    if (!groups) return true;
    return blockedIpv6(groups);
  }
  return false;
}

function displayHost(url: URL): string {
  return url.hostname.replace(/^www\./, "");
}

function acceptHttps(url: URL): ResolveResult {
  if (url.username || url.password) {
    return { kind: "error", message: "Foydalanuvchi nomi yoki parol yozilgan manzil ochilmaydi." };
  }
  if (isBlockedHost(url.hostname)) {
    return { kind: "error", message: "Mahalliy va yopiq tarmoq manzillari ochilmaydi." };
  }
  return { kind: "navigate", url: url.toString(), display: displayHost(url) };
}

export function resolveAddress(input: string): ResolveResult {
  const trimmed = input.trim();
  if (!trimmed) return { kind: "error", message: "Sayt nomi, domen yoki qidiruv yozing." };
  if (trimmed.length > 500) return { kind: "error", message: "Manzil juda uzun." };

  const normalized = trimmed.replace(/\s+/g, " ");
  const key = normalized.toLowerCase();
  if (LAB_ALIASES.has(key)) return { kind: "internal", id: "lab", label: "Motion lab" };
  if (ALIASES[key]) {
    return acceptHttps(new URL(ALIASES[key]));
  }

  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(trimmed);
  if (scheme) {
    const name = scheme[1].toLowerCase();
    if (BLOCKED_SCHEMES.has(name) || (name !== "http" && name !== "https")) {
      return { kind: "error", message: "Bu sxema ochilmaydi." };
    }
    let candidate = trimmed;
    if (name === "http") candidate = `https://${trimmed.slice(scheme[0].length)}`;
    try {
      const url = new URL(candidate);
      if (url.protocol !== "https:") {
        return { kind: "error", message: "Faqat HTTPS sahifalar ochiladi." };
      }
      return acceptHttps(url);
    } catch {
      return { kind: "error", message: "Manzil o‘qilmadi. Tekshirib, qayta yozing." };
    }
  }

  if (/\s/.test(normalized) || !normalized.includes(".")) {
    return { kind: "search", query: normalized.slice(0, 180), provider: "duckduckgo" };
  }

  const domain = /^([a-z0-9.-]+\.[a-z]{2,})([/?#].*)?$/i.exec(normalized);
  if (!domain) return { kind: "search", query: normalized.slice(0, 180), provider: "duckduckgo" };
  try {
    return acceptHttps(new URL(`https://${normalized}`));
  } catch {
    return { kind: "error", message: "Manzil o‘qilmadi. Tekshirib, qayta yozing." };
  }
}
