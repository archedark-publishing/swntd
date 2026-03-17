import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { ApiError } from "../http/errors";

const allowedMimeTypes = new Set([
  "application/json",
  "application/pdf",
  "image/heic",
  "image/jpeg",
  "image/png",
  "image/webp",
  "text/csv",
  "text/markdown",
  "text/plain"
]);

const allowedExtensions = new Set([
  ".csv",
  ".heic",
  ".jpeg",
  ".jpg",
  ".json",
  ".md",
  ".pdf",
  ".png",
  ".txt",
  ".webp"
]);

type UploadConfig = {
  maxUploadBytes: number;
  uploadsDir: string;
};

export type StoredUpload = {
  byteSize: number;
  mimeType: string | null;
  originalName: string;
  storagePath: string;
};

function getResolvedUploadsDir(config: UploadConfig) {
  return path.isAbsolute(config.uploadsDir)
    ? config.uploadsDir
    : path.resolve(process.cwd(), config.uploadsDir);
}

async function ensureUploadsDir(config: UploadConfig) {
  await mkdir(getResolvedUploadsDir(config), { recursive: true });
}

function getSafeExtension(filename: string) {
  const extension = path.extname(filename).toLowerCase();

  if (!allowedExtensions.has(extension)) {
    throw new ApiError(415, "unsupported_upload_type", "Unsupported file type.");
  }

  return extension;
}

function assertFileSupported(file: File, config: UploadConfig) {
  if (file.size === 0) {
    throw new ApiError(400, "empty_upload", "Uploaded files cannot be empty.");
  }

  if (file.size > config.maxUploadBytes) {
    throw new ApiError(
      413,
      "upload_too_large",
      `Uploads must be ${config.maxUploadBytes} bytes or smaller.`
    );
  }

  getSafeExtension(file.name || "upload");

  if (file.type && !allowedMimeTypes.has(file.type)) {
    throw new ApiError(415, "unsupported_upload_type", "Unsupported file type.");
  }
}

export async function storeUpload(file: File, config: UploadConfig) {
  assertFileSupported(file, config);
  await ensureUploadsDir(config);

  const extension = getSafeExtension(file.name || "upload");
  const storagePath = `${crypto.randomUUID()}${extension}`;
  const absolutePath = path.join(getResolvedUploadsDir(config), storagePath);
  const bytes = Buffer.from(await file.arrayBuffer());

  await writeFile(absolutePath, bytes);

  const storedUpload: StoredUpload = {
    byteSize: bytes.byteLength,
    mimeType: file.type || null,
    originalName: file.name || `upload${extension}`,
    storagePath
  };

  return storedUpload;
}

function resolveStoredUploadPath(storagePath: string, config: UploadConfig) {
  const safeName = path.basename(storagePath);

  if (safeName !== storagePath) {
    throw new ApiError(400, "invalid_attachment_path", "Invalid attachment path.");
  }

  return path.join(getResolvedUploadsDir(config), safeName);
}

export async function readStoredUpload(
  storagePath: string,
  config: UploadConfig
) {
  try {
    return await readFile(resolveStoredUploadPath(storagePath, config));
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      throw new ApiError(404, "attachment_missing", "Attachment file not found.");
    }

    throw error;
  }
}

export async function deleteStoredUpload(
  storagePath: string,
  config: UploadConfig
) {
  await rm(resolveStoredUploadPath(storagePath, config), {
    force: true
  });
}
