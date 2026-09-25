import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SandboxTestCardsHelper } from './SandboxTestCardsHelper';

describe('SandboxTestCardsHelper', () => {
  it('shows the sandbox title and the expiry/CVC footnote', () => {
    render(<SandboxTestCardsHelper onUseCard={jest.fn()} />);

    expect(screen.getByText('Sandbox mode — use a test card')).toBeInTheDocument();
    expect(screen.getByText('Any future expiry date · CVC 123')).toBeInTheDocument();
  });

  it('lists the approved and declined test card numbers with their outcome', () => {
    render(<SandboxTestCardsHelper onUseCard={jest.fn()} />);

    expect(screen.getByText('4242 4242 4242 4242 — approved')).toBeInTheDocument();
    expect(screen.getByText('4111 1111 1111 1111 — declined')).toBeInTheDocument();
  });

  it('calls onUseCard with the raw approved card digits when "Use approved test card" is clicked', async () => {
    const user = userEvent.setup();
    const onUseCard = jest.fn();
    render(<SandboxTestCardsHelper onUseCard={onUseCard} />);

    await user.click(screen.getByRole('button', { name: 'Use approved test card' }));

    expect(onUseCard).toHaveBeenCalledWith('4242424242424242');
  });

  it('calls onUseCard with the raw declined card digits when "Use declined test card" is clicked', async () => {
    const user = userEvent.setup();
    const onUseCard = jest.fn();
    render(<SandboxTestCardsHelper onUseCard={onUseCard} />);

    await user.click(screen.getByRole('button', { name: 'Use declined test card' }));

    expect(onUseCard).toHaveBeenCalledWith('4111111111111111');
  });
});
