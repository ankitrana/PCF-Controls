import * as React from "react";
import {
    Button,
    Dialog,
    DialogActions,
    DialogBody,
    DialogContent,
    DialogSurface,
    DialogTitle,
    MessageBar,
    MessageBarBody,
    Spinner,
    makeStyles,
    tokens,
} from "@fluentui/react-components";
import { ArrowDownload20Regular, Dismiss20Regular } from "@fluentui/react-icons";
import { AttachmentInfo } from "../services/INotesService";
import { PreviewKind, errorMessage, formatBytes, getPreviewKind } from "../services/fileUtils";

/** Text files larger than this are cut off in the preview. */
const MAX_TEXT_CHARS = 200_000;

const useStyles = makeStyles({
    surface: { maxWidth: "min(960px, 95vw)", width: "100%" },
    title: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
    frame: {
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "200px",
        height: "70vh",
        backgroundColor: tokens.colorNeutralBackground3,
        borderRadius: tokens.borderRadiusMedium,
        overflow: "auto",
    },
    image: { maxWidth: "100%", maxHeight: "100%", objectFit: "contain" },
    pdf: { width: "100%", height: "100%", border: "none" },
    text: {
        alignSelf: "stretch",
        width: "100%",
        margin: 0,
        padding: tokens.spacingHorizontalM,
        boxSizing: "border-box",
        fontFamily: tokens.fontFamilyMonospace,
        fontSize: tokens.fontSizeBase200,
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
        color: tokens.colorNeutralForeground1,
    },
    note: { color: tokens.colorNeutralForeground3 },
});

export interface AttachmentPreviewProps {
    attachment?: AttachmentInfo;
    load: (attachment: AttachmentInfo) => Promise<Blob>;
    onDownload: (attachment: AttachmentInfo) => void;
    onClose: () => void;
}

interface Loaded {
    kind: PreviewKind;
    url?: string;
    text?: string;
    truncated?: boolean;
}

/** Shows an image, PDF or text attachment in a dialog without downloading it. */
export const AttachmentPreview: React.FC<AttachmentPreviewProps> = ({ attachment, load, onDownload, onClose }) => {
    const styles = useStyles();
    const [loaded, setLoaded] = React.useState<Loaded>();
    const [error, setError] = React.useState<string>();

    React.useEffect(() => {
        setLoaded(undefined);
        setError(undefined);
        if (!attachment) return;
        const kind = getPreviewKind(attachment.fileName, attachment.mimeType);
        if (!kind) return;
        let cancelled = false;
        let url: string | undefined;
        load(attachment)
            .then(async (blob) => {
                if (cancelled) return;
                if (kind === "text") {
                    const text = await blob.text();
                    if (cancelled) return;
                    setLoaded({
                        kind,
                        text: text.slice(0, MAX_TEXT_CHARS),
                        truncated: text.length > MAX_TEXT_CHARS,
                    });
                } else {
                    // Give PDFs the right type so the browser's viewer opens them.
                    const typed = kind === "pdf" ? new Blob([blob], { type: "application/pdf" }) : blob;
                    url = URL.createObjectURL(typed);
                    setLoaded({ kind, url });
                }
            })
            .catch((e) => {
                if (!cancelled) setError(errorMessage(e));
            });
        return () => {
            cancelled = true;
            if (url) URL.revokeObjectURL(url);
        };
    }, [attachment, load]);

    if (!attachment) return null;

    return (
        <Dialog open onOpenChange={(_, data) => !data.open && onClose()}>
            <DialogSurface className={styles.surface}>
                <DialogBody>
                    <DialogTitle
                        className={styles.title}
                        action={
                            <Button
                                appearance="subtle"
                                aria-label="Close"
                                icon={<Dismiss20Regular />}
                                onClick={onClose}
                            />
                        }
                    >
                        {attachment.fileName}
                    </DialogTitle>
                    <DialogContent>
                        {error ? (
                            <MessageBar intent="error">
                                <MessageBarBody>Could not load the preview: {error}</MessageBarBody>
                            </MessageBar>
                        ) : (
                            <div className={styles.frame}>
                                {!loaded && <Spinner label={`Loading ${formatBytes(attachment.fileSize)}...`} />}
                                {loaded?.kind === "image" && (
                                    <img className={styles.image} src={loaded.url} alt={attachment.fileName} />
                                )}
                                {loaded?.kind === "pdf" && (
                                    <iframe className={styles.pdf} src={loaded.url} title={attachment.fileName} />
                                )}
                                {loaded?.kind === "text" && <pre className={styles.text}>{loaded.text}</pre>}
                            </div>
                        )}
                        {loaded?.truncated && (
                            <span className={styles.note}>Only the start of this file is shown. Download it to see all of it.</span>
                        )}
                    </DialogContent>
                    <DialogActions>
                        <Button
                            appearance="primary"
                            icon={<ArrowDownload20Regular />}
                            onClick={() => onDownload(attachment)}
                        >
                            Download
                        </Button>
                        <Button appearance="secondary" onClick={onClose}>
                            Close
                        </Button>
                    </DialogActions>
                </DialogBody>
            </DialogSurface>
        </Dialog>
    );
};
