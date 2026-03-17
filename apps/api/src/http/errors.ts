import { TaskDomainError } from "@swntd/shared/server/domain/tasks";

export class ApiError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function toApiError(error: unknown) {
  if (error instanceof ApiError) {
    return error;
  }

  if (error instanceof TaskDomainError) {
    const isConflict = error.message.startsWith("Expected revision ");

    return new ApiError(
      isConflict ? 409 : 400,
      isConflict ? "stale_revision" : "task_domain_error",
      error.message
    );
  }

  return new ApiError(500, "internal_error", "An unexpected error occurred.");
}
