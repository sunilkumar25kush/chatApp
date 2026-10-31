import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import NotificationsModal from './NotificationsModal';
import notificationService from '../services/notificationService';

vi.mock('../services/notificationService', () => ({
  default: {
    getNotifications: vi.fn(),
    markAsRead: vi.fn(),
    markAllAsRead: vi.fn(),
    deleteNotification: vi.fn()
  }
}));

vi.mock('../utils/toast', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn()
  }
}));

describe('NotificationsModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not render when isOpen is false', () => {
    const { container } = render(
      <NotificationsModal isOpen={false} onClose={vi.fn()} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders and fetches notifications when open', async () => {
    notificationService.getNotifications.mockResolvedValueOnce({
      notifications: [
        {
          _id: 'notif_1',
          type: 'friend_request',
          title: 'New Friend Request',
          message: 'Alice sent you a friend request',
          link: { screen: 'friends', tab: 'pending' },
          isRead: false,
          createdAt: new Date().toISOString()
        }
      ],
      unreadCount: 1
    });

    render(<NotificationsModal isOpen={true} onClose={vi.fn()} />);

    expect(screen.getByText('Notifications')).toBeDefined();
    await waitFor(() => {
      expect(screen.getByText('New Friend Request')).toBeDefined();
      expect(screen.getByText('Alice sent you a friend request')).toBeDefined();
    });
  });

  it('marks notification as read and calls onNavigate on click', async () => {
    const notifItem = {
      _id: 'notif_2',
      type: 'room_join_approved',
      title: 'Room Access Approved',
      message: 'You have been added to the VIP room',
      link: { screen: 'room', id: 'room_999' },
      isRead: false,
      createdAt: new Date().toISOString()
    };

    notificationService.getNotifications.mockResolvedValueOnce({
      notifications: [notifItem],
      unreadCount: 1
    });
    notificationService.markAsRead.mockResolvedValueOnce({ success: true });

    const handleNavigate = vi.fn();
    const handleClose = vi.fn();

    render(
      <NotificationsModal
        isOpen={true}
        onClose={handleClose}
        onNavigate={handleNavigate}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Room Access Approved')).toBeDefined();
    });

    fireEvent.click(screen.getByText('Room Access Approved'));

    await waitFor(() => {
      expect(notificationService.markAsRead).toHaveBeenCalledWith('notif_2');
      expect(handleClose).toHaveBeenCalled();
      expect(handleNavigate).toHaveBeenCalledWith(
        { screen: 'room', id: 'room_999' },
        expect.objectContaining({ _id: 'notif_2' })
      );
    });
  });

  it('marks all as read when button is clicked', async () => {
    notificationService.getNotifications.mockResolvedValueOnce({
      notifications: [
        {
          _id: 'notif_3',
          type: 'friend_accepted',
          title: 'Friend Accepted',
          message: 'Bob accepted your request',
          link: { screen: 'friends' },
          isRead: false
        }
      ],
      unreadCount: 1
    });
    notificationService.markAllAsRead.mockResolvedValueOnce({ success: true });

    render(<NotificationsModal isOpen={true} onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('Mark all read')).toBeDefined();
    });

    fireEvent.click(screen.getByText('Mark all read'));

    await waitFor(() => {
      expect(notificationService.markAllAsRead).toHaveBeenCalled();
    });
  });
});

