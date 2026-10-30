# Native Android implementation boundary

This repository is a **web/PWA prototype** of Motion Browser. It is not an Android project. There is no `AndroidManifest.xml`, Gradle build, Kotlin/Java source, or installable APK/AAB here. A page served in a browser preview is not an APK.

The Grok Build environment used for this prototype cannot produce a signed Android package. Do not describe the preview as a native build.

## What the prototype already proved

- Address normalization: site aliases, HTTPS-only navigation, rejection of dangerous schemes and userinfo, preservation of path, query, and hash.
- Honest embed policy: known restricted hosts (Instagram, YouTube, TikTok, Facebook, X, Google sign-in) are not iframed; unknown hosts are labeled unknown; `example.com` is the checked embeddable host.
- A first-party Motion Lab whose feed and comments are driven by the same gesture recognizer used for tests: one step per tilt, neutral re-arm, cooldown, and blocks while typing, overlays, or background.
- Screen-relative orientation math and a calibration baseline. Desktop input is a labeled simulator, not a phone sensor.
- Local Three.js observatory around the browser panel, with a 2D fallback.

## Target native shape

Build a separate Kotlin app. Suggested modules:

1. **Shell activity** with a full-screen `WebView` for real websites and a separate app-owned surface for the Motion Lab.
2. **Graphics** either as a behind/around `GLSurfaceView` / Filament / a local WebView running the existing Three.js scene. Composite so the website viewport stays large. Do not draw the page into a texture by snapshotting it.
3. **Sensors** via `SensorManager` rotation vector or game rotation vector. Convert to screen-relative pitch/roll using `Display.rotation`. Capture an explicit neutral pose. Low-pass, separate activation and reset thresholds, hold time, cooldown, and re-arm at neutral. Pause when the IME is visible, a dialog is open, `onPause`/`onStop` runs, or the user disables motion.
4. **WebView settings**
   - Load only `https` URLs that pass the same host policy as `resolveAddress`.
   - Enable JavaScript and DOM storage only as required for ordinary browsing.
   - Do **not** add a JavascriptInterface with native powers to arbitrary pages.
   - If the app needs a bridge, put it in a second WebView whose origin is the app’s own `https://appassets.androidplatform.net` or a bundled first-party page, and validate every message.
   - Handle `shouldOverrideUrlLoading` for non-https schemes, intent URLs, and known auth hosts by handing them to Custom Tabs.
5. **Navigation** — WebView `canGoBack` / `goBack`, plus the system Back button. Keep the shell history distinct from the page history.
6. **Auth** — Google Identity and many OAuth providers reject embedded WebViews. Send those URLs to Chrome Custom Tabs. Do not scrape cookies or copy passwords into app storage.
7. **Gesture to page** — Do not promise that a tilt becomes a swipe inside Instagram or YouTube until a device test shows a real `MotionEvent` sequence delivered to that WebView and the site responds. A parent-injected JavaScript scroll is not available for cross-origin pages and must not be faked. Prove it on a first-party page first, then on one external page that opts in.
8. **Permissions** — Request activity recognition / nothing extra for rotation vector on modern Android (no runtime permission for `TYPE_ROTATION_VECTOR` on current API levels; still explain the feature). Do not request camera, microphone, contacts, or location for this product.
9. **Packaging** — `minSdk` high enough for Custom Tabs and WebView asset loader, portrait-first manifest, `android:configChanges` handled by remapping sensors and asking for recalibration. Build an AAB, sign it, and run QA on at least one physical phone. Record model, Android version, and WebView version.
10. **Privacy** — Process sensor samples on device. Do not upload them. Do not persist third-party form data.

## Migration order

1. Port `url-resolver`, `gesture-recognizer`, `orientation-math`, `motion-actions`, and `lab-reducer` as Kotlin or as a tested shared module. Keep the existing node tests as the spec.
2. Ship the Motion Lab inside the app WebView/native UI and verify the four tilts on a physical phone.
3. Add the website WebView with external handoff, without a privileged bridge.
4. Only then experiment with injecting `MotionEvent`s into that WebView, and publish the negative result if a site ignores them.
5. Compose the 3D shell last, after the page viewport is usable at 390×844 dp.

Until those steps exist as a compiling Android project, the product status is: **PWA prototype only**.
