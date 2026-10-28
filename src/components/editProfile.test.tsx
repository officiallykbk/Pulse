import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EditProfileScreen } from '@/components/EditProfileScreen';
import { makeProfile } from '@/test/helpers';

type Builder = Record<string, unknown> & { then?: (resolve: (v: unknown) => void) => void };

const state = vi.hoisted(() => ({
  profileRow: null as Record<string, unknown> | null,
  uniquenessResult: null as Record<string, unknown> | null,
  updates: [] as Array<Record<string, unknown>>,
  uploadCalls: [] as string[],
  uploadError: null as string | null,
}));

vi.mock('@/services/supabase', () => ({
  supabase: {
    auth: {
      getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } }, error: null })),
    },
    from: (table: string) => {
      const ctx = { method: 'select', payload: undefined as unknown };
      const builder: Builder = {
        select: () => builder,
        eq: () => builder,
        maybeSingle: () => ({
          then: (resolve: (v: unknown) => void) => {
            if (table === 'profiles' && ctx.method === 'select') {
              resolve({ data: state.profileRow, error: null });
            } else {
              resolve({ data: state.uniquenessResult, error: null });
            }
          },
        }),
        update: (payload: Record<string, unknown>) => {
          ctx.method = 'update';
          ctx.payload = payload;
          return builder;
        },
        // update().eq() resolves the update
        single: () => builder,
        then: (resolve: (v: unknown) => void) => {
          if (ctx.method === 'update') {
            state.updates.push(ctx.payload as Record<string, unknown>);
            resolve({ data: null, error: null });
          } else {
            resolve({ data: state.uniquenessResult, error: null });
          }
        },
      };
      return builder;
    },
    storage: {
      from: () => ({
        upload: vi.fn(async (path: string) => {
          state.uploadCalls.push(path);
          if (state.uploadError) return { data: null, error: { message: state.uploadError } };
          return { data: { path }, error: null };
        }),
        getPublicUrl: (path: string) => ({ data: { publicUrl: `https://s/${path}` } }),
      }),
    },
  },
}));

const baseProps = { onBack: vi.fn(), onSaved: vi.fn() };

beforeEach(() => {
  state.profileRow = null;
  state.uniquenessResult = null;
  state.updates = [];
  state.uploadCalls = [];
  state.uploadError = null;
  vi.clearAllMocks();
});

describe('EditProfileScreen', () => {
  it('renders name and bio fields with save disabled until edited', async () => {
    render(<EditProfileScreen {...baseProps} />);
    await waitFor(() => expect(screen.getByPlaceholderText(/how should we show you/i)));
    expect(screen.getByRole('button', { name: /save changes/i })).toBeDisabled();
  });

  it('loads existing profile values', async () => {
    state.profileRow = { ...makeProfile(), display_name: 'Kwame', bio: 'Accra films' };
    render(<EditProfileScreen {...baseProps} />);
    await waitFor(() =>
      expect(screen.getByDisplayValue('Kwame')).toBeInTheDocument()
    );
    expect(screen.getByDisplayValue('Accra films')).toBeInTheDocument();
  });

  it('saves display name and bio changes', async () => {
    const user = userEvent.setup();
    state.profileRow = { ...makeProfile() };
    render(<EditProfileScreen {...baseProps} />);
    const nameInput = await screen.findByPlaceholderText(/how should we show you/i);
    await user.type(nameInput, 'Ama');
    await user.type(screen.getByPlaceholderText(/accra\. short films/i), 'Filmmaker');
    await user.click(screen.getByRole('button', { name: /save changes/i }));
    await waitFor(() => expect(state.updates).toHaveLength(1));
    expect(state.updates[0]).toMatchObject({ display_name: 'Ama', bio: 'Filmmaker' });
    await waitFor(() => expect(baseProps.onSaved).toHaveBeenCalled());
  });

  it('flags a taken display name and blocks saving', async () => {
    const user = userEvent.setup();
    state.profileRow = { ...makeProfile() };
    // Uniqueness queries come after profile load; every maybeSingle after the
    // first sees a row owned by a different user => name taken
    let profileLoaded = false;
    const supabaseModule = (await import('@/services/supabase')) as unknown as {
      supabase: { from: (table: string) => Builder };
    };
    const originalFrom = supabaseModule.supabase.from;
    supabaseModule.supabase.from = (table: string) => {
      const chain = originalFrom(table);
      if (table === 'profiles') {
        const origMaybeSingle = chain.maybeSingle as () => { then: (r: (v: unknown) => void) => void };
        chain.maybeSingle = () => ({
          then: (resolve: (v: unknown) => void) => {
            origMaybeSingle().then((result) => {
              const row = result as { data: Record<string, unknown> | null } | null;
              if (profileLoaded && row?.data?.id === 'user-1') {
                resolve({ data: { id: 'other-user', display_name: 'X' }, error: null });
              } else {
                profileLoaded = true;
                resolve(row);
              }
            });
          },
        }) as Builder;
      }
      return chain;
    };

    render(<EditProfileScreen {...baseProps} />);
    const nameInput = await screen.findByPlaceholderText(/how should we show you/i);
    await user.clear(nameInput);
    await user.type(nameInput, 'TakenName');

    await waitFor(() => expect(screen.getByText('That name is taken')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /save changes/i })).toBeDisabled();
  });

  it('rejects a non-image avatar file', async () => {
    state.profileRow = { ...makeProfile() };
    render(<EditProfileScreen {...baseProps} />);
    await screen.findByPlaceholderText(/how should we show you/i);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input).not.toBeNull();

    const file = new File(['x'], 'doc.pdf', { type: 'application/pdf' });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() =>
      expect(screen.getByText(/Avatar must be a JPG, PNG, or WebP image/i)).toBeInTheDocument()
    );
    expect(state.uploadCalls).toHaveLength(0);
  });

  it('uploads a valid avatar to the user folder and saves the URL', async () => {
    const user = userEvent.setup();
    state.profileRow = { ...makeProfile() };
    render(<EditProfileScreen {...baseProps} />);
    await screen.findByPlaceholderText(/how should we show you/i);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;

    // jsdom cannot decode images for canvas compression; stub the decode step
    vi.stubGlobal('createImageBitmap', async () => ({
      width: 100,
      height: 100,
      close: () => {},
    }));
    const canvasSpy = vi
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValue({
        drawImage: () => {},
      } as unknown as CanvasRenderingContext2D);
    const toBlobSpy = vi
      .spyOn(HTMLCanvasElement.prototype, 'toBlob')
      .mockImplementation((cb: BlobCallback) => {
        cb(new Blob(['jpegdata'], { type: 'image/jpeg' }));
      });

    const png = new File([new Uint8Array([137, 80, 78, 71])], 'me.png', { type: 'image/png' });
    fireEvent.change(input, { target: { files: [png] } });
    await user.type(await screen.findByPlaceholderText(/how should we show you/i), 'Ama');
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(state.uploadCalls.length).toBeGreaterThan(0));
    expect(state.uploadCalls[0].startsWith('user-1/')).toBe(true);
    await waitFor(() => {
      const update = state.updates.find((u) => 'avatar_url' in u);
      expect(update?.avatar_url).toContain('user-1/avatar');
    });

    vi.unstubAllGlobals();
    canvasSpy.mockRestore();
    toBlobSpy.mockRestore();
  });
});
