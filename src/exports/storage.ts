import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

function storageRoot(): string {
  return path.resolve(process.env.EXPORT_STORAGE_DIR ?? "./tmp/exports");
}

async function ensureStorageRoot(): Promise<string> {
  const root = storageRoot();
  await mkdir(root, { recursive: true });
  return root;
}

export function exportKeyForId(exportId: string): string {
  return `${exportId}.pdf`;
}

function resolveStoragePathFromKey(key: string): string {
  const root = storageRoot();
  const full = path.resolve(root, key);
  if (!full.startsWith(root)) {
    throw new Error("Invalid export key path");
  }
  return full;
}

export async function saveExportPdf(key: string, data: Buffer): Promise<void> {
  const root = await ensureStorageRoot();
  const full = path.resolve(root, key);
  if (!full.startsWith(root)) {
    throw new Error("Invalid export key path");
  }
  await writeFile(full, data);
}

export async function readExportPdf(key: string): Promise<Buffer> {
  const full = resolveStoragePathFromKey(key);
  return readFile(full);
}

export async function deleteExportPdf(key: string): Promise<void> {
  const full = resolveStoragePathFromKey(key);
  await unlink(full);
}
