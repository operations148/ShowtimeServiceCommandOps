/** One request ID per inbound request, threaded through logs and audit entries so a single request's trail can be grepped end-to-end. */
import { randomUUID } from "crypto";

export function newRequestId(): string {
  return randomUUID();
}
