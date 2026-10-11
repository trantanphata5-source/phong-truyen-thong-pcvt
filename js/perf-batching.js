/**
 * PERF-2 (TOI_UU_HIEU_NANG.md mục C2–C4) – Giảm lệnh vẽ
 *
 * C2 instanceExhibitFrames(): khung ảnh hiện vật cùng vật liệu trong 1 khu -> 1 InstancedMesh
 *     (BoxGeometry(1,1,1) + scale). Hitbox, ảnh, biển tên giữ riêng nên rê/bấm không đổi.
 *     Lọc hiện vật: setExhibitFrameVisible() đặt scale 0 cho instance.
 * C3 mergeStatic(): gộp lưới tĩnh không tương tác theo (ô không gian × vật liệu × lớp vật cản).
 *     Không đụng: ảnh, biển tên, màn hình, totem, tủ album, sa bàn, mặt có canvas riêng, vật trong suốt.
 * C4 measureZoneVisibility(): đo bằng tia khu nào nhìn thấy khu nào (dùng để viết bảng trong layout-config.js).
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const _m = new THREE.Matrix4();
const _s = new THREE.Matrix4();
const _inv = new THREE.Matrix4();
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

// ---------------------------------------------------------------------------
// C2. Khung ảnh -> InstancedMesh
// ---------------------------------------------------------------------------
export function instanceExhibitFrames(exhibitBuilder) {
  const zoneGroups = exhibitBuilder.zoneGroups || {};
  const frameIndex = new Map(); // exhibitGroup -> [{ im, index, matrix }]
  const created = [];
  let removed = 0;
  const unitBox = new THREE.BoxGeometry(1, 1, 1);

  for (const [zone, zg] of Object.entries(zoneGroups)) {
    zg.updateMatrixWorld(true);
    _inv.copy(zg.matrixWorld).invert();
    const byMat = new Map();
    zg.traverse(o => {
      if (!o.isMesh || !o.userData?.isExhibitFrame) return;
      const p = o.geometry.parameters || {};
      if (!p.width) return;
      if (!byMat.has(o.material)) byMat.set(o.material, []);
      byMat.get(o.material).push(o);
    });
    for (const [mat, frames] of byMat) {
      if (frames.length < 2) continue;
      const im = new THREE.InstancedMesh(unitBox, mat, frames.length);
      im.name = `PERF_FrameInstances_${zone}_${created.length}`;
      im.userData.perfBatched = true;
      frames.forEach((f, i) => {
        const p = f.geometry.parameters;
        _m.multiplyMatrices(_inv, f.matrixWorld);
        _s.makeScale(p.width, p.height, p.depth);
        const mat4 = new THREE.Matrix4().multiplyMatrices(_m, _s);
        im.setMatrixAt(i, mat4);
        const exhibitGroup = f.parent;
        if (!frameIndex.has(exhibitGroup)) frameIndex.set(exhibitGroup, []);
        frameIndex.get(exhibitGroup).push({ im, index: i, matrix: mat4 });
        f.parent.remove(f);
        f.geometry.dispose();
        removed++;
      });
      im.instanceMatrix.needsUpdate = true;
      im.computeBoundingBox();
      im.computeBoundingSphere();
      zg.add(im);
      im.updateMatrixWorld(true);
      created.push(im);
    }
  }
  console.log(`[PERF-2] C2: ${removed} khung -> ${created.length} InstancedMesh`);
  return { frameIndex, created };
}

/** Ẩn/hiện khung của 1 hiện vật (dùng khi lọc) */
export function setExhibitFrameVisible(frameIndex, exhibitGroup, visible) {
  const list = frameIndex?.get(exhibitGroup);
  if (!list) return false;
  for (const e of list) {
    e.im.setMatrixAt(e.index, visible ? e.matrix : ZERO);
    e.im.instanceMatrix.needsUpdate = true;
  }
  return true;
}

// ---------------------------------------------------------------------------
// C3. Gộp lưới tĩnh
// ---------------------------------------------------------------------------
function materialKey(m) {
  // Vật liệu giống hệt nhau (khác đối tượng) vẫn gộp chung được
  const c = (x) => (x && x.isColor ? x.getHexString() : '');
  return [
    m.type, c(m.color), c(m.emissive), m.emissiveIntensity ?? '', m.roughness ?? '', m.metalness ?? '',
    m.map ? m.map.uuid : '', m.side, m.transparent, m.opacity, m.toneMapped, m.vertexColors,
    m.polygonOffset ? `${m.polygonOffsetFactor},${m.polygonOffsetUnits}` : '', m.depthWrite, m.depthTest,
    m.flatShading, m.alphaTest, m.visible
  ].join('|');
}

