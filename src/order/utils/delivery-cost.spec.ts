import { DeliveryMethod, PaymentMethod } from '@prisma/client';
import {
  calculateFinalTotalWithPayment,
  calculateFinalTotalWithDelivery,
  calculatePaymentSurcharge,
  normalizeDeliveryCost,
} from './delivery-cost';

describe('delivery cost helpers', () => {
  it('uses no delivery cost for pickup orders', () => {
    expect(normalizeDeliveryCost(990, DeliveryMethod.PICKUP)).toBe(0);
  });

  it('keeps the inside-MKAD delivery price for delivery orders', () => {
    expect(normalizeDeliveryCost(590, DeliveryMethod.DELIVERY)).toBe(590);
  });

  it('keeps the outside-MKAD delivery price for delivery orders', () => {
    expect(normalizeDeliveryCost(990, DeliveryMethod.DELIVERY)).toBe(990);
  });

  it('falls back to inside-MKAD price when delivery price is missing', () => {
    expect(normalizeDeliveryCost(undefined, DeliveryMethod.DELIVERY)).toBe(590);
  });

  it('adds delivery cost after product discount', () => {
    expect(calculateFinalTotalWithDelivery(1000, 100, 590)).toBe(1490);
  });

  it('adds a 10% product surcharge for card payments', () => {
    expect(
      calculatePaymentSurcharge(1000, 100, PaymentMethod.ROBOKASSA),
    ).toBe(90);
    expect(
      calculateFinalTotalWithPayment(1000, 100, 590, PaymentMethod.ROBOKASSA),
    ).toBe(1580);
  });

  it('keeps cash payments without a surcharge', () => {
    expect(calculatePaymentSurcharge(1000, 100, PaymentMethod.CASH)).toBe(0);
    expect(
      calculateFinalTotalWithPayment(1000, 100, 590, PaymentMethod.CASH),
    ).toBe(1490);
  });
});
