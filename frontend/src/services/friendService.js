import api from './api';

/**
 * Friend and Relationship API Service
 */
export const friendService = {
  /**
   * Look up another user by exact Public ID (e.g. SKY-7K9M2Q)
   */
  lookupUserByPublicId: async (publicId) => {
    const res = await api.get(`/users/lookup/${encodeURIComponent(publicId.trim())}`);
    return res.data;
  },

  /**
   * Get relationship status with a target user (by publicId or userId)
   */
  getRelationshipStatus: async (targetId) => {
    const res = await api.get(`/friends/status/${encodeURIComponent(targetId)}`);
    return res.data;
  },

  /**
   * Send a friend request by Public ID or user ID
   */
  sendFriendRequest: async ({ publicId, targetUserId }) => {
    const res = await api.post('/friends/request', { publicId, targetUserId });
    return res.data;
  },

  /**
   * List incoming pending requests
   */
  getIncomingRequests: async () => {
    const res = await api.get('/friends/requests/incoming');
    return res.data;
  },

  /**
   * List outgoing pending requests
   */
  getOutgoingRequests: async () => {
    const res = await api.get('/friends/requests/outgoing');
    return res.data;
  },

  /**
   * Accept an incoming friend request
   */
  acceptRequest: async (requestId) => {
    const res = await api.put(`/friends/requests/${requestId}/accept`);
    return res.data;
  },

  /**
   * Reject an incoming friend request
   */
  rejectRequest: async (requestId) => {
    const res = await api.put(`/friends/requests/${requestId}/reject`);
    return res.data;
  },

  /**
   * Cancel an outgoing pending friend request
   */
  cancelRequest: async (requestId) => {
    const res = await api.delete(`/friends/requests/${requestId}`);
    return res.data;
  },

  /**
   * List all accepted friends
   */
  getFriends: async () => {
    const res = await api.get('/friends');
    return res.data;
  },

  /**
   * Remove an accepted friend
   */
  removeFriend: async (friendId) => {
    const res = await api.delete(`/friends/${friendId}`);
    return res.data;
  }
};

export default friendService;

