import { clamp } from "./analysis";

export interface VisualFrame {
  time: number;
  progress: number;
  bass: number;
  high: number;
  energy: number;
  scene: number;
  palette: number;
  intensity: number;
  motion: number;
  grain: boolean;
  loaded: boolean;
}

const vertexSource = `
attribute vec2 position;
void main() { gl_Position = vec4(position, 0., 1.); }
`;

const fragmentSource = `
precision highp float;
uniform vec2 resolution;
uniform float time, progress, bass, high, energy, scene, palette, intensity, motion, grain, loaded;
#define PI 3.14159265359

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3. - 2. * f);
  return mix(mix(hash(i), hash(i + vec2(1,0)), f.x), mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), f.x), f.y);
}
float fbm(vec2 p) {
  float n = 0., a = .5;
  mat2 turn = mat2(.8,-.6,.6,.8);
  for (int i = 0; i < 5; i++) {
    n += a * noise(p);
    p = turn * p * 2.03 + 13.2;
    a *= .5;
  }
  return n;
}
vec3 color(float n) {
  vec3 dark = vec3(.18,.12,.43), light = vec3(1.,.47,.19);
  if (palette > .5 && palette < 1.5) { dark = vec3(.29,.07,.53); light = vec3(.47,.74,1.); }
  if (palette > 1.5) { dark = vec3(.015,.25,.32); light = vec3(.52,1.,.81); }
  return mix(dark, light, clamp(n, 0., 1.));
}
void main() {
  vec2 uv = (gl_FragCoord.xy - resolution * .5) / resolution.y;
  float t = time * (.08 + motion * .18);
  float travel = smoothstep(.0,.75,progress) - smoothstep(.82,1.,progress)*.55;
  float audio = bass * intensity;
  float zoom = 1. + travel * .32 + audio * .025;
  uv /= zoom;
  uv += vec2(sin(t*.17)*.022,cos(t*.21)*.016);
  float radius = length(uv);
  vec3 col = vec3(.007,.009,.021);

  // Slowly drifting nebula behind every world.
  float fog = fbm(uv * 3. + vec2(t*.08,-t*.06));
  float cloud = pow(fbm(uv * 5. + fog * 2. + vec2(0,t*.04)), 3.);
  col += color(.12) * cloud * .45;

  if (scene < .5) {
    // Turbulent accretion rings: a tilted, luminous orbit around a dark core.
    float angle = -.38 + sin(t*.18)*.12 + travel*.25;
    mat2 rot = mat2(cos(angle),-sin(angle),sin(angle),cos(angle));
    vec2 p = rot * uv;
    p.y *= 1.35 + sin(t*.12)*.15;
    float r = length(p);
    float a = atan(p.y,p.x);
    vec2 circular = vec2(cos(a),sin(a));
    float turbulence = fbm(circular * 3. + vec2(r * 8. - t*.55, t*.16));
    float ringR = .295 + sin(a*3.+t*.3)*.008;
    float distortion = (turbulence-.5) * .15;
    float d = r - ringR + distortion;
    float wisps = fbm(vec2(r*20. + turbulence*4. - t*.22, a*2. + t*.12));
    float threads = pow(.5+.5*sin(r*170. + turbulence*19. - t*1.8), 5.);
    float halo = exp(-abs(d)*8.);
    float ribbon = exp(-abs(d)*34.);
    float edge = exp(-abs(d+.015)*110.);
    float side = .5 + .5 * sin(a + .6);
    col += color(side) * halo * (.12 + .12*energy);
    col += color(side) * ribbon * (wisps*.95 + threads*.65) * (1.25 + audio*.45);
    col += mix(color(side),vec3(1.,.94,.83),.65) * edge * (.22+threads*.6);
    col += color(.55) * exp(-abs(p.y + .045)*65.) * exp(-abs(p.x)*2.8) * .065;
    float core = smoothstep(.20,.29,r + distortion*.55);
    col *= .055 + core*.945;
    // Broad lens bloom at the two ends of the orbit.
    col += color(.9) * .075 / (1. + dot((p-vec2(-.28,.055))*17.,(p-vec2(-.28,.055))*17.));
  } else if (scene < 1.5) {
    // A field of liquid silk folds whose scale opens through the track.
    vec2 p = uv * (2.2-travel*.5);
    float n = fbm(p + vec2(t*.08,t*.1));
    for (int i = 0; i < 4; i++) {
      float fi = float(i);
      float y = p.y + sin(p.x*2.2 + t*.3 + fi*.5)*.35 + n*.65 - .32;
      float wave = sin(y*12. + fbm(p*3.+t*.1)*6. + fi*1.1);
      float fold = pow(.5+.5*wave, 12.);
      col += color(fi/3.) * fold * (.14 + .12*audio) / (1.+abs(p.y)*1.5);
      p = mat2(.94,-.342,.342,.94)*p;
    }
    col += color(.5) * exp(-radius*3.)*.1;
  } else {
    // A continuous flight through a twisting, luminous tunnel.
    vec2 p = uv + vec2(sin(t*.25),cos(t*.17))*.04;
    float r = max(length(p),.015);
    float a = atan(p.y,p.x);
    float depth = .23/r + t*.6;
    float twist = a + depth*.2 + sin(depth*.25)*.6;
    float ribs = pow(.5+.5*cos(twist*8.),20.);
    float rings = pow(.5+.5*cos(depth*9.),28.);
    float glow = ribs*.3 + rings*.22;
    col += color(.5+.5*sin(depth*.7+a)) * glow * smoothstep(.015,.18,r) * (1.+audio*.5);
    col += color(.8) * exp(-r*9.)*.5;
  }

  // Fine stars with soft diffraction, no flashing strobes.
  vec2 starUV = uv*vec2(170.,170.) + vec2(t*.12,t*.06);
  vec2 cell = floor(starUV);
  float star = hash(cell);
  vec2 point = fract(starUV)-.5;
  float sparkle = exp(-length(point)*24.) * step(.983,star);
  col += vec3(.6,.7,.85) * sparkle * (.3+high*.6) * smoothstep(.25,.6,radius);
  col *= 1.-smoothstep(.3,1.2,radius)*.6;
  float exposure = .8 + intensity*.35;
  col = vec3(1.) - exp(-col * exposure * 1.7);
  col = pow(max(col,vec3(0.)),vec3(.82));
  col += (hash(gl_FragCoord.xy + floor(time*24.))-.5) * .027 * grain;
  float fadeIn = smoothstep(0.,.025,progress);
  float fadeOut = 1.-smoothstep(.95,1.,progress);
  col *= mix(1., fadeIn*fadeOut, loaded);
  gl_FragColor = vec4(max(col,vec3(0.)),1.);
}
`;

