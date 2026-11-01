import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { lowMemory } from "../../state/quality";

// 銀河鉄道の車両（本物の蒸気機関車らしい質感にするための部品と材質）。
// 形はこのアプリのオリジナル（特定の作品や実在の形式の写しではない）：1-C-1 の小さめのテンダー機関車と、紺のニス塗りの客車。
// - 材質：煤けた黒い鋼板（継ぎ目・リベットの凹凸、つやのムラ）、黒鉛色の煙室、磨いた鋼のロッド、少しくすんだ真鍮
// - 汚れ：部品の高さと煙突からの距離で、下まわりの土ぼこり・煙室まわりの煤・雨だれのような筋をシェーダーで足す
// - 動き：動輪が道のりに合わせて回り、連結棒・主連棒・クロスヘッドがクランクに合わせて動く
// 止まっている部品は材質ごとに 1 つにまとめる（描く回数を少なく）。前は +Z、レール面が y=0。

const SIZE = () => (lowMemory() ? 256 : 512);

function canvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return [c, c.getContext("2d")!] as const;
}

function tex(c: HTMLCanvasElement, color: boolean, repeat = true) {
  const t = new THREE.CanvasTexture(c);
  if (color) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

/** 決まった乱数（毎回同じ絵になるように） */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * 鋼板の絵：色（白に近い明るさのムラ。材質の色を掛ける）・凹凸（継ぎ目は凹み、リベットは出っぱり）・つや（ムラ）。
 * 1 枚で縦に 2 枚の板。横の継ぎ目にリベットの列。
 */
function plateTextures() {
  const S = SIZE();
  const [cc, gc] = canvas(S, S);
  const [bc, gb] = canvas(S, S);
  const [rc, gr] = canvas(S, S);
  const r = rng(7);
  gc.fillStyle = "#e6e6e6";
  gc.fillRect(0, 0, S, S);
  gb.fillStyle = "#808080";
  gb.fillRect(0, 0, S, S);
  gr.fillStyle = "#a0a0a0";
  gr.fillRect(0, 0, S, S);
  // ムラ：ぼかした大小の斑点
  for (let i = 0; i < 260; i++) {
    const x = r() * S;
    const y = r() * S;
    const rad = (0.02 + r() * 0.12) * S;
    const v = r();
    const g = gc.createRadialGradient(x, y, 0, x, y, rad);
    const a = 0.05 + r() * 0.08;
    g.addColorStop(
      0,
      v > 0.5 ? `rgba(255,255,255,${a})` : `rgba(40,34,28,${a})`,
    );
    g.addColorStop(1, "rgba(0,0,0,0)");
    gc.fillStyle = g;
    gc.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    const gg = gr.createRadialGradient(x, y, 0, x, y, rad);
    gg.addColorStop(
      0,
      v > 0.5 ? `rgba(70,70,70,${a * 3})` : `rgba(230,230,230,${a * 3})`,
    );
    gg.addColorStop(1, "rgba(0,0,0,0)");
    gr.fillStyle = gg;
    gr.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  // 細かいざらつき
  for (let i = 0; i < S * 6; i++) {
    const v = Math.floor(200 + r() * 55);
    gc.fillStyle = `rgba(${v},${v},${v},0.12)`;
    gc.fillRect(r() * S, r() * S, 1, 1);
  }
  // 継ぎ目（横 2 本・縦 1 本）とリベット
  const seamsY = [0, S / 2];
  for (const y of seamsY) {
    gb.fillStyle = "#4a4a4a";
    gb.fillRect(0, y - 1, S, 3);
    gc.fillStyle = "rgba(20,18,16,0.35)";
    gc.fillRect(0, y - 1, S, 2);
    for (const off of [-6, 6]) {
      for (let x = 4; x < S; x += S / 32) {
        const yy = y + off * (S / 512);
        const rr = Math.max(1.4, S / 260);
        const g = gb.createRadialGradient(x, yy, 0, x, yy, rr * 1.6);
        g.addColorStop(0, "#ffffff");
        g.addColorStop(0.6, "#c8c8c8");
        g.addColorStop(1, "rgba(128,128,128,0)");
        gb.fillStyle = g;
        gb.beginPath();
        gb.arc(x, (yy + S) % S, rr * 1.6, 0, Math.PI * 2);
        gb.fill();
        gc.fillStyle = "rgba(255,255,255,0.18)";
        gc.beginPath();
        gc.arc(x - 0.5, ((yy + S) % S) - 0.5, rr * 0.7, 0, Math.PI * 2);
        gc.fill();
      }
    }
  }
  gb.fillStyle = "#4a4a4a";
  gb.fillRect(0, 0, 2, S);
  return { map: tex(cc, true), bump: tex(bc, false), rough: tex(rc, false) };
}

/** 客車の横の絵：紺のニス塗り、細い金の線、窓枠と窓（明かりは発光の絵に） */
export const COACH_WINDOWS = 9;
function coachSideTextures() {
  const W = SIZE() * 2;
  const H = Math.round(W / 4.6);
  const [cc, gc] = canvas(W, H);
  const [ec, ge] = canvas(W, H);
  const [bc, gb] = canvas(W, H);
  const r = rng(11);
  // 塗装：下ほどわずかに暗く、汚れる
  const body = gc.createLinearGradient(0, 0, 0, H);
  body.addColorStop(0, "#24345c");
  body.addColorStop(0.7, "#1d2a4c");
  body.addColorStop(1, "#141b2c");
  gc.fillStyle = body;
  gc.fillRect(0, 0, W, H);
  ge.fillStyle = "#000";
  ge.fillRect(0, 0, W, H);
  gb.fillStyle = "#808080";
  gb.fillRect(0, 0, W, H);
  // つやのムラ
  for (let i = 0; i < 120; i++) {
    const x = r() * W;
    const y = r() * H;
    const rad = (0.03 + r() * 0.1) * H * 2;
    const g = gc.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(
      0,
      r() > 0.5 ? "rgba(120,140,190,0.06)" : "rgba(0,0,0,0.12)",
    );
    g.addColorStop(1, "rgba(0,0,0,0)");
    gc.fillStyle = g;
    gc.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  // 雨だれの筋
  for (let i = 0; i < 70; i++) {
    const x = r() * W;
    const y = H * (0.6 + r() * 0.2);
    gc.fillStyle = `rgba(60,48,36,${0.08 + r() * 0.12})`;
    gc.fillRect(x, y, 1 + r() * 2, H - y);
  }
  // 細い金の線（腰と幕板）
  const line = (y: number) => {
    gc.fillStyle = "rgba(196,160,90,0.85)";
    gc.fillRect(0, y, W, Math.max(1, H / 90));
    gb.fillStyle = "#a0a0a0";
    gb.fillRect(0, y - 1, W, 3);
  };
  line(H * 0.17);
  line(H * 0.8);
  // 窓
  const n = COACH_WINDOWS;
  const margin = W * 0.06;
  const pitch = (W - margin * 2) / n;
  const wy = H * 0.26;
  const wh = H * 0.42;
  for (let i = 0; i < n; i++) {
    const x = margin + i * pitch + pitch * 0.14;
    const ww = pitch * 0.72;
    // 窓枠（ニスの木）
    gc.fillStyle = "#5b3a20";
    gc.fillRect(x - 3, wy - 3, ww + 6, wh + 6);
    gb.fillStyle = "#b0b0b0";
    gb.fillRect(x - 4, wy - 4, ww + 8, wh + 8);
    gb.fillStyle = "#505050";
    gb.fillRect(x, wy, ww, wh);
    // ガラス（暗い）
    gc.fillStyle = "#0d0f14";
    gc.fillRect(x, wy, ww, wh);
    // 明かり：あたたかい色、窓ごとに少し違う。カーテンや人の影
    const k = 0.6 + r() * 0.4;
    const lg = ge.createLinearGradient(0, wy, 0, wy + wh);
    lg.addColorStop(
      0,
      `rgba(255,${Math.round(214 * k)},${Math.round(150 * k)},1)`,
    );
    lg.addColorStop(
      1,
      `rgba(${Math.round(230 * k)},${Math.round(140 * k)},60,1)`,
    );
    ge.fillStyle = lg;
    ge.fillRect(x, wy, ww, wh);
    ge.fillStyle = "rgba(70,30,10,0.85)";
    if (r() < 0.5) ge.fillRect(x, wy, ww * (0.18 + r() * 0.12), wh);
    if (r() < 0.5) ge.fillRect(x + ww * (0.75 + r() * 0.1), wy, ww, wh);
    if (r() < 0.4) {
      ge.fillStyle = "rgba(90,40,14,0.55)";
      const hx = x + ww * (0.3 + r() * 0.4);
      ge.beginPath();
      ge.arc(hx, wy + wh * 0.55, wh * 0.13, 0, Math.PI * 2);
      ge.fill();
      ge.fillRect(hx - wh * 0.2, wy + wh * 0.68, wh * 0.4, wh * 0.4);
    }
    // 窓の真ん中の桟
    gc.fillStyle = "#4a2f1a";
    gc.fillRect(x, wy + wh * 0.38, ww, 2);
    ge.fillStyle = "#000";
    ge.fillRect(x, wy + wh * 0.38, ww, 2);
    // 窓のあいだの板の継ぎ目とリベット
    const sx = margin + i * pitch;
    gb.fillStyle = "#5a5a5a";
    gb.fillRect(sx - 1, 0, 2, H);
    gc.fillStyle = "rgba(0,0,0,0.25)";
    gc.fillRect(sx - 1, 0, 1, H);
  }
  // リベットの列（上下）
  for (const y of [H * 0.08, H * 0.9]) {
    for (let x = 6; x < W; x += W / 150) {
      gb.fillStyle = "#c8c8c8";
      gb.beginPath();
      gb.arc(x, y, Math.max(0.9, H / 140), 0, Math.PI * 2);
      gb.fill();
      gc.fillStyle = "rgba(150,170,220,0.12)";
      gc.fillRect(x - 0.5, y - 0.5, 1, 1);
    }
  }
  // 扉（両端）
  for (const x of [W * 0.012, W * 0.952]) {
    gc.strokeStyle = "rgba(0,0,0,0.5)";
    gc.lineWidth = 2;
    gc.strokeRect(x, H * 0.12, W * 0.036, H * 0.8);
    gb.strokeStyle = "#4a4a4a";
    gb.lineWidth = 3;
    gb.strokeRect(x, H * 0.12, W * 0.036, H * 0.8);
    gc.fillStyle = "#0d0f14";
    gc.fillRect(x + W * 0.006, H * 0.24, W * 0.024, H * 0.3);
    ge.fillStyle = "rgba(200,120,50,1)";
    ge.fillRect(x + W * 0.006, H * 0.24, W * 0.024, H * 0.3);
  }
  return {
    map: tex(cc, true, false),
    emissive: tex(ec, true, false),
    bump: tex(bc, false, false),
  };
}

/** 動輪の面：黒いスポーク車輪、磨いたタイヤ、つり合いおもり、クランクのボス */
function wheelTexture() {
  const S = SIZE();
  const [c, g] = canvas(S, S);
  const h = S / 2;
  g.fillStyle = "#000";
  g.fillRect(0, 0, S, S);
  // タイヤ（磨いた鋼）
  const tire = g.createRadialGradient(h, h, h * 0.8, h, h, h);
  tire.addColorStop(0, "#2e2f31");
  tire.addColorStop(0.5, "#56585b");
  tire.addColorStop(1, "#3a3b3d");
  g.fillStyle = tire;
  g.beginPath();
  g.arc(h, h, h, 0, Math.PI * 2);
  g.fill();
  // リム
  g.fillStyle = "#262422";
  g.beginPath();
  g.arc(h, h, h * 0.82, 0, Math.PI * 2);
  g.fill();
  // スポークのすきま（奥は暗い）
  g.fillStyle = "#060606";
  g.beginPath();
  g.arc(h, h, h * 0.74, 0, Math.PI * 2);
  g.fill();
  // スポーク
  g.strokeStyle = "#2c2a27";
  g.lineCap = "round";
  const n = 16;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    g.lineWidth = S * 0.028;
    g.beginPath();
    g.moveTo(h + Math.cos(a) * h * 0.2, h + Math.sin(a) * h * 0.2);
    g.lineTo(h + Math.cos(a) * h * 0.78, h + Math.sin(a) * h * 0.78);
    g.stroke();
  }
  // つり合いおもり（クランクの反対側の三日月）
  g.fillStyle = "#2a2826";
  g.beginPath();
  g.arc(h, h, h * 0.76, Math.PI * 0.5 - 0.75, Math.PI * 0.5 + 0.75);
  g.arc(h, h, h * 0.42, Math.PI * 0.5 + 0.75, Math.PI * 0.5 - 0.75, true);
  g.closePath();
  g.fill();
  // ハブとクランクのボス
  g.fillStyle = "#343230";
  g.beginPath();
  g.arc(h, h, h * 0.24, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "#9a9ca0";
  g.beginPath();
  g.arc(h, h, h * 0.09, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "#3a3836";
  g.beginPath();
  g.arc(h, h - h * 0.5, h * 0.16, 0, Math.PI * 2);
  g.fill();
  // 汚れ（下側の油と土ぼこり）
  const d = g.createLinearGradient(0, 0, 0, S);
  d.addColorStop(0, "rgba(60,45,30,0)");
  d.addColorStop(1, "rgba(60,45,30,0.35)");
  g.fillStyle = d;
  g.fillRect(0, 0, S, S);
  return tex(c, true, false);
}

/** 煙の粒：ふちが不規則な、もこもこしたかたまり */
export function smokeTexture() {
  const S = 128;
  const [c, g] = canvas(S, S);
  const r = rng(3);
  const img = g.createImageData(S, S);
  // やわらかい丸に、ゆるいもこもこのムラ（明るさに入れる。透明度は使わない）
  const bumps = Array.from({ length: 9 }, () => [
    S / 2 + (r() - 0.5) * S * 0.4,
    S / 2 + (r() - 0.5) * S * 0.4,
    S * (0.16 + r() * 0.12),
  ]);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const dx = (x - S / 2) / (S / 2);
      const dy = (y - S / 2) / (S / 2);
      let v = Math.exp(-(dx * dx + dy * dy) * 3.2);
      let b = 0;
      for (const [bx, by, br] of bumps)
        b += Math.exp(-((x - bx) ** 2 + (y - by) ** 2) / (br * br));
      v *= 0.55 + 0.45 * Math.min(1, b);
      const o = (y * S + x) * 4;
      img.data[o] = img.data[o + 1] = img.data[o + 2] = Math.round(v * 255);
      img.data[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return tex(c, false, false);
}

// ---- 汚れのシェーダー ----

const GRIME_VERT = "varying vec3 vGrPos;\nvarying vec3 vGrNrm;\n";
const GRIME_FRAG = /* glsl */ `
varying vec3 vGrPos;
varying vec3 vGrNrm;
uniform vec3 uSootAt;
uniform float uSootR;
uniform float uDirt;
uniform vec3 uRailFill;
uniform vec3 uSkyFill;
float grH(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float grNoise(vec3 p) {
  vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(grH(i), grH(i + vec3(1,0,0)), f.x), mix(grH(i + vec3(0,1,0)), grH(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(grH(i + vec3(0,0,1)), grH(i + vec3(1,0,1)), f.x), mix(grH(i + vec3(0,1,1)), grH(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float grDirt;
float grSoot;
`;
const GRIME_APPLY = /* glsl */ `
{
  vec3 p = vGrPos;
  float n = grNoise(p * 160.0) * 0.6 + grNoise(p * 520.0) * 0.4;
  // 下まわりの土ぼこり（レール面に近いほど）
  float h = smoothstep(0.0, 0.07, p.y);
  grDirt = (1.0 - h) * (0.5 + 0.6 * n) * uDirt;
  // 煙突のまわりと、上を向いた面にたまる煤
  float up = max(normalize(vGrNrm).y, 0.0);
  grSoot = (1.0 - smoothstep(0.0, uSootR, length(p - uSootAt))) * (0.6 + 0.4 * n) + up * 0.35 * n * uDirt;
  // 雨だれのような縦の筋
  float streak = grNoise(vec3(p.x * 900.0 + p.z * 900.0, p.y * 40.0, 0.0));
  float s = smoothstep(0.55, 0.95, streak) * (1.0 - up) * 0.25 * uDirt;
  vec3 dust = vec3(0.36, 0.29, 0.22);
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.6 + dust * 0.07, clamp(grDirt, 0.0, 1.0));
  diffuseColor.rgb *= 1.0 - clamp(grSoot, 0.0, 1.0) * 0.75;
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.7 + dust * 0.06, s);
}
`;
// 光のレールの照り返し（下から青白く）と、星空のほのかな明かり（上から）。太陽の反対側でも形が読めるように
const GRIME_FILL = /* glsl */ `
{
  float ny = normalize(vGrNrm).y;
  vec3 fill = uRailFill * (0.35 + 0.65 * clamp(-ny, 0.0, 1.0)) * (1.0 - smoothstep(0.0, 0.16, vGrPos.y) * 0.6) + uSkyFill * (0.6 + 0.4 * ny);
  totalEmissiveRadiance += diffuseColor.rgb * fill * (1.0 - metalnessFactor * 0.6);
}
`;
const GRIME_ROUGH = /* glsl */ `
roughnessFactor = clamp(mix(roughnessFactor, 0.95, clamp(grDirt * 0.7 + grSoot * 0.6, 0.0, 1.0)), 0.04, 1.0);
`;

type GrimeOpts = { sootAt?: THREE.Vector3; sootR?: number; dirt?: number };

/** 照り返しの強さ（全部の車両の材質で共有） */
const railFill = { value: new THREE.Color(0.32, 0.45, 0.8) };
const skyFill = { value: new THREE.Color(0.07, 0.075, 0.09) };

function grimy<M extends THREE.MeshStandardMaterial>(
  m: M,
  {
    sootAt = new THREE.Vector3(0, 0.14, 0.13),
    sootR = 0.06,
    dirt = 1,
  }: GrimeOpts = {},
) {
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uSootAt = { value: sootAt };
    shader.uniforms.uSootR = { value: sootR };
    shader.uniforms.uDirt = { value: dirt };
    shader.uniforms.uRailFill = railFill;
    shader.uniforms.uSkyFill = skyFill;
    shader.vertexShader =
      GRIME_VERT +
      shader.vertexShader.replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nvGrPos = position;\nvGrNrm = normal;",
      );
    shader.fragmentShader =
      GRIME_FRAG +
      shader.fragmentShader
        .replace(
          "#include <map_fragment>",
          "#include <map_fragment>\n" + GRIME_APPLY,
        )
        .replace(
          "#include <roughnessmap_fragment>",
          "#include <roughnessmap_fragment>\n" + GRIME_ROUGH,
        )
        .replace(
          "#include <emissivemap_fragment>",
          "#include <emissivemap_fragment>\n" + GRIME_FILL,
        );
  };
  m.customProgramCacheKey = () => "rail-grime";
  // StructureLook の細部（パネルの格子）は足さない。この材質は自分で汚れを持つ
  m.userData.slDone = true;
  return m;
}

/** 車両の材質と絵。最後に dispose() でまとめて捨てる */
export function trainMaterials() {
  const plate = plateTextures();
  const side = coachSideTextures();
  const wheelFace = wheelTexture();
  const std = (p: THREE.MeshStandardMaterialParameters) => {
    const m = new THREE.MeshStandardMaterial(p);
    m.userData.slDone = true;
    return m;
  };
  /** 汚れを足さない材質（照り返しだけ） */
  const clean: GrimeOpts = { sootR: 0.0001, dirt: 0 };
  const mats = {
    /** 機関車の黒い鋼板（ボイラー・運転室・テンダー） */
    paint: grimy(
      std({
        color: "#2a2b2e",
        metalness: 0.45,
        roughness: 0.5,
        map: plate.map,
        bumpMap: plate.bump,
        bumpScale: 1.2,
        roughnessMap: plate.rough,
      }),
    ),
    /** 煙室：熱で黒鉛色のつや消し */
    smokebox: grimy(
      std({
        color: "#2b2b2b",
        metalness: 0.3,
        roughness: 0.82,
        map: plate.map,
        bumpMap: plate.bump,
        bumpScale: 1.2,
        roughnessMap: plate.rough,
      }),
      { sootR: 0.08 },
    ),
    /** 台枠・シリンダー・台車などの鉄 */
    iron: grimy(
      std({
        color: "#1f1e1d",
        metalness: 0.6,
        roughness: 0.68,
        map: plate.map,
        roughnessMap: plate.rough,
      }),
      { dirt: 1.3 },
    ),
    /** 磨いた鋼（ロッド・手すり・ピストン棒） */
    steel: grimy(
      std({ color: "#a4a8ae", metalness: 1, roughness: 0.32 }),
      clean,
    ),
    /** ボイラーの帯（磨き跡の残る鋼。手すりほど光らない） */
    band: grimy(std({ color: "#76797e", metalness: 1, roughness: 0.48 }), {
      dirt: 0.6,
    }),
    /** 少しくすんだ真鍮（安全弁・汽笛・番号の板） */
    brass: grimy(
      std({ color: "#a8874a", metalness: 1, roughness: 0.36 }),
      clean,
    ),
    /** 前の緩衝梁（赤い塗装） */
    beam: grimy(
      std({ color: "#6e1b15", metalness: 0.2, roughness: 0.6, map: plate.map }),
      { dirt: 0.8 },
    ),
    /** 石炭：つや消しの黒にところどころ光る面 */
    coal: grimy(
      std({
        color: "#151515",
        metalness: 0.2,
        roughness: 0.55,
        flatShading: true,
      }),
      clean,
    ),
    /** 客車の塗装（車体の端・妻面） */
    coachPaint: grimy(
      std({
        color: "#1f2c4e",
        metalness: 0.35,
        roughness: 0.38,
        map: plate.map,
        bumpMap: plate.bump,
        bumpScale: 0.8,
      }),
      { sootAt: new THREE.Vector3(0, 0.2, 0.2), sootR: 0.0001, dirt: 0.8 },
    ),
    /** 客車の横：窓と明かり */
    coachSide: grimy(
      std({
        color: "#ffffff",
        metalness: 0.35,
        roughness: 0.4,
        map: side.map,
        bumpMap: side.bump,
        bumpScale: 1,
        emissiveMap: side.emissive,
        emissive: new THREE.Color(1, 1, 1),
        emissiveIntensity: 1.6,
      }),
      clean,
    ),
    /** 屋根：灰色の防水布、煤で汚れている */
    roof: grimy(
      std({ color: "#4a4b4d", metalness: 0.1, roughness: 0.9, map: plate.map }),
      { sootAt: new THREE.Vector3(0, 0.1, 0.14), sootR: 0.12, dirt: 1 },
    ),
    /** 蛇腹（客車の間）・ゴム */
    rubber: grimy(
      std({ color: "#141414", metalness: 0, roughness: 0.95 }),
      clean,
    ),
    /** 車輪 */
    wheel: grimy(
      std({
        color: "#ffffff",
        metalness: 0.7,
        roughness: 0.55,
        map: wheelFace,
      }),
      clean,
    ),
    tire: grimy(std({ color: "#3c3e41", metalness: 1, roughness: 0.55 }), {
      dirt: 0.8,
    }),
    /** 前照灯と運転室の窓の明かり（光るもの） */
    lamp: new THREE.MeshBasicMaterial({
      color: new THREE.Color(3, 2.6, 1.7),
      toneMapped: false,
    }),
    cabGlow: new THREE.MeshBasicMaterial({
      color: new THREE.Color(0.2, 0.1, 0.045),
      toneMapped: false,
    }),
    fireGlow: new THREE.MeshBasicMaterial({
      color: new THREE.Color(2.4, 0.9, 0.25),
      toneMapped: false,
    }),
  };
  const textures = [
    plate.map,
    plate.bump,
    plate.rough,
    side.map,
    side.emissive,
    side.bump,
    wheelFace,
  ];
  return {
    ...mats,
    list: Object.values(mats) as THREE.Material[],
    dispose() {
      for (const m of Object.values(mats)) m.dispose();
      for (const t of textures) t.dispose();
    },
  };
}
export type TrainMaterials = ReturnType<typeof trainMaterials>;
type MatKey = Exclude<keyof TrainMaterials, "list" | "dispose">;

// ---- 形の組み立て ----

const e = new THREE.Euler();
const mtx = new THREE.Matrix4();
const qt = new THREE.Quaternion();
const one = new THREE.Vector3(1, 1, 1);
const v3 = new THREE.Vector3();

/** 部品を材質ごとに集めて、最後に 1 つの形にまとめる */
class Kit {
  parts = new Map<MatKey, THREE.BufferGeometry[]>();
  add(
    key: MatKey,
    geo: THREE.BufferGeometry,
    pos: [number, number, number],
    rot: [number, number, number] = [0, 0, 0],
    scale?: [number, number, number],
  ) {
    const g = geo;
    mtx.compose(
      v3.set(...pos),
      qt.setFromEuler(e.set(...rot)),
      scale ? new THREE.Vector3(...scale) : one,
    );
    g.applyMatrix4(mtx);
    for (const name of Object.keys(g.attributes))
      if (name !== "position" && name !== "normal" && name !== "uv")
        g.deleteAttribute(name);
    const list = this.parts.get(key) ?? [];
    list.push(g.index ? g.toNonIndexed() : g);
    this.parts.set(key, list);
  }
  build() {
    const out: { key: MatKey; geometry: THREE.BufferGeometry }[] = [];
    for (const [key, list] of this.parts) {
      const merged = mergeGeometries(list);
      for (const g of list) g.dispose();
      if (merged) out.push({ key, geometry: merged });
    }
    return out;
  }
}

/** uv を引きのばす（板の模様の細かさを部品の大きさに合わせる） */
function uv<G extends THREE.BufferGeometry>(g: G, su: number, sv: number) {
  const a = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < a.count; i++) a.setXY(i, a.getX(i) * su, a.getY(i) * sv);
  return g;
}

const box = (w: number, h: number, d: number, su = 1, sv = 1) =>
  uv(new THREE.BoxGeometry(w, h, d), su, sv);
/** Z 向きの円柱 */
const cylZ = (r: number, len: number, seg = 20, r2 = r) =>
  new THREE.CylinderGeometry(r2, r, len, seg).rotateX(Math.PI / 2);
/** X 向きの円柱 */
const cylX = (r: number, len: number, seg = 16) =>
  new THREE.CylinderGeometry(r, r, len, seg).rotateZ(Math.PI / 2);
const cylY = (r: number, len: number, seg = 14, rTop = r) =>
  new THREE.CylinderGeometry(rTop, r, len, seg);

// 機関車の寸法（レール面 y=0、前が +Z）
export const LOCO = {
  /** 動輪（3 軸）の半径と位置 */
  driverR: 0.022,
  drivers: [0.062, 0.014, -0.034],
  /** 先輪・従輪 */
  ponyR: 0.011,
  pony: 0.127,
  trailR: 0.013,
  trail: -0.088,
  /** テンダーの車輪 */
  tenderR: 0.012,
  tender: [-0.145, -0.17, -0.205, -0.23],
  /** 車輪の左右の位置（中心） */
  wheelX: 0.036,
  /** クランクの半径、シリンダーの高さと左右・後ろの端、主連棒の長さ */
  crank: 0.011,
  cylY: 0.03,
  cylX: 0.05,
  cylBack: 0.1,
  mainRod: 0.064,
  /** 連結器までの後ろの長さ（客車の位置決めに使う） */
  rear: 0.25,
  front: 0.165,
};

const BOILER_Y = 0.086;
const BOILER_R = 0.029;

/** 機関車の止まっている部品（材質ごとにまとめた形） */
export function buildLocoBody() {
  const k = new Kit();
  const L = LOCO;
  // 台枠（車輪の内側の板）と歩み板
  k.add("iron", box(0.05, 0.026, 0.27, 1, 4), [0, 0.034, 0.02]);
  for (const s of [1, -1]) {
    k.add("paint", box(0.022, 0.003, 0.215, 0.5, 4), [s * 0.041, 0.056, 0.035]);
    // 歩み板の縁（白っぽく光る細い帯にはしない。黒い L 形の縁）
    k.add("iron", box(0.002, 0.007, 0.215), [s * 0.052, 0.0535, 0.035]);
  }
  // ボイラー（継ぎ目とリベットの帯）
  k.add("paint", uv(cylZ(BOILER_R, 0.185, 28), 2, 3), [0, BOILER_Y, 0.022]);
  for (const z of [-0.05, -0.005, 0.04, 0.085])
    k.add("band", new THREE.TorusGeometry(BOILER_R + 0.0006, 0.0011, 6, 32), [
      0,
      BOILER_Y,
      z,
    ]);
  // 煙室と扉
  k.add("smokebox", uv(cylZ(BOILER_R + 0.002, 0.036, 28), 2, 1), [
    0,
    BOILER_Y,
    0.131,
  ]);
  k.add("smokebox", cylZ(BOILER_R - 0.002, 0.004, 28), [0, BOILER_Y, 0.15]);
  k.add("iron", new THREE.TorusGeometry(BOILER_R - 0.0015, 0.0015, 6, 32), [
    0,
    BOILER_Y,
    0.152,
  ]);
  k.add("steel", cylZ(0.0035, 0.008, 10), [0, BOILER_Y, 0.155]);
  for (const y of [0.012, -0.012])
    k.add("iron", box(0.04, 0.0025, 0.002), [-0.005, BOILER_Y + y, 0.153]);
  // 煙突（上が広がる）とふち
  k.add("smokebox", cylY(0.0095, 0.03, 18, 0.0115), [
    0,
    BOILER_Y + 0.036,
    0.133,
  ]);
  k.add(
    "smokebox",
    new THREE.TorusGeometry(0.0118, 0.0018, 6, 20).rotateX(Math.PI / 2),
    [0, BOILER_Y + 0.051, 0.133],
  );
  // 蒸気溜め・砂箱（丸いドーム）
  const dome = (r: number, h: number, z: number) => {
    k.add("paint", cylY(r, h, 18), [0, BOILER_Y + BOILER_R - 0.002 + h / 2, z]);
    k.add(
      "paint",
      new THREE.SphereGeometry(r, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(
        1,
        0.55,
        1,
      ),
      [0, BOILER_Y + BOILER_R - 0.002 + h, z],
    );
  };
  dome(0.0125, 0.012, 0.035);
  dome(0.0105, 0.009, 0.085);
  // 安全弁と汽笛（真鍮）
  for (const x of [-0.005, 0.005])
    k.add("brass", cylY(0.0028, 0.012, 10), [
      x,
      BOILER_Y + BOILER_R + 0.004,
      -0.04,
    ]);
  k.add("brass", cylY(0.002, 0.016, 10, 0.003), [
    0,
    BOILER_Y + BOILER_R + 0.007,
    -0.054,
  ]);
  // 手すりと給水管
  for (const s of [1, -1]) {
    k.add("steel", cylZ(0.0011, 0.17, 6), [
      s * (BOILER_R + 0.004),
      BOILER_Y + 0.012,
      0.03,
    ]);
    k.add("iron", cylZ(0.0022, 0.12, 8), [
      s * (BOILER_R - 0.001),
      BOILER_Y - 0.02,
      0.05,
    ]);
  }
  // 火室（運転室の下まで）
  k.add("paint", box(0.06, 0.042, 0.05, 1, 1), [0, 0.078, -0.07]);
  // シリンダーと弁室、滑り棒
  for (const s of [1, -1]) {
    k.add("iron", uv(cylZ(0.012, 0.044, 18), 1, 1), [
      s * L.cylX,
      L.cylY,
      L.cylBack + 0.022,
    ]);
    k.add("iron", box(0.016, 0.014, 0.04), [
      s * L.cylX,
      L.cylY + 0.017,
      L.cylBack + 0.022,
    ]);
    k.add("steel", cylZ(0.0128, 0.003, 18), [
      s * L.cylX,
      L.cylY,
      L.cylBack + 0.045,
    ]);
    k.add("steel", cylZ(0.0128, 0.003, 18), [s * L.cylX, L.cylY, L.cylBack]);
    for (const y of [0.0042, -0.0042])
      k.add("steel", box(0.002, 0.0016, 0.045), [
        s * L.cylX,
        L.cylY + y,
        L.cylBack - 0.022,
      ]);
    // 先台車・従台車の枠
    k.add("iron", box(0.004, 0.008, 0.03), [s * 0.028, 0.012, L.pony]);
  }
  // 前の緩衝梁・緩衝器・連結器・排障器
  k.add("beam", box(0.1, 0.02, 0.008), [0, 0.046, 0.158]);
  for (const s of [1, -1]) {
    k.add("iron", cylZ(0.0035, 0.012, 10), [s * 0.032, 0.046, 0.168]);
    k.add("steel", cylZ(0.0065, 0.002, 16), [s * 0.032, 0.046, 0.174]);
  }
  k.add("iron", box(0.008, 0.006, 0.012), [0, 0.046, 0.166]);
  k.add(
    "iron",
    box(0.09, 0.016, 0.004, 1, 1),
    [0, 0.028, 0.158],
    [-0.35, 0, 0],
  );
  // 前照灯
  k.add("iron", cylZ(0.0065, 0.012, 14), [
    0,
    BOILER_Y + BOILER_R + 0.009,
    0.14,
  ]);
  // 運転室：側板・前板・後ろの柱・屋根（窓は光の板で別に）
  const cabZ = -0.095;
  const cabLen = 0.062;
  for (const s of [1, -1]) {
    k.add("paint", box(0.003, 0.03, cabLen, 1, 1), [s * 0.041, 0.072, cabZ]);
    k.add("paint", box(0.003, 0.05, 0.012), [
      s * 0.041,
      0.112,
      cabZ + cabLen / 2 - 0.006,
    ]);
    k.add("paint", box(0.003, 0.05, 0.012), [
      s * 0.041,
      0.112,
      cabZ - cabLen / 2 + 0.006,
    ]);
    k.add("paint", box(0.003, 0.012, cabLen), [s * 0.041, 0.131, cabZ]);
    // 窓の下の手すり
    k.add("steel", cylY(0.001, 0.04, 6), [
      s * 0.0435,
      0.075,
      cabZ - cabLen / 2 - 0.002,
    ]);
  }
  k.add("paint", box(0.085, 0.08, 0.003, 1, 1), [0, 0.096, cabZ + cabLen / 2]);
  k.add(
    "roof",
    uv(
      new THREE.CylinderGeometry(
        0.1,
        0.1,
        0.074,
        24,
        1,
        true,
        -0.45,
        0.9,
      ).rotateX(-Math.PI / 2),
      1,
      1,
    ),
    [0, 0.047, cabZ - 0.004],
  );
  k.add("iron", box(0.08, 0.004, cabLen), [0, 0.057, cabZ]);
  // テンダー：箱・枠・石炭・後ろの緩衝器
  const tZ = -0.188;
  k.add("paint", box(0.082, 0.052, 0.095, 1, 1), [0, 0.068, tZ]);
  k.add("iron", box(0.084, 0.004, 0.097), [0, 0.095, tZ]);
  k.add("iron", box(0.06, 0.012, 0.1), [0, 0.034, tZ]);
  for (const s of [1, -1]) {
    k.add("iron", box(0.004, 0.012, 0.042), [s * 0.04, 0.016, -0.157]);
    k.add("iron", box(0.004, 0.012, 0.042), [s * 0.04, 0.016, -0.218]);
    k.add("iron", cylZ(0.0035, 0.012, 10), [s * 0.032, 0.046, tZ - 0.054]);
    k.add("steel", cylZ(0.0065, 0.002, 16), [s * 0.032, 0.046, tZ - 0.06]);
  }
  k.add("beam", box(0.09, 0.016, 0.006), [0, 0.046, tZ - 0.05]);
  // 石炭の山（ごつごつ）
  const coal = new THREE.IcosahedronGeometry(1, 3);
  const r = rng(5);
  const pos = coal.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    v3.fromBufferAttribute(pos, i);
    const n = 0.85 + r() * 0.3;
    pos.setXYZ(i, v3.x * n, Math.max(v3.y, -0.1) * n, v3.z * n);
  }
  coal.computeVertexNormals();
  k.add("coal", coal, [0, 0.094, tZ + 0.012], [0, 0, 0], [0.036, 0.012, 0.036]);
  return k.build();
}

/** 光る部品（前照灯・運転室の窓の明かり・焚き口） */
export function buildLocoGlow() {
  const k = new Kit();
  k.add("lamp", new THREE.CircleGeometry(0.0055, 16), [
    0,
    BOILER_Y + BOILER_R + 0.009,
    0.1462,
  ]);
  for (const s of [1, -1]) {
    k.add(
      "cabGlow",
      new THREE.PlaneGeometry(0.036, 0.026),
      [s * 0.0426, 0.1, -0.095],
      [0, (s * Math.PI) / 2, 0],
    );
  }
  k.add(
    "fireGlow",
    new THREE.PlaneGeometry(0.02, 0.012),
    [0, 0.07, -0.0675],
    [0, Math.PI, 0],
  );
  return k.build();
}

/** 客車の止まっている部品（長さ len、前後は ±len/2） */
export function buildCoachBody(len: number) {
  const k = new Kit();
  const W = 0.072;
  const H = 0.054;
  const y0 = 0.03;
  k.add("coachPaint", box(W, H, len, 1, 3), [0, y0 + H / 2, 0]);
  // 屋根（低いアーチ）と通風器
  k.add(
    "roof",
    uv(
      new THREE.CylinderGeometry(
        0.05,
        0.05,
        len + 0.004,
        24,
        1,
        true,
        -0.83,
        1.66,
      ).rotateX(-Math.PI / 2),
      1,
      3,
    ),
    [0, y0 + H - 0.0335, 0],
  );
  for (let i = -3; i <= 3; i++)
    k.add("iron", cylY(0.004, 0.006, 10, 0.003), [
      0,
      y0 + H + 0.017,
      i * len * 0.13,
    ]);
  // 妻面の蛇腹
  for (const z of [len / 2 + 0.006, -len / 2 - 0.006])
    k.add("rubber", box(0.05, 0.048, 0.012), [0, y0 + 0.026, z]);
  // 床下：台枠・トラス棒・電池箱
  k.add("iron", box(0.064, 0.008, len * 0.98), [0, y0 - 0.003, 0]);
  k.add("iron", box(0.03, 0.012, 0.05), [0, y0 - 0.012, 0]);
  for (const s of [1, -1])
    k.add("steel", box(0.0015, 0.0015, len * 0.5), [s * 0.03, y0 - 0.013, 0]);
  // 台車（枠・ばね・車輪）
  for (const bz of [len * 0.33, -len * 0.33]) {
    for (const s of [1, -1]) {
      k.add("iron", box(0.004, 0.01, 0.046), [s * 0.04, 0.012, bz]);
      k.add("steel", cylY(0.003, 0.008, 8), [s * 0.04, 0.02, bz]);
      for (const dz of [0.016, -0.016]) {
        k.add("wheel", cylX(0.0095, 0.004, 16), [s * 0.035, 0.0095, bz + dz]);
        k.add("tire", cylX(0.0098, 0.0022, 16), [s * 0.0335, 0.0098, bz + dz]);
      }
    }
    k.add("iron", box(0.08, 0.006, 0.012), [0, 0.016, bz]);
  }
  // 端の手すりとステップ
  for (const z of [len / 2 - 0.006, -len / 2 + 0.006]) {
    for (const s of [1, -1]) {
      k.add("steel", cylY(0.0008, 0.035, 5), [s * 0.0372, y0 + 0.022, z]);
      k.add("iron", box(0.006, 0.002, 0.012), [s * 0.036, y0 - 0.008, z]);
    }
  }
  return k.build();
}

/** 客車の横の板（窓の絵を貼る）。左右 2 枚 */
export function buildCoachSides(len: number) {
  const k = new Kit();
  const H = 0.054;
  for (const s of [1, -1]) {
    // 左右どちらも、外から見て絵が裏返らない向き
    k.add(
      "coachSide",
      new THREE.PlaneGeometry(len, H),
      [s * 0.0362, 0.03 + H / 2, 0],
      [0, (s * Math.PI) / 2, 0],
    );
  }
  return k.build();
}

/** 車輪 1 つ（面は絵、まわりは磨いたタイヤ）。X 向き */
export function wheelGeometry(r: number, width: number) {
  return new THREE.CylinderGeometry(r, r, width, 24).rotateZ(Math.PI / 2);
}
