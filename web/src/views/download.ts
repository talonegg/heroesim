// Hands the browser a file to save: a download from an object URL, which requests nothing (the
// bundle gate, principle 12). The game exported (DL-73) and a save kept here exported (DL-67).

export function download(file: File): void {
  const url = URL.createObjectURL(file);
  const link = globalThis.document.createElement('a');
  link.href = url;
  link.download = file.name;
  link.hidden = true;
  globalThis.document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
