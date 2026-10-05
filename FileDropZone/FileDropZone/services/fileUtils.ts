/* global FileSystemEntry, FileSystemFileEntry, FileSystemDirectoryEntry */
import { OrgLimits } from "./INotesService";

/** Reads a file or part of one and returns its contents as base64 (without the data: URL prefix). */
export function readAsBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const result = reader.result as string;
            const comma = result.indexOf(",");
            resolve(comma >= 0 ? result.substring(comma + 1) : result);
        };
        reader.onerror = () => reject(reader.error ?? new Error("Could not read the file."));
        reader.readAsDataURL(blob);
    });
}

export function base64ToBlob(base64: string, mimeType: string): Blob {
    const bytes = atob(base64);
    const buffer = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) {
        buffer[i] = bytes.charCodeAt(i);
    }
    return new Blob([buffer], { type: mimeType || "application/octet-stream" });
}

/** Saves a blob through the browser's download. */
export function saveBlob(blob: Blob, fileName: string): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Browser download fallback when the platform openFile API is not available. */
export function downloadBase64(base64: string, fileName: string, mimeType: string): void {
    saveBlob(base64ToBlob(base64, mimeType), fileName);
}

export function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Formats a limit rounded down, so a 3.75 MB limit shows as 3.7 MB rather than 3.8 MB. */
export function formatLimit(bytes: number): string {
    const mb = Math.floor((bytes / (1024 * 1024)) * 10) / 10;
    return Number.isInteger(mb) ? `${mb} MB` : `${mb.toFixed(1)} MB`;
}

export function getExtension(fileName: string): string {
    const dot = fileName.lastIndexOf(".");
    return dot >= 0 ? fileName.substring(dot).toLowerCase() : "";
}

/** Turns ".pdf, docx ,PNG" or "exe;bat" into [".pdf", ".docx", ".png"] / [".exe", ".bat"]. */
export function parseExtensions(value: string | null | undefined): string[] {
    if (!value) return [];
    return value
        .split(/[,;\s]+/)
        .map((e) => e.trim().toLowerCase())
        .filter((e) => e.length > 0)
        .map((e) => (e.startsWith(".") ? e : `.${e}`));
}

/** Turns "image/svg+xml; Application/PDF" into ["image/svg+xml", "application/pdf"]. */
export function parseMimeTypes(value: string | null | undefined): string[] {
    if (!value) return [];
    return value
        .split(/[,;\s]+/)
        .map((m) => m.trim().toLowerCase())
        .filter((m) => m.length > 0);
}

/** The MIME type the control saves on the Note, which is what Dataverse checks. */
export function uploadMimeType(file: File): string {
    return (file.type || "application/octet-stream").toLowerCase();
}

/** True when the MIME type matches an entry; "image/*" style entries match the whole family. */
export function mimeMatches(mimeType: string, list: string[]): boolean {
    return list.some((m) => m === mimeType || (m.endsWith("/*") && mimeType.startsWith(m.slice(0, -1))));
}

/**
 * Checks a file against the environment's rules and the form's optional ones.
 * Returns the reason it can't be uploaded, or undefined when it's fine.
 */
export function validateFile(
    file: File,
    orgLimits: OrgLimits,
    allowedExtensions: string[],
    maxBytes: number
): string | undefined {
    const ext = getExtension(file.name);
    if (ext && orgLimits.blockedExtensions.includes(ext)) {
        return `${ext} files are blocked by your organization.`;
    }
    // Same rule as Dataverse: an allow list, when set, replaces the block list.
    const mime = uploadMimeType(file);
    const allowedMimes = orgLimits.allowedMimeTypes ?? [];
    const mimeBlocked =
        allowedMimes.length > 0 ? !mimeMatches(mime, allowedMimes) : mimeMatches(mime, orgLimits.blockedMimeTypes ?? []);
    if (mimeBlocked) return `${mime} files are blocked by your organization.`;
    if (allowedExtensions.length > 0 && !allowedExtensions.includes(ext)) {
        return `File type ${ext || "(none)"} is not allowed.`;
    }
    if (file.size === 0) return "File is empty.";
    if (file.size > maxBytes) {
        return `File is ${formatBytes(file.size)}; the limit is ${formatLimit(maxBytes)}.`;
    }
    return undefined;
}

