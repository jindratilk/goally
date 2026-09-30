const PATTERNS = [
  [/\b(sk|pk|rk)-[A-Za-z0-9_-]{16,}\b/g, '$1-[REDACTED]'],
  [/\bxai-[A-Za-z0-9_-]{16,}\b/g, 'xai-[REDACTED]'],
  [/\bgh[pousr]_[A-Za-z0-9]{20,}\b/g, 'gh_[REDACTED]'],
  [/\bgithub_pat_[A-Za-z0-9_]{20,}\b/g, 'github_pat_[REDACTED]'],
  [/\bAKIA[0-9A-Z]{16}\b/g, 'AKIA[REDACTED]'],
  [/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, '[JWT REDACTED]'],
  [/\b(cursor|key|crsr)_[A-Za-z0-9]{24,}\b/g, '$1_[REDACTED]'],
  [/(-----BEGIN [A-Z ]*PRIVATE KEY-----)[\s\S]*?(-----END [A-Z ]*PRIVATE KEY-----)/g, '$1[REDACTED]$2'],
  [/\b(authorization|bearer)(\s*[:=]?\s*)(bearer\s+)?[A-Za-z0-9._~+/=-]{16,}/gi, '$1$2$3[REDACTED]'],
  [/\b([A-Z][A-Z0-9_]*(SECRET|TOKEN|PASSWORD|PASSWD|API_KEY|APIKEY|PRIVATE_KEY)[A-Z0-9_]*)(\s*[=:]\s*)("[^"]*"|'[^']*'|\S+)/g, '$1$3[REDACTED]'],
];

export function redact(text, max = 4000) {
  if (text == null) return text;
  let s = typeof text === 'string' ? text : JSON.stringify(text);
  for (const [re, rep] of PATTERNS) s = s.replace(re, rep);
  if (s.length > max) s = `${s.slice(0, max)}… [+${s.length - max} chars]`;
  return s;
}
