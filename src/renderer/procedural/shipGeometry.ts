/**
 * SILENT DEPTH V2.2 — Procedural Naval Ship Geometry
 *
 * Local CC0 procedural ship families. Each family has deliberately different
 * massing and identifying hardware; LODs reduce decoration before silhouette.
 * Nothing in this module reads or writes simulation state.
 */

import * as THREE from 'three';

export type ShipLodLevel = 0 | 1 | 2 | 3;
export const SHIP_LOD_DISTANCES_KM: readonly [number, number, number] = [0.18, 0.62, 1.7];

interface ShipDimensions {
  length: number;
  beam: number;
  draft: number;
  freeboard: number;
  bowFlare: number;
  sternWidth: number;
}

interface ShipDetail {
  readonly cargoRows: number;
  readonly tankCount: number;
  readonly hatchCount: number;
  readonly railSections: number;
  readonly windowCount: number;
  readonly includeNavigationLights: boolean;
  readonly includeWeapons: boolean;
  readonly includeSecondaryDetails: boolean;
}

interface ShipMaterials {
  readonly hull: THREE.MeshStandardMaterial;
  readonly superstructure: THREE.MeshStandardMaterial;
  readonly deck: THREE.MeshStandardMaterial;
  readonly waterline: THREE.MeshStandardMaterial;
  readonly glass: THREE.MeshStandardMaterial;
  readonly metal: THREE.MeshStandardMaterial;
  readonly weapon: THREE.MeshStandardMaterial;
  readonly pipe: THREE.MeshStandardMaterial;
  readonly rust: THREE.MeshStandardMaterial;
  readonly portLight: THREE.MeshStandardMaterial;
  readonly starboardLight: THREE.MeshStandardMaterial;
  readonly sternLight: THREE.MeshStandardMaterial;
}

const SHIP_DIMS: Readonly<Record<string, ShipDimensions>> = {
  Merchant: { length: 0.120, beam: 0.022, draft: 0.008, freeboard: 0.006, bowFlare: 0.12, sternWidth: 0.85 },
  Cargo: { length: 0.150, beam: 0.025, draft: 0.009, freeboard: 0.007, bowFlare: 0.14, sternWidth: 0.80 },
  Tanker: { length: 0.190, beam: 0.028, draft: 0.010, freeboard: 0.005, bowFlare: 0.10, sternWidth: 0.88 },
  Destroyer: { length: 0.120, beam: 0.013, draft: 0.004, freeboard: 0.006, bowFlare: 0.18, sternWidth: 0.70 },
  Frigate: { length: 0.100, beam: 0.014, draft: 0.004, freeboard: 0.005, bowFlare: 0.15, sternWidth: 0.75 },
};

const DETAIL_BY_LOD: Readonly<Record<ShipLodLevel, ShipDetail>> = {
  0: { cargoRows: 8, tankCount: 5, hatchCount: 4, railSections: 3, windowCount: 4, includeNavigationLights: true, includeWeapons: true, includeSecondaryDetails: true },
  1: { cargoRows: 6, tankCount: 4, hatchCount: 3, railSections: 2, windowCount: 3, includeNavigationLights: true, includeWeapons: true, includeSecondaryDetails: true },
  2: { cargoRows: 3, tankCount: 3, hatchCount: 2, railSections: 0, windowCount: 1, includeNavigationLights: false, includeWeapons: true, includeSecondaryDetails: false },
  3: { cargoRows: 1, tankCount: 1, hatchCount: 1, railSections: 0, windowCount: 0, includeNavigationLights: false, includeWeapons: false, includeSecondaryDetails: false },
};

const HULL_COLORS: Readonly<Record<string, number>> = {
  Merchant: 0x3d4649,
  Cargo: 0x485052,
  Tanker: 0x343d43,
  Destroyer: 0x3e5055,
  Frigate: 0x53616a,
};

