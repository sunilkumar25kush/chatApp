import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import StoryPrivacySelector from './StoryPrivacySelector';
import friendService from '../../services/friendService';
import storyService from '../../services/storyService';

vi.mock('../../services/friendService', () => ({
  default: {
    getFriends: vi.fn()
  }
}));

vi.mock('../../services/storyService', () => ({
  default: {
    getDefaultPrivacy: vi.fn(),
    updateDefaultPrivacy: vi.fn()
  }
}));

vi.mock('../../utils/toast', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn()
  }
}));

describe('StoryPrivacySelector Component', () => {
  const mockFriends = [
    { _id: 'f1', username: 'alice', fullName: 'Alice Johnson', avatar: '' },
    { _id: 'f2', username: 'bob', fullName: 'Bob Smith', avatar: '' },
    { _id: 'f3', username: 'charlie', fullName: 'Charlie Brown', avatar: '' }
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    friendService.getFriends.mockResolvedValue({ success: true, friends: mockFriends });
    storyService.getDefaultPrivacy.mockResolvedValue({
      success: true,
      storyPrivacy: { visibility: 'friends', allowedViewers: [], excludedViewers: [] }
    });
  });

  it('renders all three story visibility options', async () => {
    render(
      <StoryPrivacySelector
        isOpen={true}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />
    );

    expect(screen.getByText('Status Privacy')).toBeDefined();
    expect(screen.getByText('My Contacts / Friends')).toBeDefined();
    expect(screen.getByText('Friends Except...')).toBeDefined();
    expect(screen.getByText('Only Share With...')).toBeDefined();
  });

  it('expands audience list when selecting "Friends Except..." and toggles exclusions', async () => {
    const handleSave = vi.fn();
    render(
      <StoryPrivacySelector
        isOpen={true}
        onClose={vi.fn()}
        onSave={handleSave}
        initialPrivacy={{ visibility: 'friends', allowedViewers: [], excludedViewers: [] }}
      />
    );

    // Wait for friends to load
    await waitFor(() => {
      expect(friendService.getFriends).toHaveBeenCalled();
    });

    // Click "Friends Except..." option card
    fireEvent.click(screen.getByTestId('option-friends-except'));

    await waitFor(() => {
      expect(screen.getByText('Select Friends to Exclude')).toBeDefined();
      expect(screen.getByText('Alice Johnson')).toBeDefined();
      expect(screen.getByText('Bob Smith')).toBeDefined();
    });

    // Exclude Alice
    fireEvent.click(screen.getByText('Alice Johnson'));
    expect(screen.getByText('1 excluded')).toBeDefined();

    // Click Done to save
    fireEvent.click(screen.getByText('Done'));

    await waitFor(() => {
      expect(handleSave).toHaveBeenCalledWith({
        visibility: 'friends_except',
        allowedViewers: [],
        excludedViewers: ['f1']
      });
    });
  });

  it('expands audience list when selecting "Only Share With..." and saves selected friends', async () => {
    const handleSave = vi.fn();
    render(
      <StoryPrivacySelector
        isOpen={true}
        onClose={vi.fn()}
        onSave={handleSave}
        initialPrivacy={{ visibility: 'friends', allowedViewers: [], excludedViewers: [] }}
      />
    );

    // Wait for friends to load
    await waitFor(() => {
      expect(friendService.getFriends).toHaveBeenCalled();
    });

    // Click "Only Share With..." option card
    fireEvent.click(screen.getByTestId('option-only-share-with'));

    await waitFor(() => {
      expect(screen.getByText('Select Friends to Include')).toBeDefined();
      expect(screen.getByText('Charlie Brown')).toBeDefined();
    });

    // Select Charlie and Bob
    fireEvent.click(screen.getByText('Charlie Brown'));
    fireEvent.click(screen.getByText('Bob Smith'));
    expect(screen.getByText('2 selected')).toBeDefined();

    // Click Done to save
    fireEvent.click(screen.getByText('Done'));

    await waitFor(() => {
      expect(handleSave).toHaveBeenCalledWith({
        visibility: 'only_share_with',
        allowedViewers: ['f3', 'f2'],
        excludedViewers: []
      });
    });
  });

  it('filters friends roster by search query', async () => {
    render(
      <StoryPrivacySelector
        isOpen={true}
        onClose={vi.fn()}
        onSave={vi.fn()}
        initialPrivacy={{ visibility: 'friends', allowedViewers: [], excludedViewers: [] }}
      />
    );

    await waitFor(() => {
      expect(friendService.getFriends).toHaveBeenCalled();
    });

    fireEvent.click(screen.getByTestId('option-friends-except'));

    await waitFor(() => {
      expect(screen.getByText('Alice Johnson')).toBeDefined();
      expect(screen.getByText('Bob Smith')).toBeDefined();
    });

    const searchInput = screen.getByPlaceholderText('Search friends by name or ID...');
    fireEvent.change(searchInput, { target: { value: 'alice' } });

    expect(screen.getByText('Alice Johnson')).toBeDefined();
    expect(screen.queryByText('Bob Smith')).toBeNull();
  });
});
