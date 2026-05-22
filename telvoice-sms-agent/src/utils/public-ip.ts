export async function fetchPublicIp(): Promise<string | null> {
  try {
    const response = await fetch("https://api.ipify.org", {
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) {
      return null;
    }
    const text = (await response.text()).trim();
    return text.length > 0 ? text : null;
  } catch {
    return null;
  }
}
