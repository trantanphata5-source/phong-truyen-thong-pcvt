import * as THREE from 'three';
import { EYE_HEIGHT, buildCollisionBoxes, WALKABLE_REGIONS, HALL_TARGETS } from './layout-config.js';

/**
 * Controls Manager (Artsteps Standard)
 * Features:
 * - Buttery smooth mouse look with inertia damping (zero jerkiness)
 * - Natural drag direction matching Artsteps virtual exhibitions
 * - Point & Click to Walk on floor
 * - Click Artwork to smoothly frame and inspect at eye level
 * - Keyboard WASD / Arrow movement
 */
export class ControlsManager {
  constructor(camera, domElement, audioService) {
    this.camera = camera;
    this.domElement = domElement;
    this.audioService = audioService;

    // View Heights & Speeds
    this.eyeHeight = EYE_HEIGHT;
    this.walkSpeed = 9.0;
    this.sensitivity = 0.0025;

    // Damped Smooth Rotation State
    this.currentYaw = 0;
    this.currentPitch = 0;
    this.targetYaw = 0;
    this.targetPitch = 0;
    this.damping = 0.14; // Inertia smoothing factor

    // Mouse Drag State
    this.isDragging = false;
    this.prevMousePos = { x: 0, y: 0 };
    this.dragMoved = false;

    // Keyboard State
    this.keys = {
      forward: false,
      backward: false,
      left: false,
      right: false,
      shift: false
    };

    // Camera Glide Tween State
    this.isGliding = false;
    this.glideTween = null;
    this.isAlbumViewingActive = false;

    // Museum Wall & Partition Collision Boxes (generated from layout-config.js)
    this.collisionWalls = buildCollisionBoxes();

    // GĐ4: Two Album Cabinets (rotated ±45°) — approximate AABB
    // Cabinet 1 at (-6.5, -6.5), rotated +45°, 2.2×0.9 → AABB ~1.8×1.8
    this.collisionWalls.push(
      { id: 'AlbumCabinet_1', minX: -7.5, maxX: -5.5, minZ: -7.5, maxZ: -5.5 }
    );
    // Cabinet 2 at (6.5, -6.5), rotated -45°, same AABB
    this.collisionWalls.push(
      { id: 'AlbumCabinet_2', minX: 5.5, maxX: 7.5, minZ: -7.5, maxZ: -5.5 }
    );

    // Player collision radius (50cm)
    this.playerRadius = 0.5;

    // Mouse Wheel Zoom (FOV)
    this.targetFov = 60;

    this.initEulerFromCamera();
    this.initEventListeners();
  }

  isPositionBlocked(x, z) {
    const r = this.playerRadius;
    // 1. Check against solid wall bounding boxes
    for (const w of this.collisionWalls) {
      if (x >= w.minX - r && x <= w.maxX + r && z >= w.minZ - r && z <= w.maxZ + r) {
        return true;
      }
    }

    // 2. Validate position inside walkable regions from layout-config.js
    let inAnyRegion = false;
    for (const region of WALKABLE_REGIONS) {
      if (x >= region.minX && x <= region.maxX && z >= region.minZ && z <= region.maxZ) {
        inAnyRegion = true;
        break;
      }
    }
    if (!inAnyRegion) {
      return true; // Outside bounds
    }

    return false;
  }

  moveWithCollision(deltaX, deltaZ) {
    const currentX = this.camera.position.x;
    const currentZ = this.camera.position.z;

    // Test X movement independently (enables smooth sliding along walls)
    let newX = currentX + deltaX;
    if (this.isPositionBlocked(newX, currentZ)) {
      newX = currentX;
    }

    // Test Z movement independently (enables smooth sliding along walls)
    let newZ = currentZ + deltaZ;
    if (this.isPositionBlocked(newX, newZ)) {
      newZ = currentZ;
    }

    this.camera.position.x = newX;
    this.camera.position.z = newZ;
  }

  initEulerFromCamera() {
    const euler = new THREE.Euler(0, 0, 0, 'YXZ');
    euler.setFromQuaternion(this.camera.quaternion);
    this.currentYaw = this.targetYaw = euler.y;
    this.currentPitch = this.targetPitch = euler.x;
  }

