import { PARTICLE_COUNT, type PaletteName, palettes, randomGenerator } from "./forms.ts";

const vertexSource = `
precision highp float;
attribute vec3 aFrom;
attribute vec3 aTo;
attribute vec3 aMeta;
uniform float uTime;
uniform float uMorph;
uniform float uChaos;
uniform float uEnergy;
uniform float uDpr;
uniform vec2 uPointer;
uniform vec2 uResolution;
uniform vec2 uCenter;
uniform float uScale;
uniform vec3 uColorA;
uniform vec3 uColorB;
varying vec3 vColor;
varying float vAlpha;
void main() {
  float seed = aMeta.x;
  float t = smoothstep(0.0, 1.0, clamp(uMorph * 1.4 - seed * 0.4, 0.0, 1.0));
  vec3 p = mix(aFrom, aTo, t);
  float travel = sin(t * 3.14159265);
  float phase = seed * 62.83185;
  vec3 drift = vec3(sin(phase + uTime * 0.43), cos(phase * 1.7 + uTime * 0.31), sin(phase * 2.3 + uTime * 0.39));
  p += drift * (0.012 + uEnergy * 0.028 + travel * 0.85);
  float angle = sin(uTime * 0.13) * 0.12 + uPointer.x * 0.055;
  p.xz = mat2(cos(angle), -sin(angle), sin(angle), cos(angle)) * p.xz;
  p.y += sin(uTime * 0.45) * 0.035;
  vec3 explosion = normalize(p + drift * 1.5 + vec3(0.001)) * (1.1 + seed * 3.4);
  float spin = uChaos * (0.7 + seed * 1.5);
  p += explosion * uChaos + drift * uChaos * 0.5;
  p.xy = mat2(cos(spin), -sin(spin), sin(spin), cos(spin)) * p.xy;
  p.xy += uPointer * uChaos * 0.45;
  float perspective = 7.0 / max(3.0, 7.0 - p.z);
  vec2 screen = p.xy * uScale * perspective + uCenter;
  gl_Position = vec4(screen.x / uResolution.x * 2.0 - 1.0, screen.y / uResolution.y * 2.0 - 1.0, 0.0, 1.0);
  gl_PointSize = (1.8 + aMeta.y * 1.4) * uDpr * perspective;
  float colorPosition = clamp(0.5 + p.x * 0.15 + p.y * 0.13 + sin(seed * 12.0) * 0.17, 0.0, 1.0);
  vColor = mix(uColorA, uColorB, colorPosition);
  float light = 0.60 + smoothstep(-1.5, 1.5, p.z) * 0.4;
  vAlpha = (0.25 + aMeta.y * 0.5) * light;
  if (aMeta.z > 0.5) {
    gl_Position = vec4(aFrom.xy, 0.0, 1.0);
    gl_PointSize = (0.6 + aMeta.y * 1.1) * uDpr;
    vColor = mix(vec3(0.6, 0.6, 0.8), uColorB, 0.25);
    vAlpha = (0.08 + aMeta.y * 0.2) * (0.7 + 0.3 * sin(uTime * 0.5 + phase));
  }
}`;
const fragmentSource = `
precision mediump float;
varying vec3 vColor;
varying float vAlpha;
void main() {
  float r = length(gl_PointCoord - 0.5) * 2.0;
  if (r > 1.0) discard;
  float glow = pow(1.0 - r, 1.45);
  gl_FragColor = vec4(vColor, glow * vAlpha);
}`;

export class ParticleRenderer {
  private gl: WebGLRenderingContext;
  private program: WebGLProgram;
  private fromBuffer: WebGLBuffer;
  private toBuffer: WebGLBuffer;
  private from: Float32Array;
  private target: Float32Array;
  private meta: Float32Array;
  private morph = 1;
  private time = 0;
  private chaos = 0;
  private starCount = 500;
  private uniforms = new Map<string, WebGLUniformLocation | null>();
  private palette: PaletteName = "dusk";
  private pointer = { x: 0, y: 0 };
  energy = 0.35;
  scattering = false;
  paused = false;
  focused = false;
  available = true;
  onContextLost: (() => void) | undefined;
  onContextRestored: (() => void) | undefined;

  constructor(
    readonly canvas: HTMLCanvasElement,
    initial: Float32Array,
  ) {
    const gl = canvas.getContext("webgl", {
      alpha: false,
      antialias: false,
      preserveDrawingBuffer: true,
      powerPreference: "high-performance",
    });
    if (!gl) {
      throw new Error("WebGL is not available.");
    }
    this.gl = gl;
    this.program = this.buildProgram();
    this.fromBuffer = this.createBuffer();
    this.toBuffer = this.createBuffer();
    this.from = this.withStars(initial);
    this.target = this.from.slice();
    const random = randomGenerator(97);
    this.meta = new Float32Array((PARTICLE_COUNT + this.starCount) * 3);
    for (let i = 0; i < PARTICLE_COUNT + this.starCount; i++) {
      this.meta[i * 3] = random();
      this.meta[i * 3 + 1] = random();
      this.meta[i * 3 + 2] = i >= PARTICLE_COUNT ? 1 : 0;
    }
    this.setup();
    canvas.addEventListener("webglcontextlost", (event) => {
      event.preventDefault();
      this.available = false;
      this.onContextLost?.();
    });
    canvas.addEventListener("webglcontextrestored", () => {
      this.program = this.buildProgram();
      this.fromBuffer = this.createBuffer();
      this.toBuffer = this.createBuffer();
      this.uniforms.clear();
      this.setup();
      this.available = true;
      this.onContextRestored?.();
    });
  }

