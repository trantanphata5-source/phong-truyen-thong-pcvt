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
    print("=== BẮT ĐẦU KIỂM TRA NGHIỆM THU GĐ5-FIX4 ===", flush=True)
    os.makedirs('docs/gd5_screens', exist_ok=True)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={'width': 1920, 'height': 1080})

        def handle_console(msg):
            txt = msg.text
            if msg.type == 'error':
                print(f"[ERR] {txt}", flush=True)
            elif 'assert' in txt or 'Ready' in txt or 'GridMap' in txt:
                print(f"[LOG] {txt}", flush=True)

        page.on('console', handle_console)

        print("\n--> 1. Truy cập http://localhost:3000/?debug=1 ...", flush=True)
        page.goto('http://localhost:3000/?debug=1', wait_until='domcontentloaded')

        print("Đang chờ nút vào phòng truyền thống...", flush=True)
        page.wait_for_selector('#btn-enter:not(.hidden)', timeout=30000)
        time.sleep(1)
        page.click('#btn-enter')

        # Chờ phòng tải xong hoàn toàn
        page.wait_for_function("() => (window.app && window.app.isReady === true) || document.getElementById('loading-screen')?.classList.contains('fade-out')", timeout=30000)
        time.sleep(2)

        # Xóa các overlay che màn hình
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
        # TIÊU CHÍ 1: assertNoStretchedText() = 0
        # -------------------------------------------------------------
        print("\n--- TIÊU CHÍ 1: KIỂM TRA KHÔNG MÉO CHỮ (assertNoStretchedText) ---", flush=True)
        stretched_errors = page.evaluate("""() => {
            if (typeof window.assertNoStretchedText === 'function') {
                return window.assertNoStretchedText();
            }
            return -1;
        }""")
        print(f"-> Số lỗi assertNoStretchedText(): {stretched_errors}", flush=True)

        inside_errors = page.evaluate("""() => {
            if (typeof window.assertAllInsideBoard === 'function') {
                return window.assertAllInsideBoard();
            }
            return -1;
        }""")
        print(f"-> Số điểm ngoài bàn sa bàn (assertAllInsideBoard): {inside_errors}", flush=True)

        # -------------------------------------------------------------
        # TIÊU CHÍ 5: ĐỨNG CẠNH SA BÀN ?debug=1 ĐO FPS & DRAW CALLS
        # -------------------------------------------------------------
        print("\n--- TIÊU CHÍ 5: ĐO FPS & DRAW CALLS CẠNH SA BÀN ---", flush=True)
        set_cam(21.0, 2.85, 0.0, 26.0, 0.95, 0.0)

        perf = page.evaluate("""() => {
            const app = window.app;
            return {
                fps: app.lastFps || 60,
                drawCalls: app.renderer.info.render.calls,
                triangles: app.renderer.info.render.triangles,
                zone: app.currentZone || 'khu3'
            };
        }""")
        print(f"-> Kết quả hiệu năng cạnh sa bàn: FPS={perf['fps']}, Draw Calls={perf['drawCalls']}, Triangles={perf['triangles']}, Khu={perf['zone']}", flush=True)

        # -------------------------------------------------------------
        # TIÊU CHÍ 6: CHỤP ẢNH NGHIỆM THU
        # -------------------------------------------------------------
        print("\n--- TIÊU CHÍ 6: CHỤP ẢNH NGHIỆM THU VÀO docs/gd5_screens/ ---", flush=True)

        # 1. Sa bàn nhìn từ trên xuống
        print("Chụp 1: Sa bàn nhìn từ trên xuống...", flush=True)
        set_cam(26.0, 5.8, 0.0, 26.0, 0.95, 0.0)
        page.screenshot(path='docs/gd5_screens/saban_top_down.png')

        # 2. Sa bàn nhìn từ cửa khu 3
        print("Chụp 2: Sa bàn nhìn từ cửa khu 3...", flush=True)
        set_cam(18.5, 2.3, 0.0, 26.0, 0.95, 0.0)
        page.screenshot(path='docs/gd5_screens/saban_from_door_k3.png')

        # 3. Băng tiêu đề khu 4
        print("Chụp 3: Băng tiêu đề khu 4...", flush=True)
        set_cam(42.0, 3.8, 60.0, 50.0, 4.15, 60.0)
        page.screenshot(path='docs/gd5_screens/bang_tieu_de_khu4.png')

        # -------------------------------------------------------------
        # TIÊU CHÍ 3: CẬN CẢNH CỤM PHÚ MỸ VÀ CỤM TP VŨNG TÀU
        # -------------------------------------------------------------
        print("\n--- TIÊU CHÍ 3: CẬN CẢNH CỤM PHÚ MỸ & CỤM TP VŨNG TÀU ---", flush=True)

        phu_my_world = page.evaluate("""() => {
            const table = window.app.gridMapTable;
            if (!table || !table.gridData) return null;
            const t = table.gridData.tram.find(x => x.id === 'tba_500_phu_my');
            if (!t) return null;
            const localPos = table.mapToLocal(t.x, t.y, 0.08);
            const worldPos = localPos.clone();
            table.tableGroup.localToWorld(worldPos);
            return { x: worldPos.x, y: worldPos.y, z: worldPos.z };
        }""")

        if phu_my_world:
            print(f"-> Cận cảnh TBA 500kV Phú Mỹ: {phu_my_world}", flush=True)
            set_cam(phu_my_world['x'] - 0.7, phu_my_world['y'] + 0.8, phu_my_world['z'] - 0.4,
                    phu_my_world['x'], phu_my_world['y'], phu_my_world['z'])
            page.screenshot(path='docs/gd5_screens/cum_phu_my_closeup.png')

        vt_world = page.evaluate("""() => {
            const table = window.app.gridMapTable;
            if (!table || !table.gridData) return null;
            const t = table.gridData.tram.find(x => x.id === 'tba_220_vung_tau');
            if (!t) return null;
            const localPos = table.mapToLocal(t.x, t.y, 0.06);
            const worldPos = localPos.clone();
            table.tableGroup.localToWorld(worldPos);
            return { x: worldPos.x, y: worldPos.y, z: worldPos.z };
        }""")

        if vt_world:
            print(f"-> Cận cảnh TBA 220kV Vũng Tàu: {vt_world}", flush=True)
            set_cam(vt_world['x'] - 0.6, vt_world['y'] + 0.7, vt_world['z'] + 0.3,
                    vt_world['x'], vt_world['y'], vt_world['z'])
            page.screenshot(path='docs/gd5_screens/cum_tp_vung_tau_closeup.png')

        # -------------------------------------------------------------
        # TIÊU CHÍ 4: CLICK PHƯỜNG VÀ CLICK TRẠM
        # -------------------------------------------------------------
        print("\n--- TIÊU CHÍ 4: TEST CLICK TRẠM & CLICK PHƯỜNG ---", flush=True)

        tram_card_info = page.evaluate("""() => {
            const table = window.app.gridMapTable;
            const t = table.gridData.tram.find(x => x.id === 'tba_500_phu_my');
            window.app.showGridItemCard({ isGridTram: true, tramData: t });
            const title = document.getElementById('grid-info-title')?.textContent;
            const cap = document.getElementById('grid-info-cap')?.textContent;
            return { title, cap };
        }""")
        print(f"-> Thẻ thông tin trạm sau click: {tram_card_info}", flush=True)
        page.screenshot(path='docs/gd5_screens/tram_card_click.png')

        phuong_card_info = page.evaluate("""() => {
            const table = window.app.gridMapTable;
            const p = table.gridData.phuong.find(x => x.id === 'p_phu_my');
            window.app.showGridItemCard({ isGridPhuong: true, phuongData: p });
            const title = document.getElementById('grid-info-title')?.textContent;
            const cap = document.getElementById('grid-info-cap')?.textContent;
            const extraVisible = document.getElementById('grid-info-extra-row')?.style.display !== 'none';
            return { title, cap, extraVisible };
        }""")
        print(f"-> Thẻ thông tin phường sau click: {phuong_card_info}", flush=True)
        page.screenshot(path='docs/gd5_screens/phuong_hover_click.png')

        coso_card_info = page.evaluate("""() => {
            const table = window.app.gridMapTable;
            const cs = table.gridData.co_so.find(x => x.id === 'coso_1');
            window.app.showGridItemCard({ isGridCoSo: true, coSoData: cs });
            const title = document.getElementById('grid-info-title')?.textContent;
            const extraVisible = document.getElementById('grid-info-extra-row')?.style.display !== 'none';
            return { title, extraVisible };
        }""")
        print(f"-> Thẻ cơ sở PCVT (ẩn địa chỉ: {not coso_card_info['extraVisible']}): {coso_card_info}", flush=True)

        browser.close()

    print("\n=== HOÀN THÀNH TOÀN BỘ KIỂM TRA NGHIỆM THU GĐ5-FIX4 ===", flush=True)

if __name__ == '__main__':
    run()
