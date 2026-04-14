import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { callDataApi, callAlphaDataApi } from '../auth.js';
import { propertyIdSchema, dateRangeSchema } from '../helpers/schemas.js';
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

interface MetadataResponse {
  dimensions?: Array<{ apiName?: string; uiName?: string; description?: string; category?: string; customDefinition?: boolean; deprecatedApiNames?: string[] }>;
  metrics?: Array<{ apiName?: string; uiName?: string; description?: string; category?: string; customDefinition?: boolean; deprecatedApiNames?: string[]; type?: string; expression?: string }>;
}

interface CompatibilityResponse {
  dimensionCompatibilities?: Array<{ dimensionMetadata?: { apiName?: string }; compatibility?: string }>;
  metricCompatibilities?: Array<{ metricMetadata?: { apiName?: string }; compatibility?: string }>;
}

interface FunnelResponse {
  funnelTable?: {
    dimensionHeaders?: Array<{ name?: string }>;
    metricHeaders?: Array<{ name?: string }>;
    rows?: Array<{ dimensionValues?: Array<{ value?: string }>; metricValues?: Array<{ value?: string }> }>;
  };
  funnelVisualization?: {
    dimensionHeaders?: Array<{ name?: string }>;
    metricHeaders?: Array<{ name?: string }>;
    rows?: Array<{ dimensionValues?: Array<{ value?: string }>; metricValues?: Array<{ value?: string }> }>;
  };
}

export function registerSpecializedTools(server: McpServer): void {
  server.registerTool(
    'ga4_get_metadata',
    {
      description: 'Returns all available dimensions and metrics for a GA4 property (including custom ones). Use this before building report queries to know which fields are valid.',
      inputSchema: z.object({ propertyId: propertyIdSchema }),
    },
    async ({ propertyId }) => {
      try {
        const response = await callDataApi<MetadataResponse>(`/properties/${propertyId}/metadata`, undefined);
        const dimensions = (response.dimensions || []).map(d => ({
          apiName: d.apiName || '', uiName: d.uiName || '', description: d.description || '',
          category: d.category || '', customDefinition: d.customDefinition || false,
        }));
        const metrics = (response.metrics || []).map(m => ({
          apiName: m.apiName || '', uiName: m.uiName || '', description: m.description || '',
          category: m.category || '', customDefinition: m.customDefinition || false, type: m.type || '',
        }));
        return success('ga4_get_metadata', { dimensionCount: dimensions.length, metricCount: metrics.length, dimensions, metrics }, { propertyId });
      } catch (e) { return error('ga4_get_metadata', e); }
    }
  );

  server.registerTool(
    'ga4_run_funnel_report',
    {
      description: 'Runs a funnel exploration report showing user progression through defined steps',
      inputSchema: z.object({
        propertyId: propertyIdSchema,
        dateRanges: z.array(dateRangeSchema).min(1),
        funnel: z.object({
          steps: z.array(z.object({
            name: z.string().describe('Step name'),
            filterExpression: z.object({
              andGroup: z.object({ expressions: z.array(z.object({
                funnelFieldFilter: z.object({ fieldName: z.string(), stringFilter: z.object({ matchType: z.enum(['EXACT','BEGINS_WITH','ENDS_WITH','CONTAINS','FULL_REGEXP','PARTIAL_REGEXP']), value: z.string(), caseSensitive: z.boolean().optional() }).optional() }).optional(),
                funnelEventFilter: z.object({ eventName: z.string() }).optional(),
              })) }).optional(),
              orGroup: z.object({ expressions: z.array(z.object({
                funnelFieldFilter: z.object({ fieldName: z.string(), stringFilter: z.object({ matchType: z.enum(['EXACT','BEGINS_WITH','ENDS_WITH','CONTAINS','FULL_REGEXP','PARTIAL_REGEXP']), value: z.string(), caseSensitive: z.boolean().optional() }).optional() }).optional(),
                funnelEventFilter: z.object({ eventName: z.string() }).optional(),
              })) }).optional(),
              funnelFieldFilter: z.object({ fieldName: z.string(), stringFilter: z.object({ matchType: z.enum(['EXACT','BEGINS_WITH','ENDS_WITH','CONTAINS','FULL_REGEXP','PARTIAL_REGEXP']), value: z.string(), caseSensitive: z.boolean().optional() }).optional() }).optional(),
              funnelEventFilter: z.object({ eventName: z.string() }).optional(),
            }),
          })).min(1),
          isOpenFunnel: z.boolean().optional().describe('If true, users can enter at any step'),
        }),
        funnelBreakdown: z.object({ breakdownDimension: z.object({ name: z.string() }) }).optional(),
      }),
    },
    async ({ propertyId, dateRanges, funnel, funnelBreakdown }) => {
      try {
        const response = await callAlphaDataApi<FunnelResponse>(`/properties/${propertyId}:runFunnelReport`, {
          dateRanges,
          funnel,
          funnelBreakdown,
        });

        const funnelTable = response.funnelTable;
        const rows = funnelTable ? flattenRows(funnelTable.dimensionHeaders, funnelTable.metricHeaders, funnelTable.rows) : [];

        return success('ga4_run_funnel_report', {
          funnelTable: rows,
          funnelVisualization: response.funnelVisualization
            ? flattenRows(response.funnelVisualization.dimensionHeaders, response.funnelVisualization.metricHeaders, response.funnelVisualization.rows)
            : [],
        }, { propertyId, rowCount: rows.length });
      } catch (e) { return error('ga4_run_funnel_report', e); }
    }
  );

  server.registerTool(
    'ga4_check_compatibility',
    {
      description: 'Checks which dimensions and metrics can be used together in a report. Use this to validate combinations before running reports.',
      inputSchema: z.object({
        propertyId: propertyIdSchema,
        dimensions: z.array(z.string()).optional().describe('Dimension names to test'),
        metrics: z.array(z.string()).optional().describe('Metric names to test'),
      }),
    },
    async ({ propertyId, dimensions, metrics }) => {
      try {
        const response = await callDataApi<CompatibilityResponse>(`/properties/${propertyId}:checkCompatibility`, {
          dimensions: dimensions?.map(d => ({ name: d })),
          metrics: metrics?.map(m => ({ name: m })),
        });

        return success('ga4_check_compatibility', {
          dimensionCompatibilities: (response.dimensionCompatibilities || []).map(dc => ({
            dimension: dc.dimensionMetadata?.apiName || '',
            compatible: dc.compatibility === 'COMPATIBLE',
            compatibility: dc.compatibility || '',
          })),
          metricCompatibilities: (response.metricCompatibilities || []).map(mc => ({
            metric: mc.metricMetadata?.apiName || '',
            compatible: mc.compatibility === 'COMPATIBLE',
            compatibility: mc.compatibility || '',
          })),
        }, { propertyId });
      } catch (e) { return error('ga4_check_compatibility', e); }
    }
  );
}
