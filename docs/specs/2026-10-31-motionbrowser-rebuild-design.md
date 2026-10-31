# MotionBrowser Native Android Rebuild — Design Specification

**Date:** 2026-10-31  
**Status:** Approved by user on 2026-10-31  
**Repository:** `MvMSOLO/motionbrowser`  
**Implementation target:** isolated feature branch; `main` remains untouched until explicit release approval.

## 1. Product outcome

Rebuild MotionBrowser as a real Android browser application, not a thin wrapper or a set of demo cards. The Android experience must combine:

1. A polished native interface built with Kotlin and Jetpack Compose.
2. Actual website rendering and browser navigation through Android WebView.
3. The existing MotionBrowser 3D Observatory, reusing the original Three.js scene, GLB models, textures, shaders, animation data and audio cues where compatible.
4. Device-motion interactions that respond predictably on a real handset and remain usable with touch controls.
5. Observable quality: automated tests, a reproducible APK build, and a documented physical-device QA report. A successful compile alone is not product acceptance.

The rejected `feature/native-kotlin-android` shell is not the product baseline. It may be referenced for build configuration or small reusable utilities only after review. The original web repository on `main` is the source of truth for existing product behavior and 3D assets.

## 2. Scope and non-goals

### In scope

- Native Compose shell, navigation, address/search field, tab management, browser controls, loading/error states, settings and Motion Lab.
- Secure HTTPS navigation, URL/search resolution, browser history, reload, stop, new tab, tab switching and closing.
- JavaScript and DOM storage support required by ordinary modern websites, with explicit WebView security configuration.
- File chooser and download flows using Android system pickers/DownloadManager where supported.
- Native motion sensor service, calibration, sensitivity profiles, gesture recognizer, parallax data and touch fallback.
- A dedicated local 3D renderer that reuses the original `src/motion/observatory.ts` implementation and its `public/motion` assets.
- Unit tests, Android UI/instrumentation tests where practical, CI APK generation and physical-device QA documentation.

### Not in scope for the first release

- A complete desktop-browser feature set (extensions, sync accounts, password manager, developer tools, ad blocking or cross-device cloud sync).
- Promising that every third-party website will support embedded login, DRM, video playback or every file-upload flow. Website policies and WebView engine support can restrict these.
- A public release or merge to `main` before the agreed acceptance criteria and user review pass.

## 3. Architecture decision

### Selected: Kotlin + Jetpack Compose + isolated WebViews + original Three.js renderer

The app has three distinct rendering responsibilities:

- **Compose application shell:** all trusted native navigation, controls, settings, tab UI, loading/error overlays and diagnostics.
- **Browser WebView per active tab:** untrusted remote web content. It receives no app-specific JavaScript interface and has no privileged access to native app objects.
- **Observatory renderer WebView:** trusted, bundled local content loaded through `WebViewAssetLoader` at an app-assets HTTPS origin. It renders the existing Three.js Observatory scene. Native-to-renderer updates use a narrow message contract; renderer-to-native telemetry uses AndroidX `WebViewCompat.addWebMessageListener` with an exact app-assets origin allowlist when that WebView feature is supported. If unsupported, the renderer degrades to one-way native-to-renderer updates and native-side diagnostics; it must not fall back to an unrestricted bridge. This interface is never installed in the remote browsing WebView.

A browser view and a renderer view must never share a JavaScript bridge, cookies, browsing state or privileged callbacks. External navigation decisions are made by native Kotlin code before a URL is loaded.

### Why this option

- It keeps navigation, tabs, settings, sensor access and permission handling native.
- It avoids replacing a working and substantial Three.js/GLB/shader scene with a rushed native 3D rewrite.
- It preserves real site rendering via WebView instead of the old iframe-based limitations.
- It establishes a hard trust boundary between untrusted websites and the bundled 3D renderer.

### Rejected alternatives

