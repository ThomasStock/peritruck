import * as THREE from "three";
import {
  DOCKS,
  RIG,
  YARD,
  dockStatus,
  dockX,
  rear,
  type State,
} from "./game/simulation";
import { DriverRig } from "./rig";

/** Presentation only: a dock stays ready while the truck turns and reverses. */
const OPEN_DISTANCE = 72;
const FORKLIFT_DISTANCE = 30;
const OPEN_SECONDS = 3;
const FORKLIFT_SECONDS = 4.5;
const FLOOR = 1.15;
const TOP = 5;
const SLATS = 16;
const PITCH = (TOP - FLOOR) / SLATS;
const ROLL_RADIUS = 0.23;
const FORKLIFT_START = -52;
const FORKLIFT_STOP = -46.8;

export class DockArrival {
  readonly root = new THREE.Group();
  readonly crew = new THREE.Group();
  readonly forklift = new THREE.Group();
  private worker = new THREE.Group();
  private workerRig = new DriverRig(this.worker);
  private wheels: THREE.Object3D[] = [];
  private shutters: THREE.InstancedMesh[] = [];
  private transform = new THREE.Object3D();
  private frustum = new THREE.Frustum();
  private projection = new THREE.Matrix4();
  private doorway = new THREE.Sphere(new THREE.Vector3(), 2.5);
  private assigned = 0;
  private opening = false;
  private approaching = false;
  private doorProgress = 0;
  private forkliftProgress = 0;
  private lastElapsed = 0;

  constructor() {
    this.root.name = "dock-arrival";
    const geometry = new THREE.BoxGeometry(4.16, PITCH - 0.014, 0.09);
    const material = new THREE.MeshStandardMaterial({
      color: "#718882",
      roughness: 0.48,
      metalness: 0.45,
    });
    for (const dock of DOCKS) {
      const shutter = new THREE.InstancedMesh(geometry, material, SLATS);
      shutter.name = `dock-shutter-${dock.number}`;
      shutter.position.set(dock.x, 0, -44.25);
      shutter.castShadow = shutter.receiveShadow = true;
      shutter.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      // Fixed bounds include the curtain and its roll above the lintel.
      shutter.boundingSphere = new THREE.Sphere(
        new THREE.Vector3(0, 3.2, 0),
        3.5,
      );
      this.shutters.push(shutter);
      this.root.add(shutter);
      this.poseShutter(dock.number, 0);
    }
    this.worker.name = "dock-worker";
    this.forklift.name = "dock-forklift";
    this.forklift.position.z = FORKLIFT_START;
    const light = new THREE.PointLight("#ffe1a1", 22, 11, 2);
    light.position.set(0, 4.1 - FLOOR, -45.6);
    this.crew.name = "dock-crew";
    this.crew.add(this.worker, this.forklift, light);
    this.crew.visible = false;
    this.forklift.visible = false;
    this.root.add(this.crew);
  }

  bind(driver: THREE.Object3D, forklift: THREE.Object3D) {
    this.worker.add(driver.clone(true));
    this.workerRig.bind();
    this.forklift.add(forklift);
    forklift.traverse((part) => {
      if (part.name.startsWith("forklift-wheel")) this.wheels.push(part);
    });
  }

  update(s: State, camera: THREE.Camera, dt: number, reducedMotion = false) {
    const active =
      s.dispatched &&
      s.gateOpen &&
      (s.phase === "dock" || s.phase === "complete") &&
      dockStatus(s.dock) === "free";
    const assigned = active ? s.dock : 0;
    if (assigned !== this.assigned || s.elapsed < this.lastElapsed) {
      if (this.assigned) this.poseShutter(this.assigned, 0);
      this.assigned = assigned;
      this.opening = this.approaching = false;
      this.doorProgress = this.forkliftProgress = 0;
      this.forklift.position.z = FORKLIFT_START;
      this.forklift.visible = false;
      for (const wheel of this.wheels) wheel.rotation.x = 0;
    }
    this.lastElapsed = s.elapsed;
    this.crew.visible = false;
    if (!active) return;

    const x = dockX(s.dock);
    const tail = rear(s.truck);
    const distance = Math.min(
      Math.hypot(s.truck.x - x, s.truck.z - YARD.dock.z),
      Math.hypot(tail.x - x, tail.z - YARD.dock.z),
      Math.hypot(
        s.truck.x + Math.sin(s.truck.heading) * RIG.front - x,
        s.truck.z + Math.cos(s.truck.heading) * RIG.front - YARD.dock.z,
      ),
    );
    if (!this.opening && distance <= OPEN_DISTANCE) {
      camera.updateMatrixWorld();
      this.frustum.setFromProjectionMatrix(
        this.projection.multiplyMatrices(
          camera.projectionMatrix,
          camera.matrixWorldInverse,
        ),
      );
      this.doorway.center.set(x, 3, -44.25);
      this.opening = this.frustum.intersectsSphere(this.doorway);
    }
    if (!this.opening) return;

    const door = reducedMotion
      ? 1
      : Math.min(1, this.doorProgress + dt / OPEN_SECONDS);
    if (door !== this.doorProgress) this.poseShutter(s.dock, door);
    this.doorProgress = door;
    this.crew.visible = true;
    this.crew.position.set(x, FLOOR, 0);
    this.workerRig.stand(-1.38, -45.05, -0.15, false, dt, reducedMotion);
    // Wait for clearance, even when a quick approach crosses both thresholds.
    if (distance <= FORKLIFT_DISTANCE) this.approaching = true;
    if (!this.approaching || door < 1) return;

    this.forklift.visible = true;
    this.forkliftProgress = reducedMotion
      ? 1
      : Math.min(1, this.forkliftProgress + dt / FORKLIFT_SECONDS);
    const t = this.forkliftProgress;
    const z = THREE.MathUtils.lerp(
      FORKLIFT_START,
      FORKLIFT_STOP,
      t * t * (3 - 2 * t),
    );
    if (!reducedMotion) {
      const roll = (z - this.forklift.position.z) / 0.33;
      for (const wheel of this.wheels) wheel.rotation.x += roll;
    }
    this.forklift.position.z = z;
  }

  private poseShutter(dock: number, progress: number) {
    const shutter = this.shutters[dock - 1];
    // Each slat rises, curls over the drum, then disappears into its housing.
    const travel = progress * (TOP - FLOOR + Math.PI * ROLL_RADIUS);
    for (let i = 0; i < SLATS; i++) {
      const rise = travel - i * PITCH;
      const curl = Math.max(0, rise / ROLL_RADIUS);
      this.transform.position.set(
        0,
        TOP -
          PITCH / 2 +
          (rise <= 0 ? rise : Math.sin(Math.min(Math.PI, curl)) * ROLL_RADIUS),
        rise <= 0 ? 0 : (Math.cos(Math.min(Math.PI, curl)) - 1) * ROLL_RADIUS,
      );
      this.transform.rotation.x = -Math.min(Math.PI, curl);
      this.transform.scale.setScalar(curl >= Math.PI ? 0 : 1);
      this.transform.updateMatrix();
      shutter.setMatrixAt(i, this.transform.matrix);
    }
    shutter.instanceMatrix.needsUpdate = true;
    shutter.visible = progress < 1;
  }
}
