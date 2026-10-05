import * as React from "react";
import {
    Badge,
    Button,
    Caption1,
    Link,
    MessageBar,
    MessageBarBody,
    ProgressBar,
    Subtitle2,
    Text,
    Tooltip,
    makeStyles,
    mergeClasses,
    shorthands,
    tokens,
} from "@fluentui/react-components";
import {
    ArrowClockwise20Regular,
    ArrowSync16Regular,
    ArrowUpload24Regular,
    CheckmarkCircle16Filled,
    Dismiss16Regular,
    ErrorCircle16Filled,
    Warning16Filled,
} from "@fluentui/react-icons";
import { AttachmentInfo, INotesService, OrgLimits } from "../services/INotesService";
import {
    collectDroppedFiles,
    errorMessage,
    formatBytes,
    formatLimit,
    getPreviewKind,
    isAbortError,
    makeThumbnail,
    validateFile,
} from "../services/fileUtils";
import { AttachmentList } from "./AttachmentList";
import { AttachmentPreview } from "./AttachmentPreview";
import { FileIcon } from "./FileIcon";

const MAX_PARALLEL_UPLOADS = 3;
const CLEAR_DONE_AFTER_MS = 3000;
/** Images larger than this keep the plain icon, to avoid downloading big files just for a thumbnail. */
const THUMBNAIL_MAX_BYTES = 5 * 1024 * 1024;
const PARALLEL_THUMBNAILS = 2;

type UploadStatus = "queued" | "uploading" | "done" | "error" | "rejected" | "duplicate" | "cancelled";

interface UploadItem {
    key: string;
    file: File;
    status: UploadStatus;
    message?: string;
    /** 0..1 while a large file uploads in blocks; undefined when progress isn't known. */
    progress?: number;
    /** Existing attachments to delete once this upload succeeds ("Replace"). */
    replaceIds?: string[];
}

export interface FileDropZoneAppProps {
    service: INotesService;
    readOnly: boolean;
    allowedExtensions: string[];
    /** Optional lower limit set on the form; the org's own limit always applies. */
    maxFileSizeMB?: number;
    maxFilesPerDrop: number;
    noteSubject: string;
    showExisting: boolean;
    allowDelete: boolean;
    showThumbnails: boolean;
    demoMode: boolean;
    formatDate: (date: Date) => string;
}

const useStyles = makeStyles({
    root: {
        display: "flex",
        flexDirection: "column",
        gap: tokens.spacingVerticalM,
        width: "100%",
        boxSizing: "border-box",
    },
    zone: {
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: tokens.spacingVerticalXS,
        minHeight: "110px",
        padding: tokens.spacingVerticalL,
        boxSizing: "border-box",
        textAlign: "center",
        cursor: "pointer",
        backgroundColor: tokens.colorNeutralBackground2,
        borderRadius: tokens.borderRadiusLarge,
        ...shorthands.border(tokens.strokeWidthThick, "dashed", tokens.colorNeutralStroke1),
        transitionProperty: "background-color, border-color",
        transitionDuration: tokens.durationFaster,
        ":hover": {
            backgroundColor: tokens.colorNeutralBackground2Hover,
            ...shorthands.borderColor(tokens.colorBrandStroke1),
        },
        ":focus-visible": {
            outlineWidth: tokens.strokeWidthThick,
            outlineStyle: "solid",
            outlineColor: tokens.colorStrokeFocus2,
        },
    },
    zoneActive: {
        backgroundColor: tokens.colorBrandBackground2,
        ...shorthands.borderColor(tokens.colorBrandStroke1),
        ":hover": { backgroundColor: tokens.colorBrandBackground2 },
    },
    zoneDisabled: {
        cursor: "not-allowed",
        opacity: 0.6,
        ":hover": {
            backgroundColor: tokens.colorNeutralBackground2,
            ...shorthands.borderColor(tokens.colorNeutralStroke1),
        },
    },
    zoneIcon: { color: tokens.colorBrandForeground1, display: "flex" },
    hint: { color: tokens.colorNeutralForeground3 },
    hiddenInput: { display: "none" },
    queue: { display: "flex", flexDirection: "column", gap: tokens.spacingVerticalS },
    queueItem: {
        display: "grid",
        gridTemplateColumns: "auto 1fr auto",
        alignItems: "center",
        columnGap: tokens.spacingHorizontalS,
        rowGap: tokens.spacingVerticalXXS,
    },
    queueIcon: { color: tokens.colorNeutralForeground3, display: "flex" },
    queueName: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
    queueDetail: { gridColumnStart: 2, gridColumnEnd: 4, display: "flex", flexDirection: "column", gap: "2px" },
    errorText: { color: tokens.colorPaletteRedForeground1 },
    warningText: { color: tokens.colorPaletteMarigoldForeground2 },
    choices: { display: "flex", flexWrap: "wrap", gap: tokens.spacingHorizontalXS },
    statusIcons: { display: "flex", alignItems: "center", gap: tokens.spacingHorizontalXXS },
    success: { color: tokens.colorPaletteGreenForeground1, display: "flex" },
    failure: { color: tokens.colorPaletteRedForeground1, display: "flex" },
    warning: { color: tokens.colorPaletteMarigoldForeground2, display: "flex" },
    header: { display: "flex", alignItems: "center", gap: tokens.spacingHorizontalS },
    headerSpacer: { flexGrow: 1 },
});

