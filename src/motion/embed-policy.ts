const RESTRICTED_SUFFIXES = [
  "instagram.com",
  "youtube.com",
  "youtu.be",
  "facebook.com",
  "fb.com",
  "tiktok.com",
  "twitter.com",
  "x.com",
  "accounts.google.com",
];

const AUTH_PATH = /\/(login|log-in|signin|sign-in|oauth|authorize|auth)(\/|$)/i;

const VERIFIED_EMBED_HOSTS = new Set(["example.com", "www.example.com", "example.org", "www.example.org"]);

export type EmbedPlan = {
  kind: "restricted" | "verified" | "unknown";
  reason: string;
};

export function knownEmbedRestriction(hostname: string): string | null {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  for (const suffix of RESTRICTED_SUFFIXES) {
    if (host === suffix || host.endsWith(`.${suffix}`)) {
      return `${host} usually refuses to be embedded.`;
    }
  }
  return null;
}

export function interpretFrameHeaders(xFrameOptions: string | null, csp: string | null): { embeddable: boolean; reason: string } {
  if (xFrameOptions) {
    const value = xFrameOptions.toLowerCase();
    if (value.includes("deny") || value.includes("sameorigin") || value.includes("allow-from")) {
      return { embeddable: false, reason: "This site sent X-Frame-Options and will not render inside the frame." };
    }
  }
  if (csp) {
    const match = csp.match(/frame-ancestors\s+([^;]+)/i);
    if (match) {
      const tokens = match[1].toLowerCase().split(/\s+/).filter(Boolean);
      const open = tokens.includes("*");
      const closed = tokens.includes("'none'") || tokens.includes("'self'") || !open;
      if (closed) {
        return { embeddable: false, reason: "This site's content security policy blocks embedded frames." };
      }
    }
  }
  return { embeddable: true, reason: "No frame-blocking header was found. The site may still choose not to run here." };
}

/** Client-only decision. A header probe is not treated as proof, and this function never fetches. */
export function planEmbed(url: string): EmbedPlan {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { kind: "restricted", reason: "The address could not be read." };
  }
  if (parsed.protocol !== "https:") {
    return { kind: "restricted", reason: "Only HTTPS pages are placed in the frame." };
  }
  const known = knownEmbedRestriction(parsed.hostname);
  if (known) {
    return {
      kind: "restricted",
      reason: `${known} This prototype will not embed it, copy it, or imitate a login. Open it outside.`,
    };
  }
  if (AUTH_PATH.test(parsed.pathname) || parsed.hostname.toLowerCase().startsWith("login.") || parsed.hostname.toLowerCase().startsWith("accounts.")) {
    return {
      kind: "restricted",
      reason: "Authentication pages stay in the system browser. Motion Browser does not embed sign-in forms.",
    };
  }
  if (VERIFIED_EMBED_HOSTS.has(parsed.hostname.toLowerCase())) {
    return {
      kind: "verified",
      reason: "This host was checked in this prototype and allows a normal frame. The page inside is the real site.",
    };
  }
  return {
    kind: "unknown",
    reason: "Embedding compatibility unknown. If the frame stays blank, the site is blocking it.",
  };
}
