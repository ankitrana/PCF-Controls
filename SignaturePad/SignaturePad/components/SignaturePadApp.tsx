import * as React from "react";
import {
    Button,
    Caption1,
    Field,
    Input,
    MessageBar,
    MessageBarBody,
    MessageBarIntent,
    Spinner,
    Subtitle2,
    Text,
    Tooltip,
    makeStyles,
    mergeClasses,
    shorthands,
    tokens,
} from "@fluentui/react-components";
import {
    Add20Regular,
    ArrowDownload20Regular,
    Delete20Regular,
    Dismiss20Regular,
    Edit20Regular,
    Save20Regular,
} from "@fluentui/react-icons";
import { IImageService, SavedImage } from "../services/IImageService";
import { buildFileName, errorMessage, formatBytes, isOwnImage } from "../services/imageUtils";
import { IMAGE_SCALE } from "../services/DrawingEngine";
import { DrawingPad, DrawingPadHandle, PadMode, PadState, PenColor } from "./DrawingPad";

/** Space kept around a signature when it is cropped to the ink, in CSS pixels. */
const SIGNATURE_PADDING = 12;
/** Longest note the user can type. The Note's description column holds far more. */
const NOTE_MAX_LENGTH = 250;

export interface SignaturePadAppProps {
    service: IImageService;
    mode: PadMode;
    /** File name without date or .png, e.g. "Signature". */
    baseName: string;
    addDate: boolean;
    /** Delete the earlier images with the same name when a new one is saved. */
    replaceEarlier: boolean;
    noteSubject: string;
    colors: PenColor[];
    initialColor: string;
    penWidth: number;
    padHeight: number;
    transparent: boolean;
    /** Short note typed with each image (the Note's description). */
    noteMode: "optional" | "required" | "off";
    allowDelete: boolean;
    readOnly: boolean;
    formatDate: (date: Date) => string;
    /** Called with the newest image's file name after a save or delete (null when none are left). */
    onImagesChanged: (latestFileName: string | null) => void;
}

/** One open pad. A new key gives a fresh pad. */
interface Session {
    key: number;
    /** The saved image being changed; undefined for a new one. */
    target?: SavedImage;
    base?: Blob;
}

interface Notice {
    intent: MessageBarIntent;
    text: string;
}

interface Preview {
    url: string;
    blob: Blob;
}

const useStyles = makeStyles({
    root: { display: "flex", flexDirection: "column", gap: tokens.spacingVerticalM, width: "100%" },
    editing: { color: tokens.colorNeutralForeground3 },
    gallery: { display: "flex", flexDirection: "column", gap: tokens.spacingVerticalS },
    galleryHeader: { display: "flex", alignItems: "center", gap: tokens.spacingHorizontalS, flexWrap: "wrap" },
    grid: {
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
        gap: tokens.spacingHorizontalM,
    },
    list: { display: "flex", flexDirection: "column", gap: tokens.spacingVerticalS },
    card: {
        display: "flex",
        flexDirection: "column",
        gap: tokens.spacingVerticalXS,
        padding: tokens.spacingVerticalS,
        borderRadius: tokens.borderRadiusMedium,
        backgroundColor: tokens.colorNeutralBackground1,
        ...shorthands.border(tokens.strokeWidthThin, "solid", tokens.colorNeutralStroke2),
        minWidth: 0,
    },
    cardEditing: { ...shorthands.borderColor(tokens.colorBrandStroke1) },
    picture: {
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#ffffff",
        borderRadius: tokens.borderRadiusSmall,
        overflow: "hidden",
    },
    image: { maxWidth: "100%", maxHeight: "100%", height: "auto", objectFit: "contain" },
    pictureNote: { color: "#8a8886" },
    cardFooter: { display: "flex", alignItems: "flex-end", gap: tokens.spacingHorizontalS, flexWrap: "wrap" },
    cardText: { display: "flex", flexDirection: "column", minWidth: 0, flexGrow: 1 },
    fileName: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
    meta: { color: tokens.colorNeutralForeground3 },
    cardActions: { display: "flex", gap: tokens.spacingHorizontalXXS },
    empty: { color: tokens.colorNeutralForeground3 },
});

