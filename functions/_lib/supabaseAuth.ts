/**
 * Server-side Supabase Auth integration.
 * Communicates directly with Supabase Auth REST endpoints using anonymous key.
 * Never logs credentials or returned tokens.
 */

export interface SanitizedUser {
  id: string;
  email: string;
}

export interface SupabaseTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user: {
    id: string;
    email?: string;
  };
}

export interface AuthSuccessResult {
  user: SanitizedUser;
  tokens: {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
  };
}

export interface AuthErrorResult {
  error: string;
  status: number;
}

export type AuthResult = AuthSuccessResult | AuthErrorResult;

export async function supabaseSignIn(
  supabaseUrl: string,
  anonKey: string,
  email: string,
  password: string
): Promise<AuthResult> {
  try {
    const endpoint = new URL('/auth/v1/token?grant_type=password', supabaseUrl).toString();
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: anonKey,
      },
      body: JSON.stringify({ email, password }),
    });

    const data = await res.json() as Record<string, unknown>;
    if (!res.ok) {
      const msg = typeof data.error_description === 'string'
        ? data.error_description
        : (typeof data.msg === 'string' ? data.msg : (typeof data.message === 'string' ? data.message : 'Authentication failed'));
      return { error: msg, status: res.status };
    }

    const payload = data as unknown as SupabaseTokenResponse;
    if (!payload.access_token || !payload.refresh_token || !payload.user?.id) {
      return { error: 'Invalid response from auth provider', status: 502 };
    }

    return {
      user: {
        id: payload.user.id,
        email: payload.user.email ?? '',
      },
      tokens: {
        accessToken: payload.access_token,
        refreshToken: payload.refresh_token,
        expiresIn: payload.expires_in || 3600,
      },
    };
  } catch (err) {
    return { error: 'Failed to communicate with authentication service', status: 503 };
  }
}

export async function supabaseSignUp(
  supabaseUrl: string,
  anonKey: string,
  email: string,
  password: string
): Promise<AuthResult> {
  try {
    const endpoint = new URL('/auth/v1/signup', supabaseUrl).toString();
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: anonKey,
      },
      body: JSON.stringify({ email, password }),
    });

    const data = await res.json() as Record<string, unknown>;
    if (!res.ok) {
      const msg = typeof data.error_description === 'string'
        ? data.error_description
        : (typeof data.msg === 'string' ? data.msg : (typeof data.message === 'string' ? data.message : 'Registration failed'));
      return { error: msg, status: res.status };
    }

    const payload = data as unknown as SupabaseTokenResponse;
    if (payload.access_token && payload.refresh_token && payload.user?.id) {
      return {
        user: {
          id: payload.user.id,
          email: payload.user.email ?? '',
        },
        tokens: {
          accessToken: payload.access_token,
          refreshToken: payload.refresh_token,
          expiresIn: payload.expires_in || 3600,
        },
      };
    }

    // Email confirmation may be required
    if (payload.user?.id) {
      return {
        user: {
          id: payload.user.id,
          email: payload.user.email ?? '',
        },
        tokens: {
          accessToken: '',
          refreshToken: '',
          expiresIn: 0,
        },
      };
    }

    return { error: 'Registration incomplete', status: 400 };
  } catch (err) {
    return { error: 'Failed to communicate with authentication service', status: 503 };
  }
}

export async function supabaseRefreshToken(
  supabaseUrl: string,
  anonKey: string,
  refreshToken: string
): Promise<AuthResult> {
  try {
    const endpoint = new URL('/auth/v1/token?grant_type=refresh_token', supabaseUrl).toString();
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: anonKey,
      },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    const data = await res.json() as Record<string, unknown>;
    if (!res.ok) {
      return { error: 'Token refresh failed', status: res.status };
    }

    const payload = data as unknown as SupabaseTokenResponse;
    if (!payload.access_token || !payload.refresh_token || !payload.user?.id) {
      return { error: 'Invalid refresh response', status: 502 };
    }

    return {
      user: {
        id: payload.user.id,
        email: payload.user.email ?? '',
      },
      tokens: {
        accessToken: payload.access_token,
        refreshToken: payload.refresh_token,
        expiresIn: payload.expires_in || 3600,
      },
    };
  } catch {
    return { error: 'Network failure during refresh', status: 503 };
  }
}

export async function supabaseGetUser(
  supabaseUrl: string,
  anonKey: string,
  accessToken: string
): Promise<{ user: SanitizedUser | null; error?: string }> {
  try {
    const endpoint = new URL('/auth/v1/user', supabaseUrl).toString();
    const res = await fetch(endpoint, {
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!res.ok) {
      return { user: null, error: 'Unauthorized' };
    }

    const data = await res.json() as { id: string; email?: string };
    if (!data.id) return { user: null, error: 'User not found' };

    return {
      user: {
        id: data.id,
        email: data.email ?? '',
      },
    };
  } catch {
    return { user: null, error: 'Failed to retrieve user' };
  }
}

export async function supabaseRevokeToken(
  supabaseUrl: string,
  anonKey: string,
  accessToken: string
): Promise<void> {
  try {
    const endpoint = new URL('/auth/v1/logout', supabaseUrl).toString();
    await fetch(endpoint, {
      method: 'POST',
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${accessToken}`,
      },
    });
  } catch {
    // Best-effort logout revocation
  }
}

export async function fetchUserTier(
  supabaseUrl: string,
  anonKey: string,
  accessToken: string,
  userId: string
): Promise<'pro' | 'free'> {
  try {
    const endpoint = new URL('/rest/v1/subscriptions', supabaseUrl);
    endpoint.searchParams.set('user_id', `eq.${userId}`);
    endpoint.searchParams.set('status', 'eq.active');
    endpoint.searchParams.set('select', 'status,expires_at');
    endpoint.searchParams.set('order', 'expires_at.desc');
    endpoint.searchParams.set('limit', '1');

    const res = await fetch(endpoint.toString(), {
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!res.ok) return 'free';

    const subs = await res.json() as Array<{ status: string; expires_at: string | null }>;
    const sub = subs?.[0];
    if (sub) {
      if (sub.expires_at) {
        const expires = new Date(sub.expires_at).getTime();
        if (expires > Date.now()) return 'pro';
      } else {
        return 'pro';
      }
    }
    return 'free';
  } catch {
    return 'free';
  }
}
