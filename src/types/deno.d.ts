// Minimal Deno global typings so supabase/functions sources type-check under
// the app tsconfig (real Deno types come from the Deno runtime when deployed).
declare namespace Deno {
  namespace env {
    function get(name: string): string | undefined;
  }
  function serve(
    handler: (req: Request) => Response | Promise<Response>
  ): void;
}

// Deno's npm: module prefix, referenced by edge functions
declare module 'npm:@supabase/supabase-js@2.57.4' {
  export * from '@supabase/supabase-js';
}
