"""Nghiệm thu GĐ6-fix3 — chạy khi server đang mở ở http://localhost:3000
   python scripts/verify_gd6_fix3.py [stats|all]
"""
import os, sys, json, time
from playwright.sync_api import sync_playwright

try:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass

OUT = 'docs/gd6_screens/fix3'
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
        print(json.dumps({k:v for k,v in stats.items() if k not in ('layout','rowGapReport')}, ensure_ascii=False), flush=True)
        print('LAYOUT', json.dumps([(l['wallId'],l['items'],l['columns'],round(l['scale'],2),round(l['gap'],2)) for l in stats['layout']]), flush=True)
        print('ROWGAP', json.dumps(stats['rowGapReport']), flush=True)
        RESULTS['console_errors'] = errors
        print('CONSOLE ERRORS:', len(errors), errors[:10], flush=True)
        print('\n'.join(l for l in logs if 'Thi?u ?nh' in l or 'tr?ng' in l or 'GD6-fix3' in l or 'Số ảnh' in l or 'BÁO LẠI' in l or 'assertFramesOnWall]' in l or 'assertNoBoardOverlap]' in l)[:6000], flush=True)

        if MODE == 'all':
            stage2(page)
        json.dump(RESULTS, open(f'{OUT}/results.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
        browser.close()


def stage2(page):
    import math
    def wall_overview(wall, name, dist=14, y=3.0):
        info = page.evaluate("""(wall) => {
            const eb = window.app.exhibitBuilder;
            const l = eb.mountedExhibits.filter(m => m.wallId === wall);
            const xs = l.map(m=>m.posX), zs = l.map(m=>m.posZ);
            return {cx:(Math.min(...xs)+Math.max(...xs))/2, cz:(Math.min(...zs)+Math.max(...zs))/2, rot:l[0].rotY, y:l[0].posY};
        }""", wall)
        nx, nz = math.sin(info['rot']), math.cos(info['rot'])
        pose(page, info['cx']+nx*dist, 2.85, info['cz']+nz*dist, info['cx'], 3.6, info['cz'], wait=3.0)
        shot(page, name)
    wall_overview('wall_k3_north', 'k3_north', 11)
    wall_overview('wall_k3_far', 'k3_far', 11)
    wall_overview('wall_k3_south', 'k3_south', 9)
    wall_overview('wall_k4_east', 'k4_east', 12)
    wall_overview('wall_k4_west_hcm', 'k4_west_hcm', 12)
    wall_overview('wall_k6_west', 'k6_west', 12)
    wall_overview('wall_k6_east_hcm', 'k6_east_hcm', 12)
    pose(page, 36, 2.85, 12, 42, 1.2, 24, wait=2.5); shot(page, 'corner_south_khu3')
    pose(page, -36, 2.85, 12, -42, 1.2, 24, wait=2.5); shot(page, 'corner_south_khu1')
    pose(page, 36, 2.85, 60, 22.6, 3.5, 60, wait=2.5); shot(page, 'mid_khu4_look_west')
    pose(page, -36, 2.85, 60, -22.6, 3.5, 60, wait=2.5); shot(page, 'mid_khu6_look_east')
    pose(page, 0, 2.85, 45, 0, 3.5, 82, wait=2.5); shot(page, 'hcm_interior')
    pose(page, 0, 2.85, 60, 21.5, 3.5, 60, wait=2.5); shot(page, 'hcm_interior_east')
    clicks = {}
    for iid in ['dang_bo_020_2026-04-18','cong_doan_015_2026-03-10','pcvt_103_2026-03-27','doan_tn_036_2026-08-04']:
        clicks[iid] = page.evaluate("""(id) => {
            const app = window.app; const it = app.dataService.getItemById(id);
            if (!it) return {missing:true};
            const m = app.exhibitBuilder.mountedExhibits.find(x => x.item.id === id);
            const nar = app.dataService.getNarrative ? app.dataService.getNarrative(id) : null;
            return {title: it.tieu_de || it.title, khu: it.khu, mounted: !!m, wall: m && m.wallId, zone: m && m.size && m.size.zone,
                    narr: !!(it.thuyet_minh || (nar && (nar.thuyet_minh||nar.text))) , keys:Object.keys(it).slice(0,25)};
        }""", iid)
    print(json.dumps(clicks, ensure_ascii=False, indent=1), flush=True)
    RESULTS['clicks'] = clicks
    dup = page.evaluate("""() => {
        const app = window.app, ids = new Set((app.dataService.duplicateItems||[]).map(i=>i.id));
        const onWall = app.exhibitBuilder.mountedExhibits.filter(m => ids.has(m.item.id)).length;
        const seen = {}; let dups = 0;
        for (const m of app.exhibitBuilder.mountedExhibits) { if (seen[m.item.id]) dups++; seen[m.item.id] = 1; }
        const av = app.albumViewer; const alb = {};
        if (av && av.albumMap) for (const k in av.albumMap) alb[k] = av.albumMap[k].pages.length;
        return {dupIds: [...ids], dupOnWall: onWall, twiceOnWalls: dups, albums: alb};
    }""")
    print(json.dumps(dup, ensure_ascii=False), flush=True)
    RESULTS['dup'] = dup


if __name__ == '__main__':
    run()
