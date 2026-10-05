/** Reads a blob and returns its contents as base64 (without the data: URL prefix). */
export function readAsBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const result = reader.result as string;
            const comma = result.indexOf(",");
            resolve(comma >= 0 ? result.substring(comma + 1) : result);
        };
        reader.onerror = () => reject(reader.error ?? new Error("Could not read the image."));
        reader.readAsDataURL(blob);
    });
}

export function base64ToBlob(base64: string, mimeType: string): Blob {
    const bytes = atob(base64);
    const buffer = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) {
        buffer[i] = bytes.charCodeAt(i);
    }
    return new Blob([buffer], { type: mimeType });
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

/** Removes characters Windows and Dataverse don't accept in file names. */
export function cleanName(name: string): string {
    return name
        .replace(/[\\/:*?"<>|]/g, "")
        .replace(/\.png$/i, "")
        .replace(/\s+/g, " ")
        .trim();
}

/** "Signature" or "Signature 2026-10-05 14-30" plus ".png". */
export function buildFileName(baseName: string, addDate: boolean, now = new Date()): string {
    if (!addDate) return `${baseName}.png`;
    const pad = (n: number) => String(n).padStart(2, "0");
    const stamp =
        `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ` +
        `${pad(now.getHours())}-${pad(now.getMinutes())}`;
    return `${baseName} ${stamp}.png`;
}

/**
 * True for file names this control would give an image called baseName, with or without the date,
 * e.g. "Signature.png", "Signature 2026-10-05 14-30.png". "Signature of witness.png" does not match.
 */
export function isOwnImage(fileName: string, baseName: string): boolean {
    const escaped = baseName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`^${escaped}( \\d{4}-\\d{2}-\\d{2} \\d{2}-\\d{2}(-\\d{2})?)?( \\(\\d+\\))?\\.png$`, "i").test(fileName);
}

export function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function errorMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    if (typeof error === "string") return error;
    const message = (error as { message?: string } | undefined)?.message;
    return message || "Something went wrong.";
}

/** Accepts "#000", "#1f3b8c" or "1f3b8c"; anything else falls back. */
export function parseColor(value: string | null | undefined, fallback: string): string {
    const text = (value ?? "").trim();
    const hex = text.startsWith("#") ? text : `#${text}`;
    return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(hex) ? hex.toLowerCase() : fallback;
}
