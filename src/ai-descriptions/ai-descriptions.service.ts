import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { Prisma } from '@prisma/client';
import axios from 'axios';
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'crypto';
import { PrismaService } from '../shared/services/prisma.service';

const SETTINGS_ID = 'default';
const GEN_API_URL = 'https://proxy.gen-api.ru/v1/chat/completions';
const BATCH_PRODUCT_STATUSES = ['ACTIVE', 'INACTIVE', 'COMING_SOON'] as const;
type BatchProductStatus = (typeof BATCH_PRODUCT_STATUSES)[number];

type SettingsRow = {
  id: string;
  encryptedApiKey: string | null;
  model: string;
  createdAt: Date;
  updatedAt: Date;
};

type DraftRow = {
  id: string;
  productId: string;
  batchId: string | null;
  text: string | null;
  status: string;
  error: string | null;
  createdAt: Date;
  updatedAt: Date;
  appliedAt: Date | null;
};

@Injectable()
export class AiDescriptionsService {
  private readonly logger = new Logger(AiDescriptionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @InjectQueue('ai-descriptions') private readonly queue: Queue,
  ) {}

  private encryptionKey() {
    const secret = this.config.get<string>('AI_SETTINGS_SECRET') || this.config.get<string>('JWT_ACCESS_SECRET');
    if (!secret) {
      throw new HttpException(
        'AI settings encryption secret is not configured',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
    return createHash('sha256').update(secret).digest();
  }

  private encrypt(value: string) {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.encryptionKey(), iv);
    const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${iv.toString('base64')}.${tag.toString('base64')}.${encrypted.toString('base64')}`;
  }

  private decrypt(value: string) {
    const [ivPart, tagPart, dataPart] = value.split('.');
    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.encryptionKey(),
      Buffer.from(ivPart, 'base64'),
    );
    decipher.setAuthTag(Buffer.from(tagPart, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(dataPart, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  }

  async getSettings() {
    const rows = await this.prisma.$queryRawUnsafe<SettingsRow[]>(
      'SELECT * FROM "AiDescriptionSettings" WHERE "id" = $1 LIMIT 1',
      SETTINGS_ID,
    );
    const row = rows[0];
    return {
      model: row?.model || 'gpt-4.1',
      hasApiKey: Boolean(row?.encryptedApiKey),
      apiKeyMasked: row?.encryptedApiKey ? '••••••••••••' : '',
    };
  }

  async saveSettings(input: { apiKey?: string; model?: string }) {
    const current = await this.prisma.$queryRawUnsafe<SettingsRow[]>(
      'SELECT * FROM "AiDescriptionSettings" WHERE "id" = $1 LIMIT 1',
      SETTINGS_ID,
    );
    const encryptedApiKey = input.apiKey?.trim()
      ? this.encrypt(input.apiKey.trim())
      : current[0]?.encryptedApiKey || null;
    const model = input.model?.trim() || current[0]?.model || 'gpt-4.1';

    await this.prisma.$executeRawUnsafe(
      `INSERT INTO "AiDescriptionSettings" ("id", "encryptedApiKey", "model", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON CONFLICT ("id") DO UPDATE SET
         "encryptedApiKey" = EXCLUDED."encryptedApiKey",
         "model" = EXCLUDED."model",
         "updatedAt" = CURRENT_TIMESTAMP`,
      SETTINGS_ID,
      encryptedApiKey,
      model,
    );
    return this.getSettings();
  }

  private async getProviderConfig() {
    const rows = await this.prisma.$queryRawUnsafe<SettingsRow[]>(
      'SELECT * FROM "AiDescriptionSettings" WHERE "id" = $1 LIMIT 1',
      SETTINGS_ID,
    );
    const row = rows[0];
    if (!row?.encryptedApiKey) {
      throw new HttpException('GEN API key is not configured', HttpStatus.BAD_REQUEST);
    }
    return { apiKey: this.decrypt(row.encryptedApiKey), model: row.model || 'gpt-4.1' };
  }

  private cleanText(text: string) {
    return text
      .replace(/^```[a-z]*\s*/i, '')
      .replace(/```$/i, '')
      .replace(/^#+\s+/gm, '')
      .replace(/^[-*]\s+/gm, '')
      .trim();
  }

  private isAcceptable(text: string) {
    const length = text.length;
    const paragraphs = text.split(/\n\s*\n/).filter(Boolean).length;
    const hasMarkdown = /```|^#|^[-*]\s/m.test(text);
    return length >= 450 && length <= 1100 && paragraphs >= 2 && !hasMarkdown;
  }

  private extractGenApiText(data: unknown): string | null {
    const payload = data as any;
    const message = payload?.choices?.[0]?.message;
    const content = message?.content;

    if (typeof content === 'string' && content.trim()) {
      return content;
    }

    if (Array.isArray(content)) {
      const text = content
        .map((part: any) => {
          if (typeof part === 'string') return part;
          if (typeof part?.text === 'string') return part.text;
          if (typeof part?.content === 'string') return part.content;
          return '';
        })
        .filter(Boolean)
        .join('\n')
        .trim();
      if (text) return text;
    }

    const directTextCandidates = [
      payload?.output_text,
      payload?.text,
      payload?.output?.text,
      payload?.output,
    ];
    for (const candidate of directTextCandidates) {
      if (typeof candidate === 'string' && candidate.trim()) {
        return candidate;
      }
    }

    return null;
  }

  private providerErrorMessage(error: unknown) {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      const providerMessage =
        error.response?.data?.error?.message ||
        error.response?.data?.message ||
        error.response?.data?.error ||
        error.message;
      return status ? `GEN API ${status}: ${providerMessage}` : `GEN API: ${providerMessage}`;
    }
    return error instanceof Error ? error.message : String(error);
  }

  private async callGenApi(messages: Array<{ role: 'system' | 'user'; content: string }>) {
    const { apiKey, model } = await this.getProviderConfig();

    try {
      const response = await axios.post(
        GEN_API_URL,
        {
          model,
          messages,
          temperature: 0.55,
          max_tokens: 1200,
          reasoning_effort: 'none',
          response_format: { type: 'text' },
          stream: false,
        },
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 120000,
        },
      );

      const content = this.extractGenApiText(response.data);
      if (!content) {
        const choice = response.data?.choices?.[0];
        const finishReason = choice?.finish_reason || 'unknown';
        const hasReasoning = Boolean(choice?.message?.reasoning_content);
        this.logger.error(
          `GEN API returned no final text (model=${model}, finish_reason=${finishReason}, reasoning_content=${hasReasoning ? 'present' : 'absent'})`,
        );
        throw new Error(`GEN API returned no final text (finish_reason: ${finishReason})`);
      }

      return this.cleanText(content);
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new HttpException(
          this.providerErrorMessage(error),
          error.response?.status && error.response.status >= 400 && error.response.status < 500
            ? HttpStatus.BAD_GATEWAY
            : HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }
      throw error;
    }
  }

