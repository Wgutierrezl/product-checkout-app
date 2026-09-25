/** Candidate widths (px) offered to the browser for a product image. */
export const PRODUCT_IMAGE_WIDTHS = [320, 480, 640, 960] as const;

/**
 * Rendered width of a product image in the catalog grid, derived from
 * ProductGrid.module.css (1/2/3/4 columns at 0/768/1024/1280px, 24px gaps),
 * App.module.css (1400px layout column, 24px inline padding) and
 * ProductCard.module.css (16px padding + 1px border per side):
 *
 *   image = (content - gaps) / columns - 34px, with content = min(100vw, 1400px) - 48px
 */
export const PRODUCT_IMAGE_SIZES = [
  '(min-width: 1400px) 286px',
  '(min-width: 1280px) calc(25vw - 64px)',
  '(min-width: 1024px) calc(33.33vw - 66px)',
  '(min-width: 768px) calc(50vw - 70px)',
  'calc(100vw - 82px)',
].join(', ');

const RESIZABLE_IMAGE_ORIGIN = 'https://images.unsplash.com';

/**
 * Builds a `srcset` for an Unsplash image by rewriting its `w` query
 * parameter for each candidate width, leaving every other parameter (e.g.
 * `fm=webp`) untouched. Returns `undefined` for any other host or an invalid
 * URL, so the caller falls back to a plain `src`.
 */
export function buildProductImageSrcSet(imageUrl: string): string | undefined {
  let url: URL;
  try {
    url = new URL(imageUrl);
  } catch {
    return undefined;
  }
  if (url.origin !== RESIZABLE_IMAGE_ORIGIN) return undefined;

  return PRODUCT_IMAGE_WIDTHS.map((width) => {
    const candidate = new URL(url);
    candidate.searchParams.set('w', String(width));
    return `${candidate.toString()} ${width}w`;
  }).join(', ');
}
