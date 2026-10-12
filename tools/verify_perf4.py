import asyncio
import os
import sys
import json
from playwright.async_api import async_playwright

sys.stdout.reconfigure(encoding='utf-8')

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
COMP_DIR = os.path.join(ROOT, 'docs', 'perf', 'so_sanh_muot')
os.makedirs(COMP_DIR, exist_ok=True)

SHOTS = [
    {
        'id': 'sanh_bac',
        'name': 'Sảnh nhìn về Bắc (0; 45)',
        'pos': [0.0, 2.85, 45.0],
        'yaw': 0.0, # Nhìn về Bắc (-Z)
        'pitch': 0.05,
    },
    {
        'id': 'khu6_led',
        'name': 'Khu 6 nhìn màn LED (−30; 50)',
        'pos': [-30.0, 2.85, 50.0],
        'yaw': 3.14159 - 0.19, # Nhìn về Nam (+Z) hướng vào màn LED (-36, 81.3)
        'pitch': 0.0,
    },
    {
        'id': 'khu4_led',
        'name': 'Khu 4 nhìn màn LED (36; 68)',
        'pos': [36.0, 2.85, 68.0],
        'yaw': 3.14159, # Nhìn thẳng về Nam (+Z) vào màn LED (36, 81.3)
        'pitch': 0.0,
    },
    {
        'id': 'khu1_bang_treo',
        'name': 'Khu 1 nhìn bảng treo',
        'pos': [-5.0, 2.85, 0.0],
        'yaw': 1.5707963, # Nhìn về Tây (+X sang âm) vào cổng khu 1 (-17.5, 0)
        'pitch': 0.12,
    },
    {
        'id': 'khu3_bang_treo',
        'name': 'Khu 3 nhìn bảng treo',
        'pos': [5.0, 2.85, 0.0],
        'yaw': -1.5707963, # Nhìn về Đông vào cổng khu 3 (17.5, 0)
        'pitch': 0.12,
    },
    {
        'id': 'cong_hcm',
        'name': 'Cổng HCM',
        'pos': [0.0, 2.85, 26.0],
        'yaw': 3.14159, # Nhìn về Nam (+Z) vào cổng HCM (0, 38.5)
        'pitch': 0.15,
    }
]

async def check_tier(p, tier):
    print(f"\n==========================================")
    print(f"--- KIỂM TRA HẠNG: {tier.upper()} ---")
    print(f"==========================================")
    browser = await p.chromium.launch(
        headless=True,
        args=[
            '--use-gl=angle',
            '--use-angle=d3d11',
            '--enable-gpu',
            '--ignore-gpu-blocklist',
            '--enable-unsafe-swiftshader'
        ]
    )
    page = await browser.new_page(viewport={'width': 1920, 'height': 1080})
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('console', lambda msg: print(f"[{tier}] {msg.type}: {msg.text}") if 'assert' in msg.text.lower() or 'lỗi' in msg.text.lower() or 'cặp' in msg.text.lower() else None)

    await page.goto(f'http://localhost:3000/?quality={tier}', wait_until='domcontentloaded')
    await page.wait_for_function('window.app && window.app.isReady === true', timeout=60000)
    await page.wait_for_timeout(4000)

    # Click enter if modal/button present
    try:
        btn = await page.query_selector('#btn-enter:not(.hidden)')
        if btn:
            await btn.click()
            await page.wait_for_timeout(1000)
    except Exception as e:
        pass

    # Hide overlays for clean screenshots
    await page.evaluate('''() => {
        const ids = ['loading-screen', 'welcome-guide-overlay', 'welcome-guide', 'instructions-modal'];
        ids.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = 'none';
        });
    }''')

    # Run assertCanvasFilled()
    canvas_errors = await page.evaluate('window.assertCanvasFilled ? window.assertCanvasFilled() : []')
    print(f"[{tier}] Kết quả assertCanvasFilled(): {len(canvas_errors)} lỗi")
    if canvas_errors:
        for err in canvas_errors:
            print(f"  ✗ {err}")

    # Chụp ảnh 5 góc theo yêu cầu
    if tier in ['muot', 'cao']:
        for shot in SHOTS:
            await page.evaluate('''(s) => {
                const app = window.app;
                const cam = app.camera;
                const cm = app.controlsManager;
                cam.position.set(s.pos[0], s.pos[1], s.pos[2]);
                if (cm) {
                    cm.isGliding = false;
                    cm.glideTween = null;
                    cm.currentYaw = cm.targetYaw = s.yaw;
                    cm.currentPitch = cm.targetPitch = s.pitch;
                }
                cam.quaternion.setFromEuler(new window.THREE.Euler(s.pitch, s.yaw, 0, 'YXZ'));
                cam.updateMatrixWorld(true);
                if (typeof app.updateZoneCulling === 'function') app.updateZoneCulling();
                app.requestRender(3);
                app.renderer.render(app.scene, cam);
            }''', shot)
            await page.wait_for_timeout(1500)
            # Re-render to ensure textures uploaded
            await page.evaluate('''() => {
                window.app.renderer.render(window.app.scene, window.app.camera);
            }''')
            out_file = os.path.join(COMP_DIR, f"{shot['id']}_{tier}.png")
            await page.screenshot(path=out_file)
            print(f"[{tier}] Đã chụp: {out_file}")

    # Test C3: kéo xoay rồi dừng ở hạng Mượt
    if tier == 'muot':
        print("[muot] Kiểm tra kéo xoay rồi dừng...")
        await page.mouse.move(960, 540)
        await page.mouse.down()
        await page.mouse.move(600, 540, steps=10)
        await page.mouse.up()
        await page.wait_for_timeout(500)
        pr_after_stop = await page.evaluate('window.app.renderer.getPixelRatio()')
        print(f"[muot] PixelRatio sau khi dừng: {pr_after_stop}")

    await browser.close()
    return len(canvas_errors)

async def main():
    results = {}
    async with async_playwright() as p:
        for tier in ['muot', 'canbang', 'cao']:
            err_count = await check_tier(p, tier)
            results[tier] = err_count

    print("\n==========================================")
    print("TỔNG KẾT assertCanvasFilled():")
    for tier, count in results.items():
        print(f" - {tier}: {count} lỗi {'✓ ĐẠT' if count == 0 else '✗ THẤT BẠI'}")
    print("==========================================")

if __name__ == '__main__':
    asyncio.run(main())
