import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import StoriesTray from './StoriesTray';
import StoryViewer from './StoryViewer';
import storyService from '../../services/storyService';
import { socket } from '../../services/socket';

vi.mock('../../context/useAuth', () => ({
  useAuth: () => ({
    user: { _id: 'my-user-id', username: 'sunil', fullName: 'Sunil Kumar', avatar: '' }
  })
}));

vi.mock('../../context/ThemeContext', () => ({
  useTheme: () => ({
    resolvedMode: 'dark'
  })
}));

vi.mock('../../services/storyService', () => ({
  default: {
    getFeed: vi.fn(),
    createStory: vi.fn(),
    viewStory: vi.fn().mockResolvedValue({ success: true }),
    deleteStory: vi.fn(),
    uploadMedia: vi.fn(),
    getDefaultPrivacy: vi.fn().mockResolvedValue({ success: true, storyPrivacy: { visibility: 'friends' } }),
    updateDefaultPrivacy: vi.fn().mockResolvedValue({ success: true }),
    updateStoryPrivacy: vi.fn().mockResolvedValue({ success: true })
  }
}));

const socketListeners = {};
vi.mock('../../services/socket', () => ({
  socket: {
    on: vi.fn((event, cb) => {
      socketListeners[event] = cb;
    }),
    off: vi.fn((event) => {
      delete socketListeners[event];
    }),
    emit: vi.fn()
  }
}));

describe('Stories Real-Time Integration', () => {
  const mockCurrentUser = {
    _id: 'my-user-id',
    username: 'sunil',
    fullName: 'Sunil Kumar',
    avatar: 'https://example.com/sunil.jpg'
  };

  const mockFriend = {
    _id: 'friend-1',
    username: 'shaminun',
    fullName: 'Shaminun',
    avatar: 'https://example.com/shaminun.jpg'
  };

  const mockFeedData = {
    myGroup: {
      user: mockCurrentUser,
      isMe: true,
      latestTimestamp: new Date().toISOString(),
      stories: [
        {
          _id: 'my-story-1',
          mediaType: 'text',
          textConfig: { text: 'Hello realtime!', background: '#6366f1', textColor: '#fff' },
          createdAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 86400000).toISOString(),
          viewsCount: 0,
          viewers: []
        }
      ]
    },
    friendGroups: [
      {
        user: mockFriend,
        isMe: false,
        hasUnseen: true,
        latestTimestamp: new Date().toISOString(),
        stories: [
          {
            _id: 'story-f1',
            mediaType: 'photo',
            mediaUrl: 'https://example.com/pic.jpg',
            viewed: false,
            createdAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 86400000).toISOString(),
            viewers: []
          }
        ]
      }
    ]
  };

  beforeEach(() => {
    vi.clearAllMocks();
    Object.keys(socketListeners).forEach((k) => delete socketListeners[k]);
    storyService.getFeed.mockResolvedValue(mockFeedData);
  });

  it('subscribes to story socket events on mount and handles story:deleted in real time', async () => {
    render(<StoriesTray currentUser={mockCurrentUser} />);

    await waitFor(() => {
      expect(screen.getByText('Shaminun')).toBeInTheDocument();
    });

    // Check that socket listeners are registered for lifecycle events
    expect(socket.on).toHaveBeenCalledWith('story:created', expect.any(Function));
    expect(socket.on).toHaveBeenCalledWith('story:deleted', expect.any(Function));
    expect(socket.on).toHaveBeenCalledWith('story:viewed', expect.any(Function));
    expect(socket.on).toHaveBeenCalledWith('story:expired', expect.any(Function));
    expect(socket.on).toHaveBeenCalledWith('connect', expect.any(Function));

    // Simulate real-time deletion of friend's story
    act(() => {
      if (socketListeners['story:deleted']) {
        socketListeners['story:deleted']({ storyId: 'story-f1' });
      }
    });

    // Friend group should be removed since its only story was deleted
    await waitFor(() => {
      expect(screen.queryByText('Shaminun')).not.toBeInTheDocument();
    });
  });

  it('synchronizes seen/unseen state in real-time across tabs on story:viewed', async () => {
    const { container } = render(<StoriesTray currentUser={mockCurrentUser} />);

    await waitFor(() => {
      expect(screen.getByText('Shaminun')).toBeInTheDocument();
    });

    // Initially unseen has gradient ring
    const unseenRing = container.querySelector('.story-ring-unseen');
    expect(unseenRing).toBeInTheDocument();

    // Simulate multi-tab sync: user viewed this story on another tab
    act(() => {
      if (socketListeners['story:viewed']) {
        socketListeners['story:viewed']({ storyId: 'story-f1', isOwnView: true });
      }
    });

    // The ring should transition to seen ring
    await waitFor(() => {
      const seenRing = container.querySelector('.story-ring-seen');
      expect(seenRing).toBeInTheDocument();
    });
  });

  it('re-fetches feed when socket reconnects to recover missed events', async () => {
    render(<StoriesTray currentUser={mockCurrentUser} />);

    await waitFor(() => {
      expect(screen.getByText('Shaminun')).toBeInTheDocument();
    });

    storyService.getFeed.mockClear();

    // Trigger reconnect handler
    act(() => {
      if (socketListeners['connect']) {
        socketListeners['connect']();
      }
    });

    expect(storyService.getFeed).toHaveBeenCalledTimes(1);
  });

  it('updates live viewers counter in StoryViewer when story:viewed arrives', async () => {
    const mockGroups = [
      {
        user: mockCurrentUser,
        isMe: true,
        stories: [
          {
            _id: 'my-story-1',
            mediaType: 'text',
            textConfig: { text: 'Hello', background: '#333', textColor: '#fff' },
            viewsCount: 1,
            viewers: [
              { user: { _id: 'viewer-1', username: 'alice', fullName: 'Alice' }, viewedAt: new Date().toISOString() }
            ]
          }
        ]
      }
    ];

    render(
      <StoryViewer
        isOpen={true}
        initialUserGroupIndex={0}
        userGroups={mockGroups}
        currentUserId="my-user-id"
        onClose={vi.fn()}
      />
    );

    // Initial views
    expect(screen.getByText('1 views')).toBeInTheDocument();

    // Incoming real-time view from Bob
    act(() => {
      if (socketListeners['story:viewed']) {
        socketListeners['story:viewed']({
          storyId: 'my-story-1',
          totalViews: 2,
          viewer: {
            user: { _id: 'viewer-2', username: 'bob', fullName: 'Bob' },
            viewedAt: new Date().toISOString()
          }
        });
      }
    });

    await waitFor(() => {
      expect(screen.getByText('2 views')).toBeInTheDocument();
    });
  });
});
