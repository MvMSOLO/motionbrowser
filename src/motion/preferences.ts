export type MotionSensitivity = "low" | "medium" | "high";
export type MotionGraphicsProfile = "high" | "balanced" | "low";

export type MotionPrefs = {
  sensitivity: MotionSensitivity;
  sound: boolean;
  haptics: boolean;
  ambience: boolean;
  reducedMotion: boolean;
  profile: MotionGraphicsProfile;
  force2d: boolean;
  onboarded: boolean;
};

export const MOTION_PREF_KEY = "motion-browser-prefs-v1";

export const DEFAULT_MOTION_PREFS: MotionPrefs = {
  sensitivity: "medium",
  sound: false,
  haptics: false,
  ambience: false,
  reducedMotion: false,
  profile: "balanced",
  force2d: false,
  onboarded: false,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isOneOf<T extends string>(value: unknown, values: readonly T[]): value is T {
  return typeof value === "string" && values.includes(value as T);
}

/**
 * Parse persisted browser preferences defensively. localStorage is user-editable
 * and can contain stale, partial, or malformed values after an app upgrade.
 */
export function parseMotionPrefs(raw: string | null): MotionPrefs {
  if (!raw) return { ...DEFAULT_MOTION_PREFS };

  try {
    const value: unknown = JSON.parse(raw);
    if (!isRecord(value)) return { ...DEFAULT_MOTION_PREFS };

    return {
      sensitivity: isOneOf(value.sensitivity, ["low", "medium", "high"])
        ? value.sensitivity
        : DEFAULT_MOTION_PREFS.sensitivity,
      sound: typeof value.sound === "boolean" ? value.sound : DEFAULT_MOTION_PREFS.sound,
      haptics: typeof value.haptics === "boolean" ? value.haptics : DEFAULT_MOTION_PREFS.haptics,
      ambience: typeof value.ambience === "boolean" ? value.ambience : DEFAULT_MOTION_PREFS.ambience,
      reducedMotion:
        typeof value.reducedMotion === "boolean"
          ? value.reducedMotion
          : DEFAULT_MOTION_PREFS.reducedMotion,
      profile: isOneOf(value.profile, ["high", "balanced", "low"])
        ? value.profile
        : DEFAULT_MOTION_PREFS.profile,
      force2d: typeof value.force2d === "boolean" ? value.force2d : DEFAULT_MOTION_PREFS.force2d,
      onboarded:
        typeof value.onboarded === "boolean" ? value.onboarded : DEFAULT_MOTION_PREFS.onboarded,
    };
  } catch {
    return { ...DEFAULT_MOTION_PREFS };
  }
}