const SUPERSTRUCTURE_COLORS: Readonly<Record<string, number>> = {
  Merchant: 0x738084,
  Cargo: 0x788386,
  Tanker: 0x68777b,
  Destroyer: 0x657b80,
  Frigate: 0x71838c,
};

function createMaterials(shipClass: string): ShipMaterials {
  return {
    hull: new THREE.MeshStandardMaterial({ color: HULL_COLORS[shipClass] ?? HULL_COLORS.Merchant, roughness: 0.57, metalness: 0.48 }),
    superstructure: new THREE.MeshStandardMaterial({ color: SUPERSTRUCTURE_COLORS[shipClass] ?? SUPERSTRUCTURE_COLORS.Merchant, roughness: 0.48, metalness: 0.42 }),
    deck: new THREE.MeshStandardMaterial({ color: 0x283136, roughness: 0.79, metalness: 0.24 }),
    waterline: new THREE.MeshStandardMaterial({ color: 0x5c2927, roughness: 0.78, metalness: 0.12 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x06151a, roughness: 0.13, metalness: 0.55, emissive: 0x020607, emissiveIntensity: 0.16 }),
    metal: new THREE.MeshStandardMaterial({ color: 0x667176, roughness: 0.48, metalness: 0.63 }),
    weapon: new THREE.MeshStandardMaterial({ color: 0x3d5155, roughness: 0.42, metalness: 0.57 }),
    pipe: new THREE.MeshStandardMaterial({ color: 0x8a7760, roughness: 0.39, metalness: 0.69 }),
    rust: new THREE.MeshStandardMaterial({ color: 0x693f30, roughness: 0.86, metalness: 0.09 }),
    portLight: new THREE.MeshStandardMaterial({ color: 0x4b100e, roughness: 0.36, metalness: 0.12, emissive: 0x7c0b06, emissiveIntensity: 0.40 }),
    starboardLight: new THREE.MeshStandardMaterial({ color: 0x073128, roughness: 0.36, metalness: 0.12, emissive: 0x067451, emissiveIntensity: 0.32 }),
    sternLight: new THREE.MeshStandardMaterial({ color: 0x4c461c, roughness: 0.38, metalness: 0.11, emissive: 0x7d6b1b, emissiveIntensity: 0.30 }),
  };
}

function add(group: THREE.Group, object: THREE.Object3D, name: string, castShadow = false): void {
  object.name = name;
  if (object instanceof THREE.Mesh) object.castShadow = castShadow;
  group.add(object);
}

function createHullGeometry(dims: ShipDimensions): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  const halfLength = dims.length / 2;
  const halfBeam = dims.beam / 2;
  const bowTaper = dims.length * dims.bowFlare;
  const sternTaper = dims.length * 0.06;
  const sternBeam = halfBeam * dims.sternWidth;
  shape.moveTo(-halfLength + sternTaper, -sternBeam);
  shape.lineTo(halfLength - bowTaper, -halfBeam);
  shape.quadraticCurveTo(halfLength + dims.beam * 0.05, -halfBeam * 0.3, halfLength, 0);
  shape.quadraticCurveTo(halfLength + dims.beam * 0.05, halfBeam * 0.3, halfLength - bowTaper, halfBeam);
  shape.lineTo(-halfLength + sternTaper, sternBeam);
  shape.quadraticCurveTo(-halfLength, 0, -halfLength + sternTaper, -sternBeam);
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: dims.draft + dims.freeboard, bevelEnabled: false });
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, dims.draft, 0);
  return geometry;
}

