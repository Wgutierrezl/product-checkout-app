import { render, screen } from '@testing-library/react';
import { ResultIcon } from './ResultIcon';

describe('ResultIcon', () => {
  it('renders a checkmark mark for the approved variant', () => {
    render(<ResultIcon variant="approved" />);

    expect(screen.getByTestId('result-icon-check')).toBeInTheDocument();
    expect(screen.queryByTestId('result-icon-cross')).not.toBeInTheDocument();
  });

  it('renders a cross mark for the failure variant', () => {
    render(<ResultIcon variant="failure" />);

    expect(screen.getByTestId('result-icon-cross')).toBeInTheDocument();
    expect(screen.queryByTestId('result-icon-check')).not.toBeInTheDocument();
  });

  it('is purely decorative, hidden from assistive tech since the heading already announces the outcome', () => {
    render(<ResultIcon variant="approved" />);

    expect(screen.getByTestId('result-icon')).toHaveAttribute('aria-hidden', 'true');
  });
});
