import * as THREE from "three";
import { CAMERA_FOV_DEGREES, WORLD_UNITS_PER_SVG_UNIT } from "./constants.js";
import { buildOwnedLines } from "./geometry.js";

const MISSING_COLOR = "#ffffff";

/**
 * Colors of the map, as CSS color strings. `colors` is indexed by the positions given to
 * `setColors`; `regionBorder` colors the region limits drawn by the N15.
 * @typedef {{
 *   background: string;
 *   border: string;
 *   regionBorder: string;
 *   colors: string[];
 *   selection?: string;
 *   neutral?: string;
 * }} EnginePalette
 */

/**
 * @typedef {{
 *   plate: THREE.BatchedMesh;
 *   municipalities: Array<{ instanceId: number }>;
 * }} PaintTarget
 */

/**
 * @typedef {{
 *   renderer: { setClearColor: (color: THREE.Color) => void };
 *   borders: THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>;
 *   raisedOutline: THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>;
 * }} PaletteTarget
 */

/**
 * The map group scales the geometry from topology units down to world units and flips Y. The map
 * size is measured only after the plate sits in that group, so it is in world units, like every
 * distance that depends on it: framing, pan limits, shadow reach and ground.
 * @param {{
 *   plate: THREE.BatchedMesh;
 *   municipalities: Array<{ outline: Float32Array; instanceId: number }>;
 * }} options
 */
export function createScene({ plate, municipalities }) {
  const scene = new THREE.Scene();
  const mapGroup = new THREE.Group();
  mapGroup.scale.set(WORLD_UNITS_PER_SVG_UNIT, -WORLD_UNITS_PER_SVG_UNIT, WORLD_UNITS_PER_SVG_UNIT);

  const allIndexes = municipalities.map((_, index) => index);
  const borders = new THREE.LineSegments(
    buildOwnedLines(municipalities, allIndexes),
    new THREE.LineBasicMaterial(),
  );
  borders.frustumCulled = false;
  const raisedOutline = new THREE.LineSegments(
    buildOwnedLines(municipalities, []),
    new THREE.LineBasicMaterial(),
  );
  raisedOutline.frustumCulled = false;
  mapGroup.add(plate, borders, raisedOutline);
  scene.add(mapGroup);
  mapGroup.updateMatrixWorld(true);

  const mapSize = new THREE.Box3().setFromObject(plate).getSize(new THREE.Vector3());
  const sun = addLights(scene, mapSize);
  const ground = buildGround(mapSize);
  scene.add(ground);

  const camera = new THREE.PerspectiveCamera(CAMERA_FOV_DEGREES, 1, 0.1, 5000);
  camera.up.set(0, 0, 1);

  return {
    scene,
    camera,
    mapGroup,
    plate,
    borders,
    raisedOutline,
    sun,
    ground,
    mapSize,
    instanceToMunicipality: readInstanceToMunicipality(municipalities),
  };
}

/**
 * @param {THREE.Scene} scene
 * @param {THREE.Vector3} mapSize
 * @returns {THREE.DirectionalLight}
 */
export function addLights(scene, mapSize) {
  const sky = new THREE.HemisphereLight(0xffffff, 0xb4b8c4, 1.9);
  sky.position.set(0, 0, 1);
  scene.add(sky);

  const sun = new THREE.DirectionalLight(0xffffff, 1.5);
  const shadowReach = Math.hypot(mapSize.x, mapSize.y) * 0.55;
  sun.position.set(-50, -80, 170);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -shadowReach;
  sun.shadow.camera.right = shadowReach;
  sun.shadow.camera.top = shadowReach;
  sun.shadow.camera.bottom = -shadowReach;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 500;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  sun.shadow.radius = 3;
  scene.add(sun, sun.target);
  return sun;
}

/**
 * A transparent floor that only shows shadows, so the state and the raised cities cast onto the
 * page.
 * @param {THREE.Vector3} mapSize
 * @returns {THREE.Mesh}
 */
export function buildGround(mapSize) {
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(mapSize.x * 1.8, mapSize.y * 1.8),
    new THREE.ShadowMaterial({ opacity: 0.18 }),
  );
  ground.position.z = -0.02;
  ground.receiveShadow = true;
  return ground;
}

/**
 * @param {Array<{ instanceId: number }>} municipalities
 * @returns {number[]}
 */
function readInstanceToMunicipality(municipalities) {
  /** @type {number[]} */
  const instanceToMunicipality = [];
  for (let index = 0; index < municipalities.length; index += 1) {
    instanceToMunicipality[municipalities[index].instanceId] = index;
  }
  return instanceToMunicipality;
}

/**
 * Sets the background, the borders and the raised outline from the palette. The borders and the
 * raised outline share the border color.
 * @param {PaletteTarget} target
 * @param {EnginePalette} palette
 */
export function applyPalette({ renderer, borders, raisedOutline }, palette) {
  renderer.setClearColor(new THREE.Color(palette.background));
  borders.material.color.set(palette.border);
  raisedOutline.material.color.set(palette.border);
}

/**
 * @param {PaintTarget} target
 * @param {Uint8Array} colorPositions
 * @param {string[]} colors
 * @param {string} [neutralColor]
 */
export function paintMunicipalities(
  { plate, municipalities },
  colorPositions,
  colors,
  neutralColor = MISSING_COLOR,
) {
  const color = new THREE.Color();
  for (let index = 0; index < colorPositions.length; index += 1) {
    const pos = colorPositions[index];
    color.set(colors[pos] ?? neutralColor);
    plate.setColorAt(municipalities[index].instanceId, color);
  }
}

/**
 * Paints the selected municipalities with the selection color, over their class color.
 * @param {PaintTarget} target
 * @param {Iterable<number>} selectedIndexes
 * @param {string} selectionColor
 */
export function paintSelected({ plate, municipalities }, selectedIndexes, selectionColor) {
  const color = new THREE.Color(selectionColor);
  for (const index of selectedIndexes) {
    plate.setColorAt(municipalities[index].instanceId, color);
  }
}

/**
 * Counts the mesh objects that draw the map. The ground only catches shadows and sits outside the
 * map group.
 * @param {THREE.Object3D} mapGroup
 * @returns {number}
 */
export function countMapMeshes(mapGroup) {
  let meshCount = 0;
  mapGroup.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) {
      return;
    }
    meshCount += 1;
  });
  return meshCount;
}