export const FileDropZoneApp: React.FC<FileDropZoneAppProps> = (props) => {
    const styles = useStyles();
    const { service } = props;
    const rootRef = React.useRef<HTMLDivElement>(null);
    const inputRef = React.useRef<HTMLInputElement>(null);
    const dragDepth = React.useRef(0);
    const mounted = React.useRef(true);
    const hovered = React.useRef(false);
    const controllers = React.useRef(new Map<string, AbortController>());
    const attachmentsRef = React.useRef<AttachmentInfo[]>([]);
    const thumbnailsStarted = React.useRef(new Set<string>());
    const thumbnailUrls = React.useRef<string[]>([]);

    const [dragActive, setDragActive] = React.useState(false);
    const [queue, setQueue] = React.useState<UploadItem[]>([]);
    const [attachments, setAttachments] = React.useState<AttachmentInfo[]>([]);
    const [loading, setLoading] = React.useState(false);
    const [busyIds, setBusyIds] = React.useState<Set<string>>(new Set());
    const [error, setError] = React.useState<string>();
    const [limits, setLimits] = React.useState<OrgLimits>({ blockedExtensions: [] });
    const [previewing, setPreviewing] = React.useState<AttachmentInfo>();
    const [thumbnails, setThumbnails] = React.useState<Record<string, string>>({});

    React.useEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
            controllers.current.forEach((c) => c.abort());
            thumbnailUrls.current.forEach((u) => URL.revokeObjectURL(u));
        };
    }, []);

    attachmentsRef.current = attachments;
    const canUpload = service.canUpload && !props.readOnly;

    React.useEffect(() => {
        if (!service.canUpload) return;
        service.getLimits().then((l) => mounted.current && setLimits(l), () => undefined);
    }, [service]);

    const maxFileBytes = effectiveLimit(props.maxFileSizeMB, limits);

    // The list is loaded even when hidden, so duplicates can still be detected.
    const refresh = React.useCallback(async () => {
        if (!service.canUpload) return;
        setLoading(true);
        try {
            const items = await service.listAttachments();
            if (mounted.current) setAttachments(items);
        } catch (e) {
            if (mounted.current && props.showExisting) setError(`Could not load attachments: ${errorMessage(e)}`);
        } finally {
            if (mounted.current) setLoading(false);
        }
    }, [service, props.showExisting]);

    // Reload when the record changes (for example after a new record is saved).
    React.useEffect(() => {
        void refresh();
    }, [refresh]);

    // Thumbnails for image attachments, a couple at a time.
    React.useEffect(() => {
        if (!props.showThumbnails || !props.showExisting) return;
        const pending = attachments.filter(
            (a) =>
                getPreviewKind(a.fileName, a.mimeType) === "image" &&
                a.fileSize <= THUMBNAIL_MAX_BYTES &&
                !thumbnailsStarted.current.has(a.id)
        );
        if (pending.length === 0) return;
        pending.forEach((a) => thumbnailsStarted.current.add(a.id));
        let next = 0;
        const worker = async () => {
            while (next < pending.length && mounted.current) {
                const a = pending[next++];
                try {
                    const url = await makeThumbnail(await service.getContent(a));
                    thumbnailUrls.current.push(url);
                    if (mounted.current) setThumbnails((t) => ({ ...t, [a.id]: url }));
                } catch {
                    // Keep the file icon for images that can't be drawn.
                }
            }
        };
        void Promise.all(Array.from({ length: PARALLEL_THUMBNAILS }, worker));
    }, [attachments, service, props.showThumbnails, props.showExisting]);

    const updateItem = (key: string, change: Partial<UploadItem>) => {
        if (!mounted.current) return;
        setQueue((q) => q.map((i) => (i.key === key ? { ...i, ...change } : i)));
    };

    const clearLater = (key: string) =>
        setTimeout(() => {
            if (mounted.current) setQueue((q) => q.filter((i) => !(i.key === key && i.status === "done")));
        }, CLEAR_DONE_AFTER_MS);

    const uploadOne = async (item: UploadItem) => {
        const controller = controllers.current.get(item.key) ?? new AbortController();
        if (controller.signal.aborted) return; // Cancelled while queued.
        controllers.current.set(item.key, controller);
        updateItem(item.key, { status: "uploading", message: undefined, progress: undefined });
        try {
            await service.uploadFile(item.file, props.noteSubject, {
                signal: controller.signal,
                onProgress: (progress) => updateItem(item.key, { progress }),
            });
        } catch (e) {
            if (isAbortError(e)) {
                updateItem(item.key, { status: "cancelled", message: "Upload cancelled.", progress: undefined });
            } else {
                updateItem(item.key, { status: "error", message: errorMessage(e), progress: undefined });
            }
            return;
        } finally {
            controllers.current.delete(item.key);
        }

        let message: string | undefined;
        for (const id of item.replaceIds ?? []) {
            const old = attachmentsRef.current.find((a) => a.id === id);
            if (!old) continue;
            try {
                await service.deleteAttachment(old);
            } catch (e) {
                message = `Uploaded, but the old copy could not be removed: ${errorMessage(e)}`;
            }
        }
        updateItem(item.key, { status: "done", message, progress: undefined });
        if (!message) clearLater(item.key);
    };

    const uploadAll = async (items: UploadItem[]) => {
        items.forEach((i) => controllers.current.set(i.key, new AbortController()));
        let next = 0;
        const worker = async () => {
            while (next < items.length) {
                await uploadOne(items[next++]);
            }
        };
        await Promise.all(Array.from({ length: Math.min(MAX_PARALLEL_UPLOADS, items.length) }, worker));
        await refresh();
    };

    const addFiles = async (files: File[]) => {
        if (!canUpload || files.length === 0) return;
        setError(undefined);
        if (files.length > props.maxFilesPerDrop) {
            setError(`You can add up to ${props.maxFilesPerDrop} files at a time. Only the first ${props.maxFilesPerDrop} were added.`);
        }
        const orgLimits = await service.getLimits();
        const maxBytes = effectiveLimit(props.maxFileSizeMB, orgLimits);
        const stamp = Date.now();
        const items: UploadItem[] = files.slice(0, props.maxFilesPerDrop).map((file, i) => {
            const key = `${stamp}-${i}-${file.name}`;
            const problem = validateFile(file, orgLimits, props.allowedExtensions, maxBytes);
            if (problem) return { key, file, status: "rejected", message: problem };
            const name = file.name.toLowerCase();
            const existing = attachmentsRef.current.filter((a) => a.fileName.toLowerCase() === name);
            if (existing.length > 0) {
                return {
                    key,
                    file,
                    status: "duplicate",
                    message: `A file named "${file.name}" is already attached.`,
                    replaceIds: existing.map((a) => a.id),
                };
            }
            return { key, file, status: "queued" };
        });
        if (!mounted.current) return;
        setQueue((q) => [...q, ...items]);
        const accepted = items.filter((i) => i.status === "queued");
        if (accepted.length > 0) void uploadAll(accepted);
    };

    // The paste listener is registered once, so it calls the latest addFiles through a ref.
    const addFilesRef = React.useRef(addFiles);
    addFilesRef.current = addFiles;

    React.useEffect(() => {
        if (!canUpload) return;
        const onPaste = (e: ClipboardEvent) => {
            const root = rootRef.current;
            const files = Array.from(e.clipboardData?.files ?? []);
            if (!root || files.length === 0) return;
            const active = document.activeElement;
            const focusInside = !!active && root.contains(active);
            // Only take the paste when the user is pointing at or working in this control,
            // and never from another field on the form.
            const target = e.target instanceof Element ? e.target : null;
            const intoOtherField = (isEditable(active) || isEditable(target)) && !(target && root.contains(target));
            if (!focusInside && (!hovered.current || intoOtherField)) return;
            e.preventDefault();
            void addFilesRef.current(files.map(namePastedFile));
        };
        document.addEventListener("paste", onPaste);
        return () => document.removeEventListener("paste", onPaste);
    }, [canUpload]);

    const resolveDuplicate = (item: UploadItem, choice: "replace" | "keep" | "skip") => {
        if (choice === "skip") {
            dismiss(item.key);
            return;
        }
        const next: UploadItem = {
            ...item,
            status: "queued",
            message: undefined,
            replaceIds: choice === "replace" ? item.replaceIds : undefined,
        };
        updateItem(item.key, next);
        void uploadAll([next]);
    };

    const retry = (item: UploadItem) => void uploadAll([item]);
    const dismiss = (key: string) => setQueue((q) => q.filter((i) => i.key !== key));
    const cancel = (item: UploadItem) => {
        controllers.current.get(item.key)?.abort();
        if (item.status === "queued") {
            updateItem(item.key, { status: "cancelled", message: "Upload cancelled." });
        }
    };

    const setBusy = (id: string, busy: boolean) =>
        setBusyIds((s) => {
            const copy = new Set(s);
            if (busy) copy.add(id);
            else copy.delete(id);
            return copy;
        });

    const download = async (a: AttachmentInfo) => {
        setBusy(a.id, true);
        try {
            await service.downloadAttachment(a);
        } catch (e) {
            setError(`Could not download ${a.fileName}: ${errorMessage(e)}`);
        } finally {
            if (mounted.current) setBusy(a.id, false);
        }
    };

    const remove = async (a: AttachmentInfo) => {
        const ok = await service.confirm("Delete attachment", `Delete "${a.fileName}"? This cannot be undone.`);
        if (!ok) return;
        setBusy(a.id, true);
        try {
            await service.deleteAttachment(a);
            if (mounted.current) setAttachments((list) => list.filter((x) => x.id !== a.id));
        } catch (e) {
            setError(`Could not delete ${a.fileName}: ${errorMessage(e)}`);
        } finally {
            if (mounted.current) setBusy(a.id, false);
        }
    };

    const loadContent = React.useCallback((a: AttachmentInfo) => service.getContent(a), [service]);

    // Drag handlers. A depth counter avoids flicker when dragging over child elements.
    const onDragEnter = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (!canUpload) return;
        dragDepth.current++;
        setDragActive(true);
    };
    const onDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = canUpload ? "copy" : "none";
    };
    const onDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (dragDepth.current === 0) setDragActive(false);
    };
    const onDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        dragDepth.current = 0;
        setDragActive(false);
        if (!canUpload) return;
        // Folder contents must be read during the event, so start reading before anything async.
        const hadItems = e.dataTransfer.items.length > 0;
        collectDroppedFiles(e.dataTransfer)
            .then((files) => {
                if (files.length === 0 && hadItems) setError("Nothing to upload: the folder is empty.");
                return addFiles(files);
            })
            .catch((err) => setError(`Could not read the dropped files: ${errorMessage(err)}`));
    };

    const openPicker = () => {
        if (canUpload) inputRef.current?.click();
    };

    const hintParts = [
        props.allowedExtensions.length > 0 ? props.allowedExtensions.join(", ") : "Any file type",
        // No size is shown when neither the property nor the org limit is known.
        ...(Number.isFinite(maxFileBytes) ? [`up to ${formatLimit(maxFileBytes)} each`] : []),
        "or paste with Ctrl+V",
    ];

    return (
        <div
            ref={rootRef}
            className={styles.root}
            onMouseEnter={() => (hovered.current = true)}
            onMouseLeave={() => (hovered.current = false)}
        >
            {props.demoMode && (
                <MessageBar intent="info">
                    <MessageBarBody>
                        Test harness demo mode: files are kept in memory only. Name a file with &quot;fail&quot; to see an error.
                    </MessageBarBody>
                </MessageBar>
            )}

            {!props.readOnly && (
                <div
                    role="button"
                    tabIndex={canUpload ? 0 : -1}
                    aria-disabled={!canUpload}
                    aria-label="Upload files. Drag and drop files or folders here, paste, or press Enter to browse."
                    className={mergeClasses(
                        styles.zone,
                        dragActive && styles.zoneActive,
                        !canUpload && styles.zoneDisabled
                    )}
                    onClick={openPicker}
                    onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            openPicker();
                        }
                    }}
                    onDragEnter={onDragEnter}
                    onDragOver={onDragOver}
                    onDragLeave={onDragLeave}
                    onDrop={onDrop}
                >
                    <span className={styles.zoneIcon}>
                        <ArrowUpload24Regular />
                    </span>
                    {canUpload ? (
                        <>
                            <Text weight="semibold">
                                {dragActive ? "Drop to upload" : (
                                    <>
                                        Drag and drop files here or <Link as="span">browse</Link>
                                    </>
                                )}
                            </Text>
                            <Caption1 className={styles.hint}>{hintParts.join(" · ")}</Caption1>
                        </>
                    ) : (
                        <Text>Save the record to add files.</Text>
                    )}
                    <input
                        ref={inputRef}
                        type="file"
                        multiple
                        className={styles.hiddenInput}
                        accept={props.allowedExtensions.join(",") || undefined}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => {
                            void addFiles(Array.from(e.target.files ?? []));
                            e.target.value = "";
                        }}
                    />
                </div>
            )}

            {error && (
                <MessageBar intent="error">
                    <MessageBarBody>{error}</MessageBarBody>
                    <Button
                        appearance="transparent"
                        size="small"
                        icon={<Dismiss16Regular />}
                        aria-label="Dismiss"
                        onClick={() => setError(undefined)}
                    />
                </MessageBar>
            )}

            {queue.length > 0 && (
                <div className={styles.queue} aria-live="polite">
                    {queue.map((item) => (
                        <QueueRow
                            key={item.key}
                            item={item}
                            styles={styles}
                            onRetry={retry}
                            onDismiss={dismiss}
                            onCancel={cancel}
                            onResolve={resolveDuplicate}
                        />
                    ))}
                </div>
            )}

            {props.showExisting && service.canUpload && (
                <div>
                    <div className={styles.header}>
                        <Subtitle2>Attachments</Subtitle2>
                        <Badge appearance="tint" size="small">
                            {attachments.length}
                        </Badge>
                        <span className={styles.headerSpacer} />
                        <Tooltip content="Refresh" relationship="label">
                            <Button
                                appearance="subtle"
                                size="small"
                                icon={<ArrowClockwise20Regular />}
                                disabled={loading}
                                onClick={() => void refresh()}
                            />
                        </Tooltip>
                    </div>
                    <AttachmentList
                        attachments={attachments}
                        loading={loading}
                        busyIds={busyIds}
                        allowDelete={props.allowDelete && !props.readOnly}
                        thumbnails={props.showThumbnails ? thumbnails : {}}
                        formatDate={props.formatDate}
                        onPreview={setPreviewing}
                        onDownload={(a) => void download(a)}
                        onDelete={(a) => void remove(a)}
                    />
                </div>
            )}

            <AttachmentPreview
                attachment={previewing}
                load={loadContent}
                onDownload={(a) => void download(a)}
                onClose={() => setPreviewing(undefined)}
            />
        </div>
    );
};

