import { ZodError } from "zod";

export const formatZodError = (error) => {
  if (!(error instanceof ZodError)) return { message: "Invalid payload" };
  const issues = error.issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
    code: issue.code,
  }));
  return {
    message: "Validation failed",
    issues,
  };
};

export const validate = (schema, data) => {
  try {
    return { success: true, data: schema.parse(data) };
  } catch (err) {
    return { success: false, error: formatZodError(err) };
  }
};
