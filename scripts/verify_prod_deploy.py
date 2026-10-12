import os, sys, json, time
from playwright.sync_api import sync_playwright

try:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass

PROD_URL = "https://phong-truyen-thong-pcvt.vercel.app"
OUT_DIR = "docs/perf/prod_check"
os.makedirs(OUT_DIR, exist_ok=True)

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
        if (app.requestRender) app.requestRender(2);
        if (app.renderer) app.renderer.render(app.scene, app.camera);
    }}""")
    time.sleep(wait)

def verify_prod_tier(tier):
    print(f"\n=======================================================")
    print(f"VERIFYING PRODUCTION TIER: {tier.upper()}")
    print(f"=======================================================")

    with sync_playwright() as p:
        # Launch browser with swiftshader for WebGL support
        browser = p.chromium.launch(
            headless=True,
            args=['--use-gl=swiftshader', '--enable-unsafe-swiftshader']
        )
        # New context = incognito, clean cache, no cookies/storage
        context = browser.new_context(
            viewport={'width': 1920, 'height': 1080},
            ignore_https_errors=True
        )
        page = context.new_page()

        errors = []
        warnings = []
        js_cache_headers = {}

        page.on('console', lambda m: (
            errors.append(f"[CONSOLE ERROR] {m.text}") if m.type == 'error'
            else warnings.append(f"[CONSOLE WARN] {m.text}") if m.type == 'warning'
            else None
        ))
        page.on('pageerror', lambda e: errors.append(f"[PAGE ERROR] {e}"))

        def handle_response(response):
            url = response.url
            if '/js/' in url and '.js' in url:
                cache_ctrl = response.headers.get('cache-control', '')
                js_cache_headers[url] = cache_ctrl

        page.on('response', handle_response)

        url = f"{PROD_URL}/?quality={tier}&debug=1"
        print(f"Navigating to {url} (Incognito / Clean Cache)...", flush=True)
        page.goto(url, wait_until='domcontentloaded')

        # Wait for enter button & click
        page.wait_for_selector('#btn-enter:not(.hidden)', timeout=60000)
        time.sleep(1)
        page.click('#btn-enter')

        # Wait for museum ready
        page.wait_for_function(
            "() => (window.app && window.app.isReady === true) || document.getElementById('loading-screen')?.classList.contains('fade-out')",
            timeout=120000
        )
        time.sleep(4)

        # Remove overlays
        page.evaluate("""() => {
            ['welcome-guide-overlay', 'loading-screen'].forEach(id => document.getElementById(id)?.remove());
            document.body.classList.remove('loading-active');
        }""")
        time.sleep(1)

        # 1. Check App info
        app_info = page.evaluate("""() => {
            const app = window.app;
            return {
                quality: app.quality,
                currentZone: app.currentZone,
                renderCount: app._renderCount,
                hasLoggedAnimateError: app._hasLoggedAnimateError,
                hasLoggedRenderError: app._hasLoggedRenderError,
                isReady: app.isReady
            };
        }""")
        print(f"  Quality Tier: {app_info['quality']} (Expected: {tier})")
        print(f"  Render Count: {app_info['renderCount']}")
        print(f"  Animate Error Flag: {app_info['hasLoggedAnimateError']}")

        # 2. Check JS headers
        print(f"  JS Files Loaded: {len(js_cache_headers)}")
        no_cache_ok = True
        for js_url, cc in js_cache_headers.items():
            short_name = js_url.split('/js/')[-1]
            if 'no-cache' not in cc:
                print(f"  [WARN] {short_name} Cache-Control: '{cc}' (missing no-cache)")
                no_cache_ok = False
        if no_cache_ok:
            print(f"  Cache-Control: ALL {len(js_cache_headers)} JS files have 'no-cache': YES")

        # 3. Check SignBanner / Bảng treo (Sảnh chính)
        pose(page, 0, 2.75, 20, 0, 3.2, 0, wait=2.0)
        banner_check = page.evaluate("""() => {
            let banner = null;
            window.app.scene.traverse(o => {
                if (o.name && o.name.includes('SignBanner')) banner = o;
            });
            if (!banner) return { found: false };
            return {
                found: true,
                name: banner.name,
                scale: { x: banner.scale.x, y: banner.scale.y, z: banner.scale.z },
                parentScale: banner.parent ? { x: banner.parent.scale.x, y: banner.parent.scale.y, z: banner.parent.scale.z } : null
            };
        }""")
        print(f"  SignBanner check: {banner_check}")
        page.screenshot(path=f"{OUT_DIR}/prod_{tier}_sanh_chinh.png")

        # 4. Check Màn LED Khu 4 at (36, 3.0, 81.3)
        # Stand in front of screen: (36.0, 2.5, 75.0) looking at (36.0, 3.0, 81.3)
        pose(page, 36.0, 2.5, 74.0, 36.0, 3.0, 81.3, wait=2.5)
        led_khu4_check = page.evaluate("""() => {
            const ss = window.app.slideshowKhu4;
            if (!ss) return { found: false };
            const m = ss.screenMesh;
            return {
                found: true,
                scale: m ? { x: m.scale.x, y: m.scale.y, z: m.scale.z } : null,
                parentScale: m && m.parent ? { x: m.parent.scale.x, y: m.parent.scale.y, z: m.parent.scale.z } : null,
                currentSlide: ss.currentSlide,
                totalSlides: ss.slides ? ss.slides.length : 0
            };
        }""")
        print(f"  Khu 4 LED Screen check: {led_khu4_check}")
        page.screenshot(path=f"{OUT_DIR}/prod_{tier}_led_khu4.png")

        # 5. Check Màn LED Khu 6 at (-36, 3.0, 81.3)
        # Stand in front of screen: (-36.0, 2.5, 75.0) looking at (-36.0, 3.0, 81.3)
        pose(page, -36.0, 2.5, 74.0, -36.0, 3.0, 81.3, wait=2.5)
        led_khu6_check = page.evaluate("""() => {
            const ss = window.app.slideshowKhu6;
            if (!ss) return { found: false };
            const m = ss.screenMesh;
            return {
                found: true,
                scale: m ? { x: m.scale.x, y: m.scale.y, z: m.scale.z } : null,
                parentScale: m && m.parent ? { x: m.parent.scale.x, y: m.parent.scale.y, z: m.parent.scale.z } : null,
                currentSlide: ss.currentSlide,
                totalSlides: ss.slides ? ss.slides.length : 0
            };
        }""")
        print(f"  Khu 6 LED Screen check: {led_khu6_check}")
        page.screenshot(path=f"{OUT_DIR}/prod_{tier}_led_khu6.png")

        # 6. Click 1 ảnh mở thuyết minh
        # Select exhibit 0 from UI Controller
        page.evaluate("""() => {
            window.app.uiController.selectExhibitByIndex(0);
        }""")
        time.sleep(2.0)

        card_check = page.evaluate("""() => {
            const card = document.getElementById('exhibit-card');
            const title = document.getElementById('card-org-name')?.textContent || document.getElementById('card-title')?.textContent;
            const yearTag = document.getElementById('card-year-tag')?.textContent;
            const desc = document.getElementById('card-description')?.textContent;
            const narrativeBox = document.getElementById('card-narrative');
            const isVisible = card && !card.classList.contains('hidden') && card.style.display !== 'none';
            return {
                cardFound: !!card,
                isVisible: isVisible,
                title: title,
                yearTag: yearTag,
                desc: desc ? desc.substring(0, 60) : '',
                narrativeBoxFound: !!narrativeBox
            };
        }""")
        print(f"  Exhibit Thuyết minh Card check: {card_check}")
        page.screenshot(path=f"{OUT_DIR}/prod_{tier}_thuyet_minh.png")

        # 7. Check bottom ribbon badges (no '0', '—' present)
        badge_info = page.evaluate("""() => {
            const badges = Array.from(document.querySelectorAll('.tour-thumb-badge'));
            const texts = badges.map(b => b.textContent.trim());
            const zeroBadges = texts.filter(t => t === '0');
            const dashBadges = texts.filter(t => t === '—');
            return {
                totalBadges: badges.length,
                zeroBadgesCount: zeroBadges.length,
                dashBadgesCount: dashBadges.length
            };
        }""")
        print(f"  Tour ribbon badges: total={badge_info['totalBadges']}, zero={badge_info['zeroBadgesCount']}, dash={badge_info['dashBadgesCount']}")

        success = (
            app_info['quality'] == tier and
            app_info['renderCount'] > 0 and
            not app_info['hasLoggedAnimateError'] and
            no_cache_ok and
            banner_check.get('found', False) and
            led_khu4_check.get('found', False) and
            led_khu6_check.get('found', False) and
            card_check.get('isVisible', False) and
            badge_info['zeroBadgesCount'] == 0 and
            len(errors) == 0
        )

        RESULTS[tier] = {
            'success': success,
            'app_info': app_info,
            'js_files_count': len(js_cache_headers),
            'no_cache_ok': no_cache_ok,
            'banner_check': banner_check,
            'led_khu4_check': led_khu4_check,
            'led_khu6_check': led_khu6_check,
            'card_check': card_check,
            'badge_info': badge_info,
            'errors': errors
        }

        print(f"  TIER {tier.upper()} RESULT: {'PASS [OK]' if success else 'FAIL [CHECK]'}")
        if errors:
            print(f"  Errors: {errors}")

        browser.close()

if __name__ == '__main__':
    for tier in ['muot', 'cao']:
        verify_prod_tier(tier)

    print("\n=======================================================")
    print("PRODUCTION VERIFICATION SUMMARY:")
    print("=======================================================")
    all_ok = True
    for tier, res in RESULTS.items():
        status = "PASSED" if res['success'] else "FAILED"
        print(f"  - {tier.upper()}: {status} (Errors: {len(res['errors'])}, JS no-cache: {res['no_cache_ok']}, Thuyết minh: {res['card_check']['isVisible']})")
        if not res['success']:
            all_ok = False
    print(f"Overall status: {'ALL PRODUCTION TESTS PASSED' if all_ok else 'SOME TESTS FAILED'}")
