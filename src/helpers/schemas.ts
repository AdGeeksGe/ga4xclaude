import { z } from 'zod';

export const propertyIdSchema = z
  .string()
  .describe('GA4 property ID (numeric string, e.g. "396547812")');

export const dateRangeSchema = z.object({
  startDate: z
    .string()
    .describe('Start date (YYYY-MM-DD or relative: "today", "yesterday", "7daysAgo", "30daysAgo", "90daysAgo")'),
  endDate: z
    .string()
    .describe('End date (YYYY-MM-DD or relative: "today", "yesterday")'),
});

export const stringFilterSchema = z.object({
  matchType: z.enum([
    'EXACT',
    'BEGINS_WITH',
    'ENDS_WITH',
    'CONTAINS',
    'FULL_REGEXP',
    'PARTIAL_REGEXP',
  ]),
  value: z.string(),
  caseSensitive: z.boolean().optional(),
});

export const inListFilterSchema = z.object({
  values: z.array(z.string()),
});

export const dimensionFilterSchema = z.object({
  fieldName: z.string(),
  stringFilter: stringFilterSchema.optional(),
  inListFilter: inListFilterSchema.optional(),
});

export const numericFilterSchema = z.object({
  operation: z.enum([
    'EQUAL',
    'LESS_THAN',
    'LESS_THAN_OR_EQUAL',
    'GREATER_THAN',
    'GREATER_THAN_OR_EQUAL',
  ]),
  value: z.object({
    int64Value: z.string().optional(),
    doubleValue: z.number().optional(),
  }),
});

export const metricFilterSchema = z.object({
  fieldName: z.string(),
  numericFilter: numericFilterSchema,
});

export const orderBySchema = z.object({
  fieldName: z.string().describe('Dimension or metric name to sort by'),
  desc: z.boolean().optional().describe('Sort descending (default false)'),
});

export function formatPropertyId(propertyId: string): string {
  if (propertyId.startsWith('properties/')) {
    return propertyId;
  }
  return `properties/${propertyId}`;
}

export function stripPropertyPrefix(name: string): string {
  if (name.startsWith('properties/')) {
    return name.slice('properties/'.length);
  }
  return name;
}
