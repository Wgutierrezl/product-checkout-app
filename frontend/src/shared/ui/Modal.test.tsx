import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Modal } from './Modal';

function Harness({ onClosed }: { onClosed?: () => void }) {
  const [open, setOpen] = useState(false);

  function close() {
    setOpen(false);
    onClosed?.();
  }

  return (
    <div>
      <button onClick={() => setOpen(true)}>Open modal</button>
      {open && (
        <Modal titleId="test-modal-title" title="Payment details" onClose={close}>
          <button>First</button>
          <button>Last</button>
        </Modal>
      )}
    </div>
  );
}

describe('Modal', () => {
  it('renders a labelled dialog with aria-modal', () => {
    render(<Modal titleId="t" title="Payment details" onClose={jest.fn()}>content</Modal>);

    const dialog = screen.getByRole('dialog', { name: 'Payment details' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
  });

  it('renders into a portal, outside the component tree it was mounted from', () => {
    const { container } = render(
      <Modal titleId="t" title="Payment details" onClose={jest.fn()}>
        content
      </Modal>,
    );

    expect(container).not.toContainElement(screen.getByRole('dialog'));
    expect(document.body).toContainElement(screen.getByRole('dialog'));
  });

  it('moves initial focus inside the dialog', () => {
    render(
      <Modal titleId="t" title="Payment details" onClose={jest.fn()}>
        <button>First</button>
      </Modal>,
    );

    expect(screen.getByRole('button', { name: 'First' })).toHaveFocus();
  });

  it('calls onClose when Escape is pressed', async () => {
    const user = userEvent.setup();
    const onClose = jest.fn();
    render(
      <Modal titleId="t" title="Payment details" onClose={onClose}>
        <button>First</button>
      </Modal>,
    );

    await user.keyboard('{Escape}');

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when the backdrop is clicked', async () => {
    const user = userEvent.setup();
    const onClose = jest.fn();
    render(
      <Modal titleId="t" title="Payment details" onClose={onClose}>
        content
      </Modal>,
    );

    await user.click(screen.getByTestId('backdrop'));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('traps Tab focus: cycles from the last focusable element back to the first', async () => {
    const user = userEvent.setup();
    render(
      <Modal titleId="t" title="Payment details" onClose={jest.fn()}>
        <button>First</button>
        <button>Last</button>
      </Modal>,
    );

    screen.getByRole('button', { name: 'Last' }).focus();
    await user.tab();

    expect(screen.getByRole('button', { name: 'First' })).toHaveFocus();
  });

  it('lets a normal Tab move focus between two middle elements without interception', async () => {
    const user = userEvent.setup();
    render(
      <Modal titleId="t" title="Payment details" onClose={jest.fn()}>
        <button>First</button>
        <button>Middle</button>
        <button>Last</button>
      </Modal>,
    );

    screen.getByRole('button', { name: 'First' }).focus();
    await user.tab();

    expect(screen.getByRole('button', { name: 'Middle' })).toHaveFocus();
  });

  it('traps Shift+Tab focus: cycles from the first focusable element back to the last', async () => {
    const user = userEvent.setup();
    render(
      <Modal titleId="t" title="Payment details" onClose={jest.fn()}>
        <button>First</button>
        <button>Last</button>
      </Modal>,
    );

    expect(screen.getByRole('button', { name: 'First' })).toHaveFocus();
    await user.tab({ shift: true });

    expect(screen.getByRole('button', { name: 'Last' })).toHaveFocus();
  });

  it('does not throw and blocks Tab when the dialog has no focusable content', async () => {
    const user = userEvent.setup();
    render(
      <Modal titleId="t" title="Payment details" onClose={jest.fn()}>
        <p>Nothing focusable here</p>
      </Modal>,
    );

    await expect(user.tab()).resolves.not.toThrow();
  });

  it('restores focus to the previously-focused trigger element after closing', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const trigger = screen.getByRole('button', { name: 'Open modal' });
    await user.click(trigger);
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  describe('body scroll lock and background inertness', () => {
    it('locks body scroll while open and restores it on close', () => {
      const originalOverflow = document.body.style.overflow;
      const { unmount } = render(
        <Modal titleId="t" title="Payment details" onClose={jest.fn()}>
          content
        </Modal>,
      );

      expect(document.body.style.overflow).toBe('hidden');

      unmount();

      expect(document.body.style.overflow).toBe(originalOverflow);
    });

    it('marks sibling app content aria-hidden and inert while open, restoring on close', () => {
      const { container, unmount } = render(
        <Modal titleId="t" title="Payment details" onClose={jest.fn()}>
          content
        </Modal>,
      );

      expect(container).toHaveAttribute('aria-hidden', 'true');
      expect(container).toHaveAttribute('inert');

      unmount();

      expect(container).not.toHaveAttribute('aria-hidden');
      expect(container).not.toHaveAttribute('inert');
    });

    it('restores pre-existing aria-hidden/inert values on sibling content instead of clobbering them', () => {
      const sibling = document.createElement('div');
      sibling.setAttribute('aria-hidden', 'true');
      sibling.setAttribute('inert', '');
      document.body.appendChild(sibling);

      const { unmount } = render(
        <Modal titleId="t" title="Payment details" onClose={jest.fn()}>
          content
        </Modal>,
      );

      unmount();

      expect(sibling).toHaveAttribute('aria-hidden', 'true');
      expect(sibling).toHaveAttribute('inert');
      document.body.removeChild(sibling);
    });
  });
});
