import "dotenv/config";
import { startSnapshotWorker, stopSnapshotWorker } from "../src/snapshots/snapshotWorker";

startSnapshotWorker();
console.log("Snapshot worker started");

function shutdown(): void {
  stopSnapshotWorker();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
