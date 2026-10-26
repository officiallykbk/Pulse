// Loads the edge function source so its Deno.serve handler registers with the
// stubbed Deno global in verifypayment.test.ts. The relative path reaches the
// supabase functions directory from src/services.
await import('../../supabase/functions/verifypayment/index.ts');
