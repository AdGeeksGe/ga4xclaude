import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getAdminClient } from '../auth.js';
import { formatPropertyId, stripPropertyPrefix, propertyIdSchema } from '../helpers/schemas.js';
import { classifyGoogleError } from '../helpers/errors.js';

export function registerDiscoveryTools(server: McpServer): void {
  // ─── ga4_list_accounts ───
  server.registerTool(
    'ga4_list_accounts',
    {
      description: 'Lists all GA4 accounts accessible by the service account',
      inputSchema: z.object({}),
    },
    async () => {
      try {
        const admin = getAdminClient();
        const [accounts] = await admin.listAccounts({});
        const data = (accounts || []).map((a) => ({
          accountId: a.name ? a.name.replace('accounts/', '') : '',
          displayName: a.displayName || '',
          createTime: a.createTime?.seconds?.toString() || '',
          updateTime: a.updateTime?.seconds?.toString() || '',
        }));
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ success: true, tool: 'ga4_list_accounts', data }, null, 2),
            },
          ],
        };
      } catch (error) {
        const errResp = classifyGoogleError(error, 'ga4_list_accounts');
        return { content: [{ type: 'text' as const, text: JSON.stringify(errResp, null, 2) }], isError: true };
      }
    }
  );

  // ─── ga4_list_properties ───
  server.registerTool(
    'ga4_list_properties',
    {
      description:
        'Lists GA4 properties under a given account, or all accessible properties if no accountId is provided',
      inputSchema: z.object({
        accountId: z
          .string()
          .optional()
          .describe('Account ID to filter properties. If omitted, lists all accessible properties.'),
      }),
    },
    async ({ accountId }) => {
      try {
        const admin = getAdminClient();
        const filter = accountId ? `parent:accounts/${accountId}` : '';
        const [properties] = await admin.listProperties({ filter });
        const data = (properties || []).map((p) => ({
          propertyId: p.name ? stripPropertyPrefix(p.name) : '',
          displayName: p.displayName || '',
          industryCategory: p.industryCategory || '',
          timeZone: p.timeZone || '',
          currencyCode: p.currencyCode || '',
          serviceLevel: p.serviceLevel || '',
          createTime: p.createTime?.seconds?.toString() || '',
        }));
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ success: true, tool: 'ga4_list_properties', data }, null, 2),
            },
          ],
        };
      } catch (error) {
        const errResp = classifyGoogleError(error, 'ga4_list_properties');
        return { content: [{ type: 'text' as const, text: JSON.stringify(errResp, null, 2) }], isError: true };
      }
    }
  );

  // ─── ga4_get_property ───
  server.registerTool(
    'ga4_get_property',
    {
      description: 'Get detailed metadata for a single GA4 property',
      inputSchema: z.object({
        propertyId: propertyIdSchema,
      }),
    },
    async ({ propertyId }) => {
      try {
        const admin = getAdminClient();
        const [property] = await admin.getProperty({ name: formatPropertyId(propertyId) });
        const data = {
          propertyId: property.name ? stripPropertyPrefix(property.name) : '',
          displayName: property.displayName || '',
          timeZone: property.timeZone || '',
          currencyCode: property.currencyCode || '',
          industryCategory: property.industryCategory || '',
          serviceLevel: property.serviceLevel || '',
          createTime: property.createTime?.seconds?.toString() || '',
          updateTime: property.updateTime?.seconds?.toString() || '',
          parent: property.parent || '',
        };
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                { success: true, tool: 'ga4_get_property', propertyId, data },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        const errResp = classifyGoogleError(error, 'ga4_get_property');
        return { content: [{ type: 'text' as const, text: JSON.stringify(errResp, null, 2) }], isError: true };
      }
    }
  );

  // ─── ga4_list_data_streams ───
  server.registerTool(
    'ga4_list_data_streams',
    {
      description: 'Lists web and app data streams for a GA4 property',
      inputSchema: z.object({
        propertyId: propertyIdSchema,
      }),
    },
    async ({ propertyId }) => {
      try {
        const admin = getAdminClient();
        const [streams] = await admin.listDataStreams({
          parent: formatPropertyId(propertyId),
        });
        const data = (streams || []).map((s) => ({
          streamId: s.name || '',
          type: s.type || '',
          displayName: s.displayName || '',
          webStreamData: s.webStreamData
            ? {
                measurementId: s.webStreamData.measurementId || '',
                defaultUri: s.webStreamData.defaultUri || '',
              }
            : undefined,
          androidAppStreamData: s.androidAppStreamData
            ? { firebaseAppId: s.androidAppStreamData.firebaseAppId || '' }
            : undefined,
          iosAppStreamData: s.iosAppStreamData
            ? { firebaseAppId: s.iosAppStreamData.firebaseAppId || '' }
            : undefined,
          createTime: s.createTime?.seconds?.toString() || '',
          updateTime: s.updateTime?.seconds?.toString() || '',
        }));
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                { success: true, tool: 'ga4_list_data_streams', propertyId, data },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        const errResp = classifyGoogleError(error, 'ga4_list_data_streams');
        return { content: [{ type: 'text' as const, text: JSON.stringify(errResp, null, 2) }], isError: true };
      }
    }
  );

  // ─── ga4_list_custom_dimensions ───
  server.registerTool(
    'ga4_list_custom_dimensions',
    {
      description: 'Lists all custom dimensions for a GA4 property',
      inputSchema: z.object({
        propertyId: propertyIdSchema,
      }),
    },
    async ({ propertyId }) => {
      try {
        const admin = getAdminClient();
        const [dimensions] = await admin.listCustomDimensions({
          parent: formatPropertyId(propertyId),
        });
        const data = (dimensions || []).map((d) => ({
          parameterName: d.parameterName || '',
          displayName: d.displayName || '',
          description: d.description || '',
          scope: d.scope || '',
          disallowAdsPersonalization: d.disallowAdsPersonalization || false,
        }));
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                { success: true, tool: 'ga4_list_custom_dimensions', propertyId, data },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        const errResp = classifyGoogleError(error, 'ga4_list_custom_dimensions');
        return { content: [{ type: 'text' as const, text: JSON.stringify(errResp, null, 2) }], isError: true };
      }
    }
  );

  // ─── ga4_list_custom_metrics ───
  server.registerTool(
    'ga4_list_custom_metrics',
    {
      description: 'Lists all custom metrics for a GA4 property',
      inputSchema: z.object({
        propertyId: propertyIdSchema,
      }),
    },
    async ({ propertyId }) => {
      try {
        const admin = getAdminClient();
        const [metrics] = await admin.listCustomMetrics({
          parent: formatPropertyId(propertyId),
        });
        const data = (metrics || []).map((m) => ({
          parameterName: m.parameterName || '',
          displayName: m.displayName || '',
          description: m.description || '',
          scope: m.scope || '',
          measurementUnit: m.measurementUnit || '',
          restrictedMetricType: m.restrictedMetricType || [],
        }));
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                { success: true, tool: 'ga4_list_custom_metrics', propertyId, data },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        const errResp = classifyGoogleError(error, 'ga4_list_custom_metrics');
        return { content: [{ type: 'text' as const, text: JSON.stringify(errResp, null, 2) }], isError: true };
      }
    }
  );

  // ─── ga4_list_audiences ───
  server.registerTool(
    'ga4_list_audiences',
    {
      description: 'Lists configured audiences for a GA4 property',
      inputSchema: z.object({
        propertyId: propertyIdSchema,
      }),
    },
    async ({ propertyId }) => {
      try {
        const admin = getAdminClient();
        const [audiences] = await admin.listAudiences({
          parent: formatPropertyId(propertyId),
        });
        const data = (audiences || []).map((a) => ({
          name: a.name || '',
          displayName: a.displayName || '',
          description: a.description || '',
          membershipDurationDays: a.membershipDurationDays || 0,
        }));
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                { success: true, tool: 'ga4_list_audiences', propertyId, data },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        const errResp = classifyGoogleError(error, 'ga4_list_audiences');
        return { content: [{ type: 'text' as const, text: JSON.stringify(errResp, null, 2) }], isError: true };
      }
    }
  );

  // ─── ga4_list_key_events ───
  server.registerTool(
    'ga4_list_key_events',
    {
      description: 'Lists key events (conversions) configured for a GA4 property',
      inputSchema: z.object({
        propertyId: propertyIdSchema,
      }),
    },
    async ({ propertyId }) => {
      try {
        const admin = getAdminClient();
        const [keyEvents] = await admin.listKeyEvents({
          parent: formatPropertyId(propertyId),
        });
        const data = (keyEvents || []).map((k) => ({
          name: k.name || '',
          eventName: k.eventName || '',
          createTime: k.createTime?.seconds?.toString() || '',
          deletable: k.deletable || false,
          custom: k.custom || false,
          countingMethod: k.countingMethod || '',
        }));
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                { success: true, tool: 'ga4_list_key_events', propertyId, data },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        const errResp = classifyGoogleError(error, 'ga4_list_key_events');
        return { content: [{ type: 'text' as const, text: JSON.stringify(errResp, null, 2) }], isError: true };
      }
    }
  );
}
