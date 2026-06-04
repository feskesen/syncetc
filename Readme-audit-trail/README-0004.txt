README-0004

Purpose
This package fixes the dirty/clean-state problem discovered after applying shared admin gating, and updates the Aircraft page contract so the Page Editor can manage Aircraft page copy/options without hardcoding 150th Aero data.

Problem addressed
Some admin pages treated ordinary selector changes as unsaved record edits. Layout Designer especially could show a nav-away warning after customer/view/preview selection even when no customer-facing style record had been changed. Page Editor also needed shared dirty-state communication with the admin shell so shell navigation protects real unsaved edits.

What changed
1. Layout Designer now compares the current style payload against a saved clean signature. Customer/profile/preview selectors no longer create false dirty warnings.
2. Page Editor now compares the current page payload against a saved clean signature and reports dirty state to the shared admin shell.
3. Page Editor now exposes Aircraft page fields: hero copy, manual stat cards, intro card, note strip, public display toggles, and aircraft labels.
4. Aircraft template contract metadata now reflects the rule that templates define structure, Page Editor defines page copy/options, Layout Designer defines look/feel, and aircraft records supply module data.

Important behavior note
Applying a system preset in Layout Designer still counts as dirty after it changes the actual style controls. That is intentional: it is an unsaved style change. Merely switching customer/profile/preview selectors should not count as dirty.

Security note
This package does not change true backend security. Admin page visibility remains a UI gate. True protection still comes from Supabase Auth, JWT verification, Edge Function checks, RLS, and Storage policies.

Expected next step
After this passes, the next work item should be the public Aircraft body renderer plan/build. That renderer should not include the organization header/footer and should not hardcode 150th Aero content. The 150th look should come from an organization style profile and page settings when 150th data is imported.
