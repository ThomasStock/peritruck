import * as THREE from "three";
import { type Phase, type State, walking } from "./game/simulation";

/** Guide dots along each phase's suggested path, 1.6 m apart. */
export const ROUTES: Partial<Record<Phase, number[][]>> = {
  arrive: [
    [-24, 59],
    [-24, 39],
  ],
  "walk-kiosk": [
    [-28, 37],
    [-28, 29],
    [-33.7, 28.2],
  ],
  gate: [
    [-24, 39],
    [-24, 28],
    [-17, 22],
    [5, 24],
    [28, 25],
    [37, 36],
    [37, 47],
    [27, 58],
    [18, 47],
    [18, 21.5],
  ],
  dock: [
    [18, 6],
    [18, -24],
    [9, -33],
    [0, -24],
    [0, 5],
  ],
};
ROUTES.kiosk = ROUTES["walk-kiosk"];
ROUTES.pin = ROUTES.gate;
const SPACING = 1.6;
const legDots = (a: number[], b: number[]) =>
  Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / SPACING);
export function routeDotCount(points: number[][]): number {
  let count = 0;
  for (let i = 1; i < points.length; i++)
    count += legDots(points[i - 1], points[i]);
  return count;
}
/** Enough instances for the longest route, so no phase change reallocates. */
export const ROUTE_CAPACITY = Math.max(
  ...Object.values(ROUTES).map((points) => routeDotCount(points ?? [])),
);
const transform = new THREE.Object3D();
transform.rotation.x = -Math.PI / 2;

/** One instanced mesh for the whole route. Geometry, material and instance
 * buffer are allocated once: rebuilding them on every phase change also made
 * the renderer drop and recompile their shader program mid-game. */
export class RouteDots {
  readonly mesh: THREE.InstancedMesh<
    THREE.CircleGeometry,
    THREE.MeshBasicMaterial
  >;
  private readonly walk = new THREE.CircleGeometry(0.17, 12);
  private readonly drive = new THREE.CircleGeometry(0.23, 12);
  private phase = "";
  constructor() {
    this.mesh = new THREE.InstancedMesh(
      this.drive,
      new THREE.MeshBasicMaterial({
        color: "#baefe0",
        transparent: true,
        opacity: 0.65,
        depthWrite: false,
      }),
      ROUTE_CAPACITY,
    );
    this.mesh.count = 0;
    this.mesh.visible = false;
  }
  /** Lay the dots out for the current phase. Returns true when they changed. */
  update(s: State): boolean {
    if (this.phase === s.phase) return false;
    this.phase = s.phase;
    const dots = this.mesh,
      points = ROUTES[s.phase];
    if (!points || points.length < 2) {
      dots.count = 0;
      dots.visible = false;
      return true;
    }
    dots.geometry = walking(s) ? this.walk : this.drive;
    let index = 0;
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1],
        b = points[i],
        n = legDots(a, b);
      for (let j = 0; j < n; j++) {
        const f = j / n;
        transform.position.set(
          a[0] + (b[0] - a[0]) * f,
          0.12,
          a[1] + (b[1] - a[1]) * f,
        );
        transform.updateMatrix();
        dots.setMatrixAt(index++, transform.matrix);
      }
    }
    dots.count = index;
    dots.visible = true;
    dots.instanceMatrix.needsUpdate = true;
    dots.computeBoundingSphere();
    return true;
  }
}
