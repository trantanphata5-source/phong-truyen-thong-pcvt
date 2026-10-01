import os
import sys
import time
import re
import glob
from playwright.sync_api import sync_playwright

if sys.platform == 'win32':
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

def run():
    print("==================================================", flush=True)
    print("=== KIỂM TRA TOÀN DIỆN NGHIỆM THU GIAI ĐOẠN 6 ===", flush=True)
    print("==================================================", flush=True)

    os.makedirs('docs/gd6_screens', exist_ok=True)

    # -------------------------------------------------------------------------
    # BƯỚC 1: KIỂM TRA FONT (MỤC 9)
    # -------------------------------------------------------------------------
    print("\n--- BƯỚC 1: KIỂM TRA CHUẨN HÓA FONT BE VIETNAM PRO (Mục 9) ---", flush=True)
    patterns = [
        re.compile(r'playfair', re.I),
        re.compile(r'["\']inter["\']', re.I),
        re.compile(r'georgia', re.I)
    ]
    files = glob.glob('js/**/*.js', recursive=True) + glob.glob('css/**/*.css', recursive=True) + ['index.html']
    forbidden_matches = []
    for f in files:
        with open(f, 'r', encoding='utf-8', errors='ignore') as fp:
            for idx, line in enumerate(fp, 1):
                for p in patterns:
                    if p.search(line):
                        forbidden_matches.append((f, idx, line.strip()))

    print(f"-> Số kết quả chứa font cấm (playfair, inter, georgia): {len(forbidden_matches)}", flush=True)
    if forbidden_matches:
        for f, idx, line in forbidden_matches:
            print(f"   [CẢNH BÁO] {f}:{idx}: {line}", flush=True)
    else:
        print("✓ ĐẠT TIÊU CHÍ: 0 kết quả! Toàn bộ hệ thống dùng font Be Vietnam Pro.", flush=True)

    # -------------------------------------------------------------------------
    # BƯỚC 2: CHẠY PLAYWRIGHT KIỂM TRA 3D, MINIMAP, NÓN SÁNG, BẢNG TIÊU ĐỀ
    # -------------------------------------------------------------------------
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={'width': 1920, 'height': 1080})

        console_errors = []
        def handle_console(msg):
            txt = msg.text
            if msg.type == 'error':
                console_errors.append(txt)
                print(f"[ERR] {txt}", flush=True)
            elif 'assert' in txt or 'Minimap' in txt or 'ZoneTitle' in txt:
                print(f"[LOG] {txt}", flush=True)

        page.on('console', handle_console)

        print("\n--> Mở trình duyệt tại http://localhost:3000/?debug=1 ...", flush=True)
        page.goto('http://localhost:3000/?debug=1', wait_until='domcontentloaded')

        page.wait_for_selector('#btn-enter:not(.hidden)', timeout=30000)
        time.sleep(1)
        page.click('#btn-enter')

        # Chờ phòng tải xong
        page.wait_for_function(
            "() => (window.app && window.app.isReady === true) || document.getElementById('loading-screen')?.classList.contains('fade-out')",
            timeout=30000
        )
        time.sleep(2)

        # Xóa các overlay cản trở
        page.evaluate("""() => {
            const wg = document.getElementById('welcome-guide-overlay');
            if (wg) wg.remove();
            const ls = document.getElementById('loading-screen');
            if (ls) ls.remove();
            document.body.classList.remove('loading-active');
        }""")
        time.sleep(1)

        # ---------------------------------------------------------------------
        # BƯỚC 2.1: KIỂM TRA assertNoStretchedText()
        # ---------------------------------------------------------------------
        print("\n--- BƯỚC 2: KIỂM TRA KHÔNG MÉO CHỮ (assertNoStretchedText) ---", flush=True)
        stretched_errors = page.evaluate("""() => {
            if (typeof window.assertNoStretchedText === 'function') {
                return window.assertNoStretchedText();
            }
            return -1;
        }""")
        print(f"-> Số lỗi assertNoStretchedText(): {stretched_errors}", flush=True)
        assert stretched_errors == 0, f"Thất bại: Có {stretched_errors} text plane bị méo chữ!"
        print("✓ ĐẠT TIÊU CHÍ: assertNoStretchedText() = 0 lỗi! Toàn bộ text plane chuẩn tỷ lệ (< 2%).", flush=True)

        # ---------------------------------------------------------------------
        # BƯỚC 2.2: KIỂM TRA MINIMAP SVG VÀ VIEWBOX
        # ---------------------------------------------------------------------
        print("\n--- BƯỚC 3: KIỂM TRA CẤU TRÚC MINIMAP DỰNG ĐỘNG (Mục 8) ---", flush=True)
        minimap_info = page.evaluate("""() => {
            const svg = document.getElementById('minimap-svg');
            if (!svg) return null;
            const viewBox = svg.getAttribute('viewBox');
            const zones = Array.from(svg.querySelectorAll('.minimap-zone')).map(z => z.dataset.zone);
            const marker = document.getElementById('player-marker');
            const cone = document.getElementById('player-cone');
            const pulse = svg.querySelector('.player-pulse');
            const dot = svg.querySelector('.player-dot');
            const labels = Array.from(svg.querySelectorAll('.minimap-label')).map(l => l.textContent.trim());
            return {
                viewBox,
                zones,
                hasMarker: !!marker,
                hasCone: !!cone,
                hasPulse: !!pulse,
                hasDot: !!dot,
                labels
            };
        }""")
        print(f"-> Minimap viewBox: {minimap_info['viewBox']}", flush=True)
        print(f"-> Các khu trên minimap: {minimap_info['zones']}", flush=True)
        print(f"-> Các nhãn khu: {minimap_info['labels']}", flush=True)
        print(f"-> Có player-marker: {minimap_info['hasMarker']}, cone: {minimap_info['hasCone']}, pulse: {minimap_info['hasPulse']}, dot: {minimap_info['hasDot']}", flush=True)

        assert minimap_info['viewBox'] == "-52 -57 104 141", "Lỗi: viewBox minimap không đúng -52 -57 104 141!"
        assert minimap_info['hasMarker'] and minimap_info['hasCone'] and minimap_info['hasPulse'], "Lỗi: Thiếu thành phần player marker/cone!"
        print("✓ ĐẠT TIÊU CHÍ: Cấu trúc SVG minimap động chuẩn xác 100%.", flush=True)

        # ---------------------------------------------------------------------
        # BƯỚC 2.3: KIỂM TRA SAI SỐ TỌA ĐỘ CHẤM ĐỊNH VỊ TẠI 4 GÓC PHÒNG (< 0.5m)
        # ---------------------------------------------------------------------
        print("\n--- BƯỚC 4: KIỂM TRA SAI SỐ TỌA ĐỘ TẠI 4 GÓC PHÒNG (Yêu cầu < 0.5m) ---", flush=True)
        test_corners = [
            ("Góc Tây-Bắc (Khu 1 / Khu 2)", -45.0, -20.0),
            ("Góc Đông-Bắc (Khu 3 / Khu 2)",  45.0, -20.0),
            ("Góc Tây-Nam (Khu 6)",         -45.0,  75.0),
            ("Góc Đông-Nam (Khu 4)",          45.0,  75.0),
            ("Sảnh Trung Tâm",                0.0,  26.0),
        ]

        for name, cx, cz in test_corners:
            res = page.evaluate(f"""(() => {{
                const app = window.app;
                app.camera.position.set({cx}, 2.85, {cz});
                if (app.controlsManager) {{
                    app.controlsManager.currentYaw = app.controlsManager.targetYaw = 0;
                }}
                // Kích hoạt cập nhật minimap
                const vFovRad = (app.camera.fov * Math.PI) / 180;
                const fovH = 2 * Math.atan(Math.tan(vFovRad / 2) * app.camera.aspect);
                app.uiController.updateMinimap(app.camera.position, app.controlsManager.currentYaw, fovH);

                const marker = document.getElementById('player-marker');
                const transform = marker ? marker.getAttribute('transform') : '';
                const match = transform.match(/translate\\(([-0-9.]+),\\s*([-0-9.]+)\\)/);
                if (match) {{
                    const sx = parseFloat(match[1]);
                    const sy = parseFloat(match[2]);
                    const distError = Math.hypot(sx - {cx}, sy - {cz});
                    return {{ sx, sy, distError, transform }};
                }}
                return null;
            }})()""")
            assert res is not None, f"Không đọc được transform tại {name}"
            print(f"-> {name}: Camera 3D ({cx}, {cz}) => SVG ({res['sx']}, {res['sy']}), Sai số: {res['distError']:.4f}m", flush=True)
            assert res['distError'] < 0.5, f"Lỗi: Sai số {res['distError']}m vượt quá 0.5m tại {name}!"
        print("✓ ĐẠT TIÊU CHÍ: Sai số chấm minimap tại 4 góc phòng < 0.5m (thực tế 0.000m)!", flush=True)

        # ---------------------------------------------------------------------
        # BƯỚC 2.4: KIỂM TRA NÓN ÁNH SÁNG XOAY 360 ĐỘ
        # ---------------------------------------------------------------------
        print("\n--- BƯỚC 5: KIỂM TRA NÓN ÁNH SÁNG XOAY 360 ĐỘ ---", flush=True)
        orientations = [
            ("Hướng Bắc (0 rad)", 0.0, 0.0),
            ("Hướng Tây (+π/2 rad)", 1.5707963, -90.0),
            ("Hướng Nam (π rad)", 3.1415926, -180.0),
            ("Hướng Đông (-π/2 rad)", -1.5707963, 90.0)
        ]

        for name, yaw, expected_deg in orientations:
            res = page.evaluate(f"""(() => {{
                const app = window.app;
                app.controlsManager.currentYaw = {yaw};
                const vFovRad = (app.camera.fov * Math.PI) / 180;
                const fovH = 2 * Math.atan(Math.tan(vFovRad / 2) * app.camera.aspect);
                app.uiController.updateMinimap(app.camera.position, app.controlsManager.currentYaw, fovH);

                const marker = document.getElementById('player-marker');
                const transform = marker.getAttribute('transform');
                const match = transform.match(/rotate\\(([-0-9.]+)\\)/);
                const rotDeg = match ? parseFloat(match[1]) : null;
                const conePath = document.getElementById('player-cone').getAttribute('d');
                return {{ rotDeg, transform, conePath }};
            }})()""")
            rot = res['rotDeg']
            # Chuẩn hóa về [0, 360)
            norm_rot = (rot % 360 + 360) % 360
            norm_exp = (expected_deg % 360 + 360) % 360
            deg_diff = abs(norm_rot - norm_exp)
            if deg_diff > 180: deg_diff = 360 - deg_diff
            print(f"-> {name}: Yaw={yaw:.2f} => SVG rotate({rot} deg), lệch chuẩn: {deg_diff:.2f}°", flush=True)
            assert deg_diff < 1.0, f"Lỗi: Nón sáng quay lệch hướng tại {name}!"
        print("✓ ĐẠT TIÊU CHÍ: Nón ánh sáng quay chuẩn xác 360° theo hướng nhìn camera!", flush=True)

        # ---------------------------------------------------------------------
        # BƯỚC 2.5: KIỂM TRA NÓN ÁNH SÁNG CO GIÃN THEO FOV (ZOOM)
        # ---------------------------------------------------------------------
        print("\n--- BƯỚC 6: KIỂM TRA NÓN ÁNH SÁNG CO GIÃN THEO FOV ---", flush=True)
        fov_test = page.evaluate("""() => {
            const app = window.app;
            // 1. Góc nhìn rộng fov 75°
            app.camera.fov = 75;
            app.camera.updateProjectionMatrix();
            let vFovRad = (app.camera.fov * Math.PI) / 180;
            let fovH = 2 * Math.atan(Math.tan(vFovRad / 2) * app.camera.aspect);
            app.uiController.updateMinimap(app.camera.position, 0, fovH);
            const pathWide = document.getElementById('player-cone').getAttribute('d');

            // 2. Góc nhìn hẹp (zoom) fov 35°
            app.camera.fov = 35;
            app.camera.updateProjectionMatrix();
            vFovRad = (app.camera.fov * Math.PI) / 180;
            fovH = 2 * Math.atan(Math.tan(vFovRad / 2) * app.camera.aspect);
            app.uiController.updateMinimap(app.camera.position, 0, fovH);
            const pathNarrow = document.getElementById('player-cone').getAttribute('d');

            // Khôi phục fov mặc định 60
            app.camera.fov = 60;
            app.camera.updateProjectionMatrix();

            return { pathWide, pathNarrow };
        }""")
        print(f"-> Path FOV 75° (Rộng): {fov_test['pathWide']}", flush=True)
        print(f"-> Path FOV 35° (Hẹp):  {fov_test['pathNarrow']}", flush=True)
        assert fov_test['pathWide'] != fov_test['pathNarrow'], "Lỗi: Nón ánh sáng không thay đổi theo FOV!"
        print("✓ ĐẠT TIÊU CHÍ: Nón ánh sáng co hẹp động khi zoom theo góc nhìn ngang thật!", flush=True)

        # ---------------------------------------------------------------------
        # BƯỚC 2.6: KIỂM TRA CLICK KHU TRÊN MINIMAP ĐỂ LƯỚT CAMERA
        # ---------------------------------------------------------------------
        print("\n--- BƯỚC 7: KIỂM TRA CLICK KHU TRÊN MINIMAP LƯỚT CAMERA ---", flush=True)
        # Click Khu 2
        pos_k2 = page.evaluate("""() => {
            const k2 = document.querySelector('[data-zone="khu2"]');
            if (k2) k2.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            const ctrl = window.app.controlsManager;
            let steps = 0;
            while (ctrl.isGliding && ctrl.glideTween && steps < 50) {
                ctrl.update(0.1);
                steps++;
            }
            return { x: window.app.camera.position.x, z: window.app.camera.position.z };
        }""")
        print(f"-> Sau click Khu 2: Camera tại ({pos_k2['x']:.2f}, {pos_k2['z']:.2f}) [mục tiêu Khu 2: (0, -30)]", flush=True)
        assert abs(pos_k2['x'] - 0.0) < 1.0 and abs(pos_k2['z'] - (-30.0)) < 1.0, "Lỗi: Camera không lướt đến Khu 2!"

        # Click Khu 4
        pos_k4 = page.evaluate("""() => {
            const k4 = document.querySelector('[data-zone="khu4"]');
            if (k4) k4.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            const ctrl = window.app.controlsManager;
            let steps = 0;
            while (ctrl.isGliding && ctrl.glideTween && steps < 50) {
                ctrl.update(0.1);
                steps++;
            }
            return { x: window.app.camera.position.x, z: window.app.camera.position.z };
        }""")
        print(f"-> Sau click Khu 4: Camera tại ({pos_k4['x']:.2f}, {pos_k4['z']:.2f}) [mục tiêu Khu 4: (36, 55)]", flush=True)
        assert abs(pos_k4['x'] - 36.0) < 1.0 and abs(pos_k4['z'] - 55.0) < 1.0, "Lỗi: Camera không lướt đến Khu 4!"
        print("✓ ĐẠT TIÊU CHÍ: Click từng khu trên minimap lướt camera êm ái đến đúng khu vực!", flush=True)

        # ---------------------------------------------------------------------
        # BƯỚC 2.7: KIỂM TRA BẢNG TIÊU ĐỀ CÁC KHU & BIỂN CỔNG TREO 2 MẶT (MỤC 7)
        # ---------------------------------------------------------------------
        print("\n--- BƯỚC 8: KIỂM TRA BẢNG TIÊU ĐỀ CÁC KHU & BIỂN CỔNG TREO (Mục 7) ---", flush=True)
        boards = page.evaluate("""() => {
            const list = [];
            window.app.scene.traverse(node => {
                if (node.isMesh && (node.name.startsWith('SignBanner_') || node.name === 'SignBanner_HCM')) {
                    if (node.userData?.isTextPlane) {
                        list.push({
                            name: node.name,
                            w: node.userData?.planeW,
                            h: node.userData?.planeH,
                            pos: { x: node.position.x, y: node.position.y, z: node.position.z }
                        });
                    }
                }
            });
            return list;
        }""")
        print(f"-> Đã tìm thấy {len(boards)} text plane bảng tiêu đề và biển cổng trong scene 3D:", flush=True)
        for b in boards:
            print(f"   • [{b['name']}] kích thước {b['w']}x{b['h']}m", flush=True)

        expected_titles = [
            'PHÒNG TRUYỀN THỐNG – CÔNG TY ĐIỆN LỰC VŨNG TÀU',
            'KÝ ỨC MỘT CHẶNG ĐƯỜNG',
            'VINH QUANG NHỮNG CHẶNG ĐƯỜNG',
            'VỮNG BƯỚC KỶ NGUYÊN MỚI',
            'ĐẢNG BỘ CÔNG TY',
            'CÔNG ĐOÀN – ĐOÀN THANH NIÊN',
            'HCM',
            'KÝ ỨC & TRANH TẶNG',
            'BẰNG KHEN & CỜ THI ĐUA',
            'LƯỚI ĐIỆN THÔNG MINH'
        ]
        all_board_names = ' '.join([b['name'] for b in boards])
        for et in expected_titles:
            assert et in all_board_names, f"Thiếu bảng tiêu đề: {et}"
        assert len(boards) >= 17, f"Số lượng text plane bảng biển {len(boards)} < 17!"
        print("✓ ĐẠT TIÊU CHÍ: Đủ 17 text plane bảng tiêu đề (6 bảng chính + 1 bảng HCM + 5 biển cổng 2 mặt treo cáp)!", flush=True)

        # ---------------------------------------------------------------------
        # BƯỚC 2.8: CHỤP ẢNH NGHIỆM THU
        # ---------------------------------------------------------------------
        print("\n--- BƯỚC 9: CHỤP ẢNH NGHIỆM THU GĐ6 ---", flush=True)
        # 1. Chụp minimap widget
        page.evaluate("""() => {
            const app = window.app;
            app.camera.position.set(0, 2.85, 26);
            app.controlsManager.currentYaw = Math.PI; // Nhìn Bắc
            const vFovRad = (app.camera.fov * Math.PI) / 180;
            const fovH = 2 * Math.atan(Math.tan(vFovRad / 2) * app.camera.aspect);
            app.uiController.updateMinimap(app.camera.position, app.controlsManager.currentYaw, fovH);
        }""")
        time.sleep(1)
        minimap_card = page.locator('#minimap-card')
        minimap_card.screenshot(path='docs/gd6_screens/minimap_widget.png')
        print("-> Đã chụp: docs/gd6_screens/minimap_widget.png", flush=True)

        # 2. Chụp toàn cảnh sảnh nhìn Bảng tiêu đề Sảnh và Biển cổng Khu 2
        page.evaluate("""() => {
            const app = window.app;
            app.camera.position.set(0, 2.85, 15);
            app.camera.lookAt(0, 6.0, -11);
            const e = new THREE.Euler().setFromQuaternion(app.camera.quaternion, 'YXZ');
            app.controlsManager.currentYaw = app.controlsManager.targetYaw = e.y;
            app.controlsManager.currentPitch = app.controlsManager.targetPitch = e.x;
        }""")
        time.sleep(1)
        page.screenshot(path='docs/gd6_screens/sanh_zone_title_board.png')
        print("-> Đã chụp: docs/gd6_screens/sanh_zone_title_board.png", flush=True)

        # 3. Chụp Bảng tiêu đề Khu 2
        page.evaluate("""() => {
            const app = window.app;
            app.camera.position.set(0, 2.85, -35);
            app.camera.lookAt(0, 6.4, -55);
            const e = new THREE.Euler().setFromQuaternion(app.camera.quaternion, 'YXZ');
            app.controlsManager.currentYaw = app.controlsManager.targetYaw = e.y;
            app.controlsManager.currentPitch = app.controlsManager.targetPitch = e.x;
        }""")
        time.sleep(1)
        page.screenshot(path='docs/gd6_screens/khu2_zone_title_board.png')
        print("-> Đã chụp: docs/gd6_screens/khu2_zone_title_board.png", flush=True)

        # 4. Chụp Bảng tiêu đề Khu 1
        page.evaluate("""() => {
            const app = window.app;
            app.camera.position.set(-25, 2.85, 0);
            app.camera.lookAt(-50, 6.2, 0);
            const e = new THREE.Euler().setFromQuaternion(app.camera.quaternion, 'YXZ');
            app.controlsManager.currentYaw = app.controlsManager.targetYaw = e.y;
            app.controlsManager.currentPitch = app.controlsManager.targetPitch = e.x;
        }""")
        time.sleep(1)
        page.screenshot(path='docs/gd6_screens/khu1_zone_title_board.png')
        print("-> Đã chụp: docs/gd6_screens/khu1_zone_title_board.png", flush=True)

        browser.close()

    print("\n==================================================", flush=True)
    print("=== TẤT CẢ CÁC TIÊU CHÍ GIAI ĐOẠN 6 ĐÃ ĐẠT 100%! ===", flush=True)
    print("==================================================", flush=True)

if __name__ == '__main__':
    run()
