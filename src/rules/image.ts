import { CONFIG } from '../config';

export type ImageCheck = { ok: true } | { ok: false; message: string };

interface FileLike {
  name: string;
  type: string;
  size: number;
}

const FORMAT_MESSAGE = '只能傳 JPG、PNG、GIF、WebP';

/** 檢查要上傳的圖片：格式與大小。SVG 與其他檔案一律不收。 */
export function validateImage(file: FileLike): ImageCheck {
  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  const typeOk = (CONFIG.image.mimeTypes as readonly string[]).includes(file.type);
  const extensionOk = (CONFIG.image.extensions as readonly string[]).includes(extension);
  // 貼上的截圖沒有檔名，只看類型；有檔名時兩邊都要符合
  const hasName = file.name.includes('.');
  if (!typeOk || (hasName && !extensionOk)) {
    return { ok: false, message: FORMAT_MESSAGE };
  }
  if (file.size === 0) {
    return { ok: false, message: '這張圖片是空的，換一張試試' };
  }
  if (file.size > CONFIG.image.maxBytes) {
    return { ok: false, message: `圖片超過 ${CONFIG.image.maxBytes / (1024 * 1024)} MB` };
  }
  return { ok: true };
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
