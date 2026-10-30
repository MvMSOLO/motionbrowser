/** Screen-relative tilt. Positive pitch = top of the device rotated away from neutral toward upright. Positive roll = right side down. */
export function mapDeviceAxes(beta: number, gamma: number, screenAngle: number): { pitch: number; roll: number } {
  const angle = ((Math.round(screenAngle) % 360) + 360) % 360;
  if (angle === 90) return { pitch: gamma, roll: -beta };
  if (angle === 270) return { pitch: -gamma, roll: beta };
  if (angle === 180) return { pitch: -beta, roll: -gamma };
  return { pitch: beta, roll: gamma };
}

export function deltaFromNeutral(
  raw: { pitch: number; roll: number },
  neutral: { pitch: number; roll: number },
  invertPitch: boolean,
  invertRoll: boolean,
): { pitch: number; roll: number } {
  return {
    pitch: (raw.pitch - neutral.pitch) * (invertPitch ? -1 : 1),
    roll: (raw.roll - neutral.roll) * (invertRoll ? -1 : 1),
  };
}
