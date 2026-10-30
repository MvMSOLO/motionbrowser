# Asset QA report

Status: assets generated locally. Runtime verification is recorded in docs/TEST_REPORT.md after the build is exercised.

- Models are original glTF 2.0 binaries produced by the generator, not downloaded scans.
- Textures are PNG rather than WebP because this environment has no WebP encoder. The loader consumes the PNG files directly.
- Ambience is a seamless WAV loop rather than OGG for the same reason. Playback does not depend on a particular compressed-music codec beyond what the browser decodes.
- Triangle counts are in manifest/triangle-counts.json. Counts are deliberately modest: the forms are precise primitives, not a dense scanned set.
- No physical Android device was available in this workspace. Do not treat any number here as an on-device FPS benchmark.
