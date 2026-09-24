import { render, screen } from '@testing-library/react';
import { App } from './App';

describe('App', () => {
  it('renders the checkout heading', () => {
    render(<App />);

    expect(
      screen.getByRole('heading', { name: /checkout/i }),
    ).toBeInTheDocument();
  });
});
