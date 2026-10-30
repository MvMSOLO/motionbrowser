export type SensorKind = "insecure" | "unavailable" | "needs-permission" | "available";

export function classifySensor(env: { secure: boolean; hasDeviceOrientation: boolean; hasRequestPermission: boolean }): SensorKind {
  if (!env.hasDeviceOrientation) return "unavailable";
  if (!env.secure) return "insecure";
  if (env.hasRequestPermission) return "needs-permission";
  return "available";
}