- **Compose + WebView only:** simpler, but would discard or require a substantial reimplementation of the existing Three.js visual system.
- **Wrap the current web app in a WebView:** faster initially, but does not meet the native Kotlin product requirement or provide a robust native sensor/browser architecture.
- **Immediate full Filament/SceneView port:** not selected for this iteration because the existing scene contains Three.js-specific shaders, materials and animation logic. A renderer rewrite would add substantial porting risk without improving the core user outcome.

## 4. Application structure and module boundaries

Proposed package boundaries (names may be adjusted to match repository conventions during implementation):

- `app`: Activity, Compose root, app theme, navigation and dependency wiring.
- `browser/model`: tab model, navigation state, history metadata and browser events.
- `browser/navigation`: URL normalization, search query resolution, scheme/host policy and external-intent policy. Port and test the existing safe URL rules rather than replacing them casually.
- `browser/webview`: WebView factory, WebViewClient, WebChromeClient, lifecycle wrapper, downloads, file chooser and renderer-process recovery.
- `motion/sensor`: SensorManager registration, rotation-vector source, fallbacks, display-rotation remapping and lifecycle control.
- `motion/processing`: neutral calibration, angle extraction, smoothing, threshold/hysteresis, gesture state machine and cooldown.
- `motion/actions`: mapping recognized gestures into browser scroll/history actions, with guards for focus, overlays and lifecycle.
- `observatory`: local renderer host, asset versioning, renderer message contract and performance profile.
- `settings`: motion sensitivity, haptic/audio toggles, reduced motion and privacy controls.
- `qa`: test fixtures, test pages, diagnostics and QA evidence format.

Each subsystem should expose small interfaces and immutable UI state. Business rules must not live in Composable functions or WebView callbacks.

## 5. Core UI and user flows

### Home / new tab

- Premium dark graphite visual system with cyan/blue accents, restrained glass surfaces, Outfit typography where legally and technically reusable, clear spacing and readable contrast.
- Observatory presented as a living visual feature, not as a full-screen obstacle to browsing.
- Address/search field, recent/favorite entry points only if backed by real data, and clear new-tab action.
- A visible loading state during first initialization and asset preparation; no flash of an unfinished screen.

### Browser screen

- Address field with clear/edit/submit behavior.
- Back, forward, reload/stop, home/new tab and tab count controls.
- Real page content occupies the main reading area; browser chrome must not cover touch targets or page controls.
- Loading progress, page title/host, offline state, HTTP error state, blocked unsafe destination state and SSL failure state are distinct.
- Long-press or overflow actions must do something real; no decorative controls that imply unsupported behavior.

### Tabs

- Multiple tabs with active-tab identity, title/host, loading state and close action.
- Tab switching must preserve each tab's current URL and restore its navigation state to the degree supported by WebView save/restore APIs.
- Tab destruction must call WebView cleanup; Activity recreation must not leak WebView instances.
- If full in-memory multi-WebView retention proves unstable on constrained devices, use a documented serialized-tab strategy rather than silently losing tabs.

### Motion Lab

- Live sensor availability and status, neutral calibration, sensitivity selector and a live pitch/roll diagnostic display.
- Test mode must be visibly labelled as simulation; simulated values must never be reported as physical sensor readings.
- Show which action would be triggered and why a gesture was ignored (cooldown, keyboard, overlay, inactive page, uncalibrated or unsupported sensor).

### Settings

- Motion enabled/disabled, sensitivity, haptics, sound, reduced motion and privacy controls.
- Persist user preferences locally.
- No permission request is shown until a feature actually needs it; orientation sensors themselves do not require a dangerous runtime permission.

## 6. Browser behavior and security

### Navigation rules

- Reuse the existing resolver's safety model: normalize user-entered addresses and searches, reject dangerous schemes and credential-bearing URLs, and block loopback/private/local destinations where appropriate.
- Accept HTTPS as the normal navigation scheme. Upgrade typed HTTP addresses only according to the existing resolver's tested policy; do not silently downgrade HTTPS.
- Route unsupported/custom schemes through a strict allowlist and Android intent resolution. Do not execute arbitrary schemes.
- Popups and `target=_blank` requests are handled as a user-visible new-tab or external-navigation decision, not silently discarded.
- Preserve an explicit external-browser/Custom Tabs path for destinations the current embed policy marks as external, including authentication-sensitive flows.

