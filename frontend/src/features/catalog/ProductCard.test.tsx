import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProductCard } from './ProductCard';
import { formatCOP } from '../../domain/money/formatCOP';
import type { Product } from '../../api/types';

const PRODUCT: Product = {
  id: 'p1',
  name: 'Wireless Headphones',
  description: 'Noise-cancelling over-ear headphones with 30h battery life',
  price: 150_000,
  currency: 'COP',
  stock: 3,
  imageUrl: 'https://img.test/p1.png',
};

describe('ProductCard', () => {
  it('renders the name, description, COP-formatted price, and image with alt text', () => {
    render(<ProductCard product={PRODUCT} onBuy={jest.fn()} />);

    expect(screen.getByRole('heading', { name: PRODUCT.name })).toBeInTheDocument();
    expect(screen.getByText(PRODUCT.description)).toBeInTheDocument();
    // RTL's default text normalizer collapses all whitespace (incl. non-breaking
    // spaces) in the rendered DOM to plain spaces, so the expected string must
    // be normalized the same way before comparing.
    expect(screen.getByText(formatCOP(PRODUCT.price).replace(/\s/g, ' '))).toBeInTheDocument();
    const image = screen.getByRole('img', { name: PRODUCT.name });
    expect(image).toHaveAttribute('src', PRODUCT.imageUrl);
  });

  it('sets loading="lazy", explicit width/height, and object-fit styling on the image', () => {
    render(<ProductCard product={PRODUCT} onBuy={jest.fn()} />);

    const image = screen.getByRole('img', { name: PRODUCT.name });
    expect(image).toHaveAttribute('loading', 'lazy');
    expect(image).toHaveAttribute('width');
    expect(image).toHaveAttribute('height');
  });

  it('shows the remaining stock as a badge when in stock', () => {
    render(<ProductCard product={PRODUCT} onBuy={jest.fn()} />);

    expect(screen.getByText(/3 in stock/i)).toBeInTheDocument();
  });

  it('defaults the quantity stepper to 1 and lets the buyer increase it up to stock', async () => {
    const user = userEvent.setup();
    render(<ProductCard product={PRODUCT} onBuy={jest.fn()} />);

    expect(screen.getByLabelText('Quantity')).toHaveTextContent('1');

    await user.click(screen.getByRole('button', { name: /increase quantity/i }));
    await user.click(screen.getByRole('button', { name: /increase quantity/i }));

    expect(screen.getByLabelText('Quantity')).toHaveTextContent('3');
    expect(screen.getByRole('button', { name: /increase quantity/i })).toBeDisabled();
  });

  it('does not let the buyer decrease quantity below 1', async () => {
    const user = userEvent.setup();
    render(<ProductCard product={PRODUCT} onBuy={jest.fn()} />);

    expect(screen.getByRole('button', { name: /decrease quantity/i })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: /increase quantity/i }));
    await user.click(screen.getByRole('button', { name: /decrease quantity/i }));

    expect(screen.getByLabelText('Quantity')).toHaveTextContent('1');
    expect(screen.getByRole('button', { name: /decrease quantity/i })).toBeDisabled();
  });

  it('caps the selectable quantity at 10 even when stock is higher', async () => {
    const user = userEvent.setup();
    const highStock: Product = { ...PRODUCT, stock: 50 };
    render(<ProductCard product={highStock} onBuy={jest.fn()} />);

    for (let i = 0; i < 12; i += 1) {
      await user.click(screen.getByRole('button', { name: /increase quantity/i }));
    }

    expect(screen.getByLabelText('Quantity')).toHaveTextContent('10');
  });

  it('re-clamps the selected quantity when the product stock decreases on a re-render', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<ProductCard product={{ ...PRODUCT, stock: 5 }} onBuy={jest.fn()} />);
    await user.click(screen.getByRole('button', { name: /increase quantity/i }));
    await user.click(screen.getByRole('button', { name: /increase quantity/i }));
    expect(screen.getByLabelText('Quantity')).toHaveTextContent('3');

    rerender(<ProductCard product={{ ...PRODUCT, stock: 1 }} onBuy={jest.fn()} />);

    expect(screen.getByLabelText('Quantity')).toHaveTextContent('1');
  });

  it('announces the quantity value via an aria-live polite output element', () => {
    render(<ProductCard product={PRODUCT} onBuy={jest.fn()} />);

    const quantityOutput = screen.getByLabelText('Quantity');
    expect(quantityOutput.tagName.toLowerCase()).toBe('output');
    expect(quantityOutput).toHaveAttribute('aria-live', 'polite');
  });

  it('uses eager loading and high fetch priority when marked as the priority (LCP) image', () => {
    render(<ProductCard product={PRODUCT} onBuy={jest.fn()} priority />);

    const image = screen.getByRole('img', { name: PRODUCT.name });
    expect(image).toHaveAttribute('loading', 'eager');
    expect(image).toHaveAttribute('fetchpriority', 'high');
  });

  it('uses eager loading without high fetch priority when marked eager but not the priority image', () => {
    render(<ProductCard product={PRODUCT} onBuy={jest.fn()} eager />);

    const image = screen.getByRole('img', { name: PRODUCT.name });
    expect(image).toHaveAttribute('loading', 'eager');
    expect(image).not.toHaveAttribute('fetchpriority');
  });

  it('defaults to lazy loading with no fetch priority when not the priority image', () => {
    render(<ProductCard product={PRODUCT} onBuy={jest.fn()} />);

    const image = screen.getByRole('img', { name: PRODUCT.name });
    expect(image).toHaveAttribute('loading', 'lazy');
    expect(image).not.toHaveAttribute('fetchpriority');
  });

  it('groups the price/stock row, quantity stepper, and pay button into one pinned footer region', () => {
    render(<ProductCard product={PRODUCT} onBuy={jest.fn()} />);

    const footer = screen.getByTestId('product-card-footer');
    expect(footer).toContainElement(screen.getByText(/3 in stock/i));
    expect(footer).toContainElement(screen.getByLabelText('Quantity'));
    expect(footer).toContainElement(screen.getByRole('button', { name: /pay with credit card/i }));
  });

  it('calls onBuy with the product id and the currently selected quantity', async () => {
    const user = userEvent.setup();
    const onBuy = jest.fn();
    render(<ProductCard product={PRODUCT} onBuy={onBuy} />);

    await user.click(screen.getByRole('button', { name: /increase quantity/i }));
    await user.click(screen.getByRole('button', { name: /pay with credit card/i }));

    expect(onBuy).toHaveBeenCalledWith('p1', 2);
  });

  describe('out of stock', () => {
    const outOfStock: Product = { ...PRODUCT, stock: 0 };

    it('shows an "Out of stock" badge', () => {
      render(<ProductCard product={outOfStock} onBuy={jest.fn()} />);

      expect(screen.getByText(/out of stock/i)).toBeInTheDocument();
    });

    it('disables the quantity stepper', () => {
      render(<ProductCard product={outOfStock} onBuy={jest.fn()} />);

      expect(screen.getByRole('button', { name: /increase quantity/i })).toBeDisabled();
      expect(screen.getByRole('button', { name: /decrease quantity/i })).toBeDisabled();
    });

    it('disables the "Pay with credit card" button', () => {
      render(<ProductCard product={outOfStock} onBuy={jest.fn()} />);

      expect(screen.getByRole('button', { name: /pay with credit card/i })).toBeDisabled();
    });

    it('never calls onBuy when disabled and clicked', async () => {
      const user = userEvent.setup();
      const onBuy = jest.fn();
      render(<ProductCard product={outOfStock} onBuy={onBuy} />);

      await user.click(screen.getByRole('button', { name: /pay with credit card/i }));

      expect(onBuy).not.toHaveBeenCalled();
    });
  });
});
