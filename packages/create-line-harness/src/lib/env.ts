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
