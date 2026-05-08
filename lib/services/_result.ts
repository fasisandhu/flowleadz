export type AppError =
  | { code: "unauthorized"; message: string }
  | { code: "not_found"; message: string }
  | { code: "validation"; message: string; fields?: Record<string, string> }
  | { code: "conflict"; message: string }
  | { code: "rate_limit"; message: string }
  | { code: "server"; message: string };

export type Result<T, E = AppError> =
  | { ok: true; data: T }
  | { ok: false; error: E };

export function ok<T>(data: T): Result<T, never> {
  return { ok: true, data };
}

export function err(
  code: AppError["code"],
  message: string,
  extra?: { fields?: Record<string, string> },
): Result<never, AppError> {
  return { ok: false, error: { code, message, ...extra } as AppError };
}
