/**
 * SILENT DEPTH V2.2 — Procedural Hero Submarine Geometry
 *
 * The player submarine remains a local CC0 procedural asset. Four detail levels
 * preserve recognition at 50 m, 100 m and 300 m without a runtime download or
 * a simulation dependency. Geometry is presentation-only and uses kilometre
 * world units (the hull is approximately 67 m long).
 */

import * as THREE from 'three';

export type SubmarineLodLevel = 0 | 1 | 2 | 3;

export interface SubmarineParts {
  group: THREE.Group;
  hull: THREE.Mesh;
  conningTower: THREE.Mesh;
  periscope: THREE.Mesh;
  propeller: THREE.Group;
  rudder: THREE.Mesh;
}

export const SUBMARINE_LOD_DISTANCES_KM: readonly [number, number, number] = [0.105, 0.265, 0.72];

// --- Dimensions in kilometres; proportions favour a compact diesel-electric silhouette. ---
const HULL_LENGTH = 0.067;
const HULL_RADIUS = 0.007;
const TOWER_LENGTH = 0.012;
const TOWER_HEIGHT = 0.012;
const TOWER_WIDTH = 0.008;
const PERISCOPE_HEIGHT = 0.020;
const FIN_CHORD = 0.008;
const FIN_SPAN = 0.010;
const RUDDER_HEIGHT = 0.014;
const PROPELLER_RADIUS = 0.006;

interface LodDetail {
  readonly hullSamples: number;
  readonly radialSegments: number;
  readonly hatches: number;
  readonly vents: number;
  readonly railSections: number;
  readonly panelBands: number;
  readonly bladeCount: number;
  readonly towerSegments: number;
  readonly torpedoTubes: boolean;
  readonly includeGlazing: boolean;
}

const DETAIL_BY_LOD: Readonly<Record<SubmarineLodLevel, LodDetail>> = {
  0: {
    hullSamples: 56, radialSegments: 48, hatches: 8, vents: 24, railSections: 4,
    panelBands: 9, bladeCount: 5, towerSegments: 16, torpedoTubes: true, includeGlazing: true,
  },
  1: {
    hullSamples: 40, radialSegments: 32, hatches: 5, vents: 14, railSections: 2,
    panelBands: 6, bladeCount: 5, towerSegments: 12, torpedoTubes: true, includeGlazing: true,
  },
  2: {
    hullSamples: 28, radialSegments: 22, hatches: 3, vents: 6, railSections: 0,
    panelBands: 3, bladeCount: 4, towerSegments: 8, torpedoTubes: true, includeGlazing: false,
  },
  3: {
    hullSamples: 18, radialSegments: 14, hatches: 0, vents: 0, railSections: 0,
    panelBands: 0, bladeCount: 3, towerSegments: 6, torpedoTubes: false, includeGlazing: false,
  },
};

/**
 * V2.4 silhouette readability: a subtle fresnel rim keeps the hull legible
 * against the night sea ("black but readable") WITHOUT raising base brightness.
 * It behaves like a cold moon/sky rim light and stays presentation-only.
 */
function addFresnelRim(material: THREE.MeshStandardMaterial, colorHex: number, strength: number): void {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uRimColor = { value: new THREE.Color(colorHex) };
    shader.uniforms.uRimStrength = { value: strength };
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec3 vRimNormal;\nvarying vec3 vRimView;',
      )
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvRimNormal = normalize(normalMatrix * normal);\nvec4 vRimMv = modelViewMatrix * vec4(transformed, 1.0);\nvRimView = normalize(-vRimMv.xyz);',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec3 vRimNormal;\nvarying vec3 vRimView;\nuniform vec3 uRimColor;\nuniform float uRimStrength;',
      )
      .replace(
        '#include <dithering_fragment>',
        'float vRim = pow(1.0 - max(dot(normalize(vRimNormal), normalize(vRimView)), 0.0), 3.0);\ngl_FragColor.rgb += uRimColor * vRim * uRimStrength;\n#include <dithering_fragment>',
      );
  };
}