### WebView configuration

- JavaScript enabled for normal site compatibility; DOM storage enabled.
- Safe Browsing enabled where supported.
- Mixed content set to `MIXED_CONTENT_NEVER_ALLOW`.
- File and universal file access disabled; content access disabled unless a specific user-initiated feature requires a scoped URI grant.
- Do not add `addJavascriptInterface` to any WebView that loads remote sites.
- The local Observatory renderer uses `WebViewAssetLoader`, not `file://` or `data:` URLs.
- The local renderer bridge is registered only for its exact app-assets origin using AndroidX WebMessageListener origin rules, feature-checked at runtime. No `addJavascriptInterface` bridge is used.
- SSL certificate errors are cancelled. There is no “continue anyway” bypass.
- Handle Safe Browsing hits with a clear blocked page and safe back navigation.
- Permission requests from websites (camera, microphone, location, notifications, etc.) default to deny until a dedicated, explicit, user-facing permission flow is implemented and justified. Do not inherit broad Android permissions merely because a page requests them.
- Third-party cookies and media autoplay behavior must have documented defaults and dedicated compatibility tests; do not enable extra privileges just to make a single site appear to work.

### Errors and resilience

- Network errors, HTTP errors, SSL failures, Safe Browsing blocks and WebView renderer crashes must produce distinct recoverable UI states.
- A failed subresource must not be mistaken for a failed main document.
- Retry and back actions must remain available after recoverable failures.
- Do not hide site-originated limitations. Some sites refuse WebView, require external sign-in, DRM or unsupported APIs; report these accurately and offer the supported external route where appropriate.

## 7. Motion interaction design

### Sensor source and coordinate handling

- Primary source: `Sensor.TYPE_ROTATION_VECTOR`.
- Detect sensor availability at runtime. Use a documented fallback path (rotation matrix from accelerometer + magnetic field where both exist; gravity-based relative tilt only if its limitations are visible) rather than pretending a missing sensor is available.
- Convert the sensor rotation matrix into screen-relative coordinates using the current display rotation. Portrait and landscape must both be tested; axes must not silently invert after rotation.
- Capture a neutral baseline during calibration and calculate relative pitch/roll against that baseline. Avoid relying on deprecated raw orientation assumptions.

### Gesture pipeline

1. Register only while the app is foregrounded and motion control is enabled.
2. Read sensor events and transform them into screen-relative orientation.
3. Apply smoothing and noise rejection.
4. Compare against the selected sensitivity profile.
5. Use a state machine: neutral → candidate → latched; emit no more than one action per deliberate tilt; require return to the neutral/reset zone before rearming.
6. Apply cooldown and action guards.
7. Dispatch to browser or renderer through typed app events.

Starting profiles should preserve the existing tested recognizer values unless physical-device evidence justifies changes:

| Profile | Activation | Reset | Hold | Cooldown | Smoothing | Dominance |
|---|---:|---:|---:|---:|---:|---:|
| Low | 18° | 7° | 240 ms | 900 ms | 0.32 | 1.25 |
| Medium (default) | 12° | 5° | 170 ms | 700 ms | 0.42 | 1.20 |
| High | 8° | 3.5° | 120 ms | 560 ms | 0.55 | 1.15 |

These are starting thresholds, not a claim that all handset hardware behaves identically. They must be tuned against recorded sensor traces and real devices.

### Default mapping

- Tilt forward: scroll the current page down.
- Tilt backward: scroll the current page up.
- Tilt left: browser Back when history exists.
- Tilt right: browser Forward when history exists.
- Continuous small pitch/roll: smooth Observatory parallax when the 3D scene is visible.

