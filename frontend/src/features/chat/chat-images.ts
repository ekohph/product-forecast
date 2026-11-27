export const chatImageTypes = ["image/png", "image/jpeg", "image/webp", "image/gif", "image/bmp", "image/avif"];
export const maxChatImages = 4;
export const maxChatImageBytes = 8 * 1024 * 1024;

export function chatImageIssue(file: Pick<File, "type" | "size">): string | null {
  if (!chatImageTypes.includes(file.type)) return "지원하는 이미지 형식은 PNG, JPEG, WebP, GIF, BMP, AVIF입니다.";
  if (file.size === 0) return "빈 이미지 파일은 첨부할 수 없습니다.";
  if (file.size > maxChatImageBytes) return "이미지 한 장은 8 MB 이하여야 합니다.";
  return null;
}

export function clipboardImageFiles(data: Pick<DataTransfer, "items" | "files">): File[] {
  const files = Array.from(data.items).flatMap(item => {
    if (item.kind !== "file") return [];
    const file = item.getAsFile();
    return file ? [file] : [];
  });
  // Never add the same clipboard file from both browser representations.
  return files.length ? files : Array.from(data.files);
}
