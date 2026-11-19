import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import UserAvatar from './UserAvatar';

describe('UserAvatar', () => {
  it('renders initials when no image src is provided', () => {
    render(<UserAvatar name="Shaminun" size={40} />);
    expect(screen.getByText('SH')).toBeInTheDocument();
  });

  it('renders initials from two words in name', () => {
    render(<UserAvatar name="Sunil Kumar" size={40} />);
    expect(screen.getByText('SK')).toBeInTheDocument();
  });

  it('renders fallback "?" when name is empty', () => {
    render(<UserAvatar name="" size={40} />);
    expect(screen.getByText('?')).toBeInTheDocument();
  });

  it('renders image element when src is provided', () => {
    const { container } = render(<UserAvatar src="https://example.com/avatar.jpg" name="Alice" size={44} />);
    const img = container.querySelector('img');
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src', 'https://example.com/avatar.jpg');
    expect(img).toHaveAttribute('referrerpolicy', 'no-referrer');
  });

  it('gracefully falls back to initials when image errors', () => {
    const { container } = render(<UserAvatar src="http://broken-link.com/bad.png" name="Anime Fire" size={48} />);
    const img = container.querySelector('img');
    expect(img).toBeInTheDocument();

    // Trigger onError
    fireEvent.error(img);

    // Image should be gone and initials rendered
    expect(container.querySelector('img')).not.toBeInTheDocument();
    expect(screen.getByText('AF')).toBeInTheDocument();
  });

  it('renders status dot when showStatus is true', () => {
    const { container } = render(<UserAvatar name="Test" showStatus={true} isOnline={true} />);
    const statusDot = container.querySelector('span[title="Online"]');
    expect(statusDot).toBeInTheDocument();
  });
});
