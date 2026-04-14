import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getDataClient, getAlphaDataClient } from '../auth.js';
import { formatPropertyId, propertyIdSchema, dateRangeSchema } from '../helpers/schemas.js';
import { classifyGoogleError } from '../helpers/errors.js';
import { flattenRows } from '../helpers/formatters.js';

export function registerSpecializedTools(server: McpServer): void {
  // ─── ga4_get_metadata ───
  server.registerTool(
    'ga4_get_metadata',
    {
      description:
        'Returns all available dimensions and metrics for a GA4 property (including custom ones). Use this before building report queries to know which fields are valid.',
      inputSchema: z.object({
        propertyId: propertyIdSchema,
      }),
    },
    async ({ propertyId }) => {
      try {
        const client = getDataClient();
        const metadataResponse = await client.getMetadata({
          name: `${formatPropertyId(propertyId)}/metadata`,
        });
        const response = metadataResponse[0];

        const dimensions = (response.dimensions || []).map((d) => ({
          apiName: d.apiName || '',
          uiName: d.uiName || '',
          description: d.description || '',
          category: d.category || '',
          customDefinition: d.customDefinition || false,
          deprecatedApiNames: d.deprecatedApiNames || [],
        }));

        const metrics = (response.metrics || []).map((m) => ({
          apiName: m.apiName || '',
          uiName: m.uiName || '',
          description: m.description || '',
          category: m.category || '',
          customDefinition: m.customDefinition || false,
          deprecatedApiNames: m.deprecatedApiNames || [],
          type: m.type || '',
          expression: m.expression || '',
        }));

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  success: true,
                  tool: 'ga4_get_metadata',
                  propertyId,
                  data: {
                    dimensionCount: dimensions.length,
                    metricCount: metrics.length,
                    dimensions,
                    metrics,
                  },
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        const errResp = classifyGoogleError(error, 'ga4_get_metadata');
        return { content: [{ type: 'text' as const, text: JSON.stringify(errResp, null, 2) }], isError: true };
      }
    }
  );

  // ─── ga4_run_funnel_report ───
  server.registerTool(
    'ga4_run_funnel_report',
    {
      description: 'Runs a funnel exploration report showing user progression through defined steps',
      inputSchema: z.object({
        propertyId: propertyIdSchema,
        dateRanges: z.array(dateRangeSchema).min(1),
        funnel: z.object({
          steps: z
            .array(
              z.object({
                name: z.string().describe('Step name'),
                filterExpression: z.object({
                  andGroup: z
                    .object({
                      expressions: z.array(
                        z.object({
                          funnelFieldFilter: z
                            .object({
                              fieldName: z.string(),
                              stringFilter: z
                                .object({
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
                                })
                                .optional(),
                            })
                            .optional(),
                          funnelEventFilter: z
                            .object({
                              eventName: z.string(),
                            })
                            .optional(),
                        })
                      ),
                    })
                    .optional(),
                  orGroup: z
                    .object({
                      expressions: z.array(
                        z.object({
                          funnelFieldFilter: z
                            .object({
                              fieldName: z.string(),
                              stringFilter: z
                                .object({
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
                                })
                                .optional(),
                            })
                            .optional(),
                          funnelEventFilter: z
                            .object({
                              eventName: z.string(),
                            })
                            .optional(),
                        })
                      ),
                    })
                    .optional(),
                  funnelFieldFilter: z
                    .object({
                      fieldName: z.string(),
                      stringFilter: z
                        .object({
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
                        })
                        .optional(),
                    })
                    .optional(),
                  funnelEventFilter: z
                    .object({
                      eventName: z.string(),
                    })
                    .optional(),
                }),
              })
            )
            .min(1),
          isOpenFunnel: z.boolean().optional().describe('If true, users can enter at any step'),
        }),
        funnelBreakdown: z
          .object({
            breakdownDimension: z.object({
              name: z.string(),
            }),
          })
          .optional(),
      }),
    },
    async ({ propertyId, dateRanges, funnel, funnelBreakdown }) => {
      try {
        const client = getAlphaDataClient();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const funnelResponse = await (client as any).runFunnelReport({
          property: formatPropertyId(propertyId),
          dateRanges: dateRanges.map((dr) => ({
            startDate: dr.startDate,
            endDate: dr.endDate,
          })),
          funnel: {
            steps: funnel.steps.map((step) => ({
              name: step.name,
              filterExpression: step.filterExpression,
            })),
            isOpenFunnel: funnel.isOpenFunnel,
          },
          funnelBreakdown: funnelBreakdown,
        });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const response = funnelResponse[0] as any;

        const funnelTable = response.funnelTable;
        const rows = funnelTable
          ? flattenRows(
              funnelTable.dimensionHeaders,
              funnelTable.metricHeaders,
              funnelTable.rows
            )
          : [];

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  success: true,
                  tool: 'ga4_run_funnel_report',
                  propertyId,
                  rowCount: rows.length,
                  data: {
                    funnelTable: rows,
                    funnelVisualization: response.funnelVisualization
                      ? flattenRows(
                          response.funnelVisualization.dimensionHeaders,
                          response.funnelVisualization.metricHeaders,
                          response.funnelVisualization.rows
                        )
                      : [],
                  },
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        const errResp = classifyGoogleError(error, 'ga4_run_funnel_report');
        return { content: [{ type: 'text' as const, text: JSON.stringify(errResp, null, 2) }], isError: true };
      }
    }
  );

  // ─── ga4_check_compatibility ───
  server.registerTool(
    'ga4_check_compatibility',
    {
      description:
        'Checks which dimensions and metrics can be used together in a report. Use this to validate combinations before running reports.',
      inputSchema: z.object({
        propertyId: propertyIdSchema,
        dimensions: z.array(z.string()).optional().describe('Dimension names to test compatibility'),
        metrics: z.array(z.string()).optional().describe('Metric names to test compatibility'),
      }),
    },
    async ({ propertyId, dimensions, metrics }) => {
      try {
        const client = getDataClient();
        const compatResponse = await client.checkCompatibility({
          property: formatPropertyId(propertyId),
          dimensions: dimensions?.map((d) => ({ name: d })),
          metrics: metrics?.map((m) => ({ name: m })),
        });
        const response = compatResponse[0];

        const data = {
          dimensionCompatibilities: (response.dimensionCompatibilities || []).map((dc) => ({
            dimension: dc.dimensionMetadata?.apiName || '',
            compatible: dc.compatibility === 'COMPATIBLE',
            compatibility: dc.compatibility || '',
          })),
          metricCompatibilities: (response.metricCompatibilities || []).map((mc) => ({
            metric: mc.metricMetadata?.apiName || '',
            compatible: mc.compatibility === 'COMPATIBLE',
            compatibility: mc.compatibility || '',
          })),
        };

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  success: true,
                  tool: 'ga4_check_compatibility',
                  propertyId,
                  data,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        const errResp = classifyGoogleError(error, 'ga4_check_compatibility');
        return { content: [{ type: 'text' as const, text: JSON.stringify(errResp, null, 2) }], isError: true };
      }
    }
  );
}
