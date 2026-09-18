import * as THREE from 'three';
import { SymbolType } from '../types.js';

/**
 * Authentic Langur Burja (Jhandi Munda) Image Texture Utilities
 * Uses pre-rendered high-resolution static PNG texture images from /assets/dice/
 * for optimal GPU performance, crisp anisotropic filtering, and zero CPU vector raster overhead.
 */

// Mapping of cube face indices in THREE.BoxGeometry:
// 0: +X (Right)   -> Jhanda (Flag 🚩)
// 1: -X (Left)    -> Burja (Crown 👑)
// 2: +Y (Top)     -> Itta (Diamond ♦)
// 3: -Y (Bottom)  -> Paan (Heart ♥)
// 4: +Z (Front)   -> Hukum (Spade ♠)
// 5: -Z (Back)    -> Chidi (Club ♣)

export const FACE_SYMBOL_MAP: SymbolType[] = [
  'jhanda', // 0: +X
  'burja',  // 1: -X
  'itta',   // 2: +Y
  'paan',   // 3: -Y
  'hukum',  // 4: +Z
  'chidi',  // 5: -Z
];

export const SYMBOL_TO_FACE_INDEX: Record<SymbolType, number> = {
  jhanda: 0,
  burja: 1,
  itta: 2,
  paan: 3,
  hukum: 4,
  chidi: 5,
};

// Resolve Vite base URL dynamically so assets work on root (localhost), GitHub Pages subfolders, and custom domains
const BASE_PATH = import.meta.env.BASE_URL || './';
const ASSET_PREFIX = BASE_PATH.endsWith('/') ? BASE_PATH : `${BASE_PATH}/`;

/**
 * Static PNG texture image paths stored in /public/assets/dice/
 * Dynamically prefixed with Vite's BASE_URL so relative and GitHub Pages deployments never fail
 */
export const SYMBOL_IMAGE_PATHS: Record<SymbolType, string> = {
  jhanda: `${ASSET_PREFIX}assets/dice/jhanda.png`,
  burja: `${ASSET_PREFIX}assets/dice/burja.png`,
  itta: `${ASSET_PREFIX}assets/dice/itta.png`,
  paan: `${ASSET_PREFIX}assets/dice/paan.png`,
  hukum: `${ASSET_PREFIX}assets/dice/hukum.png`,
  chidi: `${ASSET_PREFIX}assets/dice/chidi.png`,
};

/**
 * Returns base rotation [eulerX, eulerY, eulerZ] in 'YXZ' order that puts the chosen face
 * normal pointing UP (+Y) toward the camera and upright facing the player.
 */
export function getBaseRotationForSymbol(symbol: SymbolType): [number, number, number] {
  switch (symbol) {
    case 'jhanda': // +X face rotates to +Y
      return [0, -Math.PI / 2, Math.PI / 2];
    case 'burja': // -X face rotates to +Y
      return [0, Math.PI / 2, -Math.PI / 2];
    case 'itta': // +Y face already points +Y
      return [0, 0, 0];
    case 'paan': // -Y face rotates to +Y
      return [Math.PI, 0, 0];
    case 'hukum': // +Z face rotates to +Y
      return [-Math.PI / 2, 0, 0];
    case 'chidi': // -Z face rotates to +Y
      return [Math.PI / 2, Math.PI, 0];
    default:
      return [0, 0, 0];
  }
}

export const BLANK_DICE_TEXTURE_PATH = `${ASSET_PREFIX}assets/dice/blank.png`;

/**
 * Returns the PNG image URL for any of the 6 authentic symbols
 */
export function getSymbolImageDataUrl(symbol: SymbolType): string {
  return SYMBOL_IMAGE_PATHS[symbol];
}

export function getSymbolImageUrl(symbol: SymbolType): string {
  return SYMBOL_IMAGE_PATHS[symbol];
}

export function getBlankDiceImageUrl(): string {
  return BLANK_DICE_TEXTURE_PATH;
}

// Single texture loader instance and material cache
const textureLoader = new THREE.TextureLoader();
let cachedMaterials: THREE.MeshStandardMaterial[] | null = null;

// Warm ivory parchment fallback canvas so mobile dice are NEVER black before textures finish downloading
let fallbackParchmentCanvas: HTMLCanvasElement | null = null;

function getFallbackParchmentCanvas(): HTMLCanvasElement {
  if (!fallbackParchmentCanvas && typeof document !== 'undefined') {
    fallbackParchmentCanvas = document.createElement('canvas');
    fallbackParchmentCanvas.width = 128;
    fallbackParchmentCanvas.height = 128;
    const ctx = fallbackParchmentCanvas.getContext('2d');
    if (ctx) {
      // Warm ivory parchment radial gradient matching traditional Himalayan wooden dice
      const grad = ctx.createRadialGradient(64, 64, 10, 64, 64, 80);
      grad.addColorStop(0, '#FFFDF0');
      grad.addColorStop(0.7, '#FAF4D0');
      grad.addColorStop(1, '#EDE5B5');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 128, 128);

      // Subtle vintage border inlay
      ctx.strokeStyle = '#2A231E';
      ctx.lineWidth = 4;
      ctx.strokeRect(6, 6, 116, 116);
    }
  }
  return fallbackParchmentCanvas || ({} as HTMLCanvasElement);
}

