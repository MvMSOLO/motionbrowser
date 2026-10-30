uniform sampler2D uNoise;
uniform float uIntensity;
varying vec2 vUv;
varying vec3 vNormal;
void main() {
  float noise = texture2D(uNoise, vUv * 2.0).r;
  float fres = pow(1.0 - abs(dot(normalize(vNormal), vec3(0.0, 0.0, 1.0))), 1.6);
  vec3 tint = vec3(0.16, 0.22, 0.3);
  vec3 edge = vec3(0.45, 0.78, 0.9);
  vec3 color = mix(tint, edge, fres * 0.55 * uIntensity);
  color += (noise - 0.5) * 0.04;
  gl_FragColor = vec4(color, 0.42 + fres * 0.25);
}
