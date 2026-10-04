"""Nghiệm thu GĐ6-fix2 — chạy khi server đang mở ở http://localhost:3000
   python scripts/verify_gd6_fix2.py [stats|all]
"""
import os, sys, json, time
from playwright.sync_api import sync_playwright

try:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass

OUT = 'docs/gd6_screens/fix2'
MODE = sys.argv[1] if len(sys.argv) > 1 else 'all'
RESULTS = {}


def pose(page, x, y, z, lx, ly, lz, wait=1.3):
    page.evaluate(f"""() => {{
        const app = window.app;
        app.camera.position.set({x}, {y}, {z});
        app.camera.lookAt({lx}, {ly}, {lz});
        const e = new THREE.Euler().setFromQuaternion(app.camera.quaternion, 'YXZ');
        const c = app.controlsManager;
        c.currentYaw = c.targetYaw = e.y;
        c.currentPitch = c.targetPitch = e.x;
        if (app.updateZoneCulling) app.updateZoneCulling();
        if (app.renderer) app.renderer.render(app.scene, app.camera);
    }}""")
    time.sleep(wait)


def shot(page, name):
    path = f'{OUT}/{name}.png'
    page.screenshot(path=path)
    print(f'   ảnh: {path}', flush=True)


def run():
    os.makedirs(OUT, exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=['--use-gl=swiftshader', '--enable-unsafe-swiftshader'])
        page = browser.new_page(viewport={'width': 1920, 'height': 1080})
        errors, logs = [], []
        page.on('console', lambda m: (errors.append(m.text) if m.type == 'error' else None, logs.append(m.text)))
        page.on('pageerror', lambda e: errors.append(str(e)))

        page.goto('http://localhost:3000/?debug=1', wait_until='domcontentloaded')
        page.wait_for_selector('#btn-enter:not(.hidden)', timeout=120000)
        time.sleep(1)
        page.click('#btn-enter')
        page.wait_for_function(
            "() => (window.app && window.app.isReady === true) || document.getElementById('loading-screen')?.classList.contains('fade-out')",
            timeout=120000)
        time.sleep(3)
        page.evaluate("""() => {
            ['welcome-guide-overlay', 'loading-screen'].forEach(id => document.getElementById(id)?.remove());
            document.body.classList.remove('loading-active');
        }""")

        stats = page.evaluate("""() => {
            const app = window.app, eb = app.exhibitBuilder, ds = app.dataService;
            const cnt = {};
            for (const m of eb.mountedExhibits) cnt[m.wallId] = (cnt[m.wallId] || 0) + 1;
            return {
                counts: cnt,
                framesOnWall: window.assertFramesOnWall(),
                framesOnWallDetails: eb.framesOnWallDetails,
                rowGap: eb.assertRowGap(),
                rowGapReport: (eb.rowGapReport || []).map(r => ({face: r.face, rowGap: r.rowGap && +r.rowGap.toFixed(3), low: r.bottomPlaque && +r.bottomPlaque.toFixed(3), board: r.boardGap && +r.boardGap.toFixed(3)})),
                insideZone: eb.assertInsideZone(),
                stretched: window.assertNoStretchedText(),
                boardOverlap: window.assertNoBoardOverlap(),
                boardOverlapDetails: app.boardOverlapErrors,
                overlapWalls: app.assertNoOverlapOnWalls ? app.assertNoOverlapOnWalls() : -1,
                layout: eb.wallLayoutReport,
                khu46: eb.khu46Counts,
                occluders: app.architect.occluders ? app.architect.occluders.length : 0,
            };
        }""")
        RESULTS['stats'] = stats
        print(json.dumps(stats, ensure_ascii=False, indent=1), flush=True)
        RESULTS['console_errors'] = errors
        print('CONSOLE ERRORS:', len(errors), errors[:10], flush=True)
        print('\n'.join(l for l in logs if 'GD6-fix2' in l or 'Số ảnh' in l or 'BÁO LẠI' in l or 'assertFramesOnWall]' in l or 'assertNoBoardOverlap]' in l)[:6000], flush=True)

        if MODE == 'all':
            stage2(page)
        json.dump(RESULTS, open(f'{OUT}/results.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
        browser.close()


def stage2(page):
    # ---- 1. biển tên ở 3 m ----
    def face_pose(wall, idx, name, dist=3.0):
        info = page.evaluate("""([wall, idx]) => {
            const eb = window.app.exhibitBuilder;
            const list = eb.mountedExhibits.filter(m => m.wallId === wall);
            const m = list[Math.min(idx, list.length - 1)];
            return {x: m.posX, y: m.posY, z: m.posZ, rot: m.rotY, id: m.item.id, n: list.length, h: m.size.h};
        }""", [wall, idx])
        import math
        nx, nz = math.sin(info['rot']), math.cos(info['rot'])
        pose(page, info['x'] + nx * dist, 2.85, info['z'] + nz * dist, info['x'], info['y'] - 0.3, info['z'], wait=2.0)
        shot(page, name)
        return info
    face_pose('wall_k3_north', 4, 'plaque_khu3_3m')
    face_pose('wall_k4_east', 2, 'plaque_khu4_3m')
    face_pose('wall_k6_west', 5, 'plaque_khu6_3m')
    face_pose('wall_k6_east_hcm', 3, 'plaque_khu6_doan_3m')

    # ---- 2. Tường Nam khu 1/3 + mở lối ----
    pose(page, -30, 2.85, 10, -30, 3.5, 24, wait=2.0); shot(page, 'south_wall_khu1')
    pose(page, 30, 2.85, 10, 30, 3.5, 24, wait=2.0); shot(page, 'south_wall_khu3')
    pose(page, 0, 2.85, 30, 40, 3.0, 24, wait=1.5); shot(page, 'hall_opening_east')

    # ---- 3. Tường mốc son từ cửa khu 3 ----
    pose(page, 18.5, 2.85, 0, 35, 3.8, 0, wait=2.5); shot(page, 'milestone_from_khu3_door')

    # ---- 4. Thẻ sa bàn ----
    pose(page, 20.5, 2.85, 0, 26, 0.95, 0, wait=2.0)
    cards = {
        'card_phu_my': ('phuong', 'P. Phú Mỹ'),
        'card_con_dao': ('phuong', 'Đặc khu Côn Đảo'),
        'card_tram_220_vung_tau': ('tram', 'tba_220_vung_tau'),
        'card_tram_ngai_giao': ('tram', 'tba_lc_ngai_giao'),
    }
    RESULTS['cards'] = {}
    for name, (kind, key) in cards.items():
        txt = page.evaluate("""([kind, key]) => {
            const app = window.app, gd = app.gridMapTable.gridData;
            let ud;
            if (kind === 'phuong') ud = {isGridPhuong: true, phuongData: gd.phuong.find(p => p.ten === key)};
            else ud = {isGridTram: true, tramData: gd.tram.find(t => t.id === key)};
            app.showGridItemCard(ud);
            const c = document.getElementById('grid-info-card');
            const pulses = app.gridMapTable._pulses ? app.gridMapTable._pulses.length : 0;
            return {text: c.innerText.replace(/\\s+/g, ' ').trim(), pulses};
        }""", [kind, key])
        RESULTS['cards'][name] = txt
        print(name, txt, flush=True)
        time.sleep(0.5)
        shot(page, name)
    page.evaluate("window.app.hideGridItemCard()")

    # ---- 5. Cờ ----
    k4 = page.evaluate("""() => { const v = new THREE.Vector3(); window.app.architect.screenKhu4Mesh.getWorldPosition(v); return [v.x, v.y, v.z]; }""")
    print('screen khu4', k4)
    pose(page, k4[0], 2.85, k4[2] - 9, k4[0], 2.5, k4[2], wait=2.5); shot(page, 'flags_khu4_stands')
    pose(page, k4[0], 2.85, k4[2] - 5, k4[0], k4[1], k4[2], wait=3.0); shot(page, 'flags_khu4_screen')
    hcm = page.evaluate("""() => { const v = new THREE.Vector3(); window.app.architect.hcmScreenMesh.getWorldPosition(v); return [v.x, v.y, v.z]; }""")
    print('hcm', hcm)
    pose(page, hcm[0], 2.85, hcm[2] - 7, hcm[0], hcm[1], hcm[2], wait=3.0); shot(page, 'flags_hcm_board')

    # ---- 6. Tủ album ----
    pose(page, 0, 2.85, 0, 0, 2.0, -20, wait=2.5); shot(page, 'cabinets_from_origin')
    RESULTS['cabinets'] = page.evaluate("""() => {
        const eb = window.app.exhibitBuilder;
        const out = [];
        const cabs = eb.collisionBoxes.filter(b => b.id.startsWith('AlbumCabinet'));
        const others = window.app.architect.group ? [] : [];
        // khoảng cách tới bệ tròn (±5.5, ±3.5) và tủ trưng bày giữa (0,0)
        const ped = [[5.5,3.5],[-5.5,3.5],[5.5,-3.5],[-5.5,-3.5],[0,0]];
        for (const c of cabs) {
            const cx = (c.minX + c.maxX) / 2, cz = (c.minZ + c.maxZ) / 2;
            out.push({id: c.id, cx, cz, minDist: Math.min(...ped.map(p => Math.hypot(p[0]-cx, p[1]-cz)))});
        }
        const hits = [];
        const all = window.app.exhibitBuilder.collisionBoxes;
        for (const c of cabs) for (const b of all) {
            if (b === c || b.id.startsWith('AlbumCabinet')) continue;
            if (c.minX < b.maxX && c.maxX > b.minX && c.minZ < b.maxZ && c.maxZ > b.minZ) hits.push([c.id, b.id]);
        }
        return {cabinets: out, boxOverlaps: hits};
    }""")
    print('cabinets', RESULTS['cabinets'], flush=True)

    # ---- 7. Đi bộ sảnh → hành lang ----
    RESULTS['walk'] = page.evaluate("""() => {
        const app = window.app, c = app.controlsManager, eb = app.exhibitBuilder;
        const inBox = (x, z) => eb.collisionBoxes.some(b => !b.id.startsWith('AlbumCabinet') && x > b.minX + 0.05 && x < b.maxX - 0.05 && z > b.minZ + 0.05 && z < b.maxZ - 0.05);
        const run = (sx, sz, tx, tz) => {
            app.camera.position.set(sx, 2.85, sz);
            const bad = [];
            c.glideToPoint(tx, tz, 1.0);
            let n = 0;
            while (c.isGliding && n++ < 400) { c.update(0.05); const p = app.camera.position; if (inBox(p.x, p.z)) bad.push([+p.x.toFixed(2), +p.z.toFixed(2)]); }
            return {from: [sx, sz], to: [tx, tz], end: [+app.camera.position.x.toFixed(2), +app.camera.position.z.toFixed(2)], inWall: bad.length};
        };
        return [run(18, 31, 34, 31), run(-18, 31, -34, 31), run(0, 26, 40, 31)];
    }""")
    print('walk', RESULTS['walk'], flush=True)

    # ---- 8. Click xuyên tường / bay tới ảnh xa ----
    RESULTS['click'] = page.evaluate("""() => {
        const app = window.app, c = app.controlsManager, eb = app.exhibitBuilder;
        const inBox = (x, z) => eb.collisionBoxes.some(b => !b.id.startsWith('AlbumCabinet') && x > b.minX + 0.05 && x < b.maxX - 0.05 && z > b.minZ + 0.05 && z < b.maxZ - 0.05);
        const targets = [['wall_k1_far', 6], ['wall_k3_far', 8], ['wall_k4_east', 3], ['wall_k6_west', 7]];
        const out = [];
        for (const [wall, idx] of targets) {
            const list = eb.mountedExhibits.filter(m => m.wallId === wall);
            const m = list[idx];
            app.camera.position.set(0, 2.85, 26);
            const dist0 = Math.hypot(m.posX - 0, m.posZ - 26);
            app.focusOnExhibit(m.item);
            let n = 0, bad = 0;
            while ((c.isGliding || c.glideTween) && n++ < 1500) { c.update(0.05); const p = app.camera.position; if (inBox(p.x, p.z)) bad++; }
            const p = app.camera.position;
            const nx = Math.sin(m.rotY), nz = Math.cos(m.rotY);
            const dn = (p.x - m.posX) * nx + (p.z - m.posZ) * nz;
            const dl = Math.abs((p.x - m.posX) * Math.cos(m.rotY) - (p.z - m.posZ) * Math.sin(m.rotY));
            out.push({wall, id: m.item.id, startDist: +dist0.toFixed(1), end: [+p.x.toFixed(2), +p.z.toFixed(2)], inFront: dn > 0.5 && dn < 6 && dl < 3, frontDist: +dn.toFixed(2), lateral: +dl.toFixed(2), stepsInsideWall: bad, steps: n});
        }
        return out;
    }""")
    print('click', json.dumps(RESULTS['click'], ensure_ascii=False, indent=1), flush=True)

    # ---- 9. Ảnh cùng sự kiện ----
    RESULTS['related'] = page.evaluate("""() => {
        const ds = window.app.dataService;
        const out = [];
        for (const it of ds.allItems.filter(i => i.khu === 'khu3' || i.khu === 'khu4').slice(0, 400)) {
            const r = ds.getRelatedItems(it);
            if (r.length >= 1) out.push([it.id, r.length]);
        }
        return {withRelated: out.length, sample: out.slice(0, 5), max: Math.max(0, ...out.map(o => o[1]))};
    }""")
    print('related', RESULTS['related'], flush=True)
    print('CONSOLE ERRORS (end):', len(page.evaluate("1") and []), flush=True)


if __name__ == '__main__':
    run()
