const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 10;

export function checkRateLimit(ip: string): { allowed: boolean; retryAfterMs: number } {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true, retryAfterMs: 0 };
  }

  if (entry.count >= MAX_REQUESTS) {
    return { allowed: false, retryAfterMs: entry.resetAt - now };
  }

  entry.count++;
  return { allowed: true, retryAfterMs: 0 };
}

export function sanitizeAddress(address: string): string {
  return address.replace(/[^0-9a-fA-Fx]/g, '').substring(0, 42);
}

export function sanitizeContractName(name: string): string {
  return name.replace(/[<>"'&\\]/g, '').substring(0, 128);
}

export function validateSourceCode(code: string): { valid: boolean; error?: string } {
  if (code.trim().length === 0) {
    return { valid: false, error: '合约代码为空' };
  }
  if (code.length > 500_000) {
    return { valid: false, error: '合约代码过大，请上传小于500KB的文件' };
  }
  return { valid: true };
}
