/**
 * Success result type
 */
export type Success<T> = {
  data: T;
  error: null;
};

/**
 * Failure result type
 */
export type Failure<E> = {
  data: null;
  error: E;
};

/**
 * Result type - either success or failure
 */
export type Result<T, E = Error> = Success<T> | Failure<E>;

/**
 * Wrap an async operation in try-catch, returning a Result
 *
 * @example
 * const { data, error } = await tryCatch(fetchUser(id));
 * if (error) {
 *   console.error("Failed to fetch user:", error);
 *   return;
 * }
 * console.log("User:", data);
 */
export async function tryCatch<T, E = Error>(promise: Promise<T>): Promise<Result<T, E>> {
  try {
    const data = await promise;
    return { data, error: null };
  } catch (error) {
    return { data: null, error: error as E };
  }
}

/**
 * Wrap a sync operation in try-catch, returning a Result
 *
 * @example
 * const { data, error } = tryCatchSync(() => JSON.parse(jsonString));
 * if (error) {
 *   console.error("Invalid JSON:", error);
 *   return;
 * }
 * console.log("Parsed:", data);
 */
export function tryCatchSync<T, E = Error>(func: () => T): Result<T, E> {
  try {
    const data = func();
    return { data, error: null };
  } catch (error) {
    return { data: null, error: error as E };
  }
}
