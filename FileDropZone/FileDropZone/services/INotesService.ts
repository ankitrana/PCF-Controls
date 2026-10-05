export interface AttachmentInfo {
    id: string;
    fileName: string;
    /** Size in bytes. */
    fileSize: number;
    mimeType: string;
    createdOn?: Date;
    createdBy?: string;
}

/** Upload limits set for the whole environment. */
export interface OrgLimits {
    /** Largest file (raw bytes) the server accepts, or undefined when unknown. */
    maxFileBytes?: number;
    /** Extensions such as ".exe" that the environment blocks. */
    blockedExtensions: string[];
    /** MIME types the environment blocks. Ignored when allowedMimeTypes has entries. */
    blockedMimeTypes?: string[];
    /** When not empty, only these MIME types can be uploaded. */
    allowedMimeTypes?: string[];
}

export interface UploadOptions {
    /** Called with 0..1 while a large file is sent in blocks. Not called for small files. */
    onProgress?: (fraction: number) => void;
    signal?: AbortSignal;
}

export interface INotesService {
    /** True when uploads can happen (the record exists). */
    readonly canUpload: boolean;
    getLimits(): Promise<OrgLimits>;
    listAttachments(): Promise<AttachmentInfo[]>;
    uploadFile(file: File, subject: string, options?: UploadOptions): Promise<void>;
    /** The file's contents, used for preview and thumbnails. */
    getContent(attachment: AttachmentInfo): Promise<Blob>;
    downloadAttachment(attachment: AttachmentInfo): Promise<void>;
    deleteAttachment(attachment: AttachmentInfo): Promise<void>;
    confirm(title: string, text: string): Promise<boolean>;
}
