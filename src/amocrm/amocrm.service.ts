import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import {
  buildAmoCrmContactPayload,
  buildAmoCrmFormLead,
  buildAmoCrmLeadPayload,
  buildAmoCrmOrderLead,
} from './amocrm.mapper';
import {
  AmoCrmContactInput,
  AmoCrmFormInput,
  AmoCrmLeadInput,
  AmoCrmOrderInput,
} from './types';

@Injectable()
export class AmoCrmService {
  private readonly logger = new Logger(AmoCrmService.name);
  private readonly client: AxiosInstance | null;

  constructor(private readonly configService: ConfigService) {
    const baseUrl = this.resolveBaseUrl();
    const token = this.configService.get<string>('AMOCRM_LONG_LIVED_TOKEN');

    this.client =
      baseUrl && token
        ? axios.create({
            baseURL: baseUrl,
            timeout: 10000,
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
          })
        : null;
  }

  isConfigured(): boolean {
    return Boolean(this.client);
  }

  async safeSubmitContactForm(form: AmoCrmFormInput): Promise<void> {
    await this.safeRun('contact form', () =>
      this.createLeadWithContact(buildAmoCrmFormLead(form)),
    );
  }

  async safeSyncRegisteredUser(user: AmoCrmContactInput): Promise<void> {
    await this.safeRun('registered user', () =>
      this.upsertContact({
        ...user,
        tags: ['site', 'registered-user', ...(user.tags || [])],
      }),
    );
  }

  async safeSubmitOrder(
    order: AmoCrmOrderInput,
    tags: string[] = [],
  ): Promise<void> {
    await this.safeRun(`order #${order.id}`, () =>
      this.createLeadWithContact(buildAmoCrmOrderLead(order, tags)),
    );
  }

  async createLeadWithContact(lead: AmoCrmLeadInput): Promise<number | null> {
    if (!this.client) return null;

    const payload = buildAmoCrmLeadPayload(lead, {
      responsibleUserId: this.getOptionalNumber('AMOCRM_RESPONSIBLE_USER_ID'),
      pipelineId: this.getOptionalNumber('AMOCRM_PIPELINE_ID'),
      statusId: this.getOptionalNumber('AMOCRM_STATUS_ID'),
    });

    const response = await this.client.post('/api/v4/leads/complex', [payload]);
    const created = response.data?.[0];
    const leadId = created?.id || created?._embedded?.leads?.[0]?.id;

    if (leadId && lead.note) {
      await this.addLeadNote(leadId, lead.note);
    }

    return leadId || null;
  }

  async upsertContact(contact: AmoCrmContactInput): Promise<number | null> {
    if (!this.client) return null;

    const existingContactId = await this.findContactId(contact);
    const payload = buildAmoCrmContactPayload(contact);

    if (existingContactId) {
      await this.client.patch(`/api/v4/contacts/${existingContactId}`, payload);
      return existingContactId;
    }

    const response = await this.client.post('/api/v4/contacts', [payload]);
    return response.data?._embedded?.contacts?.[0]?.id || null;
  }

  private async findContactId(
    contact: AmoCrmContactInput,
  ): Promise<number | null> {
    if (!this.client) return null;

    const queries = [contact.phone, contact.email]
      .map((item) => item?.trim())
      .filter(Boolean);

    for (const query of queries) {
      const response = await this.client.get('/api/v4/contacts', {
        params: { query, limit: 1 },
      });
      const contactId = response.data?._embedded?.contacts?.[0]?.id;

      if (contactId) return contactId;
    }

    return null;
  }

  private async addLeadNote(leadId: number, text: string): Promise<void> {
    if (!this.client) return;

    await this.client.post(`/api/v4/leads/${leadId}/notes`, [
      {
        note_type: 'common',
        params: { text },
      },
    ]);
  }

  private async safeRun(
    action: string,
    callback: () => Promise<unknown>,
  ): Promise<void> {
    if (!this.client) {
      this.logger.warn(`amoCRM is not configured, skipped ${action}`);
      return;
    }

    try {
      await callback();
    } catch (error) {
      const message =
        axios.isAxiosError(error) && error.response
          ? `${error.response.status}: ${JSON.stringify(error.response.data)}`
          : error instanceof Error
            ? error.message
            : String(error);

      this.logger.error(`Failed to sync ${action} to amoCRM: ${message}`);
    }
  }

  private resolveBaseUrl(): string | null {
    const apiBaseUrl = this.configService.get<string>('AMOCRM_API_BASE_URL');
    if (apiBaseUrl) return apiBaseUrl.replace(/\/$/, '');

    const baseDomain = this.configService.get<string>('AMOCRM_BASE_DOMAIN');
    if (!baseDomain) return null;

    const normalizedDomain = baseDomain
      .replace(/^https?:\/\//, '')
      .replace(/\/$/, '');
    return `https://${normalizedDomain}`;
  }

  private getOptionalNumber(key: string): number | undefined {
    const value = this.configService.get<string>(key);
    if (!value) return undefined;

    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
}
