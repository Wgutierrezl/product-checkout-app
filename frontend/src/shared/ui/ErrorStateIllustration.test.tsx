import { render, screen } from '@testing-library/react';
import { ErrorStateIllustration } from './ErrorStateIllustration';

describe('ErrorStateIllustration', () => {
  it('renders a decorative illustration hidden from assistive tech', () => {
    render(<ErrorStateIllustration />);

    const illustration = screen.getByTestId('error-state-illustration');
    expect(illustration).toBeInTheDocument();
    expect(illustration).toHaveAttribute('aria-hidden', 'true');
  });
});
