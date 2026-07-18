export type AmoCrmTag = string;

export interface AmoCrmContactInput {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  tags?: AmoCrmTag[];
}

export interface AmoCrmOrderItemInput {
  quantity?: number | null;
  price?: unknown;
  product?: {
    name?: string | null;
    slug?: string | null;
  } | null;
}

export interface AmoCrmOrderInput {
  id: number;
  buyer?: string | null;
  email?: string | null;
  phone?: string | null;
  status?: string | null;
  deliveryMethod?: string | null;
  paymentMethod?: string | null;
  address?: string | null;
  comment?: string | null;
  total?: unknown;
  finalTotal?: unknown;
  items?: AmoCrmOrderItemInput[];
}

export interface AmoCrmLeadInput {
  name: string;
  price?: unknown;
  contact: AmoCrmContactInput;
  note?: string;
  tags?: AmoCrmTag[];
}

export interface AmoCrmFormInput {
  name: string;
  email: string;
  phone?: string;
  message: string;
}
