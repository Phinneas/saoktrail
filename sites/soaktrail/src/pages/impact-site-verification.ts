export async function GET() {
  return new Response('Impact-Site-Verification: 86528609-3c90-4566-abc8-41eaafaad2fa', {
    headers: { 'Content-Type': 'text/plain' },
  });
}
