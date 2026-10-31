export type Provider = "asaas" | "mercadopago" | "pagbank";
export type EventStatus = "draft" | "published" | "closed";
export type ReviewStatus = "none" | "pending" | "approved" | "rejected";
export type OrderStatus = "pending" | "paid" | "cancelled" | "expired";
export type QuestionType = "text" | "textarea" | "number" | "date" | "select" | "yesno" | "phone" | "cpf" | "cep";

export interface Organizer {
  id: string;
  owner_id: string;
  name: string;
  document: string | null;
  phone: string | null;
  email: string | null;
  fee_percent: number;
  active: boolean;
  provider: Provider | null;
  provider_sandbox: boolean;
  provider_account: string | null;
  provider_connected_at: string | null;
  created_at: string;
}

export interface EventRow {
  id: string;
  organizer_id: string;
  slug: string;
  title: string;
  theme: string | null;
  speaker: string | null;
  description: string | null;
  location: string | null;
  art_url: string | null;
  starts_at: string | null;
  ends_at: string | null;
  reg_opens_at: string | null;
  reg_closes_at: string | null;
  min_age: number | null;
  max_age: number | null;
  capacity: number | null;
  order_expiry_hours: number;
  status: EventStatus;
  review_status: ReviewStatus;
  review_note: string | null;
  submitted_at: string | null;
  reviewed_at: string | null;
  created_at: string;
}

export interface Item {
  id: string;
  event_id: string;
  name: string;
  description: string | null;
  is_registration: boolean;
  price: number;
  options: string[];
  max_per_person: number | null; // null = sem limite
  stock: number | null;
  requires_item_id: string | null;
  active: boolean;
  position: number;
}

export interface Lot {
  id: string;
  event_id: string;
  name: string;
  starts_at: string | null;
  ends_at: string | null;
  quantity: number | null;
  position: number;
}

export interface Question {
  id: string;
  event_id: string;
  label: string;
  help: string | null;
  type: QuestionType;
  options: string[];
  required: boolean;
  position: number;
}

export interface Order {
  id: string;
  event_id: string;
  code: string;
  access_key: string;
  buyer_name: string;
  buyer_email: string;
  buyer_phone: string | null;
  buyer_cpf: string | null;
  lot_id: string | null;
  lot_name: string | null;
  status: OrderStatus;
  total: number;
  fee_percent: number;
  fee_amount: number;
  provider: Provider | null;
  provider_payment_id: string | null;
  checkout_url: string | null;
  pix_code: string | null;
  expires_at: string;
  paid_at: string | null;
  created_at: string;
}

export interface Attendee {
  id: string;
  order_id: string;
  event_id: string;
  name: string;
  birth_date: string | null;
  answers: Record<string, string>;
  position: number;
}

export interface OrderItem {
  id: string;
  order_id: string;
  attendee_id: string;
  item_id: string | null;
  item_name: string;
  option: string | null;
  quantity: number;
  unit_price: number;
}

export interface Availability {
  remaining: number | null;
  has_lots: boolean;
  lot: { id: string; name: string; ends_at: string | null } | null;
  items: { id: string; price: number; remaining: number | null }[];
}

/** Estado padrão retornado pelas server actions usadas com useActionState. */
export type ActionState = { error?: string; success?: string } | undefined;

export const PROVIDER_LABEL: Record<Provider, string> = {
  asaas: "Asaas",
  mercadopago: "Mercado Pago",
  pagbank: "PagBank (PagSeguro)",
};

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  pending: "Aguardando pagamento",
  paid: "Confirmada",
  cancelled: "Cancelada",
  expired: "Expirada",
};

export const QUESTION_TYPE_LABEL: Record<QuestionType, string> = {
  text: "Texto curto",
  textarea: "Texto longo",
  number: "Número",
  date: "Data",
  select: "Lista de opções",
  yesno: "Sim / Não",
  phone: "Telefone",
  cpf: "CPF",
  cep: "CEP",
};
