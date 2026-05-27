/**
 * Token-bucket rate limiter.
 * Ensures we respect portal RPM and burst constraints.
 * One instance per domain to avoid cross-portal interference.
 */
export class RateLimiter {
  private tokens: number;
  private lastRefill: number;
  private readonly maxTokens: number;
  private readonly refillRatePerMs: number;

  constructor(
    private readonly rpm: number,      // Requests per minute
    private readonly burst: number = 5,  // Max burst size
  ) {
    this.maxTokens = burst;
    this.tokens = burst;
    this.refillRatePerMs = rpm / 60000;
    this.lastRefill = Date.now();
  }

  /** Wait until a token is available, then consume it. */
  async acquire(): Promise<void> {
    while (true) {
      this.refill();
      if (this.tokens >= 1) {
        this.tokens -= 1;
        return;
      }
      // Wait a bit before checking again
      const waitTime = Math.ceil(1 / this.refillRatePerMs);
      await new Promise((resolve) => setTimeout(resolve, Math.min(waitTime, 1000)));
    }
  }

  get available(): number {
    this.refill();
    return this.tokens;
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    if (elapsed <= 0) return;

    const added = elapsed * this.refillRatePerMs;
    this.tokens = Math.min(this.maxTokens, this.tokens + added);
    this.lastRefill = now;
  }
}