export class Visualizer {
  private readonly gl: WebGLRenderingContext;
  private readonly program: WebGLProgram;
  private readonly buffer: WebGLBuffer;
  private readonly uniforms = new Map<string, WebGLUniformLocation | null>();

  constructor(readonly canvas: HTMLCanvasElement) {
    const gl = canvas.getContext("webgl", {
      alpha: false,
      antialias: false,
      preserveDrawingBuffer: true,
    });
    if (!gl) {
      throw new Error(
        "This browser could not start the visual engine. Enable hardware acceleration or try another browser.",
      );
    }
    this.gl = gl;
    const compile = (type: number, source: string) => {
      const shader = gl.createShader(type);
      if (!shader) {
        throw new Error("Could not create the visual shader.");
      }
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const reason = gl.getShaderInfoLog(shader);
        gl.deleteShader(shader);
        throw new Error(`Visual shader failed: ${reason}`);
      }
      return shader;
    };
    const vertex = compile(gl.VERTEX_SHADER, vertexSource);
    const fragment = compile(gl.FRAGMENT_SHADER, fragmentSource);
    const program = gl.createProgram();
    const buffer = gl.createBuffer();
    if (!program || !buffer) {
      throw new Error("Could not initialize the visual engine.");
    }
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error("The visual engine is not supported by this GPU.");
    }
    this.program = program;
    this.buffer = buffer;
    // biome-ignore lint/correctness/useHookAtTopLevel: useProgram is a WebGL method, not a React hook.
    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW,
    );
    const position = gl.getAttribLocation(program, "position");
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    for (const key of [
      "resolution",
      "time",
      "progress",
      "bass",
      "high",
      "energy",
      "scene",
      "palette",
      "intensity",
      "motion",
      "grain",
      "loaded",
    ]) {
      this.uniforms.set(key, gl.getUniformLocation(program, key));
    }
  }

  render(frame: VisualFrame, ratio: number, exporting = false): void {
    const { gl, canvas } = this;
    const width = exporting
      ? ratio <= 1
        ? 1080
        : 1920
      : Math.round(clamp(canvas.clientWidth * Math.min(window.devicePixelRatio, 1.5), 320, 1920));
    const height = Math.round(width / ratio);
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    gl.viewport(0, 0, width, height);
    gl.uniform2f(this.uniforms.get("resolution") ?? null, width, height);
    for (const [key, value] of Object.entries(frame)) {
      gl.uniform1f(this.uniforms.get(key) ?? null, Number(value));
    }
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  dispose(): void {
    this.gl.deleteBuffer(this.buffer);
    this.gl.deleteProgram(this.program);
  }
}
