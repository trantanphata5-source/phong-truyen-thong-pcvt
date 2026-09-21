import * as THREE from 'three';

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
    this.eyeHeight = 1.75;
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

    // Museum Wall & Partition Collision Boxes (AABBs: minX, maxX, minZ, maxZ)
    // Completely prevents walking through walls or partitions anywhere in the museum
    this.collisionWalls = [
      // 1. Central Partitions (Freestanding exhibit walls)
      { name: 'Partition_Hall1_Center', minX: -0.6, maxX: 0.6, minZ: -40.0, maxZ: -22.0 },
      { name: 'Partition_Hall2_Center', minX: -36.0, maxX: -34.0, minZ: -13.0, maxZ: 13.0 },
      { name: 'Partition_Hall3_Center', minX: 34.0, maxX: 36.0, minZ: -13.0, maxZ: 13.0 },

      // 2. North Hall Outer Walls
      { name: 'Wall_North_Back', minX: -19.0, maxX: 19.0, minZ: -46.0, maxZ: -44.0 },
      { name: 'Wall_North_West', minX: -19.0, maxX: -17.0, minZ: -45.0, maxZ: -17.0 },
      { name: 'Wall_North_East', minX: 17.0, maxX: 19.0, minZ: -45.0, maxZ: -17.0 },

      // 3. West Hall Outer Walls
      { name: 'Wall_West_Far', minX: -51.0, maxX: -49.0, minZ: -26.0, maxZ: 26.0 },
      { name: 'Wall_West_North', minX: -50.0, maxX: -17.0, minZ: -26.0, maxZ: -24.0 },
      { name: 'Wall_West_South', minX: -50.0, maxX: -17.0, minZ: 24.0, maxZ: 26.0 },

      // 4. East Hall Outer Walls
      { name: 'Wall_East_Far', minX: 49.0, maxX: 51.0, minZ: -26.0, maxZ: 26.0 },
      { name: 'Wall_East_North', minX: 17.0, maxX: 50.0, minZ: -26.0, maxZ: -24.0 },
      { name: 'Wall_East_South', minX: 17.0, maxX: 50.0, minZ: 24.0, maxZ: 26.0 },

      // 5. South Lobby & Entrance Walls
      { name: 'Wall_South_Left', minX: -35.0, maxX: -22.0, minZ: 37.0, maxZ: 39.0 },
      { name: 'Wall_South_Right', minX: 22.0, maxX: 35.0, minZ: 37.0, maxZ: 39.0 },

      // 6. Luxury Showcase Vitrine for Historical Albums (Central Rotunda)
      { name: 'Showcase_Album_Vitrine', minX: -1.25, maxX: 1.25, minZ: -8.9, maxZ: -7.5 },

      // 7. HCM Cultural Zone (Khu 4) Walls
      { name: 'Wall_HCM_West', minX: -23.0, maxX: -21.0, minZ: 38.0, maxZ: 82.0 },
      { name: 'Wall_HCM_East', minX: 21.0, maxX: 23.0, minZ: 38.0, maxZ: 82.0 },
      { name: 'Wall_HCM_South', minX: -22.0, maxX: 22.0, minZ: 81.0, maxZ: 83.0 }
    ];

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

    // 2. Validate position inside defined architectural rooms (T-shape museum + HCM Zone)
    const inHall1 = x >= -17.5 && x <= 17.5 && z >= -44.2 && z <= -17.0;
    const inHall2 = x >= -49.2 && x <= -17.0 && z >= -24.2 && z <= 24.2;
    const inHall3 = x >= 17.0 && x <= 49.2 && z >= -24.2 && z <= 24.2;
    const inRotunda = x >= -17.5 && x <= 17.5 && z >= -17.0 && z <= 24.5;
    const inLobby = x >= -10.0 && x <= 10.0 && z >= 24.5 && z <= 37.5;
    const inHCM = x >= -21.0 && x <= 21.0 && z >= 36.5 && z <= 80.5;

    if (!inHall1 && !inHall2 && !inHall3 && !inRotunda && !inLobby && !inHCM) {
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
      }
    });

    // Mouse Move (Drag Look with Artsteps Natural Orbit)
    window.addEventListener('mousemove', (e) => {
      if (!this.isDragging) return;

      const deltaX = e.clientX - this.prevMousePos.x;
      const deltaY = e.clientY - this.prevMousePos.y;

      if (Math.abs(deltaX) > 2 || Math.abs(deltaY) > 2) {
        this.dragMoved = true;
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
      }
    }, { passive: true });

    window.addEventListener('touchmove', (e) => {
      if (!this.isDragging || e.touches.length !== 1) return;
      const deltaX = e.touches[0].clientX - this.prevMousePos.x;
      const deltaY = e.touches[0].clientY - this.prevMousePos.y;

      if (Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3) {
        this.dragMoved = true;
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
    let targetPos, lookTarget;

    if (hallId === 'hall_1') {
      targetPos = new THREE.Vector3(0, this.eyeHeight, -25);
      lookTarget = new THREE.Vector3(0, 3.5, -45);
    } else if (hallId === 'hall_2') {
      targetPos = new THREE.Vector3(-28, this.eyeHeight, 0);
      lookTarget = new THREE.Vector3(-49, 3.0, 0);
    } else if (hallId === 'hall_3') {
      targetPos = new THREE.Vector3(28, this.eyeHeight, 0);
      lookTarget = new THREE.Vector3(49, 3.0, 0);
    } else if (hallId === 'hcm') {
      targetPos = new THREE.Vector3(0, this.eyeHeight, 45);
      lookTarget = new THREE.Vector3(0, 4.0, 60);
    } else {
      // All / Rotunda
      targetPos = new THREE.Vector3(0, this.eyeHeight, 18);
      lookTarget = new THREE.Vector3(0, 2.5, 0);
    }

    const lookDir = new THREE.Vector3().subVectors(lookTarget, targetPos).normalize();
    const endYaw = Math.atan2(-lookDir.x, -lookDir.z);
    const endPitch = Math.asin(lookDir.y);

    this.startGlide(this.camera.position.clone(), targetPos, this.currentYaw, endYaw, this.currentPitch, endPitch, 1.5);
    this.audioService?.playTeleportSound();
  }

  glideToShowcase(albumId, onComplete = null) {
    this.resetKeys();
    const targetX = albumId === 'souvenir_photos' ? -0.45 : 0.45;
    // Elevated adult eye-level perspective standing in front of showcase (dais floor Y = 0.35m)
    // Standing at Y = 2.40m (2.05m eye-level) looking down at the albums at Y = 1.28m
    // Distance Z = -6.45m to showcase center Z = -8.2m provides an optimal ~34 degree downward angle
    const targetPos = new THREE.Vector3(targetX * 0.3, 2.40, -6.45);
    const lookTarget = new THREE.Vector3(targetX * 0.55, 1.28, -8.15);

    const lookDir = new THREE.Vector3().subVectors(lookTarget, targetPos).normalize();
    const endYaw = Math.atan2(-lookDir.x, -lookDir.z);
    const endPitch = Math.asin(lookDir.y);

    this.startGlide(this.camera.position.clone(), targetPos, this.currentYaw, endYaw, this.currentPitch, endPitch, 1.2, onComplete);
    this.audioService?.playClickSound();
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
