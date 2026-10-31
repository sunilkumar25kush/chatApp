import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import RoomPrivacyModal from './RoomPrivacyModal';
import api from '../services/api';

vi.mock('../services/api', () => ({
  default: {
    put: vi.fn(),
  },
}));

describe('RoomPrivacyModal', () => {
  const mockOwner = { _id: 'user_owner_1', username: 'alice' };
  const mockNonOwner = { _id: 'user_stranger_2', username: 'bob' };
  const mockPublicRoom = {
    _id: 'room_123',
    name: 'Tech Lounge',
    visibility: 'public',
    isPrivate: false,
    owner: mockOwner,
    admins: [],
    members: [mockOwner._id]
  };
  const mockPrivateRoom = {
    _id: 'room_456',
    name: 'Secret Chamber',
    visibility: 'private',
    isPrivate: true,
    owner: mockOwner,
    admins: [],
    members: [mockOwner._id]
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not render when isOpen is false', () => {
    const { queryByText } = render(
      <RoomPrivacyModal
        isOpen={false}
        onClose={vi.fn()}
        room={mockPublicRoom}
        currentUser={mockOwner}
      />
    );
    expect(queryByText('Room Privacy Settings')).not.toBeInTheDocument();
  });

  it('renders current public visibility and offers conversion for owner', () => {
    render(
      <RoomPrivacyModal
        isOpen={true}
        onClose={vi.fn()}
        room={mockPublicRoom}
        currentUser={mockOwner}
      />
    );
    expect(screen.getByText('Room Privacy Settings')).toBeInTheDocument();
    expect(screen.getByText('Public Room')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /convert to private/i })).toBeInTheDocument();
  });

  it('shows confirmation warning before converting to private', async () => {
    render(
      <RoomPrivacyModal
        isOpen={true}
        onClose={vi.fn()}
        room={mockPublicRoom}
        currentUser={mockOwner}
      />
    );

    const convertBtn = screen.getByRole('button', { name: /convert to private/i });
    fireEvent.click(convertBtn);

    expect(screen.getByText('Confirm Public to Private Conversion')).toBeInTheDocument();
    expect(screen.getByText(/removed from public room listings/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /confirm & convert to private/i })).toBeInTheDocument();
  });

  it('calls API and triggers onRoomUpdated when confirming conversion to private', async () => {
    api.put.mockResolvedValueOnce({
      data: { ...mockPublicRoom, visibility: 'private', isPrivate: true }
    });
    const handleRoomUpdated = vi.fn();
    const handleToast = vi.fn();
    const handleClose = vi.fn();

    render(
      <RoomPrivacyModal
        isOpen={true}
        onClose={handleClose}
        room={mockPublicRoom}
        currentUser={mockOwner}
        onRoomUpdated={handleRoomUpdated}
        onToast={handleToast}
      />
    );

    // Step 1: Click initial convert button
    fireEvent.click(screen.getByRole('button', { name: /convert to private/i }));

    // Step 2: Click confirmation button
    fireEvent.click(screen.getByRole('button', { name: /confirm & convert to private/i }));

    await waitFor(() => {
      expect(api.put).toHaveBeenCalledWith('/rooms/room_123/visibility', { visibility: 'private' });
      expect(handleRoomUpdated).toHaveBeenCalled();
      expect(handleToast).toHaveBeenCalledWith(expect.stringContaining('converted to Private'), 'success');
      expect(handleClose).toHaveBeenCalled();
    });
  });

  it('allows owner to convert private room back to public', async () => {
    api.put.mockResolvedValueOnce({
      data: { ...mockPrivateRoom, visibility: 'public', isPrivate: false }
    });
    const handleRoomUpdated = vi.fn();
    const handleToast = vi.fn();

    render(
      <RoomPrivacyModal
        isOpen={true}
        onClose={vi.fn()}
        room={mockPrivateRoom}
        currentUser={mockOwner}
        onRoomUpdated={handleRoomUpdated}
        onToast={handleToast}
      />
    );

    expect(screen.getByText('Private Room')).toBeInTheDocument();
    const pubBtn = screen.getByRole('button', { name: /convert to public/i });
    fireEvent.click(pubBtn);

    await waitFor(() => {
      expect(api.put).toHaveBeenCalledWith('/rooms/room_456/visibility', { visibility: 'public' });
      expect(handleRoomUpdated).toHaveBeenCalled();
      expect(handleToast).toHaveBeenCalledWith(expect.stringContaining('converted to Public'), 'success');
    });
  });

  it('disables or hides conversion controls for non-admin users', () => {
    render(
      <RoomPrivacyModal
        isOpen={true}
        onClose={vi.fn()}
        room={mockPublicRoom}
        currentUser={mockNonOwner}
      />
    );

    expect(screen.getByText(/Only the room owner or administrators can change/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /convert to private/i })).not.toBeInTheDocument();
  });
});

