uniform float uTime;
uniform sampler2D uNoise;
varying vec2 vUv;
void main() {
  float n = texture2D(uNoise, vUv + vec2(uTime * 0.05, 0.0)).r;
  float streak = smoothstep(0.35, 1.0, vUv.y + n * 0.25);
  vec3 color = mix(vec3(0.1, 0.45, 0.55), vec3(0.85, 0.95, 1.0), streak);
  float alpha = (0.25 + streak * 0.55) * smoothstep(0.0, 0.15, uTime) * (1.0 - smoothstep(0.45, 0.85, uTime));
  gl_FragColor = vec4(color, alpha);
}
