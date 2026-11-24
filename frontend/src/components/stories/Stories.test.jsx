import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import StoriesTray from './StoriesTray';
import StoryViewer from './StoryViewer';
import CreateStatusModal from './CreateStatusModal';
import storyService from '../../services/storyService';

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
    viewStory: vi.fn(),
    deleteStory: vi.fn(),
    uploadMedia: vi.fn()
  }
}));

vi.mock('../../services/socket', () => ({
  socket: {
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn()
  }
}));

describe('Stories & Status UI/UX Components', () => {
  const mockCurrentUser = {
    _id: 'my-user-id',
    username: 'sunil',
    fullName: 'Sunil Kumar',
    avatar: 'https://example.com/sunil.jpg'
  };

  const mockFriend1 = {
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
          textConfig: { text: 'Hello everyone!', background: '#6366f1', textColor: '#fff', textAlign: 'center' },
          createdAt: new Date().toISOString(),
          viewers: []
        }
      ]
    },
    friendGroups: [
      {
        user: mockFriend1,
        isMe: false,
        hasUnseen: true,
        latestTimestamp: new Date().toISOString(),
        stories: [
          {
            _id: 'story-f1-1',
            mediaType: 'photo',
            mediaUrl: 'https://example.com/photo.jpg',
            caption: 'A sunny day',
            createdAt: new Date().toISOString(),
            viewers: []
          }
        ]
      }
    ]
  };

  beforeEach(() => {
    vi.clearAllMocks();
    storyService.getFeed.mockResolvedValue(mockFeedData);
  });

  describe('StoriesTray', () => {
    it('renders current user "Your Status" with add status badge', async () => {
      render(<StoriesTray currentUser={mockCurrentUser} />);

      await waitFor(() => {
        expect(screen.getByText('Your Status')).toBeInTheDocument();
      });

      // Verify the add status badge (+) is present
      const addBadge = screen.getByTitle('Add status update');
      expect(addBadge).toBeInTheDocument();
      expect(addBadge.textContent).toBe('+');
    });

    it('renders friends with active stories in tray', async () => {
      render(<StoriesTray currentUser={mockCurrentUser} />);

      await waitFor(() => {
        expect(screen.getByText('Shaminun')).toBeInTheDocument();
      });
    });

    it('opens CreateStatusModal when clicking the add badge', async () => {
      render(<StoriesTray currentUser={mockCurrentUser} />);

      await waitFor(() => {
        expect(screen.getByText('Your Status')).toBeInTheDocument();
      });

      const addBadge = screen.getByTitle('Add status update');
      fireEvent.click(addBadge);

      // Modal should be opened
      expect(screen.getByText('Add New Status')).toBeInTheDocument();
    });
  });

  describe('CreateStatusModal', () => {
    it('renders 3 status tabs (Photo, Video, Text) and switches between them', () => {
      render(<CreateStatusModal isOpen={true} onClose={vi.fn()} />);

      expect(screen.getByText('Add New Status')).toBeInTheDocument();

      const photoTab = screen.getByRole('tab', { name: /photo/i });
      const videoTab = screen.getByRole('tab', { name: /video/i });
      const textTab = screen.getByRole('tab', { name: /text/i });

      expect(photoTab).toBeInTheDocument();
      expect(videoTab).toBeInTheDocument();
      expect(textTab).toBeInTheDocument();

      // Switch to Text tab
      fireEvent.click(textTab);
      expect(screen.getByPlaceholderText("What's on your mind?")).toBeInTheDocument();

      // Switch to Video tab
      fireEvent.click(videoTab);
      expect(screen.getByText(/MP4 or WebM up to 50MB/i)).toBeInTheDocument();
    });

    it('allows typing text and selecting alignment in Text Status tab', async () => {
      storyService.createStory.mockResolvedValueOnce({ success: true });
      const onClose = vi.fn();
      const onStoryCreated = vi.fn();

      render(<CreateStatusModal isOpen={true} onClose={onClose} onStoryCreated={onStoryCreated} />);

      // Switch to text tab
      fireEvent.click(screen.getByRole('tab', { name: /text/i }));

      const textarea = screen.getByPlaceholderText("What's on your mind?");
      fireEvent.change(textarea, { target: { value: 'Excited about the new feature!' } });

      // Click Publish
      fireEvent.click(screen.getByText('Share Status'));

      await waitFor(() => {
        expect(storyService.createStory).toHaveBeenCalledWith(
          expect.objectContaining({
            mediaType: 'text',
            textConfig: expect.objectContaining({
              text: 'Excited about the new feature!'
            })
          })
        );
        expect(onStoryCreated).toHaveBeenCalled();
        expect(onClose).toHaveBeenCalled();
      });
    });
  });

  describe('StoryViewer', () => {
    it('renders full-screen story media, author name, progress bar and close button', () => {
      const userGroups = [
        {
          user: mockFriend1,
          isMe: false,
          stories: [
            {
              _id: 'story-1',
              mediaType: 'text',
              textConfig: { text: 'Hello from story viewer!', background: '#10b981', textColor: '#fff', textAlign: 'center' },
              createdAt: new Date().toISOString(),
              viewers: []
            }
          ]
        }
      ];

      const onClose = vi.fn();
      render(
        <StoryViewer
          isOpen={true}
          initialUserGroupIndex={0}
          userGroups={userGroups}
          currentUserId="my-user-id"
          onClose={onClose}
        />
      );

      expect(screen.getByText('Shaminun')).toBeInTheDocument();
      expect(screen.getByText('Hello from story viewer!')).toBeInTheDocument();

      // Click Close button
      const closeBtn = screen.getByTitle('Close');
      fireEvent.click(closeBtn);
      expect(onClose).toHaveBeenCalled();
    });
  });
});
