import { clamp } from "./analysis";

export interface VisualFrame {
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
  intensity: number;
  motion: number;
  grain: boolean;
  flash: boolean;
  loaded: boolean;
}

const vertexSource = `
attribute vec2 position;
void main() { gl_Position = vec4(position, 0., 1.); }
`;

const fragmentSource = `
precision highp float;
uniform vec2 resolution;
uniform float time, progress, bass, mid, high, level, kick, snare, drop, build, drive, beat;
uniform float scene, palette, intensity, motion, grain, flash, loaded;
#define PI 3.14159265359
#define TAU 6.28318530718

float hash(float n) { return fract(sin(n * 127.1) * 43758.5453); }
mat2 rotate(float a) { return mat2(cos(a),-sin(a),sin(a),cos(a)); }
vec3 ink(float n) {
  vec3 a = vec3(.025,.85,1.), b = vec3(1.,.035,.48);
  if (palette > .5 && palette < 1.5) { a = vec3(.55,.12,1.); b = vec3(1.,.24,.025); }
  if (palette > 1.5) { a = vec3(.65,1.,.025); b = vec3(.02,.9,.75); }
  return mix(a,b,.5+.5*sin(n*TAU));
}
float line(float d, float width) {
  return exp(-abs(d)/width) + .20*exp(-abs(d)/(width*12.));
}
float polygon(vec2 p, float sides, float angle) {
  float a = atan(p.y,p.x)+angle;
  return cos(floor(.5+a/(TAU/sides))*(TAU/sides)-a)*length(p);
}
float beam(vec2 p, vec2 origin, vec2 direction, float width) {
  vec2 q = p-origin;
  vec2 n = normalize(direction);
  return line(q.x*n.y-q.y*n.x,width)*smoothstep(0.,.08,dot(q,n));
}
void main() {
  vec2 uv = (gl_FragCoord.xy-resolution*.5)/resolution.y;
  float impact = .35+intensity*1.65;
  float punch = kick*impact;
  float snap = snare*impact;
  float speed = .4+motion*1.8;
  float t = time*speed;
  float flight = drive*speed;
  float phrase = floor(beat/8.);
  float hue = floor(beat/4.)*.21;
  float activity = mix(.9,clamp(max(level,kick*.8)*1.35,0.,1.),loaded);
  float aperture = .14 + .48*activity + .6*punch;
  vec2 shake = vec2(hash(beat)-.5,hash(beat+79.)-.5)*punch*.035*motion;
  vec2 p = (uv+shake)/(1.+punch*.23+drop*.22);
  p = rotate(sin(t*.35)*.04*motion + snap*.035)*p;
  vec3 col = vec3(.001,.002,.007);

  if (scene < .5) {
    // Concert rig: two banks of moving-head lasers, a flying floor, and an LED core.
    vec2 center = vec2(sin(t*.6)*.045,.10+mid*.025);
    vec2 q = p-center;
    float floorDepth = .15/max(-q.y,.007);
    float floorMask = 1.-smoothstep(-.035,.0,q.y);
    float gx = abs(fract(q.x*floorDepth*9.+.5)-.5);
    float gy = abs(fract(floorDepth*5.-flight*1.7)-.5);
    col += ink(.05+hue)*line(gx,.008)*floorMask*min(1.,-q.y*2.)*(.2+bass*.55);
    col += ink(.65+hue)*line(gy,.012)*floorMask*(.1+punch*.9);
    for (int i = 0; i < 12; i++) {
      float fi = float(i);
      float spread = (fi-5.5)*(.105+build*.045);
      float sweep = sin(t*.85+fi*.19+phrase)*.55;
      vec2 left = vec2(-.65,-.39);
      vec2 right = vec2(.65,-.39);
      float bank = beam(p,left,vec2(.55+spread+sweep,.8),.0014);
      bank += beam(p,right,vec2(-.55-spread+sweep,.8),.0014);
      float chase = .2+.8*pow(.5+.5*sin(fi*1.7+beat*1.3),2.);
      col += ink(fi*.09+hue)*bank*chase*aperture*(1.+snap*.6);
    }
    float turn = t*.22+floor(beat/4.)*PI*.25;
    for (int i = 0; i < 4; i++) {
      float fi = float(i);
      float size = .13+fi*.057+bass*.025;
      float edge = polygon(q,6.,turn+fi*.18+kick*.3)-size;
      col += ink(fi*.19+hue)*line(edge,.0022)*(0.28+activity*.35+punch*.8);
    }
    float core = polygon(rotate(-turn*1.7)*q,3.,0.);
    col += ink(hue+.35)*line(core-(.055+mid*.045),.002)*(1.+snap);
    col += ink(hue)*exp(-length(q)*8.)*punch*.38;
    // White hot fixtures anchor the laser fans in space.
    col += vec3(.8,.95,1.)*exp(-length(p-vec2(-.65,-.39))*70.)*(.4+punch);
    col += vec3(1.,.7,.9)*exp(-length(p-vec2(.65,-.39))*70.)*(.4+punch);
    float blinders = exp(-abs(abs(p.x)-.63)*160.)*exp(-abs(p.y)*3.);
    col += vec3(.65,.85,1.)*blinders*snap*2.;
  } else if (scene < 1.5) {
    // A beat-punched flight through polygon gates. Distance advances with the audio.
    vec2 q = rotate(t*.13+floor(beat/8.)*.65)*p;
    q += vec2(sin(t*.65),cos(t*.48))*.045*motion;
    float radius = max(polygon(q,6.,.2),.018);
    float depth = -log(radius)*2.;
    float gate = abs(fract(depth-flight*1.55)-.5);
    float angle = atan(q.y,q.x);
    float ribs = abs(sin(angle*6.+sin(depth*.4+flight*.13)*.45));
    float mask = smoothstep(.018,.09,radius)*(1.-smoothstep(.8,1.4,radius));
    col += ink(depth*.14+hue)*line(gate,.018)*mask*(.35+activity*.5+punch*1.5);
    col += ink(.45+hue)*line(ribs,.014)*mask*(.2+bass*.45);
    float tunnel = abs(fract(depth*.5-flight*.4)-.5);
    col += ink(.8+hue)*line(tunnel,.06)*mask*high*.3;
    col += ink(hue+.2)*exp(-length(q)*17.)*(.4+drop*2.);
    // Light trails pass the camera as the bass pushes it forward.
    for (int i = 0; i < 24; i++) {
      float fi = float(i);
      float a = hash(fi+4.)*TAU + t*.04;
      float r = .04+fract(hash(fi+63.)+flight*(.15+hash(fi)*.1))*1.1;
      vec2 star = vec2(cos(a),sin(a))*r;
      vec2 delta = rotate(-a)*(q-star);
      col += ink(fi*.12+hue)*exp(-abs(delta.y)*700.-abs(delta.x)*35.)*(.18+high+punch*.8);
    }
  } else {
    // Mirrored prism blades, snapping on bars and breathing on every drum hit.
    vec2 q = rotate(t*.22+floor(beat/4.)*PI*.2)*p;
    float radius = length(q);
    float angle = atan(q.y,q.x);
    float sectors = 6.+2.*mod(phrase,3.);
    float folded = abs(mod(angle+PI/sectors,TAU/sectors)-PI/sectors);
    vec2 shard = vec2(cos(folded),sin(folded))*radius;
    for (int i = 0; i < 7; i++) {
      float fi = float(i);
      float offset = .07+fi*.065+bass*.035;
      float blade = shard.y*.9 + shard.x*.36 - offset + sin(t+fi)*.018;
      float facet = abs(shard.x-offset*1.8)-(.025+kick*.035);
      col += ink(fi*.13+hue)*line(blade,.0017)*(.4+activity*.55+punch);
      col += ink(fi*.13+hue+.3)*line(facet,.0012)*exp(-shard.y*5.)*(.2+snap*.9);
    }
    col += ink(hue)*line(polygon(q,3.,-t*.7)-(.17+kick*.08),.003)*(.6+punch);
    col += ink(hue+.4)*pow(max(0.,1.-folded*sectors/PI),18.)*exp(-radius*2.)*high*.32;
  }

  // Expanding shock fronts and a narrow snare sweep across all three rigs.
  float shock = length(p)-(.10+(1.-kick)*.78);
  col += mix(ink(hue+.5),vec3(1.),.4)*line(shock,.004)*kick*impact*.85;
  col += ink(hue)*line(length(p)-(.2+(1.-drop)*1.2),.009)*drop*1.4;
  col += vec3(.7,.9,1.)*line(p.y-(.45-snare*.9),.0015)*snap*.9;
  // Discrete LED strobes are driven by detected transients, never a free-running timer.
  float led = step(.82,fract((uv.x+.9)*24.));
  float top = line(abs(uv.y)-.465,.003);
  col += ink(floor(uv.x*12.)*.1+hue)*led*top*(.15+snap*2.);
  col *= (.055+activity*.945);
  col += flash*(snare*.035+drop*.065)*activity;
  col = vec3(1.)-exp(-col*(1.+intensity*.9));
  col *= 1.-smoothstep(.65,1.25,length(uv))*.35;
  col += (hash(dot(gl_FragCoord.xy,vec2(1.,117.))+floor(time*30.))-.5)*.016*grain*activity;
  float fadeIn = smoothstep(0.,.002,progress);
  float fadeOut = 1.-smoothstep(.985,1.,progress);
  col *= mix(1.,fadeIn*fadeOut,loaded);
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
