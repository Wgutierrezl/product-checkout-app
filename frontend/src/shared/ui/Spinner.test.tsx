import { render, screen } from '@testing-library/react';
import { Spinner } from './Spinner';

describe('Spinner', () => {
  it('announces the given label to assistive tech via a status role', () => {
    render(<Spinner label="Loading products" />);

    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('Loading products');
  });

  it('falls back to a generic "Loading" label when none is given', () => {
    render(<Spinner />);

    expect(screen.getByRole('status')).toHaveTextContent('Loading');
  });
});
