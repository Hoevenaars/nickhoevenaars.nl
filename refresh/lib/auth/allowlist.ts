export function parseAllowlist(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

export function isAllowedEmail(
  email: string | null | undefined,
  allowlist = parseAllowlist(process.env.REFRESH_ALLOWED_EMAILS),
): boolean {
  if (!allowlist.length) return true;
  if (!email) return false;
  return allowlist.includes(email.trim().toLowerCase());
}
