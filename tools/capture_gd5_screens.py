import asyncio
import os
import sys
from playwright.async_api import async_playwright

sys.stdout.reconfigure(encoding='utf-8')

async def main():
    os.makedirs('docs/gd5_screens', exist_ok=True)
    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True,
            args=[
                '--use-gl=angle',
                '--use-angle=default',
                '--enable-webgl',
                '--ignore-gpu-blocklist',
                '--disable-web-security'
            ]
        )
        page = await browser.new_page(viewport={'width': 1920, 'height': 1080})
        print('Đang mở trang http://localhost:3000/?debug=1 ...')
        await page.goto('http://localhost:3000/?debug=1', wait_until='networkidle')

        # Đợi nút vào tham quan xuất hiện và click
        await page.wait_for_selector('#btn-enter:not(.hidden)', timeout=30000)
        await page.click('#btn-enter')
        print('Đã click Bước vào tham quan!')
        await page.wait_for_timeout(1000)

        # Ẩn hoàn toàn loading screen và các modal hướng dẫn
        await page.evaluate('''() => {
            const ls = document.getElementById('loading-screen');
            if (ls) ls.style.display = 'none';
            const wgo = document.getElementById('welcome-guide-overlay');
            if (wgo) wgo.style.display = 'none';
            const wg = document.getElementById('welcome-guide');
            if (wg) wg.style.display = 'none';
            const im = document.getElementById('instructions-modal');
            if (im) im.style.display = 'none';
        }''')

        # Danh sách 5 góc chụp nghiệm thu theo Mục F
        shots = [
            {
                'id': 'khu3',
                'name': 'Khu 3 tông sáng (nhìn từ sảnh sang Đông)',
                'pos': [0.0, 2.85, 0.0],
                'yaw': -1.5707963, # -π/2 (hướng Đông)
                'pitch': -0.05,
                'out': 'docs/gd5_screens/khu3.png'
            },
            {
                'id': 'saban',
                'name': 'Sa bàn lưới điện 3D (đứng tại cửa khu 3 nhìn sang bàn tâm 26,0)',
                'pos': [20.5, 2.85, 0.0],
                'yaw': -1.5707963, # -π/2
                'pitch': -0.610865, # -35°
                'out': 'docs/gd5_screens/saban.png'
            },
            {
                'id': 'khu4',
                'name': 'Khu 4 (Đảng bộ) - Màn hình LED tường Nam và Cờ đứng',
                'pos': [36.0, 2.85, 66.0],
                'yaw': 3.1415926, # π (hướng Nam)
                'pitch': -0.02,
                'out': 'docs/gd5_screens/khu4.png'
            },
            {
                'id': 'khu6',
                'name': 'Khu 6 (Công đoàn - Đoàn TN) - Màn hình LED tường Nam và Cờ đứng',
                'pos': [-36.0, 2.85, 66.0],
                'yaw': 3.1415926, # π (hướng Nam)
                'pitch': -0.02,
                'out': 'docs/gd5_screens/khu6.png'
            },
            {
                'id': 'hcm',
                'name': 'Khu Hồ Chí Minh - Màn hình trung tâm với 2 cờ Đảng và Quốc kỳ',
                'pos': [0.0, 3.2, 68.0],
                'yaw': 3.1415926, # π (hướng Nam)
                'pitch': 0.04,
                'out': 'docs/gd5_screens/hcm.png'
            }
        ]

        results = []
        for shot in shots:
            print(f"\n--- Di chuyển camera tới {shot['name']} ---")
            await page.evaluate(f'''() => {{
                window.app.controlsManager.resetKeys();
                window.app.controlsManager.isGliding = false;
                window.app.camera.position.set({shot['pos'][0]}, {shot['pos'][1]}, {shot['pos'][2]});
                window.app.controlsManager.currentYaw = {shot['yaw']};
                window.app.controlsManager.targetYaw = {shot['yaw']};
                window.app.controlsManager.currentPitch = {shot['pitch']};
                window.app.controlsManager.targetPitch = {shot['pitch']};
                window.app.controlsManager.update(0.01);
                // Force zone culling update immediately
                window.app.updateZoneCulling(window.app.clock.getElapsedTime(), true);
            }}''')

            # Chờ 1.5s để renderer vẽ khung hình và zone slideshow chạy
            await page.wait_for_timeout(1500)

            # Lấy thông số đo hiệu năng thực tế
            perf = await page.evaluate('''() => {
                const calls = window.app.renderer.info.render.calls;
                const triangles = window.app.renderer.info.render.triangles;
                const geoms = window.app.renderer.info.memory.geometries;
                const texs = window.app.renderer.info.memory.textures;
                const zone = window.app.currentZone;
                const fps = window.app.currentFps || 60;
                return { calls, triangles, geoms, texs, zone, fps };
            }''')

            print(f"Zone: {perf['zone']} | Draw Calls: {perf['calls']} | Triangles: {perf['triangles']} | FPS: {perf['fps']}")
            await page.screenshot(path=shot['out'], full_page=False)
            print(f"Đã lưu ảnh chụp: {shot['out']}")
            results.append({
                'shot': shot,
                'perf': perf
            })

        await browser.close()
        print("\nHoàn thành chụp toàn bộ 5 ảnh nghiệm thu!")
        return results

if __name__ == '__main__':
    asyncio.run(main())
