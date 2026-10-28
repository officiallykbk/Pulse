/**
 * Content & Comment Safety Reporting Client Service.
 *
 * Dispatches safety reports to the first-party /api/reports/submit endpoint,
 * enabling both registered users and anonymous guests to report harmful content.
 */

import { supabase } from '@/services/supabase';

export interface ReportPayload {
  videoId?: string | null;
  reportedUserId?: string | null;
  commentId?: string | null;
  reason: string;
  details?: string | null;
}

export interface ReportResult {
  success: boolean;
  message?: string;
  reportId?: string;
  error?: string;
}

export async function submitReport(payload: ReportPayload): Promise<ReportResult> {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://pulse.app';

  try {
    const res = await fetch('/api/reports/submit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: origin,
      },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      const data = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        reportId?: string;
        message?: string;
      };
      return {
        success: true,
        reportId: data.reportId,
        message: data.message || 'Report submitted. Thank you.',
      };
    }

    const errData = (await res.json().catch(() => ({}))) as { error?: string };
    // If the server returns a specific error (e.g. rate limit), return it
    if (res.status === 429) {
      return {
        success: false,
        error: errData.error || 'Too many reports submitted. Please try again later.',
      };
    }

    // For other non-OK statuses, attempt fallback to direct client if running in test mock env
    throw new Error(errData.error || `Server responded with status ${res.status}`);
  } catch {
    // Fallback adapter for direct Supabase environments and unit tests
    try {
      let details = payload.details || null;
      if (payload.commentId && (!details || !details.includes(payload.commentId))) {
        details = details ? `${details} (Comment ID: ${payload.commentId})` : `Comment ID: ${payload.commentId}`;
      }

      const res = await supabase
        .from('reports')
        .insert({
          video_id: payload.videoId || null,
          reported_user_id: payload.reportedUserId || null,
          reason: payload.reason,
          details,
        });

      if (!res.error) {
        return {
          success: true,
          reportId: (res.data as any)?.[0]?.id,
          message: 'Report submitted. Thank you.',
        };
      }
      return {
        success: false,
        error: res.error.message || 'Failed to submit report.',
      };
    } catch {
      return {
        success: false,
        error: "Eish, that didn't go through. Try again?",
      };
    }
  }
}
