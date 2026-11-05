import { data } from "react-router";
import { requireProjectAccess } from "../server/access.server";
import {
  MAX_FILE_BYTES,
  uploadProjectFile,
  type UploadError,
} from "../server/files.server";
import type { Route } from "./+types/projects.files";

// Room for the multipart boundaries and the description field.
const MAX_BODY_BYTES = MAX_FILE_BYTES + 64 * 1024;

const status: Record<UploadError, number> = {
  missing_file: 400,
  missing_description: 400,
  too_large: 413,
};

function fail(error: UploadError) {
  return data({ ok: false as const, error }, { status: status[error] });
}

/** Upload one described file into the project. Posted to by `FileUpload`. */
export async function action({ request, params }: Route.ActionArgs) {
  const access = await requireProjectAccess(request, params.id);

  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) {
    return fail("too_large");
  }
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail("missing_file");
  }
  const upload = form.get("file");
  const description = form.get("description");
  if (!(upload instanceof File) || upload.size === 0 || !upload.name) {
    return fail("missing_file");
  }
  const result = await uploadProjectFile(
    access,
    upload,
    typeof description === "string" ? description : "",
  );
  if (typeof result === "string") return fail(result);
  return data({ ok: true as const, file: result }, { status: 201 });
}
