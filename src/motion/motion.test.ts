import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { interpretFrameHeaders, knownEmbedRestriction, planEmbed } from "./embed-policy.ts";
import { configForSensitivity, runSequence } from "./gesture-recognizer.ts";
import { createLabState, reduceLab } from "./lab-reducer.ts";
import { actionForGesture, type MotionContext } from "./motion-actions.ts";
import { deltaFromNeutral, mapDeviceAxes } from "./orientation-math.ts";
import { parseDuckDuckGoHtml, unwrapDuckDuckGoHref } from "./search-parse.ts";
import { profileForTarget } from "./site-profiles.ts";
import { classifySensor } from "./sensor-capability.ts";
import { buildSwipeSequence, denormalize, feedPageDelta, swipeScrollDelta } from "./swipe-sequence.ts";
import { isBlockedHost, resolveAddress } from "./url-resolver.ts";
import { DEFAULT_MOTION_PREFS, parseMotionPrefs } from "./preferences.ts";

const config = configForSensitivity("medium");

function hold(pitch: number, roll: number, from: number, to: number, step = 50) {
  const samples = [];
  for (let t = from; t <= to; t += step) samples.push({ pitch, roll, t });
  return samples;
}

const active: MotionContext = {
  motionEnabled: true,
  calibrated: true,
  keyboardOpen: false,
  addressFocused: false,
  overlayOpen: false,
  viewportActive: true,
  commentsOpen: false,
  appVisible: true,
  profileSupportsFeed: true,
  profileSupportsComments: true,
};


describe("motion preferences", () => {
  it("uses defaults for missing or malformed storage", () => {
    assert.deepEqual(parseMotionPrefs(null), DEFAULT_MOTION_PREFS);
    assert.deepEqual(parseMotionPrefs("{not-json"), DEFAULT_MOTION_PREFS);
    assert.deepEqual(parseMotionPrefs("null"), DEFAULT_MOTION_PREFS);
  });

  it("keeps valid values and ignores invalid persisted values", () => {
    assert.deepEqual(
      parseMotionPrefs(JSON.stringify({
        sensitivity: "high",
        sound: true,
        haptics: false,
        ambience: true,
        reducedMotion: true,
        profile: "low",
        force2d: true,
        onboarded: true,
        injected: "ignored",
      })),
      {
        ...DEFAULT_MOTION_PREFS,
        sensitivity: "high",
        sound: true,
        ambience: true,
        reducedMotion: true,
        profile: "low",
        force2d: true,
        onboarded: true,
      },
    );
    assert.deepEqual(
      parseMotionPrefs(JSON.stringify({
        sensitivity: "ultra",
        sound: "false",
        profile: "cinematic",
        force2d: 1,
      })),
      DEFAULT_MOTION_PREFS,
    );
  });
});

