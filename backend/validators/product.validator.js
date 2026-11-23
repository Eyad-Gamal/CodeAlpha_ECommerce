const { z } = require('zod');

const categorySchema = z.object({
  name: z.string().min(2, 'Category name must be at least 2 characters').max(100),
  slug: z
    .string()
    .min(2)
    .max(120)
    .regex(/^[a-z0-9-]+$/, 'Slug must contain only lowercase letters, numbers, and hyphens')
    .optional(),
  description: z.string().max(1000).optional().default(''),
  image_url: z.string().max(1000).optional().default(''),
  is_active: z.preprocess(
    (val) => (val === 'true' || val === true || val === 1 || val === '1' ? 1 : val === 'false' || val === false || val === 0 || val === '0' ? 0 : 1),
    z.number().int().min(0).max(1)
  ).optional().default(1),
});

const productCreateSchema = z.object({
  category_id: z.string().min(1, 'Category ID is required'),
  title: z.string().min(2, 'Product title must be at least 2 characters').max(200),
  slug: z
    .string()
    .min(2)
    .max(220)
    .regex(/^[a-z0-9-]+$/, 'Slug must contain only lowercase letters, numbers, and hyphens')
    .optional(),
  description: z.string().min(5, 'Product description must be at least 5 characters').max(5000),
  price: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() !== '' ? Number(v) : v),
    z.number({ invalid_type_error: 'Price must be a valid number' }).min(0.01, 'Price must be greater than 0').max(1000000)
  ),
  discount_price: z.preprocess(
    (v) => (v === '' || v === null || v === undefined || v === 'null' ? null : Number(v)),
    z.number().min(0).max(1000000).nullable().optional()
  ),
  stock_qty: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() !== '' ? parseInt(v, 10) : v),
    z.number({ invalid_type_error: 'Stock quantity must be an integer' }).int().min(0, 'Stock quantity cannot be negative').max(1000000)
  ),
  sku: z.string().min(2, 'SKU is required').max(64).optional(),
  featured: z.preprocess(
    (val) => (val === 'true' || val === true || val === 1 || val === '1' ? 1 : 0),
    z.number().int().min(0).max(1)
  ).optional().default(0),
  images: z.any().optional(),
  specs: z.any().optional(),
});

const productUpdateSchema = productCreateSchema.partial();

const reviewSchema = z.object({
  rating: z.preprocess(
    (v) => (typeof v === 'string' ? parseInt(v, 10) : v),
    z.number().int().min(1, 'Rating must be between 1 and 5').max(5, 'Rating must be between 1 and 5')
  ),
  title: z.string().max(140).optional().default(''),
  comment: z.string().min(3, 'Review comment must be at least 3 characters').max(2000),
});

module.exports = {
  categorySchema,
  productCreateSchema,
  productUpdateSchema,
  reviewSchema,
};
