import { PostgrestFilterBuilder } from '@supabase/postgrest-js';

const PAGE_SIZE = 1000;

/**
 * Fetches ALL rows from a Supabase query, paginating past the 1000-row cap.
 *
 * Pass a query builder with .order() already set. Order is REQUIRED for
 * stable pagination — without it, rows can appear on multiple pages or
 * disappear entirely between pages.
 *
 * @param query A Supabase query builder, e.g. supabase.from('x').select('*').eq('a', 'b').order('id')
 * @returns Array of all matching rows
 * @throws If query has no .order() applied, or if any page errors
 *
 * @example
 *   const rows = await fetchAllPaginated(
 *     supabase.from('sessions').select('id, student_id').eq('status', 'completed').order('id')
 *   );
 */
export async function fetchAllPaginated<T>(
  query: PostgrestFilterBuilder<any, any, any, T[]>,
): Promise<T[]> {
  // Sanity: detect missing order. The Postgrest builder has no public
  // API for this, but we can check the URL the builder will produce.
  // The builder's `url` is a URL object on the underlying client.
  // If 'order=' is absent, throw early with a helpful error.
  const url = (query as any).url?.toString?.() ?? '';
  if (url && !url.includes('order=')) {
    throw new Error(
      'fetchAllPaginated: query must have .order() applied for stable pagination. ' +
        'Without ordering, rows can be skipped or duplicated between pages.',
    );
  }

  const allRows: T[] = [];
  let page = 0;

  while (true) {
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    // Clone is implicit — .range() returns a new builder
    const { data, error } = await query.range(from, to);

    if (error) {
      throw new Error(
        `fetchAllPaginated failed on page ${page} (rows ${from}-${to}): ${error.message}`,
      );
    }

    if (!data || data.length === 0) break;

    allRows.push(...(data as T[]));

    // If we got less than a full page, we're done — no more pages to fetch
    if (data.length < PAGE_SIZE) break;

    page++;

    // Sanity: cap at 100 pages (100k rows). If we hit this, something's wrong.
    if (page > 100) {
      throw new Error(
        `fetchAllPaginated: exceeded 100 pages (${allRows.length} rows). ` +
          `Either the query has no upper bound or there's an infinite loop. Refusing to continue.`,
      );
    }
  }

  return allRows;
}
