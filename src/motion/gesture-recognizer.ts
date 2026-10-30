export type GestureDirection = "up" | "down" | "left" | "right";
export type RecognizerMode = "neutral" | "candidate" | "latched";
export type Sensitivity = "low" | "medium" | "high";

export type RecognizerConfig = {
  activationDeg: number;
  resetDeg: number;
  holdMs: number;
  cooldownMs: number;
  smoothing: number;
  dominance: number;
};

export type OrientationSample = { pitch: number; roll: number; t: number };

export type RecognizerState = {
  mode: RecognizerMode;
  smoothPitch: number;
  smoothRoll: number;
  primed: boolean;
  candidate: GestureDirection | null;
  candidateSince: number | null;
  lastEmitAt: number | null;
};

export type StepResult = {
  state: RecognizerState;
  emitted: GestureDirection | null;
  preview: GestureDirection | null;
};

export function configForSensitivity(level: Sensitivity): RecognizerConfig {
  if (level === "low") {
    return { activationDeg: 18, resetDeg: 7, holdMs: 240, cooldownMs: 900, smoothing: 0.32, dominance: 1.25 };
  }
  if (level === "high") {
    return { activationDeg: 8, resetDeg: 3.5, holdMs: 120, cooldownMs: 560, smoothing: 0.55, dominance: 1.15 };
  }
  return { activationDeg: 12, resetDeg: 5, holdMs: 170, cooldownMs: 700, smoothing: 0.42, dominance: 1.2 };
}

export function createRecognizerState(): RecognizerState {
  return {
    mode: "neutral",
    smoothPitch: 0,
    smoothRoll: 0,
    primed: false,
    candidate: null,
    candidateSince: null,
    lastEmitAt: null,
  };
}

function dominant(pitch: number, roll: number, config: RecognizerConfig): GestureDirection | null {
  const ap = Math.abs(pitch);
  const ar = Math.abs(roll);
  if (ap < config.activationDeg && ar < config.activationDeg) return null;
  if (ap >= ar) {
    if (ap < config.activationDeg) return null;
    if (ar > 0 && ap < ar * config.dominance) return null;
    return pitch >= 0 ? "up" : "down";
  }
  if (ar < config.activationDeg) return null;
  if (ap > 0 && ar < ap * config.dominance) return null;
  return roll >= 0 ? "right" : "left";
}

function nearNeutral(pitch: number, roll: number, resetDeg: number): boolean {
  return Math.abs(pitch) <= resetDeg && Math.abs(roll) <= resetDeg;
}

export function stepRecognizer(prev: RecognizerState, sample: OrientationSample, config: RecognizerConfig): StepResult {
  const state: RecognizerState = { ...prev };
  if (!state.primed) {
    state.smoothPitch = sample.pitch;
    state.smoothRoll = sample.roll;
    state.primed = true;
  } else {
    state.smoothPitch += (sample.pitch - state.smoothPitch) * config.smoothing;
    state.smoothRoll += (sample.roll - state.smoothRoll) * config.smoothing;
  }

  const dir = dominant(state.smoothPitch, state.smoothRoll, config);
  let emitted: GestureDirection | null = null;

  if (state.mode === "latched") {
    if (nearNeutral(state.smoothPitch, state.smoothRoll, config.resetDeg)) {
      state.mode = "neutral";
      state.candidate = null;
      state.candidateSince = null;
    }
  } else if (!dir) {
    state.mode = "neutral";
    state.candidate = null;
    state.candidateSince = null;
  } else {
    const cooled = state.lastEmitAt === null || sample.t - state.lastEmitAt >= config.cooldownMs;
    if (!cooled) {
      state.mode = "neutral";
      state.candidate = null;
      state.candidateSince = null;
    } else if (state.candidate !== dir) {
      state.mode = "candidate";
      state.candidate = dir;
      state.candidateSince = sample.t;
    } else if (state.candidateSince !== null && sample.t - state.candidateSince >= config.holdMs) {
      emitted = dir;
      state.mode = "latched";
      state.lastEmitAt = sample.t;
      state.candidate = null;
      state.candidateSince = null;
    } else {
      state.mode = "candidate";
    }
  }

  return { state, emitted, preview: state.mode === "latched" ? null : dir };
}

export function runSequence(samples: OrientationSample[], config: RecognizerConfig): GestureDirection[] {
  let state = createRecognizerState();
  const emitted: GestureDirection[] = [];
  for (const sample of samples) {
    const step = stepRecognizer(state, sample, config);
    state = step.state;
    if (step.emitted) emitted.push(step.emitted);
  }
  return emitted;
}
