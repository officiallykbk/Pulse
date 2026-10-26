/*
# Revoke explicit grants on trigger-only functions

1. Purpose
handle_new_user and the comment-count functions are trigger functions, not
RPC endpoints. An earlier migration explicitly granted EXECUTE to anon and
authenticated on some of them; PUBLIC revocation does not remove explicit
grants. This removes every explicit client grant so they can only run as
triggers.

2. Modified objects
- public.handle_new_user()
- public.increment_comment_count(uuid)
- public.decrement_comment_count(uuid)

3. Security
- These functions become unreachable via the Data API; triggers are
  unaffected (trigger invocation does not require EXECUTE grants).

4. Notes
- Idempotent.
*/

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.increment_comment_count(uuid) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.decrement_comment_count(uuid) FROM anon, authenticated, PUBLIC;
