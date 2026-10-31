import api from './api';

/**
 * Direct Conversations and 1-on-1 Messaging API Service
 */
export const conversationService = {
  /**
   * List all direct conversations for current user
   */
  getConversations: async () => {
    const res = await api.get('/conversations');
    return res.data;
  },

  /**
   * Start or retrieve a canonical direct conversation with an accepted friend
   */
  getOrCreateConversation: async ({ friendPublicId, friendId }) => {
    const res = await api.post('/conversations', { friendPublicId, friendId });
    return res.data;
  },

  /**
   * Get paginated direct messages for a conversation (cursor-based)
   */
  getMessages: async (conversationId, cursor = null, limit = 30) => {
    const params = { limit };
    if (cursor) params.cursor = cursor;
    const res = await api.get(`/conversations/${conversationId}/messages`, { params });
    return res.data;
  },

  /**
   * Send a direct message in a conversation via REST
   */
  sendMessage: async (conversationId, messageData) => {
    const res = await api.post(`/conversations/${conversationId}/messages`, messageData);
    return res.data;
  },

  /**
   * Mark all messages in a conversation as read
   */
  markAsRead: async (conversationId) => {
    const res = await api.put(`/conversations/${conversationId}/read`);
    return res.data;
  },

  /**
   * Edit a direct message
   */
  editMessage: async (messageId, content) => {
    const res = await api.put(`/conversations/messages/${messageId}`, { content });
    return res.data;
  },

  /**
   * Delete a direct message (soft delete)
   */
  deleteMessage: async (messageId) => {
    const res = await api.delete(`/conversations/messages/${messageId}`);
    return res.data;
  }
};

export default conversationService;

