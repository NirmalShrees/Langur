import React, { useEffect, useRef, useCallback, useMemo, useState } from 'react';
import * as THREE from 'three';
import { SymbolType, RoundResultSummary, LANGUR_BURJA_SYMBOLS } from '../types.js';
import {
  getLangurBurjaDiceMaterials,
  getBaseRotationForSymbol,
  getSymbolImageDataUrl,
  createBeveledDiceGeometry,
} from '../utils/diceTextures.js';
import { sound } from '../utils/audio.js';
import { Sparkles, RotateCcw, Compass, Grid } from 'lucide-react';

interface ThreeDiceArenaProps {
  phase: 'waiting' | 'betting' | 'rolling' | 'payout';
  dice: SymbolType[];
  lastResult?: RoundResultSummary;
  tableTheme?: 'emerald' | 'crimson' | 'midnight';
  defaultCameraView?: '3d' | 'top' | 'close';
  bettingTimer?: number;
  className?: string;
}

interface DieState {
  mesh: THREE.Mesh;
  targetPos: THREE.Vector3;
  targetQuat: THREE.Quaternion;
  currentPos: THREE.Vector3;
  currentQuat: THREE.Quaternion;
  glowRing: THREE.Mesh;
}

const ThreeDiceArenaComponent: React.FC<ThreeDiceArenaProps> = ({
  phase,
  dice,
  lastResult,
  tableTheme = 'emerald',
  defaultCameraView = '3d',
  bettingTimer,
  className,
}) => {
  const mountRef = useRef<HTMLDivElement>(null);

  // Debug wireframe mode state
  const [showWireframe, setShowWireframe] = useState(false);
  const showWireframeRef = useRef(false);

  useEffect(() => {
    showWireframeRef.current = showWireframe;
    if (!sceneRef.current) return;
    sceneRef.current.traverse((child) => {
      if (child.name === 'dieWireframe') {
        child.visible = showWireframe;
      } else if (child instanceof THREE.Mesh && child.material) {
        if (child.name === 'glowRing') return;
        if (Array.isArray(child.material)) {
          child.material.forEach((m) => {
            m.wireframe = showWireframe;
          });
        } else {
          child.material.wireframe = showWireframe;
        }
      }
    });
  }, [showWireframe]);

  // Three.js & Animation references
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const diceStatesRef = useRef<DieState[]>([]);
  const cupRef = useRef<THREE.Group | null>(null);
  const spotLightRef = useRef<THREE.SpotLight | null>(null);
  const animationFrameRef = useRef<number>(0);
  const isRollingAnimRef = useRef<boolean>(false);
  const animStartTimeRef = useRef<number>(0);
  const hasRolledForCurrentPhaseRef = useRef(false);
  const roundSeedRef = useRef<number>(1);
  const newTargetsAssignedRef = useRef<boolean>(false);

  // Synchronized refs to eliminate stale closure bugs inside requestAnimationFrame
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  const diceRef = useRef(dice);
  diceRef.current = dice;

  const activeRollSymbolsRef = useRef<SymbolType[]>(dice);

  // Audio countdown tick tracker
  const lastCountdownTickRef = useRef<number | null>(null);
  const initialDiceRef = useRef(dice);
  const feltMatRef = useRef<THREE.MeshStandardMaterial | null>(null);

  // Random suspense delay when bucket is placed on table before reveal (200ms to 1s range)
  const revealPauseDelayRef = useRef<number>(0.55);
  const animAudioFlagsRef = useRef({
    cupLift: false,
    cupDrop: false,
    revealLand: false,
    invertedTumble: false,
    lastShakeTime: 0,
  });

  // Procedural shake choreography parameters (varied every round so it is never the same animation)
  const shakeProfileRef = useRef({
    patternType: 0, // 0: Vortex Swirl, 1: Lateral Snap, 2: Figure-8 Cascade, 3: Dual-Pulse Pump
    baseFreq: 30,
    amp: 0.34,
    tiltForward: 0.46,
    swirlSpeed: 12,
    wobblePhaseX: 0,
    wobblePhaseZ: 0,
    rattleRate: 180,
  });

  // Camera targets for smooth interpolation & mobile interaction
  const targetCamRef = useRef({
    angleX: 0,
    height: 5.8,
    radius: 4.0,
  });

  const handleResetCamera = useCallback(() => {
    targetCamRef.current.angleX = 0;
    targetCamRef.current.height = 5.8;
    targetCamRef.current.radius = 4.0;
  }, []);

  // Update felt color dynamically without re-mounting the Three.js scene
  useEffect(() => {
    if (feltMatRef.current) {
      const feltColorHex =
        tableTheme === 'crimson'
          ? 0x420c14
          : tableTheme === 'midnight'
          ? 0x0a1c32
          : 0x072b1e;
      feltMatRef.current.color.setHex(feltColorHex);
    }
  }, [tableTheme]);

  // Set opacity across all meshes inside cupGroup for smooth fadeout
  const setCupOpacity = useCallback((opacity: number) => {
    if (!cupRef.current) return;
    cupRef.current.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach((m) => {
            m.transparent = opacity < 1.0;
            m.opacity = opacity;
          });
        } else if (mesh.material) {
          mesh.material.transparent = opacity < 1.0;
          mesh.material.opacity = opacity;
        }
      }
    });
  }, []);

  // Sync 3... 2... 1 countdown audio tick & haptic feedback (never tick or show 0)
  useEffect(() => {
    if (phase === 'betting' && bettingTimer !== undefined && bettingTimer <= 3 && bettingTimer >= 1) {
      if (lastCountdownTickRef.current !== bettingTimer) {
        lastCountdownTickRef.current = bettingTimer;
        sound.playCountdownTick(bettingTimer);
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
          navigator.vibrate(bettingTimer === 1 ? 40 : 20);
        }
      }
    } else {
      lastCountdownTickRef.current = null;
    }
  }, [phase, bettingTimer]);

  // Organic clustered resting positions on felt table under the bucket mouth
  // 1 center die + 5 surrounding dice, all within radius 0.96 (mouth lip of cup has radius 1.70)
  // Minimum pairwise distance is > 0.90, so dice never touch or overlap!
  const getClusteredRollPositions = useCallback((seed: number): THREE.Vector3[] => {
    const baseCluster: [number, number][] = [
      [0.04, -0.03],
      [0.86, 0.42],
      [0.01, 0.96],
      [-0.94, 0.19],
      [-0.58, -0.76],
      [0.62, -0.73],
    ];

    const roundAngle = (seed * 1.37) % (Math.PI * 2);
    const cosA = Math.cos(roundAngle);
    const sinA = Math.sin(roundAngle);

    return baseCluster.map(([bx, bz], i) => {
      const rx = bx * cosA - bz * sinA;
      const rz = bx * sinA + bz * cosA;
      const jx = Math.sin(seed * 3.1 + i * 1.7) * 0.04;
      const jz = Math.cos(seed * 2.7 + i * 2.3) * 0.04;
      return new THREE.Vector3(rx + jx, 0.47, rz + jz);
    });
  }, []);

  // Initial organic scattered positions on felt table (authentic non-grid initial rest at y = 0.47)
  const getInitialScatteredPosition = useCallback(
    (index: number): THREE.Vector3 => {
      const cluster = getClusteredRollPositions(0);
      return cluster[index] || new THREE.Vector3(0, 0.47, 0);
    },
    [getClusteredRollPositions]
  );

  // Compute winning matches from dice array
  const symbolCounts = useMemo(() => {
    const counts: Record<SymbolType, number> = {
      jhanda: 0,
      burja: 0,
      itta: 0,
      paan: 0,
      hukum: 0,
      chidi: 0,
    };
    dice.forEach((s) => {
      if (counts[s] !== undefined) {
        counts[s]++;
      }
    });
    return counts;
  }, [dice]);

  const symbolCountsRef = useRef(symbolCounts);
  symbolCountsRef.current = symbolCounts;

  const winningSymbols = useMemo(() => {
    return (Object.entries(symbolCounts) as [SymbolType, number][])
      .filter(([_, count]) => count >= 2)
      .sort((a, b) => b[1] - a[1]);
  }, [symbolCounts]);

  // Update target orientations based on incoming dice symbols without moving their physical landing spots
  const updateDiceTargets = useCallback(
    (targetSymbols: SymbolType[]) => {
      activeRollSymbolsRef.current = [...targetSymbols];
      if (isRollingAnimRef.current) return;

      diceStatesRef.current.forEach((die, idx) => {
        const symbol = targetSymbols[idx] || 'burja';
        const [baseX, baseY, baseZ] = getBaseRotationForSymbol(symbol);
        const organicYaw = Math.sin(roundSeedRef.current * 2.1 + idx * 4.3) * 0.28;
        const targetEuler = new THREE.Euler(baseX, baseY + organicYaw, baseZ, 'YXZ');
        die.targetQuat.setFromEuler(targetEuler);

        if (die.mesh) {
          die.currentQuat.copy(die.targetQuat);
          die.mesh.quaternion.copy(die.targetQuat);
          die.mesh.position.set(die.currentPos.x, 0.47, die.currentPos.z);
          die.mesh.visible = true;
          die.glowRing.position.set(die.currentPos.x, 0.115, die.currentPos.z);
        }
      });
    },
    []
  );

  // Trigger bucket upside-down turn, table placement & reveal sequence
  const startRollAnimation = useCallback((rollSymbols?: SymbolType[]) => {
    if (isRollingAnimRef.current) return;
    isRollingAnimRef.current = true;
    if (rollSymbols && rollSymbols.length === 6) {
      activeRollSymbolsRef.current = [...rollSymbols];
    } else {
      activeRollSymbolsRef.current = [...diceRef.current];
    }
    animStartTimeRef.current = performance.now();
    roundSeedRef.current = (roundSeedRef.current + 1) % 1000;
    newTargetsAssignedRef.current = false;

    // Crisp, suspenseful pause on table before lifting (300ms)
    revealPauseDelayRef.current = 0.30;
    animAudioFlagsRef.current = {
      cupLift: false,
      cupDrop: false,
      revealLand: false,
      invertedTumble: false,
      lastShakeTime: 0,
    };

    // Generate distinct procedural shake choreography for this round so every roll feels unique!
    shakeProfileRef.current = {
      patternType: Math.floor(Math.random() * 4),
      baseFreq: 27 + Math.random() * 8, // 27 - 35 Hz
      amp: 0.32 + Math.random() * 0.12, // 0.32 - 0.44 (substantially more bucket shake!)
      tiltForward: 0.42 + Math.random() * 0.16, // 0.42 - 0.58 rad
      swirlSpeed: 11 + Math.random() * 6, // 11 - 17 rad/s
      wobblePhaseX: Math.random() * Math.PI * 2,
      wobblePhaseZ: Math.random() * Math.PI * 2,
      rattleRate: 170 + Math.random() * 45,
    };

    // Dices are taken into the bucket (hidden from table)
    diceStatesRef.current.forEach((die) => {
      die.mesh.visible = false;
      die.glowRing.visible = false;
    });

    // Make bucket visible in the air, upright holding the dice
    if (cupRef.current) {
      cupRef.current.visible = true;
      cupRef.current.position.set(0, 2.30, 0);
      cupRef.current.rotation.set(Math.PI, 0, 0); // mouth pointing UP holding dice
      setCupOpacity(1.0);
    }

    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(25);
    }
  }, [setCupOpacity]);

  // Sync phase changes to roll trigger (guaranteed single trigger per round)
  useEffect(() => {
    if (phase === 'rolling') {
      if (!hasRolledForCurrentPhaseRef.current) {
        hasRolledForCurrentPhaseRef.current = true;
        activeRollSymbolsRef.current = [...dice];
        startRollAnimation(dice);
      }
    } else {
      hasRolledForCurrentPhaseRef.current = false;
      // Note: In 'payout' or 'betting', the dice are ALREADY settled on the table from their roll.
      // Do NOT recalculate or twitch their orientation when phase transitions to payout!
      activeRollSymbolsRef.current = [...dice];
    }
  }, [phase, dice, startRollAnimation]);

  // Update winning glow halos in payout phase
  useEffect(() => {
    if (phase === 'payout' && !isRollingAnimRef.current) {
      const rollSymbols =
        activeRollSymbolsRef.current.length === 6
          ? activeRollSymbolsRef.current
          : dice;
      diceStatesRef.current.forEach((die, idx) => {
        const symbol = rollSymbols[idx];
        const isWinner = (symbolCounts[symbol] || 0) >= 2;
        die.glowRing.visible = isWinner;
      });
    } else if (phase !== 'payout') {
      diceStatesRef.current.forEach((die) => {
        die.glowRing.visible = false;
      });
    }
  }, [phase, dice, symbolCounts]);

  // Sync cameraView if defaultCameraView changes
  useEffect(() => {
    if (defaultCameraView === 'top') {
      targetCamRef.current.angleX = 0;
      targetCamRef.current.height = 7.8;
      targetCamRef.current.radius = 0.2;
    } else {
      targetCamRef.current.angleX = 0;
      targetCamRef.current.height = 5.8;
      targetCamRef.current.radius = 4.0;
    }
  }, [defaultCameraView]);

  // Main Three.js Scene Setup
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth || 360;
    const height = container.clientHeight || 280;

    const scene = new THREE.Scene();
    sceneRef.current = scene;
    scene.background = new THREE.Color(0x06080e);

    const initAspect = width / height;

    // High angle isometric perspective camera with stable, beautiful framing
    const camera = new THREE.PerspectiveCamera(38, initAspect, 0.1, 100);
    const initialTargetX = Math.sin(targetCamRef.current.angleX) * targetCamRef.current.radius;
    const initialTargetZ = Math.cos(targetCamRef.current.angleX) * targetCamRef.current.radius;
    camera.position.set(initialTargetX, targetCamRef.current.height, initialTargetZ);
    camera.lookAt(0, 0.25, 0);
    cameraRef.current = camera;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        powerPreference: 'high-performance',
        alpha: false,
      });
    } catch (err) {
      console.warn('WebGL initialization failed:', err);
      return;
    }

    renderer.setSize(width, height);
    // Optimized pixel ratio for fast, lag-free mobile rendering
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.28;
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.display = 'block';
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // 1. Sophisticated Atmospheric Lighting Rig (Moody, authentic festival table with subtle lift)
    const ambientLight = new THREE.AmbientLight(0xfff1e0, 1.8);
    scene.add(ambientLight);

    // Dramatic overhead golden spotlight with optimized shadow map
    const spotLight = new THREE.SpotLight(0xfff7e4, 4.4);
    spotLight.position.set(0, 9.5, 1.8);
    spotLight.angle = Math.PI / 3.4;
    spotLight.penumbra = 0.55;
    spotLight.decay = 1.4;
    spotLight.distance = 24;
    spotLight.castShadow = true;
    spotLight.shadow.mapSize.width = 512;
    spotLight.shadow.mapSize.height = 512;
    spotLight.shadow.bias = -0.0006;
    scene.add(spotLight);
    spotLightRef.current = spotLight;

    // Warm golden rim lights from both flanks
    const rimLightLeft = new THREE.DirectionalLight(0xd4af37, 1.45);
    rimLightLeft.position.set(-5, 4.5, -4);
    scene.add(rimLightLeft);

    const rimLightRight = new THREE.DirectionalLight(0xe88d43, 1.05);
    rimLightRight.position.set(5, 3.5, 3.5);
    scene.add(rimLightRight);

    // 2. Authentic Himalayan Lacquered Rosewood Tray & Felt
    const trayGroup = new THREE.Group();
    scene.add(trayGroup);

    // Royal Velvet Felt Floor (Emerald, Crimson Festive, or Midnight Blue)
    const feltGeo = new THREE.CylinderGeometry(3.5, 3.5, 0.2, 48);
    const feltColorHex =
      tableTheme === 'crimson'
        ? 0x420c14
        : tableTheme === 'midnight'
        ? 0x0a1c32
        : 0x072b1e;
    const feltMat = new THREE.MeshStandardMaterial({
      color: feltColorHex,
      roughness: 0.86,
      metalness: 0.04,
    });
    feltMatRef.current = feltMat;
    const feltFloor = new THREE.Mesh(feltGeo, feltMat);
    feltFloor.position.y = 0;
    feltFloor.receiveShadow = true;
    trayGroup.add(feltFloor);

    // Solid 3D Ornate Brass Inlay Rings on the felt
    // Uses true 3D Torus geometry with thickness & distinct elevation to completely prevent Z-fighting and flickering on mobile
    const mandalaRingGeo = new THREE.TorusGeometry(2.54, 0.024, 8, 64);
    const mandalaRingMat = new THREE.MeshStandardMaterial({
      color: 0xd4af37,
      roughness: 0.25,
      metalness: 0.84,
    });
    const mandalaRing = new THREE.Mesh(mandalaRingGeo, mandalaRingMat);
    mandalaRing.rotation.x = Math.PI / 2;
    mandalaRing.position.y = 0.12;
    trayGroup.add(mandalaRing);

    // Inner subtle secondary gold ring for traditional mandala inlay
    const innerRingGeo = new THREE.TorusGeometry(1.85, 0.016, 8, 64);
    const innerRing = new THREE.Mesh(innerRingGeo, mandalaRingMat);
    innerRing.rotation.x = Math.PI / 2;
    innerRing.position.y = 0.118;
    trayGroup.add(innerRing);

    // Tray Outer Wall (Deep dark carved Himalayan Rosewood)
    const rimWallGeo = new THREE.TorusGeometry(3.52, 0.25, 16, 64);
    const rimMat = new THREE.MeshStandardMaterial({
      color: 0x241006, // Deep dark rosewood with subtle warm tint
      roughness: 0.3,
      metalness: 0.2,
    });
    const rimWall = new THREE.Mesh(rimWallGeo, rimMat);
    rimWall.rotation.x = Math.PI / 2;
    rimWall.position.y = 0.25;
    rimWall.castShadow = true;
    rimWall.receiveShadow = true;
    trayGroup.add(rimWall);

    // Brass Accent Bevel on the Tray Lip
    const brassLipGeo = new THREE.TorusGeometry(3.52, 0.06, 12, 64);
    const brassLipMat = new THREE.MeshStandardMaterial({
      color: 0xd4af37,
      metalness: 0.84,
      roughness: 0.25,
    });
    const brassLip = new THREE.Mesh(brassLipGeo, brassLipMat);
    brassLip.rotation.x = Math.PI / 2;
    brassLip.position.y = 0.36;
    trayGroup.add(brassLip);

    // 3. Authentic Traditional Nepali Khor (Ornate Burnished Brass Vessel)
    const cupGroup = new THREE.Group();
    cupRef.current = cupGroup;

    const cupPoints: THREE.Vector2[] = [];
    // Stepped weighted pedestal base
    cupPoints.push(new THREE.Vector2(0, 0));
    cupPoints.push(new THREE.Vector2(1.22, 0));
    cupPoints.push(new THREE.Vector2(1.36, 0.10));
    cupPoints.push(new THREE.Vector2(1.26, 0.22));
    // Tapered lower waist
    cupPoints.push(new THREE.Vector2(1.28, 0.55));
    cupPoints.push(new THREE.Vector2(1.34, 0.90));
    // Double ornamental embossed ridges
    cupPoints.push(new THREE.Vector2(1.48, 1.10));
    cupPoints.push(new THREE.Vector2(1.38, 1.18));
    cupPoints.push(new THREE.Vector2(1.52, 1.28));
    cupPoints.push(new THREE.Vector2(1.42, 1.38));
    // Flared bell collar
    cupPoints.push(new THREE.Vector2(1.64, 1.95));
    cupPoints.push(new THREE.Vector2(1.78, 2.22));
    // Heavy rolled brass bullnose mouth lip
    cupPoints.push(new THREE.Vector2(1.88, 2.34));
    cupPoints.push(new THREE.Vector2(1.78, 2.42));
    cupPoints.push(new THREE.Vector2(1.65, 2.38));
    // Hollow inner cavity with realistic metal wall thickness
    cupPoints.push(new THREE.Vector2(1.52, 2.00));
    cupPoints.push(new THREE.Vector2(1.30, 1.30));
    cupPoints.push(new THREE.Vector2(1.15, 0.45));
    cupPoints.push(new THREE.Vector2(1.02, 0.22));
    cupPoints.push(new THREE.Vector2(0, 0.20));

    const cupGeo = new THREE.LatheGeometry(cupPoints, 40);
    const brassMat = new THREE.MeshStandardMaterial({
      color: 0xd9b343,
      metalness: 0.80,
      roughness: 0.25,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 1.0,
    });
    const cupMesh = new THREE.Mesh(cupGeo, brassMat);
    cupMesh.castShadow = true;
    cupMesh.rotation.z = Math.PI; // Inverted so mouth covers dice
    cupMesh.position.y = 1.21;
    cupGroup.add(cupMesh);

    // Decorative 24K Gold Accent Rings & Traditional Flank Medallion
    const goldTrimMat = new THREE.MeshStandardMaterial({
      color: 0xffd700,
      metalness: 0.88,
      roughness: 0.15,
      transparent: true,
      opacity: 1.0,
    });

    // Mouth lip gold ring
    const lipRingGeo = new THREE.TorusGeometry(1.84, 0.045, 10, 40);
    const lipRing = new THREE.Mesh(lipRingGeo, goldTrimMat);
    lipRing.rotation.x = Math.PI / 2;
    lipRing.position.y = -1.21;
    cupGroup.add(lipRing);

    // Waist rib gold rings
    const waistRing1Geo = new THREE.TorusGeometry(1.48, 0.035, 10, 40);
    const waistRing1 = new THREE.Mesh(waistRing1Geo, goldTrimMat);
    waistRing1.rotation.x = Math.PI / 2;
    waistRing1.position.y = 0.11;
    cupGroup.add(waistRing1);

    const waistRing2Geo = new THREE.TorusGeometry(1.52, 0.035, 10, 40);
    const waistRing2 = new THREE.Mesh(waistRing2Geo, goldTrimMat);
    waistRing2.rotation.x = Math.PI / 2;
    waistRing2.position.y = -0.07;
    cupGroup.add(waistRing2);

    // Base pedestal accent ring
    const basePedestalRingGeo = new THREE.TorusGeometry(1.36, 0.04, 10, 40);
    const basePedestalRing = new THREE.Mesh(basePedestalRingGeo, goldTrimMat);
    basePedestalRing.rotation.x = Math.PI / 2;
    basePedestalRing.position.y = 1.11;
    cupGroup.add(basePedestalRing);

    // Traditional Royal Solar Emblem on bucket flank
    const medallionGeo = new THREE.TorusGeometry(0.22, 0.03, 8, 24);
    const medallion = new THREE.Mesh(medallionGeo, goldTrimMat);
    medallion.position.set(0, 0.02, 1.48);
    cupGroup.add(medallion);

    const studGeo = new THREE.SphereGeometry(0.08, 8, 8);
    const stud = new THREE.Mesh(studGeo, goldTrimMat);
    stud.position.set(0, 0.02, 1.48);
    cupGroup.add(stud);

    cupGroup.position.set(0, 2.30, 0);
    cupGroup.visible = false;
    scene.add(cupGroup);

    // 4. 6 Rounded Tactile Dice with 56-Vertex Beveled Geometry (2 segments along bevel edges)
    const diceMaterials = getLangurBurjaDiceMaterials();
    const dieGeometry = createBeveledDiceGeometry(0.74, 0.08);

    const wireframeGeo = new THREE.WireframeGeometry(dieGeometry);
    const wireframeLineMat = new THREE.LineBasicMaterial({
      color: 0x38bdf8,
      linewidth: 1.5,
      transparent: true,
      opacity: 0.9,
    });

    const glowRingGeo = new THREE.RingGeometry(0.42, 0.65, 32);
    const glowRingMat = new THREE.MeshBasicMaterial({
      color: 0xffd700,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
    });

    const states: DieState[] = [];

    for (let i = 0; i < 6; i++) {
      const mesh = new THREE.Mesh(dieGeometry, diceMaterials);
      mesh.castShadow = true;
      mesh.receiveShadow = true;

      const restPos = getInitialScatteredPosition(i);
      mesh.position.copy(restPos);

      const symbol = initialDiceRef.current[i] || 'burja';
      const [rx, ry, rz] = getBaseRotationForSymbol(symbol);
      const randomY = Math.sin(i * 4.7 + 1.2) * 0.38;
      const targetEuler = new THREE.Euler(rx, ry + randomY, rz, 'YXZ');
      const targetQuat = new THREE.Quaternion().setFromEuler(targetEuler);

      mesh.quaternion.copy(targetQuat);

      // High-contrast debug wireframe lines overlay (56 vertices / 108 tris)
      const wireframeLines = new THREE.LineSegments(wireframeGeo, wireframeLineMat);
      wireframeLines.name = 'dieWireframe';
      wireframeLines.visible = showWireframeRef.current;
      mesh.add(wireframeLines);

      scene.add(mesh);

      // Floor glow halo for winner highlight (elevated with polygonOffset to never flicker)
      const glowRing = new THREE.Mesh(glowRingGeo, glowRingMat.clone());
      glowRing.name = 'glowRing';
      glowRing.rotation.x = -Math.PI / 2;
      glowRing.position.set(restPos.x, 0.115, restPos.z);
      glowRing.visible = false;
      scene.add(glowRing);

      states.push({
        mesh,
        targetPos: restPos.clone(),
        targetQuat: targetQuat.clone(),
        currentPos: restPos.clone(),
        currentQuat: targetQuat.clone(),
        glowRing,
      });
    }

    diceStatesRef.current = states;

    // 5. Intuitive Touch & Pointer Orbit Controls (Double-tap to reset, pinch to zoom, single-finger orbit)
    const dom = renderer.domElement;
    dom.style.touchAction = 'none';

    const activePointers = new Map<number, { x: number; y: number }>();
    let prevPinchDist: number | null = null;
    let prevPointerX = 0;
    let prevPointerY = 0;
    let lastTapTime = 0;

    const handlePointerDown = (e: PointerEvent) => {
      dom.setPointerCapture(e.pointerId);
      activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      prevPointerX = e.clientX;
      prevPointerY = e.clientY;
    };

    const handlePointerMove = (e: PointerEvent) => {
      if (!activePointers.has(e.pointerId)) return;
      activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (activePointers.size === 1) {
        // Single pointer drag: orbit camera smoothly
        const deltaX = (e.clientX - prevPointerX) * 0.0075;
        const deltaY = (e.clientY - prevPointerY) * 0.006;

        targetCamRef.current.angleX -= deltaX * 1.5;
        // User moves hand from up to down -> view moves smoothly with the hand along Y axis
        targetCamRef.current.height = Math.max(
          3.8,
          Math.min(8.8, targetCamRef.current.height + deltaY * 2.4)
        );
        targetCamRef.current.radius = Math.max(
          3.0,
          Math.min(7.2, targetCamRef.current.radius - deltaY * 0.9)
        );

        prevPointerX = e.clientX;
        prevPointerY = e.clientY;
      } else if (activePointers.size === 2) {
        // Two-pointer pinch to zoom
        const pts = Array.from(activePointers.values());
        const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);

        if (prevPinchDist !== null) {
          const deltaDist = dist - prevPinchDist;
          targetCamRef.current.radius = Math.max(
            2.4,
            Math.min(11.5, targetCamRef.current.radius - deltaDist * 0.015)
          );
          targetCamRef.current.height = Math.max(
            3.0,
            Math.min(13.5, targetCamRef.current.height - deltaDist * 0.015)
          );
        }
        prevPinchDist = dist;
      }
    };

    const handlePointerUp = (e: PointerEvent) => {
      activePointers.delete(e.pointerId);
      try {
        dom.releasePointerCapture(e.pointerId);
      } catch {
        // Pointer capture release safeguard
      }
      if (activePointers.size < 2) {
        prevPinchDist = null;
      }
    };

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      targetCamRef.current.radius = Math.max(
        2.4,
        Math.min(11.5, targetCamRef.current.radius + e.deltaY * 0.005)
      );
      targetCamRef.current.height = Math.max(
        3.0,
        Math.min(13.5, targetCamRef.current.height + e.deltaY * 0.005)
      );
    };

    dom.addEventListener('pointerdown', handlePointerDown);
    dom.addEventListener('pointermove', handlePointerMove);
    dom.addEventListener('pointerup', handlePointerUp);
    dom.addEventListener('pointercancel', handlePointerUp);
    dom.addEventListener('wheel', handleWheel, { passive: false });

    // 6. Traditional Langur Burja Table Shake & Bucket Reveal Animation Loop
    const floorY = 0.47; // Die center Y so bottom sits flat on felt floor at y = 0.10
    let lastFrameTime = performance.now();
    let currentShakeZoom = 0;
    let currentLookAtY = 0.25;

    const animate = (time: number) => {
      animationFrameRef.current = requestAnimationFrame(animate);
      lastFrameTime = time;

      // Compute dynamic zoom-out during bucket shake so the bucket never looks too close to the camera
      let targetShakeZoom = 0;
      let targetLookAtY = 0.25;

      if (isRollingAnimRef.current) {
        const elapsed = (time - animStartTimeRef.current) / 1000;
        if (elapsed < 2.00) {
          // Shaking bucket in the air: smoothly zoom out further and raise camera focal point towards the elevated bucket
          const rampIn = Math.min(1, elapsed / 0.55);
          targetShakeZoom = rampIn;
          targetLookAtY = 0.25 + rampIn * 0.85;
        } else if (elapsed < 2.65) {
          // Turning bucket upside down in the air: maintain wide zoomed-out view
          targetShakeZoom = 1.0;
          targetLookAtY = 1.10;
        } else if (elapsed < 3.35) {
          // Placing bucket onto the table: smoothly glide camera back in as bucket settles onto felt
          const putProgress = Math.min(1, (elapsed - 2.65) / 0.70);
          const easeProgress = 1 - putProgress;
          targetShakeZoom = easeProgress;
          targetLookAtY = 0.25 + easeProgress * 0.85;
        } else {
          // Bucket on table felt & lifting for reveal: full close-up focus on the table and dice
          targetShakeZoom = 0;
          targetLookAtY = 0.25;
        }
      }

      currentShakeZoom = THREE.MathUtils.lerp(currentShakeZoom, targetShakeZoom, 0.065);
      currentLookAtY = THREE.MathUtils.lerp(currentLookAtY, targetLookAtY, 0.065);

      // Smoothly pull back camera distance (+62% radius and +44% height) when zoomed out during shaking
      const zoomFactor = 1.0 + currentShakeZoom * 0.62;
      const heightFactor = 1.0 + currentShakeZoom * 0.44;

      const effectiveRadius = targetCamRef.current.radius * zoomFactor;
      const effectiveHeight = targetCamRef.current.height * heightFactor;

      const targetX = Math.sin(targetCamRef.current.angleX) * effectiveRadius;
      const targetZ = Math.cos(targetCamRef.current.angleX) * effectiveRadius;
      camera.position.x = THREE.MathUtils.lerp(camera.position.x, targetX, 0.065);
      camera.position.z = THREE.MathUtils.lerp(camera.position.z, targetZ, 0.065);
      camera.position.y = THREE.MathUtils.lerp(camera.position.y, effectiveHeight, 0.065);
      camera.lookAt(0, currentLookAtY, 0);

      if (isRollingAnimRef.current) {
        const elapsed = (time - animStartTimeRef.current) / 1000;
        const pauseEnd = 3.25 + revealPauseDelayRef.current;
        const liftDuration = 0.85;
        const liftEnd = pauseEnd + liftDuration;

        // Stage 1: Dices are held inside the bucket, shaken vigorously with procedural variation! (0s to 2.00s)
        if (elapsed < 2.00) {
          const profile = shakeProfileRef.current;
          const { patternType, baseFreq, amp, tiltForward, swirlSpeed, wobblePhaseX, wobblePhaseZ, rattleRate } = profile;

          let sX = 0;
          let sY = 2.24;
          let sZ = 0;
          let tiltX = Math.PI + tiltForward;
          let tiltY = 0;
          let tiltZ = 0;

          if (patternType === 0) {
            // Pattern 0: Centrifugal Vortex / Swirl Shake (elliptical orbit + rolling vertical waves)
            sX = Math.cos(elapsed * (baseFreq * 0.45) + wobblePhaseX) * (amp * 1.15) + Math.sin(elapsed * baseFreq) * (amp * 0.35);
            sZ = Math.sin(elapsed * (baseFreq * 0.45) + wobblePhaseZ) * (amp * 1.15) + Math.cos(elapsed * 38) * 0.08;
            sY = 2.25 + Math.abs(Math.sin(elapsed * (baseFreq * 0.85))) * 0.28;
            tiltX = Math.PI + tiltForward + Math.sin(elapsed * baseFreq) * 0.24;
            tiltZ = Math.cos(elapsed * (baseFreq * 0.7)) * 0.30;
            tiltY = Math.sin(elapsed * (baseFreq * 0.5)) * 0.34;
          } else if (patternType === 1) {
            // Pattern 1: Aggressive Lateral Snap & Jitter (whips side-to-side with sharp wrist snaps)
            sX = Math.sin(elapsed * baseFreq) * (amp * 1.45) + Math.sin(elapsed * 54) * 0.10;
            sZ = Math.cos(elapsed * 16 + wobblePhaseZ) * (amp * 0.55);
            sY = 2.22 + Math.abs(Math.cos(elapsed * (baseFreq * 0.6))) * 0.22;
            tiltZ = Math.sin(elapsed * baseFreq) * 0.42;
            tiltX = Math.PI + tiltForward + Math.cos(elapsed * 34) * 0.20;
            tiltY = Math.sin(elapsed * 24) * 0.28;
          } else if (patternType === 2) {
            // Pattern 2: Figure-8 Infinity Cascade (sweeping infinity loop with alternating tilt angles)
            const f8 = elapsed * (baseFreq * 0.38);
            sX = Math.sin(f8) * (amp * 1.3);
            sZ = Math.sin(f8 * 2) * (amp * 0.95);
            sY = 2.26 + (Math.sin(f8 * 3.5) + 1) * 0.16;
            tiltX = Math.PI + tiltForward + Math.cos(f8 * 2) * 0.28;
            tiltZ = Math.sin(f8) * 0.34;
            tiltY = Math.cos(f8) * 0.32;
          } else {
            // Pattern 3: Dual-Pulse Pump & Micro-Rattle (intense vertical drops with snappy twists)
            sX = Math.sin(elapsed * baseFreq) * amp + Math.cos(elapsed * 44) * 0.12;
            sZ = Math.cos(elapsed * (baseFreq * 1.15)) * amp + Math.sin(elapsed * 36) * 0.10;
            sY = 2.18 + Math.pow(Math.abs(Math.sin(elapsed * (baseFreq * 0.55))), 1.4) * 0.35;
            tiltX = Math.PI + tiltForward + Math.sin(elapsed * 38) * 0.28;
            tiltZ = Math.cos(elapsed * baseFreq) * 0.24;
            tiltY = Math.sin(elapsed * 22) * 0.24;
          }

          if (cupRef.current) {
            cupRef.current.visible = true;
            cupRef.current.position.set(sX, sY, sZ);
            cupRef.current.rotation.set(tiltX, tiltY, tiltZ);
            setCupOpacity(1.0);
          }

          // Shaking rattle sound & tactile vibration with randomized cadence
          if (time - animAudioFlagsRef.current.lastShakeTime > rattleRate) {
            sound.playDiceShakeSound();
            animAudioFlagsRef.current.lastShakeTime = time;
            if (typeof navigator !== 'undefined' && navigator.vibrate) {
              navigator.vibrate(20);
            }
          }

          // Assign targets and resting positions under bucket for when revealed
          if (!newTargetsAssignedRef.current && elapsed >= 0.40) {
            newTargetsAssignedRef.current = true;
            const newPositions = getClusteredRollPositions(roundSeedRef.current);
            const rollSymbols =
              activeRollSymbolsRef.current.length === 6
                ? activeRollSymbolsRef.current
                : diceRef.current;
            diceStatesRef.current.forEach((die, idx) => {
              const newPos = newPositions[idx] || die.currentPos;
              die.currentPos.copy(newPos);
              die.targetPos.copy(newPos);

              const symbol = rollSymbols[idx] || 'burja';
              const [baseX, baseY, baseZ] = getBaseRotationForSymbol(symbol);
              const organicYaw = Math.sin(roundSeedRef.current * 2.1 + idx * 4.3) * 0.28;
              const targetEuler = new THREE.Euler(baseX, baseY + organicYaw, baseZ, 'YXZ');
              die.targetQuat.setFromEuler(targetEuler);
              die.currentQuat.copy(die.targetQuat);

              die.glowRing.position.set(newPos.x, 0.115, newPos.z);
            });
          }

          // Visibly roll, tumble and rattle all 6 dice deep at the bottom of the shaking brass bucket!
          if (cupRef.current) {
            diceStatesRef.current.forEach((die, idx) => {
              const swirlAngle = (idx * (Math.PI * 2 / 6)) + elapsed * swirlSpeed + Math.sin(elapsed * (swirlSpeed * 1.3) + idx) * 0.50;
              const orbitR = 0.27 + Math.sin(elapsed * 22 + idx * 2.1) * 0.09;
              
              const localX = Math.cos(swirlAngle) * orbitR;
              const localZ = Math.sin(swirlAngle) * orbitR;
              const bounceY = Math.abs(Math.sin(elapsed * (baseFreq * 0.95) + idx * 2.3)) * 0.18;
              const localY = 0.22 + (idx % 3) * 0.11 + bounceY;

              const localPos = new THREE.Vector3(localX, localY, localZ);
              cupRef.current!.localToWorld(localPos);
              die.mesh.position.copy(localPos);

              const tumbleEuler = new THREE.Euler(
                elapsed * (18 + idx * 3.5) + idx * 1.5,
                elapsed * (22 + idx * 4.0) + idx * 2.1,
                elapsed * (16 + idx * 3.0) + idx * 0.9,
                'XYZ'
              );
              const localQuat = new THREE.Quaternion().setFromEuler(tumbleEuler);
              die.mesh.quaternion.copy(cupRef.current!.quaternion).multiply(localQuat);

              die.mesh.visible = true;
              die.glowRing.visible = false;
            });
          }
        }
        // Stage 2: Turn upside down (2.00s to 2.65s)
        else if (elapsed < 2.65) {
          const turnProgress = Math.min(1, Math.max(0, (elapsed - 2.00) / 0.65));
          const turnEase = turnProgress * turnProgress * (3 - 2 * turnProgress);
          const startTilt = Math.PI + 0.44;
          const rotX = startTilt * (1 - turnEase); // upright tilt -> 0 (mouth down)

          if (cupRef.current) {
            cupRef.current.visible = true;
            cupRef.current.position.set(0, 2.30, 0);
            cupRef.current.rotation.set(rotX, 0, 0);
          }

          if (elapsed >= 2.35 && !animAudioFlagsRef.current.invertedTumble) {
            sound.playDiceShakeSound();
            animAudioFlagsRef.current.invertedTumble = true;
          }

          // While flipping over during first portion, dice slide from bottom towards inverted mouth
          if (turnProgress < 0.40 && cupRef.current) {
            diceStatesRef.current.forEach((die, idx) => {
              const swirlAngle = (idx * (Math.PI * 2 / 6)) + elapsed * 6;
              const orbitR = 0.28;
              const localX = Math.cos(swirlAngle) * orbitR;
              const localZ = Math.sin(swirlAngle) * orbitR;
              const localY = (0.28 - turnProgress * 0.85) + (idx % 2) * 0.12; // sliding down towards rim
              const localPos = new THREE.Vector3(localX, localY, localZ);
              cupRef.current!.localToWorld(localPos);
              die.mesh.position.copy(localPos);

              const tumbleEuler = new THREE.Euler(elapsed * 12 + idx, elapsed * 15 + idx, elapsed * 10, 'XYZ');
              const localQuat = new THREE.Quaternion().setFromEuler(tumbleEuler);
              die.mesh.quaternion.copy(cupRef.current!.quaternion).multiply(localQuat);
              die.mesh.visible = true;
            });
          } else {
            // Inverted and enclosed inside the cup
            diceStatesRef.current.forEach((die) => {
              die.mesh.visible = false;
            });
          }
        }
        // Stage 3: Put the bucket on the table (2.65s to 3.25s)
        else if (elapsed < 3.25) {
          const putProgress = Math.min(1, (elapsed - 2.65) / 0.60);
          const putEase = putProgress * putProgress;

          if (cupRef.current) {
            cupRef.current.visible = true;
            cupRef.current.position.set(0, 2.30 - putEase * 1.09, 0); // 2.30 -> 1.21
            cupRef.current.rotation.set(0, 0, 0);
          }

          if (elapsed >= 3.20 && !animAudioFlagsRef.current.cupDrop) {
            sound.playDiceLandSound();
            animAudioFlagsRef.current.cupDrop = true;
            if (typeof navigator !== 'undefined' && navigator.vibrate) {
              navigator.vibrate(35);
            }
          }

          // Dices remain hidden under bucket on table felt
          diceStatesRef.current.forEach((die) => {
            die.mesh.visible = false;
          });
        }
        // Stage 4: Anticipation pause on the table (3.25s to pauseEnd)
        // Authentic festival ritual: bucket sits firmly on the felt while suspense builds!
        else if (elapsed < pauseEnd) {
          if (cupRef.current) {
            cupRef.current.visible = true;
            cupRef.current.position.set(0, 1.21, 0);
            cupRef.current.rotation.set(0, 0, 0);
          }
          diceStatesRef.current.forEach((die) => {
            die.mesh.visible = false;
          });
        }
        // Stage 5: Reveal! Lift bucket up off table (pauseEnd to liftEnd)
        else if (elapsed < liftEnd) {
          if (!animAudioFlagsRef.current.cupLift) {
            sound.playCupLiftSound();
            animAudioFlagsRef.current.cupLift = true;
          }

          const liftProgress = (elapsed - pauseEnd) / liftDuration;
          const easeLift = 1 - Math.pow(1 - Math.min(1, liftProgress), 3);

          if (cupRef.current) {
            cupRef.current.visible = true;
            cupRef.current.position.set(0, 1.21 + easeLift * 6.5, -easeLift * 1.5);
            cupRef.current.rotation.set(-easeLift * 0.35, 0, 0);

            const fade = liftProgress > 0.60 ? 1 - (liftProgress - 0.60) / 0.40 : 1.0;
            setCupOpacity(Math.max(0, fade));
          }

          // As bucket clears the table (elapsed >= pauseEnd + 0.15s), reveal the dice on the table!
          if (elapsed >= pauseEnd + 0.15) {
            if (!animAudioFlagsRef.current.revealLand) {
              sound.playDiceLandSound();
              animAudioFlagsRef.current.revealLand = true;
            }

            diceStatesRef.current.forEach((die) => {
              die.mesh.visible = true;
              die.mesh.position.set(die.currentPos.x, floorY, die.currentPos.z);
              die.mesh.quaternion.copy(die.targetQuat);
            });
          }
        }
        // Stage 6: Reveal complete, resting on table (liftEnd and beyond)
        else {
          isRollingAnimRef.current = false;
          if (cupRef.current) {
            cupRef.current.visible = false;
          }
          diceStatesRef.current.forEach((die) => {
            die.mesh.visible = true;
            die.mesh.position.set(die.currentPos.x, floorY, die.currentPos.z);
            die.mesh.quaternion.copy(die.targetQuat);
            die.glowRing.position.set(die.currentPos.x, 0.115, die.currentPos.z);
          });
        }
      } else {
        // When not rolling: DICES ARE SHOWN THE ENTIRE TIME!
        if (cupRef.current) {
          cupRef.current.visible = false;
        }

        diceStatesRef.current.forEach((die) => {
          die.mesh.visible = true;
          die.mesh.position.y = floorY;
          die.mesh.position.x = die.currentPos.x;
          die.mesh.position.z = die.currentPos.z;
          die.mesh.quaternion.copy(die.targetQuat);
        });

        // Glowing pulse for winning dice during payout phase
        if (phaseRef.current === 'payout') {
          const pulse = 0.65 + Math.sin(time * 0.006) * 0.25;
          const rollSymbols =
            activeRollSymbolsRef.current.length === 6
              ? activeRollSymbolsRef.current
              : diceRef.current;
          const currentCounts = symbolCountsRef.current;
          diceStatesRef.current.forEach((die, idx) => {
            const symbol = rollSymbols[idx];
            const isWinner = (currentCounts[symbol] || 0) >= 2;
            if (isWinner) {
              die.glowRing.visible = true;
              (die.glowRing.material as THREE.MeshBasicMaterial).opacity = pulse;
            } else {
              die.glowRing.visible = false;
            }
          });
        } else {
          diceStatesRef.current.forEach((die) => {
            die.glowRing.visible = false;
          });
        }
      }

      renderer.render(scene, camera);
    };

    animationFrameRef.current = requestAnimationFrame(animate);

    // Responsive Canvas Resizing with instantaneous projection update and frame-synced GPU buffer sizing
    let resizeTimer: ReturnType<typeof setTimeout> | null = null;
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width: newW, height: newH } = entry.contentRect;
        if (newW > 0 && newH > 0) {
          // Instant camera aspect update avoids any distortion or lag
          camera.aspect = newW / newH;
          camera.updateProjectionMatrix();

          // Smoothly sync GPU buffer resizing on next animation frame
          if (resizeTimer) clearTimeout(resizeTimer);
          resizeTimer = setTimeout(() => {
            requestAnimationFrame(() => {
              if (rendererRef.current && mountRef.current) {
                const curW = mountRef.current.clientWidth;
                const curH = mountRef.current.clientHeight;
                if (curW > 0 && curH > 0) {
                  rendererRef.current.setSize(curW, curH, false);
                  camera.aspect = curW / curH;
                  camera.updateProjectionMatrix();
                }
              }
            });
          }, 40);
        }
      }
    });
    resizeObserver.observe(container);

    const handleContextLost = (event: Event) => {
      event.preventDefault();
    };
    renderer.domElement.addEventListener('webglcontextlost', handleContextLost, false);

    return () => {
      if (resizeTimer) clearTimeout(resizeTimer);
      cancelAnimationFrame(animationFrameRef.current);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener('webglcontextlost', handleContextLost);
      dom.removeEventListener('pointerdown', handlePointerDown);
      dom.removeEventListener('pointermove', handlePointerMove);
      dom.removeEventListener('pointerup', handlePointerUp);
      dom.removeEventListener('pointercancel', handlePointerUp);
      dom.removeEventListener('wheel', handleWheel);

      if (renderer.domElement && renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }

      renderer.dispose();
      feltGeo.dispose();
      feltMat.dispose();
      mandalaRingGeo.dispose();
      mandalaRingMat.dispose();
      innerRingGeo.dispose();
      rimWallGeo.dispose();
      rimMat.dispose();
      brassLipGeo.dispose();
      brassLipMat.dispose();
      dieGeometry.dispose();
      cupGeo.dispose();
      brassMat.dispose();
      lipRingGeo.dispose();
      waistRing1Geo.dispose();
      waistRing2Geo.dispose();
      basePedestalRingGeo.dispose();
      medallionGeo.dispose();
      studGeo.dispose();
      goldTrimMat.dispose();
      glowRingGeo.dispose();
      glowRingMat.dispose();
    };
  }, [setCupOpacity]);

  return (
    <div
      id="three-dice-arena-container"
      className={`relative w-full rounded-2xl overflow-hidden border border-amber-500/25 bg-gradient-to-b from-[#06080e] via-[#090d17] to-[#06080e] shadow-2xl select-none ${className || 'flex-1 min-h-[150px]'}`}
    >
      {/* 3D WebGL Canvas Mount */}
      <div
        ref={mountRef}
        className="w-full h-full cursor-grab active:cursor-grabbing touch-none select-none"
        style={{ touchAction: 'none' }}
      />

      {/* Simple, smaller number countdown (3... 2... 1) - never display 0 */}
      {phase === 'betting' && bettingTimer !== undefined && bettingTimer <= 3 && bettingTimer >= 1 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-30 select-none">
          <div
            key={bettingTimer}
            className="flex items-center justify-center w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-slate-950/85 border border-amber-400/70 shadow-lg backdrop-blur-sm animate-in zoom-in-75 duration-150"
          >
            <span className="font-mono text-xl sm:text-2xl font-black text-amber-400 drop-shadow">
              {bettingTimer}
            </span>
          </div>
        </div>
      )}

      {/* Small Winning Badge on Top Left */}
      {phase === 'payout' && winningSymbols.length > 0 && (
        <div className="absolute top-2 left-2 z-20 pointer-events-none animate-in fade-in duration-200">
          <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-950/90 border border-emerald-400/50 backdrop-blur-md shadow-md text-emerald-200 whitespace-nowrap">
            <span className="text-[10px] font-black text-emerald-400 uppercase tracking-wide">WON:</span>
            <div className="flex items-center gap-1 whitespace-nowrap">
              {winningSymbols.map(([symbolKey, count]) => {
                const cfg = LANGUR_BURJA_SYMBOLS[symbolKey as SymbolType];
                if (!cfg) return null;
                return (
                  <span
                    key={symbolKey}
                    className="inline-flex items-center gap-1 text-[10px] font-mono font-bold text-emerald-300 whitespace-nowrap"
                  >
                    <div className="w-3.5 h-3.5 rounded-sm overflow-hidden flex items-center justify-center shrink-0 bg-[#FAF4D0]">
                      <img
                        src={getSymbolImageDataUrl(symbolKey as SymbolType)}
                        alt={cfg.name}
                        className="w-full h-full object-cover scale-[1.34]"
                      />
                    </div>
                    <span>{count}x</span>
                  </span>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Top Center: Debug Wireframe Badge */}
      {showWireframe && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10 pointer-events-none">
          <div className="px-2.5 py-1 rounded-full bg-cyan-950/90 border border-cyan-500/70 text-cyan-300 text-[10px] font-mono font-bold tracking-wide backdrop-blur-md shadow-lg flex items-center gap-1.5 whitespace-nowrap">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
            <span>DEBUG: 56 Vertices / Die • 2-Segment Bevel • 108 Tris</span>
          </div>
        </div>
      )}

      {/* Top Right: Debug Wireframe Toggle & Reset Camera */}
      <div className="absolute top-2 right-2 z-10 flex items-center gap-1.5">
        <button
          id="wireframe-debug-btn"
          onClick={() => setShowWireframe((prev) => !prev)}
          title={showWireframe ? 'Hide 3D Wireframe (Debug)' : 'Show 3D Wireframe (Debug - 56 Vertices / Die)'}
          className={`p-1.5 rounded-xl border backdrop-blur-md shadow-md active:scale-95 transition-all flex items-center gap-1 text-[11px] font-mono ${
            showWireframe
              ? 'bg-cyan-950/90 text-cyan-300 border-cyan-400/80 shadow-[0_0_12px_rgba(6,182,212,0.4)]'
              : 'bg-slate-950/85 hover:bg-slate-900 text-slate-400 hover:text-cyan-300 border-slate-700/60 hover:border-cyan-500/40'
          }`}
        >
          <Grid className="w-3.5 h-3.5 shrink-0" />
          <span className="hidden sm:inline font-semibold">Wireframe</span>
        </button>
        <button
          id="camera-reset-btn"
          onClick={handleResetCamera}
          title="Reset Camera View"
          className="p-1.5 rounded-xl bg-slate-950/85 hover:bg-slate-900 text-slate-300 hover:text-amber-300 border border-slate-700/60 hover:border-amber-500/40 backdrop-blur-md shadow-md active:scale-95 transition-all"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Floating Tumbling Indicator during roll: Small & strictly single-line */}
      {phase === 'rolling' && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 pointer-events-none">
          <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-slate-950/90 border border-amber-400/80 text-amber-300 font-bold text-[10.5px] tracking-wide shadow-xl backdrop-blur-md animate-pulse whitespace-nowrap">
            <Sparkles className="w-3 h-3 text-amber-400 animate-spin shrink-0" />
            <span className="whitespace-nowrap">Shaking bucket & revealing...</span>
          </div>
        </div>
      )}

      {/* Bottom Right Orbit / 3D Navigation Icon */}
      <div
        id="camera-orbit-indicator"
        className="absolute bottom-2 right-2 z-10 pointer-events-none p-1.5 rounded-xl bg-slate-950/70 border border-slate-800/80 text-amber-400/80 backdrop-blur-sm shadow-sm"
        title="3D Touch Orbit & Pinch Zoom"
      >
        <Compass className="w-3.5 h-3.5" />
      </div>
    </div>
  );
};

export const ThreeDiceArena = React.memo(ThreeDiceArenaComponent);
