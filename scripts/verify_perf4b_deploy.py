import os, sys, json, time
from playwright.sync_api import sync_playwright

try:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass

TIERS = ['muot', 'canbang', 'cao']
RESULTS = {}

def verify_tier(tier):
    print(f"\n=======================================================")
    print(f"VERIFYING TIER: {tier.upper()}")
    print(f"=======================================================")
    with sync_playwright() as p:
        # Launch browser with swiftshader for WebGL support in headless
        browser = p.chromium.launch(
            headless=True,
            args=['--use-gl=swiftshader', '--enable-unsafe-swiftshader']
        )
        # New context = clean cache, isolated session
        context = browser.new_context(
            viewport={'width': 1920, 'height': 1080},
            ignore_https_errors=True
        )
        page = context.new_page()

        errors = []
        warnings = []
        js_requests = []

        page.on('console', lambda m: (
            errors.append(f"[CONSOLE ERROR] {m.text}") if m.type == 'error'
            else warnings.append(f"[CONSOLE WARN] {m.text}") if m.type == 'warning'
            else None
        ))
        page.on('pageerror', lambda e: errors.append(f"[PAGE ERROR] {e}"))
        page.on('request', lambda r: js_requests.append(r.url) if '/js/' in r.url else None)

        url = f"http://localhost:3000/?quality={tier}&debug=1"
        print(f"Loading {url} (clean context)...", flush=True)
        resp = page.goto(url, wait_until='domcontentloaded')

        # Wait for enter button
        page.wait_for_selector('#btn-enter:not(.hidden)', timeout=30000)
        time.sleep(1)
        page.click('#btn-enter')

        # Wait for museum init and first render frames
        page.wait_for_function(
            "() => (window.app && window.app.isReady === true) || document.getElementById('loading-screen')?.classList.contains('fade-out')",
            timeout=120000
        )
        time.sleep(3)

        # Check app quality tier
        app_info = page.evaluate("""() => {
            const app = window.app;
            return {
                quality: app.quality,
                currentZone: app.currentZone,
                renderCount: app._renderCount,
                meshCount: app.scene ? app.scene.children.length : 0,
                hasLoggedAnimateError: app._hasLoggedAnimateError,
                hasLoggedRenderError: app._hasLoggedRenderError,
                isReady: app.isReady
            };
        }""")

        print(f"  App Quality: {app_info['quality']} (expected: {tier})")
        print(f"  Render Count: {app_info['renderCount']}")
        print(f"  Animate Error Flag: {app_info['hasLoggedAnimateError']}")
        print(f"  Render Error Flag: {app_info['hasLoggedRenderError']}")

        # Check bottom thumbnail bar badges
        badge_info = page.evaluate("""() => {
            const badges = Array.from(document.querySelectorAll('.tour-thumb-badge'));
            const texts = badges.map(b => b.textContent.trim());
            const zeroBadges = texts.filter(t => t === '0');
            const dashBadges = texts.filter(t => t === '—');
            const sampleBadges = texts.slice(0, 15);
            return {
                totalBadges: badges.length,
                zeroBadgesCount: zeroBadges.length,
                dashBadgesCount: dashBadges.length,
                sampleBadges: sampleBadges
            };
        }""")

        print(f"  Total tour thumbnail badges: {badge_info['totalBadges']}")
        print(f"  Badges with '0': {badge_info['zeroBadgesCount']} (MUST BE 0)")
        print(f"  Badges with '—': {badge_info['dashBadgesCount']}")
        print(f"  Sample first 15 badges: {badge_info['sampleBadges']}")

        # Check JS requests version suffix
        js_non_perf4b = [u for u in js_requests if '/js/' in u and not u.endswith('?v=perf4b') and '?v=perf4b' not in u]
        print(f"  JS requests loaded: {len(js_requests)}")
        if js_non_perf4b:
            print(f"  [WARN] JS requests without ?v=perf4b: {js_non_perf4b}")
        else:
            print(f"  ALL JS requests have ?v=perf4b suffix: YES ({len(js_requests)} requests)")

        # Check canvas is not blank
        canvas_info = page.evaluate("""() => {
            const canvas = document.querySelector('canvas');
            if (!canvas) return { error: 'No canvas found' };
            return {
                width: canvas.width,
                height: canvas.height,
                styleWidth: canvas.style.width,
                styleHeight: canvas.style.height
            };
        }""")
        print(f"  Canvas size: {canvas_info}")

        # Screenshot
        os.makedirs('docs/perf/deploy_check', exist_ok=True)
        shot_path = f"docs/perf/deploy_check/quality_{tier}.png"
        page.screenshot(path=shot_path)
        print(f"  Screenshot saved: {shot_path}")

        # Summary
        success = (
            app_info['quality'] == tier and
            app_info['renderCount'] > 0 and
            not app_info['hasLoggedAnimateError'] and
            badge_info['zeroBadgesCount'] == 0 and
            badge_info['dashBadgesCount'] > 0 and
            len(errors) == 0
        )

        RESULTS[tier] = {
            'success': success,
            'app_info': app_info,
            'badge_info': badge_info,
            'errors': errors,
            'js_requests_count': len(js_requests),
            'js_non_perf4b_count': len(js_non_perf4b)
        }

        print(f"  TIER {tier.upper()} RESULT: {'PASS [OK]' if success else 'FAIL [CHECK]'}")
        if errors:
            print(f"  Errors encountered: {errors}")

        browser.close()

if __name__ == '__main__':
    for tier in TIERS:
        verify_tier(tier)

    print("\n=======================================================")
    print("ALL TIERS VERIFICATION SUMMARY:")
    print("=======================================================")
    all_ok = True
    for tier, res in RESULTS.items():
        status = "PASSED" if res['success'] else "FAILED"
        print(f"  - {tier.upper()}: {status} (zero badges: {res['badge_info']['zeroBadgesCount']}, dash badges: {res['badge_info']['dashBadgesCount']}, errors: {len(res['errors'])})")
        if not res['success']:
            all_ok = False
    print(f"Overall status: {'ALL TESTS PASSED' if all_ok else 'SOME TESTS FAILED'}")
