import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerDiscoveryTools } from './discovery.js';
import { registerReportingTools } from './reporting.js';
import { registerSpecializedTools } from './specialized.js';

export function registerAllTools(server: McpServer): void {
  registerDiscoveryTools(server);
  registerReportingTools(server);
  registerSpecializedTools(server);
}