  private async getProductContext(productId: string) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      include: {
        brand: true,
        categories: { include: { category: true }, orderBy: { isPrimary: 'desc' } },
        attributes: true,
      },
    });
    if (!product || product.isDeleted) {
      throw new HttpException('Product not found', HttpStatus.NOT_FOUND);
    }
    return product;
  }

  async generateProductDraft(productId: string, batchId?: string | null) {
    const product = await this.getProductContext(productId);
    const categoryNames = product.categories.map((item) => item.category.title).join(', ');
    const attributes = product.attributes
      .map((item) => `${item.name}: ${item.value}`)
      .join('\n');

    const system = [
      'Ты редактор интернет-магазина электроники PRIME.',
      'Нужно переписать описание товара уникальным естественным русским текстом.',
      'Используй только факты из входных данных. Не придумывай характеристики, комплектацию, гарантии, совместимость, преимущества или свойства.',
      'Если данных мало, пиши только то, что достоверно следует из названия, категории, бренда, характеристик и исходного описания.',
      'Объём: ориентир 500–1000 символов. Ровно 2 смысловых абзаца.',
      'Название товара используй естественно. Без Markdown, списков, заголовков, кавычек вокруг ответа и служебных фраз.',
      'Верни только готовое описание.',
    ].join(' ');

    const user = `Название: ${product.name}\nБренд: ${product.brand?.name || 'не указан'}\nКатегории: ${categoryNames || 'не указаны'}\nХарактеристики:\n${attributes || 'не указаны'}\n\nТекущее описание:\n${product.description || 'отсутствует'}`;

    try {
      const text = await this.callGenApi([
        { role: 'system', content: system },
        { role: 'user', content: user },
      ]);

      const status = this.isAcceptable(text) ? 'READY' : 'NEEDS_REVIEW';
      const id = randomUUID();
      await this.prisma.$executeRawUnsafe(
        `INSERT INTO "AiDescriptionDraft" ("id", "productId", "batchId", "text", "status", "error", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
         ON CONFLICT ("productId") DO UPDATE SET
           "batchId" = EXCLUDED."batchId",
           "text" = EXCLUDED."text",
           "status" = EXCLUDED."status",
           "error" = NULL,
           "updatedAt" = CURRENT_TIMESTAMP,
           "appliedAt" = NULL`,
        id,
        productId,
        batchId || null,
        text,
        status,
      );

      return this.getDraft(productId);
    } catch (error) {
      await this.markDraftError(productId, batchId || null, error);
      throw error;
    }
  }

  async markDraftError(productId: string, batchId: string | null, error: unknown) {
    const message = this.providerErrorMessage(error);
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO "AiDescriptionDraft" ("id", "productId", "batchId", "status", "error", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, 'ERROR', $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON CONFLICT ("productId") DO UPDATE SET
         "batchId" = EXCLUDED."batchId",
         "text" = NULL,
         "status" = 'ERROR',
         "error" = EXCLUDED."error",
         "updatedAt" = CURRENT_TIMESTAMP,
         "appliedAt" = NULL`,
      randomUUID(),
      productId,
      batchId,
      message.slice(0, 1500),
    );
  }

  async getDraft(productId: string) {
    const rows = await this.prisma.$queryRawUnsafe<Array<DraftRow & { productName: string; currentDescription: string | null }>>(
      `SELECT d.*, p."name" AS "productName", p."description" AS "currentDescription"
       FROM "AiDescriptionDraft" d
       JOIN "Product" p ON p."id" = d."productId"
       WHERE d."productId" = $1 LIMIT 1`,
      productId,
    );
    return rows[0] || null;
  }

  async listDrafts(page = 1, limit = 50, status?: string) {
    const safePage = Math.max(1, Number(page) || 1);
    const safeLimit = Math.min(100, Math.max(1, Number(limit) || 50));
    const offset = (safePage - 1) * safeLimit;
    const params: unknown[] = [];
    let where = '';
    if (status) {
      params.push(status);
      where = `WHERE d."status" = $${params.length}`;
    }
    params.push(safeLimit, offset);
    const rows = await this.prisma.$queryRawUnsafe(
      `SELECT d.*, p."name" AS "productName", p."description" AS "currentDescription", p."slug"
       FROM "AiDescriptionDraft" d
       JOIN "Product" p ON p."id" = d."productId"
       ${where}
       ORDER BY d."updatedAt" DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      ...params,
    );
    const countParams = status ? [status] : [];
    const counts = await this.prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
      `SELECT COUNT(*)::bigint AS count FROM "AiDescriptionDraft" d ${where}`,
      ...countParams,
    );
    return { data: rows, meta: { page: safePage, limit: safeLimit, total: Number(counts[0]?.count || 0) } };
  }

  async applyDraft(productId: string) {
    const draft = await this.getDraft(productId);
    if (!draft?.text || !['READY', 'NEEDS_REVIEW'].includes(draft.status)) {
      throw new HttpException('AI draft is not ready', HttpStatus.BAD_REQUEST);
    }
    await this.prisma.$transaction([
      this.prisma.product.update({ where: { id: productId }, data: { description: draft.text } }),
      this.prisma.$executeRawUnsafe(
        `UPDATE "AiDescriptionDraft" SET "status" = 'APPLIED', "appliedAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP WHERE "productId" = $1`,
        productId,
      ),
    ]);
    return { success: true };
  }

  async applyAllReady() {
    const drafts = await this.prisma.$queryRawUnsafe<Array<{ productId: string; text: string }>>(
      `SELECT "productId", "text" FROM "AiDescriptionDraft" WHERE "status" IN ('READY', 'NEEDS_REVIEW') AND "text" IS NOT NULL`,
    );
    let applied = 0;
    for (const draft of drafts) {
      await this.prisma.$transaction([
        this.prisma.product.update({ where: { id: draft.productId }, data: { description: draft.text } }),
        this.prisma.$executeRawUnsafe(
          `UPDATE "AiDescriptionDraft" SET "status" = 'APPLIED', "appliedAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP WHERE "productId" = $1`,
          draft.productId,
        ),
      ]);
      applied += 1;
    }
    return { applied };
  }

  async startBatch(statuses: BatchProductStatus[] = ['ACTIVE']) {
    await this.getProviderConfig();
    const running = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT "id" FROM "AiDescriptionBatch" WHERE "status" = 'PROCESSING' ORDER BY "createdAt" DESC LIMIT 1`,
    );
    if (running[0]) {
      throw new HttpException('AI generation batch is already running', HttpStatus.CONFLICT);
    }

    const normalizedStatuses = Array.from(
      new Set(
        statuses.filter((status): status is BatchProductStatus =>
          BATCH_PRODUCT_STATUSES.includes(status as BatchProductStatus),
        ),
      ),
    );
    if (normalizedStatuses.length === 0) {
      throw new HttpException('Select at least one product status', HttpStatus.BAD_REQUEST);
    }

    const statusFilters: Prisma.ProductWhereInput[] = [];
    if (normalizedStatuses.includes('ACTIVE')) {
      statusFilters.push({ isActive: true, comingSoon: false });
    }
    if (normalizedStatuses.includes('INACTIVE')) {
      statusFilters.push({ isActive: false, comingSoon: false });
    }
    if (normalizedStatuses.includes('COMING_SOON')) {
      statusFilters.push({ comingSoon: true });
    }

    const products = await this.prisma.product.findMany({
      where: {
        isDeleted: false,
        OR: statusFilters,
      },
      select: { id: true },
    });

    const batchId = randomUUID();
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO "AiDescriptionBatch" ("id", "status", "total", "processed", "success", "failed", "createdAt", "updatedAt")
       VALUES ($1, 'PROCESSING', $2, 0, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      batchId,
      products.length,
    );

    for (const product of products) {
      await this.queue.add('generate-product', { productId: product.id, batchId });
    }

    if (products.length === 0) {
      await this.prisma.$executeRawUnsafe(
        `UPDATE "AiDescriptionBatch" SET "status" = 'COMPLETED', "completedAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = $1`,
        batchId,
      );
    }

    return this.getBatch(batchId);
  }

  async getLatestBatch() {
    const rows = await this.prisma.$queryRawUnsafe<Array<any>>(
      `SELECT * FROM "AiDescriptionBatch" ORDER BY "createdAt" DESC LIMIT 1`,
    );
    return rows[0] || null;
  }

  async getBatch(id: string) {
    const rows = await this.prisma.$queryRawUnsafe<Array<any>>(
      `SELECT * FROM "AiDescriptionBatch" WHERE "id" = $1 LIMIT 1`,
      id,
    );
    return rows[0] || null;
  }

  async markBatchProductDone(batchId: string, success: boolean) {
    await this.prisma.$executeRawUnsafe(
      `UPDATE "AiDescriptionBatch"
       SET "processed" = "processed" + 1,
           "success" = "success" + $2,
           "failed" = "failed" + $3,
           "updatedAt" = CURRENT_TIMESTAMP
       WHERE "id" = $1`,
      batchId,
      success ? 1 : 0,
      success ? 0 : 1,
    );

    await this.prisma.$executeRawUnsafe(
      `UPDATE "AiDescriptionBatch"
       SET "status" = 'COMPLETED', "completedAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP
       WHERE "id" = $1 AND "processed" >= "total"`,
      batchId,
    );
  }
}
