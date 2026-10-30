uniform sampler2D uSky;
varying vec3 vWorld;
varying vec2 vUv;
void main() {
  vec3 dir = normalize(vWorld - cameraPosition);
  float h = clamp(dir.y * 0.5 + 0.55, 0.0, 1.0);
  vec3 sky = texture2D(uSky, vec2(vUv.x, h)).rgb;
  vec3 zenith = vec3(0.02, 0.03, 0.055);
  vec3 color = mix(sky, zenith, smoothstep(0.35, 1.0, h));
  gl_FragColor = vec4(color, 1.0);
}
