import os
import sys
import time
from playwright.sync_api import sync_playwright

if sys.platform == 'win32':
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

def run_verification():
    os.makedirs('docs/gd5_screens', exist_ok=True)
    logs = []
    errors = []

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={'width': 1920, 'height': 1080})
        page = context.new_page()

        def handle_console(msg):
            txt = msg.text
            logs.append(txt)
            if msg.type == 'error':
                errors.append(txt)
            try:
                print(f"[{msg.type.upper()}] {txt}")
            except Exception:
                print(f"[{msg.type.upper()}] {txt.encode('ascii', errors='replace').decode('ascii')}")

        page.on('console', handle_console)
        page.on('pageerror', lambda err: errors.append(str(err)))

        print("Navigating to http://localhost:3000/?debug=1 ...")
        page.goto('http://localhost:3000/?debug=1', wait_until='networkidle')

        # Wait for app ready and click enter
        print("Waiting for enter button...")
        page.wait_for_selector('#btn-enter:not(.hidden)', timeout=30000)
        time.sleep(1)
        print("Clicking enter button...")
        page.click('#btn-enter')
        time.sleep(1)

        # Force remove both loading screen and welcome guide overlay so they never obstruct screenshots
        page.evaluate("""() => {
            const wg = document.getElementById('welcome-guide-overlay');
            if (wg) wg.remove();
            const ls = document.getElementById('loading-screen');
            if (ls) ls.remove();
            document.body.classList.remove('loading-active');
        }""")
        time.sleep(1)

        print("\n--- CHECKING CONSOLE LOGS ---")
        overlap_logs = [l for l in logs if 'assertNoOverlapOnWalls' in l]
        for l in overlap_logs:
            print("Overlap log:", l)

        has_433_items = any('tổng 433' in l for l in logs)
        print("Logged 433 total items:", has_433_items)

        def set_cam(px, py, pz, lx, ly, lz):
            page.evaluate(f"""(() => {{
                const app = window.app;
                if (!app) return;
                const pos = new THREE.Vector3({px}, {py}, {pz});
                const look = new THREE.Vector3({lx}, {ly}, {lz});
                app.camera.position.copy(pos);
                app.camera.lookAt(look);
                const e = new THREE.Euler().setFromQuaternion(app.camera.quaternion, 'YXZ');
                if (app.controlsManager) {{
                    app.controlsManager.currentYaw = app.controlsManager.targetYaw = e.y;
                    app.controlsManager.currentPitch = app.controlsManager.targetPitch = e.x;
                    app.camera.quaternion.setFromEuler(e);
                }}
                app.camera.updateMatrixWorld();
                if (app.updateZoneCulling) app.updateZoneCulling();
            }})()""")
            time.sleep(0.8)

        def read_debug_overlay():
            return page.evaluate("""(() => {
                const el = document.getElementById('debug-stats-overlay') || window.app?.debugOverlay;
                return el ? el.innerText : 'Overlay not found';
            })()""")

        metrics = {}

        # 1. Lobby Floor Logo from approaching angle (0, 3.2, 10.0) looking North towards (0, 0.36, 0)
        print("\nCapturing 01_lobby_floor_logo.png...")
        set_cam(0, 3.2, 10.0, 0, 0.36, 0)
        page.screenshot(path='docs/gd5_screens/01_lobby_floor_logo.png')

        # 1b. Closeup of floor logo looking down at southern arc from (0, 3.5, 6.0) towards (0, 0.36, 2.0)
        print("Capturing 01b_floor_logo_closeup.png...")
        set_cam(0, 3.5, 6.0, 0, 0.36, 2.0)
        page.screenshot(path='docs/gd5_screens/01b_floor_logo_closeup.png')

        # 2. Floor tone from lobby to Khu 3 (Section F.4)
        print("Capturing 02_floor_lobby_to_k3.png...")
        set_cam(0, 2.85, 5.0, 30.0, 2.85, 0.0)
        page.screenshot(path='docs/gd5_screens/02_floor_lobby_to_k3.png')
        metrics['Lobby'] = read_debug_overlay()

        # 3. Sa bàn overview from Khu 3 entrance (teleport position looking at table)
        print("Capturing 03_saban_entrance.png...")
        set_cam(20.5, 2.85, 0.0, 26.0, 0.95, 0.0)
        page.screenshot(path='docs/gd5_screens/03_saban_entrance.png')

        # 4. Sa bàn closeup
        print("Capturing 04_saban_closeup.png...")
        set_cam(23.5, 2.1, 0.0, 26.0, 0.95, 0.0)
        page.screenshot(path='docs/gd5_screens/04_saban_closeup.png')
        metrics['Khu3_SaBan'] = read_debug_overlay()

        # 5. HCM Cultural Zone Screen (Section D)
        print("Capturing 05_hcm_screen.png...")
        set_cam(0.0, 3.5, 68.0, 0.0, 4.5, 81.2)
        page.screenshot(path='docs/gd5_screens/05_hcm_screen.png')

        # 6. Khu 4 Screen Straight (Section C)
        print("Capturing 06_khu4_screen_straight.png...")
        set_cam(36.0, 3.5, 72.0, 36.0, 3.0, 81.3)
        page.screenshot(path='docs/gd5_screens/06_khu4_screen_straight.png')
        metrics['Khu4'] = read_debug_overlay()

        # 7. Khu 4 Screen Angle 45 (Section C)
        print("Capturing 07_khu4_screen_angle45.png...")
        set_cam(30.0, 3.0, 75.0, 36.0, 3.0, 81.3)
        page.screenshot(path='docs/gd5_screens/07_khu4_screen_angle45.png')

        # 8. Khu 6 Screen Straight (Section C)
        print("Capturing 08_khu6_screen_straight.png...")
        set_cam(-36.0, 3.5, 72.0, -36.0, 3.0, 81.3)
        page.screenshot(path='docs/gd5_screens/08_khu6_screen_straight.png')

        # 9. Khu 6 Screen Angle 45 (Section C)
        print("Capturing 09_khu6_screen_angle45.png...")
        set_cam(-30.0, 3.0, 75.0, -36.0, 3.0, 81.3)
        page.screenshot(path='docs/gd5_screens/09_khu6_screen_angle45.png')

        # 10. Khu 2 Overview
        print("Measuring Khu 2...")
        set_cam(0.0, 2.85, -30.0, 0.0, 2.85, -50.0)
        page.screenshot(path='docs/gd5_screens/14_khu2_overview.png')
        metrics['Khu2'] = read_debug_overlay()

        # 11-14. Lobby 4 directions (360 degree check)
        print("Capturing Lobby 4 directions...")
        set_cam(0.0, 2.85, 5.0, 0.0, 2.85, -20.0)
        page.screenshot(path='docs/gd5_screens/10_lobby_north.png')
        set_cam(0.0, 2.85, 5.0, 25.0, 2.85, 5.0)
        page.screenshot(path='docs/gd5_screens/11_lobby_east.png')
        set_cam(0.0, 2.85, 5.0, 0.0, 2.85, 35.0)
        page.screenshot(path='docs/gd5_screens/12_lobby_south.png')
        set_cam(0.0, 2.85, 5.0, -25.0, 2.85, 5.0)
        page.screenshot(path='docs/gd5_screens/13_lobby_west.png')

        # Test clicking an exhibit in Khu 2 from catalog
        print("\nTesting Catalog click for Khu 2 item...")
        click_result = page.evaluate("""(() => {
            const app = window.app;
            const k2Items = app.dataService.items.filter(it => it.khu === 'khu2');
            if (k2Items.length === 0) return { success: false, msg: 'No Khu 2 items' };
            const item = k2Items[0];
            const idx = app.dataService.filteredItems.findIndex(it => it.id === item.id);
            app.uiController.selectExhibitByIndex(idx);
            const exhibitGroup = app.exhibitBuilder.exhibitMap.get(item.id);
            return {
                success: true,
                itemId: item.id,
                title: item.tieu_de,
                groupVisible: exhibitGroup ? exhibitGroup.visible : false,
                zoneGroupVisible: app.exhibitBuilder.zoneGroups['khu2'] ? app.exhibitBuilder.zoneGroups['khu2'].visible : false
            };
        })()""")
        print("Click result:", click_result)

        print("\n--- DEBUG STATS ---")
        for k, v in metrics.items():
            print(f"[{k}]\n{v}\n")

        print("\n--- ERRORS ---")
        real_errors = [e for e in errors if 'favicon' not in e]
        if real_errors:
            for err in real_errors:
                print("ERROR:", err)
        else:
            print("None! Clean console run.")

        browser.close()

if __name__ == '__main__':
    run_verification()
