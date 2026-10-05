import * as React from "react";
import {
    Toolbar,
    ToolbarButton,
    ToolbarDivider,
    ToolbarProps,
    ToolbarRadioButton,
    ToolbarRadioGroup,
    Tooltip,
    makeStyles,
    mergeClasses,
    shorthands,
    tokens,
} from "@fluentui/react-components";
import {
    ArrowRedo20Regular,
    ArrowUndo20Regular,
    Delete20Regular,
    Eraser20Regular,
    Pen20Regular,
} from "@fluentui/react-icons";
import { DrawingEngine, ExportOptions, Tool, loadImage } from "../services/DrawingEngine";

export type PadMode = "signature" | "drawing";
type Size = "small" | "medium" | "large";

export interface PenColor {
    name: string;
    value: string;
}

export interface PadState {
    blank: boolean;
    changed: boolean;
}

export interface DrawingPadHandle {
    /** The pad as a PNG, or null when there is nothing on it. */
    exportPng(options: ExportOptions): Promise<Blob | null>;
}

export interface DrawingPadProps {
    mode: PadMode;
    height: number;
    colors: PenColor[];
    initialColor: string;
    penWidth: number;
    /** A saved picture to start from (editing). */
    baseImage?: Blob;
    disabled: boolean;
    onStateChange: (state: PadState) => void;
    onError: (message: string) => void;
    /** Buttons shown at the end of the toolbar, such as Save and Cancel. */
    actions?: React.ReactNode;
}

const ERASER_SIZES: Record<Size, number> = { small: 10, medium: 20, large: 40 };
const SIZE_LABELS: Record<Size, string> = { small: "Thin", medium: "Medium", large: "Thick" };

const useStyles = makeStyles({
    root: { display: "flex", flexDirection: "column", gap: tokens.spacingVerticalXS, width: "100%" },
    toolbar: {
        flexWrap: "wrap",
        rowGap: tokens.spacingVerticalXXS,
        paddingLeft: 0,
        paddingRight: 0,
    },
    spacer: { flexGrow: 1 },
    actions: { display: "flex", gap: tokens.spacingHorizontalS, alignItems: "center", flexWrap: "wrap" },
    surface: {
        position: "relative",
        width: "100%",
        boxSizing: "border-box",
        overflow: "hidden",
        // Paper stays white in dark mode, as the saved image is.
        backgroundColor: "#ffffff",
        borderRadius: tokens.borderRadiusMedium,
        ...shorthands.border(tokens.strokeWidthThin, "solid", tokens.colorNeutralStroke1),
        ":focus-within": {
            ...shorthands.borderColor(tokens.colorBrandStroke1),
        },
    },
    surfaceDisabled: { opacity: 0.6 },
    canvas: {
        display: "block",
        touchAction: "none",
        userSelect: "none",
        cursor: "crosshair",
        ":focus-visible": {
            outlineWidth: tokens.strokeWidthThick,
            outlineStyle: "solid",
            outlineColor: tokens.colorStrokeFocus2,
            outlineOffset: "-2px",
        },
    },
    canvasDisabled: { cursor: "not-allowed" },
    placeholder: {
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#8a8886",
        fontSize: tokens.fontSizeBase400,
        pointerEvents: "none",
    },
    baseline: {
        position: "absolute",
        left: "24px",
        right: "24px",
        bottom: "28%",
        display: "flex",
        alignItems: "flex-end",
        gap: tokens.spacingHorizontalS,
        color: "#8a8886",
        pointerEvents: "none",
        ...shorthands.borderBottom(tokens.strokeWidthThin, "solid", "#c8c6c4"),
        paddingBottom: "2px",
        fontSize: tokens.fontSizeBase400,
        lineHeight: 1,
    },
    swatch: {
        display: "inline-block",
        width: "16px",
        height: "16px",
        borderRadius: tokens.borderRadiusCircular,
        boxSizing: "border-box",
        ...shorthands.border(tokens.strokeWidthThin, "solid", tokens.colorNeutralStroke1),
    },
    sizeBox: { display: "inline-flex", width: "20px", height: "20px", alignItems: "center", justifyContent: "center" },
    sizeDot: { display: "inline-block", borderRadius: tokens.borderRadiusCircular, backgroundColor: "currentColor" },
});

