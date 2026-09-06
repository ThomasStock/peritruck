import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import {
  type State,
  type Input,
  DOCKS,
  dockX,
  objective,
  walking,
  rear,
  staticRigs,
  YARD,
} from "./game/simulation";
import { DriverRig } from "./rig";
import { PredictionPath } from "./prediction";
import { RouteDots } from "./route";
import { RigLamps, lampState } from "./lights";
export type CameraMode = "follow" | "yard" | "overhead";
/** Who the camera follows: the driver, or the yard operator by dock 05. */
export type Attention = "driver" | "operator";
/** Seconds for the camera to travel between the driver and the operator. */
export const CUT_SECONDS = 1.7;
/** Where the operator stands, facing along the cab towards the apron. */
const OPERATOR_HEADING = 0.3;
export function createYardCamera() {
  // Cameras stay metres from the actors. A 1 m near plane preserves enough
  // depth precision to keep the thin yard slabs from shimmering at a distance.
  return new THREE.PerspectiveCamera(40, 1, 1, 600);
}
/** Bake every mesh under `root` into one mesh per material, in world space.
 * For scenery that never moves again: a merged mesh cannot animate its parts,
 * but it costs one draw call in the colour pass and one in the shadow pass
 * instead of one per part. Parts whose attributes cannot merge stay separate. */
