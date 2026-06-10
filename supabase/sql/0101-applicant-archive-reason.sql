-- 0101 Applicant Archive Reason + Filter Cleanup
-- Adds structured archive reasons, removes Added as Member from active applicant workflow,
-- and preserves applicant lifecycle history in timeline events.

create extension if not exists pgcrypto;

alter table public.core_applications
  add column if not exists archive_reason_key text,
  add column if not exists archive_reason_label text,
  add column if not exists archive_reason_note text,
  add column if not exists archived_by_email text;

-- Convert any prior Added as Member terminal status into an archived applicant file
-- with a structured reason. This keeps the applicant history but removes it from
-- the active workflow.
update public.core_applications
set applicant_status = 'archived',
    status = 'archived',
    stage_key = 'archived',
    archived_at = coalesce(archived_at, now()),
    archive_reason_key = coalesce(nullif(archive_reason_key,''), 'added_as_member'),
    archive_reason_label = coalesce(nullif(archive_reason_label,''), 'Added as Member'),
    archive_reason = coalesce(nullif(archive_reason,''), 'added_as_member'),
    updated_at = now()
where applicant_status = 'added_as_member'
   or status = 'added_as_member'
   or stage_key = 'added_as_member';

-- Archive the old active workflow stage if present. It remains in history, but is
-- not part of the current active applicant progression.
update public.core_applicant_workflow_stages
set status = 'archived',
    archived_at = coalesce(archived_at, now()),
    updated_at = now(),
    settings_json = coalesce(settings_json,'{}'::jsonb) || jsonb_build_object('archived_by','0101-applicant-archive-reason','replacement','archive_reason: added_as_member')
where stage_key = 'added_as_member'
  and archived_at is null;

-- Ensure the active default stage set does not include Added as Member. Keep Archived
-- as the terminal catch-all state.
with stage_defaults(stage_key,label,description,category,portal_access_allowed,applicant_update_allowed,show_waitlist_position_default,sort_order) as (
  values
  ('new','New','Newly submitted application awaiting initial processing.','active',false,false,false,10),
  ('waitlist','Waitlist','Applicant is in the waitlist or applicant pool.','active',false,true,false,20),
  ('invited_to_interview','Invited to Interview','Applicant has been invited to an interview or board meeting.','active',false,true,false,30),
  ('onboarding','Onboarding','Applicant has been invited to complete onboarding requirements.','active',true,true,false,40),
  ('ready_for_final_review','Ready for Final Review','Required onboarding tasks are complete and final admin review is needed.','active',true,false,false,50),
  ('archived','Archived','Application lifecycle is closed. Archive reason explains why.','terminal',false,false,false,90)
)
insert into public.core_applicant_workflow_stages (
  organization_id, stage_key, label, description, category, portal_access_allowed,
  applicant_update_allowed, show_waitlist_position_default, sort_order, status, archived_at, settings_json
)
select o.organization_id, d.stage_key, d.label, d.description, d.category, d.portal_access_allowed,
  d.applicant_update_allowed, d.show_waitlist_position_default, d.sort_order, 'active', null,
  jsonb_build_object('seeded_by','0101-applicant-archive-reason')
from public.core_organizations o
cross join stage_defaults d
where o.archived_at is null
on conflict (organization_id, stage_key) do update set
  label = excluded.label,
  description = excluded.description,
  category = excluded.category,
  portal_access_allowed = excluded.portal_access_allowed,
  applicant_update_allowed = excluded.applicant_update_allowed,
  show_waitlist_position_default = excluded.show_waitlist_position_default,
  sort_order = excluded.sort_order,
  status = 'active',
  archived_at = null,
  settings_json = coalesce(public.core_applicant_workflow_stages.settings_json,'{}'::jsonb) || jsonb_build_object('updated_by','0101-applicant-archive-reason'),
  updated_at = now();

-- Store default archive reasons as structured settings for future filtering/reporting UI.
update public.core_applicant_settings
set workflow_settings_json = coalesce(workflow_settings_json,'{}'::jsonb) || jsonb_build_object(
      '0101_archive_reason_required', true,
      'archive_reasons', jsonb_build_array(
        jsonb_build_object('key','added_as_member','label','Added as Member'),
        jsonb_build_object('key','applicant_withdrew','label','Applicant Withdrew'),
        jsonb_build_object('key','club_declined','label','Club Declined'),
        jsonb_build_object('key','duplicate_application','label','Duplicate Application'),
        jsonb_build_object('key','no_response','label','No Response'),
        jsonb_build_object('key','other','label','Other')
      )
    ),
    updated_at = now()
where true;

create index if not exists core_applications_archive_reason_idx
  on public.core_applications (organization_id, archive_reason_key, archived_at)
  where archived_at is not null;
