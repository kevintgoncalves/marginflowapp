-- TEST LAB ONLY. Fresh-schema replay lacks this ACL although migration 019 defines RLS.
-- This is a recorded setup prerequisite, NOT evidence that the original schema replay passes.
-- Do not apply to production without a separate authorization/permissions review.
GRANT SELECT ON public.marginflow_cloud_state TO authenticated;
