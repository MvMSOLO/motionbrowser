import type { GestureDirection } from "./gesture-recognizer.ts";

export type MotionAction =
  | "feed-next"
  | "feed-prev"
  | "comments-open"
  | "comments-close"
  | "comments-scroll-down"
  | "comments-scroll-up";

export type MotionContext = {
  motionEnabled: boolean;
  calibrated: boolean;
  keyboardOpen: boolean;
  addressFocused: boolean;
  overlayOpen: boolean;
  viewportActive: boolean;
  commentsOpen: boolean;
  appVisible: boolean;
  profileSupportsFeed: boolean;
  profileSupportsComments: boolean;
};

export type ActionDecision = { ok: true; action: MotionAction } | { ok: false; reason: string };

export function actionForGesture(direction: GestureDirection, ctx: MotionContext): ActionDecision {
  if (!ctx.appVisible) return { ok: false, reason: "background" };
  if (!ctx.motionEnabled) return { ok: false, reason: "paused" };
  if (!ctx.calibrated) return { ok: false, reason: "uncalibrated" };
  if (ctx.keyboardOpen || ctx.addressFocused) return { ok: false, reason: "keyboard" };
  if (ctx.overlayOpen) return { ok: false, reason: "overlay" };
  if (!ctx.viewportActive) return { ok: false, reason: "viewport-inactive" };

  if (ctx.commentsOpen) {
    if (!ctx.profileSupportsComments) return { ok: false, reason: "comments-unsupported" };
    if (direction === "up") return { ok: true, action: "comments-scroll-down" };
    if (direction === "down") return { ok: true, action: "comments-scroll-up" };
    if (direction === "right") return { ok: true, action: "comments-close" };
    return { ok: false, reason: "no-mapping" };
  }

  if (direction === "up") {
    if (!ctx.profileSupportsFeed) return { ok: false, reason: "feed-unsupported" };
    return { ok: true, action: "feed-next" };
  }
  if (direction === "down") {
    if (!ctx.profileSupportsFeed) return { ok: false, reason: "feed-unsupported" };
    return { ok: true, action: "feed-prev" };
  }
  if (direction === "left") {
    if (!ctx.profileSupportsComments) return { ok: false, reason: "comments-unsupported" };
    return { ok: true, action: "comments-open" };
  }
  return { ok: false, reason: "no-panel" };
}
