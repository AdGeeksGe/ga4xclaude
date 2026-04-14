import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { callAdminApi } from '../auth.js';
import { propertyIdSchema } from '../helpers/schemas.js';
import { classifyGoogleError } from '../helpers/errors.js';

function success(tool: string, data: unknown, extra?: Record<string, unknown>) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify({ success: true, tool, ...extra, data }, null, 2) }],
  };
}

function error(tool: string, err: unknown) {
  const errResp = classifyGoogleError(err, tool);
  return { content: [{ type: 'text' as const, text: JSON.stringify(errResp, null, 2) }], isError: true as const };
}

interface Account {
  name?: string;
  displayName?: string;
  createTime?: string;
  updateTime?: string;
}

interface Property {
  name?: string;
  displayName?: string;
  industryCategory?: string;
  timeZone?: string;
  currencyCode?: string;
  serviceLevel?: string;
  createTime?: string;
  updateTime?: string;
  parent?: string;
}

interface DataStream {
  name?: string;
  type?: string;
  displayName?: string;
  webStreamData?: { measurementId?: string; defaultUri?: string };
  androidAppStreamData?: { firebaseAppId?: string };
  iosAppStreamData?: { firebaseAppId?: string };
  createTime?: string;
  updateTime?: string;
}

interface CustomDimension {
  parameterName?: string;
  displayName?: string;
  description?: string;
  scope?: string;
  disallowAdsPersonalization?: boolean;
}

interface CustomMetric {
  parameterName?: string;
  displayName?: string;
  description?: string;
  scope?: string;
  measurementUnit?: string;
  restrictedMetricType?: string[];
}

interface Audience {
  name?: string;
  displayName?: string;
  description?: string;
  membershipDurationDays?: number;
}

interface KeyEvent {
  name?: string;
  eventName?: string;
  createTime?: string;
  deletable?: boolean;
  custom?: boolean;
  countingMethod?: string;
}

