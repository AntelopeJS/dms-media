import type {
  FileSplit,
  UploadDestination,
  UploadItem,
} from "./useUploadQueue";

function isTypeRefused(file: File): boolean {
  if (isActiveDocument(file)) return true;
  const allowed = uploadLimits.value.allowedMimetypes;
  return Boolean(allowed && !matchesUploadType(uploadMimetype(file), allowed));
}

function refusesFieldType(
  file: File,
  accepts: readonly string[] | null | undefined,
): boolean {
  return (
    Boolean(accepts?.length) &&
    !matchesUploadType(uploadMimetype(file), accepts ?? [])
  );
}

/** Splits the files a field taking `accepts` (any file when empty) refuses from those it takes. */
export function splitByFieldType(
  selected: readonly File[],
  accepts?: readonly string[] | null,
): FileSplit {
  const refused = selected.filter((file) => refusesFieldType(file, accepts));
  return { kept: selected.filter((file) => !refused.includes(file)), refused };
}

/** Refusals known before sending: the server would answer the same. */
export function initialRefusal(
  file: File,
  destination: UploadDestination,
): Pick<UploadItem, "status" | "failure" | "details"> {
  if (file.size === 0) return { status: "rejected", failure: "empty" };
  if (file.size > uploadLimits.value.maxUploadBytes)
    return { status: "rejected", failure: "too_large" };
  if (isTypeRefused(file))
    return { status: "rejected", failure: "type_not_allowed" };
  if (refusesFieldType(file, destination.accepts))
    return {
      status: "rejected",
      failure: "field_type",
      details: { accepted: destination.accepts ?? [] },
    };
  return { status: "waiting" };
}
