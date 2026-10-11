# Changelog - File Drop Zone

## 0.3.0 - 2026-10-11
- New publisher: Montariva Technology (prefix `mrt`, namespace `MontarivaTechnology`). The solution is now `MrtFileDropZone` and the release asset `MrtFileDropZone_managed.zip`; the control shows as *File Drop Zone (Montariva Technology)*.
- Because the publisher changed, this version can't upgrade 0.2.0 or earlier. If you imported an earlier version, remove the control from your forms, delete the `ArtFileDropZone` solution, then import this one.

## 0.2.0 - 2026-10-03
- Reads the environment's attachment rules (max upload size, blocked extensions, blocked/allowed MIME types); file type and size settings are now optional and only make the limits stricter.
- Files over 4 MB upload in blocks (`InitializeAnnotationBlocksUpload` / `UploadBlock` / `CommitAnnotationBlocksUpload`) with % progress and cancel.
- Duplicate file names: Replace / Keep both / Skip.
- Folder drops and paste (Ctrl+V) support.
- Preview dialog for images, PDFs and text files; image thumbnails in the list (new *Show image thumbnails* setting).
- Ready-to-import managed solution (`ArtFileDropZone_managed.zip`) on GitHub Releases.

## 0.1.0 - 2026-10-03
- First version: drag-and-drop or browse to upload files as Note attachments, file type / size / count checks, upload queue with 3 parallel uploads and retry, list / download / delete of existing attachments, test harness demo mode.
