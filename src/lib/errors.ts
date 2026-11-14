/** Domain errors carry a stable code and a safe, user-facing message. */
export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
    public details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const notFound = (what = "Resource") => new AppError("NOT_FOUND", `${what} not found`, 404);
export const forbidden = (msg = "You do not have permission to perform this action") => new AppError("FORBIDDEN", msg, 403);
export const unauthorized = (msg = "Please sign in to continue") => new AppError("UNAUTHORIZED", msg, 401);
export const conflict = (code: string, msg: string, details?: unknown) => new AppError(code, msg, 409, details);
export const badRequest = (msg: string, details?: unknown) => new AppError("BAD_REQUEST", msg, 400, details);
export const tooMany = (msg = "Too many attempts. Please wait and try again.") => new AppError("RATE_LIMITED", msg, 429);
