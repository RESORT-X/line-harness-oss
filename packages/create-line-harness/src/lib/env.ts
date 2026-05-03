export const DEFAULT_ENV = "default";

export function normalizeEnvName(value?: string | null): string {
  const envName = (value || DEFAULT_ENV).trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]*$/.test(envName)) {
    throw new Error("--env は英小文字・数字・ハイフンのみ使用できます（例: dev, prd）");
  }
  return envName;
}

export function envSuffix(envName: string): string {
  return envName === DEFAULT_ENV ? "" : `.${envName}`;
}

export function envLabel(envName: string): string {
  return envName === DEFAULT_ENV ? "default" : envName;
}

export function defaultWorkerUrlForEnv(envName: string): string | null {
  if (envName === "dev") return "https://dev.line.rav.support";
  if (envName === "prd") return "https://line.rav.support";
  return null;
}

export function isWorkersDevUrl(value?: string | null): boolean {
  if (!value) return false;
  try {
    return new URL(value).hostname.endsWith(".workers.dev");
  } catch {
    return false;
  }
}

export function resolveWorkerUrlForEnv(
  envName: string,
  currentUrl?: string | null,
): string | null {
  const trimmed = currentUrl?.trim();
  const defaultUrl = defaultWorkerUrlForEnv(envName);
  const currentOrigin = trimmed ? new URL(trimmed).origin : null;
  if (!defaultUrl) return currentOrigin;
  if (!currentOrigin || isWorkersDevUrl(currentOrigin)) return defaultUrl;
  return currentOrigin;
}
