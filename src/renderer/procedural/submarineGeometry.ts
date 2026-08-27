/**
 * SILENT DEPTH V2.0 — Procedural Submarine Geometry (src/renderer/procedural/submarineGeometry.ts)
 *
 * Generates a detailed submarine model from primitives:
 * - Hull: lathe geometry (cigar/capsule shape)
 * - Conning tower: box with fairing
 * - Periscope: cylinder (animated separately)
 * - Propeller: disc with blades
 * - Rudder: flat plate
 * - Torpedo tubes: 4 forward openings
 *
 * All geometry is CC0 procedural — no external models.
 */

import * as THREE from 'three';

export interface SubmarineParts {
  group: THREE.Group;
  hull: THREE.Mesh;
  conningTower: THREE.Mesh;
  periscope: THREE.Mesh;
  propeller: THREE.Mesh;
  rudder: THREE.Mesh;
}

/** Length in km (realistic sub ~70m = 0.07km, but scaled for visibility). */
const SUB_LENGTH = 0.06;
const SUB_RADIUS = 0.008;
const TOWER_HEIGHT = 0.015;
const TOWER_WIDTH = 0.012;
const PERISCOPE_HEIGHT = 0.025;

export function createSubmarineGeometry(): SubmarineParts {
  const group = new THREE.Group();

  // Material: dark grey hull with subtle metallic sheen
  const hullMat = new THREE.MeshStandardMaterial({
    color: 0x2a3040,
    roughness: 0.6,
    metalness: 0.3,
  });
  const towerMat = new THREE.MeshStandardMaterial({
    color: 0x354050,
    roughness: 0.5,
    metalness: 0.4,
  });
  const periMat = new THREE.MeshStandardMaterial({
    color: 0x506070,
    roughness: 0.3,
    metalness: 0.6,
  });
  const propMat = new THREE.MeshStandardMaterial({
    color: 0xb08030,
    roughness: 0.4,
    metalness: 0.7,
  });

  // --- Hull: capsule shape via lathe ---
  const hullPoints: THREE.Vector2[] = [];
  const segments = 24;
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const x = (t - 0.5) * SUB_LENGTH;
    // Capsule profile: cylinder with rounded ends
    let r = SUB_RADIUS;
    const endFrac = 0.2; // 20% of length for each rounded end
    if (t < endFrac) {
      r *= Math.sin((t / endFrac) * Math.PI / 2);
    } else if (t > 1 - endFrac) {
      r *= Math.sin(((1 - t) / endFrac) * Math.PI / 2);
    }
    hullPoints.push(new THREE.Vector2(r, x));
  }
  const hullGeo = new THREE.LatheGeometry(hullPoints, 24);
  hullGeo.rotateZ(Math.PI / 2); // Align along X axis
  const hull = new THREE.Mesh(hullGeo, hullMat);
  hull.castShadow = true;
  hull.receiveShadow = true;
  group.add(hull);

  // --- Conning Tower ---
  const towerGeo = new THREE.BoxGeometry(TOWER_WIDTH, TOWER_HEIGHT, TOWER_WIDTH * 0.6);
  // Fairing: slightly tapered top
  const towerPositions = towerGeo.attributes.position;
  if (towerPositions) {
    for (let i = 0; i < towerPositions.count; i++) {
      const y = towerPositions.getY(i);
      if (y > 0) {
        towerPositions.setX(i, towerPositions.getX(i) * 0.7);
        towerPositions.setZ(i, towerPositions.getZ(i) * 0.7);
      }
    }
  }
  towerGeo.computeVertexNormals();
  const conningTower = new THREE.Mesh(towerGeo, towerMat);
  conningTower.position.set(0, SUB_RADIUS + TOWER_HEIGHT / 2, 0);
  conningTower.castShadow = true;
  group.add(conningTower);

  // --- Periscope ---
  const periGeo = new THREE.CylinderGeometry(0.001, 0.001, PERISCOPE_HEIGHT, 8);
  const periscope = new THREE.Mesh(periGeo, periMat);
  periscope.position.set(0, SUB_RADIUS + TOWER_HEIGHT, 0);
  // Periscope starts retracted (hidden inside tower)
  periscope.visible = false;
  group.add(periscope);

  // --- Propeller ---
  const propGroup = new THREE.Group() as unknown as THREE.Mesh;
  const bladeGeo = new THREE.BoxGeometry(0.002, 0.015, 0.004);
  for (let i = 0; i < 4; i++) {
    const blade = new THREE.Mesh(bladeGeo, propMat);
    blade.rotation.x = (i * Math.PI) / 2;
    blade.position.y = 0;
    (propGroup as unknown as THREE.Group).add(blade);
  }
  propGroup.position.set(-SUB_LENGTH / 2 - 0.002, 0, 0);
  group.add(propGroup as unknown as THREE.Mesh);

  // --- Rudder ---
  const rudderGeo = new THREE.BoxGeometry(0.008, 0.018, 0.002);
  const rudder = new THREE.Mesh(rudderGeo, hullMat);
  rudder.position.set(-SUB_LENGTH / 2 - 0.005, 0, 0);
  group.add(rudder);

  return { group, hull, conningTower, periscope, propeller: propGroup, rudder };
}
