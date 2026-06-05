README-0022

Purpose:
Patch the inline Info/FAQ manager workflow so that saving an FAQ leaves the editor ready for a new FAQ entry.

Problem addressed:
After saving a newly-created FAQ, the editor stayed selected on the saved record. This made it easy to accidentally keep editing the prior FAQ when the user believed they were adding additional new FAQs.

Change made:
After Save FAQ succeeds, the FAQ selection is cleared, the FAQ list refreshes, and the form returns to a blank New FAQ state. The status message now says: "FAQ item saved. Ready for new FAQ."

Expected next test:
Open Page Editor > Info > Structured FAQ Items. Add an FAQ, click Save FAQ, and confirm the form clears and is ready for the next FAQ.

Files changed:
- assets/admin/ADMIN-PAGE-page-editor-current.js
