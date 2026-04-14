interface GA4Header {
  name?: string | null;
}

interface GA4DimensionValue {
  value?: string | null;
}

interface GA4MetricValue {
  value?: string | null;
}

interface GA4Row {
  dimensionValues?: GA4DimensionValue[] | null;
  metricValues?: GA4MetricValue[] | null;
}

export function flattenRows(
  dimensionHeaders: GA4Header[] | null | undefined,
  metricHeaders: GA4Header[] | null | undefined,
  rows: GA4Row[] | null | undefined
): Record<string, string>[] {
  if (!rows) return [];

  const dimNames = (dimensionHeaders || []).map((h) => h.name || 'unknown');
  const metNames = (metricHeaders || []).map((h) => h.name || 'unknown');

  return rows.map((row) => {
    const obj: Record<string, string> = {};
    (row.dimensionValues || []).forEach((v, i) => {
      obj[dimNames[i]] = v.value || '';
    });
    (row.metricValues || []).forEach((v, i) => {
      obj[metNames[i]] = v.value || '';
    });
    return obj;
  });
}

export function flattenPivotRows(
  dimensionHeaders: GA4Header[] | null | undefined,
  metricHeaders: GA4Header[] | null | undefined,
  rows: GA4Row[] | null | undefined
): Record<string, string>[] {
  // Pivot reports have a different structure but we can still flatten basic parts
  return flattenRows(dimensionHeaders, metricHeaders, rows);
}
