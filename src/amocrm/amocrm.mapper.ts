import {
  AmoCrmContactInput,
  AmoCrmFormInput,
  AmoCrmLeadInput,
  AmoCrmOrderInput,
} from './types';

const compact = <T>(items: Array<T | null | undefined | false>): T[] =>
  items.filter(Boolean) as T[];

const trimOrUndefined = (value?: string | null) => {
  const trimmed = value?.trim();
  return trimmed || undefined;
};

export const normalizeAmoCrmPrice = (value: unknown): number => {
  if (value === null || value === undefined) return 0;

  const normalized =
    typeof value === 'object' &&
    'toNumber' in value &&
    typeof (value as { toNumber: () => number }).toNumber === 'function'
      ? (value as { toNumber: () => number }).toNumber()
      : Number(value);

  return Number.isFinite(normalized) ? Math.round(normalized) : 0;
};

export const buildAmoCrmContactPayload = (contact: AmoCrmContactInput) => {
  const phone = trimOrUndefined(contact.phone);
  const email = trimOrUndefined(contact.email);
  const name =
    trimOrUndefined(contact.name) || phone || email || 'Клиент сайта';

  return {
    name,
    custom_fields_values: compact([
      phone && {
        field_code: 'PHONE',
        values: [{ value: phone, enum_code: 'WORK' }],
      },
      email && {
        field_code: 'EMAIL',
        values: [{ value: email, enum_code: 'WORK' }],
      },
    ]),
    tags_to_add: (contact.tags || []).map((tag) => ({ name: tag })),
  };
};

export const buildAmoCrmLeadPayload = (
  lead: AmoCrmLeadInput,
  defaults: {
    responsibleUserId?: number;
    pipelineId?: number;
    statusId?: number;
  } = {},
) => {
  const payload: Record<string, unknown> = {
    name: lead.name,
    price: normalizeAmoCrmPrice(lead.price),
    _embedded: {
      tags: (lead.tags || []).map((tag) => ({ name: tag })),
      contacts: [buildAmoCrmContactPayload(lead.contact)],
    },
  };

  if (defaults.responsibleUserId) {
    payload.responsible_user_id = defaults.responsibleUserId;
  }

  if (defaults.pipelineId) {
    payload.pipeline_id = defaults.pipelineId;
  }

  if (defaults.statusId) {
    payload.status_id = defaults.statusId;
  }

  return payload;
};

export const buildAmoCrmFormLead = (
  form: AmoCrmFormInput,
): AmoCrmLeadInput => ({
  name: `Заявка с формы контактов: ${form.name}`,
  price: 0,
  contact: {
    name: form.name,
    email: form.email,
    phone: form.phone,
    tags: ['site', 'contact-form'],
  },
  tags: ['site', 'contact-form'],
  note: [
    'Заявка с формы контактов',
    `Имя: ${form.name}`,
    `Email: ${form.email}`,
    form.phone ? `Телефон: ${form.phone}` : null,
    '',
    form.message,
  ]
    .filter((line) => line !== null)
    .join('\n'),
});

export const buildAmoCrmOrderNote = (order: AmoCrmOrderInput): string => {
  const lines = [
    `Заказ #${order.id}`,
    order.buyer ? `Покупатель: ${order.buyer}` : null,
    order.email ? `Email: ${order.email}` : null,
    order.phone ? `Телефон: ${order.phone}` : null,
    order.deliveryMethod ? `Доставка: ${order.deliveryMethod}` : null,
    order.paymentMethod ? `Оплата: ${order.paymentMethod}` : null,
    order.address ? `Адрес: ${order.address}` : null,
    order.comment ? `Комментарий: ${order.comment}` : null,
    `Сумма: ${normalizeAmoCrmPrice(order.finalTotal || order.total)} ₽`,
    '',
    'Товары:',
    ...(order.items || []).map((item) => {
      const name = item.product?.name || 'Товар';
      const quantity = item.quantity || 1;
      return `${name} x${quantity} — ${normalizeAmoCrmPrice(item.price)} ₽`;
    }),
  ];

  return lines.filter((line) => line !== null).join('\n');
};

export const buildAmoCrmOrderCancellationNote = (
  order: AmoCrmOrderInput,
  source = 'site',
): string => {
  const lines = [
    `Заказ #${order.id} отменён`,
    `Источник отмены: ${source}`,
    order.buyer ? `Покупатель: ${order.buyer}` : null,
    order.email ? `Email: ${order.email}` : null,
    order.phone ? `Телефон: ${order.phone}` : null,
    `Сумма: ${normalizeAmoCrmPrice(order.finalTotal || order.total)} ₽`,
  ];

  return lines.filter((line) => line !== null).join('\n');
};

export const buildAmoCrmOrderLead = (
  order: AmoCrmOrderInput,
  tags: string[],
): AmoCrmLeadInput => ({
  name: `Заказ #${order.id} с сайта`,
  price: order.finalTotal || order.total,
  contact: {
    name: order.buyer,
    email: order.email,
    phone: order.phone,
    tags: ['site', 'customer'],
  },
  tags: ['site', 'order', ...tags],
  note: buildAmoCrmOrderNote(order),
});
