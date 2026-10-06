// Builds docs/FileDropZone-User-Guide.docx from the same content as docs/user-guide.md.
// Keep both in sync. Run from the FileDropZone folder:
//   npm i --no-save docx && node docs/build-guide.js
// Then open the .docx in Word, right-click the table of contents > Update field, save,
// and File > Save As > PDF to refresh FileDropZone-User-Guide.pdf.
const fs = require("fs");
const path = require("path");
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, Table, TableRow, TableCell,
  WidthType, ShadingType, BorderStyle, ImageRun, TableOfContents, Header, Footer, PageNumber,
  LevelFormat, PageBreak, ExternalHyperlink, TabStopType,
} = require("docx");

const ROOT = path.resolve(__dirname, "..");
const IMG = (n) => fs.readFileSync(path.join(ROOT, "docs/img", n));
const OUT = path.join(ROOT, "docs/FileDropZone-User-Guide.docx");

const BRAND = "0F6CBD";
const DARK = "1B1B1B";
const MUTED = "605E5C";
const LIGHT = "EBF3FC";
const ZEBRA = "F5F5F5";
const FONT = "Segoe UI";
const CONTENT = 9026; // A4 width 11906 - 2 x 1440 margins

// ---------- inline formatting: **bold** and `code` ----------
function runs(text, base = {}) {
  const out = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  let last = 0, m;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(new TextRun({ text: text.slice(last, m.index), ...base }));
    const t = m[0];
    if (t.startsWith("**")) out.push(new TextRun({ text: t.slice(2, -2), bold: true, ...base }));
    else if (t.startsWith("*")) out.push(new TextRun({ text: t.slice(1, -1), italics: true, ...base }));
    else out.push(new TextRun({ text: t.slice(1, -1), font: "Consolas", size: 19, color: "A4262C", ...base }));
    last = m.index + t.length;
  }
  if (last < text.length) out.push(new TextRun({ text: text.slice(last), ...base }));
  return out;
}

const p = (text, opts = {}) => new Paragraph({ children: runs(text), spacing: { after: 120 }, ...opts });
const h1 = (text, pageBreak = true) => new Paragraph({ heading: HeadingLevel.HEADING_1, pageBreakBefore: pageBreak, children: [new TextRun(text)] });
const h2 = (text) => new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(text)] });

let listCount = 0;
const numberingConfigs = [];
function numbered(items) {
  const ref = `steps${++listCount}`;
  numberingConfigs.push({
    reference: ref,
    levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT,
      style: { paragraph: { indent: { left: 400, hanging: 300 } } } }],
  });
  return items.map((t) => new Paragraph({ numbering: { reference: ref, level: 0 }, children: runs(t), spacing: { after: 80 } }));
}
function bullets(items) {
  return items.map((t) => new Paragraph({ numbering: { reference: "bullets", level: 0 }, children: runs(t), spacing: { after: 80 } }));
}

function note(text, label = "Note") {
  return new Paragraph({
    children: [new TextRun({ text: `${label}: `, bold: true, color: BRAND }), ...runs(text)],
    shading: { type: ShadingType.CLEAR, fill: LIGHT, color: "auto" },
    border: { left: { style: BorderStyle.SINGLE, size: 24, color: BRAND, space: 8 } },
    indent: { left: 160, right: 160 },
    spacing: { before: 120, after: 200 },
  });
}

function image(name, w, h, caption) {
  const out = [new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 120, after: caption ? 60 : 200 },
    children: [new ImageRun({ type: "png", data: IMG(name), transformation: { width: w, height: h },
      altText: { title: caption || name, description: caption || name, name } })],
  })];
  if (caption) out.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 240 },
    children: [new TextRun({ text: caption, italics: true, size: 18, color: MUTED })] }));
  return out;
}