// Preload all 6 dice PNG textures immediately into the browser image cache
const preloadedImages: Record<string, HTMLImageElement> = {};

export function preloadDiceTextures(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();

  const promises = Object.values(SYMBOL_IMAGE_PATHS).map((src) => {
    return new Promise<void>((resolve) => {
      if (preloadedImages[src] && preloadedImages[src].complete) {
        resolve();
        return;
      }
      const img = new Image();
      img.onload = () => {
        preloadedImages[src] = img;
        resolve();
      };
      img.onerror = () => {
        resolve();
      };
      img.src = src;
      preloadedImages[src] = img;
    });
  });

  return Promise.all(promises).then(() => {});
}

// Immediate eager preloading on module evaluation
if (typeof window !== 'undefined') {
  preloadDiceTextures();
}

/**
 * Returns the 6 MeshStandardMaterials for the Three.js dice cube faces
 * using static GPU PNG image textures directly.
 */
export function getLangurBurjaDiceMaterials(): THREE.MeshStandardMaterial[] {
  if (cachedMaterials) return cachedMaterials;

  const materials: THREE.MeshStandardMaterial[] = [];

  FACE_SYMBOL_MAP.forEach((symbolKey) => {
    const texturePath = SYMBOL_IMAGE_PATHS[symbolKey];

    // Create the texture and immediately assign the ivory parchment canvas as initial image
    // so Three.js renders a tactile ivory die from frame 0 rather than a black WebGL placeholder
    const texture = textureLoader.load(
      texturePath,
      (loadedTex) => {
        loadedTex.needsUpdate = true;
      },
      undefined,
      (err) => {
        console.warn(`[DiceTexture] Failed loading ${texturePath}, using parchment fallback:`, err);
      }
    );

    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    texture.generateMipmaps = true;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;

    // Check if the image is already preloaded and decoded in memory
    const cachedImg = preloadedImages[texturePath];
    if (cachedImg && cachedImg.complete && cachedImg.naturalWidth > 0) {
      texture.image = cachedImg;
      texture.needsUpdate = true;
    } else if (typeof document !== 'undefined') {
      (texture.image as any) = getFallbackParchmentCanvas();
      texture.needsUpdate = true;
    }

    const mat = new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 0.32,
      metalness: 0.04,
      color: 0xffffff,
    });

    materials.push(mat);
  });

  cachedMaterials = materials;
  return materials;
}

/**
 * Creates an optimized 56-vertex beveled dice geometry with 2 segments along bevel edges.
 * BoxGeometry with 3 segments per axis produces a 4x4x4 vertex grid.
 * Subtracting the 8 interior positions yields exactly 56 unique surface vertices,
 * forming 54 quad faces (108 triangles) with spherical/cylindrical bevel rounding.
 * Replaces high-poly 900+ vertex geometries for massive GPU/CPU efficiency.
 */
export function createBeveledDiceGeometry(size: number = 0.74, radius: number = 0.08): THREE.BoxGeometry {
  const half = size / 2;
  const inner = half - radius;
  const geom = new THREE.BoxGeometry(size, size, size, 3, 3, 3);
  const pos = geom.attributes.position;
  const uv = geom.attributes.uv;
  const bevelRatio = radius / size;

  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i);
    let y = pos.getY(i);
    let z = pos.getZ(i);

    // Snap inner grid lines to [-inner, +inner]
    const snap = (v: number) => {
      if (Math.abs(v - half) < 1e-4) return half;
      if (Math.abs(v + half) < 1e-4) return -half;
      if (v > 0) return inner;
      return -inner;
    };

    x = snap(x);
    y = snap(y);
    z = snap(z);

    // Spherical/cylindrical rounding for edge and corner bevels
    const cx = Math.max(-inner, Math.min(inner, x));
    const cy = Math.max(-inner, Math.min(inner, y));
    const cz = Math.max(-inner, Math.min(inner, z));

    const dx = x - cx;
    const dy = y - cy;
    const dz = z - cz;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

    if (dist > 1e-6) {
      const factor = radius / dist;
      pos.setXYZ(i, cx + dx * factor, cy + dy * factor, cz + dz * factor);
    } else {
      pos.setXYZ(i, x, y, z);
    }
  }

  // Remap UVs to align with bevel boundaries so textures sit flat without distortion
  for (let i = 0; i < uv.count; i++) {
    const u = uv.getX(i);
    const v = uv.getY(i);

    const remapUv = (val: number) => {
      if (Math.abs(val - 0) < 1e-4) return 0;
      if (Math.abs(val - 1) < 1e-4) return 1;
      if (Math.abs(val - 1 / 3) < 1e-4) return bevelRatio;
      if (Math.abs(val - 2 / 3) < 1e-4) return 1 - bevelRatio;
      return val;
    };

    uv.setXY(i, remapUv(u), remapUv(v));
  }

  geom.computeVertexNormals();
  return geom;
}
