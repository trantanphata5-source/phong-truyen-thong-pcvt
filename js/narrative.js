/**
 * js/narrative.js — GĐ6-fix1 mục A
 * Hiển thị NGUYÊN VĂN thuyết minh bài đăng (không sửa chữ):
 *  - Giữ xuống dòng (CSS white-space: pre-line ở khung chứa).
 *  - Link (http…, www…, *.vn/…) thành thẻ <a target="_blank">.
 *  - Các dòng chỉ gồm hashtag: gộp liên tiếp thành MỘT dòng mờ (opacity 0.6).
 */

export const NARRATIVE_SOURCE_LABEL = 'Ngôi nhà EVNHCMC';

const HASHTAG_LINE = /^\s*(#[^\s#]+\s*)+$/u;
const URL_RE = /(https?:\/\/[^\s<]+|www\.[^\s<]+|\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:vn|com|net|org)(?:\/[^\s<]*)?)/giu;

export function escapeHTML(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** "2026-06-15" → "15/06/2026" */
export function formatDateVN(iso) {
  if (!iso) return '';
  const p = String(iso).split('-');
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : String(iso);
}

/** Tiêu đề hiển thị chung: tieu_de (đã chuẩn hóa) hoặc caption */
export function displayTitle(item) {
  if (!item) return '';
  return item.tieu_de || item.caption || '';
}

function linkify(escapedLine) {
  return escapedLine.replace(URL_RE, (m) => {
    // Bỏ dấu câu dính cuối link
    const trail = (m.match(/[.,;:!?)\]]+$/) || [''])[0];
    const url = trail ? m.slice(0, -trail.length) : m;
    const href = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    return `<a href="${href}" target="_blank" rel="noopener noreferrer">${url}</a>${trail}`;
  });
}

/** Trả về HTML an toàn của thuyết minh, dùng trong khung white-space: pre-line */
export function renderNarrativeHTML(text) {
  if (!text) return '';
  const lines = String(text).replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let tagBuf = [];
  const flushTags = () => {
    if (tagBuf.length) {
      out.push(`<span class="narrative-tags">${escapeHTML(tagBuf.join(' '))}</span>`);
      tagBuf = [];
    }
  };
  for (const line of lines) {
    if (HASHTAG_LINE.test(line)) {
      tagBuf.push(...line.trim().split(/\s+/));
      continue;
    }
    flushTags();
    out.push(linkify(escapeHTML(line)));
  }
  flushTags();
  // Bỏ dòng trống thừa ở cuối
  while (out.length && out[out.length - 1].trim() === '') out.pop();
  return out.join('\n');
}
