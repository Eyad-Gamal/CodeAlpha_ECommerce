const { z } = require('zod');

const addressSchema = z
  .object({
    fullName: z.string().min(2, 'Full name is required').max(120).optional(),
    street: z.string().min(3, 'Street address is required').max(250).optional(),
    city: z.string().min(2, 'City is required').max(100).optional(),
    state: z.string().max(100).optional().default(''),
    postalCode: z.string().min(2, 'Postal code is required').max(30).optional(),
    country: z.string().min(2, 'Country is required').max(100).optional(),
    phone: z.string().max(40).optional(),
  })
  .passthrough();

const registerSchema = z.object({
  name: z
    .string({ required_error: 'Full name is required' })
    .min(2, 'Name must be at least 2 characters')
    .max(100, 'Name cannot exceed 100 characters'),
  email: z
    .string({ required_error: 'Email address is required' })
    .email('Please provide a valid email address')
    .max(180)
    .transform((v) => v.toLowerCase().trim()),
  password: z
    .string({ required_error: 'Password is required' })
    .min(8, 'Password must be at least 8 characters long')
    .max(128, 'Password cannot exceed 128 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
  phone: z.string().max(40).optional().default(''),
  address: addressSchema.optional().default({}),
});

const loginSchema = z.object({
  email: z
    .string({ required_error: 'Email is required' })
    .email('Invalid email format')
    .transform((v) => v.toLowerCase().trim()),
  password: z
    .string({ required_error: 'Password is required' })
    .min(1, 'Password is required')
    .max(128),
});

const updateProfileSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  phone: z.string().max(40).optional(),
  address: addressSchema.optional(),
  currentPassword: z.string().min(1).optional(),
  newPassword: z
    .string()
    .min(8, 'New password must be at least 8 characters')
    .max(128)
    .regex(/[A-Z]/, 'New password must contain an uppercase letter')
    .regex(/[a-z]/, 'New password must contain a lowercase letter')
    .regex(/[0-9]/, 'New password must contain a number')
    .optional(),
});

module.exports = {
  registerSchema,
  loginSchema,
  updateProfileSchema,
};
