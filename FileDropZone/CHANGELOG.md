# Changelog - File Drop Zone

## 0.2.0 - 2026-10-03
- Reads the environment's attachment rules (max upload size, blocked extensions, blocked/allowed MIME types); file type and size settings are now optional and only make the limits stricter.
- Files over 4 MB upload in blocks (`InitializeAnnotationBlocksUpload` / `UploadBlock` / `CommitAnnotationBlocksUpload`) with % progress and cancel.
- Duplicate file names: Replace / Keep both / Skip.
- Folder drops and paste (Ctrl+V) support.
- Preview dialog for images, PDFs and text files; image thumbnails in the list (new *Show image thumbnails* setting).

## 0.1.0 - 2026-10-03
- First version: drag-and-drop or browse to upload files as Note attachments, file type / size / count checks, upload queue with 3 parallel uploads and retry, list / download / delete of existing attachments, test harness demo mode.
