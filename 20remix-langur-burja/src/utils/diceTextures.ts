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

// Single texture loader instance and texture cache (textures cached, materials instantiated fresh per scene)
const textureLoader = new THREE.TextureLoader();
const cachedTextures: Record<string, THREE.Texture> = {};

// Warm ivory parchment fallback canvas with authentic symbol illustration so mobile dice are NEVER black
const fallbackSymbolCanvases: Record<string, HTMLCanvasElement> = {};

function createSymbolFallbackCanvas(symbolKey: SymbolType): HTMLCanvasElement {
  if (fallbackSymbolCanvases[symbolKey]) {
    return fallbackSymbolCanvases[symbolKey];
  }

  if (typeof document === 'undefined') {
    return ({} as HTMLCanvasElement);
  }

  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  // 1. Warm ivory parchment background matching authentic Himalayan dice
  const grad = ctx.createRadialGradient(128, 128, 20, 128, 128, 160);
  grad.addColorStop(0, '#FFFDF4');
  grad.addColorStop(0.7, '#F7F0D4');
  grad.addColorStop(1, '#E8DCAC');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);

  // 2. Vintage carved border inlay
  ctx.strokeStyle = '#2B2118';
  ctx.lineWidth = 10;
  ctx.strokeRect(10, 10, 236, 236);

  ctx.strokeStyle = '#B38F4D';
  ctx.lineWidth = 3;
  ctx.strokeRect(18, 18, 220, 220);

  // 3. Draw authentic vector symbol on the canvas
  ctx.save();
  ctx.translate(128, 128);

  if (symbolKey === 'jhanda') {
    // Red Pennant Flag 🚩
    ctx.fillStyle = '#C02626';
    ctx.beginPath();
    ctx.moveTo(-45, -70);
    ctx.lineTo(65, -30);
    ctx.lineTo(-45, 10);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#7F1D1D';
    ctx.lineWidth = 4;
    ctx.stroke();

    // Flagpole
    ctx.strokeStyle = '#78350F';
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(-45, -80);
    ctx.lineTo(-45, 75);
    ctx.stroke();

    // Gold Finial Ball
    ctx.fillStyle = '#F59E0B';
    ctx.beginPath();
    ctx.arc(-45, -80, 8, 0, Math.PI * 2);
    ctx.fill();
  } else if (symbolKey === 'burja') {
    // Royal Crown 👑
    ctx.fillStyle = '#D97706';
    ctx.strokeStyle = '#78350F';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(-65, 45);
    ctx.lineTo(65, 45);
    ctx.lineTo(55, -40);
    ctx.lineTo(25, 0);
    ctx.lineTo(0, -55);
    ctx.lineTo(-25, 0);
    ctx.lineTo(-55, -40);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Jewels
    ctx.fillStyle = '#DC2626';
    ctx.beginPath();
    ctx.arc(0, 20, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2563EB';
    ctx.beginPath();
    ctx.arc(-35, 20, 8, 0, Math.PI * 2);
    ctx.arc(35, 20, 8, 0, Math.PI * 2);
    ctx.fill();
  } else if (symbolKey === 'itta') {
    // Red Diamond ♦
    ctx.fillStyle = '#DC2626';
    ctx.strokeStyle = '#991B1B';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(0, -75);
    ctx.lineTo(60, 0);
    ctx.lineTo(0, 75);
    ctx.lineTo(-60, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (symbolKey === 'paan') {
    // Red Heart ♥
    ctx.fillStyle = '#DC2626';
    ctx.strokeStyle = '#991B1B';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(0, 55);
    ctx.bezierCurveTo(-70, 0, -65, -60, 0, -25);
    ctx.bezierCurveTo(65, -60, 70, 0, 0, 55);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (symbolKey === 'hukum') {
    // Black Spade ♠
    ctx.fillStyle = '#18181B';
    ctx.strokeStyle = '#09090B';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(0, -65);
    ctx.bezierCurveTo(55, -15, 65, 35, 0, 35);
    ctx.bezierCurveTo(-65, 35, -55, -15, 0, -65);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Stem
    ctx.beginPath();
    ctx.moveTo(-15, 35);
    ctx.lineTo(-25, 65);
    ctx.lineTo(25, 65);
    ctx.lineTo(15, 35);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (symbolKey === 'chidi') {
    // Black Club ♣
    ctx.fillStyle = '#18181B';
    ctx.strokeStyle = '#09090B';
    ctx.lineWidth = 4;

    // 3 lobes
    ctx.beginPath();
    ctx.arc(0, -30, 30, 0, Math.PI * 2);
    ctx.arc(-30, 15, 30, 0, Math.PI * 2);
    ctx.arc(30, 15, 30, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Stem
    ctx.beginPath();
    ctx.moveTo(-15, 20);
    ctx.lineTo(-25, 65);
    ctx.lineTo(25, 65);
    ctx.lineTo(15, 20);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  ctx.restore();

  fallbackSymbolCanvases[symbolKey] = canvas;
  return canvas;
}

// Preload all 6 dice PNG textures immediately into the browser image cache
const preloadedImages: Record<string, HTMLImageElement> = {};

export function preloadDiceTextures(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();

  const promises = Object.entries(SYMBOL_IMAGE_PATHS).map(([key, src]) => {
    // Eagerly build procedural fallback canvas for instantaneous rendering
    createSymbolFallbackCanvas(key as SymbolType);

    return new Promise<void>((resolve) => {
      if (preloadedImages[src] && preloadedImages[src].complete) {
        resolve();
        return;
      }
      const img = new Image();
      img.onload = () => {
        preloadedImages[src] = img;
        if (cachedTextures[key]) {
          cachedTextures[key].image = img;
          cachedTextures[key].needsUpdate = true;
        }
        resolve();
      };
      img.onerror = () => {
        // Fallback canvas is already ready
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
 * Returns a cached or fresh THREE.Texture for the given symbol, guaranteed to be non-black on frame 0
 */
export function getSymbolTexture(symbolKey: SymbolType): THREE.Texture {
  if (cachedTextures[symbolKey]) {
    return cachedTextures[symbolKey];
  }

  const texturePath = SYMBOL_IMAGE_PATHS[symbolKey];
  const fallbackCanvas = createSymbolFallbackCanvas(symbolKey);

  // Initialize texture with instant procedural canvas
  const texture = new THREE.Texture(fallbackCanvas as any);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;

  // If high-res PNG is already decoded, swap it in
  const cachedImg = preloadedImages[texturePath];
  if (cachedImg && cachedImg.complete && cachedImg.naturalWidth > 0) {
    (texture.image as any) = cachedImg;
    texture.needsUpdate = true;
  } else {
    // Asynchronously load the high-res PNG
    textureLoader.load(
      texturePath,
      (loadedTex) => {
        (texture.image as any) = loadedTex.image;
        texture.needsUpdate = true;
      },
      undefined,
      (err) => {
        console.warn(`[DiceTexture] Using canvas texture for ${symbolKey}:`, err);
      }
    );
  }

  cachedTextures[symbolKey] = texture;
  return texture;
}

/**
 * Returns 6 fresh MeshStandardMaterials for the Three.js dice cube faces.
 * Never shares disposed material instances across scenes, preventing black dice!
 */
export function getLangurBurjaDiceMaterials(): THREE.MeshStandardMaterial[] {
  const materials: THREE.MeshStandardMaterial[] = [];

  FACE_SYMBOL_MAP.forEach((symbolKey) => {
    const texture = getSymbolTexture(symbolKey);

    const mat = new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 0.32,
      metalness: 0.04,
      color: 0xffffff,
    });
    mat.needsUpdate = true;

    materials.push(mat);
  });

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
