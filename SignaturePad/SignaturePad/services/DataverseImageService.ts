import { IImageService, SavedImage } from "./IImageService";
import { base64ToBlob, readAsBase64, saveBlob } from "./imageUtils";

const FORMATTED = "@OData.Community.Display.V1.FormattedValue";
const PNG = "image/png";

/** Stores pictures as Note (annotation) attachments on the record the form is showing. */
export class DataverseImageService implements IImageService {
    private entitySetName?: string;

    constructor(
        private readonly webAPI: ComponentFramework.WebApi,
        private readonly utils: ComponentFramework.Utility,
        private readonly navigation: ComponentFramework.Navigation,
        private readonly entityName: string,
        private readonly recordId: string
    ) {}

    get canSave(): boolean {
        return !!this.entityName && !!this.recordId;
    }

    async listImages(namePrefix: string): Promise<SavedImage[]> {
        if (!this.canSave) return [];
        const literal = encodeURIComponent(namePrefix.replace(/'/g, "''"));
        const query =
            "?$select=annotationid,filename,notetext,filesize,createdon,modifiedon,_modifiedby_value" +
            `&$filter=_objectid_value eq ${this.recordId} and isdocument eq true and startswith(filename,'${literal}')` +
            "&$orderby=modifiedon desc,createdon desc";
        const result = await this.webAPI.retrieveMultipleRecords("annotation", query);
        return result.entities.map((e) => ({
            id: e.annotationid as string,
            fileName: (e.filename as string) || "",
            note: (e.notetext as string) || undefined,
            fileSize: (e.filesize as number) ?? 0,
            createdOn: e.createdon ? new Date(e.createdon as string) : undefined,
            modifiedOn: e.modifiedon ? new Date(e.modifiedon as string) : undefined,
            modifiedBy: e[`_modifiedby_value${FORMATTED}`] as string | undefined,
        }));
    }

    async getContent(image: SavedImage): Promise<Blob> {
        const note = await this.webAPI.retrieveRecord("annotation", image.id, "?$select=documentbody,mimetype");
        return base64ToBlob(note.documentbody as string, (note.mimetype as string) || PNG);
    }

    async createImage(fileName: string, subject: string, note: string, png: Blob): Promise<string> {
        if (!this.canSave) throw new Error("Save the record first.");
        const entitySet = await this.getEntitySetName();
        const result = await this.webAPI.createRecord("annotation", {
            subject,
            notetext: note || null,
            filename: fileName,
            mimetype: PNG,
            documentbody: await readAsBase64(png),
            [`objectid_${this.entityName}@odata.bind`]: `/${entitySet}(${this.recordId})`,
        });
        return result.id;
    }

    async updateImage(image: SavedImage, fileName: string, note: string, png: Blob): Promise<void> {
        await this.webAPI.updateRecord("annotation", image.id, {
            filename: fileName,
            notetext: note || null,
            mimetype: PNG,
            documentbody: await readAsBase64(png),
        });
    }

    async deleteImage(image: SavedImage): Promise<void> {
        await this.webAPI.deleteRecord("annotation", image.id);
    }

    async downloadImage(image: SavedImage): Promise<void> {
        const note = await this.webAPI.retrieveRecord("annotation", image.id, "?$select=documentbody,filesize");
        const fileContent = note.documentbody as string;
        try {
            await this.navigation.openFile(
                {
                    fileContent,
                    fileName: image.fileName,
                    mimeType: PNG,
                    fileSize: Math.ceil(((note.filesize as number) ?? 0) / 1024),
                },
                { openMode: 2 }
            );
        } catch {
            saveBlob(base64ToBlob(fileContent, PNG), image.fileName);
        }
    }

    async confirm(title: string, text: string, confirmLabel: string): Promise<boolean> {
        const response = await this.navigation.openConfirmDialog(
            { title, text, confirmButtonLabel: confirmLabel, cancelButtonLabel: "Cancel" },
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
}
