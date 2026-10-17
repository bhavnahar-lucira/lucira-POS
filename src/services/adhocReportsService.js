// OrnaVerse's generic Ad-hoc Report engine — confirmed live 2026-10-16.
// Unlike the curated reports in reportsService.js, these are user-built
// (111 on this tenant) behind ONE self-describing Run call. No company/date
// scoping is sent — OrnaVerse's own default view runs each report with an
// empty FilterOverrides too, so this mirrors that exactly rather than
// guessing at filter fields per report.

import axiosInstance from '@/lib/axios/axiosInstance';
import API from '@/constants/apiEndpoints';

/**
 * @returns {Promise<{AdhocReportId: number, Name: string, Description: string,
 *   SourceRowTypeName: string, ChartType: string}[]>}
 */
export async function listAdhocReports() {
  const response = await axiosInstance.post(API.ADHOC_REPORTS.LIST, {
    Take: 200,
    IncludeColumns: ['Name', 'Description', 'SourceRowTypeName', 'ChartType'],
  });
  return response.data?.Entities ?? [];
}

/**
 * CONFIRMED LIVE response shape: { Table: { Columns: string[], ColumnInfos:
 * [{ Name, Title, DataType, EnumKey?, EnumTexts?: {[code]: label} }], Rows:
 * object[] } }.
 * @returns {Promise<{columns: object[], rows: object[]}>}
 */
export async function runAdhocReport({ adhocReportId }) {
  const response = await axiosInstance.post(API.ADHOC_REPORTS.RUN, {
    AdhocReportId: adhocReportId,
    FilterOverrides: {},
  });
  const table = response.data?.Table ?? { ColumnInfos: [], Rows: [] };
  return { columns: table.ColumnInfos ?? [], rows: table.Rows ?? [] };
}
