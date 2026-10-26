-- Migration: Add multi-gateway fields to support Moolre (Mobile Money) & Stripe
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS payment_provider text NOT NULL DEFAULT 'paystack',
  ADD COLUMN IF NOT EXISTS payment_reference text;

-- Backfill payment_reference from paystack_reference for existing rows
UPDATE subscriptions
SET payment_reference = paystack_reference
WHERE payment_reference IS NULL AND paystack_reference IS NOT NULL;

-- Index for fast idempotent lookup during webhook verification
CREATE INDEX IF NOT EXISTS idx_subscriptions_payment_ref ON subscriptions(payment_reference);
CREATE INDEX IF NOT EXISTS idx_subscriptions_provider ON subscriptions(payment_provider);
