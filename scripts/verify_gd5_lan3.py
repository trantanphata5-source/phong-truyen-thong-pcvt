import os
import sys
import time
from playwright.sync_api import sync_playwright

if sys.platform == 'win32':
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

def run():
    print("Bắt đầu kiểm tra nghiệm thu GĐ5-fix3...", flush=True)
    os.makedirs('docs/gd5_screens', exist_ok=True)
    logs = []
    errors = []

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={'width': 1920, 'height': 1080})

        def handle_console(msg):
            txt = msg.text
            logs.append(txt)
            if msg.type == 'error':
                errors.append(txt)
            try:
                print(f"[{msg.type.upper()}] {txt}", flush=True)
            except Exception:
                pass

        page.on('console', handle_console)
        page.on('pageerror', lambda err: errors.append(str(err)))

        print("Navigating to http://localhost:3000/?debug=1 ...", flush=True)
        page.goto('http://localhost:3000/?debug=1', wait_until='domcontentloaded')

        print("Waiting for enter button...", flush=True)
        page.wait_for_selector('#btn-enter:not(.hidden)', timeout=30000)
        time.sleep(1)
        print("Clicking enter button...", flush=True)
        page.click('#btn-enter')
        time.sleep(2)

        # Xóa loading screen và welcome overlay nếu còn
        page.evaluate("""() => {
            const wg = document.getElementById('welcome-guide-overlay');
            if (wg) wg.remove();
            const ls = document.getElementById('loading-screen');
            if (ls) ls.remove();
            document.body.classList.remove('loading-active');
        }""")
        time.sleep(1)

        def set_cam(px, py, pz, lx, ly, lz):
            page.evaluate(f"""(() => {{
                const app = window.app;
                if (!app) return;
                app.camera.position.set({px}, {py}, {pz});
                app.camera.lookAt({lx}, {ly}, {lz});
                const e = new THREE.Euler().setFromQuaternion(app.camera.quaternion, 'YXZ');
                if (app.controlsManager) {{
                    app.controlsManager.currentYaw = app.controlsManager.targetYaw = e.y;
                    app.controlsManager.currentPitch = app.controlsManager.targetPitch = e.x;
                    app.camera.quaternion.setFromEuler(e);
                }}
                app.camera.updateMatrixWorld();
                if (app.updateZoneCulling) app.updateZoneCulling();
            }})()""")
            time.sleep(1.0)

        # -------------------------------------------------------------
        # 1. ĐO HIỆU NĂNG TẠI 4 VỊ TRÍ (MỤC A.3 & F.2)
        # -------------------------------------------------------------
        print("\n--- 1. ĐO FPS & DRAW CALLS TẠI 4 VỊ TRÍ ---", flush=True)
        measure_perf_js = """() => new Promise(resolve => {
            let frames = 0;
            const start = performance.now();
            function loop() {
                frames++;
                if (performance.now() - start < 1200) {
                    requestAnimationFrame(loop);
                } else {
                    const elapsed = (performance.now() - start) / 1000;
                    resolve({
                        fps: Math.round(frames / elapsed),
                        drawCalls: window.app.renderer.info.render.calls,
                        triangles: window.app.renderer.info.render.triangles,
                        zone: window.app.currentZone || 'unknown'
                    });
                }
            }
            requestAnimationFrame(loop);
        })"""

        positions = [
            ('1. Điểm xuất phát (0; 26)', 0.0, 2.85, 26.0, 0.0, 2.85, 81.0),
            ('2. Cửa khu HCM (0; 48)', 0.0, 2.85, 48.0, 0.0, 4.0, 81.3),
            ('3. Khu 3 cạnh sa bàn (21; 0)', 21.0, 2.85, 0.0, 26.0, 0.95, 0.0),
            ('4. Khu 4 (36; 60)', 36.0, 2.85, 60.0, 36.0, 3.0, 81.3)
        ]

        metrics = {}
        for name, px, py, pz, lx, ly, lz in positions:
            set_cam(px, py, pz, lx, ly, lz)
            res = page.evaluate(measure_perf_js)
            metrics[name] = res
            print(f"  + {name}: FPS = {res['fps']}, Draw calls = {res['drawCalls']}, Triangles = {res['triangles']}, Zone = {res['zone']}", flush=True)

        # -------------------------------------------------------------
        # 2. CHỤP ẢNH NGHIỆM THU THEO MỤC F.7
        # -------------------------------------------------------------
        print("\n--- 2. CHỤP ẢNH NGHIỆM THU THEO MỤC F.7 ---", flush=True)

        # Ảnh 1: Sảnh nhìn về hướng Nam
        print("Capturing 01_sanh_nhin_nam.png...", flush=True)
        set_cam(0.0, 2.85, 26.0, 0.0, 3.5, 81.3)
        page.screenshot(path='docs/gd5_screens/01_sanh_nhin_nam.png')

        # Ảnh 2: Sa bàn nhìn từ trên xuống
        print("Capturing 02_saban_nhin_tu_tren.png...", flush=True)
        set_cam(26.0, 7.5, 0.0, 26.0, 0.95, 0.01)
        page.screenshot(path='docs/gd5_screens/02_saban_nhin_tu_tren.png')

        # Ảnh 3: Tường Khu 3 kèm băng tiêu đề và khẩu hiệu
        print("Capturing 03_tuong_khu3.png...", flush=True)
        set_cam(34.0, 3.2, -14.0, 34.0, 4.2, -25.0)
        page.screenshot(path='docs/gd5_screens/03_tuong_khu3.png')

        # Ảnh 4: Tường Khu 4 kèm băng tiêu đề và khẩu hiệu
        print("Capturing 04_tuong_khu4.png...", flush=True)
        set_cam(40.0, 3.2, 60.0, 50.0, 4.2, 60.0)
        page.screenshot(path='docs/gd5_screens/04_tuong_khu4.png')

        # Ảnh 5: Tường Khu 6 kèm băng tiêu đề và khẩu hiệu
        print("Capturing 05_tuong_khu6.png...", flush=True)
        set_cam(-40.0, 3.2, 60.0, -50.0, 4.2, 60.0)
        page.screenshot(path='docs/gd5_screens/05_tuong_khu6.png')

        # Ảnh 6: Mặt tiền Khu 3 (4 trụ đối xứng có logo EVNHCMC)
        print("Capturing 06_mat_tien_khu3_4_tru.png...", flush=True)
        set_cam(9.0, 2.5, 0.0, 21.5, 2.0, 0.0)
        page.screenshot(path='docs/gd5_screens/06_mat_tien_khu3_4_tru.png')

        # -------------------------------------------------------------
        # 3. KIỂM TRA MỐC 2 & ASSERTIONS
        # -------------------------------------------------------------
        print("\n--- 3. KIỂM TRA DỮ LIỆU MỐC 2 & ASSERTIONS ---", flush=True)
        assert_results = page.evaluate("""(() => {
            const app = window.app;
            const items = app.dataService.items;
            const moc2_01 = items.find(i => i.id === 'moc2_01');
            const moc2_02 = items.find(i => i.id === 'moc2_02');

            const overlapCount = app.assertNoOverlapOnWalls ? app.assertNoOverlapOnWalls() : -1;
            const boardOutsideCount = app.gridMapTable?.assertAllInsideBoard ? app.gridMapTable.assertAllInsideBoard() : -1;

            return {
                moc2_01: moc2_01 ? { ngay: moc2_01.ngay, tieu_de: moc2_01.tieu_de, descExtra: moc2_01.descExtra } : null,
                moc2_02: moc2_02 ? { ngay: moc2_02.ngay, tieu_de: moc2_02.tieu_de, descExtra: moc2_02.descExtra } : null,
                overlapCount,
                boardOutsideCount
            };
        })()""")

        print("Kết quả kiểm tra Mốc 2:", flush=True)
        print(f"  + moc2_01: {assert_results['moc2_01']}", flush=True)
        print(f"  + moc2_02: {assert_results['moc2_02']}", flush=True)
        print("Kết quả Assertions:", flush=True)
        print(f"  + assertNoOverlapOnWalls = {assert_results['overlapCount']} cặp chồng nhau", flush=True)
        print(f"  + assertAllInsideBoard = {assert_results['boardOutsideCount']} điểm ngoài bàn", flush=True)

        # -------------------------------------------------------------
        # 4. KIỂM TRA CONSOLE ERRORS
        # -------------------------------------------------------------
        print("\n--- 4. KIỂM TRA CONSOLE ERRORS ---", flush=True)
        real_errors = [e for e in errors if 'favicon' not in e]
        if real_errors:
            for err in real_errors:
                print("  ! LỖI:", err, flush=True)
        else:
            print("  ✓ 0 lỗi console runtime!", flush=True)

        browser.close()
        print("\nHOÀN TẤT TOÀN BỘ NGHIỆM THU GĐ5-fix3!", flush=True)

if __name__ == '__main__':
    run()
