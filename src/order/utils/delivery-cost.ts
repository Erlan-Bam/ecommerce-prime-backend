import { DeliveryMethod, PaymentMethod } from '@prisma/client';

export const DELIVERY_WITHIN_MKAD_PRICE = 590;
export const DELIVERY_OUTSIDE_MKAD_PRICE = 990;
export const CARD_PAYMENT_SURCHARGE_PERCENT = 10;

export function normalizeDeliveryCost(
  value: unknown,
  deliveryMethod: DeliveryMethod,
): number {
  if (deliveryMethod !== DeliveryMethod.DELIVERY) {
    return 0;
  }

  const deliveryCost = Number(value);

  if (!Number.isFinite(deliveryCost) || deliveryCost <= 0) {
    return DELIVERY_WITHIN_MKAD_PRICE;
  }

  return deliveryCost >= DELIVERY_OUTSIDE_MKAD_PRICE
    ? DELIVERY_OUTSIDE_MKAD_PRICE
    : DELIVERY_WITHIN_MKAD_PRICE;
}

export function calculateFinalTotalWithDelivery(
  total: number,
  discount: number,
  deliveryCost: number,
): number {
  return calculateFinalTotalWithPayment(
    total,
    discount,
    deliveryCost,
    PaymentMethod.CASH,
  );
}

export function calculatePaymentSurcharge(
  total: number,
  discount: number,
  paymentMethod: PaymentMethod,
): number {
  if (paymentMethod !== PaymentMethod.ROBOKASSA) {
    return 0;
  }

  const discountedProductsTotal = Math.max(total - discount, 0);
  const surcharge =
    discountedProductsTotal * (CARD_PAYMENT_SURCHARGE_PERCENT / 100);

  return Math.round(surcharge * 100) / 100;
}

export function calculateFinalTotalWithPayment(
  total: number,
  discount: number,
  deliveryCost: number,
  paymentMethod: PaymentMethod,
): number {
  const discountedProductsTotal = Math.max(total - discount, 0);
  const paymentSurcharge = calculatePaymentSurcharge(
    total,
    discount,
    paymentMethod,
  );
  const finalTotal = discountedProductsTotal + paymentSurcharge + deliveryCost;

  return Math.max(0, Math.round(finalTotal * 100) / 100);
}
