import { AttachmentInfo, INotesService, OrgLimits, UploadOptions } from "./INotesService";
import {
    base64ToBlob,
    downloadBase64,
    newGuid,
    parseExtensions,
    parseMimeTypes,
    readAsBase64,
    throwIfAborted,
} from "./fileUtils";

const FORMATTED = "@OData.Community.Display.V1.FormattedValue";

/** Files up to this size go in one createRecord call; larger ones are sent in blocks. */
const SINGLE_REQUEST_MAX_BYTES = 4 * 1024 * 1024;
/** Block size for InitializeAnnotationBlocksUpload / UploadBlock (the platform maximum). */
const BLOCK_BYTES = 4 * 1024 * 1024;

/** Stores files as Note (annotation) attachments on the record the form is showing. */
export class DataverseNotesService implements INotesService {
    private entitySetName?: string;
    private limits?: Promise<OrgLimits>;

    constructor(
        private readonly webAPI: ComponentFramework.WebApi,
        private readonly utils: ComponentFramework.Utility,
        private readonly navigation: ComponentFramework.Navigation,
        private readonly entityName: string,
        private readonly recordId: string,
        private readonly clientUrl: string
    ) {}

    get canUpload(): boolean {
        return !!this.entityName && !!this.recordId;
    }

    /**
     * Reads the environment's attachment rules (once per record) so the control accepts exactly
     * what Dataverse accepts: size limit, blocked extensions and blocked/allowed MIME types.
     */
    getLimits(): Promise<OrgLimits> {
        const read = (columns: string) =>
            this.webAPI.retrieveMultipleRecords("organization", `?$select=${columns}`).then((r) => r.entities[0] ?? {});
        this.limits ??= read("maxuploadfilesize,blockedattachments,blockedmimetypes,allowedmimetypes")
            // Older environments without the MIME columns: read the rest.
            .catch(() => read("maxuploadfilesize,blockedattachments"))
            .then((org) => {
                const maxBase64 = org.maxuploadfilesize as number | undefined;
                return {
                    // The limit applies to the base64 text, which is 4/3 the size of the file.
                    maxFileBytes: maxBase64 ? Math.floor((maxBase64 * 3) / 4) : undefined,
                    blockedExtensions: parseExtensions(org.blockedattachments as string | undefined),
                    blockedMimeTypes: parseMimeTypes(org.blockedmimetypes as string | undefined),
                    allowedMimeTypes: parseMimeTypes(org.allowedmimetypes as string | undefined),
                };
            })
            // Users who can't read the organization row still get the control's own checks.
            .catch(() => ({ blockedExtensions: [] }));
        return this.limits;
    }

    async listAttachments(): Promise<AttachmentInfo[]> {
        if (!this.canUpload) return [];
        const query =
            "?$select=annotationid,filename,filesize,mimetype,createdon,_createdby_value" +
            `&$filter=_objectid_value eq ${this.recordId} and isdocument eq true` +
            "&$orderby=createdon desc";
        const result = await this.webAPI.retrieveMultipleRecords("annotation", query);
        return result.entities.map((e) => ({
            id: e.annotationid as string,
            fileName: (e.filename as string) || "(no name)",
            fileSize: (e.filesize as number) ?? 0,
            mimeType: (e.mimetype as string) || "application/octet-stream",
            createdOn: e.createdon ? new Date(e.createdon as string) : undefined,
            createdBy: e[`_createdby_value${FORMATTED}`] as string | undefined,
        }));
    }

