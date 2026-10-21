import { render, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { vi, describe, it, expect, beforeEach } from 'vitest';

// Mock import.meta.env FIRST
vi.stubGlobal('import.meta', {
  env: {
    VITE_SOCKET_URL: 'http://localhost:5000',
    VITE_API_URL: 'http://localhost:5000/api',
    VITE_GOOGLE_CLIENT_ID: '',
    DEV: true,
    PROD: false,
  },
});

// Use vi.hoisted to create mocks before any imports
const { mockSocketInstance, mockIsSocketConnected } = vi.hoisted(() => {
  const socketInstance = {
    emit: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    connected: false,
  };
  return {
    mockSocketInstance: socketInstance,
    mockIsSocketConnected: vi.fn(() => false),
  };
});

// Mock socket.io-client BEFORE ChatWindow imports it
vi.mock('socket.io-client', () => ({
  io: vi.fn(() => mockSocketInstance),
}));

// Mock the socket service
vi.mock('../services/socket', () => ({
  socket: mockSocketInstance,
  onSocketStatusChange: vi.fn((cb) => {
    cb(false);
    return vi.fn();
  }),
  isSocketConnected: mockIsSocketConnected,
  registerActiveRoom: vi.fn(),
  unregisterActiveRoom: vi.fn(),
}));

// Mock the api service
vi.mock('../services/api', () => ({
  default: {
    get: vi.fn().mockResolvedValue({ data: { messages: [], hasMore: false } }),
    post: vi.fn(),
    delete: vi.fn(),
  }
}));

// Mock AuthContext
vi.mock('../context/createAuthContext', () => ({
  AuthContext: {
    Provider: ({ children }) => children,
  },
}));

// Mock useAuth
vi.mock('../context/useAuth', () => ({
  useAuth: () => ({
    user: { _id: 'user-123', username: 'testuser' },
    login: vi.fn(),
    logout: vi.fn(),
    loading: false,
    error: null,
  }),
}));

// Mock useAppearance
vi.mock('../context/AppearanceContext', () => ({
  useAppearance: () => ({
    appearanceState: {
      soundControls: { enableSounds: false, enableSentSound: false, enableReceivedSound: false },
      animationPreferences: { enableAnimations: true },
    },
    getActiveWallpaperForRoom: vi.fn(),
    setWallpaperForRoom: vi.fn(),
  }),
}));

// Mock useCall
vi.mock('../context/CallContext', () => ({
  useCall: () => ({
    startCall: vi.fn(),
    activeCall: null,
    callStatus: 'idle',
    callNotifications: [],
    addCallNotification: vi.fn(),
    dismissCallNotification: vi.fn(),
  }),
  CallProvider: ({ children }) => children,
}));

// Import after ALL mocks
import ChatWindow from '../components/ChatWindow';
import { socket } from '../services/socket';

const mockRoom = {
  _id: 'room-123',
  name: 'Test Room',
  code: 'TEST-123',
  isPrivate: false,
  members: [],
  owner: { _id: 'user-123' },
};

const mockUser = {
  _id: 'user-123',
  username: 'testuser',
};

const mockProps = {
  room: mockRoom,
  roomId: 'room-123',
  user: mockUser,
  onLeaveRoom: vi.fn(),
  onBack: vi.fn(),
  onToggleMobileSidebar: vi.fn(),
};

const renderChatWindow = (props = {}) => {
  return render(
    <BrowserRouter>
      <ChatWindow {...mockProps} {...props} />
    </BrowserRouter>
  );
};

describe('ChatWindow - Offline Queue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSocketInstance.emit.mockClear();
    mockSocketInstance.on.mockClear();
    mockSocketInstance.off.mockClear();
    mockSocketInstance.connected = false;
    mockIsSocketConnected.mockReturnValue(false);
  });

  it('queues messages when offline', async () => {
    const { getByPlaceholderText, getByText } = renderChatWindow();
    
    const input = getByPlaceholderText('Send a message...');
    fireEvent.change(input, { target: { value: 'Hello offline' } });
    fireEvent.submit(input.closest('form'));
    
    expect(getByText(/1 message queued/i)).toBeInTheDocument();
  });

  it('sends message directly when online', async () => {
    mockSocketInstance.connected = true;
    mockIsSocketConnected.mockReturnValue(true);
    
    const { getByPlaceholderText } = renderChatWindow();
    const input = getByPlaceholderText('Send a message...');
    fireEvent.change(input, { target: { value: 'Hello online' } });
    fireEvent.submit(input.closest('form'));
    
    expect(socket.emit).toHaveBeenCalledWith('send_message', expect.objectContaining({
      roomId: 'room-123',
      content: 'Hello online',
    }));
  });
});