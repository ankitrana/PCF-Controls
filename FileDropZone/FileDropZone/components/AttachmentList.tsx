import * as React from "react";
import {
    Button,
    Caption1,
    Link,
    Spinner,
    Text,
    Tooltip,
    makeStyles,
    tokens,
} from "@fluentui/react-components";
import { ArrowDownload20Regular, Delete20Regular, Eye20Regular } from "@fluentui/react-icons";
import { AttachmentInfo } from "../services/INotesService";
import { formatBytes, getPreviewKind } from "../services/fileUtils";
import { FileIcon } from "./FileIcon";

const useStyles = makeStyles({
    list: {
        listStyleType: "none",
        margin: 0,
        padding: 0,
        display: "flex",
        flexDirection: "column",
    },
    row: {
        display: "flex",
        alignItems: "center",
        gap: tokens.spacingHorizontalS,
        paddingTop: tokens.spacingVerticalXS,
        paddingBottom: tokens.spacingVerticalXS,
        paddingLeft: tokens.spacingHorizontalXS,
        borderRadius: tokens.borderRadiusMedium,
        ":hover": { backgroundColor: tokens.colorNeutralBackground1Hover },
    },
    icon: {
        color: tokens.colorNeutralForeground3,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        width: "32px",
        height: "32px",
    },
    thumb: {
        width: "32px",
        height: "32px",
        objectFit: "cover",
        borderRadius: tokens.borderRadiusMedium,
        boxShadow: tokens.shadow2,
    },
    text: { display: "flex", flexDirection: "column", minWidth: 0, flexGrow: 1 },
    name: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: "left" },
    meta: { color: tokens.colorNeutralForeground3 },
    empty: { color: tokens.colorNeutralForeground3, paddingTop: tokens.spacingVerticalXS },
});

export interface AttachmentListProps {
    attachments: AttachmentInfo[];
    loading: boolean;
    busyIds: Set<string>;
    allowDelete: boolean;
    /** Thumbnail object URLs by attachment id. */
    thumbnails: Record<string, string>;
    formatDate: (date: Date) => string;
    onPreview: (attachment: AttachmentInfo) => void;
    onDownload: (attachment: AttachmentInfo) => void;
    onDelete: (attachment: AttachmentInfo) => void;
}

export const AttachmentList: React.FC<AttachmentListProps> = (props) => {
    const styles = useStyles();
    const { attachments, loading, busyIds } = props;

    if (loading && attachments.length === 0) {
        return <Spinner size="tiny" label="Loading attachments..." labelPosition="after" />;
    }
    if (attachments.length === 0) {
        return <Caption1 className={styles.empty}>No attachments yet.</Caption1>;
    }

    return (
        <ul className={styles.list}>
            {attachments.map((a) => {
                const busy = busyIds.has(a.id);
                const canPreview = !!getPreviewKind(a.fileName, a.mimeType);
                const thumbnail = props.thumbnails[a.id];
                const meta = [formatBytes(a.fileSize), a.createdOn && props.formatDate(a.createdOn), a.createdBy]
                    .filter(Boolean)
                    .join(" · ");
                return (
                    <li key={a.id} className={styles.row}>
                        <span className={styles.icon}>
                            {thumbnail ? (
                                <img className={styles.thumb} src={thumbnail} alt="" />
                            ) : (
                                <FileIcon fileName={a.fileName} mimeType={a.mimeType} />
                            )}
                        </span>
                        <span className={styles.text}>
                            <Link
                                className={styles.name}
                                title={canPreview ? `Preview ${a.fileName}` : `Download ${a.fileName}`}
                                disabled={busy}
                                onClick={() => (canPreview ? props.onPreview(a) : props.onDownload(a))}
                            >
                                {a.fileName}
                            </Link>
                            <Caption1 className={styles.meta}>{meta}</Caption1>
                        </span>
                        {busy ? (
                            <Spinner size="extra-tiny" />
                        ) : (
                            <>
                                {canPreview && (
                                    <Tooltip content="Preview" relationship="label">
                                        <Button
                                            appearance="subtle"
                                            size="small"
                                            icon={<Eye20Regular />}
                                            onClick={() => props.onPreview(a)}
                                        />
                                    </Tooltip>
                                )}
                                <Tooltip content="Download" relationship="label">
                                    <Button
                                        appearance="subtle"
                                        size="small"
                                        icon={<ArrowDownload20Regular />}
                                        onClick={() => props.onDownload(a)}
                                    />
                                </Tooltip>
                                {props.allowDelete && (
                                    <Tooltip content="Delete" relationship="label">
                                        <Button
                                            appearance="subtle"
                                            size="small"
                                            icon={<Delete20Regular />}
                                            onClick={() => props.onDelete(a)}
                                        />
                                    </Tooltip>
                                )}
                            </>
                        )}
                    </li>
                );
            })}
            {loading && (
                <li>
                    <Text size={200}>
                        <Spinner size="extra-tiny" label="Refreshing..." labelPosition="after" />
                    </Text>
                </li>
            )}
        </ul>
    );
};
