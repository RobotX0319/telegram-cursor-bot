export function isKvWriteLimitError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /exceeded|429|limit/i.test(message);
}

export async function putJsonIfChanged(
  kv: KVNamespace,
  key: string,
  value: unknown,
): Promise<boolean> {
  const serialized = JSON.stringify(value);
  const existing = await kv.get(key);
  if (existing === serialized) return false;

  try {
    await kv.put(key, serialized);
    return true;
  } catch (error) {
    if (isKvWriteLimitError(error)) {
      console.error(`KV put skipped (${key}): daily write limit`);
      return false;
    }
    throw error;
  }
}

export async function putTextIfChanged(
  kv: KVNamespace,
  key: string,
  value: string,
  options?: KVNamespacePutOptions,
): Promise<boolean> {
  const existing = await kv.get(key);
  if (existing === value) return false;

  try {
    await kv.put(key, value, options);
    return true;
  } catch (error) {
    if (isKvWriteLimitError(error)) {
      console.error(`KV put skipped (${key}): daily write limit`);
      return false;
    }
    throw error;
  }
}
