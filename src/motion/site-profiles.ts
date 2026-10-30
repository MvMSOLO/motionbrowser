export type SiteSupport = "verified" | "experimental" | "unavailable";

export type SiteProfile = {
  id: string;
  support: SiteSupport;
  feed: boolean;
  comments: boolean;
  note: string;
};

export function profileForTarget(target: { kind: "lab" } | { kind: "web"; hostname: string } | { kind: "other" }): SiteProfile {
  if (target.kind === "lab") {
    return {
      id: "motion-lab",
      support: "verified",
      feed: true,
      comments: true,
      note: "First-party gesture lab. Feed and notes were exercised in this build. This is not Instagram or YouTube.",
    };
  }
  if (target.kind === "web") {
    const host = target.hostname.toLowerCase();
    if (host === "instagram.com" || host.endsWith(".instagram.com") || host === "youtube.com" || host.endsWith(".youtube.com") || host === "youtu.be") {
      return {
        id: "social-unverified",
        support: "experimental",
        feed: false,
        comments: false,
        note: "Not verified. Motion Browser does not send gestures into this site. Embedding is often refused.",
      };
    }
  }
  return {
    id: "generic-web",
    support: "unavailable",
    feed: false,
    comments: false,
    note: "Cross-origin pages do not accept synthetic gestures from this shell. Use the page itself, or open it outside.",
  };
}
