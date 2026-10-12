"""Chạy ?bench=1 trên localhost bằng Playwright, lưu JSON vào docs/perf/.
Dùng: python tools/run_bench.py <nhan> [query]   vd: python tools/run_bench.py PERF-1 "bench=1&quality=muot"
"""
import asyncio, json, sys, os
from playwright.async_api import async_playwright

sys.stdout.reconfigure(encoding='utf-8')
LABEL = sys.argv[1] if len(sys.argv) > 1 else 'PERF-1'
QUERY = sys.argv[2] if len(sys.argv) > 2 else 'bench=1'
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
OUT = os.path.abspath(os.path.join(ROOT, 'docs', 'perf'))
os.makedirs(OUT, exist_ok=True)


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True, args=[
            '--use-gl=angle', '--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist',
            '--enable-unsafe-swiftshader'])
        page = await browser.new_page(viewport={'width': 1260, 'height': 912})
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        await page.goto(f'http://localhost:3000/?{QUERY}', wait_until='domcontentloaded')
        await page.wait_for_function('window.app && window.app.isReady === true', timeout=120000)
        await page.wait_for_timeout(6000)  # chờ ảnh tải
        res = await page.evaluate(
            "(label) => import('/js/perf-bench.js').then(m => m.runBench(window.app, {label}))", LABEL)
        if 'quality=muot' in QUERY:
            suffix = '_muot'
        elif 'quality=canbang' in QUERY:
            suffix = '_canbang'
        elif 'quality=cao' in QUERY:
            suffix = '_cao'
        else:
            q = res.get('quality')
            suffix = f'_{q}' if q else ''
        path = os.path.join(OUT, f'bench_{LABEL}{suffix}.json')
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(res, f, ensure_ascii=False, indent=2)
        print('GPU:', res['gpu'], '| khung:', res['khung_hinh'], '| pr:', res['pixel_ratio'], '| quality:', res['quality'])
        print('| # | Điểm | Hướng | Lệnh vẽ | Tam giác | Khung đầu ms | TB ms | Max ms | Tex GPU | Ảnh ước tính MB | Wall giữ | Biển tên giữ |')
        print('|---|---|---|---|---|---|---|---|---|---|---|---|')
        for r in res['diem']:
            print(f"| {r['diem']} | ({r['x']}; {r['z']}) | {r['huong']} | {r['draw_calls']} | {r['tam_giac']:,} | "
                  f"{r['khung_dau_ms']} | {r['tb_ms']} | {r['max_ms']} | {r['texture_gpu']} | {r['bo_nho_anh_mb']} | "
                  f"{r.get('wall_dang_giu', '-')} | {r.get('bien_ten_dang_giu', '-')} |")
        if res.get('vong_quanh'):
            print('Đi một vòng:', json.dumps(res['vong_quanh'], ensure_ascii=False))
        if errors:
            print('PAGE ERRORS:', errors[:5])
        print('Saved', path)
        await browser.close()

asyncio.run(main())
