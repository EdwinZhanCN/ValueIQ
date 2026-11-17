/** Remove one browser-selected file without mutating the remaining batch. */
export function unselectFileAt<T>(files: readonly T[], index: number): T[] {
  return files.filter((_, current) => current !== index);
}
