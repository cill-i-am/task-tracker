export function getErrorText(
  errors: readonly unknown[] | undefined
): string | undefined {
  if (!errors) {
    return undefined;
  }

  for (const error of errors) {
    if (typeof error === "string" && error.length > 0) {
      return error;
    }

    if (
      typeof error === "object" &&
      error !== null &&
      "message" in error &&
      typeof error.message === "string" &&
      error.message.length > 0
    ) {
      return error.message;
    }
  }

  return undefined;
}

export function getFormErrorText(error: unknown): string | undefined {
  if (typeof error === "string" && error.length > 0) {
    return error;
  }

  if (Array.isArray(error)) {
    return getErrorText(error);
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "form" in error &&
    typeof error.form === "string" &&
    error.form.length > 0
  ) {
    return error.form;
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "form" in error &&
    typeof error.form === "object" &&
    error.form !== null
  ) {
    const rootErrors = "" in error.form ? error.form[""] : undefined;
    return getErrorText(Array.isArray(rootErrors) ? rootErrors : undefined);
  }

  if (typeof error === "object" && error !== null) {
    const rootErrors = "" in error ? error[""] : undefined;
    return getErrorText(Array.isArray(rootErrors) ? rootErrors : undefined);
  }

  return undefined;
}