function attrSignature(g) {
  // position/normal/uv luôn có sau khi chuẩn hóa; chỉ còn khác nhau ở màu đỉnh
  return g.attributes.color ? 'c' : '-';
}

/** Chuẩn hóa hình: không chỉ số, đủ position/normal/uv để gộp được với nhau */
function normalizeGeometry(src) {
  let g = src.index ? src.toNonIndexed() : src.clone();
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k);
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  g.morphAttributes = {};
  g.clearGroups();
  return g;
}

/**
 * @param root nhóm gốc (MuseumArchitecture, HCMExhibits, HCMTimeline)
 * @param opts.skip(o) true -> giữ nguyên lưới o (và cả cây con nếu skipTree)
 * @param opts.cell kích thước ô không gian (m)
 * @param opts.isOccluder(o, box) xếp lưới vào lớp vật cản (để giữ đúng tia chặn bấm xuyên tường)
 */
export function mergeStatic(root, { skip = () => false, skipTree = () => false, cell = 16, isOccluder = () => false, label = '' } = {}) {
  root.updateMatrixWorld(true);
  _inv.copy(root.matrixWorld).invert();
  const buckets = new Map();
  const box = new THREE.Box3();
  const center = new THREE.Vector3();
  let before = 0;

  const visit = (o, parentVisible) => {
    const vis = parentVisible && o.visible;
    if (skipTree(o)) return;
    if (o.isMesh) before++;
    if (vis && o.isMesh && !o.isInstancedMesh && !o.isSkinnedMesh && !Array.isArray(o.material) &&
        o.material && !o.material.transparent && o.geometry?.attributes?.position && !skip(o) &&
        o.children.length === 0 &&
        o.material.side !== undefined) {
      const det = o.matrixWorld.determinant();
      if (det > 0 || o.material.side === THREE.DoubleSide) {
        box.setFromObject(o);
        box.getCenter(center);
        const occ = isOccluder(o, box) ? 'o' : '-';
        const key = `${materialKey(o.material)}#${attrSignature(o.geometry)}#${Math.floor(center.x / cell)},${Math.floor(center.z / cell)}#${occ}#${o.renderOrder}`;
        if (!buckets.has(key)) buckets.set(key, { mat: o.material, occ: occ === 'o', meshes: [] });
        buckets.get(key).meshes.push(o);
      }
    }
    for (const c of o.children.slice()) visit(c, vis);
  };
  visit(root, true);

  // Lượt 2: lưới lẻ (vật liệu Standard riêng, không texture) -> gộp theo độ nhám/kim loại (làm tròn 0,2),
  // màu vật liệu chuyển thành màu đỉnh (vertex color) nên nhìn không đổi.
  const finalBuckets = [];
  const bake = new Map();
  const r1 = (v) => Math.round((v ?? 0) * 5) / 5; // bước 0,2
  for (const [key, b] of buckets) {
    const m = b.mat;
    const canBake = b.meshes.length === 1 && m.isMeshStandardMaterial && !m.isMeshPhysicalMaterial && !m.map &&
      !m.vertexColors && !m.polygonOffset && !(m.emissive && m.emissive.getHex() !== 0 && m.emissiveIntensity > 0) &&
      !m.normalMap && !m.roughnessMap && !m.metalnessMap && !m.aoMap && !m.envMap;
    if (!canBake) { finalBuckets.push(b); continue; }
    const cellKey = key.split('#').slice(2).join('#');
    const k2 = `bake|${m.side}|${r1(m.roughness)}|${r1(m.metalness)}|${m.flatShading}|${m.toneMapped}|${cellKey}`;
    if (!bake.has(k2)) bake.set(k2, { mat: null, occ: b.occ, meshes: [], baked: true, r: r1(m.roughness), mt: r1(m.metalness), side: m.side, flat: m.flatShading, tm: m.toneMapped });
    bake.get(k2).meshes.push(b.meshes[0]);
  }
  for (const b of bake.values()) {
    if (b.meshes.length < 2) { finalBuckets.push({ mat: b.meshes[0].material, occ: b.occ, meshes: b.meshes }); continue; }
    b.mat = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: b.r, metalness: b.mt, side: b.side, flatShading: b.flat, toneMapped: b.tm });
    b.mat.name = `PERF_Baked_${label}`;
    finalBuckets.push(b);
  }

  const merged = [];
  const removedSet = new Set();
  for (const b of finalBuckets) {
    if (b.meshes.length < 2) continue;
    const geos = [];
    for (const o of b.meshes) {
      const g = normalizeGeometry(o.geometry);
      _m.multiplyMatrices(_inv, o.matrixWorld);
      g.applyMatrix4(_m);
      if (b.baked) {
        const c = o.material.color;
        const n = g.attributes.position.count;
        const arr = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
        g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
      }
      geos.push(g);
    }
    let mg = null;
    try { mg = mergeGeometries(geos, false); } catch (e) { mg = null; }
    geos.forEach(g => g.dispose());
    if (!mg) continue;
    mg.computeBoundingBox();
    mg.computeBoundingSphere();
    const mesh = new THREE.Mesh(mg, b.mat);
    mesh.name = `PERF_Merged_${label}_${merged.length}`;
    mesh.userData.perfBatched = true;
    mesh.userData.perfOccluder = b.occ;
    mesh.renderOrder = b.meshes[0].renderOrder;
    root.add(mesh);
    mesh.updateMatrixWorld(true);
    for (const o of b.meshes) { o.parent?.remove(o); removedSet.add(o); }
    merged.push(mesh);
  }
  console.log(`[PERF-2] C3 ${label}: ${removedSet.size} lưới -> ${merged.length} lưới gộp (trước: ${before} lưới)`);
  return { merged, removedSet, before };
}

