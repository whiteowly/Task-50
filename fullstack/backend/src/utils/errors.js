export class AppError extends Error {
  constructor(status, message, details = null) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export function assert(condition, status, message, details = null) {
  if (!condition) {
    throw new AppError(status, message, details);
  }
}