export const DrawingPad = React.forwardRef<DrawingPadHandle, DrawingPadProps>(function DrawingPad(props, ref) {
    const { mode, height, colors, initialColor, penWidth, baseImage, disabled, actions } = props;
    const styles = useStyles();
    const surfaceRef = React.useRef<HTMLDivElement>(null);
    const canvasRef = React.useRef<HTMLCanvasElement>(null);
    const engineRef = React.useRef<DrawingEngine>();
    const activePointer = React.useRef<number | null>(null);
    const callbacks = React.useRef(props);
    callbacks.current = props;

    const [tool, setTool] = React.useState<Tool>("pen");
    const [color, setColor] = React.useState(initialColor);
    const [penSize, setPenSize] = React.useState<Size>("medium");
    const [eraserSize, setEraserSize] = React.useState<Size>("medium");
    const [history, setHistory] = React.useState({ canUndo: false, canRedo: false, blank: true });

    const penSizes: Record<Size, number> = {
        small: Math.max(1, Math.round(penWidth * 0.6)),
        medium: penWidth,
        large: Math.round(penWidth * 2),
    };

    // One engine per pad. The parent gives the pad a new key to start a new drawing.
    React.useEffect(() => {
        const canvas = canvasRef.current;
        const surface = surfaceRef.current;
        if (!canvas || !surface) return;
        const engine = new DrawingEngine(canvas, () => {
            const state = { canUndo: engine.canUndo, canRedo: engine.canRedo, blank: engine.isBlank };
            setHistory(state);
            callbacks.current.onStateChange({ blank: state.blank, changed: engine.hasChanges });
        });
        engineRef.current = engine;
        const fit = () => engine.resize(surface.clientWidth, height);
        fit();
        const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(fit) : undefined;
        observer?.observe(surface);
        if (!observer) window.addEventListener("resize", fit);

        let cancelled = false;
        if (baseImage) {
            loadImage(baseImage)
                .then((image) => !cancelled && engine.setBaseImage(image))
                .catch((error: Error) => !cancelled && callbacks.current.onError(error.message));
        }
        return () => {
            cancelled = true;
            observer?.disconnect();
            if (!observer) window.removeEventListener("resize", fit);
            engine.destroy();
            engineRef.current = undefined;
        };
        // baseImage is fixed for the life of the pad (a new picture gets a new key).
    }, [height]);

    React.useImperativeHandle(ref, () => ({
        exportPng: (options) => engineRef.current?.export(options) ?? Promise.resolve(null),
    }));

    const position = (event: { clientX: number; clientY: number }) => {
        const rect = (canvasRef.current as HTMLCanvasElement).getBoundingClientRect();
        return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    };

    const lineWidth = (event: PointerEvent | React.PointerEvent) => {
        if (tool === "eraser") return ERASER_SIZES[eraserSize];
        const base = penSizes[penSize];
        // Pens report pressure; mouse and most touch screens report a fixed 0.5 or 0.
        return event.pointerType === "pen" && event.pressure > 0 ? base * (0.4 + event.pressure * 1.2) : base;
    };

    const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
        const engine = engineRef.current;
        if (disabled || !engine || activePointer.current !== null) return;
        if (event.pointerType === "mouse" && event.button !== 0) return;
        event.preventDefault();
        event.currentTarget.focus({ preventScroll: true });
        event.currentTarget.setPointerCapture(event.pointerId);
        activePointer.current = event.pointerId;
        const { x, y } = position(event);
        engine.begin(tool, color, lineWidth(event), x, y);
    };

    const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
        const engine = engineRef.current;
        if (!engine || activePointer.current !== event.pointerId) return;
        const native = event.nativeEvent;
        // Coalesced events give every point the device reported, for smoother fast strokes.
        const events = native.getCoalescedEvents?.() ?? [];
        for (const e of events.length ? events : [native]) {
            const { x, y } = position(e);
            engine.extend(x, y, lineWidth(e));
        }
    };

    const onPointerEnd = (event: React.PointerEvent<HTMLCanvasElement>) => {
        if (activePointer.current !== event.pointerId) return;
        activePointer.current = null;
        engineRef.current?.end();
    };

    const onKeyDown = (event: React.KeyboardEvent) => {
        if (disabled || !(event.ctrlKey || event.metaKey)) return;
        const key = event.key.toLowerCase();
        if (key === "z" && !event.shiftKey) {
            engineRef.current?.undo();
        } else if (key === "y" || (key === "z" && event.shiftKey)) {
            engineRef.current?.redo();
        } else {
            return;
        }
        event.preventDefault();
        event.stopPropagation();
    };

    const checkedValues: Record<string, string[]> = {
        tool: [tool],
        color: [color],
        size: [tool === "pen" ? penSize : eraserSize],
    };
    const onCheckedValueChange: ToolbarProps["onCheckedValueChange"] = (_, data) => {
        const value = data.checkedItems[0];
        if (data.name === "tool") setTool(value as Tool);
        if (data.name === "color") {
            setColor(value);
            setTool("pen");
        }
        if (data.name === "size") (tool === "pen" ? setPenSize : setEraserSize)(value as Size);
    };

    const eraserPx = Math.min(ERASER_SIZES[eraserSize], 64);
    const eraserCursor =
        `url("data:image/svg+xml,${encodeURIComponent(
            `<svg xmlns="http://www.w3.org/2000/svg" width="${eraserPx + 2}" height="${eraserPx + 2}">` +
                `<circle cx="${eraserPx / 2 + 1}" cy="${eraserPx / 2 + 1}" r="${eraserPx / 2}" fill="white" fill-opacity="0.6" stroke="black"/></svg>`
        )}") ${eraserPx / 2 + 1} ${eraserPx / 2 + 1}, cell`;

    return (
        <div className={styles.root} onKeyDown={onKeyDown}>
            <Toolbar
                className={styles.toolbar}
                size="small"
                aria-label={`${mode === "signature" ? "Signature" : "Drawing"} tools`}
                checkedValues={checkedValues}
                onCheckedValueChange={onCheckedValueChange}
            >
                <ToolbarRadioGroup>
                    <Tooltip content="Pen" relationship="label" withArrow>
                        <ToolbarRadioButton name="tool" value="pen" icon={<Pen20Regular />} disabled={disabled} />
                    </Tooltip>
                    <Tooltip content="Eraser: rub out part of the picture" relationship="label" withArrow>
                        <ToolbarRadioButton name="tool" value="eraser" icon={<Eraser20Regular />} disabled={disabled} />
                    </Tooltip>
                </ToolbarRadioGroup>
                {colors.length > 1 && (
                    <>
                        <ToolbarDivider />
                        <ToolbarRadioGroup>
                            {colors.map((c) => (
                                <Tooltip key={c.value} content={c.name} relationship="label" withArrow>
                                    <ToolbarRadioButton
                                        name="color"
                                        value={c.value}
                                        disabled={disabled}
                                        icon={<span className={styles.swatch} style={{ backgroundColor: c.value }} />}
                                    />
                                </Tooltip>
                            ))}
                        </ToolbarRadioGroup>
                    </>
                )}
                <ToolbarDivider />
                <ToolbarRadioGroup>
                    {(["small", "medium", "large"] as Size[]).map((size) => {
                        const px = { small: 4, medium: 8, large: 13 }[size];
                        return (
                            <Tooltip
                                key={size}
                                content={`${SIZE_LABELS[size]} ${tool === "pen" ? "pen" : "eraser"}`}
                                relationship="label"
                                withArrow
                            >
                                <ToolbarRadioButton
                                    name="size"
                                    value={size}
                                    disabled={disabled}
                                    icon={
                                        <span className={styles.sizeBox}>
                                            <span className={styles.sizeDot} style={{ width: px, height: px }} />
                                        </span>
                                    }
                                />
                            </Tooltip>
                        );
                    })}
                </ToolbarRadioGroup>
                <ToolbarDivider />
                <Tooltip content="Undo (Ctrl+Z)" relationship="label" withArrow>
                    <ToolbarButton
                        icon={<ArrowUndo20Regular />}
                        disabled={disabled || !history.canUndo}
                        onClick={() => engineRef.current?.undo()}
                    />
                </Tooltip>
                <Tooltip content="Redo (Ctrl+Y)" relationship="label" withArrow>
                    <ToolbarButton
                        icon={<ArrowRedo20Regular />}
                        disabled={disabled || !history.canRedo}
                        onClick={() => engineRef.current?.redo()}
                    />
                </Tooltip>
                <Tooltip content="Clear the whole pad (can be undone)" relationship="label" withArrow>
                    <ToolbarButton
                        icon={<Delete20Regular />}
                        disabled={disabled || history.blank}
                        onClick={() => engineRef.current?.clear()}
                    >
                        Clear
                    </ToolbarButton>
                </Tooltip>
                <span className={styles.spacer} />
                {actions && <div className={styles.actions}>{actions}</div>}
            </Toolbar>
            <div ref={surfaceRef} className={mergeClasses(styles.surface, disabled && styles.surfaceDisabled)}>
                <canvas
                    ref={canvasRef}
                    className={mergeClasses(styles.canvas, disabled && styles.canvasDisabled)}
                    style={!disabled && tool === "eraser" ? { cursor: eraserCursor } : undefined}
                    tabIndex={disabled ? -1 : 0}
                    role="img"
                    aria-label={`${mode === "signature" ? "Signature" : "Drawing"} pad. Draw with a mouse, pen or finger.`}
                    onPointerDown={onPointerDown}
                    onPointerMove={onPointerMove}
                    onPointerUp={onPointerEnd}
                    onPointerCancel={onPointerEnd}
                    onLostPointerCapture={onPointerEnd}
                    onContextMenu={(e) => e.preventDefault()}
                />
                {mode === "signature" && (
                    <div className={styles.baseline} aria-hidden="true">
                        <span>✕</span>
                    </div>
                )}
                {history.blank && (
                    <div className={styles.placeholder} aria-hidden="true">
                        {mode === "signature" ? "Sign here" : "Draw here"}
                    </div>
                )}
            </div>
        </div>
    );
});
