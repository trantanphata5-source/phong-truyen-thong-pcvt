"""Nghiệm thu GĐ6-fix1 (mục F) – chạy khi server đang mở ở http://localhost:3000
   python scripts/verify_gd6_fix1.py
"""
import os
import sys
import json
import time
from playwright.sync_api import sync_playwright

if sys.platform == 'win32':
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

OUT = 'docs/gd6_screens'
RESULTS = {}


def pose(page, x, y, z, lx, ly, lz):
    page.evaluate(f"""() => {{
        const app = window.app;
        app.camera.position.set({x}, {y}, {z});
        app.camera.lookAt({lx}, {ly}, {lz});
        const e = new THREE.Euler().setFromQuaternion(app.camera.quaternion, 'YXZ');
        const c = app.controlsManager;
        c.currentYaw = c.targetYaw = e.y;
        c.currentPitch = c.targetPitch = e.x;
        if (app.renderer) app.renderer.render(app.scene, app.camera);
    }}""")
    time.sleep(1.2)


def shot(page, name):
    path = f'{OUT}/{name}.png'
    page.screenshot(path=path)
    print(f'   ảnh: {path}', flush=True)


def run():
    os.makedirs(OUT, exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={'width': 1920, 'height': 1080})
        errors = []
        page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
        page.on('pageerror', lambda e: errors.append(str(e)))

        page.goto('http://localhost:3000/?debug=1', wait_until='domcontentloaded')
        page.wait_for_selector('#btn-enter:not(.hidden)', timeout=60000)
        time.sleep(1)
        page.click('#btn-enter')
        page.wait_for_function(
            "() => (window.app && window.app.isReady === true) || document.getElementById('loading-screen')?.classList.contains('fade-out')",
            timeout=60000)
        time.sleep(2)
        page.evaluate("""() => {
            ['welcome-guide-overlay', 'loading-screen'].forEach(id => document.getElementById(id)?.remove());
            document.body.classList.remove('loading-active');
        }""")

        # ---------------- Số liệu tổng ----------------
        stats = page.evaluate("""() => {
            const app = window.app, eb = app.exhibitBuilder, ds = app.dataService;
            const seq = eb.khu3Report.sequence;
            let seqBad = [];
            for (let i = 1; i < seq.length; i++) if ((seq[i].date || '') < (seq[i-1].date || '')) seqBad.push([seq[i-1].id, seq[i-1].date, seq[i].id, seq[i].date]);
            const k3 = eb.mountedExhibits.filter(m => (m.zone || m.item?.zone) === 'khu3' || (m.wallId || '').includes('k3'));
            const onWalls = seq.length;
            const onPartition = eb.mountedExhibits.filter(m => (m.wallId || m.faceKey || '').toString().startsWith('partition_k3')).length;
            return {
                narrativesMerged: Object.keys(ds.narratives || {}).filter(id => ds.itemsById.get(id)).length,
                narrativesTotal: Object.keys(ds.narratives || {}).length,
                khu3Walls: eb.khu3Report.walls,
                khu3SeqCount: onWalls,
                khu3First: seq[0], khu3Last: seq[seq.length - 1],
                seqBad,
                partitionK3: onPartition,
                rowGap: eb.rowGapErrors, insideZone: eb.insideZoneErrors,
                rowGapReport: (eb.rowGapReport || []).map(r => ({face: r.face, rowGap: r.rowGap && +r.rowGap.toFixed(3), bottomPlaque: r.bottomPlaque && +r.bottomPlaque.toFixed(3), boardGap: r.boardGap && +r.boardGap.toFixed(3)})),
                stretched: window.assertNoStretchedText ? window.assertNoStretchedText() : -1,
                overlap: app.assertNoOverlapOnWalls ? app.assertNoOverlapOnWalls() : -1,
                boards: eb.wallBoardInfo.map(b => ({face: b.face, title: b.title, sub: b.sub, w: +b.w.toFixed(2), h: b.h, y: b.y, lines: b.titleLines, cap: b.titleCapM, subCap: b.subCapM})),
                mountedKeys: [...new Set(eb.mountedExhibits.map(m => m.faceKey || m.wallId))].slice(0, 60),
            };
        }""")
        RESULTS['stats'] = stats
        print(json.dumps(stats, ensure_ascii=False, indent=1), flush=True)

        # ---------------- Lối đi / va chạm ----------------
        walk = page.evaluate("""async () => {
            const L = await import('/js/layout-config.js');
            const c = window.app.controlsManager;
            const test = (x, z0, z1) => { const b = []; for (let z = z0; z <= z1; z += 0.5) if (c.isPositionBlocked(x, z)) b.push(z); return b; };
            const ids = L.WALLS.map(w => w.id);
            return {
                k3_to_k4_x42: test(42, 10, 50), k3_to_k4_x36: test(36, 15, 50),
                k1_to_k6_x42: test(-42, 10, 50), k1_to_k6_x36: test(-36, 15, 50),
                hallEndEastBlocked: [c.isPositionBlocked(50.2, 31.5), c.isPositionBlocked(51, 27), c.isPositionBlocked(51, 37)],
                hallEndWestBlocked: [c.isPositionBlocked(-50.2, 31.5), c.isPositionBlocked(-51, 27), c.isPositionBlocked(-51, 37)],
                hasHallEast: ids.includes('wall_hall_east'), hasHallWest: ids.includes('wall_hall_west'),
                removed: ['wall_k4_north_left','wall_k4_north_right','wall_k6_north_left','wall_k6_north_right'].filter(i => ids.includes(i)),
                minimapWalls: document.querySelectorAll('#minimap-svg rect, #minimap-svg line').length,
            };
        }""")
        RESULTS['walk'] = walk
        print(json.dumps(walk, ensure_ascii=False), flush=True)

        # ---------------- Thẻ thuyết minh ----------------
        cards = page.evaluate("""() => {
            const app = window.app, ds = app.dataService;
            const keys = Object.keys(ds.narratives);
            const pick = [];
            const byZone = z => keys.find(k => ds.itemsById.get(k)?.khu === z && ds.itemsById.get(k)?.thuyet_minh);
            [byZone('khu3'), byZone('khu4'), byZone('khu6'), keys.find(k => k.startsWith('pcvt_066')), keys.find(k => k.startsWith('pcvt_068')), keys.find(k => k.startsWith('moc2_'))]
              .forEach(k => k && pick.push(k));
            // thêm 1 ảnh khu 3 khác
            const k3 = keys.filter(k => ds.itemsById.get(k)?.khu === 'khu3' && ds.itemsById.get(k)?.thuyet_minh);
            if (k3[10]) pick.push(k3[10]);
            const out = [];
            for (const id of pick) {
                const it = ds.itemsById.get(id);
                if (!it) { out.push({id, missing: true}); continue; }
                app.uiController.showExhibitCard(it);
                const n = document.getElementById('card-narrative');
                const cs = getComputedStyle(n);
                out.push({
                    id, title: document.getElementById('card-title').textContent.trim(),
                    meta: document.getElementById('card-meta-line').textContent.trim(),
                    narrativeVisible: !n.classList.contains('hidden') && cs.display !== 'none',
                    narrativeLen: n.textContent.length, fontSize: cs.fontSize, lineHeight: cs.lineHeight,
                    whiteSpace: cs.whiteSpace, maxH: cs.maxHeight, overflowY: cs.overflowY,
                    links: [...n.querySelectorAll('a')].map(a => a.target).slice(0, 3),
                    tags: n.querySelectorAll('.narrative-tags, .tm-hashtags, [class*="hashtag"]').length,
                });
            }
            return out;
        }""")
        RESULTS['cards'] = cards
        print(json.dumps(cards, ensure_ascii=False, indent=1), flush=True)

        # chụp thẻ đang mở (ảnh khu 3 có thuyết minh dài)
        page.evaluate("""() => {
            const ds = window.app.dataService;
            const k = Object.keys(ds.narratives).find(k => ds.itemsById.get(k)?.khu === 'khu3' && (ds.itemsById.get(k)?.thuyet_minh || '').length > 600);
            window.app.uiController.showExhibitCard(ds.itemsById.get(k));
        }""")
        time.sleep(1.5)
        shot(page, 'fix1_the_thuyet_minh')
        page.evaluate("() => window.app.uiController.hideExhibitCard ? window.app.uiController.hideExhibitCard() : document.getElementById('btn-close-card')?.click()")
        time.sleep(0.6)

        # ---------------- Album: nút Xem thuyết minh ----------------
        album = page.evaluate("""async () => {
            const app = window.app, av = app.albumViewer, ds = app.dataService;
            const res = {};
            for (const aid of ['pcvt', 'doan_the']) {
                app.openAlbum(aid);
                await new Promise(r => setTimeout(r, 400));
                const pages = av.activeAlbum?.pages || [];
                let matched = 0, firstIdx = -1;
                pages.forEach((pg, i) => { const it = ds.findNarrativeItemByPath(pg.full) || ds.findNarrativeItemByPath(pg.thumb); if (it && it.tieu_de) { matched++; if (firstIdx < 0) firstIdx = i; } });
                let btn = false, panel = false, title = '';
                if (firstIdx >= 0) {
                    av.goToSpread(Math.floor(firstIdx / 2));
                    await new Promise(r => setTimeout(r, 900));
                    const b = document.querySelector('.album-narrative-btn');
                    btn = !!b;
                    if (b) { b.click(); await new Promise(r => setTimeout(r, 300)); const p = document.querySelector('.album-narrative-panel'); panel = !!p; title = p?.querySelector('.album-narrative-title')?.textContent || ''; }
                }
                res[aid] = { pages: pages.length, matched, btn, panel, title };
            }
            return res;
        }""")
        RESULTS['album'] = album
        print(json.dumps(album, ensure_ascii=False), flush=True)
        time.sleep(0.5)
        shot(page, 'fix1_album_thuyet_minh')
        page.evaluate("() => window.app.albumViewer.closeAlbum()")
        time.sleep(1.2)

        # ---------------- Ảnh chụp 3D ----------------
        H = 2.85
        pose(page, 19, H, 18, 46, 4.2, -14); shot(page, 'fix1_khu3_tu_loi_vao')
        pose(page, 34, H, -8, 34, 4.4, -25); shot(page, 'fix1_khu3_tuong_bac')
        pose(page, 38, H, 0, 50, 4.4, 0); shot(page, 'fix1_khu3_tuong_xa')
        pose(page, 26, H, 12, 26, 4.4, 25); shot(page, 'fix1_khu3_tuong_nam')
        pose(page, 42, H, 8, 42, 3.2, 45); shot(page, 'fix1_loi_khu3_sang_khu4')
        pose(page, -42, H, 8, -42, 3.2, 45); shot(page, 'fix1_loi_khu1_sang_khu6')
        pose(page, 30, H, 31.5, 50, 3.6, 31.5); shot(page, 'fix1_hanh_lang_dau_dong')
        pose(page, -30, H, 31.5, -50, 3.6, 31.5); shot(page, 'fix1_hanh_lang_dau_tay')
        pose(page, -38, H, 6, -50, 5.2, 6); shot(page, 'fix1_khu1_bang_tieu_de')
        pose(page, -34, H, -14, -34, 5.2, -25); shot(page, 'fix1_khu1_tuong_bac_bang')
        pose(page, 0, H, -40, 0, 6.0, -55); shot(page, 'fix1_khu2_bang_tieu_de')
        pose(page, 34, H, -15, 34, 5.8, -25); shot(page, 'fix1_khu3_bang_tieu_de_10m')

        RESULTS['consoleErrors'] = errors
        print('CONSOLE ERRORS:', len(errors), flush=True)
        for e in errors[:20]:
            print('  ', e[:300], flush=True)
        browser.close()

    with open(f'{OUT}/fix1_ket_qua.json', 'w', encoding='utf-8') as f:
        json.dump(RESULTS, f, ensure_ascii=False, indent=1)


if __name__ == '__main__':
    run()
