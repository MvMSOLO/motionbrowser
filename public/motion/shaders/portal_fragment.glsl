uniform float uTime;
uniform float uIntensity;
varying vec2 vUv;
void main() {
  float sweep = fract(uTime * 0.07);
  float delta = abs(fract(vUv.x - sweep + 0.5) - 0.5);
  float band = smoothstep(0.08, 0.0, delta);
  vec3 base = vec3(0.09, 0.13, 0.18);
  vec3 accent = vec3(0.33, 0.85, 0.95);
  vec3 color = mix(base, accent, band * uIntensity);
  float alpha = 0.72 + band * 0.28 * uIntensity;
  gl_FragColor = vec4(color, alpha);
}
