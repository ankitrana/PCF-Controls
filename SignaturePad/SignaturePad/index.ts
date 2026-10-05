import * as React from "react";
import { FluentProvider, webLightTheme } from "@fluentui/react-components";
import { IInputs, IOutputs } from "./generated/ManifestTypes";
import { SignaturePadApp, SignaturePadAppProps } from "./components/SignaturePadApp";
import { PadMode, PenColor } from "./components/DrawingPad";
import { IImageService } from "./services/IImageService";
import { DataverseImageService } from "./services/DataverseImageService";
import { DemoImageService } from "./services/DemoImageService";
import { cleanName, parseColor } from "./services/imageUtils";

/** Record details the form passes to controls. Not in the public typings, but present in model-driven apps. */
interface RecordInfo {
    entityId?: string;
    entityTypeName?: string;
}

const SIGNATURE_COLORS: PenColor[] = [
    { name: "Black", value: "#000000" },
    { name: "Blue", value: "#1f3b8c" },
];

const DRAWING_COLORS: PenColor[] = [
    { name: "Black", value: "#000000" },
    { name: "Blue", value: "#0f6cbd" },
    { name: "Red", value: "#d13438" },
    { name: "Green", value: "#107c10" },
    { name: "Orange", value: "#f7630c" },
    { name: "Purple", value: "#8764b8" },
];

export class SignaturePad implements ComponentFramework.ReactControl<IInputs, IOutputs> {
    private service?: IImageService;
    private serviceKey?: string;
    private notifyOutputChanged!: () => void;
    private hostValue?: string | null;

    public init(
        context: ComponentFramework.Context<IInputs>,
        notifyOutputChanged: () => void,
        state: ComponentFramework.Dictionary
    ): void {
        this.notifyOutputChanged = notifyOutputChanged;
    }

    public updateView(context: ComponentFramework.Context<IInputs>): React.ReactElement {
        const p = context.parameters;
        const { entityName, recordId } = getRecord(context);
        const demoMode = (!recordId || !entityName) && isLocalHarness();
        const mode: PadMode = p.padMode?.raw === "drawing" ? "drawing" : "signature";
        const defaultName = mode === "signature" ? "Signature" : "Drawing";
        const initialColor = parseColor(harnessText(p.penColor?.raw, demoMode), "#000000");
        const palette = mode === "signature" ? SIGNATURE_COLORS : DRAWING_COLORS;
        const colors = palette.some((c) => c.value === initialColor)
            ? palette
            : [{ name: "Default colour", value: initialColor }, ...palette];
        const fillHostField = p.fillHostField?.raw === "yes";

        const props: SignaturePadAppProps = {
            service: this.getService(context, entityName, recordId, demoMode),
            mode,
            baseName: cleanName(harnessText(p.imageName?.raw, demoMode) ?? "") || defaultName,
            addDate: p.addDateToName?.raw !== "no",
            replaceEarlier: p.saveBehaviour?.raw !== "keep",
            noteSubject: harnessText(p.noteSubject?.raw, demoMode) ?? "",
            colors,
            initialColor,
            penWidth: clamp(p.penWidth?.raw, 1, 20) ?? 3,
            padHeight: clamp(p.padHeight?.raw, 100, 1200) ?? (mode === "signature" ? 200 : 360),
            transparent: p.background?.raw === "transparent",
            noteMode: p.imageNote?.raw === "required" ? "required" : p.imageNote?.raw === "off" ? "off" : "optional",
            allowDelete: p.allowDelete?.raw !== "no",
            readOnly: context.mode.isControlDisabled,
            formatDate: (date) => {
                try {
                    return context.formatting.formatDateShort(date, true);
                } catch {
                    return date.toLocaleString();
                }
            },
            onImagesChanged: (latest) => {
                if (!fillHostField || context.mode.isControlDisabled) return;
                if ((p.hostField.raw ?? null) === latest) return;
                this.hostValue = latest;
                this.notifyOutputChanged();
            },
        };

        return React.createElement(
            FluentProvider,
            { theme: context.fluentDesignLanguage?.tokenTheme ?? webLightTheme, style: { width: "100%" } },
            React.createElement(SignaturePadApp, props)
        );
    }

    public getOutputs(): IOutputs {
        // Only written when "Fill host field when saved" is on; undefined leaves the field alone.
        return this.hostValue === undefined ? {} : { hostField: this.hostValue ?? undefined };
    }

    public destroy(): void {
        this.service = undefined;
    }

    /** Keeps the same service while the record is the same. */
    private getService(
        context: ComponentFramework.Context<IInputs>,
        entityName: string,
        recordId: string,
        demoMode: boolean
    ): IImageService {
        const key = demoMode ? "demo" : `${entityName}|${recordId}`;
        if (!this.service || this.serviceKey !== key) {
            this.service = demoMode
                ? new DemoImageService()
                : new DataverseImageService(context.webAPI, context.utils, context.navigation, entityName, recordId);
            this.serviceKey = key;
        }
        return this.service;
    }
}

function getRecord(context: ComponentFramework.Context<IInputs>): { entityName: string; recordId: string } {
    const fromMode = (context.mode as unknown as { contextInfo?: RecordInfo }).contextInfo;
    const fromPage = (context as unknown as { page?: RecordInfo }).page;
    const id = fromMode?.entityId || fromPage?.entityId || "";
    return {
        entityName: fromMode?.entityTypeName || fromPage?.entityTypeName || "",
        recordId: id.replace(/[{}]/g, "").toLowerCase(),
    };
}

function isLocalHarness(): boolean {
    return ["localhost", "127.0.0.1"].includes(window.location.hostname);
}

function clamp(value: number | null | undefined, min: number, max: number): number | undefined {
    return value && value > 0 ? Math.min(max, Math.max(min, value)) : undefined;
}

/** The test harness fills empty text properties with "val"; treat that as empty in demo mode. */
function harnessText(value: string | null | undefined, demoMode: boolean): string | undefined {
    return demoMode && value === "val" ? undefined : value ?? undefined;
}
