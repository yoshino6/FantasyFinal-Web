import { gameAssetUrl } from './game-assets';
import { MATERIAL_SIDE, MATERIAL_SCALE, MATERIAL_BROAD_SCALE, MATERIAL_GAIN, MATERIAL_BROAD_GAIN, MATERIAL_TINT_LIMIT, MATERIAL_MEAN_GAIN } from './map-surface-quality';
import { prepareSurfaceMaterial } from './map-surface-material';
import { surfaceEcologySeed } from './map-surface-ecology';
import { authorizedSurfaceCells, isPavedSurfaceRegion, SURFACE_GROUND_MATERIAL, surfaceMaterialIndex, surfacePalette, type MapSurfaceScene, type SurfaceCell, type SurfacePoint, type SurfaceTerrainField } from './map-surface';

export type SurfaceGroundView = { cells: readonly SurfaceCell[]; camera: SurfacePoint; viewport: { width: number; height: number }; cellSize: number; z: number; perceptionCells?: readonly SurfaceCell[]; perceptionCenter?: SurfacePoint; perceptionRange?: number };
export const SURFACE_GROUND_GPU_LIMITS = { maskSide: 128, fields: 32, materialSide: MATERIAL_SIDE, dpr: 2, backingSide: 2048, backingPixels: 2_097_152 } as const;
const noiseScales = [7, 19, 5.6, 1.7, 7.4, 1 / 13.5, 1 / 2.7, 8, 11, 8.5, 3.1, 15, 12, 13, 10, 6.5];
type PackedGround = { origin: SurfacePoint; width: number; height: number; mask: Uint16Array; fields: SurfaceTerrainField[]; table: Uint32Array };

/** One integer texel per authorized cell, never a viewport-sized CPU raster. */
export function packSurfaceGroundSnapshot(scene: MapSurfaceScene, cells: readonly SurfaceCell[], z: number): PackedGround | undefined {
  if (scene?.schemaVersion !== 1 || scene.sceneryVersion !== 1 || typeof scene.scopeToken !== 'string' || typeof scene.snapshotId !== 'string' || !Array.isArray(scene.terrainFields) || scene.terrainFields.length > SURFACE_GROUND_GPU_LIMITS.fields || !Number.isSafeInteger(z) || cells.length > 16_384) return;
  const lookup = new Map(scene.terrainFields.filter(field => Number.isSafeInteger(field.regionId) && field.regionId > 0 && typeof field.regionCode === 'string' && Number.isFinite(field.seed)).map(field => [field.regionId, field]));
  const known = authorizedSurfaceCells(scene, cells, z);
  const fields = [...new Set(known.map(cell => cell.regionId!))].map(id => lookup.get(id)!).filter(Boolean).sort((a, b) => a.regionId - b.regionId);
  if (fields.length > SURFACE_GROUND_GPU_LIMITS.fields) return;
  const origin = { x: known.length ? Math.min(...known.map(cell => cell.x)) : 0, y: known.length ? Math.min(...known.map(cell => cell.y)) : 0 };
  const width = known.length ? Math.max(...known.map(cell => cell.x)) - origin.x + 1 : 1, height = known.length ? Math.max(...known.map(cell => cell.y)) - origin.y + 1 : 1;
  if (width > SURFACE_GROUND_GPU_LIMITS.maskSide || height > SURFACE_GROUND_GPU_LIMITS.maskSide) return;
  const indices = new Map(fields.map((field, index) => [field.regionId, index + 1])), mask = new Uint16Array(width * height), conflicts = new Set<number>();
  for (const cell of known) {
    const index = (cell.y - origin.y) * width + cell.x - origin.x, value = indices.get(cell.regionId!)!;
    if (mask[index] && mask[index] !== value) conflicts.add(index);
    mask[index] = value;
  }
  for (const index of conflicts) mask[index] = 0;
  const table = new Uint32Array(Math.max(1, fields.length) * 5 * 4);
  fields.forEach((field, index) => {
    surfacePalette(field.regionCode).forEach((color, column) => table.set([...color, 0], (index * 5 + column) * 4));
    table.set([field.seed >>> 0, surfaceMaterialIndex(field.regionCode), Number(isPavedSurfaceRegion(field.regionCode)), 0], (index * 5 + 4) * 4);
  });
  return { origin, width, height, mask, fields, table };
}

