import * as React from "react";
import { FluentProvider, webLightTheme } from "@fluentui/react-components";
import { IInputs, IOutputs } from "./generated/ManifestTypes";
import { FileDropZoneApp, FileDropZoneAppProps } from "./components/FileDropZoneApp";
import { INotesService } from "./services/INotesService";
import { DataverseNotesService } from "./services/DataverseNotesService";
import { DemoNotesService } from "./services/DemoNotesService";
import { parseExtensions } from "./services/fileUtils";

/** Record details the form passes to controls. Not in the public typings, but present in model-driven apps. */
interface RecordInfo {
    entityId?: string;
    entityTypeName?: string;
}

export class FileDropZone implements ComponentFramework.ReactControl<IInputs, IOutputs> {
    private service?: INotesService;
    private serviceKey?: string;

    public init(
        context: ComponentFramework.Context<IInputs>,
        notifyOutputChanged: () => void,
        state: ComponentFramework.Dictionary
    ): void {
        // Nothing to set up; the service is created in updateView once the record is known.
    }

    public updateView(context: ComponentFramework.Context<IInputs>): React.ReactElement {
        const p = context.parameters;
        const { entityName, recordId } = getRecord(context);
        const demoMode = (!recordId || !entityName) && isLocalHarness();

        const props: FileDropZoneAppProps = {
            service: this.getService(context, entityName, recordId, demoMode),
            readOnly: context.mode.isControlDisabled,
            allowedExtensions: parseExtensions(harnessText(p.allowedExtensions?.raw, demoMode)),
            maxFileSizeMB: positive(p.maxFileSizeMB?.raw),
            maxFilesPerDrop: positive(p.maxFilesPerDrop?.raw) ?? 10,
            noteSubject: harnessText(p.noteSubject?.raw, demoMode) ?? "",
            showExisting: p.showExistingFiles?.raw !== "no",
            allowDelete: p.allowDelete?.raw !== "no",
            showThumbnails: p.showThumbnails?.raw !== "no",
            demoMode,
            formatDate: (date) => {
                try {
                    return context.formatting.formatDateShort(date, true);
                } catch {
                    return date.toLocaleString();
                }
            },
        };

        return React.createElement(
            FluentProvider,
            { theme: context.fluentDesignLanguage?.tokenTheme ?? webLightTheme, style: { width: "100%" } },
            React.createElement(FileDropZoneApp, props)
        );
    }

    public getOutputs(): IOutputs {
        // The host field is never changed.
        return {};
    }

    public destroy(): void {
        this.service = undefined;
    }

    /** Keeps the same service while the record is the same, so the list is not reloaded on every render. */
    private getService(
        context: ComponentFramework.Context<IInputs>,
        entityName: string,
        recordId: string,
        demoMode: boolean
    ): INotesService {
        const key = demoMode ? "demo" : `${entityName}|${recordId}`;
        if (!this.service || this.serviceKey !== key) {
            this.service = demoMode
                ? new DemoNotesService()
                : new DataverseNotesService(
                      context.webAPI,
                      context.utils,
                      context.navigation,
                      entityName,
                      recordId,
                      getClientUrl(context)
                  );
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

/** Org URL for Web API calls that context.webAPI can't make. context.page is present in model-driven apps. */
function getClientUrl(context: ComponentFramework.Context<IInputs>): string {
    const page = (context as unknown as { page?: { getClientUrl?: () => string } }).page;
    const url = page?.getClientUrl?.() || window.location.origin;
    return url.replace(/\/+$/, "");
}

function isLocalHarness(): boolean {
    return ["localhost", "127.0.0.1"].includes(window.location.hostname);
}

function positive(value: number | null | undefined): number | undefined {
    return value && value > 0 ? value : undefined;
}

/** The test harness fills empty text properties with "val"; treat that as empty in demo mode. */
function harnessText(value: string | null | undefined, demoMode: boolean): string | undefined {
    return demoMode && value === "val" ? undefined : value ?? undefined;
}
