import { render, screen } from '@testing-library/react';
import { CardBrandIcon } from './CardBrandIcon';

describe('CardBrandIcon', () => {
  it('renders a Visa mark when the brand is visa', () => {
    render(<CardBrandIcon brand="visa" />);

    expect(screen.getByRole('img', { name: 'Visa' })).toBeInTheDocument();
  });

  it('renders a Mastercard mark when the brand is mastercard', () => {
    render(<CardBrandIcon brand="mastercard" />);

    expect(screen.getByRole('img', { name: 'Mastercard' })).toBeInTheDocument();
  });

  it('renders nothing when the brand is unknown', () => {
    const { container } = render(<CardBrandIcon brand="unknown" />);

    expect(container).toBeEmptyDOMElement();
  });
});