function addBridge(
  group: THREE.Group,
  dims: ShipDimensions,
  materials: ShipMaterials,
  positionX: number,
  widthFactor: number,
  heightFactor: number,
  detail: ShipDetail,
): void {
  const bridge = new THREE.Mesh(
    new THREE.BoxGeometry(dims.length * 0.115, dims.freeboard * heightFactor, dims.beam * widthFactor),
    materials.superstructure,
  );
  bridge.position.set(positionX, dims.freeboard * heightFactor, 0);
  add(group, bridge, 'bridge-superstructure', true);

  if (detail.windowCount === 0) return;
  for (let i = 0; i < detail.windowCount; i++) {
    const offset = (i - (detail.windowCount - 1) / 2) * dims.length * 0.022;
    const window = new THREE.Mesh(
      new THREE.BoxGeometry(dims.length * 0.016, dims.freeboard * 0.34, dims.beam * (widthFactor + 0.02)),
      materials.glass,
    );
    window.position.set(positionX + offset, dims.freeboard * (heightFactor + 0.32), 0);
    add(group, window, 'bridge-window');
  }
}

function addDeckRails(group: THREE.Group, dims: ShipDimensions, materials: ShipMaterials, detail: ShipDetail): void {
  for (let i = 0; i < detail.railSections; i++) {
    const x = -dims.length * 0.12 + i * dims.length * 0.10;
    for (const side of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.00012, 0.00012, dims.freeboard * 1.15, 5), materials.metal);
      post.position.set(x, dims.freeboard * 1.55, side * dims.beam * 0.43);
      add(group, post, 'deck-rail-post');
    }
    for (const side of [-1, 1]) {
      const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.00010, 0.00010, dims.length * 0.085, 5), materials.metal);
      rail.rotation.z = Math.PI / 2;
      rail.position.set(x + dims.length * 0.042, dims.freeboard * 2.1, side * dims.beam * 0.43);
      add(group, rail, 'deck-rail');
    }
  }
}

function addNavigationLights(group: THREE.Group, dims: ShipDimensions, materials: ShipMaterials, detail: ShipDetail): void {
  if (!detail.includeNavigationLights) return;
  const radius = Math.max(0.00025, dims.beam * 0.028);
  const port = new THREE.Mesh(new THREE.SphereGeometry(radius, 6, 4), materials.portLight);
  port.position.set(dims.length * 0.43, dims.freeboard * 1.45, -dims.beam * 0.44);
  add(group, port, 'port-navigation-light');
  const starboard = new THREE.Mesh(new THREE.SphereGeometry(radius, 6, 4), materials.starboardLight);
  starboard.position.set(dims.length * 0.43, dims.freeboard * 1.45, dims.beam * 0.44);
  add(group, starboard, 'starboard-navigation-light');
  const stern = new THREE.Mesh(new THREE.SphereGeometry(radius, 6, 4), materials.sternLight);
  stern.position.set(-dims.length * 0.46, dims.freeboard * 1.45, 0);
  add(group, stern, 'stern-navigation-light');
}

function addMerchant(group: THREE.Group, dims: ShipDimensions, materials: ShipMaterials, detail: ShipDetail): void {
  addBridge(group, dims, materials, -dims.length * 0.32, 0.56, 2.30, detail);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.0007, 0.0009, dims.freeboard * 5.3, 6), materials.metal);
  mast.position.set(dims.length * 0.05, dims.freeboard * 3.2, 0);
  add(group, mast, 'merchant-cargo-mast', true);
  const craneArm = new THREE.Mesh(new THREE.BoxGeometry(dims.length * 0.10, 0.00055, 0.00055), materials.metal);
  craneArm.position.set(dims.length * 0.05, dims.freeboard * 5.3, 0);
  add(group, craneArm, 'merchant-crane-arm');
  for (let i = 0; i < detail.hatchCount; i++) {
    const hatch = new THREE.Mesh(new THREE.BoxGeometry(dims.length * 0.13, 0.00055, dims.beam * 0.52), materials.deck);
    hatch.position.set(dims.length * 0.18 - i * dims.length * 0.17, dims.freeboard + 0.00036, 0);
    add(group, hatch, 'merchant-cargo-hatch');
  }
  if (detail.includeSecondaryDetails) {
    const rustPatch = new THREE.Mesh(new THREE.BoxGeometry(dims.length * 0.10, dims.freeboard * 0.20, 0.00020), materials.rust);
    rustPatch.position.set(-dims.length * 0.06, dims.freeboard * 0.72, dims.beam * 0.505);
    add(group, rustPatch, 'merchant-weathering');
  }
}

