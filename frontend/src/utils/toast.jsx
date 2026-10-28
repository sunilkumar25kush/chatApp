import { GooeyToaster, gooeyToast } from 'goey-toast';
import 'goey-toast/styles.css';
import { useTheme } from '../context/ThemeContext';

export const TOAST_ICONS = {
  join: '👋',
  leave: '🚪',
  message: '💬',
  voice_call: '📞',
  video_call: '📹',
  mic_muted: '🔇',
  mic_unmuted: '🎙️',
  camera_off: '🚫',
  camera_on: '📷',
  screenshare: '🖥️',
  warning: '⚠️',
  error: '❌',
  success: '✅',
  default: '🔔',
  info: 'ℹ️',
};

/**
 * Universal toast dispatcher that maps event types to morphing goey-toasts
 */
export const toast = (title, options = {}) => {
  return gooeyToast(title, {
    duration: 4000,
    showProgress: true,
    showTimestamp: true,
    preset: 'bouncy',
    ...options,
  });
};

toast.success = (title, options = {}) => {
  return gooeyToast.success(title, {
    duration: 4000,
    showProgress: true,
    showTimestamp: true,
    preset: 'bouncy',
    ...options,
  });
};

toast.error = (title, options = {}) => {
  return gooeyToast.error(title, {
    duration: 5000,
    showProgress: true,
    showTimestamp: true,
    preset: 'bouncy',
    ...options,
  });
};

toast.warning = (title, options = {}) => {
  return gooeyToast.warning(title, {
    duration: 4500,
    showProgress: true,
    showTimestamp: true,
    preset: 'bouncy',
    ...options,
  });
};

toast.info = (title, options = {}) => {
  return gooeyToast.info(title, {
    duration: 4000,
    showProgress: true,
    showTimestamp: true,
    preset: 'bouncy',
    ...options,
  });
};

toast.promise = (promise, data) => {
  return gooeyToast.promise(promise, data);
};

toast.dismiss = (id) => {
  return gooeyToast.dismiss(id);
};

toast.update = (id, options) => {
  return gooeyToast.update(id, options);
};

/**
 * Map notification events (join, leave, mic, cam, message, call, etc.)
 */
toast.notify = (title, message = '', type = 'info', extraOptions = {}) => {
  const icon = TOAST_ICONS[type] || TOAST_ICONS.default;
  const options = {
    description: message || undefined,
    icon,
    duration: type === 'error' ? 5000 : 4000,
    showProgress: true,
    showTimestamp: true,
    preset: 'bouncy',
    ...extraOptions,
  };

  switch (type) {
    case 'success':
      return gooeyToast.success(title, options);
    case 'error':
      return gooeyToast.error(title, options);
    case 'warning':
    case 'mic_muted':
    case 'camera_off':
      return gooeyToast.warning(title, options);
    case 'join':
    case 'leave':
    case 'message':
    case 'voice_call':
    case 'video_call':
    case 'screenshare':
    case 'mic_unmuted':
    case 'camera_on':
    case 'info':
      return gooeyToast.info(title, options);
    default:
      return gooeyToast(title, options);
  }
};

/**
 * App-wide Toaster component placed at root
 */
export function AppGooeyToaster() {
  const themeContext = useTheme();
  const themeMode = themeContext?.resolvedMode || 'dark';

  return (
    <GooeyToaster
      position="top-center"
      theme={themeMode === 'light' ? 'light' : 'dark'}
      closeButton
      showProgress
      showTimestamp
      duration={4000}
      preset="bouncy"
      gap={10}
      offset="max(16px, env(safe-area-inset-top, 16px))"
    />
  );
}

export { GooeyToaster, gooeyToast };
export default toast;
