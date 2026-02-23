import "dotenv/config";
import { runExportCleanupOnce } from "../src/exports/cleanupExpiredExports";

async function main() {
  const result = await runExportCleanupOnce();
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
