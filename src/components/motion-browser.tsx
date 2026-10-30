import { useCallback, useEffect, useRef, useState } from "react";
import { planEmbed, type EmbedPlan } from "@/motion/embed-policy";
import { actionForGesture, type MotionAction, type MotionContext } from "@/motion/motion-actions";
import { configForSensitivity, createRecognizerState, stepRecognizer, type GestureDirection, type Sensitivity } from "@/motion/gesture-recognizer";
import { LAB_CARDS } from "@/motion/lab-content";
import { createLabState, reduceLab, type LabState } from "@/motion/lab-reducer";
import { deltaFromNeutral, mapDeviceAxes } from "@/motion/orientation-math";
import { searchWeb } from "@/motion/search.functions";
import type { SearchHit } from "@/motion/search-parse";
import { resolveAddress, type ResolveResult } from "@/motion/url-resolver";
import type { ModelTier, SceneMode } from "@/motion/observatory";
import { ObservatoryStage } from "@/components/observatory-stage";

type MotionMode = "off" | "phone" | "simulator";
type Profile = ModelTier;

type Hist =
  | { t: "home" }
  | { t: "lab" }
  | { t: "search"; query: string }
  | { t: "web"; url: string; display: string; plan: EmbedPlan };

type Prefs = {
  sensitivity: Sensitivity;
  sound: boolean;
  haptics: boolean;
  ambience: boolean;
  reducedMotion: boolean;
  profile: Profile;
  force2d: boolean;
  onboarded: boolean;
};

const PREF_KEY = "motion-browser-prefs-v1";
const DEFAULT_PREFS: Prefs = {
  sensitivity: "medium",
  sound: false,
  haptics: false,
  ambience: false,
  reducedMotion: false,
  profile: "balanced",
  force2d: false,
  onboarded: false,
};

const HAPTIC_FALLBACK: Record<string, number[]> = { confirm: [12], error: [18, 36, 18], panel: [8] };

function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(PREF_KEY);
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw) as Partial<Prefs>;
    return { ...DEFAULT_PREFS, ...parsed, sound: Boolean(parsed.sound), haptics: Boolean(parsed.haptics), ambience: Boolean(parsed.ambience) };
  } catch {
    return DEFAULT_PREFS;
  }
}

function Icon({ name, alt }: { name: string; alt: string }) {
  return <img src={`/motion/icons/${name}.svg`} alt={alt} className="mb-icon" />;
}

