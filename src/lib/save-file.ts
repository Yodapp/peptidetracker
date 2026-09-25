function isIos() {
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

/**
 * Save a generated file. iOS home-screen apps handle `<a download>` poorly,
 * so offer the share sheet there ("Spara i Filer"); elsewhere download it.
 */
export async function saveFile(body: BlobPart, filename: string, type: string) {
  const blob = new Blob([body], { type });
  if (isIos()) {
    const file = new File([blob], filename, { type });
    if (navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file], title: filename }); return; }
      catch (reason) { if ((reason as DOMException)?.name === "AbortError") return; }
    }
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
