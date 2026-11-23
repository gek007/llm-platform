/**
 * Why `url` must not be saved as a source, or null. Admin files (PDFs) live in Convex storage and
 * reach learners only through access-checked ```resource blocks; a source is a public link under
 * the lesson, so a storage URL saved as a source would publish a draft's file. Refused: any URL
 * equal to a job resource's `fileUrl`, any URL on the same host as one, and any Convex storage path
 * (`/api/storage/...` on `*.convex.cloud` / `*.convex.site`).
 */
export function storageUrlProblem(url: string, fileUrls: string[]): string | null {
  let u: URL;
  try {
    u = new URL(url.trim());
  } catch {
    return null; // not a URL: the engine reports that
  }
  const host = u.hostname.toLowerCase().replace(/\.$/, "");
  const fileHosts = new Set(
    fileUrls.flatMap((f) => {
      try {
        return [new URL(f).hostname.toLowerCase()];
      } catch {
        return [];
      }
    }),
  );
  const convexStorage = /\.convex\.(cloud|site)$/.test(host) && u.pathname.startsWith("/api/storage/");
  if (fileUrls.includes(url.trim()) || fileHosts.has(host) || convexStorage) {
    return `${url} is the platform's private storage URL for an admin file, not a citable source. Place admin PDFs with resourceIds in the outline (lessons show them through \`\`\`resource blocks) and remove this URL from the sources.`;
  }
  return null;
}