export function mergeByMaterial(root: THREE.Object3D): THREE.Mesh[] {
  root.updateMatrixWorld(true);
  const groups = new Map<THREE.Material, THREE.BufferGeometry[]>();
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh) || Array.isArray(o.material)) return;
    const parts = groups.get(o.material) ?? [];
    parts.push(
      (o.geometry as THREE.BufferGeometry).clone().applyMatrix4(o.matrixWorld),
    );
    groups.set(o.material, parts);
  });
  const meshes: THREE.Mesh[] = [];
  for (const [material, parts] of groups) {
    const merged = parts.length > 1 ? mergeGeometries(parts) : parts[0];
    for (const geometry of merged ? [merged] : parts) {
      geometry.computeBoundingSphere();
      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = mesh.receiveShadow = true;
      meshes.push(mesh);
    }
  }
  return meshes;
}
export class YardScene {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = createYardCamera();
  tractor = new THREE.Group();
  trailer = new THREE.Group();
  driver = new THREE.Group();
  gate = new THREE.Group();
  target = new THREE.Group();
  private predictionPath = new PredictionPath();
  prediction = new THREE.Line(
    this.predictionPath.geometry,
    new THREE.LineBasicMaterial({
      color: "#b8ffe2",
      transparent: true,
      opacity: 0.95,
    }),
  );
  private routeDots = new RouteDots();
  route = this.routeDots.mesh;
  mode: CameraMode = "follow";
  loaded = false;
  reducedMotion = false;
  /** The yard operator: a second hi-vis figure who never leaves dock 05. */
  operator = new THREE.Group();
  /** Raised while the operator works the dispatch app. */
  operatorPhone = false;
  attention: Attention = "driver";
  /** In-flight camera move between subjects, or null when settled. */
  private cut: { from: THREE.Vector3; t: number } | null = null;
  private focus = new THREE.Vector3(-13, 0, 26);
  private look = new THREE.Vector3();
  private nextFocus = new THREE.Vector3();
  private tail = new THREE.Vector3();
  private offset = new THREE.Vector3();
  private gateAngle = 0;
  private env: THREE.WebGLRenderTarget;
  private rig = new DriverRig(this.driver);
  private lamps = new RigLamps();
  private operatorRig = new DriverRig(this.operator);
  private steering: THREE.Object3D[] = [];
  private parkingHighlight: THREE.Mesh;
  private dockHighlight: THREE.Mesh;
  /** Number panel and signal lamp per dock; the assigned dock lights up teal and green. */
  private dockPanels: THREE.Mesh[] = [];
  private dockLamps: THREE.Mesh[] = [];
  private panelDark = new THREE.MeshStandardMaterial({
    color: "#3b5255",
    roughness: 0.9,
    metalness: 0.1,
  });
  private panelTeal = new THREE.MeshStandardMaterial({
    color: "#00a990",
    emissive: "#00a990",
    emissiveIntensity: 0.3,
    roughness: 0.5,
  });
  constructor(private container: HTMLElement) {
    // The drawing buffer is not preserved: keeping it costs a full-screen copy
    // every frame. Screenshots render synchronously right before reading pixels.
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.8));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.82;
    this.renderer.setClearColor("#d9e6e0");
    container.appendChild(this.renderer.domElement);
    this.renderer.domElement.setAttribute(
      "aria-label",
      "3D Peripass logistics yard. Use the driving controls to complete your delivery.",
    );
    this.scene.fog = new THREE.Fog("#d9e6e0", 220, 430);
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const room = new RoomEnvironment();
    this.env = pmrem.fromScene(room, 0.04);
    this.scene.environment = this.env.texture;
    this.scene.environmentIntensity = 0.45;
    room.dispose();
    pmrem.dispose();
    this.scene.add(new THREE.HemisphereLight("#e8fff6", "#586b5d", 1.15));
    const sun = new THREE.DirectionalLight("#fff0d5", 2.2);
    sun.position.set(-50, 90, 35);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -100;
    sun.shadow.camera.right = 100;
    sun.shadow.camera.top = 100;
    sun.shadow.camera.bottom = -100;
    sun.shadow.camera.far = 250;
    sun.shadow.normalBias = 0.06;
    sun.shadow.bias = -0.0002;
    sun.shadow.radius = 3;
    this.scene.add(sun);
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(1200, 1200),
      new THREE.MeshStandardMaterial({ color: "#c3d4c8", roughness: 1 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -2.9;
    floor.receiveShadow = true;
    this.scene.add(floor);
    this.scene.add(
      this.tractor,
      this.trailer,
      this.driver,
      this.operator,
      this.gate,
      this.target,
      this.prediction,
      this.route,
    );
    // Dock number panels sit just proud of the baked ones, behind the painted
    // digits, so the assigned dock can light up. A green lamp joins the red one.
    const panelGeometry = new THREE.BoxGeometry(2.55, 1.38, 0.02);
    const lampGeometry = new THREE.CylinderGeometry(0.085, 0.085, 0.02, 16);
    const lampGreen = new THREE.MeshStandardMaterial({
      color: "#35d27a",
      emissive: "#35d27a",
      emissiveIntensity: 0.9,
    });
    for (const dock of DOCKS) {
      const panel = new THREE.Mesh(panelGeometry, this.panelDark);
      panel.position.set(dock.x, 6.22, -44.64);
      panel.name = `dock-panel-${dock.number}`;
      const lamp = new THREE.Mesh(lampGeometry, lampGreen);
      lamp.rotation.x = Math.PI / 2;
      lamp.position.set(dock.x + 3.18, 4, -44.115);
      lamp.visible = false;
      this.dockPanels.push(panel);
      this.dockLamps.push(lamp);
      this.scene.add(panel, lamp);
    }
    this.gate.position.set(12, 1.5, 12);
    // The arms swing as one piece: two colours, two draw calls.
    const arms = new THREE.Group();
    const armColours = ["#db694d", "#e8eee9"].map(
      (color) => new THREE.MeshStandardMaterial({ color }),
    );
    for (let i = 0; i < 12; i++) {
      const arm = new THREE.Mesh(
        new THREE.BoxGeometry(0.98, 0.2, 0.18),
        armColours[i % 2],
      );
      arm.position.x = i + 0.5;
      arms.add(arm);
    }
    this.gate.add(...mergeByMaterial(arms));
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(1.9, 2.06, 64),
      new THREE.MeshBasicMaterial({
        color: "#00b99c",
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.85,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.2;
    this.target.add(ring);
    const marker = new THREE.Mesh(
      new THREE.CylinderGeometry(0.25, 0.25, 0.06, 24),
      new THREE.MeshBasicMaterial({ color: "#00a990" }),
    );
    marker.position.y = 0.15;
    this.target.add(marker);
    const park = new THREE.Mesh(
      new THREE.PlaneGeometry(5.7, 22.8),
      new THREE.MeshBasicMaterial({
        color: "#00bc9d",
        transparent: true,
        opacity: 0.18,
        depthWrite: false,
      }),
    );
    park.rotation.x = -Math.PI / 2;
    park.position.set(-24, 0.09, 43.5);
    park.name = "parking-highlight";
    this.scene.add(park);
    this.parkingHighlight = park;
    const dock = park.clone();
    dock.geometry = new THREE.PlaneGeometry(5.0, 16);
    dock.position.set(0, 0.09, -35.8);
    dock.name = "dock-highlight";
    this.scene.add(dock);
    this.dockHighlight = dock;
    this.camera.position.set(117, 119, 139);
    this.camera.lookAt(0, 0, 13);
    this.resize();
    window.addEventListener("resize", this.resize);
  }
  resize = () => {
    const { width, height } = this.container.getBoundingClientRect();
    this.renderer.setSize(width, height);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  };
  async load() {
    const loader = new GLTFLoader();
    const [yard, tractor, trailer, driver] = await Promise.all(
      ["yard", "tractor", "trailer", "driver"].map((n) =>
        loader.loadAsync(`/models/${n}.glb`),
      ),
    );
    this.scene.add(yard.scene);
    this.tractor.add(tractor.scene);
    this.trailer.add(trailer.scene);
    this.driver.add(driver.scene);
    this.rig.bind();
    // The operator wears the same rig in a yellow-green vest and a white hat.
    const operator = driver.scene.clone(true);
    const recolour: Record<string, string> = {
      "Safety amber": "#c9e33a",
      "Safety yellow": "#eef1ea",
    };
    const retinted = new Map<THREE.Material, THREE.Material>();
    operator.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      const mat = o.material as THREE.MeshStandardMaterial;
      const colour = recolour[mat.name];
      if (!colour) return;
      let tint = retinted.get(mat);
      if (!tint) {
        tint = mat.clone();
        (tint as THREE.MeshStandardMaterial).color.set(colour);
        retinted.set(mat, tint);
      }
      o.material = tint;
    });
    this.operator.add(operator);
    this.operatorRig.bind();
    this.steering = ["steering-left", "steering-right"].flatMap((name) => {
      const wheel = this.tractor.getObjectByName(name);
      return wheel ? [wheel] : [];
    });
    this.scene.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    // Parked rigs never move. Recolour their cabs, then bake all three into one
    // mesh per material: 13 draw calls instead of 111 in each render pass.
    const parked = new THREE.Group();
    const tints = new Map<string, THREE.MeshStandardMaterial>();
    for (const [i, t] of staticRigs.entries()) {
      const cab = tractor.scene.clone(true),
        box = trailer.scene.clone(true),
        color = i === 1 ? "#e7ac51" : "#486c6d";
      cab.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          const mat = o.material as THREE.MeshStandardMaterial;
          if (mat.name === "Peripass teal") {
            let tint = tints.get(color);
            if (!tint) {
              tint = mat.clone();
              tint.color.set(color);
              tints.set(color, tint);
            }
            o.material = tint;
          }
        }
      });
      cab.position.set(t.x, 0, t.z);
      cab.rotation.y = t.heading;
      box.position.copy(cab.position);
      box.rotation.y = t.trailerHeading;
      parked.add(cab, box);
    }
    this.scene.add(...mergeByMaterial(parked));
    // Only the player's lamps work; the parked rigs above keep the paint.
    this.lamps.bind(this.tractor, this.trailer);
    // Compile every shader before play starts, including the ones for objects
    // that only appear later, so the first drive and phase changes do not stall.
    const hidden = [this.prediction, this.route].filter((o) => !o.visible);
    for (const o of hidden) o.visible = true;
    try {
      await this.renderer.compileAsync(this.scene, this.camera);
    } catch {
      /* the first frames compile lazily instead */
    } finally {
      for (const o of hidden) o.visible = false;
    }
    this.loaded = true;
  }
  /** Move the camera to the other subject with a pull-back and push-in. */
  cutTo(target: Attention) {
    if (this.attention === target) return;
    this.attention = target;
    this.cut = this.reducedMotion ? null : { from: this.focus.clone(), t: 0 };
  }
  get cutting() {
    return this.cut !== null;
  }
  render(s: State, input: Input, dt: number, started: boolean) {
    this.tractor.position.set(s.truck.x, 0, s.truck.z);
    this.tractor.rotation.y = s.truck.heading;
    for (const wheel of this.steering) wheel.rotation.y = s.truck.steer;
    this.trailer.position.copy(this.tractor.position);
    this.trailer.rotation.y = s.truck.trailerHeading;
    this.rig.update(s, input, dt, this.reducedMotion);
    this.lamps.update(
      lampState(s.truck, input, s.elapsed, started && !walking(s)),
    );
    this.operatorRig.stand(
      YARD.operator.x,
      YARD.operator.z,
      OPERATOR_HEADING + (this.operatorPhone ? 0.25 : 0),
      this.operatorPhone,
      dt,
      this.reducedMotion,
    );
    for (const [i, dock] of DOCKS.entries()) {
      const assigned = s.dispatched && dock.number === s.dock;
      this.dockPanels[i].material = assigned ? this.panelTeal : this.panelDark;
      this.dockLamps[i].visible = assigned;
    }
    this.dockHighlight.position.x = dockX(s.dock);
    this.gateAngle = THREE.MathUtils.damp(
      this.gateAngle,
      s.gateOpen ? Math.PI * 0.48 : 0,
      3,
      dt,
    );
    this.gate.rotation.z = this.gateAngle;
    const target = objective(s).target;
    this.target.position.set(target.x, 0, target.z);
    this.target.visible = s.phase !== "complete";
    const pulse = this.reducedMotion ? 1 : 1 + Math.sin(s.elapsed * 2) * 0.06;
    this.target.scale.setScalar(pulse);
    this.parkingHighlight.visible = s.phase === "arrive";
    this.dockHighlight.visible = s.phase === "dock";
    this.routeDots.update(s);
    this.prediction.visible = started && !walking(s) && s.phase !== "complete";
    if (this.prediction.visible) this.predictionPath.update(s, input);
    const actor = walking(s) ? s.driver : s.truck;
    const focus = this.nextFocus.set(actor.x, 0, actor.z);
    if (!walking(s)) {
      const tail = rear(s.truck);
      focus.lerp(this.tail.set(tail.x, 0, tail.z), 0.35);
    }
    const offset = this.offset.set(24, 34, 33);
    if (walking(s)) offset.set(14, 20, 19);
    if (this.attention === "operator") {
      // Over the operator's shoulder: close and low, the rig at dock 05 behind.
      focus.set(YARD.operator.x - 1.2, 0.9, YARD.operator.z - 1.5);
      offset.set(8.5, 7.5, 11.5);
    }
    if (!started || this.mode === "yard" || s.phase === "complete") {
      focus.set(0, 0, 13);
      offset.set(109, 113, 128);
      if (this.camera.aspect < 0.85) offset.multiplyScalar(1.55);
    } else if (this.mode === "overhead") {
      offset.set(0, 65, 0.1);
    }
    if (started && this.mode === "follow" && this.camera.aspect < 0.85)
      offset.multiplyScalar(1.3);
    if (this.cut) {
      // The focus travels between the two subjects while the camera pulls up
      // and away through the middle of the move, then drops back in on arrival.
      const t = Math.min(1, this.cut.t + dt / CUT_SECONDS);
      this.cut.t = t;
      const ease = t * t * (3 - 2 * t);
      const rise = Math.sin(Math.PI * t);
      this.focus.lerpVectors(this.cut.from, focus, ease);
      this.look.copy(this.focus).addScaledVector(offset, 1 + 2.6 * rise);
      this.camera.position.copy(this.look);
      this.camera.fov = 40 + 18 * rise;
      this.camera.updateProjectionMatrix();
      if (t >= 1) this.cut = null;
    } else {
      const blend = this.reducedMotion ? 1 : 1 - Math.exp(-dt * 3.5);
      this.focus.lerp(focus, blend);
      this.look.copy(this.focus).add(offset);
      this.camera.position.lerp(this.look, blend);
      if (this.camera.fov !== 40) {
        this.camera.fov = 40;
        this.camera.updateProjectionMatrix();
      }
    }
    this.camera.lookAt(this.focus);
    this.renderer.render(this.scene, this.camera);
  }
  project(p: { x: number; z: number }, height = 2) {
    const v = new THREE.Vector3(p.x, height, p.z).project(this.camera);
    return {
      x: (v.x * 0.5 + 0.5) * this.container.clientWidth,
      y: (-v.y * 0.5 + 0.5) * this.container.clientHeight,
      visible: v.z < 1 && Math.abs(v.x) < 0.9 && Math.abs(v.y) < 0.8,
    };
  }
}
