import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Backdrop } from './Backdrop';

describe('Backdrop', () => {
  it('calls onClick when clicked', async () => {
    const user = userEvent.setup();
    const onClick = jest.fn();
    render(<Backdrop onClick={onClick} />);

    await user.click(screen.getByTestId('backdrop'));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('is decorative and hidden from assistive tech', () => {
    render(<Backdrop onClick={jest.fn()} />);

    expect(screen.getByTestId('backdrop')).toHaveAttribute('aria-hidden', 'true');
  });
});
