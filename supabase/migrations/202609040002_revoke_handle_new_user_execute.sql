-- This SECURITY DEFINER function is only invoked by the auth.users trigger.
-- It must not be exposed as a public RPC endpoint.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