function makeMaterials(): Readonly<{
  hull: THREE.MeshStandardMaterial;
  tower: THREE.MeshStandardMaterial;
  deck: THREE.MeshStandardMaterial;
  waterline: THREE.MeshStandardMaterial;
  periscope: THREE.MeshStandardMaterial;
  propeller: THREE.MeshStandardMaterial;
  fin: THREE.MeshStandardMaterial;
  tube: THREE.MeshStandardMaterial;
  glass: THREE.MeshStandardMaterial;
  detail: THREE.MeshStandardMaterial;
  seam: THREE.MeshStandardMaterial;
}> {
  // V2.4: "black but readable". Base colours stay dark; wet specular (low
  // roughness + high metalness on the pressure hull) and a fresnel rim do the
  // silhouette work instead of emissive self-lighting. A faint emissive floor
  // only prevents total crush in the deepest shadow.
  const hull = new THREE.MeshStandardMaterial({
    color: 0x22323b, roughness: 0.34, metalness: 0.72,
    emissive: 0x050d12, emissiveIntensity: 0.05,
  });
  const tower = new THREE.MeshStandardMaterial({
    color: 0x314049, roughness: 0.32, metalness: 0.7,
    emissive: 0x070f14, emissiveIntensity: 0.04,
  });
  const deck = new THREE.MeshStandardMaterial({
    color: 0x1b2429, roughness: 0.86, metalness: 0.28,
    emissive: 0x04080a, emissiveIntensity: 0.03,
  });
  const waterline = new THREE.MeshStandardMaterial({ color: 0x2c201d, roughness: 0.82, metalness: 0.14 });
  const periscope = new THREE.MeshStandardMaterial({ color: 0x4d5a63, roughness: 0.22, metalness: 0.74 });
  const propeller = new THREE.MeshStandardMaterial({ color: 0x8b6932, roughness: 0.31, metalness: 0.79 });
  const fin = new THREE.MeshStandardMaterial({ color: 0x232c32, roughness: 0.5, metalness: 0.5 });
  const tube = new THREE.MeshStandardMaterial({ color: 0x11181c, roughness: 0.6, metalness: 0.44 });
  const glass = new THREE.MeshStandardMaterial({
    color: 0x08161d, roughness: 0.08, metalness: 0.5,
    emissive: 0x02080b, emissiveIntensity: 0.12,
  });
  const detail = new THREE.MeshStandardMaterial({ color: 0x55636d, roughness: 0.46, metalness: 0.56 });
  const seam = new THREE.MeshStandardMaterial({ color: 0x141b20, roughness: 0.7, metalness: 0.34 });

  // Cold moon/sky rim so the silhouette separates from the sea at night.
  addFresnelRim(hull, 0x6f8aa6, 0.20);
  addFresnelRim(tower, 0x7e98b0, 0.22);
  addFresnelRim(fin, 0x66798c, 0.16);
  addFresnelRim(periscope, 0x8aa0b4, 0.18);
  addFresnelRim(waterline, 0x4a3a34, 0.10);

  return { hull, tower, deck, waterline, periscope, propeller, fin, tube, glass, detail, seam };
}

function hullRadius(t: number): number {
  if (t < 0.08) return HULL_RADIUS * Math.sqrt(1 - Math.pow(1 - t / 0.08, 2));
  if (t < 0.15) {
    const s = (t - 0.08) / 0.07;
    return Math.min(HULL_RADIUS, HULL_RADIUS * (Math.sqrt(1 - Math.pow(1 - s, 2)) * 0.3 + 0.7 + s * 0.3));
  }
  if (t < 0.55) return HULL_RADIUS * (1 + 0.03 * Math.sin(((t - 0.15) / 0.4) * Math.PI));
  if (t < 0.82) {
    const s = (t - 0.55) / 0.27;
    return HULL_RADIUS * (1 - 0.35 * s * s);
  }
  const s = (t - 0.82) / 0.18;
  return HULL_RADIUS * 0.65 * (1 - s * s);
}

function addMesh(group: THREE.Group, mesh: THREE.Mesh, name: string, castShadow = false): void {
  mesh.name = name;
  mesh.castShadow = castShadow;
  group.add(mesh);
}

function addHullPanelBands(group: THREE.Group, detail: LodDetail, material: THREE.Material): void {
  if (detail.panelBands === 0) return;
  for (let i = 0; i < detail.panelBands; i++) {
    const t = 0.18 + (i / Math.max(1, detail.panelBands - 1)) * 0.52;
    const x = (t - 0.5) * HULL_LENGTH;
    const band = new THREE.Mesh(
      new THREE.TorusGeometry(Math.max(0.001, hullRadius(t) * 1.005), 0.000095, 4, Math.max(10, detail.radialSegments / 2)),
      material,
    );
    band.rotation.y = Math.PI / 2;
    band.position.x = x;
    band.name = 'hull-panel-band';
    group.add(band);
  }
}

