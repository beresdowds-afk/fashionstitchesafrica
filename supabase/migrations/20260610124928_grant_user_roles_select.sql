-- Fix: user_roles had RLS policies but no table-level grants, so PostgREST
-- returned 0 rows for every signed-in user (including super admins). That
-- caused the OAuth role picker to re-trigger and /super-admin guard to fail.
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