export function registerDiscoveryTools(server: McpServer): void {
  server.registerTool(
    'ga4_list_accounts',
    { description: 'Lists all GA4 accounts accessible by the authenticated user', inputSchema: z.object({}) },
    async () => {
      try {
        const data = await callAdminApi<{ accounts?: Account[] }>('/accounts');
        return success('ga4_list_accounts', (data.accounts || []).map(a => ({
          accountId: a.name?.replace('accounts/', '') || '',
          displayName: a.displayName || '',
          createTime: a.createTime || '',
          updateTime: a.updateTime || '',
        })));
      } catch (e) { return error('ga4_list_accounts', e); }
    }
  );

  server.registerTool(
    'ga4_list_properties',
    {
      description: 'Lists GA4 properties under a given account, or all accessible properties',
      inputSchema: z.object({
        accountId: z.string().optional().describe('Account ID to filter. If omitted, lists all accessible properties.'),
      }),
    },
    async ({ accountId }) => {
      try {
        const filter = accountId ? `parent:accounts/${accountId}` : '';
        const data = await callAdminApi<{ properties?: Property[] }>(`/properties?filter=${encodeURIComponent(filter)}`);
        return success('ga4_list_properties', (data.properties || []).map(p => ({
          propertyId: p.name?.replace('properties/', '') || '',
          displayName: p.displayName || '',
          industryCategory: p.industryCategory || '',
          timeZone: p.timeZone || '',
          currencyCode: p.currencyCode || '',
          serviceLevel: p.serviceLevel || '',
          createTime: p.createTime || '',
        })));
      } catch (e) { return error('ga4_list_properties', e); }
    }
  );

  server.registerTool(
    'ga4_get_property',
    {
      description: 'Get detailed metadata for a single GA4 property',
      inputSchema: z.object({ propertyId: propertyIdSchema }),
    },
    async ({ propertyId }) => {
      try {
        const p = await callAdminApi<Property>(`/properties/${propertyId}`);
        return success('ga4_get_property', {
          propertyId: p.name?.replace('properties/', '') || '',
          displayName: p.displayName || '',
          timeZone: p.timeZone || '',
          currencyCode: p.currencyCode || '',
          industryCategory: p.industryCategory || '',
          serviceLevel: p.serviceLevel || '',
          createTime: p.createTime || '',
          updateTime: p.updateTime || '',
          parent: p.parent || '',
        }, { propertyId });
      } catch (e) { return error('ga4_get_property', e); }
    }
  );

  server.registerTool(
    'ga4_list_data_streams',
    {
      description: 'Lists web and app data streams for a GA4 property',
      inputSchema: z.object({ propertyId: propertyIdSchema }),
    },
    async ({ propertyId }) => {
      try {
        const data = await callAdminApi<{ dataStreams?: DataStream[] }>(`/properties/${propertyId}/dataStreams`);
        return success('ga4_list_data_streams', (data.dataStreams || []).map(s => ({
          streamId: s.name || '',
          type: s.type || '',
          displayName: s.displayName || '',
          webStreamData: s.webStreamData,
          androidAppStreamData: s.androidAppStreamData,
          iosAppStreamData: s.iosAppStreamData,
          createTime: s.createTime || '',
          updateTime: s.updateTime || '',
        })), { propertyId });
      } catch (e) { return error('ga4_list_data_streams', e); }
    }
  );

  server.registerTool(
    'ga4_list_custom_dimensions',
    {
      description: 'Lists all custom dimensions for a GA4 property',
      inputSchema: z.object({ propertyId: propertyIdSchema }),
    },
    async ({ propertyId }) => {
      try {
        const data = await callAdminApi<{ customDimensions?: CustomDimension[] }>(`/properties/${propertyId}/customDimensions`);
        return success('ga4_list_custom_dimensions', (data.customDimensions || []).map(d => ({
          parameterName: d.parameterName || '',
          displayName: d.displayName || '',
          description: d.description || '',
          scope: d.scope || '',
          disallowAdsPersonalization: d.disallowAdsPersonalization || false,
        })), { propertyId });
      } catch (e) { return error('ga4_list_custom_dimensions', e); }
    }
  );

  server.registerTool(
    'ga4_list_custom_metrics',
    {
      description: 'Lists all custom metrics for a GA4 property',
      inputSchema: z.object({ propertyId: propertyIdSchema }),
    },
    async ({ propertyId }) => {
      try {
        const data = await callAdminApi<{ customMetrics?: CustomMetric[] }>(`/properties/${propertyId}/customMetrics`);
        return success('ga4_list_custom_metrics', (data.customMetrics || []).map(m => ({
          parameterName: m.parameterName || '',
          displayName: m.displayName || '',
          description: m.description || '',
          scope: m.scope || '',
          measurementUnit: m.measurementUnit || '',
          restrictedMetricType: m.restrictedMetricType || [],
        })), { propertyId });
      } catch (e) { return error('ga4_list_custom_metrics', e); }
    }
  );

  server.registerTool(
    'ga4_list_audiences',
    {
      description: 'Lists configured audiences for a GA4 property',
      inputSchema: z.object({ propertyId: propertyIdSchema }),
    },
    async ({ propertyId }) => {
      try {
        const data = await callAdminApi<{ audiences?: Audience[] }>(`/properties/${propertyId}/audiences`);
        return success('ga4_list_audiences', (data.audiences || []).map(a => ({
          name: a.name || '',
          displayName: a.displayName || '',
          description: a.description || '',
          membershipDurationDays: a.membershipDurationDays || 0,
        })), { propertyId });
      } catch (e) { return error('ga4_list_audiences', e); }
    }
  );

  server.registerTool(
    'ga4_list_key_events',
    {
      description: 'Lists key events (conversions) configured for a GA4 property',
      inputSchema: z.object({ propertyId: propertyIdSchema }),
    },
    async ({ propertyId }) => {
      try {
        const data = await callAdminApi<{ keyEvents?: KeyEvent[] }>(`/properties/${propertyId}/keyEvents`);
        return success('ga4_list_key_events', (data.keyEvents || []).map(k => ({
          name: k.name || '',
          eventName: k.eventName || '',
          createTime: k.createTime || '',
          deletable: k.deletable || false,
          custom: k.custom || false,
          countingMethod: k.countingMethod || '',
        })), { propertyId });
      } catch (e) { return error('ga4_list_key_events', e); }
    }
  );
}