// ---------- tables ----------
const cellBorder = { style: BorderStyle.SINGLE, size: 4, color: "D1D1D1" };
const borders = { top: cellBorder, bottom: cellBorder, left: cellBorder, right: cellBorder };
function table(header, rows, widths) {
  const total = widths.reduce((a, b) => a + b, 0);
  if (total !== CONTENT) throw new Error(`Table widths ${total} != ${CONTENT}`);
  const mkCell = (text, i, isHeader, zebra) => new TableCell({
    borders,
    width: { size: widths[i], type: WidthType.DXA },
    shading: isHeader ? { type: ShadingType.CLEAR, fill: BRAND, color: "auto" }
      : zebra ? { type: ShadingType.CLEAR, fill: ZEBRA, color: "auto" } : undefined,
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    children: [new Paragraph({ spacing: { after: 0 },
      children: isHeader ? [new TextRun({ text, bold: true, color: "FFFFFF" })]
        : runs(text, i === 0 ? { bold: false } : {}) })],
  });
  return new Table({
    width: { size: CONTENT, type: WidthType.DXA },
    columnWidths: widths,
    rows: [
      new TableRow({ tableHeader: true, children: header.map((t, i) => mkCell(t, i, true)) }),
      ...rows.map((r, ri) => new TableRow({ cantSplit: true, children: r.map((t, i) => mkCell(t, i, false, ri % 2 === 1)) })),
    ],
  });
}
const spacer = () => new Paragraph({ spacing: { after: 120 }, children: [] });

// ---------- content ----------
const cover = [
  new Paragraph({ spacing: { before: 1800, after: 0 }, children: [new TextRun({ text: "AnkitRana-Tech  ·  PCF CONTROL", bold: true, size: 20, color: BRAND, characterSpacing: 40 })] }),
  new Paragraph({ spacing: { before: 120, after: 0 }, children: [new TextRun({ text: "File Drop Zone", bold: true, size: 72, color: DARK })] }),
  new Paragraph({ spacing: { after: 240 }, children: [new TextRun({ text: "User Guide", size: 44, color: MUTED })] }),
  new Paragraph({
    spacing: { after: 480 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: BRAND, space: 12 } },
    children: [new TextRun({ text: "Drag-and-drop file upload for Dynamics 365 / Dataverse model-driven apps. Files are saved as Note attachments on the record.", size: 24, color: DARK })],
  }),
  ...image("control-saved.png", 600, 211),
  new Paragraph({ spacing: { before: 1400, after: 60 }, children: [new TextRun({ text: "Version 0.2.0  ·  October 2026", size: 22, color: MUTED })] }),
  new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: "Ankit Rana, Dynamics 365 / Power Platform Solutions Architect", size: 22, color: MUTED })] }),
  new Paragraph({ children: [
    new ExternalHyperlink({ link: "https://www.linkedin.com/in/mrankitrana/", children: [new TextRun({ text: "linkedin.com/in/mrankitrana", style: "Hyperlink", size: 22 })] }),
  ] }),
];

const toc = [
  new Paragraph({ pageBreakBefore: true, spacing: { after: 240 }, children: [new TextRun({ text: "Contents", bold: true, size: 36, color: BRAND })] }),
  new TableOfContents("Contents", { hyperlink: true, headingStyleRange: "1-2" }),
];