function addCargo(group: THREE.Group, dims: ShipDimensions, materials: ShipMaterials, detail: ShipDetail): void {
  const mutedContainerMats = [
    new THREE.MeshStandardMaterial({ color: 0x7b4a42, roughness: 0.79, metalness: 0.17 }),
    new THREE.MeshStandardMaterial({ color: 0x435c68, roughness: 0.78, metalness: 0.19 }),
    new THREE.MeshStandardMaterial({ color: 0x526b5a, roughness: 0.77, metalness: 0.18 }),
    new THREE.MeshStandardMaterial({ color: 0x75684a, roughness: 0.80, metalness: 0.16 }),
  ];
  const containerLength = dims.length * 0.090;
  const containerHeight = dims.freeboard * 1.10;
  const containerDepth = dims.beam * 0.34;
  for (let row = 0; row < detail.cargoRows; row++) {
    const material = mutedContainerMats[row % mutedContainerMats.length]!;
    const x = dims.length * 0.20 - row * containerLength * 0.94;
    const container = new THREE.Mesh(new THREE.BoxGeometry(containerLength, containerHeight, containerDepth), material);
    container.position.set(x, dims.freeboard + containerHeight / 2, 0);
    add(group, container, 'cargo-container', true);
    if (detail.includeSecondaryDetails && row % 2 === 0) {
      const upper = new THREE.Mesh(new THREE.BoxGeometry(containerLength * 0.94, containerHeight * 0.72, containerDepth * 0.94), material);
      upper.position.set(x, dims.freeboard + containerHeight + containerHeight * 0.36, 0);
      add(group, upper, 'cargo-container-upper', true);
    }
  }
  addBridge(group, dims, materials, -dims.length * 0.36, 0.53, 3.15, detail);
  const funnel = new THREE.Mesh(new THREE.CylinderGeometry(0.0020, 0.0025, dims.freeboard * 2.25, 8), materials.deck);
  funnel.position.set(-dims.length * 0.25, dims.freeboard * 2.55, dims.beam * 0.15);
  add(group, funnel, 'cargo-funnel', true);
}

function addTanker(group: THREE.Group, dims: ShipDimensions, materials: ShipMaterials, detail: ShipDetail): void {
  const tankLength = dims.length * 0.13;
  const tankRadius = dims.beam * 0.245;
  for (let i = 0; i < detail.tankCount; i++) {
    const dome = new THREE.Mesh(new THREE.CylinderGeometry(tankRadius, tankRadius, tankLength, 14), materials.superstructure);
    dome.rotation.z = Math.PI / 2;
    dome.position.set(dims.length * 0.22 - i * tankLength * 1.18, dims.freeboard + tankRadius, 0);
    add(group, dome, 'tanker-deck-tank', true);
  }
  for (const side of [-1, 1]) {
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.00042, 0.00042, dims.length * 0.66, 6), materials.pipe);
    pipe.rotation.z = Math.PI / 2;
    pipe.position.set(dims.length * 0.03, dims.freeboard + 0.0012, side * dims.beam * 0.35);
    add(group, pipe, 'tanker-pipeline');
  }
  addBridge(group, dims, materials, -dims.length * 0.38, 0.57, 3.60, detail);
  const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.0020, 0.0028, dims.freeboard * 2.6, 8), materials.deck);
  stack.position.set(-dims.length * 0.27, dims.freeboard * 3.1, dims.beam * 0.13);
  add(group, stack, 'tanker-funnel', true);
  if (detail.includeSecondaryDetails) {
    const manifold = new THREE.Mesh(new THREE.BoxGeometry(dims.length * 0.10, dims.freeboard * 0.46, dims.beam * 0.36), materials.rust);
    manifold.position.set(dims.length * 0.01, dims.freeboard * 1.35, 0);
    add(group, manifold, 'tanker-manifold');
  }
}