export function MotionBrowser() {
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [ready, setReady] = useState(false);
  const [motionMode, setMotionMode] = useState<MotionMode>("off");
  const [calibrated, setCalibrated] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [addressFocused, setAddressFocused] = useState(false);
  const [visible, setVisible] = useState(true);
  const [note, setNote] = useState("Harakat ixtiyoriy. Saytni manzil satridan oching.");
  const [stack, setStack] = useState<Hist[]>([{ t: "home" }]);
  const [cursor, setCursor] = useState(0);
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [frameState, setFrameState] = useState<"idle" | "loading" | "loaded">("idle");
  const [reloadKey, setReloadKey] = useState(0);
  const [lab, setLab] = useState<LabState>(() => createLabState(LAB_CARDS.length));
  const [lastAction, setLastAction] = useState("none");
  const [live, setLive] = useState({ pitch: 0, roll: 0 });
  const [fps, setFps] = useState(0);
  const [pulseToken, setPulseToken] = useState(0);
  const [patterns, setPatterns] = useState(HAPTIC_FALLBACK);
  const [panelMs, setPanelMs] = useState(220);

  const cursorRef = useRef(0);
  const simRef = useRef({ pitch: 0, roll: 0 });
  const phoneRef = useRef({ pitch: 0, roll: 0, has: false });
  const neutralRef = useRef<{ pitch: number; roll: number } | null>(null);
  const ctxRef = useRef<MotionContext | null>(null);
  const applyRef = useRef<(action: MotionAction) => void>(() => {});
  const sensitivityRef = useRef<Sensitivity>("medium");
  const commentsRef = useRef<HTMLDivElement>(null);
  const ambienceRef = useRef<HTMLAudioElement | null>(null);
  const [systemReduced, setSystemReduced] = useState(false);

  const tiltTimer = useRef(0);
  const reduced = prefs.reducedMotion || systemReduced;
  const current = stack[cursor] ?? { t: "home" as const };
  const card = LAB_CARDS[lab.index] ?? LAB_CARDS[0];

  useEffect(() => {
    const stored = loadPrefs();
    setPrefs(stored);
    setReady(true);
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onMedia = () => setSystemReduced(media.matches);
    onMedia();
    media.addEventListener("change", onMedia);
    return () => media.removeEventListener("change", onMedia);
  }, []);

  useEffect(() => {
    if (!ready) return;
    localStorage.setItem(PREF_KEY, JSON.stringify(prefs));
  }, [prefs, ready]);

  useEffect(() => {
    const onVis = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", onVis);
    const onOrient = () => {
      neutralRef.current = null;
      setCalibrated(false);
      setNote("Ekran burildi. Neytralni qayta kalibrlang.");
    };
    window.addEventListener("orientationchange", onOrient);
    window.screen?.orientation?.addEventListener("change", onOrient);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("orientationchange", onOrient);
      window.screen?.orientation?.removeEventListener("change", onOrient);
    };
  }, []);

  useEffect(() => {
    fetch("/motion/audio/haptics/haptic-patterns.json")
      .then((response) => response.json())
      .then((json: { confirm?: number[]; error?: number[]; panel?: number[] }) => {
        setPatterns({
          confirm: json.confirm ?? HAPTIC_FALLBACK.confirm,
          error: json.error ?? HAPTIC_FALLBACK.error,
          panel: json.panel ?? HAPTIC_FALLBACK.panel,
        });
      })
      .catch(() => {});
    fetch("/motion/animations/panel_open.json")
      .then((response) => response.json())
      .then((json: { durationMs?: number; reducedMs?: number }) => {
        if (json.durationMs) setPanelMs(json.durationMs);
      })
      .catch(() => {});
  }, []);

  const playCue = useCallback((file: string) => {
    if (!prefs.sound) return;
    const audio = new Audio(`/motion/audio/ui/${file}.wav`);
    audio.volume = 0.22;
    void audio.play().catch(() => {});
  }, [prefs.sound]);

  const buzz = useCallback((kind: "confirm" | "error" | "panel") => {
    if (!prefs.haptics || !navigator.vibrate) return;
    navigator.vibrate(patterns[kind] ?? 10);
  }, [patterns, prefs.haptics]);

  useEffect(() => {
    const audio = ambienceRef.current;
    if (!audio) return;
    audio.volume = 0.05;
    if (prefs.sound && prefs.ambience && !reduced && visible) void audio.play().catch(() => {});
    else audio.pause();
  }, [prefs.ambience, prefs.sound, reduced, visible]);

  const push = useCallback((entry: Hist) => {
    setStack((prev) => {
      const next = [...prev.slice(0, cursorRef.current + 1), entry];
      cursorRef.current = next.length - 1;
      setCursor(cursorRef.current);
      return next;
    });
    setPulseToken((value) => value + 1);
  }, []);

  const go = useCallback((delta: number) => {
    const next = Math.min(stack.length - 1, Math.max(0, cursorRef.current + delta));
    if (next === cursorRef.current) return;
    cursorRef.current = next;
    setCursor(next);
    playCue(delta < 0 ? "back" : "confirm");
  }, [playCue, stack.length]);

  const openResolved = useCallback(async (result: ResolveResult) => {
    if (result.kind === "error") {
      setNote(result.message);
      playCue("error_soft");
      buzz("error");
      return;
    }
    if (result.kind === "internal") {
      push({ t: "lab" });
      setNote("Motion Lab demo — birinchi tomon sinov lentasi, ijtimoiy tarmoq emas.");
      playCue("confirm");
      return;
    }
    if (result.kind === "search") {
      setSearching(true);
      setSearchError(null);
      setHits([]);
      push({ t: "search", query: result.query });
      try {
        const found = await searchWeb({ data: { query: result.query } });
        setHits(found.hits);
        setSearchError(found.hits.length ? null : found.error ?? "Hech narsa topilmadi.");
      } catch {
        setSearchError("Qidiruvni ochib bo‘lmadi. Tashqarida urinib ko‘ring.");
      } finally {
        setSearching(false);
      }
      return;
    }
    const plan = planEmbed(result.url);
    setFrameState(plan.kind === "restricted" ? "idle" : "loading");
    push({ t: "web", url: result.url, display: result.display, plan });
    setQuery(result.url);
    setNote(plan.kind === "unknown" ? "Embedding compatibility unknown" : plan.reason);
    playCue("confirm");
    buzz("confirm");
  }, [buzz, playCue, push]);

  const submitAddress = useCallback(() => {
    void openResolved(resolveAddress(query));
  }, [openResolved, query]);

  const apply = useCallback((action: MotionAction) => {
    setLab((prev) => reduceLab(prev, action));
    setLastAction(action);
    setPulseToken((value) => value + 1);
    if (action === "comments-open") {
      playCue("panel_open");
      buzz("panel");
    } else if (action === "comments-close") {
      playCue("panel_close");
      buzz("panel");
    } else {
      playCue("confirm");
      buzz("confirm");
    }
  }, [buzz, playCue]);

  applyRef.current = apply;
  sensitivityRef.current = prefs.sensitivity;

  const overlayOpen = settingsOpen || (!prefs.onboarded && ready);
  const onLab = current.t === "lab";
  ctxRef.current = {
    motionEnabled: motionMode !== "off",
    calibrated,
    keyboardOpen: addressFocused,
    addressFocused,
    overlayOpen,
    viewportActive: true,
    commentsOpen: onLab && lab.commentsOpen,
    appVisible: visible,
    profileSupportsFeed: onLab,
    profileSupportsComments: onLab,
  };

  useEffect(() => {
    if (commentsRef.current) commentsRef.current.scrollTop = lab.commentScroll;
  }, [lab.commentScroll, lab.commentsOpen, lab.index]);

  useEffect(() => {
    if (motionMode !== "phone" || !visible) return;
    const onDevice = (event: DeviceOrientationEvent) => {
      if (event.beta == null || event.gamma == null) return;
      const angle = window.screen?.orientation?.angle ?? 0;
      const mapped = mapDeviceAxes(event.beta, event.gamma, angle);
      phoneRef.current = { ...mapped, has: true };
    };
    window.addEventListener("deviceorientation", onDevice);
    return () => window.removeEventListener("deviceorientation", onDevice);
  }, [motionMode, visible]);

  useEffect(() => {
    if (motionMode === "off") return;
    let state = createRecognizerState();
    let lastUi = 0;
    const timer = window.setInterval(() => {
      const neutral = neutralRef.current;
      if (!neutral) return;
      const source = motionMode === "phone" ? phoneRef.current : { ...simRef.current, has: true };
      if (motionMode === "phone" && !phoneRef.current.has) return;
      const delta = deltaFromNeutral(source, neutral, false, false);
      const now = performance.now();
      if (now - lastUi > 120) {
        lastUi = now;
        setLive(delta);
      }
      const step = stepRecognizer(state, { pitch: delta.pitch, roll: delta.roll, t: now }, configForSensitivity(sensitivityRef.current));
      state = step.state;
      if (!step.emitted || !ctxRef.current) return;
      const decision = actionForGesture(step.emitted, ctxRef.current);
      if (decision.ok) applyRef.current(decision.action);
      else setLastAction(`blocked:${decision.reason}`);
    }, 50);
    return () => window.clearInterval(timer);
  }, [motionMode]);

  function calibrate() {
    if (motionMode === "simulator") {
      neutralRef.current = { pitch: simRef.current.pitch, roll: simRef.current.roll };
      setCalibrated(true);
      setNote("Simulyator kalibrlandi. Bu haqiqiy telefon o‘lchovi emas.");
      playCue("confirm");
      return;
    }
    if (!phoneRef.current.has) {
      setNote("Sensor hali raqam yubormadi. Telefonni ushlab, biroz kuting yoki simulyatordan foydalaning.");
      return;
    }
    neutralRef.current = { pitch: phoneRef.current.pitch, roll: phoneRef.current.roll };
    setCalibrated(true);
    setNote("Neytral holat saqlandi. Endi sekin egishingiz mumkin.");
    playCue("confirm");
  }

  function resetCalibration() {
    neutralRef.current = null;
    setCalibrated(false);
    setNote("Kalibr bekor qilindi.");
  }

  async function enablePhone() {
    const ctor = window.DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> } | undefined;
    if (!("DeviceOrientationEvent" in window)) {
      setNote("Bu brauzer qurilma orientatsiyasini bermaydi. Simulyator ishlatiladi.");
      return;
    }
    if (!window.isSecureContext) {
      setNote("Sensor faqat xavfsiz sahifada ishlaydi.");
      return;
    }
    if (ctor && typeof ctor.requestPermission === "function") {
      try {
        const result = await ctor.requestPermission();
        if (result !== "granted") {
          setNote("Sensor ruxsati berilmadi. Teginish boshqaruvi qoladi.");
          return;
        }
      } catch {
        setNote("Sensor ruxsati so‘ralmadi.");
        return;
      }
    }
    phoneRef.current = { pitch: 0, roll: 0, has: false };
    neutralRef.current = null;
    setCalibrated(false);
    setMotionMode("phone");
    setSettingsOpen(false);
    setNote("Harakat yoqildi. Qulay holatda turib kalibrlang. Bu ruxsat faqat shu sahifa ichida qoladi.");
  }

  function enableSimulator() {
    simRef.current = { pitch: 0, roll: 0 };
    neutralRef.current = null;
    setCalibrated(false);
    setMotionMode("simulator");
    setSettingsOpen(false);
    setNote("Simulyator yoqildi. Bu haqiqiy telefon sensori emas.");
  }

  function playTilt(direction: GestureDirection) {
    const vector = { up: [22, 0], down: [-22, 0], left: [0, -22], right: [0, 22] }[direction];
    simRef.current = { pitch: vector[0], roll: vector[1] };
    window.clearTimeout(tiltTimer.current);
    tiltTimer.current = window.setTimeout(() => {
      simRef.current = { pitch: 0, roll: 0 };
    }, 420);
  }

  function openOutside(url: string) {
    window.open(url, "_blank", "noopener,noreferrer");
  }

  const sceneMode: SceneMode = settingsOpen || (!calibrated && motionMode !== "off") ? "calibrating" : current.t === "web" ? "browsing" : "portal";
  const externalUrl = current.t === "web" ? current.url : current.t === "search" ? `https://duckduckgo.com/?q=${encodeURIComponent(current.query)}` : "";

  return (
    <div
      className={reduced ? "mb-app mb-reduced" : "mb-app"}
      data-fps={Math.round(fps)}
      data-last-action={lastAction}
      data-lab-index={lab.index}
      data-comments={lab.commentsOpen ? "open" : "closed"}
      data-surface={current.t}
      data-motion={motionMode}
      data-calibrated={calibrated ? "yes" : "no"}
      style={{ ["--mb-panel-ms" as string]: `${reduced ? 120 : panelMs}ms` }}
    >
      <ObservatoryStage
        profile={prefs.profile}
        reducedMotion={reduced}
        force2d={prefs.force2d}
        pitch={live.pitch}
        roll={live.roll}
        mode={sceneMode}
        pulseToken={pulseToken}
        onFps={setFps}
      />
      <audio ref={ambienceRef} src="/motion/audio/ambience/observatory_loop.wav" loop preload="none" />
      <div className="mb-shell">
        <header className="mb-top">
          <img src="/motion/brand/motion-browser-mark.svg" alt="" className="mb-mark" />
          <div>
            <p className="mb-kicker">MOTION BROWSER</p>
            <p className="mb-quiet">Fazoviy prototip · veb</p>
          </div>
          <button type="button" className="mb-text-btn" onClick={() => setSettingsOpen(true)}>
            <Icon name="navigation/menu" alt="" />
            Sozlamalar
          </button>
        </header>

        <section className="mb-panel" aria-label="Brauzer">
          <form
            className="mb-address"
            onSubmit={(event) => {
              event.preventDefault();
              submitAddress();
            }}
          >
            <Icon name="browser/search" alt="" />
            <label className="mb-sr" htmlFor="address">Manzil yoki qidiruv</label>
            <input
              id="address"
              value={query}
              placeholder="Instagram, example.com yoki ibora"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="go"
              onChange={(event) => setQuery(event.target.value)}
              onFocus={() => setAddressFocused(true)}
              onBlur={() => setAddressFocused(false)}
            />
            {query ? (
              <button type="button" className="mb-icon-btn" aria-label="Tozalash" onClick={() => setQuery("")}>
                <Icon name="navigation/close" alt="" />
              </button>
            ) : null}
            <button type="submit" className="mb-go">Ochish</button>
          </form>

          <div className="mb-nav" role="toolbar" aria-label="Navigatsiya">
            <button type="button" aria-label="Orqaga" disabled={cursor <= 0} onClick={() => go(-1)}>
              <Icon name="navigation/back" alt="" />
            </button>
            <button type="button" aria-label="Oldinga" disabled={cursor >= stack.length - 1} onClick={() => go(1)}>
              <Icon name="navigation/forward" alt="" />
            </button>
            <button
              type="button"
              aria-label="Yangilash"
              disabled={current.t !== "web" || current.plan.kind === "restricted"}
              onClick={() => {
                setReloadKey((value) => value + 1);
                setFrameState("loading");
                playCue("confirm");
              }}
            >
              <Icon name="navigation/reload" alt="" />
            </button>
            <button type="button" aria-label="Uy" onClick={() => { setQuery(""); push({ t: "home" }); playCue("back"); }}>
              <Icon name="navigation/home" alt="" />
            </button>
            <button type="button" aria-label="Yopish" disabled={current.t === "home"} onClick={() => { setQuery(""); push({ t: "home" }); }}>
              <Icon name="navigation/close" alt="" />
            </button>
            <button type="button" aria-label="Tashqarida ochish" disabled={!externalUrl} onClick={() => externalUrl && openOutside(externalUrl)}>
              <Icon name="navigation/external-open" alt="" />
            </button>
          </div>

          <p className="mb-note" role="status">{note}</p>

          <div className="mb-view">
            {current.t === "home" ? (
              <div className="mb-home">
                <img src="/motion/brand/motion-browser-wordmark.svg" alt="Motion Browser" className="mb-word" />
                <p>Haqiqiy sayt, agar u freymga ruxsat bersa. Instagram va YouTube shu yerda ochilmaydi. Harakat faqat Motion Lab demosini boshqaradi.</p>
                <button type="button" className="mb-go" onClick={() => void openResolved(resolveAddress("motion lab"))}>
                  Motion Lab demo
                </button>
              </div>
            ) : null}

            {current.t === "lab" ? (
              <div className="mb-lab">
                <div className="mb-lab-copy">
                  <p className="mb-kicker">Motion Lab demo</p>
                  <h1>{card.title}</h1>
                  <p>{card.body}</p>
                  <p className="mb-quiet">{lab.index + 1} / {LAB_CARDS.length}</p>
                  <div className="mb-lab-actions">
                    <button type="button" onClick={() => { setLab((prev) => reduceLab(prev, "feed-prev")); setLastAction("touch:feed-prev"); }}>Oldingi</button>
                    <button type="button" onClick={() => { setLab((prev) => reduceLab(prev, "feed-next")); setLastAction("touch:feed-next"); }}>Keyingi</button>
                    <button type="button" onClick={() => { setLab((prev) => reduceLab(prev, prev.commentsOpen ? "comments-close" : "comments-open")); setLastAction(lab.commentsOpen ? "touch:comments-close" : "touch:comments-open"); }}>
                      {lab.commentsOpen ? "Izohlarni yopish" : "Izohlar"}
                    </button>
                  </div>
                </div>
                <aside className={lab.commentsOpen ? "mb-comments mb-comments-open" : "mb-comments"} aria-hidden={!lab.commentsOpen}>
                  <h2>Izohlar</h2>
                  <div ref={commentsRef} className="mb-comments-scroll" onScroll={(event) => {
                    const top = event.currentTarget.scrollTop;
                    setLab((prev) => (prev.commentScroll === top ? prev : { ...prev, commentScroll: top }));
                  }}>
                    {card.comments.map((comment) => <p key={comment}>{comment}</p>)}
                  </div>
                </aside>
              </div>
            ) : null}

            {current.t === "search" ? (
              <div className="mb-results">
                <h1>Qidiruv: {current.query}</h1>
                {searching ? <p>Qidirilmoqda…</p> : null}
                {searchError ? <p>{searchError}</p> : null}
                <ul>
                  {hits.map((hit) => (
                    <li key={hit.url}>
                      <button type="button" onClick={() => void openResolved(resolveAddress(hit.url))}>{hit.title}</button>
                      <span>{hit.url}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {current.t === "web" && current.plan.kind === "restricted" ? (
              <div className="mb-fallback">
                <img src="/motion/icons/status/warning.svg" alt="" className="mb-warn-icon" />
                <h1>Freymda ochilmaydi</h1>
                <p>{current.plan.reason}</p>
                <p className="mb-quiet">{current.display}</p>
                <button type="button" className="mb-go" onClick={() => openOutside(current.url)}>Tashqarida ochish</button>
              </div>
            ) : null}

            {current.t === "web" && current.plan.kind !== "restricted" ? (
              <div className="mb-frame-wrap">
                <p className={current.plan.kind === "unknown" ? "mb-banner" : "mb-banner mb-banner-ok"}>
                  {current.plan.kind === "unknown" ? "Embedding compatibility unknown" : "Tekshirilgan host — ichidagi sahifa haqiqiy sayt."}
                </p>
                {frameState === "loading" ? <p className="mb-quiet">Sahifa yuklanmoqda. Bo‘sh qolsa, sayt freymni to‘sgan.</p> : null}
                {motionMode !== "off" ? <p className="mb-quiet">Harakat bu begona sahifaga yuborilmaydi.</p> : null}
                <iframe
                  key={`${current.url}:${reloadKey}`}
                  src={current.url}
                  title={current.display}
                  referrerPolicy="no-referrer"
                  onLoad={() => setFrameState("loaded")}
                />
              </div>
            ) : null}
          </div>

          {motionMode === "simulator" ? (
            <div className="mb-sim" aria-label="Sensor simulyatori">
              <p>Simulyator — haqiqiy telefon emas</p>
              <div className="mb-sim-grid">
                <button type="button" data-sim="up" onClick={() => playTilt("up")}>Yuqori</button>
                <button type="button" data-sim="left" onClick={() => playTilt("left")}>Chap</button>
                <button type="button" data-calibrate onClick={calibrate}>Kalibr</button>
                <button type="button" data-sim="right" onClick={() => playTilt("right")}>O‘ng</button>
                <button type="button" data-sim="down" onClick={() => playTilt("down")}>Past</button>
              </div>
            </div>
          ) : null}
        </section>
      </div>

      {ready && !prefs.onboarded ? (
        <div className="mb-modal" role="dialog" aria-modal="true" aria-labelledby="onboard-title">
          <div className="mb-sheet">
            <h2 id="onboard-title">To‘rt yo‘nalish</h2>
            <ul className="mb-gestures">
              <li><Icon name="gestures/tilt-up" alt="" /> Yuqori — keyingi kartochka</li>
              <li><Icon name="gestures/tilt-down" alt="" /> Past — oldingi kartochka</li>
              <li><Icon name="gestures/tilt-left" alt="" /> Chap — izohlar</li>
              <li><Icon name="gestures/tilt-right" alt="" /> O‘ng — izohlarni yopish</li>
            </ul>
            <p>Neytralga qaytmasdan ikkinchi harakat chiqmaydi. Yozayotganda sensor jim. Teginish tugmalari doim ishlaydi.</p>
            <button type="button" className="mb-go" onClick={() => setPrefs((prev) => ({ ...prev, onboarded: true }))}>Tushunarli</button>
          </div>
        </div>
      ) : null}

      {settingsOpen ? (
        <div className="mb-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title">
          <div className="mb-sheet">
            <h2 id="settings-title">Sozlamalar</h2>
            <p className="mb-quiet">Pitch {live.pitch.toFixed(1)}° · roll {live.roll.toFixed(1)}° · {fps ? `${Math.round(fps)} fps` : "fps o‘lchanmoqda"}</p>
            <div className="mb-settings">
              <button type="button" onClick={() => { setMotionMode("off"); setCalibrated(false); neutralRef.current = null; setNote("Harakat o‘chiq. Teginish qoladi."); }}>Faqat teginish</button>
              <button type="button" onClick={() => void enablePhone()}>Harakatni yoqish</button>
              <button type="button" onClick={enableSimulator}>Simulyator</button>
              <button type="button" onClick={calibrate} disabled={motionMode === "off"}>Kalibrlash</button>
              <button type="button" onClick={resetCalibration}>Kalibrni tiklash</button>
            </div>
            <fieldset>
              <legend>Sezuvchanlik</legend>
              {(["low", "medium", "high"] as Sensitivity[]).map((level) => (
                <label key={level}>
                  <input type="radio" name="sensitivity" checked={prefs.sensitivity === level} onChange={() => setPrefs((prev) => ({ ...prev, sensitivity: level }))} />
                  {level === "low" ? "Past" : level === "medium" ? "O‘rta" : "Yuqori"}
                </label>
              ))}
            </fieldset>
            <fieldset>
              <legend>Grafika</legend>
              {(["high", "balanced", "low"] as Profile[]).map((level) => (
                <label key={level}>
                  <input type="radio" name="profile" checked={!prefs.force2d && prefs.profile === level} onChange={() => setPrefs((prev) => ({ ...prev, profile: level, force2d: false }))} />
                  {level === "high" ? "Yuqori" : level === "balanced" ? "Muvozanat" : "Past"}
                </label>
              ))}
              <label>
                <input type="radio" name="profile" checked={prefs.force2d} onChange={() => setPrefs((prev) => ({ ...prev, force2d: true }))} />
                2D
              </label>
            </fieldset>
            <label className="mb-check"><input type="checkbox" checked={prefs.reducedMotion} onChange={(event) => setPrefs((prev) => ({ ...prev, reducedMotion: event.target.checked }))} /> Kam harakat</label>
            <label className="mb-check"><input type="checkbox" checked={prefs.sound} onChange={(event) => setPrefs((prev) => ({ ...prev, sound: event.target.checked }))} /> Ovoz</label>
            <label className="mb-check"><input type="checkbox" checked={prefs.ambience} onChange={(event) => setPrefs((prev) => ({ ...prev, ambience: event.target.checked }))} /> Fondagi past ohang</label>
            <label className="mb-check"><input type="checkbox" checked={prefs.haptics} onChange={(event) => setPrefs((prev) => ({ ...prev, haptics: event.target.checked }))} /> Tebranish</label>
            <button type="button" className="mb-go" onClick={() => setSettingsOpen(false)}>Yopish</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
