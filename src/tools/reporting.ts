import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { callDataApi } from '../auth.js';
import {
  propertyIdSchema,
  dateRangeSchema,
  dimensionFilterSchema,
  metricFilterSchema,
  orderBySchema,
} from '../helpers/schemas.js';
import { classifyGoogleError } from '../helpers/errors.js';
import { flattenRows } from '../helpers/formatters.js';

function success(tool: string, data: unknown, extra?: Record<string, unknown>) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify({ success: true, tool, ...extra, data }, null, 2) }],
  };
}

function error(tool: string, err: unknown) {
  const errResp = classifyGoogleError(err, tool);
  return { content: [{ type: 'text' as const, text: JSON.stringify(errResp, null, 2) }], isError: true as const };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildDimensionFilter(filter: any): any {
  if (!filter) return undefined;
  if (filter.stringFilter) {
    return { filter: { fieldName: filter.fieldName, stringFilter: filter.stringFilter } };
  }
  if (filter.inListFilter) {
    return { filter: { fieldName: filter.fieldName, inListFilter: filter.inListFilter } };
  }
  return undefined;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildMetricFilter(filter: any): any {
  if (!filter) return undefined;
  return { filter: { fieldName: filter.fieldName, numericFilter: filter.numericFilter } };
}

function buildOrderBys(orderBys: Array<{ fieldName: string; desc?: boolean }> | undefined) {
  if (!orderBys) return undefined;
  return orderBys.map(o => ({ dimension: { dimensionName: o.fieldName }, desc: o.desc || false }));
}

interface ReportResponse {
  dimensionHeaders?: Array<{ name?: string }>;
  metricHeaders?: Array<{ name?: string }>;
  rows?: Array<{ dimensionValues?: Array<{ value?: string }>; metricValues?: Array<{ value?: string }> }>;
  rowCount?: number;
  metadata?: { currencyCode?: string; dataLossFromOtherRow?: boolean };
  propertyQuota?: { tokensPerDay?: unknown; tokensPerHour?: unknown; concurrentRequests?: unknown };
}

interface BatchResponse {
  reports?: ReportResponse[];
}

export function registerReportingTools(server: McpServer): void {
  server.registerTool(
    'ga4_run_report',
    {
      description: 'Runs a standard GA4 report with dimensions, metrics, date ranges, filters, and sorting',
      inputSchema: z.object({
        propertyId: propertyIdSchema,
        dateRanges: z.array(dateRangeSchema).min(1).describe('At least one date range'),
        dimensions: z.array(z.string()).optional().describe('Array of dimension API names (e.g. ["city", "deviceCategory"])'),
        metrics: z.array(z.string()).min(1).describe('Array of metric API names (e.g. ["activeUsers", "sessions"])'),
        dimensionFilter: dimensionFilterSchema.optional(),
        metricFilter: metricFilterSchema.optional(),
        orderBys: z.array(orderBySchema).optional(),
        limit: z.number().optional().default(10000).describe('Max rows (default 10000)'),
        offset: z.number().optional().default(0).describe('Pagination offset'),
        keepEmptyRows: z.boolean().optional().default(false),
        currencyCode: z.string().optional().describe('Currency code, e.g. "USD"'),
      }),
    },
    async ({ propertyId, dateRanges, dimensions, metrics, dimensionFilter, metricFilter, orderBys, limit, offset, keepEmptyRows, currencyCode }) => {
      try {
        const response = await callDataApi<ReportResponse>(`/properties/${propertyId}:runReport`, {
          dateRanges,
          dimensions: dimensions?.map(d => ({ name: d })),
          metrics: metrics.map(m => ({ name: m })),
          dimensionFilter: buildDimensionFilter(dimensionFilter),
          metricFilter: buildMetricFilter(metricFilter),
          orderBys: buildOrderBys(orderBys),
          limit,
          offset,
          keepEmptyRows,
          currencyCode,
        });

        const rows = flattenRows(response.dimensionHeaders, response.metricHeaders, response.rows);
        const rowCount = response.rowCount || rows.length;

        const result: Record<string, unknown> = {
          rows,
          metadata: {
            currencyCode: response.metadata?.currencyCode || currencyCode,
            dataLossFromOtherRow: response.metadata?.dataLossFromOtherRow || false,
          },
        };

        if (response.propertyQuota) {
          (result.metadata as Record<string, unknown>).propertyQuota = response.propertyQuota;
        }

        if (rowCount > (offset || 0) + rows.length) {
          result.pagination = { nextOffset: (offset || 0) + rows.length, totalRows: rowCount };
        }

        return success('ga4_run_report', result, { propertyId, rowCount });
      } catch (e) { return error('ga4_run_report', e); }
    }
  );

  server.registerTool(
    'ga4_run_realtime_report',
    {
      description: 'Fetches real-time GA4 data (last 30 minutes)',
      inputSchema: z.object({
        propertyId: propertyIdSchema,
        dimensions: z.array(z.string()).optional().describe('e.g. ["country", "city", "unifiedScreenName"]'),
        metrics: z.array(z.string()).min(1).describe('e.g. ["activeUsers", "screenPageViews"]'),
        dimensionFilter: dimensionFilterSchema.optional(),
        metricFilter: metricFilterSchema.optional(),
        limit: z.number().optional().default(100),
      }),
    },
    async ({ propertyId, dimensions, metrics, dimensionFilter, metricFilter, limit }) => {
      try {
        const response = await callDataApi<ReportResponse>(`/properties/${propertyId}:runRealtimeReport`, {
          dimensions: dimensions?.map(d => ({ name: d })),
          metrics: metrics.map(m => ({ name: m })),
          dimensionFilter: buildDimensionFilter(dimensionFilter),
          metricFilter: buildMetricFilter(metricFilter),
          limit,
        });

        const rows = flattenRows(response.dimensionHeaders, response.metricHeaders, response.rows);
        return success('ga4_run_realtime_report', { rows }, { propertyId, rowCount: response.rowCount || rows.length });
      } catch (e) { return error('ga4_run_realtime_report', e); }
    }
  );

  server.registerTool(
    'ga4_run_pivot_report',
    {
      description: 'Runs a pivot table report for cross-tabulation analysis',
      inputSchema: z.object({
        propertyId: propertyIdSchema,
        dateRanges: z.array(dateRangeSchema).min(1),
        dimensions: z.array(z.string()).min(1),
        metrics: z.array(z.string()).min(1),
        pivots: z.array(z.object({
          fieldNames: z.array(z.string()),
          orderBys: z.array(z.object({ fieldName: z.string(), desc: z.boolean().optional() })).optional(),
          limit: z.number().optional(),
        })).min(1),
        dimensionFilter: dimensionFilterSchema.optional(),
        metricFilter: metricFilterSchema.optional(),
      }),
    },
    async ({ propertyId, dateRanges, dimensions, metrics, pivots, dimensionFilter, metricFilter }) => {
      try {
        const response = await callDataApi<ReportResponse & { pivotHeaders?: unknown }>(`/properties/${propertyId}:runPivotReport`, {
          dateRanges,
          dimensions: dimensions.map(d => ({ name: d })),
          metrics: metrics.map(m => ({ name: m })),
          pivots: pivots.map(p => ({
            fieldNames: p.fieldNames,
            orderBys: p.orderBys?.map(o => ({ dimension: { dimensionName: o.fieldName }, desc: o.desc || false })),
            limit: p.limit,
          })),
          dimensionFilter: buildDimensionFilter(dimensionFilter),
          metricFilter: buildMetricFilter(metricFilter),
        });

        const rows = flattenRows(response.dimensionHeaders, response.metricHeaders, response.rows);
        return success('ga4_run_pivot_report', { rows, pivotHeaders: response.pivotHeaders }, { propertyId, rowCount: rows.length });
      } catch (e) { return error('ga4_run_pivot_report', e); }
    }
  );

  server.registerTool(
    'ga4_batch_run_reports',
    {
      description: 'Runs up to 5 reports in a single API call (efficient for dashboards)',
      inputSchema: z.object({
        propertyId: propertyIdSchema,
        requests: z.array(z.object({
          dateRanges: z.array(dateRangeSchema).min(1),
          dimensions: z.array(z.string()).optional(),
          metrics: z.array(z.string()).min(1),
          dimensionFilter: dimensionFilterSchema.optional(),
          metricFilter: metricFilterSchema.optional(),
          orderBys: z.array(orderBySchema).optional(),
          limit: z.number().optional().default(10000),
          offset: z.number().optional().default(0),
        })).min(1).max(5).describe('Array of up to 5 report requests'),
      }),
    },
    async ({ propertyId, requests }) => {
      try {
        const response = await callDataApi<BatchResponse>(`/properties/${propertyId}:batchRunReports`, {
          requests: requests.map(r => ({
            dateRanges: r.dateRanges,
            dimensions: r.dimensions?.map(d => ({ name: d })),
            metrics: r.metrics.map(m => ({ name: m })),
            dimensionFilter: buildDimensionFilter(r.dimensionFilter),
            metricFilter: buildMetricFilter(r.metricFilter),
            orderBys: buildOrderBys(r.orderBys),
            limit: r.limit,
            offset: r.offset,
          })),
        });

        const reports = (response.reports || []).map((report, idx) => ({
          reportIndex: idx,
          rowCount: report.rowCount || 0,
          rows: flattenRows(report.dimensionHeaders, report.metricHeaders, report.rows),
        }));

        return success('ga4_batch_run_reports', { reports }, { propertyId });
      } catch (e) { return error('ga4_batch_run_reports', e); }
    }
  );
}
