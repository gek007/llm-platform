/**
 * `Authorization: Bearer <COURSE_ENGINE_SECRET>` check for the /engine/* HTTP actions.
 * Fails closed: false when the deployment has no secret (unset or empty).
 *
 * Constant-time: the loop always runs over every byte of the secret (never the attacker's token),
 * XOR-ing in the token byte at the same index (0 past its end) and folding the length difference
 * into the result, so timing depends only on the secret's length, not on where a mismatch is.
 * Synchronous on purpose (crypto.subtle is async and not needed for an equality check).
 */
export function checkEngineSecret(header: string | null, secret: string | undefined): boolean {
  if (!secret || !header) return false;
  const prefix = "Bearer ";
  if (!header.startsWith(prefix)) return false;
  const encoder = new TextEncoder();
  const given = encoder.encode(header.slice(prefix.length));
  const expected = encoder.encode(secret);
  let diff = given.length ^ expected.length;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected[i] ^ (i < given.length ? given[i] : 0);
  }
  return diff === 0;
}