interface QueueRowProps {
    item: UploadItem;
    styles: ReturnType<typeof useStyles>;
    onRetry: (item: UploadItem) => void;
    onDismiss: (key: string) => void;
    onCancel: (item: UploadItem) => void;
    onResolve: (item: UploadItem, choice: "replace" | "keep" | "skip") => void;
}

const QueueRow: React.FC<QueueRowProps> = ({ item, styles, onRetry, onDismiss, onCancel, onResolve }) => {
    const active = item.status === "uploading" || item.status === "queued";
    // Small files go in one request that can't be stopped once sent, so only queued
    // files and block uploads (which report progress) can be cancelled.
    const cancellable = item.status === "queued" || (item.status === "uploading" && item.progress !== undefined);
    const percent = item.progress !== undefined ? ` · ${Math.round(item.progress * 100)}%` : "";

    return (
        <div className={styles.queueItem}>
            <span className={styles.queueIcon}>
                <FileIcon fileName={item.file.name} mimeType={item.file.type} />
            </span>
            <Text className={styles.queueName} title={item.file.name}>
                {item.file.name}{" "}
                <Caption1 className={styles.hint}>
                    ({formatBytes(item.file.size)}
                    {item.status === "uploading" ? percent : ""})
                </Caption1>
            </Text>
            <span className={styles.statusIcons}>
                {item.status === "done" && (
                    <span className={styles.success} aria-label="Uploaded">
                        <CheckmarkCircle16Filled />
                    </span>
                )}
                {(item.status === "error" || item.status === "rejected") && (
                    <span className={styles.failure} aria-label="Failed">
                        <ErrorCircle16Filled />
                    </span>
                )}
                {item.status === "duplicate" && (
                    <span className={styles.warning} aria-label="Already attached">
                        <Warning16Filled />
                    </span>
                )}
                {(item.status === "error" || item.status === "cancelled") && (
                    <Tooltip content="Retry" relationship="label">
                        <Button appearance="subtle" size="small" icon={<ArrowSync16Regular />} onClick={() => onRetry(item)} />
                    </Tooltip>
                )}
                {cancellable && (
                    <Tooltip content="Cancel upload" relationship="label">
                        <Button appearance="subtle" size="small" icon={<Dismiss16Regular />} onClick={() => onCancel(item)} />
                    </Tooltip>
                )}
                {!active && item.status !== "duplicate" && (
                    <Tooltip content="Dismiss" relationship="label">
                        <Button
                            appearance="subtle"
                            size="small"
                            icon={<Dismiss16Regular />}
                            onClick={() => onDismiss(item.key)}
                        />
                    </Tooltip>
                )}
            </span>
            <div className={styles.queueDetail}>
                {active && (
                    <ProgressBar thickness="medium" value={item.status === "queued" ? 0 : item.progress} />
                )}
                {item.message && (
                    <Caption1 className={item.status === "duplicate" ? styles.warningText : styles.errorText}>
                        {item.message}
                    </Caption1>
                )}
                {item.status === "duplicate" && (
                    <span className={styles.choices}>
                        <Button size="small" appearance="primary" onClick={() => onResolve(item, "replace")}>
                            Replace
                        </Button>
                        <Button size="small" onClick={() => onResolve(item, "keep")}>
                            Keep both
                        </Button>
                        <Button size="small" appearance="subtle" onClick={() => onResolve(item, "skip")}>
                            Skip
                        </Button>
                    </span>
                )}
            </div>
        </div>
    );
};

/** The lower of the form's limit (if set) and the org's limit (if known); Infinity when neither is. */
function effectiveLimit(maxFileSizeMB: number | undefined, orgLimits: OrgLimits): number {
    return Math.min(maxFileSizeMB ? maxFileSizeMB * 1024 * 1024 : Infinity, orgLimits.maxFileBytes ?? Infinity);
}

function isEditable(element: Element | null): boolean {
    if (!element) return false;
    const tag = element.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (element as HTMLElement).isContentEditable;
}

/** Screenshots pasted from the clipboard arrive as "image.png"; give them a useful, unique name. */
function namePastedFile(file: File): File {
    if (file.name && !/^image\.\w+$/i.test(file.name)) return file;
    const ext = file.type.split("/")[1]?.replace("jpeg", "jpg") || "png";
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}.${pad(d.getMinutes())}.${pad(d.getSeconds())}`;
    return new File([file], `Pasted image ${stamp}.${ext}`, { type: file.type, lastModified: file.lastModified });
}
