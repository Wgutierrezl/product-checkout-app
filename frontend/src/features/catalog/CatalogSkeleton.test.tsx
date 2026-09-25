import { render, screen } from '@testing-library/react';
import { CatalogSkeleton } from './CatalogSkeleton';

describe('CatalogSkeleton', () => {
  it('announces the loading state to assistive tech', () => {
    render(<CatalogSkeleton />);

    expect(screen.getByRole('status')).toHaveTextContent(/loading products/i);
  });

  it('renders 12 placeholder cards by default (complete rows at 1, 2, 3 and 4 columns), hidden from assistive tech', () => {
    const { container } = render(<CatalogSkeleton />);

    const placeholders = container.querySelectorAll('[aria-hidden="true"].placeholder');
    expect(placeholders).toHaveLength(12);
  });

  it('renders the requested number of placeholder cards', () => {
    const { container } = render(<CatalogSkeleton count={2} />);

    expect(container.querySelectorAll('.placeholder')).toHaveLength(2);
  });
});
