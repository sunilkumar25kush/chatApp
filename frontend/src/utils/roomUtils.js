/**
 * Shared helpers for displaying room metadata (creator, ids).
 */

const toId = (value) => {
  if (!value) return '';
  if (typeof value === 'object') return String(value._id || value.id || '');
  return String(value);
};

/**
 * Returns a human-friendly label for whoever created the room.
 * - "You" when the current user is the creator
 * - creator's username when available (populated from the API)
 * - "System" for built-in seed rooms
 */
export function getRoomCreatorLabel(room, currentUser) {
  if (!room) return 'Unknown';

  // Prefer the immutable `createdBy`; fall back to `owner` for older rooms.
  const creator = room.createdBy || room.owner;
  const creatorId = toId(creator);
  const myId = toId(currentUser);

  if (myId && creatorId && creatorId === myId) return 'You';

  if (creator && typeof creator === 'object' && creator.username) {
    return creator.username;
  }

  // createdBy came back as a raw id — try the populated owner if it matches
  const owner = room.owner;
  if (owner && typeof owner === 'object' && owner.username && toId(owner) === creatorId) {
    return owner.username;
  }

  if (room.createdByName) return room.createdByName;
  if (creatorId === 'system') return 'System';

  return 'Unknown';
}
