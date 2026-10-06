// Builds docs/SignaturePad-User-Guide.docx from the same content as docs/user-guide.md.
// Keep both in sync. Run from the SignaturePad folder:
//   npm i --no-save docx && node docs/build-guide.js
// Then open the .docx in Word, right-click the table of contents > Update field, save,
// and File > Save As > PDF to refresh SignaturePad-User-Guide.pdf.
const fs = require("fs");
const path = require("path");
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, Table, TableRow, TableCell,
  WidthType, ShadingType, BorderStyle, ImageRun, TableOfContents, Header, Footer, PageNumber,
  LevelFormat, PageBreak, ExternalHyperlink, TabStopType,
} = require("docx");

const ROOT = path.resolve(__dirname, "..");
const IMG = (n) => fs.readFileSync(path.join(ROOT, "docs/img", n));
const OUT = path.join(ROOT, "docs/SignaturePad-User-Guide.docx");

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
  new Paragraph({ spacing: { before: 120, after: 0 }, children: [new TextRun({ text: "Signature Pad", bold: true, size: 72, color: DARK })] }),
  new Paragraph({ spacing: { after: 240 }, children: [new TextRun({ text: "User Guide", size: 44, color: MUTED })] }),
  new Paragraph({
    spacing: { after: 480 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: BRAND, space: 12 } },
    children: [new TextRun({ text: "Sign or draw on Dynamics 365 / Dataverse model-driven forms. The picture is saved as a PNG Note attachment on the record.", size: 24, color: DARK })],
  }),
  ...image("signature-saved.png", 560, 229),
  new Paragraph({ spacing: { before: 1400, after: 60 }, children: [new TextRun({ text: "Version 0.1.0  ·  October 2026", size: 22, color: MUTED })] }),
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
  p("Signature Pad adds a signing and drawing area to any model-driven form. Users sign or draw with a mouse, pen or finger, rub out part of it with the eraser and draw that part again, and save. The picture is saved as a **PNG Note attachment** (`annotation`) on the record, for example `Signature 2026-10-05 14-30.png`, the same place the timeline's *Add attachment* puts files, so flows, reports and Word templates can use it."),
  p("It is a free PCF (Power Apps component framework) control built with React and Fluent UI v9, so it follows the app's theme and looks like the rest of the form."),
  ...image("signature-pad.png", 560, 201, "Signature mode: the pad, the toolbar and a note about the signature"),
  h2("Features"),
  table(["Feature", "Details"], [
    ["Two modes", "**Signature**: one signature per record, shown in place of the pad once saved, cropped to the ink. **Drawing**: a bigger canvas with six colours and a list of saved drawings, newest first."],
    ["Mouse, pen and touch", "Smooth lines. With a pen (Surface Pen, Apple Pencil, Wacom) the line gets thicker the harder you press."],
    ["Eraser", "Rub out part of the picture and draw that part again. Three eraser sizes."],
    ["Undo / redo", "Undo and redo every stroke, eraser stroke and Clear (**Ctrl+Z** / **Ctrl+Y**)."],
    ["Clear", "Wipes the whole pad in one click. It can be undone."],
    ["Colours and sizes", "Thin, medium and thick pen. Black and blue in Signature mode; black, blue, red, green, orange and purple in Drawing mode."],
    ["Note with each image", "Type a short note with each picture, for example *First floor*, *Kitchen table* or the signer's name. It is shown as the picture's title and saved in the Note's description. Optional, required or off."],
    ["Edit saved images", "Open a saved signature or drawing on the pad, erase or add to it, and save it back to the same Note."],
    ["Saved list", "Saved images are listed newest first; an image you edit moves to the top. Download and delete (with confirmation) on each."],
    ["Image name", "Saved as `Signature.png` / `Drawing.png` or your own name, with the date and time added if you want."],
    ["Replace or keep", "Keep one image per record (the earlier one is deleted when a new one is saved), or keep them all."],
    ["Required signature", "Optionally writes the file name into the host column, so a business rule or required setting can check that the record was signed."],
  ], [2400, 6626]),

  h1("2. Requirements"),
  ...bullets([
    "A Dataverse environment with **model-driven apps** (Unified Interface) in a browser (Edge, Chrome, Firefox, Safari). Canvas apps and Power Pages are not supported. Touch and pen work through the browser's pointer events; the Power Apps mobile app is not tested yet.",
    "The table you add it to must have **Attachments (including notes and files)** enabled (Power Apps > Tables > your table > Properties > Advanced options).",
    "A **single line of text** column on that table to host the control. The control doesn't change the column's value unless *Fill host field when saved* is on, so you can use any text column or create a dedicated one (for example *Signature*).",
    "System Customizer or System Administrator role to import the solution and edit forms.",
  ]),

  h1("3. Install the solution", false),
  ...numbered([
    "Download `ArtSignaturePad_managed.zip` from the latest **Signature Pad** release on github.com/ankitrana/PCF-Controls/releases (under *Assets*).",
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
    "Choose **Signature Pad (AnkitRana-Tech)**.",
    "Set the options (see section 5), leave **Web**, **Mobile** and **Tablet** ticked, and click **Done**.",
    "Optional: in the column's properties, tick **Hide label** so the pad uses the full width.",
    "**Save and publish** the form, then open any existing record to see the control.",
  ]),
  note("Classic form editor: double-click the column > **Controls** tab > **Add Control...** > Signature Pad (AnkitRana-Tech) > set the options > select the Web / Phone / Tablet options > **OK**.", "Tip"),
  p("You can put the control on the form more than once with different image names, for example *Customer signature* and *Engineer signature* on a work order. Each one only looks at its own images."),

  h1("5. Settings reference"),
  table(["Setting", "Default", "What it does"], [
    ["**Host field**", "Required", "The text column the control sits on. Only changed when Fill host field when saved is Yes."],
    ["**Mode**", "Signature", "**Signature**: after saving, the saved signature is shown with Edit, Sign again, Download and Delete; the image is cropped to the ink. **Drawing**: the pad stays open with more colours, and saved drawings are listed under it; the image is the whole pad."],
    ["**Image name**", "Empty", "File name without `.png`, for example `Customer signature`. Empty = `Signature` or `Drawing`. Characters not allowed in file names are removed."],
    ["**Add date to file name**", "Yes", "Yes: `Signature 2026-10-05 14-30.png`. No: `Signature.png`."],
    ["**When a new image is saved**", "Replace", "**Replace**: after a new image is saved, the earlier images with the same name are deleted, so the record keeps one. **Keep**: every saved image stays (a second image with the same name gets ` (2)`)."],
    ["**Note title**", "Empty", "Title (subject) of the Note. Empty = the image name."],
    ["**Note with each image**", "Optional", "**Optional**: a note box under the pad. **Required**: the image can't be saved without a note. **Off**: no box. Saved in the Note's description, shown as the image's title, editable with Edit. Up to 250 characters."],
    ["**Pen colour**", "Empty (black)", "Starting colour as a hex code, for example `#1F3B8C`. A colour that isn't in the palette is added to it."],
    ["**Pen width (px)**", "Empty (3)", "Starting pen thickness, 1 to 20. Thin is 0.6x and thick is 2x this."],
    ["**Pad height (px)**", "Empty", "Height of the drawing area, 100 to 1200. Empty = 200 (Signature) or 360 (Drawing). The width follows the form."],
    ["**Image background**", "White", "White or Transparent background in the saved PNG."],
    ["**Allow delete**", "Yes", "Show the delete button on saved images. Users still need Delete permission on Notes."],
    ["**Fill host field when saved**", "No", "Yes: write the newest file name into the host column after a save, and clear it when the last image is deleted. The user then saves the form."],
  ], [2500, 1300, 5226]),
  spacer(),
  h2("Example setups"),
  table(["Scenario", "Settings"], [
    ["Customer sign-off on a Work Order", "Mode *Signature* · Image name *Customer signature* · Note with each image *Required* (the signer types their name) · Pen colour `#1F3B8C` · Fill host field when saved *Yes*"],
    ["Damage sketch on an Inspection table", "Mode *Drawing* · Image name *Damage sketch* · When a new image is saved *Keep* · Note with each image *Required* (*First floor*, *Kitchen table*...) · Pad height *450*"],
  ], [3200, 5826]),

  h1("6. Using the control"),
  ...image("signature-edit.png", 560, 218, "Editing a saved signature: part of it rubbed out with the eraser"),
  table(["Action", "How"], [
    ["Sign or draw", "Draw on the white area with a mouse, pen or finger. Choose a colour and a thickness in the toolbar."],
    ["Rub out part of it", "Pick the **Eraser** (and a size), rub over the part to remove, switch back to the **Pen** and draw it again."],
    ["Undo / redo", "The arrow buttons, or **Ctrl+Z** / **Ctrl+Y** while the pad has focus."],
    ["Start over", "**Clear** wipes the pad. Undo brings it back."],
    ["Note", "Type what the picture is under the pad, for example *Second floor* or the signer's name. It becomes the picture's title in the list."],
    ["Save", "**Save signature** / **Save drawing**. The picture is saved as a Note straight away; saving the form is not needed (unless Fill host field when saved is on)."],
    ["Edit a saved image", "Click the pencil. It opens on the pad with its note; change it, then **Save changes**. The same Note is updated, its file name gets the new date, and it moves to the top."],
    ["Sign again", "Signature mode: starts a fresh signature. With Replace, the old one is deleted once the new one is saved. **Cancel** goes back to the saved one."],
    ["Download / delete", "The buttons on each saved image. Delete asks first."],
    ["Unsaved strokes", "Switching to another image or cancelling asks before throwing away unsaved strokes. Leaving the record does not ask, so save first."],
    ["New record", "The pad works, but saving shows \"Save the record first, then save the signature.\" Save the record, then click Save on the pad."],
    ["Read-only form", "Saved images are shown with Download only."],
  ], [2400, 6626]),
  ...image("drawing-mode.png", 480, 445, "Drawing mode: three saved drawings with notes, newest first"),

  h1("7. How images are saved"),
  table(["Item", "Details"], [
    ["Format", "PNG, at twice the on-screen size so it stays sharp in documents and when printed. A signature is usually 20 to 60 KB."],
    ["Where", "A Note (`annotation`) on the record: Title = Note title setting, Description = the user's note, File name = image name (+ date), MIME type `image/png`. It shows in the timeline."],
    ["Cropping", "Signature mode crops the image to the ink with a small margin. Drawing mode saves the whole pad."],
    ["Which images the control shows", "Only PNG Notes on this record whose file name is the image name, optionally followed by the date and ` (2)`, ` (3)`... Other attachments are never shown, changed or deleted."],
    ["Replace", "With Replace, saving a new image deletes the control's earlier images (same rule as above). Editing an image updates that Note and leaves the others alone."],
  ], [2600, 6426]),
  note("The control stores a picture of a signature with who saved it and when (the Note's Modified by / Modified on). It does not verify identity or seal the document. For contracts that need a certified electronic signature, use a dedicated e-signature service.", "Is this a legal e-signature?"),

  h1("8. Security"),
  p("The control uses the signed-in user's own permissions. Nothing is elevated. Users need:"),
  table(["To...", "Privilege needed"], [
    ["See saved images", "Read on **Note**"],
    ["Save a new image", "Create on **Note**, Append on **Note**, Append To on the **record's table**"],
    ["Edit a saved image", "Write on **Note**"],
    ["Delete, or save with Replace", "Delete on **Note** (and the Allow delete setting on, for the delete button)"],
    ["Fill host field when saved", "Write on the record's table"],
  ], [2600, 6426]),
  spacer(),
  p("With Replace, a user who can create Notes but not delete them still saves the new image; the control then says the earlier image could not be removed."),

  h1("9. Troubleshooting"),
  table(["Problem", "Fix"], [
    ["Control doesn't appear in the component list", "Check that the solution imported, and that you selected a **single line of text** column."],
    ["\"Save the record first, then save the signature.\"", "The record is new. Save it once, then click Save on the pad."],
    ["Save fails with a message about `objectid_...`", "Notes aren't enabled on the table. Turn on **Attachments (including notes and files)** in the table's advanced options. This can't be turned off again later."],
    ["Save button stays grey", "The pad is empty. Draw something first."],
    ["\"Add a note about this ... before saving.\"", "Note with each image is Required. Type a note under the pad."],
    ["\"There is nothing to save.\"", "Everything was erased. Undo, or draw again."],
    ["A saved signature isn't shown", "It has a different file name (renamed, or the Image name setting changed). The control only shows its own images; see section 7."],
    ["Page scrolls instead of drawing on a phone", "Start the stroke inside the white area; the pad blocks scrolling only there."],
    ["Form says it has unsaved changes after signing", "Fill host field when saved is Yes, which writes to the host column. Save the form."],
    ["Delete button missing", "Allow delete is No, the form is read-only, or the record is inactive."],
  ], [3600, 5426]),
  spacer(),
  p("Still stuck? Report it with the control version, browser, steps and the error text. Please don't include customer data or organization URLs."),

  h1("10. Update or uninstall", false),
  ...bullets([
    "**Update**: import the newer managed zip over the existing one (Solutions > Import > Upgrade). Form settings are kept.",
    "**Uninstall**: remove the control from every form first (form > column > Components > delete the component > Save and publish), then delete the Signature Pad solution. Saved images are Notes, so they stay on the records.",
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
  title: "Signature Pad - User Guide",
  description: "User guide for the Signature Pad PCF control",
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
            new TextRun({ text: "Signature Pad  ·  User Guide", size: 16, color: MUTED }),
            new TextRun({ text: "\tv0.1.0", size: 16, color: MUTED }),
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
