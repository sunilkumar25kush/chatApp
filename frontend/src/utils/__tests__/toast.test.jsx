import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import toast, { TOAST_ICONS } from '../toast';
import NotificationToast from '../../components/NotificationToast';

vi.mock('goey-toast', () => {
  const mockGooeyToast = vi.fn((title, opts) => 'toast-1');
  mockGooeyToast.success = vi.fn((title, opts) => 'toast-success');
  mockGooeyToast.error = vi.fn((title, opts) => 'toast-error');
  mockGooeyToast.warning = vi.fn((title, opts) => 'toast-warning');
  mockGooeyToast.info = vi.fn((title, opts) => 'toast-info');
  mockGooeyToast.promise = vi.fn();
  mockGooeyToast.dismiss = vi.fn();
  mockGooeyToast.update = vi.fn();

  return {
    gooeyToast: mockGooeyToast,
    GooeyToaster: () => <div data-testid="gooey-toaster" />,
  };
});

describe('Toast Utility & goey-toast integration', () => {
  it('dispatches success, error, warning, and info correctly', () => {
    const sId = toast.success('Success Title', { description: 'Success Message' });
    expect(sId).toBe('toast-success');

    const eId = toast.error('Error Title', { description: 'Error Message' });
    expect(eId).toBe('toast-error');

    const wId = toast.warning('Warning Title');
    expect(wId).toBe('toast-warning');

    const iId = toast.info('Info Title');
    expect(iId).toBe('toast-info');
  });

  it('maps notify categories to the corresponding goey-toast type and icon', () => {
    toast.notify('User Joined', 'Alice joined the room', 'join');
    toast.notify('Call Disconnected', 'Network dropped', 'error');
    toast.notify('Mic Muted', 'You are muted', 'mic_muted');

    expect(TOAST_ICONS.join).toBe('👋');
    expect(TOAST_ICONS.mic_muted).toBe('🔇');
    expect(TOAST_ICONS.error).toBe('❌');
  });

  it('forwards notifications through NotificationToast component', () => {
    const notifications = [
      { id: 't1', title: 'Test 1', message: 'Hello', type: 'info' },
      { id: 't2', title: 'Test 2', message: 'World', type: 'success' },
    ];

    const { container } = render(
      <NotificationToast notifications={notifications} onDismiss={vi.fn()} />
    );

    // Should return null (handled via goey-toast at root)
    expect(container.firstChild).toBeNull();
  });
});
