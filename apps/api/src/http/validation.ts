import type { Context } from "hono";
import { z } from "zod";
import { ApiError } from "./errors";

export const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const optionalIsoDateSchema = isoDateSchema.nullable().optional();
export const timeSchema = z.string().regex(/^\d{2}:\d{2}$/);
export const optionalTimeSchema = timeSchema.nullable().optional();

export function parseWithSchema<T>(
  schema: z.ZodType<T>,
  value: unknown,
  source: string
) {
  const result = schema.safeParse(value);

  if (!result.success) {
    throw new ApiError(400, "validation_error", `Invalid ${source}.`, {
      issues: result.error.issues
    });
  }

  return result.data;
}

export async function parseJsonBody<T>(
  c: Context,
  schema: z.ZodType<T>
): Promise<T> {
  let payload: unknown;

  try {
    payload = await c.req.json();
  } catch {
    throw new ApiError(400, "invalid_json", "Request body must be valid JSON.");
  }

  return parseWithSchema(schema, payload, "request body");
}

export function parseQuery<T>(c: Context, schema: z.ZodType<T>) {
  const query = Object.fromEntries(new URL(c.req.url).searchParams.entries());

  return parseWithSchema(schema, query, "query parameters");
}
