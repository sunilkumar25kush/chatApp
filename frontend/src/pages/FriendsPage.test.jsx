import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import FriendsPage from './FriendsPage';
import friendService from '../services/friendService';

vi.mock('../services/friendService', () => ({
  default: {
    getFriends: vi.fn(),
    getIncomingRequests: vi.fn(),
    getOutgoingRequests: vi.fn(),
    lookupUserByPublicId: vi.fn(),
    getRelationshipStatus: vi.fn(),
    sendFriendRequest: vi.fn(),
    acceptRequest: vi.fn(),
    rejectRequest: vi.fn(),
    cancelRequest: vi.fn(),
    removeFriend: vi.fn()
  }
}));

vi.mock('../services/socket', () => ({
  socket: {
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn()
  }
}));

vi.mock('../context/useAuth', () => ({
  useAuth: () => ({
    user: { _id: 'my_id', username: 'me', publicId: 'SKY-MYID1' }
  })
}));

vi.mock('../utils/toast', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn()
  }
}));

describe('FriendsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    friendService.getFriends.mockResolvedValue({ friends: [] });
    friendService.getIncomingRequests.mockResolvedValue({ requests: [] });
    friendService.getOutgoingRequests.mockResolvedValue({ requests: [] });
  });

  it('renders friends header and empty state when user has no friends', async () => {
    render(<FriendsPage />);

    expect(screen.getAllByText(/Friends/i).length).toBeGreaterThan(0);
    await waitFor(() => {
      expect(screen.getByText('No Friends Yet')).toBeDefined();
    });
  });

  it('renders accepted friends list with public IDs and triggers onStartChat', async () => {
    const friendObj = {
      _id: 'friend_1',
      username: 'skywalker',
      fullName: 'Luke Skywalker',
      publicId: 'SKY-LUKE01',
      status: 'online',
      bio: 'May the force be with you'
    };

    friendService.getFriends.mockResolvedValueOnce({
      friends: [
        {
          friendshipId: 'rel_1',
          friend: friendObj
        }
      ]
    });

    const handleStartChat = vi.fn();
    render(<FriendsPage onStartChat={handleStartChat} />);

    await waitFor(() => {
      expect(screen.getByText('Luke Skywalker')).toBeDefined();
      expect(screen.getByText('SKY-LUKE01')).toBeDefined();
      expect(screen.getByText('"May the force be with you"')).toBeDefined();
    });

    const chatBtn = screen.getByText('💬 Chat');
    fireEvent.click(chatBtn);

    expect(handleStartChat).toHaveBeenCalledWith(friendObj);
  });

  it('searches user by public ID and renders preview with Send Request button', async () => {
    const targetUser = {
      _id: 'target_123',
      username: 'yoda',
      fullName: 'Master Yoda',
      publicId: 'SKY-YODA99',
      bio: 'Do or do not'
    };

    friendService.lookupUserByPublicId.mockResolvedValueOnce({ user: targetUser });
    friendService.getRelationshipStatus.mockResolvedValueOnce({ relationship: { status: 'none' } });

    render(<FriendsPage />);

    // Switch to Add Friend tab
    const addTab = screen.getByText('+ Add Friend');
    fireEvent.click(addTab);

    expect(screen.getByPlaceholderText('e.g. SKY-7K9M2Q')).toBeDefined();

    const input = screen.getByPlaceholderText('e.g. SKY-7K9M2Q');
    fireEvent.change(input, { target: { value: 'SKY-YODA99' } });

    const searchBtn = screen.getByText('Search');
    fireEvent.click(searchBtn);

    await waitFor(() => {
      expect(screen.getByText('Master Yoda')).toBeDefined();
      expect(screen.getByText('SKY-YODA99')).toBeDefined();
      expect(screen.getByText('➕ Send Friend Request')).toBeDefined();
    });
  });
});
