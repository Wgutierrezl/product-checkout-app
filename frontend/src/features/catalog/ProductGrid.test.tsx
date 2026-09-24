import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProductGrid } from './ProductGrid';
import type { Product } from '../../api/types';

const PRODUCTS: Product[] = [
  {
    id: 'p1',
    name: 'Wireless Headphones',
    description: 'Noise-cancelling',
    price: 150_000,
    currency: 'COP',
    stock: 5,
    imageUrl: 'https://img.test/p1.png',
  },
  {
    id: 'p2',
    name: 'Mechanical Keyboard',
    description: 'Hot-swappable switches',
    price: 320_000,
    currency: 'COP',
    stock: 0,
    imageUrl: 'https://img.test/p2.png',
  },
];

describe('ProductGrid', () => {
  it('renders one card per product', () => {
    render(<ProductGrid products={PRODUCTS} onBuy={jest.fn()} />);

    expect(screen.getByRole('heading', { name: 'Wireless Headphones' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Mechanical Keyboard' })).toBeInTheDocument();
  });

  it('renders as a list of items for assistive tech', () => {
    render(<ProductGrid products={PRODUCTS} onBuy={jest.fn()} />);

    const list = screen.getByRole('list');
    expect(list).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });

  it('forwards onBuy from the specific card that was interacted with', async () => {
    const user = userEvent.setup();
    const onBuy = jest.fn();
    render(<ProductGrid products={PRODUCTS} onBuy={onBuy} />);

    await user.click(screen.getAllByRole('button', { name: /pay with credit card/i })[0]);

    expect(onBuy).toHaveBeenCalledWith('p1', 1);
  });
});
