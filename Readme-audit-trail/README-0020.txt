README-0020 — Info/FAQ admin cleanup patch

Purpose
- Cleaned up Info/FAQ admin editing after initial testing.
- Reduced confusion around FAQ record creation/saving.
- Clarified manual officer row format.
- Avoided suggesting or rendering public officer email addresses.

Problem addressed
- FAQ Manager used a functional but confusing create/save/new workflow.
- New FAQ / clear behavior needed clearer dirty-state protection and labels.
- Manual officers were labeled as JSON and suggested email fields, which conflicts with the public-contact approach.
- Public officer emails should not be encouraged because public emails can be scraped.

What changed
- FAQ Manager now treats the main action as Save FAQ for both new and existing records.
- FAQ Manager dirty-state tracking is tightened so unsaved new records warn before discard.
- FAQ Manager labels now say Discard / Clear Form, Archive FAQ, and Restore FAQ.
- FAQ archive/restore actions ask for confirmation.
- Page Editor now labels the officer field as Manual Officer Rows.
- Manual officer placeholder now uses Role | Name format only.
- Officer helper text explains pipe usage and says public emails are intentionally not shown.
- Public Info renderer accepts either the new Role | Name line format or older JSON rows, but ignores email values and does not render mailto links.

Files in this package
- ADMIN-PAGE-page-editor-current.js: upload to assets/admin/
- ADMIN-PAGE-faq-manager-current.js: upload to assets/admin/
- PUBLIC-PAGE-info-current.js: upload to assets/public/
- README-0020.txt: upload to readme audit trail/

Expected next
- Test Manual Officer Rows using examples like: President | Jane Smith.
- Test FAQ Manager by typing a new unsaved FAQ and clicking New FAQ or switching records; it should warn before discarding.
- Longer term, replace manual officer rows with a true repeatable mini-editor and dynamic roster/role integration.
