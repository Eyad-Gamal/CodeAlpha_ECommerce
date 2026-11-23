const { z } = require('zod');

const cartItemSchema = z.object({
  productId: z.string({ required_error: 'productId is required' }).min(1, 'productId is required'),
  quantity: z.preprocess(
    (v) => (typeof v === 'string' ? parseInt(v, 10) : v),
    z
      .number({ required_error: 'quantity is required', invalid_type_error: 'quantity must be an integer' })
      .int('quantity must be an integer')
      .min(1, 'Quantity must be at least 1')
      .max(999, 'Quantity cannot exceed 999')
  ),
});

const cartSyncSchema = z.object({
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        quantity: z.number().int().min(1).max(999),
      })
    )
    .max(100),
});

const shippingAddressSchema = z.object({
  fullName: z.string({ required_error: 'Recipient full name is required' }).min(2).max(120),
  street: z.string({ required_error: 'Street address is required' }).min(3).max(250),
  city: z.string({ required_error: 'City is required' }).min(2).max(100),
  state: z.string().max(100).optional().default(''),
  postalCode: z.string({ required_error: 'Postal code is required' }).min(2).max(30),
  country: z.string({ required_error: 'Country is required' }).min(2).max(100),
  phone: z.string({ required_error: 'Contact phone is required' }).min(5).max(40),
});

const checkoutSchema = z.object({
  paymentMethod: z.enum(['COD', 'Card'], {
    errorMap: () => ({ message: 'Payment method must be either COD or Card' }),
  }),
  shippingAddress: shippingAddressSchema,
  notes: z.string().max(500).optional().default(''),
  cardDetails: z
    .object({
      last4: z.string().max(4).optional(),
      holderName: z.string().max(120).optional(),
    })
    .optional(),
});

const updateOrderStatusSchema = z.object({
  order_status: z
    .enum(['pending', 'processing', 'shipped', 'delivered', 'cancelled'], {
      errorMap: () => ({
        message: 'order_status must be one of: pending, processing, shipped, delivered, cancelled',
      }),
    })
    .optional(),
  payment_status: z
    .enum(['pending', 'paid', 'failed', 'refunded'], {
      errorMap: () => ({
        message: 'payment_status must be one of: pending, paid, failed, refunded',
      }),
    })
    .optional(),
});

module.exports = {
  cartItemSchema,
  cartSyncSchema,
  checkoutSchema,
  updateOrderStatusSchema,
};
