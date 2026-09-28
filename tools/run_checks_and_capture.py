import sys
import time
from pathlib import Path
from playwright.sync_api import sync_playwright

sys.stdout.reconfigure(encoding='utf-8')

def main():
    console_logs = []
    page_errors = []

    out_dir = Path(r"d:\5. CONG_VIEC\VŨNG TÀU\Antigraviti_PCVT\PHÒNG TRUYỀN THỐNG\3d-heritage-room\docs\gd3_screens")
    out_dir.mkdir(parents=True, exist_ok=True)

    print("Starting Playwright...", flush=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={'width': 1920, 'height': 1080})
        page = context.new_page()

        page.on('console', lambda msg: console_logs.append(f"[{msg.type}] {msg.text}"))
        page.on('pageerror', lambda err: page_errors.append(str(err)))

        print("Navigating to http://localhost:3000 ...", flush=True)
        page.goto('http://localhost:3000', wait_until='domcontentloaded', timeout=30000)

        time.sleep(2)

        # Click enter if modal present
        try:
            btn_enter = page.locator('#btn-enter')
            if btn_enter.is_visible():
                btn_enter.click()
                print("Clicked #btn-enter", flush=True)
        except Exception as e:
            print("btn-enter error:", e, flush=True)

        try:
            btn_guide = page.locator('#btn-welcome-start')
            if btn_guide.is_visible():
                btn_guide.click()
                print("Clicked #btn-welcome-start", flush=True)
        except Exception as e:
            print("btn-welcome-start error:", e, flush=True)

        # Wait for app.exhibitBuilder to finish
        for _ in range(40):
            ready = page.evaluate("""() => {
                return !!(window.app && window.app.exhibitBuilder && window.app.exhibitBuilder.mountedExhibits && window.app.exhibitBuilder.mountedExhibits.length >= 350);
            }""")
            if ready:
                print("App exhibits ready!", flush=True)
                break
            time.sleep(0.5)

        time.sleep(2)

        # Print all relevant console logs first
        print("\n--- CONSOLE LOGS ---", flush=True)
        for log in console_logs:
            if any(k in log for k in ['assertRowGap', 'assertInsideZone', 'khu1', 'tổng', 'Tổng', 'CẢNH BÁO', 'khoảng trống', 'khu', 'sai mặt']):
                print(log, flush=True)

        # Run Detailed In-Page Verifications
        checks = page.evaluate("""() => {
            const eb = window.app.exhibitBuilder;
            const ds = window.app.dataService;

            // 1. Check [CHỜ XÁC NHẬN] in raw data
            const unconfirmedRaw = (ds.allItems || []).filter(it => 
                (it.title && it.title.includes('CHỜ XÁC NHẬN')) || 
                (it.caption && it.caption.includes('CHỜ XÁC NHẬN'))
            ).map(it => it.id);

            // 2. Check [CHỜ XÁC NHẬN] on mounted exhibits
            const unconfirmedMounted = eb.mountedExhibits.filter(ex => 
                (ex.item && ((ex.item.title && ex.item.title.includes('CHỜ XÁC NHẬN')) || (ex.item.caption && ex.item.caption.includes('CHỜ XÁC NHẬN'))))
            ).map(ex => ex.item.id);

            // 3. Count per zone
            const zoneCounts = {};
            for (const ex of eb.mountedExhibits) {
                const z = ex.zone || 'unknown';
                zoneCounts[z] = (zoneCounts[z] || 0) + 1;
            }

            // 4. Milestone wall partition_k3 verification
            const westGroup = window.app.scene.getObjectByName('MilestoneWall_West');
            const eastGroup = window.app.scene.getObjectByName('MilestoneWall_East');

            return {
                totalMounted: eb.mountedExhibits.length,
                unconfirmedRawCount: unconfirmedRaw.length,
                unconfirmedMountedCount: unconfirmedMounted.length,
                zoneCounts,
                hasWestMilestones: !!westGroup,
                westChildrenCount: westGroup ? westGroup.children.length : 0,
                hasEastEvents: !!eastGroup,
                eastChildrenCount: eastGroup ? eastGroup.children.length : 0
            };
        }""")
        print("\n--- VERIFICATION CHECKS ---", flush=True)
        print("Detailed checks:", checks, flush=True)

        # Helper to set camera in browser
        page.evaluate("""() => {
            window.setCamera = (x, y, z, yaw, pitch) => {
                const cm = window.app.controlsManager;
                const cam = window.app.camera;
                cam.position.set(x, y, z);
                cm.currentYaw = yaw;
                cm.targetYaw = yaw;
                cm.currentPitch = pitch || 0;
                cm.targetPitch = pitch || 0;
            };
        }""")

        # 1. khu1_north.png (look North from inside Khu 1)
        # Khu 1: x in [-50, -18], z in [-25, 25]. North wall is at z = -25.
        page.evaluate("window.setCamera(-34, 2.85, -12, 0, 0)")
        time.sleep(1.2)
        page.screenshot(path=str(out_dir / "khu1_north.png"))
        print("Captured docs/gd3_screens/khu1_north.png", flush=True)

        # 2. khu1_south.png (look South from inside Khu 1)
        # South wall is at z = 25.
        page.evaluate("window.setCamera(-34, 2.85, 12, Math.PI, 0)")
        time.sleep(1.2)
        page.screenshot(path=str(out_dir / "khu1_south.png"))
        print("Captured docs/gd3_screens/khu1_south.png", flush=True)

        # 3. khu3_west.png (look East at West face of partition_k3: 3 milestones + sign)
        # partition_k3 center is at (35, 0). West face is at x = 34.7.
        page.evaluate("window.setCamera(22, 3.2, 0, -Math.PI / 2, 0.05)")
        time.sleep(1.2)
        page.screenshot(path=str(out_dir / "khu3_west.png"))
        print("Captured docs/gd3_screens/khu3_west.png", flush=True)

        # 4. khu3_east.png (look West at East face of partition_k3: 7 major events)
        # East face is at x = 35.3. Stand at x = 44 looking West.
        page.evaluate("window.setCamera(43.5, 2.85, 0, Math.PI / 2, 0)")
        time.sleep(1.2)
        page.screenshot(path=str(out_dir / "khu3_east.png"))
        print("Captured docs/gd3_screens/khu3_east.png", flush=True)

        # 5. pcvt_plaque_closeup.png
        # Find a bottom row PCVT exhibit and zoom in close on its plaque
        page.evaluate("""() => {
            const ex = window.app.exhibitBuilder.mountedExhibits.find(e => 
                e.item && e.item.source === 'pcvt' && e.posY < 2.0 && e.wallId === 'wall_k3_east'
            ) || window.app.exhibitBuilder.mountedExhibits.find(e => 
                e.item && e.item.source === 'pcvt' && e.posY < 2.0
            );

            if (ex) {
                const rotY = ex.rotY;
                // Plaque is 0.14m below bottom edge of frame
                const plaqueY = ex.posY - (ex.size.h || 0.9) / 2 - 0.14;
                const normalX = Math.sin(rotY);
                const normalZ = Math.cos(rotY);
                // Stand 0.85m in front of plaque
                const camX = ex.posX + normalX * 0.85;
                const camZ = ex.posZ + normalZ * 0.85;
                // Looking back at plaque
                const lookYaw = rotY + Math.PI;
                window.setCamera(camX, plaqueY, camZ, lookYaw, 0);
            }
        }""")
        time.sleep(1.2)
        page.screenshot(path=str(out_dir / "pcvt_plaque_closeup.png"))
        print("Captured docs/gd3_screens/pcvt_plaque_closeup.png", flush=True)

        # Also refresh khu1.png and khu3.png
        page.evaluate("window.setCamera(-34, 2.85, 0, -Math.PI / 2, 0)")
        time.sleep(1.0)
        page.screenshot(path=str(out_dir / "khu1.png"))

        page.evaluate("window.setCamera(18, 2.85, 0, -Math.PI / 2, 0)")
        time.sleep(1.0)
        page.screenshot(path=str(out_dir / "khu3.png"))
        print("Refreshed khu1.png and khu3.png", flush=True)

        if page_errors:
            print("\n--- PAGE ERRORS ---", flush=True)
            for err in page_errors:
                print(err, flush=True)

        browser.close()
        print("\nAll done successfully!", flush=True)

if __name__ == '__main__':
    main()
