import sys
import time
import asyncio
from playwright.sync_api import sync_playwright

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

def main():
    print("Launching Chromium browser with Playwright...")
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1920, "height": 1080})
        page = context.new_page()

        console_errors = []
        console_logs = []

        def handle_console(msg):
            text = f"[{msg.type.upper()}] {msg.text}"
            console_logs.append(text)
            if msg.type in ['error']:
                console_errors.append(text)
                print("BROWSER ERROR:", text)
            else:
                print("BROWSER LOG:", text[:120])

        page.on("console", handle_console)
        page.on("pageerror", lambda err: console_errors.append(f"[PAGEERROR] {err}"))

        print("Navigating to http://127.0.0.1:3000 ...")
        page.goto("http://127.0.0.1:3000", wait_until="networkidle", timeout=30000)

        # Wait for app ready
        print("Waiting for museum app ready...", flush=True)
        page.wait_for_function("() => window.app && window.app.gridMapTable && window.app.gridMapTable.gridData", timeout=30000)
        print("App is ready! Entering museum and gliding to Sa bàn 3D...", flush=True)

        # Enter museum and glide to Sa bàn
        page.evaluate("""
            () => {
                const ls = document.getElementById('loading-screen');
                if (ls) ls.classList.add('fade-out');
                document.body.classList.remove('loading-active');
                const wg = document.getElementById('welcome-guide-overlay');
                if (wg) wg.classList.add('hidden');
                const hm = document.getElementById('help-modal');
                if (hm) hm.classList.add('hidden');
                window.app.controlsManager.teleportToGridTable();
                window.app.showGridHud(true);
            }
        """)

        # Allow WebGL textures to render at new position
        time.sleep(2.0)

        # Take screenshot of 3D Sa bàn
        page.screenshot(path="tools/saban_3d_view.png")
        print("Screenshot saved to tools/saban_3d_view.png", flush=True)

        # Test clicking a substation
        print("Inspecting substation on Sa bàn...", flush=True)
        tram_found = page.evaluate("""
            () => {
                const tramObj = window.app.gridMapTable.interactiveObjects.find(o => o.userData.isGridTram);
                if (tramObj) {
                    window.app.showGridItemCard(tramObj.userData);
                    return tramObj.userData.tramData.ten;
                }
                return null;
            }
        """)
        print(f"Clicked substation: {tram_found}", flush=True)
        time.sleep(1.0)

        # Take screenshot of Substation Info Card
        page.screenshot(path="tools/saban_info_card.png")
        print("Screenshot saved to tools/saban_info_card.png", flush=True)

        # Open 2D Fullscreen Map
        print("Opening 2D Map Modal...", flush=True)
        page.evaluate("() => window.app.openGridMap2D()")
        time.sleep(1.5)

        # Take screenshot of 2D Map Modal
        page.screenshot(path="tools/saban_2d_modal.png")
        print("Screenshot saved to tools/saban_2d_modal.png", flush=True)

        # Test search on 2D modal
        print("Testing search input on 2D map...", flush=True)
        page.fill("#grid-2d-search", "Mỹ Xuân")
        time.sleep(0.5)
        search_items = page.query_selector_all(".grid-2d-search-item")
        print(f"Search results for 'Mỹ Xuân': {len(search_items)} found", flush=True)

        # Close 2D map cleanly
        print("Closing 2D map modal...", flush=True)
        page.evaluate("() => window.app.closeGridMap2D()")
        time.sleep(1.0)

        # Verify layer filter toggling
        print("Testing layer toggles...", flush=True)
        page.click("#chk-layer-500")
        time.sleep(0.3)
        vis_500 = page.evaluate("() => window.app.gridMapTable.layers.lines500.visible")
        print(f"500kV layer visibility after toggle: {vis_500}", flush=True)

        browser.close()

        print("\n=== TEST RESULTS SUMMARY ===", flush=True)
        print(f"Total Console Errors: {len(console_errors)}", flush=True)
        if console_errors:
            print("Errors detected:", flush=True)
            for err in console_errors:
                print("  -", err, flush=True)
        else:
            print("SUCCESS: 0 console errors detected!", flush=True)

if __name__ == "__main__":
    main()
