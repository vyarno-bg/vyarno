/**
 * An entry that waits for its payloads swaps the prerendered markup after the
 * browser resolved the URL's fragment against it, and that can leave the reader
 * at the top with `#pay` still in the address bar. A reader who is still at the
 * top is put back on the section; one who scrolled in the meantime is not moved.
 */
export function landOnFragment() {
  const id = decodeURIComponent(location.hash.slice(1));
  if (!id || scrollY > 0) return;
  document.getElementById(id)?.scrollIntoView();
}
