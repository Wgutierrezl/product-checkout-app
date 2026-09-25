import { buildProductImageSrcSet, PRODUCT_IMAGE_WIDTHS } from './productImageSrcSet';

const SEED_URL = 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=600&fm=webp';

describe('buildProductImageSrcSet', () => {
  it('offers 320, 480, 640 and 960 pixel candidates', () => {
    expect(PRODUCT_IMAGE_WIDTHS).toEqual([320, 480, 640, 960]);
  });

  it('rewrites the w parameter of an Unsplash URL once per width, with a matching w descriptor', () => {
    expect(buildProductImageSrcSet(SEED_URL)).toBe(
      [
        'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=320&fm=webp 320w',
        'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=480&fm=webp 480w',
        'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=640&fm=webp 640w',
        'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=960&fm=webp 960w',
      ].join(', '),
    );
  });

  it('keeps every other query parameter untouched', () => {
    const srcSet = buildProductImageSrcSet(
      'https://images.unsplash.com/photo-1?fm=webp&q=80&fit=crop&w=600',
    );

    expect(srcSet?.split(', ')[0]).toBe(
      'https://images.unsplash.com/photo-1?fm=webp&q=80&fit=crop&w=320 320w',
    );
  });

  it('adds the w parameter when the Unsplash URL has none', () => {
    const srcSet = buildProductImageSrcSet('https://images.unsplash.com/photo-1?fm=webp');

    expect(srcSet?.split(', ')[3]).toBe('https://images.unsplash.com/photo-1?fm=webp&w=960 960w');
  });

  it('returns undefined for a URL on any other host, so the caller renders src only', () => {
    expect(buildProductImageSrcSet('https://img.test/p1.png?w=600')).toBeUndefined();
    expect(buildProductImageSrcSet('https://images.unsplash.com.evil.test/p.png')).toBeUndefined();
  });

  it('returns undefined for a non-https Unsplash URL', () => {
    expect(buildProductImageSrcSet('http://images.unsplash.com/photo-1?w=600')).toBeUndefined();
  });

  it('returns undefined for an invalid URL instead of throwing', () => {
    expect(buildProductImageSrcSet('not a url')).toBeUndefined();
    expect(buildProductImageSrcSet('')).toBeUndefined();
  });
});
