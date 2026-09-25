import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CountrySelect } from './CountrySelect';
import { COUNTRIES, flagEmoji, type Country } from '../../domain/phone/countries';

function displayValueOf(country: Country): string {
  return `${flagEmoji(country.iso2)} +${country.dialCode}`;
}

function renderSelect(overrides: Partial<React.ComponentProps<typeof CountrySelect>> = {}) {
  const onChange = jest.fn();
  const utils = render(<CountrySelect id="phoneCountry" value="CO" onChange={onChange} {...overrides} />);
  return { ...utils, onChange };
}

describe('CountrySelect', () => {
  it('shows the selected country as a combobox with the dial code visible', () => {
    renderSelect();

    const combobox = screen.getByRole('combobox');
    expect(combobox).toHaveValue('🇨🇴 +57');
    expect(combobox).toHaveAttribute('aria-expanded', 'false');
  });

  it('opens a listbox of country options on focus', async () => {
    const user = userEvent.setup();
    renderSelect();

    await user.click(screen.getByRole('combobox'));

    expect(screen.getByRole('combobox')).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    expect(screen.getAllByRole('option').length).toBeGreaterThan(1);
  });

  it('filters the options by typing a country name', async () => {
    const user = userEvent.setup();
    renderSelect();

    const combobox = screen.getByRole('combobox');
    await user.click(combobox);
    await user.type(combobox, 'Spain');

    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(1);
    expect(options[0]).toHaveTextContent('Spain');
  });

  it('filters the options by typing a dial code', async () => {
    const user = userEvent.setup();
    renderSelect();

    const combobox = screen.getByRole('combobox');
    await user.click(combobox);
    await user.type(combobox, '+34');

    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(1);
    expect(options[0]).toHaveTextContent('Spain');
  });

  it('selects a country via ArrowDown + Enter and calls onChange with its iso2 code', async () => {
    const user = userEvent.setup();
    const { onChange } = renderSelect();

    const combobox = screen.getByRole('combobox');
    await user.click(combobox);
    await user.type(combobox, 'Spain');
    await user.keyboard('{ArrowDown}');
    await user.keyboard('{Enter}');

    expect(onChange).toHaveBeenCalledWith('ES');
    expect(screen.getByRole('combobox')).toHaveAttribute('aria-expanded', 'false');
  });

  it('marks the active option via aria-activedescendant while navigating with arrow keys', async () => {
    const user = userEvent.setup();
    renderSelect();

    const combobox = screen.getByRole('combobox');
    await user.click(combobox);
    await user.type(combobox, 'Spain');
    await user.keyboard('{ArrowDown}');

    const option = screen.getByRole('option', { name: /Spain/i });
    expect(combobox).toHaveAttribute('aria-activedescendant', option.id);
  });

  it('closes the listbox on Escape without calling onChange', async () => {
    const user = userEvent.setup();
    const { onChange } = renderSelect();

    const combobox = screen.getByRole('combobox');
    await user.click(combobox);
    await user.keyboard('{Escape}');

    expect(screen.getByRole('combobox')).toHaveAttribute('aria-expanded', 'false');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('reopens the listbox with ArrowDown after Escape closed it (still focused)', async () => {
    const user = userEvent.setup();
    renderSelect();

    const combobox = screen.getByRole('combobox');
    await user.click(combobox);
    await user.keyboard('{Escape}');
    expect(combobox).toHaveAttribute('aria-expanded', 'false');

    await user.keyboard('{ArrowDown}');

    expect(combobox).toHaveAttribute('aria-expanded', 'true');
  });

  it('reopens the listbox with ArrowUp after Escape closed it (still focused)', async () => {
    const user = userEvent.setup();
    renderSelect();

    const combobox = screen.getByRole('combobox');
    await user.click(combobox);
    await user.keyboard('{Escape}');
    expect(combobox).toHaveAttribute('aria-expanded', 'false');

    await user.keyboard('{ArrowUp}');

    expect(combobox).toHaveAttribute('aria-expanded', 'true');
  });

  it('navigates backward with ArrowUp, wrapping to the last option', async () => {
    const user = userEvent.setup();
    renderSelect();

    const combobox = screen.getByRole('combobox');
    await user.click(combobox);
    await user.type(combobox, 'United States');
    await user.keyboard('{ArrowUp}');

    const option = screen.getByRole('option', { name: /United States/i });
    expect(combobox).toHaveAttribute('aria-activedescendant', option.id);
  });

  it('shows a "no matches" message when the query matches no country', async () => {
    const user = userEvent.setup();
    renderSelect();

    const combobox = screen.getByRole('combobox');
    await user.click(combobox);
    await user.type(combobox, 'zzzzz-not-a-country');

    expect(screen.queryAllByRole('option')).toHaveLength(0);
    expect(screen.getByText(/no matching country/i)).toBeInTheDocument();
  });

  it('selects an option directly by clicking it', async () => {
    const user = userEvent.setup();
    const { onChange } = renderSelect();

    const combobox = screen.getByRole('combobox');
    await user.click(combobox);
    await user.type(combobox, 'Spain');
    await user.click(screen.getByRole('option', { name: /Spain/i }));

    expect(onChange).toHaveBeenCalledWith('ES');
    expect(screen.getByRole('combobox')).toHaveAttribute('aria-expanded', 'false');
  });

  it('closes the listbox on Tab without calling onChange', async () => {
    const user = userEvent.setup();
    const { onChange } = renderSelect();

    const combobox = screen.getByRole('combobox');
    await user.click(combobox);
    await user.keyboard('{Tab}');

    expect(screen.getByRole('combobox')).toHaveAttribute('aria-expanded', 'false');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('keeps the open listbox out of the tab order (options are reached with arrow keys)', async () => {
    const user = userEvent.setup();
    renderSelect();

    await user.click(screen.getByRole('combobox'));

    // Firefox makes a scrollable element keyboard-focusable unless it has a
    // negative tabindex, and Tab then lands on this listbox just as the Tab
    // handler unmounts it, dropping focus to <body>.
    expect(screen.getByRole('listbox')).toHaveAttribute('tabindex', '-1');
  });

  it('moves focus to the next field on Tab from the open combobox', async () => {
    const user = userEvent.setup();
    render(
      <>
        <CountrySelect id="phoneCountry" value="CO" onChange={jest.fn()} />
        <input aria-label="Phone" />
      </>,
    );

    await user.click(screen.getByRole('combobox'));
    await user.tab();

    expect(screen.getByRole('textbox', { name: 'Phone' })).toHaveFocus();
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('does nothing on Enter when nothing matches the typed query', async () => {
    const user = userEvent.setup();
    const { onChange } = renderSelect();

    const combobox = screen.getByRole('combobox');
    await user.click(combobox);
    await user.type(combobox, 'zzzzz-not-a-country');
    await user.keyboard('{Enter}');

    expect(onChange).not.toHaveBeenCalled();
  });

  it('keeps the listbox open on a blur whose relatedTarget is still inside the component (e.g. an option)', async () => {
    const user = userEvent.setup();
    renderSelect();

    const combobox = screen.getByRole('combobox');
    await user.click(combobox);
    const option = screen.getAllByRole('option')[0];

    fireEvent.blur(combobox, { relatedTarget: option });

    expect(combobox).toHaveAttribute('aria-expanded', 'true');
  });

  it('falls back to the first country when the given value matches no known country', () => {
    renderSelect({ value: 'ZZ' });

    expect(screen.getByRole('combobox')).toHaveValue(displayValueOf(COUNTRIES[0]));
  });

  it('does nothing on ArrowDown/ArrowUp when no country matches the typed query', async () => {
    const user = userEvent.setup();
    renderSelect();

    const combobox = screen.getByRole('combobox');
    await user.click(combobox);
    await user.type(combobox, 'zzzzz-not-a-country');
    await user.keyboard('{ArrowDown}{ArrowUp}');

    expect(screen.queryAllByRole('option')).toHaveLength(0);
    expect(combobox).not.toHaveAttribute('aria-activedescendant');
  });

  it('does nothing on a 2nd Escape once the listbox is already closed', async () => {
    const user = userEvent.setup();
    renderSelect();

    const combobox = screen.getByRole('combobox');
    await user.click(combobox);
    await user.keyboard('{Escape}');
    expect(combobox).toHaveAttribute('aria-expanded', 'false');

    await user.keyboard('{Escape}');

    expect(combobox).toHaveAttribute('aria-expanded', 'false');
  });

  it('marks the currently selected country as aria-selected among the options', async () => {
    const user = userEvent.setup();
    renderSelect({ value: 'US' });

    await user.click(screen.getByRole('combobox'));
    await user.type(screen.getByRole('combobox'), 'United States');

    expect(screen.getByRole('option', { name: /United States/i })).toHaveAttribute('aria-selected', 'true');
  });
});
