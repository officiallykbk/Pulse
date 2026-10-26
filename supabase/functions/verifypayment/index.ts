// verifypayment: Unified Multi-Gateway Payment Engine (Moolre, Stripe, Paystack).
// Confirms the payment directly with the provider using server-side secrets,
// then writes the subscription row via the service role (bypassing RLS),
// so the browser can never grant itself Pro.

import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface VerifyRequest {
  reference?: string;
  provider?: "moolre" | "stripe" | "paystack";
  action?: "verify" | "initiate";
  phoneNumber?: string;
  network?: string;
  amount?: number;
  email?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body: VerifyRequest = await req.json().catch(() => ({}));
    const reference = body.reference?.trim();
    if (!reference) {
      return new Response(JSON.stringify({ error: "Missing payment reference" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const provider = body.provider || "paystack";

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      {
        global: { headers: { Authorization: authHeader } },
        auth: { persistSession: false, autoRefreshToken: false },
      }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Not signed in" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // --- Provider Verification Handlers ---
    if (provider === "moolre") {
      const moolreApiKey = Deno.env.get("MOOLRE_API_KEY");
      if (!moolreApiKey) {
        return new Response(JSON.stringify({ error: "Moolre is not configured yet" }), {
          status: 503,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const moolreRes = await fetch(
        `https://api.moolre.com/v1/transactions/verify/${encodeURIComponent(reference)}`,
        { headers: { Authorization: `Bearer ${moolreApiKey}`, Accept: "application/json" } }
      );

      if (!moolreRes.ok) {
        return new Response(JSON.stringify({ error: "Moolre verification failed" }), {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const payload = await moolreRes.json();
      const status = payload?.status || payload?.data?.status;
      const isPaid = status === "success" || status === "completed";
      const currency = payload?.currency || payload?.data?.currency;
      const amount = payload?.amount || payload?.data?.amount || 0;

      if (!isPaid || currency !== "GHS" || amount < 10) {
        return new Response(JSON.stringify({ error: "Payment not completed or invalid" }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } else if (provider === "stripe") {
      const stripeSecret = Deno.env.get("STRIPE_SECRET_KEY");
      if (!stripeSecret) {
        return new Response(JSON.stringify({ error: "Stripe is not configured yet" }), {
          status: 503,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const stripeRes = await fetch(
        `https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(reference)}`,
        { headers: { Authorization: `Bearer ${stripeSecret}` } }
      );

      if (!stripeRes.ok) {
        return new Response(JSON.stringify({ error: "Stripe verification failed" }), {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const payload = await stripeRes.json();
      const isPaid = payload?.payment_status === "paid";
      if (!isPaid) {
        return new Response(JSON.stringify({ error: "Payment not completed or invalid" }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } else {
      // Default / Paystack provider
      const paystackSecret = Deno.env.get("PAYSTACK_SECRET_KEY");
      if (!paystackSecret) {
        return new Response(JSON.stringify({ error: "Paystack is not configured yet" }), {
          status: 503,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const paystackRes = await fetch(
        `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
        { headers: { Authorization: `Bearer ${paystackSecret}` } }
      );

      if (!paystackRes.ok) {
        return new Response(JSON.stringify({ error: "Payment verification failed" }), {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const payload = await paystackRes.json();
      const tx = payload?.data;
      const paid = payload?.status === true && tx?.status === "success";
      const expectedAmount = 1000; // GHS 10.00 in pesewas

      if (!paid || tx.currency !== "GHS" || tx.amount < expectedAmount) {
        return new Response(JSON.stringify({ error: "Payment not completed or invalid" }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // One subscription per verified payment reference (idempotent)
    const { data: existing } = await supabase
      .from("subscriptions")
      .select("id")
      .eq("paystack_reference", reference)
      .maybeSingle();

    if (existing) {
      return new Response(JSON.stringify({ success: true, alreadyVerified: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    const { error: insertError } = await supabase.from("subscriptions").insert({
      user_id: user.id,
      tier: "pro",
      status: "active",
      paystack_reference: reference,
      started_at: new Date().toISOString(),
      expires_at: expiresAt,
    });

    if (insertError) {
      return new Response(JSON.stringify({ error: "Could not save subscription" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true, expiresAt }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unexpected error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
