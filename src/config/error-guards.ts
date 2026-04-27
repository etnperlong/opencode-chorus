import { MissingRequiredConfigError } from "./schema"

export function isMissingRequiredConfigError(error: unknown): error is MissingRequiredConfigError {
  return error instanceof MissingRequiredConfigError
}
