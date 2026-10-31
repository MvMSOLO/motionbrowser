Motion Browser — Native Android

Native Kotlin Android module.

Build requirements: JDK 17, Android SDK platform 36, build-tools 36.0.0, Gradle 8.13.

Build command: gradle -p android testDebugUnitTest assembleDebug

Debug APK path: android/app/build/outputs/apk/debug/app-debug.apk

Current native scope:
- Kotlin Activity and Android System WebView for real HTTPS websites.
- URL normalization and private/local host filtering ported from the TypeScript resolver.
- Authentication and known social hosts hand off to Custom Tabs / the system browser.
- No privileged JavaScript bridge is registered for external pages.
- Rotation-vector sensor data is processed locally and only drives the first-party Motion Lab.
- Sensor sampling is paused while the Activity is backgrounded; calibration is invalidated on resume and orientation changes.
- The APK workflow runs unit tests, assembles a debug APK, and publishes it as a GitHub Actions artifact.

This is a debug build, not a signed production release. Physical-device sensor calibration, WebView compatibility QA, app icon work, and native 3D observatory integration remain follow-up work.
