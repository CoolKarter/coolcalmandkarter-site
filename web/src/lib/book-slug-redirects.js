// Permanent (301) redirects for book URLs whose slug changed as part of a
// title rename — the content collection files themselves were renamed
// (web/src/content/books/*.md), so the OLD URLs no longer exist as real
// routes and would otherwise 404. This is a small, static, hand-maintained
// list (not derived from any dynamic source) — add one line per rename,
// remove a line only once you're confident nothing external still links
// to the old URL.
//
// Plain JS (framework-free) so it's unit-testable with Node's built-in
// test runner — see web/test/book-slug-redirects.test.js. Kept separate
// from src/lib/api-redirects.js (which builds the unrelated /api/* proxy
// rule) since this has nothing to do with the backend and never depends
// on any environment variable.
export const BOOK_SLUG_REDIRECTS = [
  // Formerly "Florida, Beach & Baby" — see the catalog cover-refresh/
  // title-change report.
  { from: '/books/florida-beach-and-baby/', to: '/books/beach-and-baby/' },
  // Formerly "Black, Beautiful & Baby" — see the same report.
  { from: '/books/black-beautiful-and-baby/', to: '/books/black-proud-and-baby/' },
];

/** Builds the Netlify `_redirects` rule lines for every renamed book URL, one "from  to  301" line per entry. */
export function buildBookSlugRedirectsRule() {
  return BOOK_SLUG_REDIRECTS.map((r) => `${r.from}  ${r.to}  301`).join('\n') + '\n';
}