  initEventListeners() {
    // Mouse Wheel Zoom
    window.addEventListener('wheel', (e) => {
      const zoomDelta = e.deltaY * 0.035;
      this.targetFov = THREE.MathUtils.clamp(this.targetFov + zoomDelta, 25, 75);
    }, { passive: true });

    // Mouse Down
    this.domElement.addEventListener('mousedown', (e) => {
      if (e.button === 0) {
        this.isDragging = true;
        this.dragMoved = false;
        this.prevMousePos = { x: e.clientX, y: e.clientY };
        this.mouseDownPos = { x: e.clientX, y: e.clientY };
      }
    });

    // Mouse Move (Drag Look with Artsteps Natural Orbit)
    window.addEventListener('mousemove', (e) => {
      if (!this.isDragging) return;

      const deltaX = e.clientX - this.prevMousePos.x;
      const deltaY = e.clientY - this.prevMousePos.y;

      // Cumulative drag distance threshold (6px) to avoid accidental jitter cancelling clicks
      if (this.mouseDownPos) {
        const totalDist = Math.hypot(e.clientX - this.mouseDownPos.x, e.clientY - this.mouseDownPos.y);
        if (totalDist > 6) {
          this.dragMoved = true;
        }
      }

      this.prevMousePos = { x: e.clientX, y: e.clientY };

      // Natural Drag Look
      this.targetYaw += deltaX * this.sensitivity;
      this.targetPitch += deltaY * this.sensitivity;

      // Clamp vertical pitch (-75 deg to +75 deg)
      const maxPitch = Math.PI / 2.4;
      this.targetPitch = Math.max(-maxPitch, Math.min(maxPitch, this.targetPitch));
    });

    // Mouse Up
    window.addEventListener('mouseup', () => {
      this.isDragging = false;
    });

    // Touch Support for Mobile / Tablet
    this.domElement.addEventListener('touchstart', (e) => {
      if (e.touches.length === 1) {
        this.isDragging = true;
        this.dragMoved = false;
        this.prevMousePos = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        this.mouseDownPos = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      }
    }, { passive: true });

    window.addEventListener('touchmove', (e) => {
      if (!this.isDragging || e.touches.length !== 1) return;
      const deltaX = e.touches[0].clientX - this.prevMousePos.x;
      const deltaY = e.touches[0].clientY - this.prevMousePos.y;

      if (this.mouseDownPos) {
        const totalDist = Math.hypot(e.touches[0].clientX - this.mouseDownPos.x, e.touches[0].clientY - this.mouseDownPos.y);
        if (totalDist > 8) {
          this.dragMoved = true;
        }
      }

      this.prevMousePos = { x: e.touches[0].clientX, y: e.touches[0].clientY };

      this.targetYaw += deltaX * this.sensitivity * 1.3;
      this.targetPitch += deltaY * this.sensitivity * 1.3;

      const maxPitch = Math.PI / 2.4;
      this.targetPitch = Math.max(-maxPitch, Math.min(maxPitch, this.targetPitch));
    }, { passive: true });

    window.addEventListener('touchend', () => {
      this.isDragging = false;
    });

    // Keyboard (Ignored when typing in search box)
    window.addEventListener('keydown', (e) => this.onKeyDown(e));
    window.addEventListener('keyup', (e) => this.onKeyUp(e));

    // Reset keys when window loses focus to prevent stuck keys
    window.addEventListener('blur', () => this.resetKeys());
  }

  resetKeys() {
    this.keys.forward = false;
    this.keys.backward = false;
    this.keys.left = false;
    this.keys.right = false;
    this.keys.shift = false;
  }

  onKeyDown(e) {
    if (this.isAlbumViewingActive) return;
    if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
    switch (e.code) {
      case 'KeyW': case 'ArrowUp': this.keys.forward = true; break;
      case 'KeyS': case 'ArrowDown': this.keys.backward = true; break;
      case 'KeyA': case 'ArrowLeft': this.keys.left = true; break;
      case 'KeyD': case 'ArrowRight': this.keys.right = true; break;
      case 'ShiftLeft': case 'ShiftRight': this.keys.shift = true; break;
    }
  }

  onKeyUp(e) {
    switch (e.code) {
      case 'KeyW': case 'ArrowUp': this.keys.forward = false; break;
      case 'KeyS': case 'ArrowDown': this.keys.backward = false; break;
      case 'KeyA': case 'ArrowLeft': this.keys.left = false; break;
      case 'KeyD': case 'ArrowRight': this.keys.right = false; break;
      case 'ShiftLeft': case 'ShiftRight': this.keys.shift = false; break;
    }
  }

