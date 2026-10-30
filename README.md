# Motion Browser

Motion Browser is an experimental, mobile-first **PWA/web prototype** for a spatial browser interface and a first-party motion-control lab.

> **Current status:** this repository does not contain a native Android project or a distributable APK/AAB. The motion controls currently operate the built-in Motion Lab demo; they do not inject gestures into third-party websites.

## What works today

- HTTPS address normalization and blocking of local/private-network destinations.
- A small set of address aliases, plus server-side DuckDuckGo HTML search.
- A browser shell that embeds a page only when the target site permits framing; known restricted sites and authentication pages are opened externally.
- An in-app Motion Lab with tilt recognition, neutral-pose calibration, cooldown/re-arm behavior, touch controls, and a simulator.
- A Three.js observatory with high/balanced/low profiles and a 2D fallback.
- Local preferences for sensitivity, graphics, reduced motion, sound, haptics, and onboarding.

## Important limitations

- This is not a full browser engine. It cannot guarantee that arbitrary sites render inside an iframe.
- Instagram, YouTube, TikTok, Facebook, X, and authentication pages are deliberately not embedded.
- Motion gestures are not sent to third-party pages. A PWA cannot reliably synthesize native touch events inside arbitrary cross-origin sites.
- Desktop motion simulation is not a substitute for physical-device sensor testing.
- No Android Manifest, Gradle project, Kotlin source, signed APK, or AAB is included. See [NATIVE_ANDROID_IMPLEMENTATION.md](./NATIVE_ANDROID_IMPLEMENTATION.md) for the native-app boundary and migration plan.
- Search terms submitted through the built-in search are sent server-side to DuckDuckGo.

## Requirements

- Node.js 22.12 or newer
- npm (the version bundled with the selected Node.js release is suitable)

## Local development

```sh
npm ci
npm run dev
```

The development server uses the Vite/TanStack Start configuration in vite.config.ts and listens on port 8080.

## Quality checks

```sh
npm run typecheck
npm test
npm run lint
npm run build
```

The production build runs the migration step. It safely skips database migration when DATABASE_URL is not configured; deployments with a database apply pending root-level SQL migrations.

GitHub Actions runs typecheck, tests, and the production build for pushes and pull requests.

## Project map

- src/components/motion-browser.tsx — main browser shell and interaction wiring
- src/motion/ — URL policy, motion recognition, preference parsing, search parsing, and observatory scene
- src/components/observatory-stage.tsx — WebGL scene lifecycle and 2D fallback
- public/motion/ — visual, sound, animation, shader, and scene assets
- scripts/ — build helpers, migration runner, preview tooling, and regression tests
- NATIVE_ANDROID_IMPLEMENTATION.md — explicit native Android scope and proposed migration order
