import { clamp } from "./analysis";
import type { Choreography } from "./choreography";
import { artistLabel, colorPresets, colorVector, type ShowColors } from "./identity";
import fragmentSource from "./worlds.glsl?raw";

export interface VisualFrame extends Partial<Choreography> {
  time: number;
  progress: number;
  bass: number;
  mid: number;
  high: number;
  level: number;
  kick: number;
  snare: number;
  drop: number;
  build: number;
  drive: number;
  beat: number;
  scene: number;
  palette: number;
  profile?: number;
  footageFrame?: number;
  colors?: ShowColors;
  artist?: string;
  intensity: number;
  motion: number;
  grain: boolean;
  flash: boolean;
  loaded: boolean;
  footage?: HTMLVideoElement | undefined;
}

const vertexSource = `
attribute vec2 position;
void main() { gl_Position = vec4(position, 0., 1.); }
`;

export class Visualizer {
  private readonly gl: WebGLRenderingContext;
  private readonly program: WebGLProgram;
  private readonly buffer: WebGLBuffer;
  private readonly uniforms = new Map<string, WebGLUniformLocation | null>();

  private readonly identityTexture: WebGLTexture;
  private readonly footageTexture: WebGLTexture;
  private readonly titleCanvas = document.createElement("canvas");
  private title = "";
  private lastFrame = "";

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
    const texture = gl.createTexture();
    if (!texture) {
      throw new Error("Could not create artist lettering.");
    }
    const footageTexture = gl.createTexture();
    if (!footageTexture) {
      throw new Error("Could not create animation texture.");
    }
    this.footageTexture = footageTexture;
    gl.bindTexture(gl.TEXTURE_2D, footageTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      1,
      1,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      new Uint8Array([0, 0, 0, 255]),
    );
    this.identityTexture = texture;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.titleCanvas.width = 2048;
    this.titleCanvas.height = 256;
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.titleCanvas);
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
      "mid",
      "high",
      "level",
      "kick",
      "snare",
      "drop",
      "build",
      "drive",
      "beat",
      "flash",
      "scene",
      "profile",
      "titleReveal",
      "titleScatter",
      "titleTravel",
      "primary",
      "secondary",
      "accent",
      "identity",
      "hasIdentity",
      "footage",
      "hasFootage",
      "footageAspect",
      "reachLeft",
      "reachRight",
      "grip",
      "jawOpen",
      "lunge",
      "headTurn",
      "bank",
      "laserCue",
      "laserPhase",
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
      : Math.round(clamp(canvas.clientWidth * Math.min(window.devicePixelRatio, 1.25), 320, 1200));
    const height = Math.round(width / ratio);
    const signature = JSON.stringify([
      frame,
      width,
      height,
      frame.footage?.currentTime,
      frame.footage?.seeking,
    ]);
    if (signature === this.lastFrame) {
      return;
    }
    this.lastFrame = signature;
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    gl.viewport(0, 0, width, height);
    gl.uniform2f(this.uniforms.get("resolution") ?? null, width, height);
    const optional = {
      profile: frame.profile ?? 0,
      reachLeft: frame.reachLeft ?? 0,
      reachRight: frame.reachRight ?? 0,
      grip: frame.grip ?? 0,
      jawOpen: frame.jawOpen ?? 0,
      lunge: frame.lunge ?? 0,
      headTurn: frame.headTurn ?? 0,
      bank: frame.bank ?? 0,
      laserCue: frame.laserCue ?? 0,
      laserPhase: frame.laserPhase ?? 0,
      titleReveal: frame.titleReveal ?? 1,
      titleScatter: frame.titleScatter ?? 0,
      titleTravel: frame.titleTravel ?? 0,
    };
    for (const [key, value] of Object.entries({ ...frame, ...optional })) {
      if (typeof value === "number" || typeof value === "boolean") {
        gl.uniform1f(this.uniforms.get(key) ?? null, Number(value));
      }
    }
    const colors = frame.colors ?? colorPresets[frame.palette]?.colors ?? colorPresets[0]?.colors;
    for (const [i, key] of ["primary", "secondary", "accent"].entries()) {
      gl.uniform3fv(this.uniforms.get(key) ?? null, colorVector(colors?.[i] ?? "#ffffff"));
    }
    const title = artistLabel(frame.artist ?? "");
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.identityTexture);
    if (title !== this.title) {
      const context = this.titleCanvas.getContext("2d");
      if (context) {
        context.clearRect(0, 0, 2048, 256);
        context.font = '900 200px "Arial Black", "Arial", sans-serif';
        context.textAlign = "center";
        context.textBaseline = "middle";
        context.fillStyle = "white";
        const size = Math.min(200, (1920 / Math.max(context.measureText(title).width, 1)) * 200);
        context.font = `900 ${size}px "Arial Black", "Arial", sans-serif`;
        context.fillText(title, 1024, 134);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.titleCanvas);
        this.title = title;
      }
    }
    gl.uniform1i(this.uniforms.get("identity") ?? null, 0);
    gl.uniform1f(this.uniforms.get("hasIdentity") ?? null, title ? 1 : 0);
    const footage = frame.footage;
    const hasFootage = Boolean(footage && footage.readyState >= 2);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.footageTexture);
    if (hasFootage && footage) {
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, footage);
      gl.uniform1f(
        this.uniforms.get("footageAspect") ?? null,
        footage.videoWidth / footage.videoHeight,
      );
    }
    gl.uniform1i(this.uniforms.get("footage") ?? null, 1);
    gl.uniform1f(this.uniforms.get("hasFootage") ?? null, hasFootage ? 1 : 0);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  dispose(): void {
    this.gl.deleteTexture(this.identityTexture);
    this.gl.deleteTexture(this.footageTexture);
    this.gl.deleteBuffer(this.buffer);
    this.gl.deleteProgram(this.program);
  }
}