function addGun(group: THREE.Group, x: number, y: number, dims: ShipDimensions, materials: ShipMaterials, name: string): void {
  const turret = new THREE.Mesh(new THREE.CylinderGeometry(dims.beam * 0.18, dims.beam * 0.22, dims.freeboard * 0.65, 12), materials.weapon);
  turret.position.set(x, y, 0);
  add(group, turret, `${name}-turret`, true);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.00068, 0.00068, dims.length * 0.095, 6), materials.weapon);
  barrel.rotation.z = Math.PI / 2;
  barrel.position.set(x + dims.length * 0.05, y + dims.freeboard * 0.42, 0);
  add(group, barrel, `${name}-barrel`);
}

function addDestroyer(group: THREE.Group, dims: ShipDimensions, materials: ShipMaterials, detail: ShipDetail): void {
  addBridge(group, dims, materials, dims.length * 0.08, 0.54, 4.10, detail);
  if (detail.includeWeapons) {
    addGun(group, dims.length * 0.31, dims.freeboard * 1.38, dims, materials, 'destroyer-forward-gun');
    addGun(group, -dims.length * 0.26, dims.freeboard * 1.30, dims, materials, 'destroyer-aft-gun');
  }
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.00056, 0.00068, dims.freeboard * 7.4, 6), materials.metal);
  mast.position.set(dims.length * 0.06, dims.freeboard * 6.0, 0);
  add(group, mast, 'destroyer-lattice-mast', true);
  if (detail.includeSecondaryDetails) {
    const radar = new THREE.Mesh(new THREE.BoxGeometry(0.00045, 0.00042, dims.beam * 0.72), materials.metal);
    radar.position.set(dims.length * 0.06, dims.freeboard * 9.7, 0);
    add(group, radar, 'destroyer-radar-crossbar');
    for (const side of [-1, 1]) {
      const rack = new THREE.Mesh(new THREE.BoxGeometry(dims.length * 0.09, dims.freeboard * 0.50, dims.beam * 0.16), materials.weapon);
      rack.position.set(-dims.length * 0.08, dims.freeboard * 1.20, side * dims.beam * 0.31);
      add(group, rack, 'destroyer-torpedo-rack');
    }
  }
  const funnel = new THREE.Mesh(new THREE.CylinderGeometry(0.0019, 0.00245, dims.freeboard * 2.2, 8), materials.deck);
  funnel.position.set(-dims.length * 0.10, dims.freeboard * 2.65, 0);
  funnel.rotation.z = 0.12;
  add(group, funnel, 'destroyer-raked-funnel', true);
}

function addFrigate(group: THREE.Group, dims: ShipDimensions, materials: ShipMaterials, detail: ShipDetail): void {
  // A broad bridge, enclosed mast, hangar and long flight deck separate frigates
  // from the taller, dual-turret destroyer at all usable ranges.
  addBridge(group, dims, materials, dims.length * 0.05, 0.64, 3.15, detail);
  if (detail.includeWeapons) addGun(group, dims.length * 0.32, dims.freeboard * 1.25, dims, materials, 'frigate-forward-gun');

  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.00075, 0.00092, dims.freeboard * 7.5, 8), materials.metal);
  mast.position.set(dims.length * 0.045, dims.freeboard * 6.2, 0);
  add(group, mast, 'frigate-enclosed-radar-mast', true);
  const array = new THREE.Mesh(new THREE.BoxGeometry(dims.length * 0.055, dims.freeboard * 1.50, 0.00065), materials.weapon);
  array.position.set(dims.length * 0.045, dims.freeboard * 8.7, 0);
  add(group, array, 'frigate-radar-array');

  const hangar = new THREE.Mesh(new THREE.BoxGeometry(dims.length * 0.13, dims.freeboard * 2.10, dims.beam * 0.52), materials.superstructure);
  hangar.position.set(-dims.length * 0.20, dims.freeboard * 2.10, 0);
  add(group, hangar, 'frigate-hangar', true);
  const flightDeck = new THREE.Mesh(new THREE.BoxGeometry(dims.length * 0.24, 0.00050, dims.beam * 0.66), materials.deck);
  flightDeck.position.set(-dims.length * 0.34, dims.freeboard + 0.0003, 0);
  add(group, flightDeck, 'frigate-flight-deck');
  if (detail.includeSecondaryDetails) {
    const landingMark = new THREE.Mesh(new THREE.RingGeometry(dims.beam * 0.15, dims.beam * 0.17, 16), materials.metal);
    landingMark.rotation.x = -Math.PI / 2;
    landingMark.position.set(-dims.length * 0.38, dims.freeboard + 0.00062, 0);
    add(group, landingMark, 'frigate-flight-deck-marking');
  }
  const funnel = new THREE.Mesh(new THREE.CylinderGeometry(0.00175, 0.00225, dims.freeboard * 1.95, 8), materials.deck);
  funnel.position.set(-dims.length * 0.08, dims.freeboard * 2.35, 0);
  add(group, funnel, 'frigate-low-funnel', true);
}

