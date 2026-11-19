import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import UserProfileModal from './UserProfileModal';
import api from '../../services/api';
import friendService from '../../services/friendService';

// Mock IntersectionObserver for SpotlightCard in jsdom
beforeEach(() => {
  class MockIntersectionObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  window.IntersectionObserver = MockIntersectionObserver;
});

vi.mock('../../context/useAuth', () => ({
  useAuth: () => ({
    user: { _id: 'my-user-id', username: 'sunilkumar', publicId: 'SKY-SUNIL' },
    updateLocalUser: vi.fn()
  })
}));

vi.mock('../../context/ThemeContext', () => ({
  useTheme: () => ({
    resolvedMode: 'light'
  })
}));

vi.mock('../../services/api', () => ({
  default: {
    get: vi.fn(),
    put: vi.fn()
  }
}));

vi.mock('../../services/friendService', () => ({
  default: {
    getRelationshipStatus: vi.fn(),
    sendFriendRequest: vi.fn(),
    removeFriend: vi.fn(),
    acceptRequest: vi.fn(),
    rejectRequest: vi.fn()
  }
}));

describe('UserProfileModal - Relationship Status', () => {
  const mockFriendProfile = {
    _id: 'friend-user-id',
    username: 'shaminun',
    fullName: 'Shaminun',
    publicId: 'SKY-8KKH66',
    bio: 'Hello world',
    createdAt: '2026-11-19T00:00:00.000Z'
  };

  beforeEach(() => {
    vi.clearAllMocks();
    api.get.mockResolvedValue({
      data: mockFriendProfile
    });
  });

  it('renders "✓ Friends" status badge when relationship is accepted', async () => {
    friendService.getRelationshipStatus.mockResolvedValueOnce({
      success: true,
      relationship: {
        status: 'accepted',
        friendshipId: 'friendship-123'
      }
    });

    render(<UserProfileModal targetUserId="friend-user-id" onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('Friends')).toBeInTheDocument();
      expect(screen.getByText('✓')).toBeInTheDocument();
    });

    // Should NOT have "+ Add Friend"
    expect(screen.queryByText('Add Friend')).not.toBeInTheDocument();
  });

  it('renders "+ Add Friend" button when relationship is none', async () => {
    friendService.getRelationshipStatus.mockResolvedValueOnce({
      success: true,
      relationship: {
        status: 'none'
      }
    });

    render(<UserProfileModal targetUserId="friend-user-id" onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('Add Friend')).toBeInTheDocument();
    });

    expect(screen.queryByText('Friends')).not.toBeInTheDocument();
  });

  it('renders "Request Sent" when relationship is pending_outgoing', async () => {
    friendService.getRelationshipStatus.mockResolvedValueOnce({
      success: true,
      relationship: {
        status: 'pending_outgoing'
      }
    });

    render(<UserProfileModal targetUserId="friend-user-id" onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('Request Sent')).toBeInTheDocument();
    });
  });
});
