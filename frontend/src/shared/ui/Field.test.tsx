import { render, screen } from '@testing-library/react';
import { Field } from './Field';

describe('Field', () => {
  it('associates the label with the control via htmlFor/id', () => {
    render(
      <Field id="fullName" label="Full name">
        {(aria) => <input {...aria} />}
      </Field>,
    );

    expect(screen.getByLabelText('Full name')).toBeInTheDocument();
  });

  it('shows a hint and wires it via aria-describedby when there is no error', () => {
    render(
      <Field id="email" label="Email" hint="We only use this for your receipt">
        {(aria) => <input {...aria} />}
      </Field>,
    );

    const input = screen.getByLabelText('Email');
    const hint = screen.getByText('We only use this for your receipt');
    expect(input).toHaveAttribute('aria-describedby', hint.id);
    expect(input).not.toHaveAttribute('aria-invalid');
  });

  it('shows an inline error, sets aria-invalid, and wires it via aria-describedby instead of the hint', () => {
    render(
      <Field id="email" label="Email" hint="We only use this for your receipt" error="Enter a valid email address">
        {(aria) => <input {...aria} />}
      </Field>,
    );

    const input = screen.getByLabelText('Email');
    const error = screen.getByRole('alert');
    expect(error).toHaveTextContent('Enter a valid email address');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAttribute('aria-describedby', error.id);
    expect(screen.queryByText('We only use this for your receipt')).not.toBeInTheDocument();
  });

  it('renders with no describedby when there is neither a hint nor an error', () => {
    render(
      <Field id="phone" label="Phone">
        {(aria) => <input {...aria} />}
      </Field>,
    );

    expect(screen.getByLabelText('Phone')).not.toHaveAttribute('aria-describedby');
  });

  it('supports non-input controls via the render prop (e.g. a select)', () => {
    render(
      <Field id="installments" label="Installments">
        {(aria) => (
          <select {...aria}>
            <option value="1">1</option>
            <option value="2">2</option>
          </select>
        )}
      </Field>,
    );

    expect(screen.getByLabelText('Installments').tagName.toLowerCase()).toBe('select');
  });
});
