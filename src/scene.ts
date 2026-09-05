import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import {
  type State,
  type Input,
  objective,
  walking,
  rear,
  staticRigs,
  YARD,
} from "./game/simulation";
import { DriverRig } from "./rig";
import { PredictionPath } from "./prediction";
export type CameraMode = "follow" | "yard" | "overhead";
export class YardScene {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(40, 1, 0.1, 600);
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
  mode: CameraMode = "follow";
  loaded = false;
  reducedMotion = false;
  private focus = new THREE.Vector3(-13, 0, 26);
  private look = new THREE.Vector3();
  private gateAngle = 0;
  private route = new THREE.Group();
  private lastRoute = "";
  private env: THREE.WebGLRenderTarget;
  private rig = new DriverRig(this.driver);
  constructor(private container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      preserveDrawingBuffer: true,
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
      this.gate,
      this.target,
      this.prediction,
      this.route,
    );
    this.gate.position.set(12, 1.5, 12);
    for (let i = 0; i < 12; i++) {
      const arm = new THREE.Mesh(
        new THREE.BoxGeometry(0.98, 0.2, 0.18),
        new THREE.MeshStandardMaterial({
          color: i % 2 ? "#e8eee9" : "#db694d",
        }),
      );
      arm.position.x = i + 0.5;
      arm.castShadow = true;
      this.gate.add(arm);
    }
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
    const dock = park.clone();
    dock.geometry = new THREE.PlaneGeometry(5.0, 16);
    dock.position.set(0, 0.09, -35.8);
    dock.name = "dock-highlight";
    this.scene.add(dock);
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
    this.scene.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    for (const [i, t] of staticRigs.entries()) {
      const cab = tractor.scene.clone(true),
        box = trailer.scene.clone(true);
      cab.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          const mat = o.material as THREE.MeshStandardMaterial;
          if (mat.name === "Peripass teal") {
            o.material = mat.clone();
            (o.material as THREE.MeshStandardMaterial).color.set(
              i === 1 ? "#e7ac51" : "#486c6d",
            );
          }
        }
      });
      cab.position.set(t.x, 0, t.z);
      cab.rotation.y = t.heading;
      box.position.copy(cab.position);
      box.rotation.y = t.trailerHeading;
      this.scene.add(cab, box);
    }
    this.loaded = true;
  }
  private updateRoute(s: State) {
    if (this.lastRoute === s.phase) return;
    this.lastRoute = s.phase;
    while (this.route.children.length) {
      const c = this.route.children[0] as THREE.InstancedMesh;
      this.route.remove(c);
      c.dispose();
      c.geometry.dispose();
      (c.material as THREE.Material).dispose();
    }
    let points: number[][] = [];
    if (s.phase === "arrive")
      points = [
        [-24, 59],
        [-24, 39],
      ];
    if (s.phase === "walk-kiosk" || s.phase === "kiosk")
      points = [
        [-28, 37],
        [-28, 29],
        [-33.7, 28.2],
      ];
    if (s.phase === "gate" || s.phase === "pin")
      points = [
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
      ];
    if (s.phase === "dock")
      points = [
        [18, 6],
        [18, -24],
        [9, -33],
        [0, -24],
        [0, 5],
      ];
    if (points.length < 2) return;
    const count = points.slice(1).reduce((total, b, i) => {
      const a = points[i];
      return total + Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 1.6);
    }, 0);
    const geo = new THREE.CircleGeometry(walking(s) ? 0.17 : 0.23, 12),
      mat = new THREE.MeshBasicMaterial({
        color: "#baefe0",
        transparent: true,
        opacity: 0.65,
        depthWrite: false,
      });
    const dots = new THREE.InstancedMesh(geo, mat, count);
    const transform = new THREE.Object3D();
    transform.rotation.x = -Math.PI / 2;
    let index = 0;
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1],
        b = points[i],
        n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 1.6);
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
    dots.instanceMatrix.needsUpdate = true;
    dots.computeBoundingSphere();
    this.route.add(dots);
  }
  render(s: State, input: Input, dt: number, started: boolean) {
    this.tractor.position.set(s.truck.x, 0, s.truck.z);
    this.tractor.rotation.y = s.truck.heading;
    for (const name of ["steering-left", "steering-right"]) {
      const wheel = this.tractor.getObjectByName(name);
      if (wheel) wheel.rotation.y = s.truck.steer;
    }
    this.trailer.position.copy(this.tractor.position);
    this.trailer.rotation.y = s.truck.trailerHeading;
    this.rig.update(s, input, dt, this.reducedMotion);
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
    this.scene.getObjectByName("parking-highlight")!.visible =
      s.phase === "arrive";
    this.scene.getObjectByName("dock-highlight")!.visible = s.phase === "dock";
    this.updateRoute(s);
    this.prediction.visible = started && !walking(s) && s.phase !== "complete";
    if (this.prediction.visible) this.predictionPath.update(s, input);
    const actor = walking(s) ? s.driver : s.truck;
    let focus = new THREE.Vector3(actor.x, 0, actor.z);
    if (!walking(s)) {
      const tail = rear(s.truck);
      focus.lerp(new THREE.Vector3(tail.x, 0, tail.z), 0.35);
    }
    let offset = new THREE.Vector3(24, 34, 33);
    if (walking(s)) offset.set(14, 20, 19);
    if (!started || this.mode === "yard" || s.phase === "complete") {
      focus.set(0, 0, 13);
      offset.set(109, 113, 128);
      if (this.camera.aspect < 0.85) offset.multiplyScalar(1.55);
    } else if (this.mode === "overhead") {
      offset.set(0, 65, 0.1);
    }
    if (started && this.mode === "follow" && this.camera.aspect < 0.85)
      offset.multiplyScalar(1.3);
    const blend = this.reducedMotion ? 1 : 1 - Math.exp(-dt * 3.5);
    this.focus.lerp(focus, blend);
    this.look.copy(this.focus).add(offset);
    this.camera.position.lerp(this.look, blend);
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
