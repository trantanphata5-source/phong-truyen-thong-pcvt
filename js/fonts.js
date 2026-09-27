/**
 * js/fonts.js
 * ============
 * Module quản lý font Be Vietnam Pro.
 * - Hằng FONT_FAMILY dùng chung cho mọi ctx.font trong canvas.
 * - Hàm font(weight, px) trả chuỗi ctx.font.
 * - Hàm waitForFonts() đảm bảo font sẵn sàng trước khi vẽ canvas.
 */

/** Font family string dùng cho canvas và CSS inline */
export const FONT_FAMILY = '"Be Vietnam Pro", sans-serif';

/**
 * Trả chuỗi font cho CanvasRenderingContext2D.font
 * @param {number} weight - Font weight (300–900)
 * @param {number} px - Font size in pixels
 * @param {string} [style='normal'] - Font style ('normal' | 'italic')
 * @returns {string}
 */
export function font(weight, px, style = 'normal') {
  return `${style} ${weight} ${px}px ${FONT_FAMILY}`;
}

/**
 * Chờ tải đầy đủ các weight cần thiết.
 * Gọi trước khi vẽ canvas.
 * @returns {Promise<void>}
 */
export async function waitForFonts() {
  const weights = [400, 500, 600, 700, 800, 900];
  const promises = weights.map(w =>
    document.fonts.load(`${w} 16px ${FONT_FAMILY}`)
  );
  await Promise.all(promises);
}
