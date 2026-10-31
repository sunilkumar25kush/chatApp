import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import RoomJoinRequestsModal from './RoomJoinRequestsModal';
import api from '../services/api';

vi.mock('../services/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

describe('RoomJoinRequestsModal', () => {
  const mockRequests = [
    {
      _id: 'req_1',
      status: 'pending',
      createdAt: new Date().toISOString(),
      user: {
        _id: 'user_bob',
        username: 'bob_dev',
        fullName: 'Bob Smith',
        publicId: 'SKY-BOB123',
        bio: 'Frontend enthusiast',
        avatar: ''
      }
    }
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not render when isOpen is false', () => {
    const { queryByText } = render(
      <RoomJoinRequestsModal
        isOpen={false}
        onClose={vi.fn()}
        roomId="room_123"
        roomName="Dev Lounge"
      />
    );
    expect(queryByText(/Join Requests/i)).not.toBeInTheDocument();
  });

  it('fetches and lists pending requests with public profile fields', async () => {
    api.get.mockResolvedValueOnce({ data: { requests: mockRequests, count: 1 } });

    render(
      <RoomJoinRequestsModal
        isOpen={true}
        onClose={vi.fn()}
        roomId="room_123"
        roomName="Dev Lounge"
      />
    );

    expect(api.get).toHaveBeenCalledWith('/rooms/room_123/join-requests?status=pending');

    await waitFor(() => {
      expect(screen.getByText('Bob Smith')).toBeInTheDocument();
      expect(screen.getByText('SKY-BOB123')).toBeInTheDocument();
      expect(screen.getByText(/@bob_dev/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /approve/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /decline/i })).toBeInTheDocument();
    });
  });

  it('allows approving a join request', async () => {
    api.get.mockResolvedValueOnce({ data: { requests: mockRequests, count: 1 } });
    api.post.mockResolvedValueOnce({ data: { message: 'Approved' } });
    const handleMemberAdded = vi.fn();
    const handleToast = vi.fn();

    render(
      <RoomJoinRequestsModal
        isOpen={true}
        onClose={vi.fn()}
        roomId="room_123"
        roomName="Dev Lounge"
        onMemberAdded={handleMemberAdded}
        onToast={handleToast}
      />
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /approve/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /approve/i }));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/rooms/room_123/join-requests/req_1/approve');
      expect(handleMemberAdded).toHaveBeenCalled();
      expect(handleToast).toHaveBeenCalledWith(expect.stringContaining('Approved @bob_dev'), 'success');
    });
  });

  it('allows declining a join request', async () => {
    api.get.mockResolvedValueOnce({ data: { requests: mockRequests, count: 1 } });
    api.post.mockResolvedValueOnce({ data: { message: 'Rejected' } });
    const handleToast = vi.fn();

    render(
      <RoomJoinRequestsModal
        isOpen={true}
        onClose={vi.fn()}
        roomId="room_123"
        roomName="Dev Lounge"
        onToast={handleToast}
      />
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /decline/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /decline/i }));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/rooms/room_123/join-requests/req_1/reject');
      expect(handleToast).toHaveBeenCalledWith(expect.stringContaining('Rejected join request'), 'info');
    });
  });

  it('shows empty state when there are no pending requests', async () => {
    api.get.mockResolvedValueOnce({ data: { requests: [], count: 0 } });

    render(
      <RoomJoinRequestsModal
        isOpen={true}
        onClose={vi.fn()}
        roomId="room_123"
        roomName="Dev Lounge"
      />
    );

    await waitFor(() => {
      expect(screen.getByText('No Pending Join Requests')).toBeInTheDocument();
    });
  });
});

