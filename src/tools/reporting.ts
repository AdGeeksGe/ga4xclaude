import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getDataClient } from '../auth.js';
import {
  formatPropertyId,
  propertyIdSchema,
  dateRangeSchema,
  dimensionFilterSchema,
  metricFilterSchema,
  orderBySchema,
} from '../helpers/schemas.js';
import { classifyGoogleError } from '../helpers/errors.js';
import { flattenRows } from '../helpers/formatters.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildOrderBys(orderBys: Array<{ fieldName: string; desc?: boolean }> | undefined): any[] | undefined {
  if (!orderBys) return undefined;
  return orderBys.map((o) => ({
    dimension: { dimensionName: o.fieldName },
    desc: o.desc || false,
  }));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildDimensionFilter(filter: { fieldName: string; stringFilter?: { matchType: string; value: string; caseSensitive?: boolean }; inListFilter?: { values: string[] } } | undefined): any {
  if (!filter) return undefined;
  if (filter.stringFilter) {
    return {
      filter: {
        fieldName: filter.fieldName,
        stringFilter: {
          matchType: filter.stringFilter.matchType,
          value: filter.stringFilter.value,
          caseSensitive: filter.stringFilter.caseSensitive || false,
        },
      },
    };
  }
  if (filter.inListFilter) {
    return {
      filter: {
        fieldName: filter.fieldName,
        inListFilter: { values: filter.inListFilter.values },
      },
    };
  }
  return undefined;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildMetricFilter(filter: { fieldName: string; numericFilter: { operation: string; value: { int64Value?: string; doubleValue?: number } } } | undefined): any {
  if (!filter) return undefined;
  return {
    filter: {
      fieldName: filter.fieldName,
      numericFilter: {
        operation: filter.numericFilter.operation,
        value: filter.numericFilter.value,
      },
    },
  };
}

export function registerReportingTools(server: McpServer): void {
  // ─── ga4_run_report ───
  server.registerTool(
    'ga4_run_report',
    {
      description:
        'Runs a standard GA4 report with dimensions, metrics, date ranges, filters, and sorting',
      inputSchema: z.object({
        propertyId: propertyIdSchema,
        dateRanges: z.array(dateRangeSchema).min(1).describe('At least one date range'),
        dimensions: z
          .array(z.string())
          .optional()
          .describe('Array of dimension API names (e.g. ["city", "deviceCategory"])'),
        metrics: z
          .array(z.string())
          .min(1)
          .describe('Array of metric API names (e.g. ["activeUsers", "sessions"])'),
        dimensionFilter: dimensionFilterSchema.optional(),
        metricFilter: metricFilterSchema.optional(),
        orderBys: z.array(orderBySchema).optional(),
        limit: z.number().optional().default(10000).describe('Max rows (default 10000)'),
        offset: z.number().optional().default(0).describe('Pagination offset'),
        keepEmptyRows: z.boolean().optional().default(false),
        currencyCode: z.string().optional().describe('Currency code, e.g. "USD"'),
      }),
    },
    async ({
      propertyId,
      dateRanges,
      dimensions,
      metrics,
      dimensionFilter,
      metricFilter,
      orderBys,
      limit,
      offset,
      keepEmptyRows,
      currencyCode,
    }) => {
      try {
        const client = getDataClient();
        const reportResponse = await client.runReport({
          property: formatPropertyId(propertyId),
          dateRanges: dateRanges.map((dr) => ({
            startDate: dr.startDate,
            endDate: dr.endDate,
          })),
          dimensions: dimensions?.map((d) => ({ name: d })),
          metrics: metrics.map((m) => ({ name: m })),
          dimensionFilter: buildDimensionFilter(dimensionFilter),
          metricFilter: buildMetricFilter(metricFilter),
          orderBys: buildOrderBys(orderBys),
          limit,
          offset,
          keepEmptyRows,
          currencyCode,
        });
        const response = reportResponse[0];

        const rows = flattenRows(response.dimensionHeaders, response.metricHeaders, response.rows);
        const rowCount = response.rowCount || rows.length;

        const result: Record<string, unknown> = {
          success: true,
          tool: 'ga4_run_report',
          propertyId,
          rowCount,
          data: { rows },
          metadata: {
            currencyCode: response.metadata?.currencyCode || currencyCode,
            dataLossFromOtherRow: response.metadata?.dataLossFromOtherRow || false,
          },
        };

        if (response.propertyQuota) {
          (result.metadata as Record<string, unknown>).propertyQuota = {
            tokensPerDay: response.propertyQuota.tokensPerDay,
            tokensPerHour: response.propertyQuota.tokensPerHour,
            concurrentRequests: response.propertyQuota.concurrentRequests,
          };
        }

        if (rowCount > (offset || 0) + rows.length) {
          result.pagination = {
            nextOffset: (offset || 0) + rows.length,
            totalRows: rowCount,
          };
        }

        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        const errResp = classifyGoogleError(error, 'ga4_run_report');
        return { content: [{ type: 'text' as const, text: JSON.stringify(errResp, null, 2) }], isError: true };
      }
    }
  );

  // ─── ga4_run_realtime_report ───
  server.registerTool(
    'ga4_run_realtime_report',
    {
      description: 'Fetches real-time GA4 data (last 30 minutes)',
      inputSchema: z.object({
        propertyId: propertyIdSchema,
        dimensions: z
          .array(z.string())
          .optional()
          .describe('e.g. ["country", "city", "unifiedScreenName"]'),
        metrics: z
          .array(z.string())
          .min(1)
          .describe('e.g. ["activeUsers", "screenPageViews"]'),
        dimensionFilter: dimensionFilterSchema.optional(),
        metricFilter: metricFilterSchema.optional(),
        limit: z.number().optional().default(100),
      }),
    },
    async ({ propertyId, dimensions, metrics, dimensionFilter, metricFilter, limit }) => {
      try {
        const client = getDataClient();
        const reportResponse = await client.runRealtimeReport({
          property: formatPropertyId(propertyId),
          dimensions: dimensions?.map((d) => ({ name: d })),
          metrics: metrics.map((m) => ({ name: m })),
          dimensionFilter: buildDimensionFilter(dimensionFilter),
          metricFilter: buildMetricFilter(metricFilter),
          limit,
        });
        const response = reportResponse[0];

        const rows = flattenRows(response.dimensionHeaders, response.metricHeaders, response.rows);

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  success: true,
                  tool: 'ga4_run_realtime_report',
                  propertyId,
                  rowCount: response.rowCount || rows.length,
                  data: { rows },
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        const errResp = classifyGoogleError(error, 'ga4_run_realtime_report');
        return { content: [{ type: 'text' as const, text: JSON.stringify(errResp, null, 2) }], isError: true };
      }
    }
  );

  // ─── ga4_run_pivot_report ───
  server.registerTool(
    'ga4_run_pivot_report',
    {
      description: 'Runs a pivot table report for cross-tabulation analysis',
      inputSchema: z.object({
        propertyId: propertyIdSchema,
        dateRanges: z.array(dateRangeSchema).min(1),
        dimensions: z.array(z.string()).min(1),
        metrics: z.array(z.string()).min(1),
        pivots: z
          .array(
            z.object({
              fieldNames: z.array(z.string()),
              orderBys: z
                .array(
                  z.object({
                    fieldName: z.string(),
                    desc: z.boolean().optional(),
                  })
                )
                .optional(),
              limit: z.number().optional(),
            })
          )
          .min(1),
        dimensionFilter: dimensionFilterSchema.optional(),
        metricFilter: metricFilterSchema.optional(),
      }),
    },
    async ({ propertyId, dateRanges, dimensions, metrics, pivots, dimensionFilter, metricFilter }) => {
      try {
        const client = getDataClient();
        const reportResponse = await client.runPivotReport({
          property: formatPropertyId(propertyId),
          dateRanges: dateRanges.map((dr) => ({
            startDate: dr.startDate,
            endDate: dr.endDate,
          })),
          dimensions: dimensions.map((d) => ({ name: d })),
          metrics: metrics.map((m) => ({ name: m })),
          pivots: pivots.map((p) => ({
            fieldNames: p.fieldNames,
            orderBys: p.orderBys?.map((o) => ({
              dimension: { dimensionName: o.fieldName },
              desc: o.desc || false,
            })),
            limit: p.limit,
          })),
          dimensionFilter: buildDimensionFilter(dimensionFilter),
          metricFilter: buildMetricFilter(metricFilter),
        });
        const response = reportResponse[0];

        const rows = flattenRows(response.dimensionHeaders, response.metricHeaders, response.rows);

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  success: true,
                  tool: 'ga4_run_pivot_report',
                  propertyId,
                  rowCount: rows.length,
                  data: {
                    rows,
                    pivotHeaders: response.pivotHeaders,
                  },
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        const errResp = classifyGoogleError(error, 'ga4_run_pivot_report');
        return { content: [{ type: 'text' as const, text: JSON.stringify(errResp, null, 2) }], isError: true };
      }
    }
  );

  // ─── ga4_batch_run_reports ───
  server.registerTool(
    'ga4_batch_run_reports',
    {
      description: 'Runs up to 5 reports in a single API call (efficient for dashboards)',
      inputSchema: z.object({
        propertyId: propertyIdSchema,
        requests: z
          .array(
            z.object({
              dateRanges: z.array(dateRangeSchema).min(1),
              dimensions: z.array(z.string()).optional(),
              metrics: z.array(z.string()).min(1),
              dimensionFilter: dimensionFilterSchema.optional(),
              metricFilter: metricFilterSchema.optional(),
              orderBys: z.array(orderBySchema).optional(),
              limit: z.number().optional().default(10000),
              offset: z.number().optional().default(0),
            })
          )
          .min(1)
          .max(5)
          .describe('Array of up to 5 report requests'),
      }),
    },
    async ({ propertyId, requests }) => {
      try {
        const client = getDataClient();
        const batchResponse = await client.batchRunReports({
          property: formatPropertyId(propertyId),
          requests: requests.map((r) => ({
            dateRanges: r.dateRanges.map((dr) => ({
              startDate: dr.startDate,
              endDate: dr.endDate,
            })),
            dimensions: r.dimensions?.map((d) => ({ name: d })),
            metrics: r.metrics.map((m) => ({ name: m })),
            dimensionFilter: buildDimensionFilter(r.dimensionFilter),
            metricFilter: buildMetricFilter(r.metricFilter),
            orderBys: buildOrderBys(r.orderBys),
            limit: r.limit,
            offset: r.offset,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          })) as any[],
        });
        const response = batchResponse[0];

        const reports = (response.reports || []).map((report, idx) => ({
          reportIndex: idx,
          rowCount: report.rowCount || 0,
          rows: flattenRows(report.dimensionHeaders, report.metricHeaders, report.rows),
        }));

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  success: true,
                  tool: 'ga4_batch_run_reports',
                  propertyId,
                  data: { reports },
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        const errResp = classifyGoogleError(error, 'ga4_batch_run_reports');
        return { content: [{ type: 'text' as const, text: JSON.stringify(errResp, null, 2) }], isError: true };
      }
    }
  );
}
