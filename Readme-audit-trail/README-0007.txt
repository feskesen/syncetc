README-0007
Package: Page Editor history plus reset-to-default controls

Problem addressed:
- Page Editor needed recoverability after accidental saves to the wrong customer/page.
- Layout Designer already had history/restore, but did not have an explicit reset-to-system-default action.
- Page Editor did not yet have a visible history/restore panel.

What changed:
- Added core_page_settings_history for Page Editor restore points.
- Updated core-admin-action to write page history before and after Page Editor saves.
- Added backend actions to list Page Editor history, restore a Page Editor snapshot, reset Page Editor settings to template defaults, and reset Layout Designer style to the system default.
- Updated Page Editor UI with a History / Restore panel and Revert page to template default button.
- Updated Layout Designer UI with Revert style to system default button.

Important behavior:
- Page Editor history covers page settings/content/options. It does not currently restore page slug, status, or navigation visibility.
- Revert page to template default resets page copy/options only. It does not change page slug, status, or navigation visibility.
- Revert style to system default resets the active style profile to the Clean Blue system default and writes restore points before and after the reset.
- Backend/RLS permissions remain platform-admin only.

Expected next:
- Test Page Editor save, restore, and revert-to-default.
- Test Layout Designer revert-to-default and restore from the history entry created immediately before the reset.
- If these pass, proceed to the next public/customer-facing page or to a better site shell/header/footer system.