/** Visibility is independent of the neighboring authorized terrain palette. */
export function packSurfacePerceptionMask(scene: MapSurfaceScene, cells: readonly SurfaceCell[], z: number, packed: PackedGround): Uint8Array {
  const mask = new Uint8Array(packed.width * packed.height);
  for (const cell of authorizedSurfaceCells(scene, cells, z)) {
    const x = cell.x - packed.origin.x, y = cell.y - packed.origin.y;
    if (x < 0 || y < 0 || x >= packed.width || y >= packed.height) continue;
    const index = y * packed.width + x, field = packed.mask[index];
    if (field && packed.fields[field - 1]?.regionId === cell.regionId) mask[index] = 1;
  }
  return mask;
}

const vertex = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;
const fragment = `#version 300 es
precision highp float;
precision highp int;
precision highp usampler2D;
precision highp sampler2DArray;
uniform usampler2D uMask;
uniform usampler2D uVisible;
uniform usampler2D uFields;
uniform sampler2DArray uMaterials;
uniform vec2 uResolution, uViewport, uCamera, uCenter;
uniform float uCellSize, uRange;
uniform int uPerception, uExplicitPerception;
uniform ivec2 uMaskSize, uNoiseBase[16];
uniform vec2 uNoisePhase[16];
uniform uint uEcologySeed;
uniform vec4 uMaterialPhase;
uniform vec3 uMeans[6];
out vec4 outColor;
const float scales[16] = float[16](7.0, 19.0, 5.6, 1.7, 7.4, 1.0/13.5, 1.0/2.7, 8.0, 11.0, 8.5, 3.1, 15.0, 12.0, 13.0, 10.0, 6.5);
float lattice(ivec2 p, uint seed) {
  uint h = uint(p.x) * 374761393u ^ uint(p.y) * 668265263u ^ seed;
  h = (h ^ (h >> 13)) * 1274126177u;
  return float(h ^ (h >> 16)) / 4294967295.0;
}
float noiseAt(vec2 p, int octave, uint seed) {
  vec2 q = p / scales[octave] + uNoisePhase[octave], f = fract(q);
  ivec2 b = ivec2(floor(q)) + uNoiseBase[octave];
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(lattice(b, seed), lattice(b + ivec2(1,0), seed), f.x), mix(lattice(b + ivec2(0,1), seed), lattice(b + ivec2(1,1), seed), f.x), f.y);
}
float eased(float t) { t = clamp(t, 0.0, 1.0); return t*t*(3.0-2.0*t); }
uint fieldAt(ivec2 cell) {
  if (any(lessThan(cell, ivec2(0))) || any(greaterThanEqual(cell, uMaskSize))) return 0u;
  return texelFetch(uMask, cell, 0).r;
}
vec3 materialAt(vec2 p, int layer, vec2 phase, float scale) {
  vec2 uv = fract(p / scale + phase);
  vec2 footprint = uViewport / uResolution / (uCellSize * scale);
  return textureGrad(uMaterials, vec3(uv, float(layer)), vec2(footprint.x, 0.0), vec2(0.0, footprint.y)).rgb;
}
vec3 fieldColor(uint id, vec2 p) {
  int row = int(id) - 1;
  uvec4 meta = texelFetch(uFields, ivec2(4, row), 0);
  uint seed = meta.r; int layer = int(meta.g);
  bool paved = meta.b == 1u;
  // These are the same public ecology fields used by the scenery generator.
  // Meadow openings and shaded undergrowth therefore share a coherent ground.
  vec2 warp = vec2(noiseAt(p, 8, uEcologySeed ^ 97u), noiseAt(p, 8, uEcologySeed ^ 193u));
  vec2 w = p + (warp - .5) * 3.4;
  float cover = noiseAt(w, 9, uEcologySeed ^ 7349u) * .72 + noiseAt(w, 10, uEcologySeed ^ 7919u) * .28;
  float moisture = noiseAt(w, 11, uEcologySeed ^ 15823u);
  float fertility = noiseAt(w, 12, uEcologySeed ^ 3217u);
  float canopy = noiseAt(w, 13, uEcologySeed ^ 7253u);
  float rock = noiseAt(w, 14, uEcologySeed ^ 8783u);
  float shade = eased((cover * .65 + fertility * .25 + (1.0-canopy) * .1 - .18) / .64);
  float dry = max(eased((.43-cover)/.28) * .36, eased((rock-.61)/.28) * .28);
  vec3 a = vec3(texelFetch(uFields, ivec2(shade < .5 ? 2 : 0, row), 0).rgb) / 255.0;
  vec3 b = vec3(texelFetch(uFields, ivec2(shade < .5 ? 0 : 1, row), 0).rgb) / 255.0;
  vec3 soil = vec3(texelFetch(uFields, ivec2(3, row), 0).rgb) / 255.0;
  float grain = (noiseAt(p, 5, seed ^ 3217u) - .5) * .8 + (noiseAt(p, 6, seed ^ 7253u) - .5) * 1.4;
  float bend = (noiseAt(p, 7, seed ^ 8783u) - .5) * .28;
  float bare = max(max(eased((.48-cover)/.3)*.8, eased((rock-.62)/.28)*.55), eased((.3-fertility)/.25)*.4);
  float weights[6] = float[6](0.0,0.0,0.0,0.0,0.0,0.0);
  if (paved) weights[5] = 1.0;
  else if (layer == 4) weights[4] = 1.0;
  else if (layer == 1) {
    float undergrowth = .18 + eased((canopy-.28)/.45)*.82;
    weights[0]=(1.0-bare)*(1.0-undergrowth); weights[1]=(1.0-bare)*undergrowth; weights[3]=bare;
  } else if (layer == 2) {
    float wet=.18+eased((moisture-.28)/.5)*.82, soilMix=bare*.65;
    weights[0]=(1.0-soilMix)*(1.0-wet); weights[2]=(1.0-soilMix)*wet; weights[3]=soilMix;
  } else if (layer == 3 || layer == 5) {
    float grass=eased((cover-.48)/.3)*eased((fertility-.3)/.4)*(layer==3?.4:.32);
    weights[0]=grass; weights[layer]=1.0-grass;
  } else { weights[0]=1.0-bare; weights[3]=bare; }
  vec3 detail=vec3(0), mean=vec3(0);
  for (int i=0;i<6;i++) if(weights[i]>0.0) {
    detail+=materialAt(p + vec2(bend, -bend) * ${MATERIAL_SCALE.toFixed(6)}, i, uMaterialPhase.xy, ${MATERIAL_SCALE.toFixed(6)})*weights[i];
    mean+=uMeans[i]*weights[i];
  }
  vec3 broad = materialAt(p, layer, uMaterialPhase.zw + vec2(.37,.71), ${MATERIAL_BROAD_SCALE.toFixed(6)});
  vec3 fineDelta = detail - mean, broadDelta = broad - uMeans[layer];
  if (paved) {
    fineDelta = vec3(dot(fineDelta, vec3(.2126,.7152,.0722)));
    broadDelta = vec3(dot(broadDelta, vec3(.2126,.7152,.0722)));
  }
  vec3 tint = clamp(fineDelta * ${MATERIAL_GAIN.toFixed(6)} + broadDelta * ${MATERIAL_BROAD_GAIN.toFixed(6)}, vec3(-${MATERIAL_TINT_LIMIT.toFixed(6)}/255.0), vec3(${MATERIAL_TINT_LIMIT.toFixed(6)}/255.0));
  return clamp(mix(mix(a, b, shade < .5 ? shade * 2.0 : (shade-.5)*2.0), soil, dry) + grain / 255.0 + tint + (mean-uMeans[layer])*${MATERIAL_MEAN_GAIN.toFixed(6)}, 0.0, 1.0);
}
void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;
  vec2 p = uCamera + (uv - .5) * uViewport / uCellSize;
  if (any(lessThan(p,vec2(-.5))) || any(greaterThanEqual(p,vec2(uMaskSize)-.5))) { outColor=vec4(0.0); return; }
  ivec2 cell = ivec2(floor(p + .5));
  // No terrain or material lookup occurs for an unauthorized fragment.
  if (fieldAt(cell) == 0u) { outColor = vec4(0.0); return; }
  if (uExplicitPerception == 1 && texelFetch(uVisible, cell, 0).r == 0u) { outColor = vec4(0.0); return; }
  uint ids[9]; float weights[9]; int count = 0;
  float edge = 1.0;
  // Shared world-space ecotone wobble, bounded to .14 cell per axis. Keep
  // unknown-cell distance on actual p so this can never widen perception.
  vec2 blend = p + (vec2(noiseAt(p, 10, uEcologySeed ^ 59393u), noiseAt(p, 10, uEcologySeed ^ 91193u)) - .5) * .28;
  for (int y=-1; y<=1; y++) for (int x=-1; x<=1; x++) {
    ivec2 neighbour = cell + ivec2(x,y); uint id = fieldAt(neighbour);
    float distanceToCell = length(max(abs(p - vec2(neighbour)) - .5, 0.0));
    if (id == 0u) { edge = min(edge, distanceToCell); continue; }
    float blendDistance = length(max(abs(blend - vec2(neighbour)) - .5, 0.0));
    float weight = 1.0 - smoothstep(0.0, .48, blendDistance);
    if (weight <= 0.0) continue;
    int slot = count;
    for (int i=0; i<9; i++) { if (i>=count) break; if (ids[i]==id) { slot=i; break; } }
    if (slot==count) { ids[count]=id; weights[count]=weight; count++; }
    else weights[slot]=max(weights[slot],weight);
  }
  vec3 ground = vec3(0); float total = 0.0;
  for (int i=0; i<9; i++) { if(i>=count) break; ground += fieldColor(ids[i],p)*weights[i]; total += weights[i]; }
  float visibility = uExplicitPerception == 1 ? 1.0 : smoothstep(0.0,.46,edge);
  if (uExplicitPerception == 0 && uPerception == 1) visibility *= 1.0-smoothstep(uRange+.10,uRange+.75,abs(p.x-uCenter.x)+abs(p.y-uCenter.y));
  // Both renderers reveal the same independent white mist underneath. Only
  // authorized ground contributes colour; unknown fragments stay transparent.
  outColor = vec4(ground/max(total,.0001),visibility);
}`;

