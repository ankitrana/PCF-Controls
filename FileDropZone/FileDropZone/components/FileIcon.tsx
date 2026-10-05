import * as React from "react";
import {
    Document20Regular,
    DocumentPdf20Regular,
    DocumentTable20Regular,
    FolderZip20Regular,
    Image20Regular,
    Video20Regular,
} from "@fluentui/react-icons";
import { getExtension } from "../services/fileUtils";

export const FileIcon: React.FC<{ fileName: string; mimeType?: string }> = ({ fileName, mimeType }) => {
    const ext = getExtension(fileName);
    const mime = mimeType ?? "";
    if (mime.startsWith("image/")) return <Image20Regular />;
    if (mime.startsWith("video/")) return <Video20Regular />;
    if (ext === ".pdf") return <DocumentPdf20Regular />;
    if ([".xls", ".xlsx", ".csv"].includes(ext)) return <DocumentTable20Regular />;
    if ([".zip", ".7z", ".rar"].includes(ext)) return <FolderZip20Regular />;
    return <Document20Regular />;
};
