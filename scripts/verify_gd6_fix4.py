"""Nghiệm thu GĐ6-fix4 — Mặt Đông vách mốc son 2 tầng
   python scripts/verify_gd6_fix4.py
"""
import os, sys, json, time
from playwright.sync_api import sync_playwright

try:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass

OUT = 'docs/gd6_screens/fix4'
RESULTS = {}


def pose(page, x, y, z, lx, ly, lz, wait=1.5):
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
    print(f'   [screenshot] Đã lưu: {path}', flush=True)


def run():
    os.makedirs(OUT, exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=['--use-gl=swiftshader', '--enable-unsafe-swiftshader'])
        page = browser.new_page(viewport={'width': 1920, 'height': 1080})
        errors, logs = [], []
        page.on('console', lambda m: (errors.append(m.text) if m.type == 'error' else None, logs.append(m.text)))
        page.on('pageerror', lambda e: errors.append(str(e)))

        print('Đang mở http://localhost:3000/?debug=1 ...', flush=True)
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

            // Đếm số ảnh treo theo từng tường/vách
            const counts = {};
            const faceCounts = {};
            const itemCounts = {};
            const itemLocations = {};

            for (const m of eb.mountedExhibits) {
                counts[m.wallId] = (counts[m.wallId] || 0) + 1;
                faceCounts[m.faceKey] = (faceCounts[m.faceKey] || 0) + 1;
                const id = m.item.id;
                itemCounts[id] = (itemCounts[id] || 0) + 1;
                itemLocations[id] = itemLocations[id] || [];
                itemLocations[id].push({ wallId: m.wallId, faceKey: m.faceKey, posX: m.posX, posY: m.posY, posZ: m.posZ });
            }

            // Danh sách ảnh treo trùng (treo ở >= 2 nơi)
            const duplicates = [];
            for (const [id, count] of Object.entries(itemCounts)) {
                if (count > 1) {
                    duplicates.push({ id, count, locations: itemLocations[id] });
                }
            }

            // Kiểm tra khu 4 tường Đông
            const k4EastExhibits = eb.mountedExhibits.filter(m => m.wallId === 'wall_k4_east').map(m => m.item.id);
            const hasDangBo001InK4East = k4EastExhibits.includes('dang_bo_001_2026-02-06');
            const hasDangBo002InK4East = k4EastExhibits.includes('dang_bo_002_2026-02-06');

            // Kiểm tra vách partition_k3_east
            const partK3EastExhibits = eb.mountedExhibits.filter(m => m.faceKey === 'partition_k3|1.57');
            const partK3EastItemIds = partK3EastExhibits.map(m => m.item.id);

            // Kiểm tra board trên partition_k3
            const partK3Boards = eb.wallBoardInfo.filter(b => b.face === 'partition_k3|1.57');

            return {
                counts,
                faceCounts,
                duplicates,
                k4East: {
                    total: k4EastExhibits.length,
                    hasDangBo001: hasDangBo001InK4East,
                    hasDangBo002: hasDangBo002InK4East
                },
                partK3East: {
                    total: partK3EastExhibits.length,
                    itemIds: partK3EastItemIds,
                    board: partK3Boards[0] || null,
                    minZ: Math.min(...partK3EastExhibits.map(m => m.posZ)),
                    maxZ: Math.max(...partK3EastExhibits.map(m => m.posZ)),
                    minY: Math.min(...partK3EastExhibits.map(m => m.posY)),
                    maxY: Math.max(...partK3EastExhibits.map(m => m.posY))
                },
                framesOnWall: window.assertFramesOnWall ? window.assertFramesOnWall() : -1,
                framesOnWallDetails: eb.framesOnWallDetails || [],
                rowGap: eb.assertRowGap ? eb.assertRowGap() : -1,
                rowGapReport: (eb.rowGapReport || []).map(r => ({
                    face: r.face,
                    rowGap: r.rowGap && +r.rowGap.toFixed(3),
                    low: r.bottomPlaque && +r.bottomPlaque.toFixed(3),
                    board: r.boardGap && +r.boardGap.toFixed(3)
                })),
                boardOverlap: window.assertNoBoardOverlap ? window.assertNoBoardOverlap() : -1,
                boardOverlapDetails: app.boardOverlapErrors || [],
                layout: eb.wallLayoutReport
            };
        }""")

        RESULTS['stats'] = stats
        RESULTS['console_errors'] = errors

        print("\n=== KẾT QUẢ KIỂM TRA GĐ6-FIX4 ===", flush=True)
        print(f"1. Số ảnh tường khu 3:")
        print(f"   - Tường Bắc (wall_k3_north): {stats['counts'].get('wall_k3_north', 0)} ảnh (yêu cầu: 20)")
        print(f"   - Tường xa (wall_k3_far): {stats['counts'].get('wall_k3_far', 0)} ảnh (yêu cầu: 32)")
        print(f"   - Tường Nam (wall_k3_south): {stats['counts'].get('wall_k3_south', 0)} ảnh (yêu cầu: 10)")
        print(f"   - Mặt Đông vách mốc son (partition_k3|1.57): {stats['faceCounts'].get('partition_k3|1.57', 0)} ảnh (yêu cầu: 16)")

        print(f"\n2. Khu 4 tường Đông (wall_k4_east):")
        print(f"   - Tổng số ảnh: {stats['k4East']['total']}")
        print(f"   - Có dang_bo_002: {stats['k4East']['hasDangBo002']} (yêu cầu: True)")
        print(f"   - Có dang_bo_001: {stats['k4East']['hasDangBo001']} (yêu cầu: False)")

        print(f"\n3. Kiểm tra ảnh treo trùng (treo >= 2 nơi):")
        print(f"   - Số ảnh treo lặp: {len(stats['duplicates'])}")
        if stats['duplicates']:
            for d in stats['duplicates']:
                print(f"     * {d['id']}: treo {d['count']} lần: {d['locations']}")
        else:
            print("     ✓ Không có ảnh nào treo trùng (danh sách rỗng)")

        print(f"\n4. Các hàm kiểm tra:")
        print(f"   - assertFramesOnWall: {stats['framesOnWall']} lỗi (lỗi trên partition_k3: {[e for e in stats['framesOnWallDetails'] if 'partition_k3' in e]})")
        print(f"   - assertRowGap: {stats['rowGap']} lỗi")
        pk3Gap = next((r for r in stats['rowGapReport'] if r['face'] == 'partition_k3|1.57'), None)
        print(f"     * partition_k3|1.57 gap report: {pk3Gap}")
        print(f"   - assertNoBoardOverlap: {stats['boardOverlap']} lỗi (chi tiết: {stats['boardOverlapDetails']})")

        print(f"\n5. Bảng tiêu đề trên vách partition_k3|1.57:")
        bInfo = stats['partK3East']['board']
        if bInfo:
            print(f"   - Tiêu đề: '{bInfo.get('title')}'")
            print(f"   - Dòng phụ: '{bInfo.get('sub')}'")
            print(f"   - Kích thước: w={bInfo.get('w')}m, h={bInfo.get('h')}m, y={bInfo.get('y')}m")
        else:
            print("   ✗ Không tìm thấy bảng tiêu đề trên partition_k3|1.57")

        # 6. Chụp ảnh mặt Đông vách từ (44; 0), nhìn hướng Tây
        print(f"\n6. Chụp ảnh mặt Đông vách:")
        # Đứng tại x=44, z=0, y=2.85; nhìn về hướng Tây (x=35, y=2.85, z=0)
        pose(page, 44.0, 2.85, 0.0, 35.0, 2.85, 0.0, wait=2.0)
        shot(page, 'milestone_wall_east')

        # Thêm 1 góc chụp bao quát toàn bộ vách từ xa hơn một chút để quan sát toàn bộ 8 cột + bảng tiêu đề
        pose(page, 47.0, 3.2, 0.0, 35.0, 3.8, 0.0, wait=1.5)
        shot(page, 'milestone_wall_east_wide')

        with open(f'{OUT}/results.json', 'w', encoding='utf-8') as f:
            json.dump(RESULTS, f, ensure_ascii=False, indent=2)
        print(f"Đã lưu kết quả nghiệm thu vào {OUT}/results.json", flush=True)

        browser.close()


if __name__ == '__main__':
    run()