/** Đếm lưới (Mesh) trong cây */
export function countMeshes(root) {
  let n = 0;
  root?.traverse(o => { if (o.isMesh) n++; });
  return n;
}

// ---------------------------------------------------------------------------
// C4. Đo bằng tia: từ các điểm trong khu A bắn tới các điểm của nhóm B.
// ---------------------------------------------------------------------------
export function measureZoneVisibility(app, zoneBounds, targetGroups, { samplesA = 6, maxTargets = 50 } = {}) {
  const ray = new THREE.Raycaster();
  const walls = (app.architect?.occluders || []).filter(o => o !== app.architect.floorMesh);
  const result = {};
  const dir = new THREE.Vector3();
  const targetsOf = {};
  for (const [name, grp] of Object.entries(targetGroups)) {
    const pts = [];
    grp.updateMatrixWorld(true);
    grp.traverse(o => {
      if (!o.isMesh) return;
      if (o.isInstancedMesh) {
        for (let i = 0; i < o.count; i++) {
          o.getMatrixAt(i, _m); _m.premultiply(o.matrixWorld);
          pts.push(new THREE.Vector3().setFromMatrixPosition(_m));
        }
      } else {
        const b = new THREE.Box3().setFromObject(o);
        if (b.isEmpty()) return;
        pts.push(b.getCenter(new THREE.Vector3()));
        pts.push(new THREE.Vector3(b.min.x, b.max.y, b.min.z), new THREE.Vector3(b.max.x, b.max.y, b.max.z));
      }
    });
    // chọn đều tối đa maxTargets điểm
    const step = Math.max(1, Math.floor(pts.length / maxTargets));
    targetsOf[name] = pts.filter((_, i) => i % step === 0).slice(0, maxTargets * 2);
  }
  for (const [zone, b] of Object.entries(zoneBounds)) {
    const src = [];
    for (let i = 0; i <= samplesA; i++) for (let j = 0; j <= samplesA; j++) {
      const x = b.minX + 0.8 + (b.maxX - b.minX - 1.6) * i / samplesA;
      const z = b.minZ + 0.8 + (b.maxZ - b.minZ - 1.6) * j / samplesA;
      src.push(new THREE.Vector3(x, 1.7, z), new THREE.Vector3(x, 3.4, z));
    }
    result[zone] = {};
    for (const [name, pts] of Object.entries(targetsOf)) {
      let seen = 0;
      outer: for (const a of src) {
        for (const t of pts) {
          dir.subVectors(t, a);
          const dist = dir.length();
          dir.normalize();
          ray.set(a, dir); ray.far = dist - 0.3;
          const hits = ray.intersectObjects(walls, false);
          if (hits.length === 0) { seen++; break outer; }
        }
      }
      result[zone][name] = seen > 0;
    }
  }
  return result;
}
