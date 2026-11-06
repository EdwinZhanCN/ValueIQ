/** A text field from submitted form data; files and missing fields read as "". */
export function formText(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
}