/** Builds one local ship LOD. LOD changes remove decoration, never class silhouette. */
export function createShipGeometry(shipClass: string, lod: ShipLodLevel = 1): THREE.Group {
  const dims = SHIP_DIMS[shipClass] ?? SHIP_DIMS.Merchant!;
  const detail = DETAIL_BY_LOD[lod];
  const materials = createMaterials(shipClass);
  const group = new THREE.Group();
  group.name = `${shipClass.toLowerCase()}-lod${lod}`;
  group.userData.renderAssetId = `proc-${shipClass.toLowerCase()}-lod${lod}`;
  group.userData.renderOnly = true;

  const hull = new THREE.Mesh(createHullGeometry(dims), materials.hull);
  hull.receiveShadow = true;
  add(group, hull, 'ship-hull', true);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(dims.length * 0.95, 0.0007, dims.beam * 1.02), materials.waterline);
  stripe.position.y = dims.draft * 0.50;
  add(group, stripe, 'waterline-marking');
  const deck = new THREE.Mesh(new THREE.BoxGeometry(dims.length * 0.82, 0.00060, dims.beam * 0.80), materials.deck);
  deck.position.y = dims.freeboard + 0.00026;
  add(group, deck, 'main-deck');

  if ((shipClass === 'Tanker' || shipClass === 'Cargo') && lod < 3) {
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(dims.beam * 0.20, 10, 8), materials.hull);
    bulb.position.set(dims.length / 2 + dims.beam * 0.10, dims.draft * 0.30, 0);
    bulb.scale.set(0.8, 0.6, 0.5);
    add(group, bulb, 'bow-bulb');
  }

  switch (shipClass) {
    case 'Cargo': addCargo(group, dims, materials, detail); break;
    case 'Tanker': addTanker(group, dims, materials, detail); break;
    case 'Destroyer': addDestroyer(group, dims, materials, detail); break;
    case 'Frigate': addFrigate(group, dims, materials, detail); break;
    default: addMerchant(group, dims, materials, detail); break;
  }
  addDeckRails(group, dims, materials, detail);
  addNavigationLights(group, dims, materials, detail);
  return group;
}

/** Creates a distance-driven Four-level LOD root for one visible ship family. */
export function createShipLodGeometry(shipClass: string): THREE.Group {
  const root = new THREE.Group();
  const lodController = new THREE.LOD();
  for (const lod of [0, 1, 2, 3] as const) {
    const distance = lod === 0 ? 0 : SHIP_LOD_DISTANCES_KM[lod - 1]!;
    lodController.addLevel(createShipGeometry(shipClass, lod), distance);
  }
  root.name = `${shipClass.toLowerCase()}-lod-controller`;
  root.userData.renderOnly = true;
  root.add(lodController);
  return root;
}
