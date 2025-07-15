import { fivemPool } from "../Bot";
import { FivemReport } from "../types/FivemTypes";
import log from "../utils/log";
import { tryCatch } from "../utils/trycatch";

const reportsTable = `zerobug_tickets`;
const indexColumn = `ticket_id`;

/**
 * Fetch a report from the FiveM database by ID
 * @param reportId The ID of the report to fetch
 * @returns The report data or null if not found
 */
export async function fetchReportById(reportId: string): Promise<FivemReport | null> {
  if (!fivemPool) {
    log.error(`[FivemReportService]`, {
      error: "Fivem pool is not initialized",
    });
    return null;
  }

  // Get a connection from the pool
  const { data: connection, error: connectionError } = await tryCatch(fivemPool.getConnection());

  if (connectionError || !connection) {
    log.error(`[FivemReportService]`, {
      error: "Unable to get fivem connection",
      details: connectionError?.message || "Unknown error",
    });
    return null;
  }

  try {
    // Query the database for the report
    const { data: reportFetchResult, error: queryError } = await tryCatch(
      connection.query(`SELECT * FROM ${reportsTable} WHERE ${indexColumn} = ?`, [reportId])
    );

    if (queryError || !reportFetchResult || reportFetchResult[0]?.length === 0) {
      log.error(`[FivemReportService]`, {
        error: "Report not found or query error",
        reportId,
        details: queryError?.message || "No results returned",
      });
      return null;
    }

    try {
      const report: FivemReport = JSON.parse(reportFetchResult[0].data);
      return report;
    } catch (error) {
      log.error(`[FivemReportService]`, {
        error: "Error parsing report data",
        reportId,
        details: error instanceof Error ? error.message : "Unknown parsing error",
      });
      return null;
    }
  } finally {
    // Always release the connection back to the pool
    connection.release();
  }
}
