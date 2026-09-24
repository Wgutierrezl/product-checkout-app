import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from './Button';

describe('Button', () => {
  it('renders its children as the accessible name', () => {
    render(<Button>Pay with credit card</Button>);

    expect(screen.getByRole('button', { name: 'Pay with credit card' })).toBeInTheDocument();
  });

  it('calls onClick when clicked', async () => {
    const user = userEvent.setup();
    const onClick = jest.fn();
    render(<Button onClick={onClick}>Retry</Button>);

    await user.click(screen.getByRole('button', { name: 'Retry' }));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('is disabled and does not call onClick when disabled', async () => {
    const user = userEvent.setup();
    const onClick = jest.fn();
    render(
      <Button onClick={onClick} disabled>
        Pay with credit card
      </Button>,
    );

    const button = screen.getByRole('button', { name: 'Pay with credit card' });
    expect(button).toBeDisabled();

    await user.click(button);

    expect(onClick).not.toHaveBeenCalled();
  });

  it('defaults to the primary variant', () => {
    render(<Button>Continue</Button>);

    expect(screen.getByRole('button')).toHaveAttribute('data-variant', 'primary');
  });

  it('applies the secondary variant when requested', () => {
    render(<Button variant="secondary">Cancel</Button>);

    expect(screen.getByRole('button')).toHaveAttribute('data-variant', 'secondary');
  });

  it('defaults to type="button" so it never accidentally submits a form', () => {
    render(<Button>Increase quantity</Button>);

    expect(screen.getByRole('button')).toHaveAttribute('type', 'button');
  });
});
