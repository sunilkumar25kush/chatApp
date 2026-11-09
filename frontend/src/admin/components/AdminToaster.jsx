import { GooeyToaster, gooeyToast } from 'goey-toast';
import 'goey-toast/styles.css';
import { useAdminTheme } from '../context/AdminThemeContext';

const base = {
  duration: 3800,
  showProgress: true,
  showTimestamp: true,
  preset: 'bouncy'
};

export const adminToast = (title, options = {}) => gooeyToast(title, { ...base, ...options });
adminToast.success = (title, options = {}) => gooeyToast.success(title, { ...base, ...options });
adminToast.error = (title, options = {}) => gooeyToast.error(title, { ...base, duration: 5000, ...options });
adminToast.warning = (title, options = {}) => gooeyToast.warning(title, { ...base, ...options });
adminToast.info = (title, options = {}) => gooeyToast.info(title, { ...base, ...options });

export function AdminToaster() {
  const { theme } = useAdminTheme();
  return (
    <GooeyToaster
      position="top-right"
      theme={theme}
      closeButton
      showProgress
      duration={3800}
      preset="bouncy"
      gap={10}
      offset="16px"
    />
  );
}
