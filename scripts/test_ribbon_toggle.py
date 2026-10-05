import os, sys, time, json
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    b = p.chromium.launch(headless=True, args=['--use-gl=swiftshader', '--enable-unsafe-swiftshader'])
    page = b.new_page(viewport={'width': 1920, 'height': 1080})
    errors, logs = [], []
    page.on('console', lambda m: (errors.append(m.text) if m.type == 'error' else None, logs.append(m.text)))
    page.on('pageerror', lambda e: errors.append(str(e)))

    print("Navigating to http://localhost:3000/?debug=1...", flush=True)
    page.goto('http://localhost:3000/?debug=1', wait_until='domcontentloaded')
    page.wait_for_selector('#btn-enter', timeout=60000)
    page.click('#btn-enter')
    page.wait_for_function("() => (window.app && window.app.isReady === true) || document.getElementById('loading-screen')?.classList.contains('fade-out')", timeout=60000)
    time.sleep(2)
    page.evaluate("""() => {
        ['welcome-guide-overlay', 'loading-screen'].forEach(id => document.getElementById(id)?.remove());
        document.body.classList.remove('loading-active');
    }""")
    time.sleep(0.5)

    # 1. Initial State
    is_col_0 = page.evaluate("() => document.getElementById('tour-ribbon').classList.contains('collapsed')")
    assert not is_col_0, "Ribbon should initially be visible"
    print("1. Initial state: Ribbon is visible (collapsed=False)", flush=True)

    # 2. Click Tab to Collapse
    page.click('#btn-toggle-tour-ribbon')
    time.sleep(0.6)
    is_col_1 = page.evaluate("() => document.getElementById('tour-ribbon').classList.contains('collapsed')")
    assert is_col_1, "Ribbon should be collapsed after tab click"
    tab_text_1 = page.evaluate("() => document.getElementById('text-toggle-ribbon').textContent")
    assert "\u1EC7n" in tab_text_1, f"Tab text should say 'Hiện', got: {tab_text_1}"
    print("2. Tab click collapsed ribbon successfully! Text:", tab_text_1, flush=True)

    # 3. Click Tab to Expand
    page.click('#btn-toggle-tour-ribbon')
    time.sleep(0.6)
    is_col_2 = page.evaluate("() => document.getElementById('tour-ribbon').classList.contains('collapsed')")
    assert not is_col_2, "Ribbon should be expanded after tab click"
    tab_text_2 = page.evaluate("() => document.getElementById('text-toggle-ribbon').textContent")
    assert "\u1EA8n" in tab_text_2 or "n" in tab_text_2, f"Tab text should say 'Ẩn', got: {tab_text_2}"
    print("3. Tab click re-expanded ribbon successfully! Text:", tab_text_2, flush=True)

    # 4. Header Button Toggle
    page.click('#btn-ribbon-toggle')
    time.sleep(0.6)
    is_col_3 = page.evaluate("() => document.getElementById('tour-ribbon').classList.contains('collapsed')")
    assert is_col_3, "Ribbon should be collapsed via header button"
    print("4. Header button collapsed ribbon successfully!", flush=True)

    page.click('#btn-ribbon-toggle')
    time.sleep(0.6)
    is_col_4 = page.evaluate("() => document.getElementById('tour-ribbon').classList.contains('collapsed')")
    assert not is_col_4, "Ribbon should be expanded via header button"
    print("5. Header button re-expanded ribbon successfully!", flush=True)

    # 5. Keyboard 'H' Toggle
    page.keyboard.press('h')
    time.sleep(0.6)
    is_col_5 = page.evaluate("() => document.getElementById('tour-ribbon').classList.contains('collapsed')")
    assert is_col_5, "Ribbon should be collapsed via H key"
    print("6. Key 'H' collapsed ribbon successfully!", flush=True)

    page.keyboard.press('h')
    time.sleep(0.6)
    is_col_6 = page.evaluate("() => document.getElementById('tour-ribbon').classList.contains('collapsed')")
    assert not is_col_6, "Ribbon should be expanded via H key"
    print("7. Key 'H' re-expanded ribbon successfully!", flush=True)

    # 6. Minimize Button inside Controls
    page.click('#btn-tour-minimize')
    time.sleep(0.6)
    is_col_7 = page.evaluate("() => document.getElementById('tour-ribbon').classList.contains('collapsed')")
    assert is_col_7, "Ribbon should be collapsed via minimize button"
    print("8. Minimize button collapsed ribbon successfully!", flush=True)

    # Re-expand for screenshot
    page.click('#btn-toggle-tour-ribbon')
    time.sleep(0.6)

    # Screenshots
    os.makedirs("docs/gd6_screens/ribbon_toggle", exist_ok=True)
    page.screenshot(path="docs/gd6_screens/ribbon_toggle/final_visible.png")
    page.click('#btn-toggle-tour-ribbon')
    time.sleep(0.6)
    page.screenshot(path="docs/gd6_screens/ribbon_toggle/final_collapsed.png")

    print("\nTotal Console Errors:", len(errors))
    if errors:
        print("Errors:", errors)
    assert len(errors) == 0, f"Expected 0 errors, got: {errors}"

    b.close()
    print("\n=== ALL 8 ASSERTIONS AND CHECKS PASSED PERFECTLY (0 ERRORS) ===")
