README-0015
Package: Media Library + Public Gallery Video/Batch Patch

Purpose
This package fixes the Media Library uploader issues found during testing and upgrades the public Gallery renderer so the media model is ready for photos and YouTube-hosted videos.

Problems Addressed
1. The Media Library uploader only handled one image at a time.
2. Uploaded image previews/thumbnails could appear cropped instead of contained/windowed.
3. Saving a media item did not visibly clear the form afterward.
4. The public Gallery needed a cleaner path to support videos, including YouTube thumbnails and a lightbox player.
5. The old 150th gallery references used a public gallery, a board/admin gallery manager, and a member submission page. This package incorporates the useful patterns without copying 150th-specific hardcoded content.

What Changed
- Media Library now accepts multiple image files in one drag/drop or file-picker operation.
- Shared caption, credit, visibility, status, approval, featured flag, and sort settings can be applied to all images in the batch.
- Media Library previews and list thumbnails use contain/windowed image treatment.
- Save now clears the form after a successful save.
- Media records now support source_type, external_url, external_provider, external_id, and approval_status.
- Public Gallery now supports image cards and YouTube video cards.
- Public Gallery adds filter tabs for All, Photos, Videos, and Featured when applicable.
- Public Gallery opens images in a lightbox and YouTube videos in an embedded lightbox player.

Deferred Intentionally
- Member-submitted gallery upload page is not built yet because member-facing auth/role/RLS flow is not fully complete.
- Self-hosted video upload/streaming is schema-ready but not treated as the primary video strategy yet. YouTube/external video support is the MVP path.

Expected Next
Test Media Library batch uploads, YouTube URL media records, /home featured photo behavior, and /gallery image/video rendering. If stable, the next module can be either Info/FAQ or the member-facing Gallery Submission workflow after member access is ready.