export function SignaturePadApp(props: SignaturePadAppProps): React.ReactElement {
    const { service, mode, baseName, readOnly } = props;
    const styles = useStyles();
    const padRef = React.useRef<DrawingPadHandle>(null);
    const nextKey = React.useRef(1);
    const previews = React.useRef(new Map<string, Preview>());
    const failedPreviews = React.useRef(new Set<string>());
    const [, refreshPreviews] = React.useReducer((n: number) => n + 1, 0);

    const [images, setImages] = React.useState<SavedImage[]>();
    const [session, setSession] = React.useState<Session | null>(() => ({ key: 0 }));
    const [padState, setPadState] = React.useState<PadState>({ blank: true, changed: false });
    const [noteText, setNoteText] = React.useState("");
    const [busy, setBusy] = React.useState<string>();
    const [notice, setNotice] = React.useState<Notice>();
    const autoHidden = React.useRef(false);

    const noun = mode === "signature" ? "signature" : "drawing";
    const Noun = mode === "signature" ? "Signature" : "Drawing";

    const openPad = (target?: SavedImage, base?: Blob) => {
        setPadState({ blank: !base, changed: false });
        setNoteText(target?.note ?? "");
        setSession({ key: nextKey.current++, target, base });
    };

    const load = React.useCallback(async (): Promise<SavedImage[]> => {
        try {
            const all = await service.listImages(baseName);
            const own = all.filter((i) => isOwnImage(i.fileName, baseName)).sort(newestFirst);
            setImages(own);
            return own;
        } catch (error) {
            setImages([]);
            setNotice({ intent: "error", text: `Could not load the saved ${noun}: ${errorMessage(error)}` });
            return [];
        }
    }, [service, baseName, noun]);

    React.useEffect(() => {
        setImages(undefined);
        void load();
    }, [load]);

    // Signature mode shows the saved signature instead of the pad; the pad comes back when there is none.
    // Drawing mode always has a pad open.
    React.useEffect(() => {
        if (readOnly || !images) return;
        const signature = mode === "signature";
        if (signature && images.length > 0 && !autoHidden.current && session && !session.target && !padState.changed) {
            autoHidden.current = true;
            setSession(null);
        } else if (!session && (!signature || images.length === 0)) {
            openPad();
        }
        // Only the image list and mode decide this.
    }, [images, mode]);

    // Load the pictures for the saved images, one at a time.
    React.useEffect(() => {
        if (!images) return;
        let cancelled = false;
        const keys = new Set(images.map(imageKey));
        previews.current.forEach((preview, key) => {
            if (!keys.has(key)) {
                URL.revokeObjectURL(preview.url);
                previews.current.delete(key);
            }
        });
        void (async () => {
            for (const image of images) {
                const key = imageKey(image);
                if (cancelled) return;
                if (previews.current.has(key) || failedPreviews.current.has(key)) continue;
                try {
                    const blob = await service.getContent(image);
                    previews.current.set(key, { url: URL.createObjectURL(blob), blob });
                } catch {
                    failedPreviews.current.add(key);
                }
                refreshPreviews();
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [images, service]);

    React.useEffect(
        () => () => {
            previews.current.forEach((p) => URL.revokeObjectURL(p.url));
            previews.current.clear();
        },
        []
    );

    /** Asks before throwing away strokes that haven't been saved. */
    const discardChanges = async (): Promise<boolean> => {
        const noteChanged = noteText.trim() !== (session?.target?.note ?? "");
        if (!session || !(padState.changed || noteChanged)) return true;
        return service.confirm(
            `Discard this ${noun}?`,
            `The ${noun} on the pad has not been saved. Discard it?`,
            "Discard"
        );
    };

    const startNew = async () => {
        if (!(await discardChanges())) return;
        setNotice(undefined);
        openPad();
    };

    const edit = async (image: SavedImage) => {
        if (!(await discardChanges())) return;
        setNotice(undefined);
        setBusy(`edit:${image.id}`);
        try {
            const blob = previews.current.get(imageKey(image))?.blob ?? (await service.getContent(image));
            openPad(image, blob);
        } catch (error) {
            setNotice({ intent: "error", text: `Could not open ${image.fileName}: ${errorMessage(error)}` });
        } finally {
            setBusy(undefined);
        }
    };

    const cancel = async () => {
        if (!(await discardChanges())) return;
        setNotice(undefined);
        if (mode === "signature" && images && images.length > 0) {
            setSession(null);
        } else {
            openPad();
        }
    };

    const save = async () => {
        const pad = padRef.current;
        if (!pad || !session) return;
        const note = props.noteMode === "off" ? "" : noteText.trim();
        if (props.noteMode === "required" && !note) {
            setNotice({ intent: "warning", text: `Add a note about this ${noun} before saving.` });
            return;
        }
        setBusy("save");
        setNotice(undefined);
        try {
            const png = await pad.exportPng({
                trimPadding: mode === "signature" ? SIGNATURE_PADDING : undefined,
                background: props.transparent ? undefined : "#ffffff",
            });
            if (!png) {
                setNotice({ intent: "warning", text: `There is nothing to save. Draw your ${noun} first.` });
                return;
            }
            const target = session.target;
            const existing = images ?? [];
            let fileName = buildFileName(baseName, props.addDate);
            if (target || !props.replaceEarlier) {
                fileName = uniqueName(
                    fileName,
                    existing.filter((i) => i.id !== target?.id).map((i) => i.fileName)
                );
            }

            const failed: string[] = [];
            if (target) {
                await service.updateImage(target, fileName, note, png);
            } else {
                await service.createImage(fileName, props.noteSubject || baseName, note, png);
                if (props.replaceEarlier) {
                    for (const old of existing) {
                        try {
                            await service.deleteImage(old);
                        } catch {
                            failed.push(old.fileName);
                        }
                    }
                }
            }

            setPadState({ blank: true, changed: false });
            if (mode === "signature") {
                setSession(null);
            } else {
                openPad();
            }
            const remaining = await load();
            props.onImagesChanged(remaining[0]?.fileName ?? fileName);
            setNotice(
                failed.length
                    ? {
                          intent: "warning",
                          text: `${Noun} saved as ${fileName}, but the earlier image could not be removed: ${failed.join(", ")}.`,
                      }
                    : { intent: "success", text: `${Noun} saved as ${fileName}.` }
            );
        } catch (error) {
            setNotice({ intent: "error", text: `Could not save the ${noun}: ${errorMessage(error)}` });
        } finally {
            setBusy(undefined);
        }
    };

    const remove = async (image: SavedImage) => {
        const ok = await service.confirm(
            `Delete ${noun}?`,
            `"${image.fileName}" will be deleted from this record. This can't be undone.`,
            "Delete"
        );
        if (!ok) return;
        setBusy(`delete:${image.id}`);
        setNotice(undefined);
        try {
            await service.deleteImage(image);
            if (session?.target?.id === image.id) {
                setSession(null);
                if (mode === "drawing") openPad();
            }
            const remaining = await load();
            props.onImagesChanged(remaining[0]?.fileName ?? null);
            setNotice({ intent: "success", text: `${image.fileName} deleted.` });
        } catch (error) {
            setNotice({ intent: "error", text: `Could not delete ${image.fileName}: ${errorMessage(error)}` });
        } finally {
            setBusy(undefined);
        }
    };

    const download = async (image: SavedImage) => {
        setBusy(`download:${image.id}`);
        try {
            await service.downloadImage(image);
        } catch (error) {
            setNotice({ intent: "error", text: `Could not download ${image.fileName}: ${errorMessage(error)}` });
        } finally {
            setBusy(undefined);
        }
    };

    // In signature mode the pad waits for the list, so a saved signature doesn't flash the empty pad first.
    const listReady = images !== undefined || !service.canSave;
    const padVisible = !readOnly && !!session && (mode === "drawing" || listReady);
    const canCancel = !!session?.target || (mode === "signature" && !!images && images.length > 0);
    const saveLabel = session?.target ? "Save changes" : `Save ${noun}`;

    const padActions = (
        <>
            {canCancel && (
                <Button icon={<Dismiss20Regular />} disabled={busy === "save"} onClick={() => void cancel()}>
                    Cancel
                </Button>
            )}
            <Button
                appearance="primary"
                icon={busy === "save" ? <Spinner size="extra-tiny" /> : <Save20Regular />}
                disabled={!!busy || padState.blank || !service.canSave}
                onClick={() => void save()}
            >
                {saveLabel}
            </Button>
        </>
    );

    const showGallery = !!images && images.length > 0 && (mode === "drawing" || !padVisible || readOnly);

    return (
        <div className={styles.root}>
            {notice && (
                <MessageBar intent={notice.intent}>
                    <MessageBarBody>{notice.text}</MessageBarBody>
                </MessageBar>
            )}

            {!readOnly && !service.canSave && (
                <MessageBar intent="info">
                    <MessageBarBody>Save the record first, then save the {noun}.</MessageBarBody>
                </MessageBar>
            )}

            {padVisible && session && (
                <>
                    {session.target && (
                        <Caption1 className={styles.editing}>
                            Editing {session.target.fileName}. Use the eraser to rub out part of it and draw again;
                            saving replaces it.
                        </Caption1>
                    )}
                    <DrawingPad
                        key={session.key}
                        ref={padRef}
                        mode={mode}
                        height={props.padHeight}
                        colors={props.colors}
                        initialColor={props.initialColor}
                        penWidth={props.penWidth}
                        baseImage={session.base}
                        disabled={busy === "save"}
                        onStateChange={setPadState}
                        onError={(text) => setNotice({ intent: "error", text })}
                        actions={padActions}
                    />
                    {props.noteMode !== "off" && (
                        <Field label={`Note about this ${noun}`} required={props.noteMode === "required"}>
                            <Input
                                value={noteText}
                                maxLength={NOTE_MAX_LENGTH}
                                disabled={busy === "save"}
                                placeholder={
                                    mode === "signature"
                                        ? "For example: John Smith, site manager"
                                        : "For example: First floor, kitchen table"
                                }
                                onChange={(_, data) => setNoteText(data.value)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter" && !busy && !padState.blank && service.canSave) void save();
                                }}
                            />
                        </Field>
                    )}
                </>
            )}

            {!images && service.canSave && <Spinner size="tiny" label={`Loading saved ${noun}...`} />}

            {showGallery && images && (
                <div className={styles.gallery}>
                    <div className={styles.galleryHeader}>
                        <Subtitle2>
                            {mode === "signature"
                                ? images.length > 1
                                    ? `Saved signatures (${images.length})`
                                    : "Saved signature"
                                : `Saved drawings (${images.length})`}
                        </Subtitle2>
                        {mode === "signature" && !readOnly && !padVisible && (
                            <Button size="small" icon={<Add20Regular />} disabled={!!busy} onClick={() => void startNew()}>
                                Sign again
                            </Button>
                        )}
                    </div>
                    <div className={mode === "drawing" ? styles.grid : styles.list}>
                        {images.map((image) => (
                            <ImageCard
                                key={image.id}
                                image={image}
                                preview={previews.current.get(imageKey(image))}
                                failed={failedPreviews.current.has(imageKey(image))}
                                height={mode === "signature" ? Math.min(props.padHeight, 220) : 160}
                                editing={session?.target?.id === image.id}
                                busy={busy}
                                canEdit={!readOnly}
                                canDelete={!readOnly && props.allowDelete}
                                formatDate={props.formatDate}
                                onEdit={() => void edit(image)}
                                onDownload={() => void download(image)}
                                onDelete={() => void remove(image)}
                            />
                        ))}
                    </div>
                </div>
            )}

            {readOnly && images && images.length === 0 && (
                <Text className={styles.empty}>No {noun} has been added.</Text>
            )}
        </div>
    );
}

interface ImageCardProps {
    image: SavedImage;
    preview?: Preview;
    failed: boolean;
    height: number;
    editing: boolean;
    busy?: string;
    canEdit: boolean;
    canDelete: boolean;
    formatDate: (date: Date) => string;
    onEdit: () => void;
    onDownload: () => void;
    onDelete: () => void;
}

function ImageCard(props: ImageCardProps): React.ReactElement {
    const { image, preview, busy } = props;
    const styles = useStyles();
    const [naturalWidth, setNaturalWidth] = React.useState<number>();
    const meta = [
        image.modifiedOn ? props.formatDate(image.modifiedOn) : undefined,
        image.modifiedBy,
        formatBytes(image.fileSize),
    ]
        .filter(Boolean)
        .join(" · ");
    const spinnerOr = (action: string, icon: React.ReactElement) =>
        busy === `${action}:${image.id}` ? <Spinner size="extra-tiny" /> : icon;

    return (
        <div className={mergeClasses(styles.card, props.editing && styles.cardEditing)}>
            <div className={styles.picture} style={{ height: props.height }}>
                {preview ? (
                    <img
                        className={styles.image}
                        src={preview.url}
                        alt={image.note ?? image.fileName}
                        // Saved at 2x: show at the size it was drawn, smaller only if it doesn't fit.
                        style={naturalWidth ? { width: naturalWidth / IMAGE_SCALE } : undefined}
                        onLoad={(e) => setNaturalWidth(e.currentTarget.naturalWidth)}
                    />
                ) : props.failed ? (
                    <Caption1 className={styles.pictureNote}>Preview not available</Caption1>
                ) : (
                    <Spinner size="tiny" />
                )}
            </div>
            <div className={styles.cardFooter}>
                <div className={styles.cardText}>
                    {/* The user's note names the picture; the file name moves to the second line. */}
                    <Text weight="semibold" className={styles.fileName} title={image.note ?? image.fileName}>
                        {image.note ?? image.fileName}
                    </Text>
                    {image.note && (
                        <Caption1 className={mergeClasses(styles.meta, styles.fileName)} title={image.fileName}>
                            {image.fileName}
                        </Caption1>
                    )}
                    <Caption1 className={styles.meta}>{props.editing ? "Open on the pad" : meta}</Caption1>
                </div>
                <div className={styles.cardActions}>
                    {props.canEdit && (
                        <Tooltip content="Edit: change it on the pad" relationship="label" withArrow>
                            <Button
                                appearance="subtle"
                                icon={spinnerOr("edit", <Edit20Regular />)}
                                disabled={!!busy || props.editing}
                                onClick={props.onEdit}
                            />
                        </Tooltip>
                    )}
                    <Tooltip content="Download" relationship="label" withArrow>
                        <Button
                            appearance="subtle"
                            icon={spinnerOr("download", <ArrowDownload20Regular />)}
                            disabled={!!busy}
                            onClick={props.onDownload}
                        />
                    </Tooltip>
                    {props.canDelete && (
                        <Tooltip content="Delete" relationship="label" withArrow>
                            <Button
                                appearance="subtle"
                                icon={spinnerOr("delete", <Delete20Regular />)}
                                disabled={!!busy}
                                onClick={props.onDelete}
                            />
                        </Tooltip>
                    )}
                </div>
            </div>
        </div>
    );
}

/** Latest saved or edited first. Same second: the later-created one, then the higher "(n)" name. */
function newestFirst(a: SavedImage, b: SavedImage): number {
    return (
        (b.modifiedOn?.getTime() ?? 0) - (a.modifiedOn?.getTime() ?? 0) ||
        (b.createdOn?.getTime() ?? 0) - (a.createdOn?.getTime() ?? 0) ||
        b.fileName.localeCompare(a.fileName, undefined, { numeric: true })
    );
}

function imageKey(image: SavedImage): string {
    return `${image.id}|${image.modifiedOn?.getTime() ?? ""}|${image.fileSize}`;
}

/** "Drawing.png" -> "Drawing (2).png" when the name is taken. */
function uniqueName(fileName: string, taken: string[]): string {
    const lower = new Set(taken.map((t) => t.toLowerCase()));
    if (!lower.has(fileName.toLowerCase())) return fileName;
    const stem = fileName.replace(/\.png$/i, "");
    for (let n = 2; ; n++) {
        const candidate = `${stem} (${n}).png`;
        if (!lower.has(candidate.toLowerCase())) return candidate;
    }
}