export function errorMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    if (typeof error === "object" && error !== null && "message" in error) {
        return String((error as { message: unknown }).message);
    }
    return String(error);
}

export function isAbortError(error: unknown): boolean {
    return error instanceof Error && error.name === "AbortError";
}

export function throwIfAborted(signal?: AbortSignal): void {
    if (signal?.aborted) {
        const error = new Error("Upload cancelled.");
        error.name = "AbortError";
        throw error;
    }
}

export function newGuid(): string {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export type PreviewKind = "image" | "pdf" | "text";

const TEXT_EXTENSIONS = [".txt", ".csv", ".log", ".json", ".xml", ".md"];
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp", "image/bmp"];

/** What kind of in-app preview a file supports, if any. */
export function getPreviewKind(fileName: string, mimeType: string): PreviewKind | undefined {
    const ext = getExtension(fileName);
    if (IMAGE_TYPES.includes(mimeType) || [".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp"].includes(ext)) {
        return "image";
    }
    if (mimeType === "application/pdf" || ext === ".pdf") return "pdf";
    if (mimeType.startsWith("text/") || TEXT_EXTENSIONS.includes(ext)) return "text";
    return undefined;
}

/** Draws a small square thumbnail and returns an object URL for it. The caller revokes it. */
export async function makeThumbnail(blob: Blob, size = 64): Promise<string> {
    const source = URL.createObjectURL(blob);
    try {
        const image = await new Promise<HTMLImageElement>((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error("Not a readable image."));
            img.src = source;
        });
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Canvas is not available.");
        const scale = Math.max(size / image.naturalWidth, size / image.naturalHeight);
        const w = image.naturalWidth * scale;
        const h = image.naturalHeight * scale;
        ctx.drawImage(image, (size - w) / 2, (size - h) / 2, w, h);
        const thumb = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.8));
        if (!thumb) throw new Error("Could not create a thumbnail.");
        return URL.createObjectURL(thumb);
    } finally {
        URL.revokeObjectURL(source);
    }
}

const SYSTEM_FILES = [".ds_store", "thumbs.db", "desktop.ini"];

/**
 * Gets the files from a drop, including the files inside dropped folders.
 * The entries must be read during the drop event, so call this synchronously from the handler.
 */
export function collectDroppedFiles(data: DataTransfer): Promise<File[]> {
    const entries = Array.from(data.items ?? [])
        .filter((item) => item.kind === "file")
        .map((item) => item.webkitGetAsEntry?.() ?? null);
    if (entries.length === 0 || entries.some((e) => e === null)) {
        // Browser without entry support: use the plain file list.
        return Promise.resolve(Array.from(data.files));
    }
    return Promise.all((entries as FileSystemEntry[]).map(readEntry)).then((lists) =>
        lists.flat().filter((f) => !SYSTEM_FILES.includes(f.name.toLowerCase()))
    );
}

async function readEntry(entry: FileSystemEntry): Promise<File[]> {
    if (entry.isFile) {
        const file = await new Promise<File>((resolve, reject) =>
            (entry as FileSystemFileEntry).file(resolve, reject)
        );
        return [file];
    }
    if (entry.isDirectory) {
        const reader = (entry as FileSystemDirectoryEntry).createReader();
        const children: FileSystemEntry[] = [];
        // readEntries returns results in batches; keep reading until it returns none.
        for (;;) {
            const batch = await new Promise<FileSystemEntry[]>((resolve, reject) =>
                reader.readEntries(resolve, reject)
            );
            if (batch.length === 0) break;
            children.push(...batch);
        }
        const lists = await Promise.all(children.map(readEntry));
        return lists.flat();
    }
    return [];
}
