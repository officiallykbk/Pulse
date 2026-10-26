# Testing

## Commands

```bash
npm test            # single run (CI-style)
npm run test:watch  # watch mode during development
npm run test:coverage
npm run typecheck   # tsc, no tests but catches type breaks
```

Runner: **Vitest 3** (jsdom environment) + **Testing Library**.
Config: `vitest.config.ts` (separate from the Vite build config). Setup file:
`src/test/setup.ts` (jest-dom matchers, cleanup per test, jsdom shims).

## Test map

| File | Covers | Count |
|---|---|---|
| `src/services/exoclick.test.ts` | Ad frequency rules (anon 5 / free 10 / pro 0, never first video), 5s skip rule, pop-under compliance (config must not contain the flag), VAST endpoint building | 11 |
| `src/services/paystack.test.ts` | `verifyPayment` decision logic: signed-in gate, server error surfacing, malformed bodies, network failure, no-browser-subscription-write regression guard, reference generation | 11 |
| `src/services/verifypayment.test.ts` | Edge function: CORS preflight, method/auth/reference validation, Paystack-not-configured, valid payment grants Pro, wrong amount/currency/status rejected, idempotency per reference, insert-failure handling, 30-day expiry written | 15 |
| `src/hooks/useVideos.test.ts` | Feed pagination: first page, offset append without duplicates, exhausted feed, empty feed, error propagation; profile content incl. liked-video ordering | 8 |
| `src/hooks/useAuth.test.ts` | Tier detection: anonymous / free / pro / expired-subscription fallback, sign-out, valid tier values | 6 |
| `src/components/settings.test.ts` | Settings persistence: defaults, round-trip, merge-over-defaults, corrupted storage | 4 |
| `src/components/screens.test.tsx` | SettingsScreen (toggles persist, delete confirmation, about links), SupportScreen (submission writes to DB, FAQ accordion, disabled send), ProUpgradeModal (pricing, closed state), VideoOptionsSheet (report reason picker, submit, back-out) | 16 |
| `src/components/editProfile.test.tsx` | Profile editing: load existing values, save name/bio, taken-name blocking, avatar type rejection, avatar upload path + saved URL | 6 |

**Total: 77 tests.**

## Key patterns

### Mocking Supabase
Frontend modules import the singleton from `@/services/supabase`. Tests
`vi.mock` that module and provide a chainable fake:

```ts
vi.mock('@/services/supabase', () => ({
  supabase: {
    from: (table: string) => builder,   // .select().eq().maybeSingle() chain
    auth: { getUser: vi.fn(async () => ({ data: { user }, error: null })) },
    storage: { from: () => ({ upload: vi.fn(), getPublicUrl: ... }) },
  },
}));
```

Use `vi.hoisted` for state the mock factory reads/writes, so the hoisted mock
sees it. Shared factories (`makeVideo`, `makeComment`, `makeProfile`) live in
`src/test/helpers.tsx`.

### Testing the edge function
`supabase/functions/verifypayment/index.ts` runs under Deno in production but
is tested directly: `vitest.config.ts` aliases `npm:@supabase/supabase-js@2.57.4`
to the local package, a stubbed `Deno` global captures the `Deno.serve` handler,
and `createClient` is module-mocked. The handler is then exercised with real
`Request`/`Response` objects. `src/services/verifypayment-fixtures.ts` performs
the import so the mock ordering stays correct.

### Screen tests
Render with Testing Library, interact with `userEvent`, assert on accessible
roles/text. Icon-only buttons need `aria-label` in the component (see Settings
"Go back") — the tests enforce this accessibility convention.

### jsdom limitations to stub
- `createImageBitmap` / canvas: stub for avatar-compression tests
- `URL.createObjectURL`: shimmed in `src/test/setup.ts`
- File inputs: dispatch `fireEvent.change(input, { target: { files: [...] } })`

## Adding tests

1. Place the file next to the code with a `.test.ts(x)` suffix
2. For new Supabase interactions, extend the mock builder rather than inventing a new one
3. Security-relevant rules (tier gating, payment verification, RLS-dependent
   behavior) must get a test at the moment the rule is written, not later
4. Run `npm test` before committing; keep the suite green
