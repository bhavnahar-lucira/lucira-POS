import { z } from 'zod';

const numeric = () => z.coerce.number();

export const recentlyViewedItemSchema = z.object({
  item_id:    numeric().int().positive(),
  item_code:  z.string().nullable().optional(),
  item_name:  z.string().nullable().optional(),
  image:      z.string().nullable().optional(),
  image_url:  z.string().nullable().optional(),
  image_1:    z.string().nullable().optional(),
  metal_id:   numeric().int().nullable().optional(),
  karat_code: z.string().nullable().optional(),
  karat_id:      numeric().int().nullable().optional(),
  type_id:       numeric().int().nullable().optional(),
  sub_type_id:   numeric().int().nullable().optional(),
  item_group_id: numeric().int().nullable().optional(),
  metal_color_code: z.string().nullable().optional(),
  metal_color_name: z.string().nullable().optional(),
  has_stock:  z.boolean().nullable().optional(),
  net_weight: numeric().nullable().optional(),
  weight:     numeric().nullable().optional(),
  style_id:   numeric().int().nullable().optional(),
});

export const recordViewSchema = z.object({
  party_id:       numeric().int().positive(),
  customerName:   z.string().nullable().optional(),
  customerMobile: z.string().nullable().optional(),
  item:           recentlyViewedItemSchema,
});
