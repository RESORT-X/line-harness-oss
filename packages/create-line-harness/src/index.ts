import { resolve } from "node:path";
import { runSetup } from "./commands/setup.js";
import { runUpdate } from "./commands/update.js";
import { normalizeEnvName } from "./lib/env.js";
import { ensureRepo } from "./steps/clone-repo.js";

const args = process.argv.slice(2);

function parseArgs(): { command: string; repoDir: string | null; envName: string } {
  let command = "setup";
  let repoDir: string | null = null;
  let envName = "default";

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--repo-dir" && args[i + 1]) {
      repoDir = resolve(args[i + 1]);
      i++;
    } else if (args[i] === "--env" && args[i + 1]) {
      envName = normalizeEnvName(args[i + 1]);
      i++;
    } else if (!args[i].startsWith("-")) {
      command = args[i];
    }
  }

  return { command, repoDir, envName };
}

async function main(): Promise<void> {
  const { command, repoDir: explicitRepoDir, envName } = parseArgs();

  // Ensure repo is available (clone if needed)
  const repoDir = await ensureRepo(explicitRepoDir);

  if (command === "setup") {
    await runSetup(repoDir, envName);
  } else if (command === "update") {
    await runUpdate(repoDir, envName);
  } else {
    console.error(`Unknown command: ${command}`);
    console.error("Usage: create-line-harness [setup|update] [--repo-dir <path>] [--env dev|prd]");
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Error:", error.message);
  process.exit(1);
});