  private createBuffer(): WebGLBuffer {
    const buffer = this.gl.createBuffer();
    if (!buffer) {
      throw new Error("Unable to allocate particle memory.");
    }
    return buffer;
  }

  private buildProgram(): WebGLProgram {
    const gl = this.gl;
    const compile = (type: number, source: string) => {
      const shader = gl.createShader(type);
      if (!shader) {
        throw new Error("Unable to create the particle shader.");
      }
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const message = gl.getShaderInfoLog(shader) ?? "Particle shader compilation failed.";
        gl.deleteShader(shader);
        throw new Error(message);
      }
      return shader;
    };
    const program = gl.createProgram();
    if (!program) {
      throw new Error("Unable to initialize the particle renderer.");
    }
    const vertex = compile(gl.VERTEX_SHADER, vertexSource);
    const fragment = compile(gl.FRAGMENT_SHADER, fragmentSource);
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(program) ?? "Particle shader link failed.");
    }
    return program;
  }

  private setup() {
    const gl = this.gl;
    gl.useProgram(this.program);
    this.attribute("aFrom", this.fromBuffer, this.from);
    this.attribute("aTo", this.toBuffer, this.target);
    this.attribute("aMeta", this.createBuffer(), this.meta);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    gl.disable(gl.DEPTH_TEST);
    gl.clearColor(0.063, 0.063, 0.078, 1);
  }

  private attribute(name: string, buffer: WebGLBuffer, data: Float32Array) {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    const location = gl.getAttribLocation(this.program, name);
    gl.enableVertexAttribArray(location);
    gl.vertexAttribPointer(location, 3, gl.FLOAT, false, 0, 0);
  }

  private uniform(name: string): WebGLUniformLocation | null {
    if (!this.uniforms.has(name)) {
      this.uniforms.set(name, this.gl.getUniformLocation(this.program, name));
    }
    return this.uniforms.get(name) ?? null;
  }

  private withStars(data: Float32Array): Float32Array {
    const result = new Float32Array((PARTICLE_COUNT + this.starCount) * 3);
    result.set(data);
    const random = randomGenerator(111);
    for (let i = PARTICLE_COUNT; i < PARTICLE_COUNT + this.starCount; i++) {
      result[i * 3] = random() * 2 - 1;
      result[i * 3 + 1] = random() * 2 - 1;
    }
    return result;
  }

  setForm(data: Float32Array) {
    // Snapshot each particle's interpolated position so rapid clicks remain continuous.
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const t = Math.max(0, Math.min(1, this.morph * 1.4 - (this.meta[i * 3] ?? 0) * 0.4));
      const eased = t * t * (3 - 2 * t);
      for (let axis = 0; axis < 3; axis++) {
        const j = i * 3 + axis;
        this.from[j] = (this.from[j] ?? 0) * (1 - eased) + (this.target[j] ?? 0) * eased;
      }
    }
    this.target = this.withStars(data);
    this.attribute("aFrom", this.fromBuffer, this.from);
    this.attribute("aTo", this.toBuffer, this.target);
    this.morph = this.paused ? 1 : 0;
  }

  setPalette(palette: PaletteName) {
    this.palette = palette;
  }

  setPointer(x: number, y: number) {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.x = ((x - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = 1 - ((y - rect.top) / rect.height) * 2;
  }

  render(dt: number, forcedChaos?: number): number {
    if (!this.available) {
      return this.chaos;
    }
    const gl = this.gl;
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.round(rect.width * dpr);
    const height = Math.round(rect.height * dpr);
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
      gl.viewport(0, 0, width, height);
    }
    if (!this.paused) {
      this.time += dt * (0.35 + this.energy * 1.6);
      this.morph = Math.min(1, this.morph + dt * 0.6);
      const targetChaos = forcedChaos ?? (this.scattering ? 1 : 0);
      this.chaos +=
        (targetChaos - this.chaos) * (1 - Math.exp(-dt * (targetChaos > this.chaos ? 2.6 : 1.8)));
    }
    const mobile = rect.width <= 600;
    const tablet = rect.width <= 900;
    const centerX = this.focused ? 0.5 : mobile ? 0.49 : 0.66;
    const centerY = this.focused ? 0.5 : mobile ? 0.61 : tablet ? 0.57 : 0.55;
    const scale = this.focused
      ? Math.min(rect.width / 7.6, rect.height / 7.6)
      : mobile
        ? rect.width / 7.8
        : Math.min(rect.height / 7.0, rect.width / 11.8);
    const color = palettes[this.palette];
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform1f(this.uniform("uTime"), this.time);
    gl.uniform1f(this.uniform("uMorph"), this.morph);
    gl.uniform1f(this.uniform("uChaos"), this.chaos);
    gl.uniform1f(this.uniform("uEnergy"), this.energy);
    gl.uniform1f(this.uniform("uDpr"), dpr);
    gl.uniform2f(this.uniform("uPointer"), this.pointer.x, this.pointer.y);
    gl.uniform2f(this.uniform("uResolution"), rect.width, rect.height);
    gl.uniform2f(this.uniform("uCenter"), rect.width * centerX, rect.height * centerY);
    gl.uniform1f(this.uniform("uScale"), scale);
    gl.uniform3fv(this.uniform("uColorA"), color.a);
    gl.uniform3fv(this.uniform("uColorB"), color.b);
    gl.drawArrays(gl.POINTS, 0, PARTICLE_COUNT + this.starCount);
    return this.chaos;
  }
}