  update(delta) {
    // 1. Camera Glide Tween (Floor walk or Exhibit inspection)
    if (this.isGliding && this.glideTween) {
      this.glideTween.elapsed += delta;
      const progress = Math.min(this.glideTween.elapsed / this.glideTween.duration, 1.0);
      const ease = 0.5 - 0.5 * Math.cos(progress * Math.PI); // Smooth cosine easing

      // Smoothly interpolate position
      this.camera.position.lerpVectors(this.glideTween.startPos, this.glideTween.endPos, ease);

      // Smoothly interpolate rotation
      this.targetYaw = THREE.MathUtils.lerp(this.glideTween.startYaw, this.glideTween.endYaw, ease);
      this.targetPitch = THREE.MathUtils.lerp(this.glideTween.startPitch, this.glideTween.endPitch, ease);

      if (progress >= 1.0) {
        this.isGliding = false;
        if (this.glideTween.onComplete) this.glideTween.onComplete();
        this.glideTween = null;
      }
    }

    // 2. Inertia Damping for Rotation
    this.currentYaw = THREE.MathUtils.lerp(this.currentYaw, this.targetYaw, this.damping);
    this.currentPitch = THREE.MathUtils.lerp(this.currentPitch, this.targetPitch, this.damping);

    const euler = new THREE.Euler(this.currentPitch, this.currentYaw, 0, 'YXZ');
    this.camera.quaternion.setFromEuler(euler);

    // 3. Keyboard Walking Movement (Exactly along current screen camera view with collision)
    const isMoving = this.keys.forward || this.keys.backward || this.keys.left || this.keys.right;
    if (isMoving && !this.isGliding) {
      // Floor elevation: On raised central dais (hypot(x, z) <= 11.5m), floor is at Y = 0.35m
      const onDais = Math.hypot(this.camera.position.x, this.camera.position.z) <= 11.5;
      const targetEyeY = (onDais ? 0.35 : 0.0) + this.eyeHeight;
      if (Math.abs(this.camera.position.y - targetEyeY) > 0.02) {
        this.camera.position.y = THREE.MathUtils.lerp(this.camera.position.y, targetEyeY, 0.08);
      }

      // Analytical forward and right vectors from camera yaw:
      // yaw = 0 points North (along -Z).
      const yaw = this.currentYaw;
      const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw)).normalize();
      const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw)).normalize();

      // Screen-accurate movement direction:
      // W / Up: move forward into the screen view
      // S / Down: move backward away from screen view
      // D / Right: strafe to the right of screen view
      // A / Left: strafe to the left of screen view
      const moveDir = new THREE.Vector3();
      if (this.keys.forward) moveDir.add(forward);
      if (this.keys.backward) moveDir.sub(forward);
      if (this.keys.right) moveDir.add(right);
      if (this.keys.left) moveDir.sub(right);

      if (moveDir.lengthSq() > 0.001) {
        moveDir.normalize();
        const speed = this.walkSpeed * (this.keys.shift ? 1.5 : 1.0) * delta;
        const deltaMove = moveDir.multiplyScalar(speed);

        // Slide along walls with solid collision detection
        this.moveWithCollision(deltaMove.x, deltaMove.z);
      }
    }

    // 4. Smooth FOV Zoom
    if (Math.abs(this.camera.fov - this.targetFov) > 0.05) {
      this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, this.targetFov, 0.15);
      this.camera.updateProjectionMatrix();
    }
  }

  /**
   * Artsteps Feature: Point & Click to Walk
   */
  glideToPoint(targetX, targetZ, duration = 1.4, onComplete) {
    if (this.isPositionBlocked(targetX, targetZ)) return;

    const startPos = this.camera.position.clone();
    const endPos = new THREE.Vector3(targetX, this.eyeHeight, targetZ);

    // Rotate slightly towards walk direction
    const walkDir = new THREE.Vector3().subVectors(endPos, startPos);
    let targetYaw = this.targetYaw;
    if (walkDir.lengthSq() > 1.0) {
      targetYaw = Math.atan2(-walkDir.x, -walkDir.z);
    }

    this.startGlide(startPos, endPos, this.currentYaw, targetYaw, this.currentPitch, 0, duration, onComplete);
    this.audioService?.playFootstep();
  }

  /**
   * Artsteps Feature: Click Artwork to inspect dead-center on screen
   * Centers the exact clicked exhibit directly in the middle of the viewport
   */
  glideToExhibit(exhibitGroup, duration = 1.5, onComplete) {
    const exhibitPos = new THREE.Vector3();
    exhibitGroup.getWorldPosition(exhibitPos);

    // Get outward normal vector perpendicular to artwork
    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(exhibitGroup.quaternion);

    // Viewing distance: 2.2m directly in front (ideal framing)
    const viewDistance = 2.2;
    const targetPos = exhibitPos.clone().add(forward.multiplyScalar(viewDistance));

    // Align camera eye level directly with the center of the exhibit (e.g. 3.8m for top row, 2.1m for bottom row)
    // so the artwork appears EXACTLY IN THE DEAD CENTER of the screen!
    targetPos.y = exhibitPos.y;

    // Look directly at the artwork center
    const lookTarget = exhibitPos.clone();

    const lookDir = new THREE.Vector3().subVectors(lookTarget, targetPos).normalize();
    const endYaw = Math.atan2(-lookDir.x, -lookDir.z);
    const endPitch = Math.asin(lookDir.y); // equals 0, looking directly perpendicular

    this.startGlide(this.camera.position.clone(), targetPos, this.currentYaw, endYaw, this.currentPitch, endPitch, duration, onComplete);
    this.audioService?.playHoverSound();
  }

  teleportToHall(hallId) {
    // Map old hall IDs to new khu IDs
    const idMap = { hall_1: 'khu1', hall_2: 'khu2', hall_3: 'khu3', hcm: 'khu5' };
    const khuId = idMap[hallId] || hallId;
    const target = HALL_TARGETS[khuId] || HALL_TARGETS.all;

    const targetPos = new THREE.Vector3(target.x, this.eyeHeight, target.z);
    const lookTarget = new THREE.Vector3(target.lookX, target.lookY, target.lookZ);

    const lookDir = new THREE.Vector3().subVectors(lookTarget, targetPos).normalize();
    const endYaw = Math.atan2(-lookDir.x, -lookDir.z);
    const endPitch = Math.asin(lookDir.y);

    this.startGlide(this.camera.position.clone(), targetPos, this.currentYaw, endYaw, this.currentPitch, endPitch, 1.5);
    this.audioService?.playTeleportSound();
  }

  glideToShowcase(albumId, onComplete = null) {
    this.resetKeys();
    // GĐ4: Two cabinets at (±6.5, -6.5) rotated ±π/4 (on dais y=0.35)
    // Determine which cabinet based on albumId
    const cabinetConfigs = [
      { cx: -6.5, cz: -6.5, rotY: Math.PI / 4,  albums: ['souvenir', 'awards_flags'] },
      { cx:  6.5, cz: -6.5, rotY: -Math.PI / 4, albums: ['pcvt', 'doan_the'] }
    ];
    let cab = cabinetConfigs[0];
    for (const c of cabinetConfigs) {
      if (c.albums.includes(albumId)) { cab = c; break; }
    }

    // Approach from front face of cabinet (1.8m along normal direction)
    const dist = 1.8;
    // Cabinet front face normal points at +Z in local space, rotated by rotY
    const normalX = Math.sin(cab.rotY);
    const normalZ = Math.cos(cab.rotY);
    const targetX = cab.cx + normalX * dist;
    const targetZ = cab.cz + normalZ * dist;
    const targetPos = new THREE.Vector3(targetX, 2.40, targetZ);

    // Look at center of cabinet (album height ~1.55m on dais + 0.35)
    const lookTarget = new THREE.Vector3(cab.cx, 1.55, cab.cz);
    const lookDir = new THREE.Vector3().subVectors(lookTarget, targetPos).normalize();
    const endYaw = Math.atan2(-lookDir.x, -lookDir.z);
    const endPitch = Math.asin(lookDir.y);

    this.startGlide(this.camera.position.clone(), targetPos, this.currentYaw, endYaw, this.currentPitch, endPitch, 1.2, onComplete);
    this.audioService?.playClickSound();
  }

  glideToGridTable(onComplete = null) {
    this.resetKeys();
    // B1: Sa bàn tại (26, 0.95, 0). Tiếp cận từ cửa khu x=20.5, y=2.85, z=0. Nhìn về (26, 0.95, 0) góc yaw -π/2, pitch -35°
    const targetPos = new THREE.Vector3(20.5, 2.85, 0.0);
    const endYaw = -Math.PI / 2; // Nhìn sang hướng Đông (+X)
    const endPitch = -35 * Math.PI / 180; // Cúi -35°

    this.startGlide(this.camera.position.clone(), targetPos, this.currentYaw, endYaw, this.currentPitch, endPitch, 1.4, onComplete);
    this.audioService?.playClickSound();
  }

  teleportToGridTable() {
    this.resetKeys();
    const targetPos = new THREE.Vector3(20.5, 2.85, 0.0);
    const endYaw = -Math.PI / 2;
    const endPitch = -35 * Math.PI / 180;
    this.camera.position.copy(targetPos);
    this.currentYaw = this.targetYaw = endYaw;
    this.currentPitch = this.targetPitch = endPitch;
    const euler = new THREE.Euler(endPitch, endYaw, 0, 'YXZ');
    this.camera.quaternion.setFromEuler(euler);
    this.isGliding = false;
    this.glideTween = null;
    this.audioService?.playTeleportSound();
  }

  startGlide(startPos, endPos, startYaw, endYaw, startPitch, endPitch, duration, onComplete) {
    this.resetKeys(); // Clear any pressed or stuck movement keys

    // Shortest angular rotation path
    let deltaYaw = endYaw - startYaw;
    while (deltaYaw > Math.PI) deltaYaw -= Math.PI * 2;
    while (deltaYaw < -Math.PI) deltaYaw += Math.PI * 2;

    this.isGliding = true;
    this.glideTween = {
      startPos,
      endPos,
      startYaw,
      endYaw: startYaw + deltaYaw,
      startPitch,
      endPitch,
      duration,
      elapsed: 0,
      onComplete
    };
  }

  easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }
}