describe("resolveAddress", () => {
  it("maps known site names and bare domains to https", () => {
    assert.equal(resolveAddress("Instagram").kind === "navigate" && resolveAddress("Instagram").kind === "navigate" ? (resolveAddress("instagram") as { url: string }).url : "", "https://www.instagram.com/");
    assert.equal((resolveAddress("youtube.com") as { url: string }).url, "https://youtube.com/");
    assert.equal((resolveAddress("http://example.com/docs") as { url: string }).url, "https://example.com/docs");
    assert.equal((resolveAddress("https://en.wikipedia.org/wiki/WebGL") as { url: string }).url, "https://en.wikipedia.org/wiki/WebGL");
    assert.equal((resolveAddress("https://example.com/docs?q=1#section") as { url: string }).url, "https://example.com/docs?q=1#section");
    assert.equal((resolveAddress("example.com/guide#top") as { url: string }).url, "https://example.com/guide#top");
  });

  it("opens the gesture lab without pretending it is a third-party site", () => {
    assert.deepEqual(resolveAddress("motion lab"), { kind: "internal", id: "lab", label: "Motion lab" });
  });

  it("searches phrases and rejects dangerous schemes", () => {
    assert.equal(resolveAddress("quiet observatories").kind, "search");
    for (const sample of ["javascript:alert(1)", "file:///tmp/x", "data:text/html,hi", "content://contacts", "intent://scan/#Intent;end"]) {
      assert.equal(resolveAddress(sample).kind, "error", sample);
    }
    assert.equal(resolveAddress("https://user:secret@example.com/").kind, "error");
    assert.equal(resolveAddress("https://127.0.0.1/").kind, "error");
    assert.equal(resolveAddress("https://192.168.1.20/admin").kind, "error");
    assert.equal(isBlockedHost("10.1.2.3"), true);
    assert.equal(isBlockedHost("8.8.8.8"), false);
    assert.equal(isBlockedHost("100.64.1.1"), true);
    assert.equal(isBlockedHost("100.63.1.1"), false);
    assert.equal(isBlockedHost("172.15.1.1"), false);
    assert.equal(isBlockedHost("172.16.0.1"), true);
    assert.equal(isBlockedHost("172.31.255.1"), true);
    assert.equal(isBlockedHost("192.0.2.10"), true);
    assert.equal(isBlockedHost("198.51.100.10"), true);
    assert.equal(isBlockedHost("203.0.113.10"), true);
    assert.equal(isBlockedHost("198.18.0.1"), true);
    assert.equal(isBlockedHost("224.0.0.1"), true);
    assert.equal(isBlockedHost("240.0.0.1"), true);
    assert.equal(isBlockedHost("0177.0.0.1"), true);
    assert.equal(isBlockedHost("127.1"), true);
    assert.equal(isBlockedHost("1234.0.0.1"), true);
    assert.equal(isBlockedHost("2130706433"), true);
    assert.equal(isBlockedHost("0x7f.0x0.0x0.0x1"), true);
    assert.equal(isBlockedHost("::1"), true);
    assert.equal(isBlockedHost("::"), true);
    assert.equal(isBlockedHost("fe80::1"), true);
    assert.equal(isBlockedHost("fc00::1"), true);
    assert.equal(isBlockedHost("fd12:3456::1"), true);
    assert.equal(isBlockedHost("ff02::1"), true);
    assert.equal(isBlockedHost("2001:db8::1"), true);
    assert.equal(isBlockedHost("::ffff:127.0.0.1"), true);
    assert.equal(isBlockedHost("::ffff:10.1.2.3"), true);
    assert.equal(isBlockedHost("::ffff:8.8.8.8"), true);
    assert.equal(isBlockedHost("2002:7f00:1::"), true);
    assert.equal(isBlockedHost("2002:0808:0808::"), false);
    assert.equal(isBlockedHost("example.com"), false);
    assert.equal(resolveAddress("   ").kind, "error");
  });
});

describe("gesture recognizer", () => {
  it("ignores small noise", () => {
    const samples = [2, -1, 3, 0, -2, 4].map((pitch, index) => ({ pitch, roll: index % 2 ? 1 : -1, t: index * 40 }));
    assert.deepEqual(runSequence(samples, config), []);
  });

  it("emits one upward gesture and does not repeat while held", () => {
    assert.deepEqual(runSequence(hold(20, 0, 0, 1500), config), ["up"]);
  });

  it("requires a return to neutral and the cooldown before a second gesture", () => {
    const samples = [
      ...hold(20, 0, 0, 250),
      ...hold(0, 0, 300, 500),
      ...hold(20, 0, 550, 800),
      ...hold(20, 0, 1000, 1400),
    ];
    assert.deepEqual(runSequence(samples, config), ["up", "up"]);
  });

  it("emits left and right from roll and rejects an even diagonal", () => {
    assert.deepEqual(runSequence(hold(0, -20, 0, 400), config), ["left"]);
    assert.deepEqual(runSequence(hold(0, 20, 0, 400), config), ["right"]);
    assert.deepEqual(runSequence(hold(20, 20, 0, 400), config), []);
  });
});

describe("motion actions", () => {
  it("maps lab gestures and blocks unsafe contexts", () => {
    assert.deepEqual(actionForGesture("up", active), { ok: true, action: "feed-next" });
    assert.deepEqual(actionForGesture("down", active), { ok: true, action: "feed-prev" });
    assert.deepEqual(actionForGesture("left", active), { ok: true, action: "comments-open" });
    assert.deepEqual(actionForGesture("right", active), { ok: false, reason: "no-panel" });
    assert.equal(actionForGesture("left", { ...active, addressFocused: true }).ok, false);
    assert.equal(actionForGesture("up", { ...active, keyboardOpen: true }).ok, false);
    assert.equal(actionForGesture("up", { ...active, motionEnabled: false }).ok, false);
    assert.equal(actionForGesture("up", { ...active, calibrated: false }).ok, false);
    assert.deepEqual(actionForGesture("right", { ...active, commentsOpen: true }), { ok: true, action: "comments-close" });
    assert.deepEqual(actionForGesture("up", { ...active, commentsOpen: true }), { ok: true, action: "comments-scroll-down" });
    assert.equal(actionForGesture("up", { ...active, profileSupportsFeed: false }).ok, false);
  });
});

