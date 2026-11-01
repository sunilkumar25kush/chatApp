import { render, screen, fireEvent } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import RoomInfoModal from './RoomInfoModal';

// Mock useAuth
vi.mock('../context/useAuth', () => ({
  useAuth: () => ({
    user: { _id: 'user-current', username: 'currentuser' },
  }),
}));

// Mock toast
vi.mock('../utils/toast', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

describe('RoomInfoModal Component', () => {
  const mockRoom = {
    _id: 'room-123',
    name: 'Tech Enthusiasts',
    code: 'ROOM-TECH-99',
    isPrivate: true,
    members: [{ _id: 'user-current' }, { _id: 'user-admin' }],
    owner: { _id: 'user-admin', username: 'admin_user', fullName: 'Alice Admin' }
  };

  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    room: mockRoom,
    onLeaveRoom: vi.fn(),
    onOpenStudio: vi.fn(),
    onOpenPrivacy: vi.fn(),
    onToggleSelectionMode: vi.fn(),
    onViewAdminProfile: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('renders room details properly when open', () => {
    render(<RoomInfoModal {...defaultProps} />);

    expect(screen.getByText('Tech Enthusiasts')).toBeInTheDocument();
    expect(screen.getAllByText(/2 members/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('ROOM-TECH-99')).toBeInTheDocument();
    expect(screen.getByText('Alice Admin')).toBeInTheDocument();
    expect(screen.getByText(/Administrator/i)).toBeInTheDocument();
  });

  it('does not render when isOpen is false', () => {
    const { container } = render(<RoomInfoModal {...defaultProps} isOpen={false} />);
    expect(container.firstChild).toBeNull();
  });

  it('triggers onOpenStudio when Studio button is clicked', () => {
    render(<RoomInfoModal {...defaultProps} />);

    const studioBtn = screen.getByText('Studio').closest('button');
    fireEvent.click(studioBtn);

    expect(defaultProps.onClose).toHaveBeenCalled();
    expect(defaultProps.onOpenStudio).toHaveBeenCalled();
  });

  it('triggers onToggleSelectionMode when Select button is clicked', () => {
    render(<RoomInfoModal {...defaultProps} />);

    const selectBtn = screen.getByText('Select').closest('button');
    fireEvent.click(selectBtn);

    expect(defaultProps.onClose).toHaveBeenCalled();
    expect(defaultProps.onToggleSelectionMode).toHaveBeenCalled();
  });

  it('triggers onViewAdminProfile with administrator id when admin row is clicked', () => {
    render(<RoomInfoModal {...defaultProps} />);

    const adminRow = screen.getByText('Alice Admin').closest('div');
    fireEvent.click(adminRow);

    expect(defaultProps.onViewAdminProfile).toHaveBeenCalledWith('user-admin');
  });

  it('toggles Mute state when Mute button is clicked', () => {
    render(<RoomInfoModal {...defaultProps} />);

    const muteBtn = screen.getByText('Mute').closest('button');
    fireEvent.click(muteBtn);

    expect(screen.getByText('Unmute')).toBeInTheDocument();
    expect(localStorage.getItem('room_muted_room-123')).toBe('true');
  });

  it('handles leave room flow with confirmation', () => {
    render(<RoomInfoModal {...defaultProps} />);

    const leaveBtn = screen.getByText('Leave Room').closest('button');
    fireEvent.click(leaveBtn);

    expect(screen.getByText(/Are you sure you want to leave/i)).toBeInTheDocument();

    const confirmBtn = screen.getByText('Yes, Leave Room');
    fireEvent.click(confirmBtn);

    expect(defaultProps.onLeaveRoom).toHaveBeenCalledWith('room-123');
  });
});
