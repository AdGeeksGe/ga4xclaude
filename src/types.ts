export interface ToolSuccessResponse {
  success: true;
  propertyId?: string;
  tool: string;
  rowCount?: number;
  data: unknown;
  metadata?: Record<string, unknown>;
}

export interface ToolErrorResponse {
  success: false;
  tool: string;
  error: string;
  message: string;
  suggestion?: string;
}

export type ToolResponse = ToolSuccessResponse | ToolErrorResponse;