A discrete tilt must not repeatedly trigger while held. Scrolling must stop when the gesture returns to neutral or the page reaches its relevant boundary. History gestures must not fire while the keyboard, a modal, an address editor or a file picker is active.

### Lifecycle and fallback

- Pause/unregister sensor listeners when the app is backgrounded, screen is not interactive, motion is disabled or no eligible view is active.
- Re-register and re-evaluate calibration when returning to foreground.
- Provide ordinary touch controls at all times. Motion must be optional, never required to browse.
- Haptics are brief and configurable. Reduced-motion preference disables camera parallax and nonessential transitions.

## 8. Observatory renderer and asset pipeline

- Reuse the original `src/motion/observatory.ts` and matching Three.js version where practical; do not rebuild the scene from generic placeholder spheres.
- Bring in the original environment GLBs, portal/browser/gesture models, calibration marker, transition shards, material/environment textures, GLSL shaders, animation JSON, fonts and permitted audio cues from `public/motion`.
- Preserve the original asset manifest and triangle-count metadata as part of the asset audit.
- Produce a dedicated, static renderer bundle from a small Vite entry point. Copy the bundle and required assets into Android app assets via a deterministic build task.
- Load the bundled renderer using `WebViewAssetLoader` at the app-assets HTTPS origin. No network request should be required to display the base Observatory scene.
- Use a narrow message contract: native → renderer orientation and lifecycle/performance profile; renderer → native ready/error/performance telemetry. Validate message origin and schema. Do not expose this contract to the remote browser WebView.
- Initial scene: Observatory environment with portal focal object and the original scene composition. Interactions include idle animation, calibration feedback and enter/exit transitions. A decorative state with no response to real device tilt is not accepted.
- Performance tiers may reduce pixel ratio, particle count, post-processing and optional effects while retaining geometry and core identity. Do not silently omit models or textures to meet performance targets.
- Stop animation loops and release renderer resources when the stage is hidden or the Activity is destroyed.

## 9. State, persistence and lifecycle

- Use a state holder/ViewModel for tabs, current navigation status, settings and motion state.
- Persist user preferences and a recoverable tab/session summary locally.
- WebView state must be restored using supported save/restore mechanisms and tied to the Activity lifecycle; do not keep destroyed Activity views alive in a global singleton.
- Use explicit `onPause`/resume and renderer teardown behavior. Avoid background sensor sampling and unnecessary WebGL rendering.
- Handle Activity recreation, app process death, device rotation and WebView renderer process termination.

## 10. Performance and visual quality budgets

These are acceptance targets to measure, not guarantees before device testing:

- Cold start: show a stable branded loading state immediately; initialize expensive 3D resources without blocking the first native interaction.
- Browser controls remain responsive while a page loads.
- Motion input to parallax feedback should feel continuous; discrete gestures should trigger once and predictably.
- On the selected mid-range reference handset, target stable 45–60 FPS for the Observatory at its normal profile; on low tier, target stable 30 FPS with controlled quality reduction. Record actual device, Android version, WebView version, resolution and measured FPS.
- No sustained main-thread stalls from sensor processing, GLB parsing or Compose recomposition.
- Use a bounded asset cache and dispose GL resources on navigation/lifecycle transitions.
- Visual review must include small-screen layout, landscape, system bars, keyboard-open state, long titles/URLs and loading/error screens.

## 11. Verification and acceptance criteria

A deliverable is accepted only when evidence exists for the corresponding item:

### Build and CI

- Clean checkout can resolve dependencies and build without undocumented local files.
- `testDebugUnitTest`, Android lint/static checks and `assembleDebug` pass in CI.
- Instrumentation tests run on an Android emulator where supported; device-only checks are clearly separated.
- CI uploads a versioned APK artifact and records commit SHA, build run URL and APK checksum.
- No claim of physical sensor, camera, file picker or WebGL hardware success based solely on a compile or emulator test.

### Browser

