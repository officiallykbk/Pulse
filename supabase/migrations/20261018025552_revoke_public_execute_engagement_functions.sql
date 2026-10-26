/*
# Revoke default PUBLIC execute on engagement functions

1. Purpose
New database functions grant EXECUTE to the implicit PUBLIC role by default.
The previous lockdown revoked execute from the anon and authenticated roles
but not from PUBLIC, so anonymous visitors could still call the engagement
counter functions directly. This migration closes that path:

- REVOKE EXECUTE FROM PUBLIC on all four functions.
- GRANT EXECUTE back, explicitly, to authenticated for the two functions
  signed-in users are meant to call (increment_view_count,
  increment_share_count).
- The two comment-count functions stay internal (trigger-only): no grants
  to any client role, and they no-op outside a trigger.

2. Modified objects
- public.increment_view_count(uuid)
- public.increment_share_count(uuid)
- public.increment_comment_count(uuid)
- public.decrement_comment_count(uuid)

3. Security
- Anonymous counter inflation is no longer possible via RPC.
- Signed-in users can still bump views and shares through the app.
- handle_new_user is also revoked from PUBLIC (it is a trigger function and
  was never meant to be RPC-callable).

4. Notes
- Idempotent; safe to re-run.
*/

REVOKE EXECUTE ON FUNCTION public.increment_view_count(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.increment_share_count(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.increment_comment_count(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.decrement_comment_count(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.increment_view_count(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.increment_share_count(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;
