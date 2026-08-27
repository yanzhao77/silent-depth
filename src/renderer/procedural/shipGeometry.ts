/**
 * SILENT DEPTH V2.0 — Procedural Ship Geometry (src/renderer/procedural/shipGeometry.ts)
 *
 * Generates distinguishable 3D ship models by class using parametric geometry:
 * - Merchant: wide beam, low superstructure, general cargo
 * - Cargo: medium beam, container stacks (box arrays)
 * - Tanker: long hull, cylindrical tanks, rear superstructure
 * - Destroyer: narrow beam, gun turrets, bridge tower, mast
 * - Frigate: compact, radar dome, single gun
 *
 * Each class has distinct proportions and features so players can
 * identify targets visually through the periscope.
 *
 * All geometry is CC0 procedural — no external models.
 */

import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Ship dimensions (in km — scaled for visibility at tactical zoom)
// ---------------------------------------------------------------------------

interface ShipDimensions {
  length: number;
  beam: number;
  draft: number;
  freeboard: number;
}

const SHIP_DIMS: Record<string, ShipDimensions> = {
  Merchant:  { length: 0.12, beam: 0.025, draft: 0.008, freeboard: 0.006 },
  Cargo:     { length: 0.14, beam: 0.028, draft: 0.009, freeboard: 0.007 },
  Tanker:    { length: 0.18, beam: 0.030, draft: 0.010, freeboard: 0.005 },
  Destroyer: { length: 0.11, beam: 0.014, draft: 0.005, freeboard: 0.006 },
  Frigate:   { length: 0.09, beam: 0.013, draft: 0.004, freeboard: 0.005 },
};

// ---------------------------------------------------------------------------
// Materials (shared across ships of same type)
// ---------------------------------------------------------------------------

const HULL_COLORS: Record<string, number> = {
  Merchant: 0x4a4a4a,
  Cargo: 0x5a4a3a,
  Tanker: 0x3a3a4a,
  Destroyer: 0x4a5a5a,
  Frigate: 0x5a5a5a,
};

function getHullMaterial(shipClass: string): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: HULL_COLORS[shipClass] ?? 0x4a4a4a,
    roughness: 0.7,
    metalness: 0.2,
  });
}

function getSuperstructureMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: 0x8a8a8a,
    roughness: 0.5,
    metalness: 0.3,
  });
}

// ---------------------------------------------------------------------------
// Hull generation (parametric boat shape)
// ---------------------------------------------------------------------------

function createHullGeometry(dims: ShipDimensions): THREE.BufferGeometry {
  // Simple boat hull: elongated box with tapered bow/stern
  const shape = new THREE.Shape();
  const halfL = dims.length / 2;
  const halfB = dims.beam / 2;
  const bowTaper = dims.length * 0.15;
  const sternTaper = dims.length * 0.08;

  shape.moveTo(-halfL + sternTaper, -halfB);
  shape.lineTo(halfL - bowTaper, -halfB);
  shape.quadraticCurveTo(halfL, 0, halfL - bowTaper, halfB);
  shape.lineTo(-halfL + sternTaper, halfB);
  shape.quadraticCurveTo(-halfL, 0, -halfL + sternTaper, -halfB);

  const extrudeSettings: THREE.ExtrudeGeometryOptions = {
    depth: dims.draft + dims.freeboard,
    bevelEnabled: false,
  };
  const geo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
  // Rotate to lay flat on XZ plane (extrusion goes up Y)
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, dims.draft, 0); // Sit in water
  return geo;
}

// ---------------------------------------------------------------------------
// Per-class superstructure builders
// ---------------------------------------------------------------------------

function addMerchantSuperstructure(group: THREE.Group, dims: ShipDimensions): void {
  const mat = getSuperstructureMaterial();
  // Low bridge at rear
  const bridge = new THREE.Mesh(
    new THREE.BoxGeometry(dims.length * 0.15, dims.freeboard * 2, dims.beam * 0.6),
    mat,
  );
  bridge.position.set(-dims.length * 0.3, dims.freeboard * 2, 0);
  bridge.castShadow = true;
  group.add(bridge);

  // Mast
  const mast = new THREE.Mesh(
    new THREE.CylinderGeometry(0.001, 0.001, dims.freeboard * 4, 6),
    mat,
  );
  mast.position.set(-dims.length * 0.3, dims.freeboard * 4, 0);
  group.add(mast);
}

function addCargoSuperstructure(group: THREE.Group, dims: ShipDimensions): void {
  const mat = getSuperstructureMaterial();
  // Container stacks (colored boxes)
  const containerColors = [0xcc4444, 0x4444cc, 0x44aa44, 0xaaaa44];
  const stackCount = 4;
  const containerW = dims.length * 0.12;
  const containerH = dims.freeboard * 1.2;
  const containerD = dims.beam * 0.35;

  for (let i = 0; i < stackCount; i++) {
    const color = containerColors[i % containerColors.length]!;
    const containerMat = new THREE.MeshStandardMaterial({ color, roughness: 0.8 });
    const container = new THREE.Mesh(
      new THREE.BoxGeometry(containerW, containerH, containerD),
      containerMat,
    );
    const xPos = dims.length * 0.1 - i * containerW * 1.1;
    container.position.set(xPos, dims.freeboard + containerH / 2, 0);
    container.castShadow = true;
    group.add(container);
  }

  // Bridge at rear
  const bridge = new THREE.Mesh(
    new THREE.BoxGeometry(dims.length * 0.12, dims.freeboard * 2.5, dims.beam * 0.5),
    mat,
  );
  bridge.position.set(-dims.length * 0.35, dims.freeboard * 2.5, 0);
  bridge.castShadow = true;
  group.add(bridge);
}