const body = [
  h1("1. Overview"),
  p("File Drop Zone adds a drag-and-drop upload area to any model-driven form. Files are saved as **Note attachments** (`annotation`) on the record, the same place the timeline's *Add attachment* puts them, so everything that already uses Notes (timeline, reports, flows, integrations) keeps working."),
  p("It is a free PCF (Power Apps component framework) control built with React and Fluent UI v9, so it follows the app's theme and looks like the rest of the form."),

  ...image("control-uploading.png", 560, 318, "Upload queue: a blocked file, a duplicate prompt, a large file at 57% and a finished upload"),
  h2("Features"),
  table(["Feature", "Details"], [
    ["Drag and drop", "Drop one or many files, or whole folders. Sub-folders are included; system files like `Thumbs.db` and `.DS_Store` are skipped."],
    ["Browse", "Click the area (or focus it and press Enter) to pick files with the normal file dialog."],
    ["Paste", "Press **Ctrl+V** with the mouse over the control to upload a copied screenshot or file. Screenshots are named `Pasted image <date time>.png`."],
    ["Checks before upload", "File type, size and count are checked first, and the reason is shown next to the file, for example \".exe files are blocked by your organization.\""],
    ["Follows your environment", "Uses the environment's own maximum file size and blocked file types, so the control never accepts a file Dataverse would reject."],
    ["Large files", "Files over 4 MB are sent in blocks with a % progress bar and a **Cancel** button."],
    ["Parallel uploads", "Up to 3 files upload at the same time. A failed upload can be retried."],
    ["Duplicates", "If a file with the same name is already attached, choose **Replace**, **Keep both** or **Skip**."],
    ["Attachment list", "Shows the record's attachments, newest first, with size, date and who added them."],
    ["Thumbnails and preview", "Small pictures for image attachments; images, PDFs and text files open in a preview dialog."],
    ["Download and delete", "One click to download; delete asks for confirmation."],
  ], [2400, 6626]),

  h1("2. Requirements", false),
  ...bullets([
    "A Dataverse environment with **model-driven apps** (Unified Interface) in a desktop browser (Edge, Chrome, Firefox, Safari). Canvas apps and Power Pages are not supported. The Power Apps mobile app is not tested yet.",
    "The table you add it to must have **Attachments (including notes and files)** enabled (Power Apps > Tables > your table > Properties > Advanced options).",
    "A **single line of text** column on that table to host the control. The control never changes the column's value, so you can use any existing text column or create a dedicated one (for example *Attachments*).",
    "System Customizer or System Administrator role to import the solution and edit forms.",
  ]),

  h1("3. Install the solution", false),
  ...numbered([
    "Download `ArtFileDropZone_managed.zip` from the latest **File Drop Zone** release on github.com/ankitrana/PCF-Controls/releases (under *Assets*).",
    "Go to make.powerapps.com and pick the environment. Install in a sandbox or development environment first.",
    "Select **Solutions** > **Import solution** > **Browse**, select the zip, then **Next** > **Import**.",
    "Wait for the \"Solution imported successfully\" message.",
  ]),
  note("The solution contains only the control. It does not add tables, columns, flows or security roles, and it does not send data anywhere outside your environment."),

  h1("4. Add the control to a form"),
  ...numbered([
    "In **make.powerapps.com**, open a solution (or **Tables**) > your table > **Forms** > open the main form.",
    "Add the host text column to the form if it's not there yet. A one-column section of its own works best.",
    "Select the column, then in the right-hand **Properties** pane open **Components** > **+ Component**.",
    "Choose **File Drop Zone (AnkitRana-Tech)**.",
    "Set the options (see section 5), leave **Web**, **Mobile** and **Tablet** ticked, and click **Done**.",
    "Optional: in the column's properties, tick **Hide label** so the control uses the full width.",
    "**Save and publish** the form, then open any existing record to see the control.",
  ]),
  note("Classic form editor: double-click the column > **Controls** tab > **Add Control...** > File Drop Zone (AnkitRana-Tech) > set the options > select the Web / Phone / Tablet options > **OK**.", "Tip"),

  h1("5. Settings reference", false),
  table(["Setting", "Default", "What it does"], [
    ["**Host field**", "Required", "The text column the control sits on. Its value is never changed."],
    ["**Allowed file types**", "Empty", "Comma-separated list such as `.pdf,.docx,.xlsx,.png,.jpg`. Empty = every type the environment allows. Use it to be stricter on a specific form."],
    ["**Max file size (MB)**", "Empty", "Lower limit for this form, for example `2`. Empty = the environment's limit. It can never raise the environment's limit."],
    ["**Max files per drop**", "10", "How many files can be added in one go. Extra files are ignored with a message."],
    ["**Note title**", "Empty", "Title (subject) given to each Note, for example *Customer document*. Empty = the file name."],
    ["**Show existing attachments**", "Yes", "Show the list of attachments under the drop area. Set to No for an upload-only control."],
    ["**Allow delete**", "Yes", "Show the delete button on attachments. Users still need Delete permission on Notes."],
    ["**Show image thumbnails**", "Yes", "Show small pictures for image attachments up to 5 MB. Turn off on records with many large images to save bandwidth."],
  ], [2500, 1100, 5426]),
  spacer(),
  h2("Example setups"),
  table(["Scenario", "Settings"], [
    ["Contract documents on Opportunity", "Allowed file types `.pdf,.docx` · Note title *Contract* · Allow delete *No*"],
    ["Site photos on a custom Inspection table", "Allowed file types `.jpg,.jpeg,.png,.heic` · Max files per drop *30* · Show image thumbnails *Yes*"],
  ], [3200, 5826]),

  h1("6. Using the control", false),
  table(["Situation", "What happens"], [
    ["New record", "The drop area shows \"Save the record to add files.\" Save once, then upload."],
    ["Upload", "Drop files, click to browse, or paste. Each file shows its progress; finished uploads leave the queue after a few seconds and appear in the attachment list."],
    ["Cancel", "Large files (over 4 MB) and files still waiting in the queue have a cancel button."],
    ["Retry", "If an upload fails (for example the network dropped), click the retry icon next to it."],
    ["Same file name", "Choose **Replace** (uploads the new file, then deletes the old note), **Keep both**, or **Skip**."],
    ["Preview", "Click the eye icon on images, PDFs and text files."],
    ["Read-only form or inactive record", "The drop area and delete buttons are hidden; preview and download still work."],
  ], [2600, 6426]),
  ...image("control-preview.png", 380, 300, "Preview dialog for an image attachment"),

  h1("7. File rules and limits"),
  p("The control reads these environment settings, so admins change them in one place for both the control and the rest of Dataverse. Paths are in the Power Platform admin center > Environments > your environment > Settings."),
  table(["Setting", "Where", "Effect"], [
    ["Maximum file size for attachments", "**Email** > Email settings (classic: System Settings > Email)", "Largest attachment allowed. Default 5,120 KB."],
    ["Blocked attachments (file extensions)", "**Product** > Privacy + Security (classic: System Settings > General)", "Types users can't upload (`.exe`, `.js`, `.bat` ... by default)."],
    ["Blocked / allowed MIME types", "**Product** > Privacy + Security", "If an allowed list is set, only those types can be uploaded."],
  ], [2600, 3426, 3000]),
  note("Why is a 5 MB file rejected when the limit is 5 MB? Dataverse stores attachments as base64 text, which is 4/3 the size of the file, and the limit applies to that text. So the real file limit is about 3/4 of the setting: the default 5,120 KB allows files up to about 3.75 MB. To allow bigger files, raise the maximum file size (up to 131,072 KB = 128 MB).", "Good to know"),

  h1("8. Security", false),
  p("The control uses the signed-in user's own permissions. Nothing is elevated. Users need:"),
  table(["To...", "Privilege needed"], [
    ["See attachments", "Read on **Note**"],
    ["Upload", "Create on **Note**, Append on **Note**, Append To on the **record's table**"],
    ["Delete", "Delete on **Note** (and the Allow delete setting on)"],
  ], [2600, 6426]),
  spacer(),
  p("If the user can't read the environment's settings, the control still works and uses only its own Allowed file types / Max file size checks; Dataverse still enforces its own limits when saving."),

  h1("9. Troubleshooting"),
  table(["Problem", "Fix"], [
    ["Control doesn't appear in the component list", "Check that the solution imported, and that you selected a **single line of text** column."],
    ["\"Save the record to add files.\"", "The record is new. Save it once."],
    ["Upload fails with a message about `objectid_...`", "Notes aren't enabled on the table. Turn on **Attachments (including notes and files)** in the table's advanced options. This can't be turned off again later."],
    ["\"... files are blocked by your organization.\"", "The type is in the environment's blocked list. Ask your admin to change it, or zip the file if zip is allowed."],
    ["\"File is X MB; the limit is Y MB.\"", "See section 7, File rules and limits."],
    ["Attachment list is empty but the timeline shows files", "The timeline also shows notes **without** files and emails; the control lists only notes that have a file. Click refresh."],
    ["Preview doesn't open", "Download the file instead. Some browsers or security policies block in-page PDF viewing."],
    ["Delete button missing", "Allow delete is No, the form is read-only, or the record is inactive."],
  ], [3600, 5426]),
  spacer(),
  p("Still stuck? Report it with the control version, browser, steps and the error text. Please don't include customer data or organization URLs."),

  h1("10. Update or uninstall", false),
  ...bullets([
    "**Update**: import the newer managed zip over the existing one (Solutions > Import > Upgrade). Form settings are kept.",
    "**Uninstall**: remove the control from every form first (form > column > Components > delete the component > Save and publish), then delete the File Drop Zone solution. Uploaded files are Notes, so they stay on the records.",
  ]),
  spacer(),
  new Paragraph({
    spacing: { before: 480 },
    border: { top: { style: BorderStyle.SINGLE, size: 6, color: "D1D1D1", space: 8 } },
    children: [new TextRun({ text: "License: MIT. Free to use, provided as is without warranty. Test in a non-production environment before rolling out.", size: 18, color: MUTED, italics: true })],
  }),
];

