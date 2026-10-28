import { useEffect, useRef } from 'react';
import toast from '../utils/toast';

export default function NotificationToast({ notifications, onDismiss }) {
  const seenIdsRef = useRef(new Set());

  useEffect(() => {
    if (!notifications || notifications.length === 0) return;

    notifications.forEach((item) => {
      if (!item || !item.id || seenIdsRef.current.has(item.id)) return;
      seenIdsRef.current.add(item.id);

      toast.notify(
        item.title || 'Notification',
        item.message || '',
        item.type || 'info',
        {
          id: item.id,
          onDismiss: () => {
            if (typeof onDismiss === 'function') onDismiss(item.id);
          },
          onAutoClose: () => {
            if (typeof onDismiss === 'function') onDismiss(item.id);
          },
        }
      );
    });
  }, [notifications, onDismiss]);

  // All notifications are rendered via goey-toast at top-center
  return null;
}
