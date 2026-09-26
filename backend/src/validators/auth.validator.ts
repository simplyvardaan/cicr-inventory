// Input validation schemas (v2.1.0).
//
// Zod schemas for validating request bodies before they reach controllers.
// Returns structured error messages that the frontend can display.
import { z } from 'zod';

// ---------------------------------------------------------------- auth schemas
export const loginSchema = z.object({
  identifier: z.string().max(255, 'Identifier too long').optional(),
  email: z.string().max(255, 'Email too long').optional(),
  username: z.string().max(255, 'Username too long').optional(),
  name: z.string().max(255, 'Name too long').optional(),
  password: z
    .string()
    .min(1, 'Password is required')
    .max(128, 'Password too long'),
}).refine(
  (data) => !!(data.identifier || data.email || data.username || data.name),
  {
    message: 'Email, username, or name is required',
    path: ['identifier']
  }
);

export const registerSchema = z.object({
  name: z
    .string()
    .min(2, 'Name must be at least 2 characters')
    .max(100, 'Name too long')
    .regex(/^[a-zA-Z\s]+$/, 'Name can only contain letters and spaces'),
  email: z
    .string()
    .email('Invalid email format')
    .max(255, 'Email too long'),
  username: z
    .string()
    .min(3, 'Username must be at least 3 characters')
    .max(50, 'Username too long')
    .regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores')
    .optional(),
  password: z
    .string()
    .min(6, 'Password must be at least 6 characters')
    .max(128, 'Password too long'),
  roll_number: z
    .string()
    .max(20, 'Roll number too long')
    .optional(),
  batch: z
    .string()
    .max(20, 'Batch too long')
    .optional(),
});

export const verifyOtpSchema = z.object({
  email: z
    .string()
    .email('Invalid email format'),
  otp: z
    .string()
    .length(6, 'OTP must be exactly 6 digits')
    .regex(/^\d+$/, 'OTP must contain only digits'),
});

export const resendOtpSchema = z.object({
  email: z
    .string()
    .email('Invalid email format'),
});

// ---------------------------------------------------------------- borrow schemas
export const borrowRequestSchema = z.object({
  itemId: z.string().min(1, 'Item ID is required'),
  inventory_id: z.string().optional(),
  item_id: z.string().optional(),
  itemName: z.string().optional(),
  quantity: z
    .number()
    .int('Quantity must be a whole number')
    .positive('Quantity must be positive')
    .max(100, 'Quantity too large'),
  purpose: z
    .string()
    .min(1, 'Purpose is required')
    .max(500, 'Purpose too long'),
  duration_days: z
    .number()
    .int()
    .positive()
    .max(90, 'Maximum borrow duration is 90 days')
    .optional()
    .default(7),
  dueDate: z.string().optional(),
  borrowerName: z
    .string()
    .min(1, 'Borrower name is required')
    .max(100, 'Name too long'),
  borrower_name: z.string().optional(),
  borrowerEmail: z.string().email().optional(),
  borrower_email: z.string().email().optional(),
  rollNumber: z.string().optional(),
  roll_number: z.string().optional(),
  status: z.string().optional(),
});

export const returnSchema = z.object({
  borrowId: z.string().min(1, 'Borrow ID is required'),
});

// ---------------------------------------------------------------- inventory schemas
export const createItemSchema = z.object({
  name: z
    .string()
    .min(1, 'Item name is required')
    .max(200, 'Name too long'),
  category: z
    .string()
    .min(1, 'Category is required'),
  quantity: z
    .number()
    .int('Quantity must be a whole number')
    .positive('Quantity must be positive')
    .max(10000, 'Quantity too large'),
  location: z
    .string()
    .min(1, 'Location is required')
    .max(200, 'Location too long'),
  description: z
    .string()
    .max(2000, 'Description too long')
    .optional(),
  tags: z
    .array(z.string())
    .optional()
    .default([]),
});

export const updateItemSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  category: z.string().min(1).optional(),
  quantity: z.number().int().positive().max(10000).optional(),
  available_quantity: z.number().int().min(0).max(10000).optional(),
  location: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  tags: z.array(z.string()).optional(),
});

// ---------------------------------------------------------------- validation middleware helper
import { Request, Response, NextFunction } from 'express';

export function validate(schema: z.ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const errors = result.error.issues.map((e: z.ZodIssue) => ({
        field: e.path.join('.'),
        message: e.message,
      }));
      const isMissingRegisterRequired =
        schema === registerSchema && (!req.body?.name || !req.body?.email || !req.body?.password);
      return res.status(400).json({
        status: 'error',
        message: isMissingRegisterRequired ? 'Name, email, and password required.' : (errors[0]?.message || 'Validation failed'),
        errors,
      });
    }
    req.body = result.data;
    next();
  };
}
