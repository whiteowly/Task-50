import { AppError } from "../utils/errors.js";

export async function errorHandler(ctx, next) {
  try {
    await next();
  } catch (err) {
    const status = err instanceof AppError ? err.status : 500;
    ctx.status = status;
    ctx.body = {
      error: err.message || "Unexpected error",
      details: err instanceof AppError ? err.details : null
    };
    if (status >= 500) {
      console.error(err);
    }
  }
}