    async uploadFile(file: File, subject: string, options: UploadOptions = {}): Promise<void> {
        if (!this.canUpload) throw new Error("Save the record before adding files.");
        throwIfAborted(options.signal);
        const entitySet = await this.getEntitySetName();
        const note = {
            subject: subject || file.name,
            filename: file.name,
            mimetype: file.type || "application/octet-stream",
        };

        if (file.size <= SINGLE_REQUEST_MAX_BYTES) {
            const documentbody = await readAsBase64(file);
            throwIfAborted(options.signal);
            await this.webAPI.createRecord("annotation", {
                ...note,
                documentbody,
                [`objectid_${this.entityName}@odata.bind`]: `/${entitySet}(${this.recordId})`,
            });
            return;
        }

        // Large file: send it in blocks so memory stays low and progress can be shown.
        const target = {
            ...note,
            annotationid: newGuid(),
            objecttypecode: this.entityName,
            [`objectid_${this.entityName}@odata.bind`]: `${entitySet}(${this.recordId})`,
            "@odata.type": "Microsoft.Dynamics.CRM.annotation",
        };
        const { FileContinuationToken } = await this.callAction<{ FileContinuationToken: string }>(
            "InitializeAnnotationBlocksUpload",
            { Target: target },
            options.signal
        );
        const blockIds: string[] = [];
        for (let offset = 0, index = 0; offset < file.size; offset += BLOCK_BYTES, index++) {
            throwIfAborted(options.signal);
            // Block ids must all be the same length.
            const blockId = btoa(`block-${String(index).padStart(6, "0")}`);
            const blockData = await readAsBase64(file.slice(offset, offset + BLOCK_BYTES));
            await this.callAction(
                "UploadBlock",
                { BlockId: blockId, BlockData: blockData, FileContinuationToken },
                options.signal
            );
            blockIds.push(blockId);
            options.onProgress?.(Math.min(1, (offset + BLOCK_BYTES) / file.size));
        }
        await this.callAction(
            "CommitAnnotationBlocksUpload",
            { Target: target, BlockList: blockIds, FileContinuationToken },
            options.signal
        );
    }

    async getContent(attachment: AttachmentInfo): Promise<Blob> {
        const note = await this.webAPI.retrieveRecord("annotation", attachment.id, "?$select=documentbody,mimetype");
        return base64ToBlob(note.documentbody as string, (note.mimetype as string) || attachment.mimeType);
    }

    async downloadAttachment(attachment: AttachmentInfo): Promise<void> {
        const note = await this.webAPI.retrieveRecord(
            "annotation",
            attachment.id,
            "?$select=documentbody,filename,mimetype,filesize"
        );
        const fileContent = note.documentbody as string;
        const fileName = (note.filename as string) || attachment.fileName;
        const mimeType = (note.mimetype as string) || attachment.mimeType;
        try {
            await this.navigation.openFile(
                { fileContent, fileName, mimeType, fileSize: Math.ceil(((note.filesize as number) ?? 0) / 1024) },
                { openMode: 2 }
            );
        } catch {
            downloadBase64(fileContent, fileName, mimeType);
        }
    }

    async deleteAttachment(attachment: AttachmentInfo): Promise<void> {
        await this.webAPI.deleteRecord("annotation", attachment.id);
    }

    async confirm(title: string, text: string): Promise<boolean> {
        const response = await this.navigation.openConfirmDialog(
            { title, text, confirmButtonLabel: "Delete", cancelButtonLabel: "Cancel" },
            { height: 200, width: 450 }
        );
        return response.confirmed;
    }

    private async getEntitySetName(): Promise<string> {
        if (!this.entitySetName) {
            const metadata = await this.utils.getEntityMetadata(this.entityName);
            this.entitySetName = metadata.EntitySetName as string;
        }
        return this.entitySetName;
    }

    /** Calls an unbound Web API action. context.webAPI has no way to call actions, so this uses fetch. */
    private async callAction<T = unknown>(name: string, body: unknown, signal?: AbortSignal): Promise<T> {
        const response = await fetch(`${this.clientUrl}/api/data/v9.2/${name}`, {
            method: "POST",
            credentials: "same-origin",
            headers: {
                Accept: "application/json",
                "Content-Type": "application/json; charset=utf-8",
                "OData-MaxVersion": "4.0",
                "OData-Version": "4.0",
            },
            body: JSON.stringify(body),
            signal,
        });
        if (!response.ok) {
            let message = `${name} failed (${response.status}).`;
            try {
                const json = (await response.json()) as { error?: { message?: string } };
                if (json.error?.message) message = json.error.message;
            } catch {
                // Keep the status message.
            }
            throw new Error(message);
        }
        return (response.status === 204 ? {} : await response.json()) as T;
    }
}