// ---------- document ----------
const doc = new Document({
  creator: "Ankit Rana",
  title: "File Drop Zone - User Guide",
  description: "User guide for the File Drop Zone PCF control",
  styles: {
    default: { document: { run: { font: FONT, size: 21, color: DARK } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 34, bold: true, color: BRAND, font: FONT },
        paragraph: { spacing: { before: 360, after: 200 }, outlineLevel: 0, keepNext: true, keepLines: true } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 26, bold: true, color: DARK, font: FONT },
        paragraph: { spacing: { before: 280, after: 140 }, outlineLevel: 1, keepNext: true, keepLines: true } },
    ],
  },
  numbering: {
    config: [
      { reference: "bullets", levels: [{ level: 0, format: LevelFormat.BULLET, text: "\u2022", alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 400, hanging: 260 } } } }] },
      ...numberingConfigs,
    ],
  },
  sections: [
    {
      properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } },
        titlePage: true },
      headers: {
        default: new Header({ children: [new Paragraph({
          border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: "D1D1D1", space: 4 } },
          tabStops: [{ type: TabStopType.RIGHT, position: CONTENT }],
          children: [
            new TextRun({ text: "File Drop Zone  ·  User Guide", size: 16, color: MUTED }),
            new TextRun({ text: "\tv0.2.0", size: 16, color: MUTED }),
          ] })] }),
        first: new Header({ children: [new Paragraph({ children: [] })] }),
      },
      footers: {
        default: new Footer({ children: [new Paragraph({
          tabStops: [{ type: TabStopType.RIGHT, position: CONTENT }],
          children: [
            new TextRun({ text: "AnkitRana-Tech  ·  github.com/ankitrana", size: 16, color: MUTED }),
            new TextRun({ children: ["\tPage ", PageNumber.CURRENT, " of ", PageNumber.TOTAL_PAGES], size: 16, color: MUTED }),
          ] })] }),
        first: new Footer({ children: [new Paragraph({ children: [] })] }),
      },
      children: [...cover, ...toc, ...body],
    },
  ],
});

Packer.toBuffer(doc).then((buf) => {
  fs.writeFileSync(OUT, buf);
  console.log("Wrote", OUT, buf.length, "bytes");
});
