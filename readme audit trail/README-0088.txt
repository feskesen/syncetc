README-0088 — Calendar / RSVP People Integration Upgrade

Purpose:
Upgrade the existing Calendar/Event/RSVP groundwork now that the People system exists. This is not a rebuild. It extends current event and RSVP records so logged-in RSVPs can link to person_id and membership_id and event-level rules can be enforced in the backend.

Included:
1. Adds event-level visibility/RSVP rule fields:
   - visibility_audience
   - rsvp_audience
   - rsvp_deadline_at
   - waitlist_enabled
   - show_attendee_list
   - allowed_membership_class_keys
   - allowed_role_keys
   - organizer_person_id / organizer_membership_id
   - rsvp_settings_json

2. Adds People-linked RSVP fields:
   - person_id
   - membership_id
   - attending_self
   - guest/adult/child counts
   - private/admin notes
   - rsvp_scope

3. Adds admin RSVP view and RSVP event/audit table.

4. Updates public calendar:
   - event modal
   - list/compact/month views
   - public events still public-safe
   - logged-in sessions try to load accessible member/admin events through core-access-action

5. Updates RSVP page:
   - logged-in member RSVP is tied to People/membership
   - public RSVP remains available only for public events with public RSVP enabled
   - attendee summary/list support
   - capacity/waitlist/deadline enforcement

6. Updates Events Admin:
   - visibility audience
   - RSVP audience
   - deadline
   - waitlist
   - attendee-list visibility
   - class/role keys
   - RSVP export

Privacy and access:
- Backend enforces event visibility and RSVP eligibility.
- Public API only returns public events from core_events_public_v1.
- Member RSVP actions require authenticated access and organization context.
- Admin RSVP actions require event/admin permissions.

Known limits:
- This is a rules/people integration upgrade, not a final fancy calendar UI clone.
- Manual admin RSVP add/edit is backend-ready; the included Events Admin page focuses on listing/exporting RSVPs and event rule editing.
- If a Webflow RSVP page uses a different URL than /event-rsvp, keep the same script file but update links later through nav/page setup.