function addTankerSuperstructure(group: THREE.Group, dims: ShipDimensions): void {
  const mat = getSuperstructureMaterial();
  // Cylindrical tanks along deck
  const tankGeo = new THREE.CylinderGeometry(dims.beam * 0.3, dims.beam * 0.3, dims.length * 0.5, 12);
  tankGeo.rotateZ(Math.PI / 2);
  const tankMat = new THREE.MeshStandardMaterial({ color: 0x6a6a6a, roughness: 0.4, metalness: 0.5 });
  const tank = new THREE.Mesh(tankGeo, tankMat);
  tank.position.set(dims.length * 0.05, dims.freeboard + dims.beam * 0.3, 0);
  tank.castShadow = true;
  group.add(tank);

  // Rear superstructure
  const bridge = new THREE.Mesh(
    new THREE.BoxGeometry(dims.length * 0.1, dims.freeboard * 3, dims.beam * 0.5),
    mat,
  );
  bridge.position.set(-dims.length * 0.38, dims.freeboard * 3, 0);
  bridge.castShadow = true;
  group.add(bridge);
}

function addDestroyerSuperstructure(group: THREE.Group, dims: ShipDimensions): void {
  const mat = getSuperstructureMaterial();
  // Bridge tower
  const bridge = new THREE.Mesh(
    new THREE.BoxGeometry(dims.length * 0.1, dims.freeboard * 3.5, dims.beam * 0.6),
    mat,
  );
  bridge.position.set(dims.length * 0.05, dims.freeboard * 3.5, 0);
  bridge.castShadow = true;
  group.add(bridge);

  // Gun turret forward
  const turretGeo = new THREE.CylinderGeometry(dims.beam * 0.25, dims.beam * 0.3, dims.freeboard, 8);
  const turret = new THREE.Mesh(turretGeo, mat);
  turret.position.set(dims.length * 0.3, dims.freeboard + dims.freeboard / 2, 0);
  turret.castShadow = true;
  group.add(turret);

  // Gun barrel
  const barrel = new THREE.Mesh(
    new THREE.CylinderGeometry(0.001, 0.001, dims.length * 0.12, 6),
    mat,
  );
  barrel.rotation.z = Math.PI / 2;
  barrel.position.set(dims.length * 0.36, dims.freeboard * 1.8, 0);
  group.add(barrel);

  // Mast
  const mast = new THREE.Mesh(
    new THREE.CylinderGeometry(0.0008, 0.0008, dims.freeboard * 6, 6),
    mat,
  );
  mast.position.set(dims.length * 0.05, dims.freeboard * 6, 0);
  group.add(mast);

  // Rear gun
  const rearTurret = new THREE.Mesh(
    new THREE.CylinderGeometry(dims.beam * 0.2, dims.beam * 0.25, dims.freeboard * 0.8, 8),
    mat,
  );
  rearTurret.position.set(-dims.length * 0.3, dims.freeboard + dims.freeboard * 0.4, 0);
  group.add(rearTurret);
}

function addFrigateSuperstructure(group: THREE.Group, dims: ShipDimensions): void {
  const mat = getSuperstructureMaterial();
  // Compact bridge
  const bridge = new THREE.Mesh(
    new THREE.BoxGeometry(dims.length * 0.12, dims.freeboard * 2.5, dims.beam * 0.55),
    mat,
  );
  bridge.position.set(dims.length * 0.02, dims.freeboard * 2.5, 0);
  bridge.castShadow = true;
  group.add(bridge);

  // Radar dome
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(dims.beam * 0.2, 12, 8),
    new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.3 }),
  );
  dome.position.set(dims.length * 0.02, dims.freeboard * 4.5, 0);
  group.add(dome);

  // Single forward gun
  const gun = new THREE.Mesh(
    new THREE.CylinderGeometry(dims.beam * 0.15, dims.beam * 0.2, dims.freeboard * 0.6, 8),
    mat,
  );
  gun.position.set(dims.length * 0.3, dims.freeboard + dims.freeboard * 0.3, 0);
  group.add(gun);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function createShipGeometry(shipClass: string): THREE.Group {
  const dims = SHIP_DIMS[shipClass] ?? SHIP_DIMS.Merchant!;
  const group = new THREE.Group();

  // Hull
  const hullGeo = createHullGeometry(dims);
  const hullMat = getHullMaterial(shipClass);
  const hull = new THREE.Mesh(hullGeo, hullMat);
  hull.castShadow = true;
  hull.receiveShadow = true;
  group.add(hull);

  // Waterline stripe
  const stripeGeo = new THREE.BoxGeometry(dims.length * 0.95, 0.001, dims.beam * 1.01);
  const stripeMat = new THREE.MeshBasicMaterial({ color: 0x8b0000 });
  const stripe = new THREE.Mesh(stripeGeo, stripeMat);
  stripe.position.y = dims.draft * 0.5;
  group.add(stripe);

  // Class-specific superstructure
  switch (shipClass) {
    case 'Cargo': addCargoSuperstructure(group, dims); break;
    case 'Tanker': addTankerSuperstructure(group, dims); break;
    case 'Destroyer': addDestroyerSuperstructure(group, dims); break;
    case 'Frigate': addFrigateSuperstructure(group, dims); break;
    default: addMerchantSuperstructure(group, dims); break;
  }

  return group;
}
