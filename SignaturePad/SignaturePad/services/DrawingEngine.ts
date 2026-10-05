export type Tool = "pen" | "eraser";

/** A point in CSS pixels, with the line width wanted at that point. */
interface Point {
    x: number;
    y: number;
    w: number;
}

interface Stroke {
    kind: "stroke";
    tool: Tool;
    color: string;
    points: Point[];
}

interface ClearAll {
    kind: "clear";
}

type Action = Stroke | ClearAll;

interface BaseImage {
    source: HTMLImageElement;
    x: number;
    y: number;
    w: number;
    h: number;
}

export interface ExportOptions {
    /** Crop to the ink, keeping this many CSS pixels around it. Undefined = keep the whole pad. */
    trimPadding?: number;
    /** Fill colour behind the ink, or undefined for a transparent PNG. */
    background?: string;
}

/** Saved images are drawn at twice the CSS size so they stay sharp when printed or zoomed. */
export const IMAGE_SCALE = 2;

/**
 * Keeps the strokes for a pad and draws them. Every stroke and "clear" is kept as an action, so
 * undo/redo replays the list. Ink is drawn on an off-screen layer: the eraser cuts holes in that
 * layer (destination-out), and the layer is then copied to the visible canvas over a white
 * background (set with CSS, so it is not part of the image unless asked for on export).
 */
export class DrawingEngine {
    private actions: Action[] = [];
    private undone: Action[] = [];
    private current?: Stroke;
    private base?: BaseImage;
    private readonly layer = document.createElement("canvas");
    private width = 0;
    private height = 0;
    private frame = 0;

    constructor(private readonly view: HTMLCanvasElement, private readonly onChange: () => void) {}

    get canUndo(): boolean {
        return this.actions.length > 0 && !this.current;
    }

    get canRedo(): boolean {
        return this.undone.length > 0 && !this.current;
    }

    /** Anything drawn, erased or cleared since the pad opened. */
    get hasChanges(): boolean {
        return this.actions.length > 0;
    }

    /** Quick check used for buttons: nothing on the pad. Export does an exact pixel check. */
    get isBlank(): boolean {
        let blank = !this.base;
        for (const action of this.actions) {
            if (action.kind === "clear") blank = true;
            else if (action.tool === "pen") blank = false;
        }
        return blank;
    }

    resize(width: number, height: number): void {
        width = Math.max(1, Math.floor(width));
        height = Math.max(1, Math.floor(height));
        if (width === this.width && height === this.height) return;
        this.width = width;
        this.height = height;
        const ratio = window.devicePixelRatio || 1;
        this.view.width = Math.round(width * ratio);
        this.view.height = Math.round(height * ratio);
        this.view.style.width = `${width}px`;
        this.view.style.height = `${height}px`;
        this.layer.width = width * IMAGE_SCALE;
        this.layer.height = height * IMAGE_SCALE;
        this.redraw();
    }

    /**
     * Puts a saved picture on the pad so it can be changed. It is centred, and shrunk if it is
     * bigger than the pad. History starts again from here.
     */
    setBaseImage(image: HTMLImageElement): void {
        let w = image.naturalWidth / IMAGE_SCALE;
        let h = image.naturalHeight / IMAGE_SCALE;
        const fit = Math.min(1, this.width / w, this.height / h);
        w *= fit;
        h *= fit;
        this.base = { source: image, x: (this.width - w) / 2, y: (this.height - h) / 2, w, h };
        this.actions = [];
        this.undone = [];
        this.redraw();
        this.onChange();
    }

    begin(tool: Tool, color: string, width: number, x: number, y: number): void {
        this.current = { kind: "stroke", tool, color, points: [{ x, y, w: width }] };
        this.actions.push(this.current);
        this.undone = [];
        const ctx = this.layerContext();
        drawDot(ctx, this.current, this.current.points[0]);
        this.schedulePresent();
        this.onChange();
    }

    extend(x: number, y: number, width: number): void {
        const stroke = this.current;
        if (!stroke) return;
        const last = stroke.points[stroke.points.length - 1];
        if (Math.hypot(x - last.x, y - last.y) < 0.75) return;
        stroke.points.push({ x, y, w: width });
        const ctx = this.layerContext();
        withStyle(ctx, stroke, () => drawSegment(ctx, stroke.points, stroke.points.length - 1));
        this.schedulePresent();
    }

    end(): void {
        const stroke = this.current;
        if (!stroke) return;
        const ctx = this.layerContext();
        withStyle(ctx, stroke, () => drawTail(ctx, stroke.points));
        this.current = undefined;
        // An eraser tap or stroke on an empty pad changes nothing worth keeping.
        if (stroke.tool === "eraser" && this.isBlank) {
            this.actions.pop();
        }
        this.present();
        this.onChange();
    }

    undo(): void {
        if (!this.canUndo) return;
        this.undone.push(this.actions.pop() as Action);
        this.redraw();
        this.onChange();
    }

    redo(): void {
        if (!this.canRedo) return;
        this.actions.push(this.undone.pop() as Action);
        this.redraw();
        this.onChange();
    }

    /** Wipes the pad, including a loaded picture. Can be undone. */
    clear(): void {
        if (this.current || this.isBlank) return;
        this.actions.push({ kind: "clear" });
        this.undone = [];
        this.redraw();
        this.onChange();
    }

