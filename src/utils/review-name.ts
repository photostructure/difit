export function validateReviewName(value: unknown): string {
  if (
    typeof value !== 'string' ||
    value.match(/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/)?.[0] !== value
  ) {
    throw new Error(
      'Review name must be 1–80 letters, digits, dots, underscores or hyphens, starting with a letter or digit',
    );
  }
  return value;
}
