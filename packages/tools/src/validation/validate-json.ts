export const validateJson = <T>(value: string): T => JSON.parse(value) as T;