    /** The pad as a PNG, or null when nothing visible is on it. */
    export(options: ExportOptions): Promise<Blob | null> {
        const box = this.inkBounds();
        if (!box) return Promise.resolve(null);
        let { x, y, w, h } = { x: 0, y: 0, w: this.layer.width, h: this.layer.height };
        if (options.trimPadding !== undefined) {
            const pad = Math.round(options.trimPadding * IMAGE_SCALE);
            x = Math.max(0, box.minX - pad);
            y = Math.max(0, box.minY - pad);
            w = Math.min(this.layer.width, box.maxX + pad + 1) - x;
            h = Math.min(this.layer.height, box.maxY + pad + 1) - y;
        }
        const out = document.createElement("canvas");
        out.width = w;
        out.height = h;
        const ctx = out.getContext("2d") as CanvasRenderingContext2D;
        if (options.background) {
            ctx.fillStyle = options.background;
            ctx.fillRect(0, 0, w, h);
        }
        ctx.drawImage(this.layer, x, y, w, h, 0, 0, w, h);
        return new Promise((resolve) => out.toBlob((blob) => resolve(blob), "image/png"));
    }

    destroy(): void {
        if (this.frame) cancelAnimationFrame(this.frame);
        this.frame = 0;
    }

    /** Smallest box (layer pixels) holding ink. White counts as background, as saved images have a white fill. */
    private inkBounds(): { minX: number; minY: number; maxX: number; maxY: number } | undefined {
        const { width, height } = this.layer;
        if (!width || !height) return undefined;
        const data = this.layerContext().getImageData(0, 0, width, height).data;
        let minX = width;
        let minY = height;
        let maxX = -1;
        let maxY = -1;
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const i = (y * width + x) * 4;
                const ink = data[i + 3] > 24 && !(data[i] > 240 && data[i + 1] > 240 && data[i + 2] > 240);
                if (ink) {
                    if (x < minX) minX = x;
                    if (x > maxX) maxX = x;
                    if (y < minY) minY = y;
                    if (y > maxY) maxY = y;
                }
            }
        }
        return maxX < 0 ? undefined : { minX, minY, maxX, maxY };
    }

    private layerContext(): CanvasRenderingContext2D {
        const ctx = this.layer.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D;
        ctx.setTransform(IMAGE_SCALE, 0, 0, IMAGE_SCALE, 0, 0);
        return ctx;
    }

    private redraw(): void {
        const ctx = this.layerContext();
        ctx.clearRect(0, 0, this.width, this.height);
        if (this.base) {
            ctx.drawImage(this.base.source, this.base.x, this.base.y, this.base.w, this.base.h);
        }
        for (const action of this.actions) {
            if (action.kind === "clear") {
                ctx.clearRect(0, 0, this.width, this.height);
            } else {
                drawStroke(ctx, action, action !== this.current);
            }
        }
        this.present();
    }

    private schedulePresent(): void {
        if (!this.frame) this.frame = requestAnimationFrame(() => this.present());
    }

    private present(): void {
        if (this.frame) cancelAnimationFrame(this.frame);
        this.frame = 0;
        const ctx = this.view.getContext("2d");
        if (!ctx) return;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, this.view.width, this.view.height);
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(this.layer, 0, 0, this.view.width, this.view.height);
    }
}

function withStyle(ctx: CanvasRenderingContext2D, stroke: Stroke, draw: () => void): void {
    ctx.save();
    ctx.globalCompositeOperation = stroke.tool === "eraser" ? "destination-out" : "source-over";
    ctx.strokeStyle = stroke.color;
    ctx.fillStyle = stroke.color;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    draw();
    ctx.restore();
}

function drawStroke(ctx: CanvasRenderingContext2D, stroke: Stroke, finished: boolean): void {
    withStyle(ctx, stroke, () => {
        const points = stroke.points;
        if (points.length === 1) {
            dot(ctx, points[0]);
            return;
        }
        for (let i = 1; i < points.length; i++) drawSegment(ctx, points, i);
        if (finished) drawTail(ctx, points);
    });
}

function drawDot(ctx: CanvasRenderingContext2D, stroke: Stroke, point: Point): void {
    withStyle(ctx, stroke, () => dot(ctx, point));
}

function dot(ctx: CanvasRenderingContext2D, point: Point): void {
    ctx.beginPath();
    ctx.arc(point.x, point.y, point.w / 2, 0, Math.PI * 2);
    ctx.fill();
}

/**
 * Smooths the line by curving through the midpoints of the points: segment i runs from the
 * midpoint before point i-1 to the midpoint after it, bending towards point i-1.
 */
function drawSegment(ctx: CanvasRenderingContext2D, points: Point[], i: number): void {
    const control = points[i - 1];
    const next = points[i];
    const start = i === 1 ? control : midpoint(points[i - 2], control);
    const end = midpoint(control, next);
    ctx.lineWidth = (start.w + end.w) / 2;
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.quadraticCurveTo(control.x, control.y, end.x, end.y);
    ctx.stroke();
}

/** The last half segment, from the final midpoint to the last point. */
function drawTail(ctx: CanvasRenderingContext2D, points: Point[]): void {
    if (points.length < 2) return;
    const last = points[points.length - 1];
    const start = midpoint(points[points.length - 2], last);
    ctx.lineWidth = (start.w + last.w) / 2;
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(last.x, last.y);
    ctx.stroke();
}

function midpoint(a: Point, b: Point): Point {
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, w: (a.w + b.w) / 2 };
}

/** Loads a saved PNG so it can be put on the pad. */
export function loadImage(blob: Blob): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(blob);
        const image = new Image();
        image.onload = () => {
            URL.revokeObjectURL(url);
            resolve(image);
        };
        image.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error("Could not open the saved image."));
        };
        image.src = url;
    });
}
