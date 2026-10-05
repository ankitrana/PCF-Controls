import { IImageService, SavedImage } from "./IImageService";
import { saveBlob } from "./imageUtils";

/**
 * In-memory service used only in the local test harness (npm start), where there is no
 * Dataverse record or WebAPI. Starts empty so the pad shows first.
 */
export class DemoImageService implements IImageService {
    readonly canSave = true;
    private images: (SavedImage & { blob: Blob })[] = [];

    async listImages(namePrefix: string): Promise<SavedImage[]> {
        await delay(250);
        const prefix = namePrefix.toLowerCase();
        return this.images
            .filter((i) => i.fileName.toLowerCase().startsWith(prefix))
            .sort((a, b) => (b.modifiedOn?.getTime() ?? 0) - (a.modifiedOn?.getTime() ?? 0))
            .map(({ blob, ...image }) => image);
    }

    async getContent(image: SavedImage): Promise<Blob> {
        await delay(150);
        const found = this.images.find((i) => i.id === image.id);
        if (!found) throw new Error("The image no longer exists.");
        return found.blob;
    }

    async createImage(fileName: string, subject: string, note: string, png: Blob): Promise<string> {
        await delay(600);
        const id = `demo-${Date.now()}-${Math.random()}`;
        const now = new Date();
        this.images.push({
            id,
            fileName,
            note: note || undefined,
            fileSize: png.size,
            createdOn: now,
            modifiedOn: now,
            modifiedBy: "Demo User",
            blob: png,
        });
        return id;
    }

    async updateImage(image: SavedImage, fileName: string, note: string, png: Blob): Promise<void> {
        await delay(600);
        const found = this.images.find((i) => i.id === image.id);
        if (!found) throw new Error("The image no longer exists.");
        Object.assign(found, { fileName, note: note || undefined, fileSize: png.size, modifiedOn: new Date(), blob: png });
    }

    async deleteImage(image: SavedImage): Promise<void> {
        await delay(300);
        this.images = this.images.filter((i) => i.id !== image.id);
    }

    async downloadImage(image: SavedImage): Promise<void> {
        saveBlob(await this.getContent(image), image.fileName);
    }

    async confirm(title: string, text: string): Promise<boolean> {
        return window.confirm(`${title}\n\n${text}`);
    }
}

function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
