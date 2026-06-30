export interface ValidationResult {
  ok: boolean;
  message?: string;
}

export function validateScore(value: number): { ok: boolean; message?: string } {
  if (!Number.isFinite(value)) {
    return { ok: false, message: "Score must be a finite number" };
  }
  if (value < 0) {
    return { ok: false, message: "Score must be non-negative" };
  }
  return { ok: true };
}