describe("orientation and swipe math", () => {
  it("documents the portrait mapping and axis inversion", () => {
    assert.deepEqual(mapDeviceAxes(40, -8, 0), { pitch: 40, roll: -8 });
    assert.deepEqual(mapDeviceAxes(40, -8, 90), { pitch: -8, roll: -40 });
    assert.deepEqual(deltaFromNeutral({ pitch: 70, roll: 4 }, { pitch: 55, roll: 1 }, true, false), { pitch: -15, roll: 3 });
  });

  it("builds a bounded swipe and a full feed step", () => {
    const rect = { x: 10, y: 20, width: 200, height: 400 };
    const seq = buildSwipeSequence(rect, "up");
    assert.equal(seq[0].phase, "down");
    assert.equal(seq.at(-1)?.phase, "up");
    assert.ok(seq.every((sample) => sample.x > rect.x && sample.x < rect.x + rect.width));
    assert.ok(swipeScrollDelta(rect, "up").y > 0);
    assert.equal(feedPageDelta(480, "next"), 480);
    assert.deepEqual(denormalize({ x: 1.4, y: -1 }, { width: 200, height: 100 }), { x: 200, y: 0 });
  });
});

describe("embed policy and search parsing", () => {
  it("does not treat frame blocking as a successful load", () => {
    assert.equal(interpretFrameHeaders("DENY", null).embeddable, false);
    assert.equal(interpretFrameHeaders(null, "frame-ancestors 'none'").embeddable, false);
    assert.equal(interpretFrameHeaders(null, "frame-ancestors *").embeddable, true);
    assert.ok(knownEmbedRestriction("www.instagram.com"));
    assert.equal(knownEmbedRestriction("example.com"), null);
  });

  it("unwraps DuckDuckGo result links and ignores non-https targets", () => {
    const html = `<a class="result__a" href="https://duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fguide&rut=1">Example Guide</a>`;
    assert.equal(unwrapDuckDuckGoHref("https://duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fguide"), "https://example.com/guide");
    assert.deepEqual(parseDuckDuckGoHtml(html), [{ title: "Example Guide", url: "https://example.com/guide" }]);
    assert.equal(unwrapDuckDuckGoHref("javascript:alert(1)"), null);
  });

  it("keeps social profiles experimental and the lab verified", () => {
    assert.equal(profileForTarget({ kind: "lab" }).support, "verified");
    assert.equal(profileForTarget({ kind: "web", hostname: "www.youtube.com" }).feed, false);
    assert.equal(profileForTarget({ kind: "web", hostname: "example.com" }).support, "unavailable");
  });

  it("does not call a header check a successful embed", () => {
    assert.equal(planEmbed("https://www.instagram.com/").kind, "restricted");
    assert.equal(planEmbed("https://www.youtube.com/").kind, "restricted");
    assert.equal(planEmbed("https://example.com/").kind, "verified");
    assert.equal(planEmbed("https://example.com/login").kind, "restricted");
    assert.equal(planEmbed("https://en.wikipedia.org/wiki/WebGL").kind, "unknown");
  });
});

describe("motion lab reducer", () => {
  it("moves one card at a time and scrolls comments without repeating a held tilt", () => {
    let lab = createLabState(6, 480);
    lab = reduceLab(lab, "feed-next");
    assert.equal(lab.index, 1);
    lab = reduceLab(lab, "feed-prev");
    assert.equal(lab.index, 0);
    lab = reduceLab(lab, "comments-open");
    lab = reduceLab(lab, "comments-scroll-down");
    lab = reduceLab(lab, "comments-scroll-down");
    assert.equal(lab.commentsOpen, true);
    assert.equal(lab.commentScroll, 240);
    lab = reduceLab(lab, "comments-scroll-up");
    assert.equal(lab.commentScroll, 120);
    lab = reduceLab(lab, "comments-close");
    assert.equal(lab.commentsOpen, false);
    assert.deepEqual(runSequence(hold(20, 0, 0, 1500), config), ["up"]);
  });
});

describe("sensor capability", () => {
  it("distinguishes permission, insecure, and missing sensors", () => {
    assert.equal(classifySensor({ secure: true, hasDeviceOrientation: true, hasRequestPermission: true }), "needs-permission");
    assert.equal(classifySensor({ secure: false, hasDeviceOrientation: true, hasRequestPermission: false }), "insecure");
    assert.equal(classifySensor({ secure: true, hasDeviceOrientation: false, hasRequestPermission: false }), "unavailable");
    assert.equal(classifySensor({ secure: true, hasDeviceOrientation: true, hasRequestPermission: false }), "available");
  });
});
