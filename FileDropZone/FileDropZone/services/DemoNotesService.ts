import { AttachmentInfo, INotesService, OrgLimits, UploadOptions } from "./INotesService";
import { parseExtensions, saveBlob, throwIfAborted } from "./fileUtils";

const DEMO_BLOCK_BYTES = 4 * 1024 * 1024;

/** Dataverse's default "blocked file extensions for attachments" (organization.blockedattachments). */
const DEFAULT_BLOCKED_EXTENSIONS =
    "ade;adp;app;asa;ashx;asmx;asp;bas;bat;cdx;cer;chm;class;cmd;com;config;cpl;crt;csh;dll;exe;fxp;hlp;hta;" +
    "htr;htw;ida;idc;idq;inf;ins;isp;its;jar;js;jse;ksh;lnk;mad;maf;mag;mam;maq;mar;mas;mat;mau;mav;maw;mda;" +
    "mdb;mde;mdt;mdw;mdz;msc;msh;msh1;msh1xml;msh2;msh2xml;mshxml;msi;msp;mst;ops;pcd;pif;prf;prg;printer;pst;" +
    "reg;rem;scf;scr;sct;shb;shs;shtm;shtml;soap;stm;tmp;url;vb;vbe;vbs;vsmacros;vss;vst;vsw;ws;wsc;wsf;wsh;svg";

/**
 * In-memory service used only in the local test harness (npm start), where there is no
 * Dataverse record or WebAPI. Lets the full UI be exercised without an environment.
 */
export class DemoNotesService implements INotesService {
    readonly canUpload = true;
    private files: (AttachmentInfo & { blob: Blob })[] = [
        {
            id: "demo-1",
            fileName: "Signed contract.pdf",
            fileSize: 248_320,
            mimeType: "application/pdf",
            createdOn: new Date(Date.now() - 3 * 86_400_000),
            createdBy: "Demo User",
            blob: new Blob([DEMO_PDF], { type: "application/pdf" }),
        },
        {
            id: "demo-2",
            fileName: "Site photo.jpg",
            fileSize: 1_843_200,
            mimeType: "image/jpeg",
            createdOn: new Date(Date.now() - 86_400_000),
            createdBy: "Demo User",
            // Replaced with a real JPEG on first download (canvas encoding is async).
            blob: new Blob([], { type: "image/jpeg" }),
        },
    ];

    /** Microsoft's default blocked extensions, with a 25 MB limit so block uploads can be tried. */
    async getLimits(): Promise<OrgLimits> {
        await delay(100);
        return {
            maxFileBytes: Math.floor((26_214_400 * 3) / 4),
            blockedExtensions: parseExtensions(DEFAULT_BLOCKED_EXTENSIONS),
            blockedMimeTypes: [],
            allowedMimeTypes: [],
        };
    }

    async listAttachments(): Promise<AttachmentInfo[]> {
        await delay(300);
        return [...this.files].sort((a, b) => (b.createdOn?.getTime() ?? 0) - (a.createdOn?.getTime() ?? 0));
    }

    async uploadFile(file: File, subject: string, options: UploadOptions = {}): Promise<void> {
        if (file.size <= DEMO_BLOCK_BYTES) {
            await delay(700 + Math.random() * 1200);
        } else {
            // Mirrors the real service: large files go in 4 MB blocks with progress.
            for (let sent = 0; sent < file.size; sent += DEMO_BLOCK_BYTES) {
                throwIfAborted(options.signal);
                await delay(600);
                options.onProgress?.(Math.min(1, (sent + DEMO_BLOCK_BYTES) / file.size));
            }
        }
        throwIfAborted(options.signal);
        if (file.name.toLowerCase().includes("fail")) {
            throw new Error("Simulated server error (file name contains 'fail').");
        }
        this.files.push({
            id: `demo-${Date.now()}-${Math.random()}`,
            fileName: file.name,
            fileSize: file.size,
            mimeType: file.type,
            createdOn: new Date(),
            createdBy: "Demo User",
            blob: file,
        });
    }

    async getContent(attachment: AttachmentInfo): Promise<Blob> {
        await delay(250);
        const file = this.files.find((f) => f.id === attachment.id);
        if (!file) throw new Error("The file no longer exists.");
        if (file.blob.size === 0 && file.mimeType === "image/jpeg") {
            file.blob = await makeDemoJpeg(file.fileName);
        }
        return file.blob;
    }

    async downloadAttachment(attachment: AttachmentInfo): Promise<void> {
        saveBlob(await this.getContent(attachment), attachment.fileName);
    }

    async deleteAttachment(attachment: AttachmentInfo): Promise<void> {
        await delay(300);
        this.files = this.files.filter((f) => f.id !== attachment.id);
    }

    async confirm(title: string, text: string): Promise<boolean> {
        return window.confirm(`${title}\n\n${text}`);
    }
}

/** One-page PDF so the seeded "contract" opens in a viewer. Viewers rebuild the xref table. */
const DEMO_PDF = [
    "%PDF-1.4",
    "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj",
    "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj",
    "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R",
    "/Resources << /Font << /F1 5 0 R >> >> >> endobj",
    "4 0 obj << /Length 66 >> stream",
    "BT /F1 24 Tf 72 760 Td (FileDropZone demo attachment) Tj ET",
    "endstream endobj",
    "5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj",
    "trailer << /Root 1 0 R >>",
    "%%EOF",
].join("\n");

/** Draws a placeholder picture so the seeded "photo" opens in an image viewer. */
function makeDemoJpeg(label: string): Promise<Blob> {
    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = 400;
    const ctx = canvas.getContext("2d");
    if (ctx) {
        const gradient = ctx.createLinearGradient(0, 0, 640, 400);
        gradient.addColorStop(0, "#0f6cbd");
        gradient.addColorStop(1, "#5ec2a6");
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 640, 400);
        ctx.fillStyle = "#ffffff";
        ctx.font = "28px Segoe UI, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(`${label} (demo)`, 320, 210);
    }
    return new Promise((resolve) =>
        canvas.toBlob((blob) => resolve(blob ?? new Blob([], { type: "image/jpeg" })), "image/jpeg", 0.85)
    );
}

function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