- Open HTTPS URL, perform search, Back, Forward, Reload, Stop, new tab, switch tab and close tab.
- Test page title, redirect, HTTP error, offline failure and WebView renderer crash recovery.
- Test safe rejection of `javascript:`, `file:`, `content:`, credential URLs, localhost/private IP targets and unsupported schemes.
- Verify SSL error is cancelled and Safe Browsing block is handled.
- Test at least a small representative set of normal public sites and record site-specific limitations rather than claiming universal compatibility.
- Verify remote pages cannot access the Observatory/native bridge.

### Motion

- Unit tests cover angle conversion, screen rotation remapping, calibration, noise, one-trigger-per-hold, cooldown, neutral rearm, diagonal dominance and all four directions.
- Replay deterministic sensor traces for portrait and landscape.
- On a physical handset, record a test for each direction, repeated hold, neutral rearm, lifecycle pause/resume and unsupported-sensor fallback.
- Confirm page scroll only acts on the active page and history actions only act when history is available.
- Touch browsing remains fully functional when motion is off or sensor hardware is missing.

### 3D and UI

- Audit that all required source assets resolve in the APK bundle (GLB, textures, shaders, animation data and local fonts/audio where used).
- Verify no missing model/texture/shader errors in renderer logs.
- Capture screenshots or screen recordings of cold start, home Observatory, browser page, Motion Lab, settings and loading/error states.
- Record actual FPS and memory behavior on at least one physical Android device.
- Confirm reduced-motion and low-performance profiles work and release renderer resources when hidden.

### Release gate

No merge to `main` until the full CI run passes, the APK artifact is retrievable, the physical-device QA report is complete, known limitations are documented and the user reviews the evidence.

## 12. Implementation sequence (design-level only)

1. Repository and asset audit; establish a clean isolated branch and inventory the existing behavior to preserve.
2. Native app foundation, Compose design system and lifecycle-safe browser host.
3. URL/navigation policy and real WebView browsing, tabs and recoverable error states.
4. Sensor pipeline, calibration and gesture-to-browser actions with deterministic tests.
5. Dedicated local Observatory renderer and automated asset packaging.
6. UI polish, performance adaptation, haptics/audio/reduced-motion and recovery paths.
7. CI, emulator tests, physical-device QA, APK evidence and release review.

The exact task breakdown and file-level implementation plan will be produced only after this design document is reviewed and approved.

## 13. Risks and mitigations

- **Compose/WebView lifecycle complexity:** isolate WebView ownership in a dedicated host/controller; save/restore state; test Activity recreation and renderer crashes.
- **Third-party site variability:** maintain explicit external-navigation policy and a site-compatibility matrix; do not promise support beyond observed tests.
- **3D WebGL device variability:** use performance tiers, asset validation and real-device FPS measurements; retain the original art direction while scaling optional effects.
- **Sensor axis differences and hardware noise:** remap by display rotation, calibrate a neutral baseline, test deterministic traces and validate on physical devices.
- **Bundle size and startup time:** lazy-initialize the 3D renderer, audit duplicate assets, compress resources where compatible and measure cold start.
- **Security regression:** separate trusted renderer and untrusted browser contexts; keep native bridges out of remote pages; reject SSL failures and unsafe schemes.

## 14. External technical references

- Android — Wrap a WebView in Compose: https://developer.android.com/develop/ui/compose/migrate/interoperability-apis/wrap-webview-in-compose
- Android — Load in-app content with WebViewAssetLoader: https://developer.android.com/develop/ui/views/layout/webapps/load-local-content
- Android — Motion sensors and rotation vector: https://developer.android.com/develop/sensors-and-location/sensors/sensors_motion
- Android — WebView security risks for native bridges: https://developer.android.com/privacy-and-security/risks/insecure-webview-native-bridges
- AndroidX — WebViewCompat origin-restricted WebMessageListener: https://developer.android.com/reference/androidx/webkit/WebViewCompat
- Android — WebViewClient SSL handling: https://developer.android.com/reference/android/webkit/WebViewClient
- Android — WebSettings mixed content: https://developer.android.com/reference/android/webkit/WebSettings