/** Upload limits (Q7, #93), shared by the upload route and the file UI. */
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_PROJECT_BYTES = 25 * 1024 * 1024;

/** "12.4" for 12.4 MB (1 MB = 1024 × 1024 bytes, as the limits are). */
export const megabytes = (bytes: number) =>
  bytes > 0 && bytes < 0.05 * 1024 * 1024
    ? "<0.1"
    : (Math.max(0, bytes) / (1024 * 1024)).toFixed(1).replace(/\.0$/, "");

/** "12.4 of 25 MB used". */
export const usageText = (usedBytes: number) =>
  `${megabytes(usedBytes)} of ${megabytes(MAX_PROJECT_BYTES)} MB used`;
