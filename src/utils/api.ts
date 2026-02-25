const API_PREFIX = '/api/proxy';

/** Build API URL for a specific Benthos target */
export function proxyUrl(targetName: string, path: string): string {
  return `${API_PREFIX}/${encodeURIComponent(targetName)}${path}`;
}

/** Fetch the list of configured targets */
export async function fetchTargets() {
  const res = await fetch('/targets.json');
  if (!res.ok) throw new Error(`Failed to fetch targets: ${res.status}`);
  return res.json();
}

/** Fetch the active YAML config from a Benthos instance */
export async function fetchConfig(targetName: string): Promise<string> {
  const res = await fetch(proxyUrl(targetName, '/benthos/debug/config/yaml'));
  if (!res.ok) throw new Error(`Failed to fetch config: ${res.status}`);
  return res.text();
}

/** Fetch Prometheus metrics from a Benthos instance */
export async function fetchMetrics(targetName: string): Promise<string> {
  const res = await fetch(proxyUrl(targetName, '/benthos/metrics'));
  if (!res.ok) throw new Error(`Failed to fetch metrics: ${res.status}`);
  return res.text();
}

/** Fetch version from a Benthos instance */
export async function fetchVersion(targetName: string): Promise<{ version: string; built: string }> {
  const res = await fetch(proxyUrl(targetName, '/benthos/version'));
  if (!res.ok) throw new Error(`Failed to fetch version: ${res.status}`);
  return res.json();
}

/** Check if a Benthos instance is ready */
export async function checkReady(targetName: string): Promise<boolean> {
  try {
    const res = await fetch(proxyUrl(targetName, '/benthos/ready'));
    return res.ok;
  } catch {
    return false;
  }
}