function addDeckDetails(group: THREE.Group, detail: LodDetail, materials: ReturnType<typeof makeMaterials>): void {
  for (let i = 0; i < detail.hatches; i++) {
    const progress = detail.hatches === 1 ? 0.5 : i / (detail.hatches - 1);
    const hatch = new THREE.Mesh(new THREE.CylinderGeometry(0.00122, 0.00122, 0.00032, 10), materials.detail);
    hatch.rotation.x = Math.PI / 2;
    hatch.position.set(-HULL_LENGTH * 0.20 + progress * HULL_LENGTH * 0.38, HULL_RADIUS + 0.00022, 0);
    addMesh(group, hatch, 'deck-hatch');
  }

  // Free-flooding vents are shallow slots. They are deliberately sparse so the
  // silhouette remains readable instead of turning into noisy geometry.
  for (let i = 0; i < detail.vents; i++) {
    const progress = i / Math.max(1, detail.vents - 1);
    const x = -HULL_LENGTH * 0.23 + progress * HULL_LENGTH * 0.48;
    const side = i % 2 === 0 ? -1 : 1;
    const vent = new THREE.Mesh(new THREE.BoxGeometry(0.0017, 0.00042, 0.00016), materials.seam);
    vent.position.set(x, HULL_RADIUS * 0.38, side * HULL_RADIUS * 0.965);
    addMesh(group, vent, 'free-flooding-vent');
  }

  for (let section = 0; section < detail.railSections; section++) {
    const x = -HULL_LENGTH * 0.14 + section * HULL_LENGTH * 0.10;
    for (const side of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.00014, 0.00014, 0.0042, 5), materials.detail);
      post.position.set(x, HULL_RADIUS + 0.0021, side * HULL_RADIUS * 0.78);
      addMesh(group, post, 'rail-post');
    }
    const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.00011, 0.00011, HULL_LENGTH * 0.09, 5), materials.detail);
    rail.rotation.z = Math.PI / 2;
    rail.position.set(x + HULL_LENGTH * 0.045, HULL_RADIUS + 0.0041, HULL_RADIUS * 0.78);
    addMesh(group, rail, 'starboard-rail');
    const portRail = rail.clone();
    portRail.position.z = -HULL_RADIUS * 0.78;
    portRail.name = 'port-rail';
    group.add(portRail);
  }
}

function addConningTower(
  group: THREE.Group,
  detail: LodDetail,
  materials: ReturnType<typeof makeMaterials>,
): THREE.Mesh {
  const towerGeo = new THREE.CapsuleGeometry(TOWER_WIDTH * 0.46, TOWER_HEIGHT * 0.72, 8, detail.towerSegments);
  towerGeo.scale(1.05, 1, 1.35);
  const conningTower = new THREE.Mesh(towerGeo, materials.tower);
  conningTower.position.set(HULL_LENGTH * 0.05, HULL_RADIUS + TOWER_HEIGHT / 2, 0);
  addMesh(group, conningTower, 'conning-tower', true);

  const bridge = new THREE.Mesh(
    new THREE.BoxGeometry(TOWER_LENGTH * 0.52, TOWER_HEIGHT * 0.22, TOWER_WIDTH * 0.82),
    materials.tower,
  );
  bridge.position.set(HULL_LENGTH * 0.05, HULL_RADIUS + TOWER_HEIGHT + TOWER_HEIGHT * 0.11, 0);
  addMesh(group, bridge, 'bridge-step', true);

  if (detail.includeGlazing) {
    for (const side of [-1, 1]) {
      const glazing = new THREE.Mesh(
        new THREE.BoxGeometry(TOWER_LENGTH * 0.46, TOWER_HEIGHT * 0.15, 0.00033),
        materials.glass,
      );
      glazing.position.set(
        HULL_LENGTH * 0.05,
        HULL_RADIUS + TOWER_HEIGHT + TOWER_HEIGHT * 0.11,
        side * TOWER_WIDTH * 0.42,
      );
      addMesh(group, glazing, side < 0 ? 'bridge-glazing-port' : 'bridge-glazing-starboard');
    }
  }
  return conningTower;
}

