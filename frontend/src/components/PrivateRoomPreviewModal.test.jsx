import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import PrivateRoomPreviewModal from './PrivateRoomPreviewModal';
import api from '../services/api';

vi.mock('../services/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
  },
}));

describe('PrivateRoomPreviewModal', () => {
  const mockPreviewData = {
    _id: 'room_vip_123',
    name: 'Secret Chamber',
    category: 'Tech',
    description: 'Exclusive developer discussions',
    visibility: 'private',
    isPrivate: true,
    membersCount: 3,
    isMember: false,
    userRequest: null
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not render when isOpen is false', () => {
    const { queryByText } = render(
      <PrivateRoomPreviewModal
        isOpen={false}
        onClose={vi.fn()}
        roomId="room_vip_123"
      />
    );
    expect(queryByText('Private Room Preview')).not.toBeInTheDocument();
  });

  it('fetches and displays restricted room preview', async () => {
    api.get.mockResolvedValueOnce({ data: mockPreviewData });

    render(
      <PrivateRoomPreviewModal
        isOpen={true}
        onClose={vi.fn()}
        roomId="room_vip_123"
      />
    );

    expect(api.get).toHaveBeenCalledWith('/rooms/room_vip_123/preview');

    await waitFor(() => {
      expect(screen.getByText('Secret Chamber')).toBeInTheDocument();
      expect(screen.getByText('Exclusive developer discussions')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /request to join space/i })).toBeInTheDocument();
    });
  });

  it('allows user to submit a join request', async () => {
    api.get.mockResolvedValueOnce({ data: mockPreviewData });
    api.post.mockResolvedValueOnce({
      data: { _id: 'req_123', status: 'pending', createdAt: new Date().toISOString() }
    });
    const handleToast = vi.fn();

    render(
      <PrivateRoomPreviewModal
        isOpen={true}
        onClose={vi.fn()}
        roomId="room_vip_123"
        onToast={handleToast}
      />
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /request to join space/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /request to join space/i }));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/rooms/room_vip_123/join-requests');
      expect(handleToast).toHaveBeenCalledWith(expect.stringContaining('Join request sent'), 'success');
      expect(screen.getByText('Join Request Pending')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /cancel request/i })).toBeInTheDocument();
    });
  });

  it('displays pending status and allows cancelling request', async () => {
    api.get.mockResolvedValueOnce({
      data: {
        ...mockPreviewData,
        userRequest: { _id: 'req_123', status: 'pending', createdAt: new Date().toISOString() }
      }
    });
    api.delete.mockResolvedValueOnce({ data: { message: 'Cancelled' } });
    const handleToast = vi.fn();

    render(
      <PrivateRoomPreviewModal
        isOpen={true}
        onClose={vi.fn()}
        roomId="room_vip_123"
        onToast={handleToast}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Join Request Pending')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /cancel request/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /cancel request/i }));

    await waitFor(() => {
      expect(api.delete).toHaveBeenCalledWith('/rooms/room_vip_123/join-requests/req_123');
      expect(handleToast).toHaveBeenCalledWith(expect.stringContaining('cancelled'), 'info');
    });
  });

  it('displays approved status and offers Enter Room button', async () => {
    api.get.mockResolvedValueOnce({
      data: {
        ...mockPreviewData,
        isMember: true,
        userRequest: { _id: 'req_123', status: 'approved' }
      }
    });
    const handleEnter = vi.fn();

    render(
      <PrivateRoomPreviewModal
        isOpen={true}
        onClose={vi.fn()}
        roomId="room_vip_123"
        onEnterRoom={handleEnter}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/approved member/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /enter room/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /enter room/i }));
    expect(handleEnter).toHaveBeenCalled();
  });
});

