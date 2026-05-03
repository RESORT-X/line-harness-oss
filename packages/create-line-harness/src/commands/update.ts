import * as p from "@clack/prompts";
import pc from "picocolors";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ensureAuth } from "../steps/auth.js";
import { deployAdmin } from "../steps/deploy-admin.js";
import { deployWorker } from "../steps/deploy-worker.js";
import { DEFAULT_ENV, envLabel, envSuffix, resolveWorkerUrlForEnv } from "../lib/env.js";
import { setAccountId, wrangler } from "../lib/wrangler.js";

interface HarnessConfig {
  envName?: string;
  projectName: string;
  workerName?: string;
  workerUrl?: string;
  adminUrl?: string;
  d1DatabaseName?: string;
  d1DatabaseId: string;
  r2BucketName: string;
  accountId?: string;
  liffId: string;
  botBasicId?: string;
  productionBranch?: string;
}

function getConfigPath(repoDir: string, envName: string): string {
  return join(repoDir, `.line-harness-config${envSuffix(envName)}.json`);
}

function loadConfig(repoDir: string, envName: string): HarnessConfig | null {
  const configPath = getConfigPath(repoDir, envName);
  if (existsSync(configPath)) {
    try {
      return JSON.parse(readFileSync(configPath, "utf-8")) as HarnessConfig;
    } catch {
      // corrupt file
    }
  }
  return null;
}

function productionBranchForEnv(config: HarnessConfig, envName: string): string {
  if (config.productionBranch) return config.productionBranch;
  return envName === "prd" ? "production" : "main";
}

function adminProjectNameFromUrl(adminUrl: string | undefined, projectName: string): string {
  if (!adminUrl) return `${projectName}-admin`;
  return new URL(adminUrl).hostname.replace(".pages.dev", "");
}

function isBenignMigrationError(error: unknown): boolean {
  const text = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return text.includes("duplicate column") || text.includes("already exists");
}

async function ensureScenarioCompletionFormColumn(databaseName: string): Promise<void> {
  try {
    await wrangler([
      "d1",
      "execute",
      databaseName,
      "--remote",
      "--command",
      "ALTER TABLE scenarios ADD COLUMN on_completion_form_id TEXT REFERENCES forms (id) ON DELETE SET NULL",
    ]);
  } catch (error) {
    if (!isBenignMigrationError(error)) throw error;
  }
}

function assertConfig(config: HarnessConfig, repoDir: string, envName: string): void {
  const missing = [
    ["projectName", config.projectName],
    ["workerUrl", config.workerUrl],
    ["d1DatabaseId", config.d1DatabaseId],
    ["r2BucketName", config.r2BucketName],
    ["accountId", config.accountId],
    ["liffId", config.liffId],
  ].filter(([, value]) => !value);

  if (missing.length > 0) {
    throw new Error(
      [
        `${getConfigPath(repoDir, envName)} の必須項目が不足しています。`,
        `不足: ${missing.map(([name]) => name).join(", ")}`,
        `先に \`pnpm deploy:setup --env ${envName}\` を完了してください。`,
      ].join("\n"),
    );
  }
}

function applyDefaultWorkerUrl(
  config: HarnessConfig,
  repoDir: string,
  envName: string,
): void {
  const resolvedWorkerUrl = resolveWorkerUrlForEnv(envName, config.workerUrl);
  if (!resolvedWorkerUrl || resolvedWorkerUrl === config.workerUrl) return;

  config.workerUrl = resolvedWorkerUrl;
  writeFileSync(getConfigPath(repoDir, envName), JSON.stringify(config, null, 2) + "\n");
  p.log.info(`公開URL: ${pc.cyan(resolvedWorkerUrl)}`);
}

export async function runUpdate(repoDir: string, envName = DEFAULT_ENV): Promise<void> {
  p.intro(pc.bgCyan(pc.black(` LINE Harness アップデート: ${envLabel(envName)} `)));

  const config = loadConfig(repoDir, envName);
  if (!config) {
    p.cancel(
      [
        `${getConfigPath(repoDir, envName)} が見つかりません。`,
        `先に \`pnpm deploy:setup --env ${envName}\` を完了してください。`,
      ].join("\n"),
    );
    process.exit(1);
  }

  applyDefaultWorkerUrl(config, repoDir, envName);
  assertConfig(config, repoDir, envName);
  const projectName = config.projectName;
  const workerName = config.workerName || projectName;
  const productionBranch = productionBranchForEnv(config, envName);
  const adminProjectName = adminProjectNameFromUrl(config.adminUrl, projectName);

  p.log.success(`プロジェクト名: ${projectName}`);
  p.log.info(`Git branch: ${productionBranch} → ${envLabel(envName)}`);

  await ensureAuth();
  if (config.accountId) {
    setAccountId(config.accountId);
  }

  const s = p.spinner();

  // Run pending migrations
  s.start("マイグレーション確認中...");
  try {
    await wrangler(
      ["d1", "migrations", "apply", config.d1DatabaseName || projectName, "--remote"],
      { cwd: join(repoDir, "packages/db") },
    );
    await ensureScenarioCompletionFormColumn(config.d1DatabaseName || projectName);
    s.stop("マイグレーション完了");
  } catch {
    try {
      await ensureScenarioCompletionFormColumn(config.d1DatabaseName || projectName);
      s.stop("マイグレーション完了");
    } catch {
      s.stop("マイグレーション完了（変更なし）");
    }
  }

  // Redeploy Worker
  await deployWorker({
    repoDir,
    d1DatabaseId: config.d1DatabaseId,
    d1DatabaseName: config.d1DatabaseName || projectName,
    workerName,
    workerUrl: config.workerUrl!,
    accountId: config.accountId!,
    liffId: config.liffId,
    r2BucketName: config.r2BucketName,
    botBasicId: config.botBasicId || "",
  });

  // Rebuild and redeploy Admin UI
  await deployAdmin({
    repoDir,
    workerUrl: config.workerUrl!,
    projectName: adminProjectName,
    productionBranch,
  });

  p.outro(pc.green("アップデート完了！"));
}
