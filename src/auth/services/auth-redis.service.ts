import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../shared/services/redis.service';

@Injectable()
export class AuthRedisService {
  private readonly logger = new Logger(AuthRedisService.name);
  private readonly CODE_PREFIX = 'auth:code:';
  private readonly CODE_TTL = 15 * 60; // 15 minutes in seconds
  private readonly ATTEMPT_PREFIX = 'auth:attempts:';
  private readonly MAX_ATTEMPTS = 5;
  private readonly ATTEMPT_TTL = 15 * 60; // 15 minutes lockout
  private readonly REFRESH_TOKEN_PREFIX = 'auth:refresh:';
  private readonly REFRESH_TOKEN_TTL = 7 * 24 * 60 * 60; // 7 days in seconds

  constructor(private readonly redisService: RedisService) {}

  generateCode(): string {
    return Math.floor(1000 + Math.random() * 9000).toString();
  }

  async storeCode(phone: string, code: string): Promise<void> {
    const key = this.getCodeKey(phone);
    await this.redisService.set(
      key,
      { code, createdAt: Date.now() },
      this.CODE_TTL,
    );
    this.logger.log(`Stored verification code for phone: ${phone}`);
    this.logger.debug(`Code: ${code} (expires in ${this.CODE_TTL} seconds)`);
  }

  async getCode(
    phone: string,
  ): Promise<{ code: string; createdAt: number } | null> {
    const key = this.getCodeKey(phone);
    return this.redisService.get<{ code: string; createdAt: number }>(key);
  }

  async verifyCode(phone: string, code: string): Promise<boolean> {
    const stored = await this.getCode(phone);
    if (!stored) {
      return false;
    }
    return stored.code === code;
  }

  async deleteCode(phone: string): Promise<void> {
    const key = this.getCodeKey(phone);
    await this.redisService.remove(key);
    this.logger.log(`Deleted verification code for phone: ${phone}`);
  }

  async hasActiveCode(phone: string): Promise<boolean> {
    const key = this.getCodeKey(phone);
    return this.redisService.exists(key);
  }

  // --- OTP attempt tracking ---

  private getAttemptKey(phone: string): string {
    const normalizedPhone = phone.replace(/[\s\-\(\)]/g, '');
    return `${this.ATTEMPT_PREFIX}${normalizedPhone}`;
  }

  async getAttempts(phone: string): Promise<number> {
    const key = this.getAttemptKey(phone);
    const data = await this.redisService.get<{ count: number }>(key);
    return data?.count ?? 0;
  }

  async incrementAttempts(phone: string): Promise<number> {
    const key = this.getAttemptKey(phone);
    const data = await this.redisService.get<{ count: number }>(key);
    const count = (data?.count ?? 0) + 1;
    await this.redisService.set(key, { count }, this.ATTEMPT_TTL);
    this.logger.warn(`OTP attempt #${count} for phone: ${phone}`);
    return count;
  }

  async resetAttempts(phone: string): Promise<void> {
    const key = this.getAttemptKey(phone);
    await this.redisService.remove(key);
  }

  isLockedOut(attempts: number): boolean {
    return attempts >= this.MAX_ATTEMPTS;
  }

  // --- Refresh token management ---

  private getRefreshTokenKey(userId: string, tokenId: string): string {
    return `${this.REFRESH_TOKEN_PREFIX}${userId}:${tokenId}`;
  }

  async storeRefreshToken(userId: string, tokenId: string): Promise<void> {
    const key = this.getRefreshTokenKey(userId, tokenId);
    await this.redisService.set(
      key,
      { createdAt: Date.now() },
      this.REFRESH_TOKEN_TTL,
    );
    this.logger.log(`Stored refresh token ${tokenId} for user: ${userId}`);
  }

  async isRefreshTokenValid(userId: string, tokenId: string): Promise<boolean> {
    const key = this.getRefreshTokenKey(userId, tokenId);
    return this.redisService.exists(key);
  }

  async revokeRefreshToken(userId: string, tokenId: string): Promise<void> {
    const key = this.getRefreshTokenKey(userId, tokenId);
    await this.redisService.remove(key);
    this.logger.log(`Revoked refresh token ${tokenId} for user: ${userId}`);
  }

  async revokeAllRefreshTokens(userId: string): Promise<void> {
    const pattern = `${this.REFRESH_TOKEN_PREFIX}${userId}:*`;
    const count = await this.redisService.clearByPattern(pattern);
    this.logger.log(`Revoked ${count} refresh tokens for user: ${userId}`);
  }

  private getCodeKey(phone: string): string {
    const normalizedPhone = phone.replace(/[\s\-\(\)]/g, '');
    return `${this.CODE_PREFIX}${normalizedPhone}`;
  }
}