function addPeriscope(group: THREE.Group, materials: ReturnType<typeof makeMaterials>, radialSegments: number): THREE.Mesh {
  const periscope = new THREE.Mesh(
    new THREE.CylinderGeometry(0.00078, 0.00082, PERISCOPE_HEIGHT, Math.max(6, radialSegments / 4)),
    materials.periscope,
  );
  periscope.position.set(HULL_LENGTH * 0.05, HULL_RADIUS + TOWER_HEIGHT, 0);
  periscope.visible = false;
  periscope.name = 'periscope-shaft';

  const head = new THREE.Mesh(
    new THREE.BoxGeometry(0.0020, 0.0009, 0.00135),
    materials.periscope,
  );
  head.position.set(0.00055, PERISCOPE_HEIGHT * 0.49, 0);
  head.name = 'periscope-head';
  periscope.add(head);
  group.add(periscope);
  return periscope;
}

function addControlSurfaces(group: THREE.Group, materials: ReturnType<typeof makeMaterials>): THREE.Mesh {
  const planeGeo = new THREE.BoxGeometry(0.0030, 0.00058, FIN_SPAN);
  const planePos = planeGeo.attributes.position;
  if (planePos) {
    for (let i = 0; i < planePos.count; i++) {
      const x = planePos.getX(i);
      if (x < 0) planePos.setY(i, planePos.getY(i) * 0.48);
    }
  }
  planeGeo.computeVertexNormals();

  const leftPlane = new THREE.Mesh(planeGeo, materials.fin);
  leftPlane.position.set(HULL_LENGTH * 0.3, 0, -(HULL_RADIUS + FIN_SPAN * 0.4));
  leftPlane.rotation.x = 0.05;
  addMesh(group, leftPlane, 'forward-dive-plane-port', true);

  const rightPlane = leftPlane.clone();
  rightPlane.position.z = HULL_RADIUS + FIN_SPAN * 0.4;
  rightPlane.rotation.x = -0.05;
  rightPlane.name = 'forward-dive-plane-starboard';
  group.add(rightPlane);

  const vertical = new THREE.Mesh(new THREE.BoxGeometry(FIN_CHORD, RUDDER_HEIGHT, 0.00078), materials.fin);
  vertical.position.set(-HULL_LENGTH * 0.45, RUDDER_HEIGHT * 0.35, 0);
  addMesh(group, vertical, 'vertical-tail-fin', true);

  const skeg = new THREE.Mesh(new THREE.BoxGeometry(FIN_CHORD * 0.78, RUDDER_HEIGHT * 0.5, 0.00072), materials.fin);
  skeg.position.set(-HULL_LENGTH * 0.45, -RUDDER_HEIGHT * 0.25, 0);
  addMesh(group, skeg, 'tail-skeg');

  const horizontal = new THREE.Mesh(new THREE.BoxGeometry(FIN_CHORD, 0.00058, FIN_SPAN), materials.fin);
  horizontal.position.set(-HULL_LENGTH * 0.45, 0, 0);
  addMesh(group, horizontal, 'tail-horizontal-planes', true);

  const rudder = new THREE.Mesh(new THREE.BoxGeometry(0.003, RUDDER_HEIGHT * 0.8, 0.00056), materials.fin);
  rudder.position.set(-HULL_LENGTH * 0.48, RUDDER_HEIGHT * 0.30, 0);
  addMesh(group, rudder, 'rudder');
  return rudder;
}

function addPropeller(group: THREE.Group, detail: LodDetail, material: THREE.Material): THREE.Group {
  const propeller = new THREE.Group();
  propeller.name = 'five-blade-propeller';
  for (let i = 0; i < detail.bladeCount; i++) {
    const bladeGeo = new THREE.BoxGeometry(0.0015, PROPELLER_RADIUS * 1.8, 0.003);
    const positions = bladeGeo.attributes.position;
    if (positions) {
      for (let j = 0; j < positions.count; j++) {
        const y = positions.getY(j);
        const normalisedY = y / (PROPELLER_RADIUS * 0.9);
        positions.setX(j, positions.getX(j) * (1 - Math.abs(normalisedY) * 0.42));
        positions.setZ(j, positions.getZ(j) * (1 - Math.abs(normalisedY) * 0.32));
      }
    }
    bladeGeo.computeVertexNormals();
    const blade = new THREE.Mesh(bladeGeo, material);
    blade.rotation.x = (i * Math.PI * 2) / detail.bladeCount;
    blade.rotation.z = 0.15;
    blade.name = 'propeller-blade';
    propeller.add(blade);
  }
  const hubGeo = new THREE.CylinderGeometry(0.0015, 0.0015, 0.003, Math.max(6, detail.radialSegments / 4));
  hubGeo.rotateX(Math.PI / 2);
  const hub = new THREE.Mesh(hubGeo, material);
  hub.name = 'propeller-hub';
  propeller.add(hub);
  propeller.position.set(-HULL_LENGTH / 2 - 0.003, 0, 0);
  group.add(propeller);
  return propeller;
}

