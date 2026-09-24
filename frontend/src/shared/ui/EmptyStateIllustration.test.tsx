import { render, screen } from '@testing-library/react';
import { EmptyStateIllustration } from './EmptyStateIllustration';

describe('EmptyStateIllustration', () => {
  it('renders a decorative illustration hidden from assistive tech', () => {
    render(<EmptyStateIllustration />);

    const illustration = screen.getByTestId('empty-state-illustration');
    expect(illustration).toBeInTheDocument();
    expect(illustration).toHaveAttribute('aria-hidden', 'true');
  });
});
