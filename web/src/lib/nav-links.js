// Primary site navigation link list — extracted from Nav.astro (a .astro
// file, which plain Node's test runner can't import) so the actual link
// data is directly unit-testable. See web/test/nav-links.test.js.
export const PRIMARY_NAV_LINKS = [
  { href: '/', label: 'Home' },
  { href: '/shop', label: 'Shop' },
  { href: '/about', label: 'About' },
  { href: '/contact', label: 'Contact' },
  { href: '/my-orders', label: 'My Orders' },
];
