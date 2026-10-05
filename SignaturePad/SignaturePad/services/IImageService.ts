/** A picture this control saved as a Note attachment. */
export interface SavedImage {
    id: string;
    fileName: string;
    /** The user's short note about the picture (the Note's description), e.g. "First floor". */
    note?: string;
    /** Size in bytes. */
    fileSize: number;
    createdOn?: Date;
    modifiedOn?: Date;
    modifiedBy?: string;
}

export interface IImageService {
    /** True when images can be saved (the record exists). */
    readonly canSave: boolean;
    /** PNG Notes on the record whose file name starts with the given name. Newest first. */
    listImages(namePrefix: string): Promise<SavedImage[]>;
    getContent(image: SavedImage): Promise<Blob>;
    /** Creates a Note with the PNG and returns its id. */
    createImage(fileName: string, subject: string, note: string, png: Blob): Promise<string>;
    /** Replaces the picture, file name and note of an existing Note. */
    updateImage(image: SavedImage, fileName: string, note: string, png: Blob): Promise<void>;
    deleteImage(image: SavedImage): Promise<void>;
    downloadImage(image: SavedImage): Promise<void>;
    confirm(title: string, text: string, confirmLabel: string): Promise<boolean>;
}
