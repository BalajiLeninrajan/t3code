/**
 * Ghostty custom-shader support for the web terminal.
 *
 * Ghostty runs Shadertoy-style `mainImage` shaders as a post-process over the
 * rendered terminal. The Canvas 2D frame this renderer already produces plays
 * the role of `iChannel0`, and a WebGL2 overlay runs the same shader chain over
 * it, so a user's `custom-shader` looks the same in the app as in their
 * terminal. Everything here is best effort: an unavailable context or a shader
 * that fails to compile leaves the plain Canvas 2D output on screen.
 */

export interface GhosttyShaderSource {
  /** Host path, used only for diagnostics. */
  readonly path: string;
  readonly source: string;
}

export interface GhosttyShaderCursorRect {
  /** Left edge in drawing-buffer pixels. */
  readonly x: number;
  /** Top edge in drawing-buffer pixels, measured from the bottom like gl_FragCoord. */
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface GhosttyShaderFrame {
  readonly timeMs: number;
  /** Whether the terminal repainted; animation-only frames reuse the texture. */
  readonly sourceChanged: boolean;
  readonly cursor: GhosttyShaderCursorRect;
  readonly previousCursor: GhosttyShaderCursorRect;
  readonly cursorChangedAtMs: number;
  readonly cursorColor: readonly [number, number, number, number];
  readonly previousCursorColor: readonly [number, number, number, number];
}

const VERTEX_SHADER = `#version 300 es
void main() {
  // Full-screen triangle: no attributes, no buffers, no state to restore.
  vec2 vertices[3] = vec2[3](vec2(-1.0, -1.0), vec2(3.0, -1.0), vec2(-1.0, 3.0));
  gl_Position = vec4(vertices[gl_VertexID], 0.0, 1.0);
}
`;

const FRAGMENT_PREAMBLE = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;

uniform vec3 iResolution;
uniform float iTime;
uniform float iTimeDelta;
uniform float iFrameRate;
uniform int iFrame;
uniform vec4 iMouse;
uniform vec4 iDate;
uniform float iSampleRate;
uniform sampler2D iChannel0;
uniform sampler2D iChannel1;
uniform sampler2D iChannel2;
uniform sampler2D iChannel3;
uniform vec3 iChannelResolution[4];
uniform float iChannelTime[4];
uniform vec4 iCurrentCursor;
uniform vec4 iPreviousCursor;
uniform vec4 iCurrentCursorColor;
uniform vec4 iPreviousCursorColor;
uniform float iTimeCursorChange;

out vec4 t3GhosttyFragColor;

#define texture2D texture
`;

const SHADER_UNIFORM_REFERENCE =
  /\b(?:iResolution|iTime|iTimeDelta|iFrameRate|iFrame|iMouse|iDate|iSampleRate|iChannel[0-3]|iChannelResolution|iChannelTime|iCurrentCursor|iPreviousCursor|iCurrentCursorColor|iPreviousCursorColor|iTimeCursorChange)\b/;

const GLOBAL_DECLARATION =
  /^((?:(?:highp|mediump|lowp)\s+)?(?:float|int|uint|bool|vec[234]|ivec[234]|uvec[234]|bvec[234]|mat[234](?:x[234])?)\s+[A-Za-z_]\w*)\s*=\s*([\s\S]+)$/;

/** Length of the comments and whitespace that open a statement. */
function leadingTriviaLength(text: string): number {
  let index = 0;
  while (index < text.length) {
    const character = text[index]!;
    if (/\s/.test(character)) {
      index += 1;
      continue;
    }
    if (character === "/" && text[index + 1] === "/") {
      const end = text.indexOf("\n", index);
      if (end === -1) return text.length;
      index = end + 1;
      continue;
    }
    if (character === "/" && text[index + 1] === "*") {
      const end = text.indexOf("*/", index);
      if (end === -1) return text.length;
      index = end + 2;
      continue;
    }
    return index;
  }
  return index;
}

/**
 * Move globals initialized from a uniform into the entry point.
 *
 * Ghostty's shader runtime accepts `vec4 TRAIL_COLOR = iCurrentCursorColor;` at
 * file scope, which is how cursor-trail shaders are usually written, while GLSL
 * ES requires a constant initializer there. Splitting the declaration from its
 * assignment keeps those shaders compiling with identical behavior.
 */
export function hoistUniformInitializedGlobals(source: string): {
  readonly source: string;
  readonly prelude: string;
} {
  const replacements: Array<{ start: number; end: number; text: string; assignment: string }> = [];
  let index = 0;
  let depth = 0;
  let statementStart = 0;

  while (index < source.length) {
    const character = source[index]!;
    if (character === "/" && source[index + 1] === "/") {
      const end = source.indexOf("\n", index);
      index = end === -1 ? source.length : end + 1;
      continue;
    }
    if (character === "/" && source[index + 1] === "*") {
      const end = source.indexOf("*/", index);
      index = end === -1 ? source.length : end + 2;
      continue;
    }
    if (character === "#" && (index === 0 || source[index - 1] === "\n")) {
      const end = source.indexOf("\n", index);
      index = end === -1 ? source.length : end + 1;
      statementStart = index;
      continue;
    }
    if (character === "{" || character === "(" || character === "[") {
      depth += 1;
    } else if (character === "}" || character === ")" || character === "]") {
      depth = Math.max(0, depth - 1);
      if (depth === 0 && character === "}") statementStart = index + 1;
    } else if (character === ";" && depth === 0) {
      const declarationStart =
        statementStart + leadingTriviaLength(source.slice(statementStart, index));
      const declaration = source.slice(declarationStart, index);
      const match = GLOBAL_DECLARATION.exec(declaration);
      if (match && SHADER_UNIFORM_REFERENCE.test(match[2]!)) {
        replacements.push({
          start: declarationStart,
          end: index,
          text: match[1]!,
          assignment: `${match[1]!.split(/\s+/).at(-1)!} = ${match[2]!.trim()};`,
        });
      }
      statementStart = index + 1;
    }
    index += 1;
  }

  if (replacements.length === 0) return { source, prelude: "" };

  let rewritten = "";
  let cursor = 0;
  for (const replacement of replacements) {
    rewritten += source.slice(cursor, replacement.start) + replacement.text;
    cursor = replacement.end;
  }
  rewritten += source.slice(cursor);
  return {
    source: rewritten,
    prelude: replacements.map((replacement) => replacement.assignment).join("\n  "),
  };
}

/** GLSL ES 3.00 built-in functions, which a shader may not redeclare. */
const GLSL_BUILTIN_FUNCTIONS = new Set([
  "radians",
  "degrees",
  "sin",
  "cos",
  "tan",
  "asin",
  "acos",
  "atan",
  "sinh",
  "cosh",
  "tanh",
  "asinh",
  "acosh",
  "atanh",
  "pow",
  "exp",
  "log",
  "exp2",
  "log2",
  "sqrt",
  "inversesqrt",
  "abs",
  "sign",
  "floor",
  "trunc",
  "round",
  "roundEven",
  "ceil",
  "fract",
  "mod",
  "modf",
  "min",
  "max",
  "clamp",
  "mix",
  "step",
  "smoothstep",
  "isnan",
  "isinf",
  "floatBitsToInt",
  "floatBitsToUint",
  "intBitsToFloat",
  "uintBitsToFloat",
  "packSnorm2x16",
  "unpackSnorm2x16",
  "packUnorm2x16",
  "unpackUnorm2x16",
  "packHalf2x16",
  "unpackHalf2x16",
  "length",
  "distance",
  "dot",
  "cross",
  "normalize",
  "faceforward",
  "reflect",
  "refract",
  "matrixCompMult",
  "outerProduct",
  "transpose",
  "determinant",
  "inverse",
  "lessThan",
  "lessThanEqual",
  "greaterThan",
  "greaterThanEqual",
  "equal",
  "notEqual",
  "any",
  "all",
  "not",
  "textureSize",
  "texture",
  "textureProj",
  "textureLod",
  "textureOffset",
  "texelFetch",
  "texelFetchOffset",
  "textureProjOffset",
  "textureLodOffset",
  "textureProjLod",
  "textureProjLodOffset",
  "textureGrad",
  "textureGradOffset",
  "textureProjGrad",
  "textureProjGradOffset",
  "dFdx",
  "dFdy",
  "fwidth",
  "texture2D",
  "textureCube",
]);

/** Index of the `)` closing the `(` at `open`, or -1 when unbalanced. */
function matchingParen(source: string, open: number): number {
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    const character = source[index];
    if (character === "(") depth += 1;
    else if (character === ")") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function argumentCount(source: string, open: number, close: number): number {
  const inner = source.slice(open + 1, close);
  if (inner.trim().length === 0) return 0;
  let depth = 0;
  let count = 1;
  for (const character of inner) {
    if (character === "(" || character === "[") depth += 1;
    else if (character === ")" || character === "]") depth -= 1;
    else if (character === "," && depth === 0) count += 1;
  }
  return count;
}

/**
 * Rename shader functions that shadow a GLSL built-in.
 *
 * Desktop GLSL lets a shader add an overload like `vec2 normalize(vec2, float)`
 * — the form cursor-trail shaders use — while GLSL ES rejects redeclaring a
 * built-in name outright. Only calls with the same argument count are renamed,
 * so genuine uses of the built-in still resolve to the built-in.
 */
export function renameBuiltinOverloads(source: string): string {
  const occurrences: Array<{ start: number; end: number; name: string; args: number }> = [];
  const definitions = new Map<string, Set<number>>();
  const pattern = /\b([A-Za-z_]\w*)\s*\(/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source)) !== null) {
    const name = match[1]!;
    if (!GLSL_BUILTIN_FUNCTIONS.has(name)) continue;
    const open = match.index + match[0].length - 1;
    const close = matchingParen(source, open);
    if (close === -1) continue;
    const args = argumentCount(source, open, close);
    occurrences.push({ start: match.index, end: match.index + name.length, name, args });
    // Only a body proves a definition; a prototype is indistinguishable from a
    // call statement, and gets renamed anyway once its arity is known.
    if (/^\s*\{/.test(source.slice(close + 1))) {
      const arities = definitions.get(name) ?? new Set<number>();
      arities.add(args);
      definitions.set(name, arities);
    }
  }
  if (definitions.size === 0) return source;

  let rewritten = "";
  let cursor = 0;
  for (const occurrence of occurrences) {
    if (!definitions.get(occurrence.name)?.has(occurrence.args)) continue;
    rewritten += source.slice(cursor, occurrence.start);
    rewritten += `t3GhosttyShadowed_${occurrence.name}_${occurrence.args}`;
    cursor = occurrence.end;
  }
  return rewritten + source.slice(cursor);
}

/**
 * Wrap a Ghostty custom shader in the uniforms and entry point Ghostty itself
 * supplies. `mainImage` receives the terminal frame pre-loaded into `fragColor`
 * the way Ghostty's runtime does, so shaders that only blend on top still show
 * the terminal.
 */
export function composeGhosttyShaderSource(source: string): string {
  const prepared = hoistUniformInitializedGlobals(renameBuiltinOverloads(source));
  return `${FRAGMENT_PREAMBLE}
${prepared.source}

void main() {
  ${prepared.prelude}
  vec4 color = texture(iChannel0, gl_FragCoord.xy / iResolution.xy);
  mainImage(color, gl_FragCoord.xy);
  t3GhosttyFragColor = color;
}
`;
}

/**
 * Cursor rectangle in the coordinate space Ghostty's shaders expect: pixels of
 * the drawing buffer, with `y` the top edge measured up from the bottom.
 */
export function ghosttyShaderCursorRect(input: {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
  readonly canvasHeight: number;
  readonly scale: number;
}): GhosttyShaderCursorRect {
  return {
    x: input.left * input.scale,
    y: input.canvasHeight - input.top * input.scale,
    width: input.width * input.scale,
    height: input.height * input.scale,
  };
}

function compileShader(
  gl: WebGL2RenderingContext,
  type: number,
  source: string,
  label: string,
): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.warn(
      `[ghostty] custom shader failed to compile (${label})`,
      gl.getShaderInfoLog(shader),
    );
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function linkProgram(
  gl: WebGL2RenderingContext,
  fragmentSource: string,
  label: string,
): WebGLProgram | null {
  const vertex = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER, `${label}:vertex`);
  if (!vertex) return null;
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource, label);
  if (!fragment) {
    gl.deleteShader(vertex);
    return null;
  }
  const program = gl.createProgram();
  if (!program) {
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    return null;
  }
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  // The shaders are owned by the program once attached, so they can be released
  // immediately regardless of whether the link succeeded.
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.warn(
      `[ghostty] custom shader failed to link (${label})`,
      gl.getProgramInfoLog(program),
    );
    gl.deleteProgram(program);
    return null;
  }
  return program;
}

interface ShaderPass {
  readonly program: WebGLProgram;
  readonly uniforms: Readonly<Record<string, WebGLUniformLocation | null>>;
}

const UNIFORM_NAMES = [
  "iResolution",
  "iTime",
  "iTimeDelta",
  "iFrameRate",
  "iFrame",
  "iMouse",
  "iDate",
  "iSampleRate",
  "iChannel0",
  "iChannelResolution[0]",
  "iChannelTime[0]",
  "iCurrentCursor",
  "iPreviousCursor",
  "iCurrentCursorColor",
  "iPreviousCursorColor",
  "iTimeCursorChange",
] as const;

export class GhosttyShaderPipeline {
  private readonly gl: WebGL2RenderingContext;
  private readonly canvas: HTMLCanvasElement;
  private readonly passes: readonly ShaderPass[];
  private readonly sourceTexture: WebGLTexture;
  private readonly framebuffer: WebGLFramebuffer | null;
  private readonly intermediateTextures: WebGLTexture[] = [];
  private readonly startedAtMs: number;
  private width = 0;
  private height = 0;
  private frameIndex = 0;
  private lastFrameMs: number;
  private disposed = false;

  private constructor(
    canvas: HTMLCanvasElement,
    gl: WebGL2RenderingContext,
    passes: readonly ShaderPass[],
    sourceTexture: WebGLTexture,
    framebuffer: WebGLFramebuffer | null,
    startedAtMs: number,
  ) {
    this.canvas = canvas;
    this.gl = gl;
    this.passes = passes;
    this.sourceTexture = sourceTexture;
    this.framebuffer = framebuffer;
    this.startedAtMs = startedAtMs;
    this.lastFrameMs = startedAtMs;
  }

  /** Returns null when WebGL2 is unavailable or no shader in the chain compiles. */
  static create(
    canvas: HTMLCanvasElement,
    shaders: readonly GhosttyShaderSource[],
    startedAtMs: number,
  ): GhosttyShaderPipeline | null {
    if (shaders.length === 0) return null;
    let gl: WebGL2RenderingContext | null = null;
    try {
      gl = canvas.getContext("webgl2", {
        alpha: false,
        antialias: false,
        depth: false,
        stencil: false,
        premultipliedAlpha: false,
        preserveDrawingBuffer: false,
      });
    } catch {
      return null;
    }
    if (!gl) return null;

    const passes: ShaderPass[] = [];
    for (const shader of shaders) {
      const program = linkProgram(gl, composeGhosttyShaderSource(shader.source), shader.path);
      if (!program) continue;
      const uniforms: Record<string, WebGLUniformLocation | null> = {};
      for (const name of UNIFORM_NAMES) uniforms[name] = gl.getUniformLocation(program, name);
      passes.push({ program, uniforms });
    }
    if (passes.length === 0) return null;

    const sourceTexture = gl.createTexture();
    if (!sourceTexture) {
      for (const pass of passes) gl.deleteProgram(pass.program);
      return null;
    }
    gl.bindTexture(gl.TEXTURE_2D, sourceTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    // Only a chain longer than one pass needs somewhere to put intermediate output.
    const framebuffer = passes.length > 1 ? gl.createFramebuffer() : null;
    return new GhosttyShaderPipeline(canvas, gl, passes, sourceTexture, framebuffer, startedAtMs);
  }

  render(source: HTMLCanvasElement, frame: GhosttyShaderFrame): void {
    if (this.disposed) return;
    const gl = this.gl;
    const width = source.width;
    const height = source.height;
    if (width === 0 || height === 0) return;
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    const resized = width !== this.width || height !== this.height;
    if (resized) {
      this.width = width;
      this.height = height;
      this.resizeIntermediateTextures();
    }

    // Uploading the whole grid every animated frame is the expensive part, and
    // an idle terminal under an animating shader has nothing new to upload.
    if (frame.sourceChanged || resized || this.frameIndex === 0) {
      gl.bindTexture(gl.TEXTURE_2D, this.sourceTexture);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    }

    const timeSeconds = (frame.timeMs - this.startedAtMs) / 1000;
    const deltaSeconds = Math.max(0, (frame.timeMs - this.lastFrameMs) / 1000);
    this.lastFrameMs = frame.timeMs;
    gl.viewport(0, 0, width, height);
    gl.disable(gl.BLEND);
    gl.disable(gl.DEPTH_TEST);

    let input = this.sourceTexture;
    for (const [index, pass] of this.passes.entries()) {
      const last = index === this.passes.length - 1;
      const output = last ? null : this.intermediateTextures[index];
      if (!last && (!output || !this.framebuffer)) break;
      if (last || !this.framebuffer) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      } else {
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
        gl.framebufferTexture2D(
          gl.FRAMEBUFFER,
          gl.COLOR_ATTACHMENT0,
          gl.TEXTURE_2D,
          output ?? null,
          0,
        );
      }

      gl.useProgram(pass.program);
      const uniforms = pass.uniforms;
      gl.uniform3f(uniforms.iResolution ?? null, width, height, 1);
      gl.uniform1f(uniforms.iTime ?? null, timeSeconds);
      gl.uniform1f(uniforms.iTimeDelta ?? null, deltaSeconds);
      gl.uniform1f(uniforms.iFrameRate ?? null, deltaSeconds > 0 ? 1 / deltaSeconds : 60);
      gl.uniform1i(uniforms.iFrame ?? null, this.frameIndex);
      gl.uniform4f(uniforms.iMouse ?? null, 0, 0, 0, 0);
      gl.uniform4f(uniforms.iDate ?? null, 0, 0, 0, timeSeconds);
      gl.uniform1f(uniforms.iSampleRate ?? null, 44_100);
      gl.uniform3f(uniforms["iChannelResolution[0]"] ?? null, width, height, 1);
      gl.uniform1f(uniforms["iChannelTime[0]"] ?? null, timeSeconds);
      gl.uniform4f(
        uniforms.iCurrentCursor ?? null,
        frame.cursor.x,
        frame.cursor.y,
        frame.cursor.width,
        frame.cursor.height,
      );
      gl.uniform4f(
        uniforms.iPreviousCursor ?? null,
        frame.previousCursor.x,
        frame.previousCursor.y,
        frame.previousCursor.width,
        frame.previousCursor.height,
      );
      gl.uniform4f(uniforms.iCurrentCursorColor ?? null, ...frame.cursorColor);
      gl.uniform4f(uniforms.iPreviousCursorColor ?? null, ...frame.previousCursorColor);
      gl.uniform1f(
        uniforms.iTimeCursorChange ?? null,
        (frame.cursorChangedAtMs - this.startedAtMs) / 1000,
      );

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, input);
      gl.uniform1i(uniforms.iChannel0 ?? null, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (!last && output) input = output;
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.frameIndex += 1;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    const gl = this.gl;
    for (const pass of this.passes) gl.deleteProgram(pass.program);
    for (const texture of this.intermediateTextures) gl.deleteTexture(texture);
    this.intermediateTextures.length = 0;
    gl.deleteTexture(this.sourceTexture);
    if (this.framebuffer) gl.deleteFramebuffer(this.framebuffer);
    gl.getExtension("WEBGL_lose_context")?.loseContext();
  }

  private resizeIntermediateTextures(): void {
    const gl = this.gl;
    const needed = Math.max(0, this.passes.length - 1);
    while (this.intermediateTextures.length > needed) {
      const texture = this.intermediateTextures.pop();
      if (texture) gl.deleteTexture(texture);
    }
    while (this.intermediateTextures.length < needed) {
      const texture = gl.createTexture();
      if (!texture) break;
      this.intermediateTextures.push(texture);
    }
    for (const texture of this.intermediateTextures) {
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        this.width,
        this.height,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        null,
      );
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    }
  }
}
