import type { RequestError } from "../utils/httpStatus";
import type { UploadFailure, UploadRefusalDetails } from "./useUploadQueue";

export interface FailureOutcome {
  status: "failed" | "rejected";
  failure: UploadFailure;
  message?: string;
  details?: UploadRefusalDetails;
}

interface ServerRefusal {
  reason?: string;
  message?: string;
  accepted?: readonly string[];
  remaining?: number;
}

const HTTP_CLIENT_ERROR_MIN = 400;
const HTTP_SERVER_ERROR_MIN = 500;
const HTTP_PAYLOAD_TOO_LARGE = 413;
/** Failures the same file would meet again: no retry is offered. */
const FINAL_FAILURES = new Set<UploadFailure>([
  "storage_limit",
  "storage_blocked",
  "storage_unreachable",
]);
const REFUSALS_BY_STATUS = new Map<number, UploadFailure>([
  [400, "invalid"],
  [403, "no_access"],
  [404, "folder_gone"],
  [413, "quota"],
  [415, "type_not_allowed"],
  [422, "invalid_image"],
]);
const SERVER_REASONS: readonly UploadFailure[] = [
  "type_not_allowed",
  "field_type",
  "quota",
  "invalid_image",
];

/** An upload that failed with a named reason, which the queue shows on the file's row. */
export class UploadError extends Error {
  constructor(
    readonly failure: UploadFailure,
    message?: string,
    readonly details?: UploadRefusalDetails,
  ) {
    super(message ?? failure);
  }
}

/** The failure of a response from the storage, which a request's own status does not tell from a refusal. */
export function storageFailure(status: number): UploadFailure {
  return status === HTTP_PAYLOAD_TOO_LARGE ? "storage_limit" : "storage";
}

/** A network error tells a dropped link from a storage this site may not reach (CORS, wrong address). */
export async function networkFailure(
  url: string,
  hasSentBytes: boolean,
): Promise<UploadError> {
  const { failure, address } = await diagnoseStorageFailure(url, hasSentBytes);
  if (failure === "connection") return new UploadError("connection");
  return new UploadError(failure, address, { address });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isText(value: unknown): value is string {
  return typeof value === "string";
}

function isCount(value: unknown): value is number {
  return typeof value === "number";
}

function isTextList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isText);
}

function refusalOf(error: unknown): ServerRefusal {
  const data = isRecord(error) ? error.data : undefined;
  if (isText(data)) return { message: data };
  if (!isRecord(data)) return {};
  const { reason, message, accepted, remaining } = data;
  return {
    reason: isText(reason) ? reason : undefined,
    message: isText(message) ? message : undefined,
    accepted: isTextList(accepted) ? accepted : undefined,
    remaining: isCount(remaining) ? remaining : undefined,
  };
}

/** A 4xx is final (retrying sends the same file again); network and 5xx can be retried. */
export function describeFailure(error: RequestError): FailureOutcome {
  if (error instanceof UploadError)
    return {
      status: FINAL_FAILURES.has(error.failure) ? "rejected" : "failed",
      failure: error.failure,
      message: error.message,
      details: error.details,
    };
  const status = apiErrorStatus(error);
  const refusal = refusalOf(error);
  if (!status) return { status: "failed", failure: "connection" };
  if (status < HTTP_CLIENT_ERROR_MIN || status >= HTTP_SERVER_ERROR_MIN)
    return { status: "failed", failure: "server", message: refusal.message };
  const reason = SERVER_REASONS.find(
    (candidate) => candidate === refusal.reason,
  );
  return {
    status: "rejected",
    failure: reason ?? REFUSALS_BY_STATUS.get(status) ?? "invalid",
    message: refusal.message,
    details: { accepted: refusal.accepted, remaining: refusal.remaining },
  };
}