type Resources = { program: WebGLProgram; vao: WebGLVertexArrayObject; mask: WebGLTexture; visible: WebGLTexture; fields: WebGLTexture; materials: WebGLTexture; uniforms: Record<string, WebGLUniformLocation | null> };

/** Independent bottom canvas. A false draw leaves the ordinary Canvas renderer in charge. */
export class MapSurfaceGroundWebGL {
  private gl: WebGL2RenderingContext | null = null;
  private resources?: Resources;
  private materialPixels?: Uint8Array;
  private materialMeans = new Float32Array(18);
  private image?: HTMLImageElement;
  private disposed = false;
  private lost = false;
  private error = '';
  private cached?: { scene: MapSurfaceScene; cells: readonly SurfaceCell[]; z: number; scope: string; snapshot: string; packed: PackedGround };
  private visibleCached?: { packed: PackedGround; key: string; mask: Uint8Array };
  private visibilityUploads = 0;
  private uploads = 0;
  private draws = 0;
  private onLost = (event: Event) => { event.preventDefault(); this.lost = true; this.resources = undefined; this.cached = undefined; this.visibleCached = undefined; this.onReady(); };
  private onRestored = () => { if (!this.disposed) { this.lost = false; this.initialize(); this.onReady(); } };
  constructor(private canvas: HTMLCanvasElement, private onReady: () => void) {
    try {
      this.gl = canvas.getContext('webgl2', { alpha: true, antialias: false, depth: false, stencil: false, premultipliedAlpha: false, preserveDrawingBuffer: false, powerPreference: 'low-power' });
      if (!this.gl) return;
      canvas.addEventListener('webglcontextlost', this.onLost);
      canvas.addEventListener('webglcontextrestored', this.onRestored);
      this.initialize();
      this.image = new Image();
      this.image.onload = () => {
        if (this.disposed) return;
        try {
          const side = SURFACE_GROUND_GPU_LIMITS.materialSide, tile = document.createElement('canvas'); tile.width = tile.height = side;
          const context = tile.getContext('2d'); if (!context) return;
          context.imageSmoothingEnabled = true; context.imageSmoothingQuality = 'high';
          const pixels = new Uint8Array(side * side * 4 * 6);
          for (let layer = 0; layer < 6; layer++) {
            context.clearRect(0, 0, side, side);
            context.drawImage(this.image!, layer % 3 * this.image!.naturalWidth / 3, Math.floor(layer / 3) * this.image!.naturalHeight / 2, this.image!.naturalWidth / 3, this.image!.naturalHeight / 2, 0, 0, side, side);
            const data = prepareSurfaceMaterial(context.getImageData(0, 0, side, side).data, side); pixels.set(data, layer * side * side * 4);
            for (let channel = 0; channel < 3; channel++) { let total = 0; for (let i = channel; i < data.length; i += 4) total += data[i]; this.materialMeans[layer * 3 + channel] = total / (side * side * 255); }
          }
          tile.width = tile.height = 0; this.materialPixels = pixels;
          this.image!.onload = this.image!.onerror = null; this.image = undefined;
          this.uploadMaterials(); this.onReady();
        } catch (error) { this.error = String(error); this.onReady(); }
      };
      this.image.onerror = () => { if (!this.disposed) { this.error = 'Ground material failed to load'; this.onReady(); } };
      this.image.src = gameAssetUrl(SURFACE_GROUND_MATERIAL);
    } catch (error) { this.error = String(error); }
  }
  get diagnostics() { return { ready: !!this.resources && !!this.materialPixels && !this.error && !this.lost && !this.disposed, lost: this.lost, disposed: this.disposed, error: this.error, uploads: this.uploads, visibilityUploads: this.visibilityUploads, visibilityBytes: this.visibleCached?.mask.byteLength ?? 0, draws: this.draws, width: this.canvas.width, height: this.canvas.height, materialSide: MATERIAL_SIDE, materialGpuBytes: (4 * 6 * (MATERIAL_SIDE * MATERIAL_SIDE * 4 - 1) / 3), dataBytes: (this.cached?.packed.mask.byteLength ?? 0) + (this.cached?.packed.table.byteLength ?? 0) + (this.visibleCached?.mask.byteLength ?? 0) + (this.materialPixels?.byteLength ?? 0) }; }
  private releaseResources() {
    if (this.resources && this.gl && !this.lost) { const r = this.resources; this.gl.deleteProgram(r.program); this.gl.deleteVertexArray(r.vao); this.gl.deleteTexture(r.mask); this.gl.deleteTexture(r.visible); this.gl.deleteTexture(r.fields); this.gl.deleteTexture(r.materials); }
    this.resources = undefined;
  }
  private initialize() {
    const gl = this.gl; if (!gl || this.disposed || this.lost) return;
    try {
      const shaders: WebGLShader[] = [];
      const compile = (kind: number, source: string) => {
        const shader = gl.createShader(kind); if (!shader) throw Error('Shader allocation failed');
        shaders.push(shader); gl.shaderSource(shader, source); gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw Error(gl.getShaderInfoLog(shader) ?? 'Shader compilation failed');
        return shader;
      };
      const program = gl.createProgram(); if (!program) throw Error('Program allocation failed');
      try { gl.attachShader(program, compile(gl.VERTEX_SHADER, vertex)); gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragment)); gl.linkProgram(program); if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw Error(gl.getProgramInfoLog(program) ?? 'Program link failed'); }
      catch (error) { gl.deleteProgram(program); throw error; }
      finally { shaders.forEach(shader => gl.deleteShader(shader)); }
      const vao = gl.createVertexArray(), mask = gl.createTexture(), visible = gl.createTexture(), fields = gl.createTexture(), materials = gl.createTexture();
      if (!vao || !mask || !visible || !fields || !materials) { gl.deleteProgram(program); gl.deleteVertexArray(vao); gl.deleteTexture(mask); gl.deleteTexture(visible); gl.deleteTexture(fields); gl.deleteTexture(materials); throw Error('Ground resource allocation failed'); }
      const uniforms: Resources['uniforms'] = {};
      for (const key of ['Mask', 'Visible', 'Fields', 'Materials', 'Resolution', 'Viewport', 'Camera', 'Center', 'CellSize', 'Range', 'Perception', 'ExplicitPerception', 'MaskSize', 'NoiseBase[0]', 'NoisePhase[0]', 'MaterialPhase', 'Means[0]', 'EcologySeed']) uniforms[key] = gl.getUniformLocation(program, `u${key}`);
      this.resources = { program, vao, mask, visible, fields, materials, uniforms }; this.cached = undefined; this.visibleCached = undefined; this.error = '';
      this.texture(visible, gl.TEXTURE_2D, 3); gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8UI, 1, 1, 0, gl.RED_INTEGER, gl.UNSIGNED_BYTE, new Uint8Array(1));
      this.uploadMaterials();
    } catch (error) { this.error = String(error); this.releaseResources(); }
  }
  private texture(texture: WebGLTexture, target: number, unit: number, linear = false) {
    const gl = this.gl!; gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(target, texture);
    gl.texParameteri(target, gl.TEXTURE_MIN_FILTER, linear ? gl.LINEAR_MIPMAP_LINEAR : gl.NEAREST); gl.texParameteri(target, gl.TEXTURE_MAG_FILTER, linear ? gl.LINEAR : gl.NEAREST);
    gl.texParameteri(target, gl.TEXTURE_WRAP_S, linear ? gl.REPEAT : gl.CLAMP_TO_EDGE); gl.texParameteri(target, gl.TEXTURE_WRAP_T, linear ? gl.REPEAT : gl.CLAMP_TO_EDGE);
  }
  private uploadMaterials() {
    if (!this.resources || !this.materialPixels || this.lost || this.disposed) return;
    const gl = this.gl!, side = SURFACE_GROUND_GPU_LIMITS.materialSide;
    this.texture(this.resources.materials, gl.TEXTURE_2D_ARRAY, 2, true);
    gl.texImage3D(gl.TEXTURE_2D_ARRAY, 0, gl.RGBA8, side, side, 6, 0, gl.RGBA, gl.UNSIGNED_BYTE, this.materialPixels);
    gl.generateMipmap(gl.TEXTURE_2D_ARRAY);
    const error = gl.getError(); if (error !== gl.NO_ERROR) throw Error(`Ground material upload failed (${error})`);
  }
  draw(scene: MapSurfaceScene, view: SurfaceGroundView): boolean {
    if (!this.diagnostics.ready || ![view.camera.x, view.camera.y, view.viewport.width, view.viewport.height, view.cellSize].every(Number.isFinite) || view.viewport.width <= 0 || view.viewport.height <= 0 || view.cellSize <= 0 || !scene) return false;
    const gl = this.gl!, resources = this.resources!;
    if (gl.isContextLost()) return false;
    try {
      const { uniforms: u } = resources;
      gl.useProgram(resources.program); gl.bindVertexArray(resources.vao); gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      if (!this.cached || this.cached.scene !== scene || this.cached.cells !== view.cells || this.cached.z !== view.z || this.cached.scope !== scene.scopeToken || this.cached.snapshot !== scene.snapshotId) {
        const packed = packSurfaceGroundSnapshot(scene, view.cells, view.z); if (!packed) return false;
        this.texture(resources.mask, gl.TEXTURE_2D, 0);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.R16UI, packed.width, packed.height, 0, gl.RED_INTEGER, gl.UNSIGNED_SHORT, packed.mask);
        this.texture(resources.fields, gl.TEXTURE_2D, 1);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32UI, 5, Math.max(1, packed.fields.length), 0, gl.RGBA_INTEGER, gl.UNSIGNED_INT, packed.table);
        const error = gl.getError(); if (error !== gl.NO_ERROR) throw Error(`Ground snapshot upload failed (${error})`);
        const bases: number[] = [], phases: number[] = [];
        for (const scale of noiseScales) { const x = packed.origin.x / scale, y = packed.origin.y / scale; bases.push(Math.floor(x) | 0, Math.floor(y) | 0); phases.push(x - Math.floor(x), y - Math.floor(y)); }
        gl.uniform2iv(u['NoiseBase[0]'], bases); gl.uniform2fv(u['NoisePhase[0]'], phases);
        gl.uniform4f(u.MaterialPhase, ((packed.origin.x / MATERIAL_SCALE) % 1 + 1) % 1, ((packed.origin.y / MATERIAL_SCALE) % 1 + 1) % 1, ((packed.origin.x / MATERIAL_BROAD_SCALE) % 1 + 1) % 1, ((packed.origin.y / MATERIAL_BROAD_SCALE) % 1 + 1) % 1);
        gl.uniform2i(u.MaskSize, packed.width, packed.height);
        this.cached = { scene, cells: view.cells, z: view.z, scope: scene.scopeToken, snapshot: scene.snapshotId, packed }; this.uploads++;
      }
      if (view.perceptionCells !== undefined) {
        const packed = this.cached.packed, key = view.perceptionCells.map(cell => `${cell.x},${cell.y},${cell.z ?? view.z},${cell.regionId},${cell.regionCode}`).join(';');
        if (this.visibleCached?.packed !== packed || this.visibleCached.key !== key) {
          const mask = packSurfacePerceptionMask(scene, view.perceptionCells, view.z, packed);
          this.texture(resources.visible, gl.TEXTURE_2D, 3); gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8UI, packed.width, packed.height, 0, gl.RED_INTEGER, gl.UNSIGNED_BYTE, mask);
          const error = gl.getError(); if (error !== gl.NO_ERROR) throw Error(`Ground visibility upload failed (${error})`);
          this.visibleCached = { packed, key, mask }; this.visibilityUploads++;
        }
      }
      const scale = Math.min(SURFACE_GROUND_GPU_LIMITS.dpr, globalThis.devicePixelRatio || 1, SURFACE_GROUND_GPU_LIMITS.backingSide / Math.max(view.viewport.width, view.viewport.height), Math.sqrt(SURFACE_GROUND_GPU_LIMITS.backingPixels / (view.viewport.width * view.viewport.height)));
      const width = Math.max(1, Math.floor(view.viewport.width * scale)), height = Math.max(1, Math.floor(view.viewport.height * scale));
      if (this.canvas.width !== width || this.canvas.height !== height) { this.canvas.width = width; this.canvas.height = height; }
      gl.viewport(0, 0, width, height); gl.disable(gl.BLEND); gl.disable(gl.DEPTH_TEST);
      this.texture(resources.mask, gl.TEXTURE_2D, 0); this.texture(resources.fields, gl.TEXTURE_2D, 1); this.texture(resources.materials, gl.TEXTURE_2D_ARRAY, 2, true); this.texture(resources.visible, gl.TEXTURE_2D, 3);
      gl.uniform1i(u.Mask, 0); gl.uniform1i(u.Fields, 1); gl.uniform1i(u.Materials, 2); gl.uniform1i(u.Visible, 3); gl.uniform1i(u.ExplicitPerception, view.perceptionCells === undefined ? 0 : 1); gl.uniform3fv(u['Means[0]'], this.materialMeans);
      gl.uniform1ui(u.EcologySeed, Number.isSafeInteger(scene.cosmeticEcologySeed) && scene.cosmeticEcologySeed! >= 0 && scene.cosmeticEcologySeed! <= 0xffffffff ? scene.cosmeticEcologySeed! >>> 0 : surfaceEcologySeed(scene.scopeToken));
      gl.uniform2f(u.Resolution, width, height); gl.uniform2f(u.Viewport, view.viewport.width, view.viewport.height); gl.uniform1f(u.CellSize, view.cellSize);
      const origin = this.cached.packed.origin; gl.uniform2f(u.Camera, view.camera.x - origin.x, view.camera.y - origin.y);
      const center = view.perceptionCenter, perception = center && Number.isFinite(center.x) && Number.isFinite(center.y) && Number.isFinite(view.perceptionRange) && view.perceptionRange! >= 0;
      gl.uniform1i(u.Perception, perception ? 1 : 0); gl.uniform2f(u.Center, (center?.x ?? 0) - origin.x, (center?.y ?? 0) - origin.y); gl.uniform1f(u.Range, view.perceptionRange ?? 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3); this.draws++; return true;
    } catch (error) { this.error = String(error); return false; }
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true; this.canvas.removeEventListener('webglcontextlost', this.onLost); this.canvas.removeEventListener('webglcontextrestored', this.onRestored);
    if (this.image) { this.image.onload = this.image.onerror = null; this.image = undefined; }
    this.releaseResources(); this.cached = undefined; this.visibleCached = undefined; this.materialPixels = undefined; this.canvas.width = this.canvas.height = 0;
  }
}