function addTorpedoTubes(group: THREE.Group, detail: LodDetail, material: THREE.Material): void {
  if (!detail.torpedoTubes) return;
  const tubeRadius = 0.00148;
  const tubeDepth = 0.0028;
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 2; col++) {
      const tubeGeo = new THREE.CylinderGeometry(tubeRadius, tubeRadius, tubeDepth, 8);
      tubeGeo.rotateZ(Math.PI / 2);
      const tube = new THREE.Mesh(tubeGeo, material);
      tube.position.set(
        HULL_LENGTH * 0.47,
        -tubeRadius + row * tubeRadius * 2.5,
        -tubeRadius * 1.2 + col * tubeRadius * 2.4,
      );
      addMesh(group, tube, 'forward-torpedo-tube');
    }
  }
}

/** Builds one of the four local hero-submarine LODs. */
export function createSubmarineGeometry(lod: SubmarineLodLevel = 0): SubmarineParts {
  const detail = DETAIL_BY_LOD[lod];
  const materials = makeMaterials();
  const group = new THREE.Group();
  group.name = `player-submarine-lod${lod}`;
  group.userData.renderAssetId = `proc-player-submarine-lod${lod}`;
  group.userData.renderOnly = true;

  const hullPts: THREE.Vector2[] = [];
  for (let i = 0; i <= detail.hullSamples; i++) {
    const t = i / detail.hullSamples;
    hullPts.push(new THREE.Vector2(Math.max(0.0005, hullRadius(t)), (t - 0.5) * HULL_LENGTH));
  }
  const hullGeo = new THREE.LatheGeometry(hullPts, detail.radialSegments);
  hullGeo.rotateZ(Math.PI / 2);
  const hull = new THREE.Mesh(hullGeo, materials.hull);
  addMesh(group, hull, 'pressure-hull', true);
  hull.receiveShadow = true;

  const waterline = new THREE.Mesh(
    new THREE.BoxGeometry(HULL_LENGTH * 0.90, 0.00072, HULL_RADIUS * 2.08),
    materials.waterline,
  );
  addMesh(group, waterline, 'waterline-marking');

  const deck = new THREE.Mesh(
    new THREE.BoxGeometry(HULL_LENGTH * 0.53, 0.0010, HULL_RADIUS * 1.16),
    materials.deck,
  );
  deck.position.set(HULL_LENGTH * 0.03, HULL_RADIUS - 0.00045, 0);
  addMesh(group, deck, 'deck-casing', true);

  addHullPanelBands(group, detail, materials.seam);
  addDeckDetails(group, detail, materials);
  const conningTower = addConningTower(group, detail, materials);
  const periscope = addPeriscope(group, materials, detail.radialSegments);
  const rudder = addControlSurfaces(group, materials);
  const propeller = addPropeller(group, detail, materials.propeller);
  addTorpedoTubes(group, detail, materials.tube);

  // Bow sonar dome keeps the bow recognisable from below and gives shallow-water
  // lighting a controlled material break.
  if (lod < 3) {
    const sonarGeo = new THREE.SphereGeometry(0.003, Math.max(8, detail.radialSegments / 2), 8, 0, Math.PI * 2, 0, Math.PI / 2);
    const sonar = new THREE.Mesh(sonarGeo, materials.tube);
    sonar.position.set(HULL_LENGTH * 0.35, -HULL_RADIUS * 0.5, 0);
    sonar.rotation.x = Math.PI;
    addMesh(group, sonar, 'bow-sonar-dome');
  }

  return { group, hull, conningTower, periscope, propeller, rudder };
}
