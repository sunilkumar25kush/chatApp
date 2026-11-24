import api from './api';

const storyService = {
  /**
   * Fetch stories feed for current user and their friends
   * @returns {Promise<{ success: boolean, myGroup: object, friendGroups: Array }>}
   */
  getFeed: async () => {
    const res = await api.get('/stories/feed');
    return res.data;
  },

  /**
   * Publish a new story / status
   * @param {{ mediaType: 'photo'|'video'|'text', mediaUrl?: string, caption?: string, textConfig?: object, duration?: number }} data
   * @returns {Promise<{ success: boolean, story: object }>}
   */
  createStory: async (data) => {
    const res = await api.post('/stories', data);
    return res.data;
  },

  /**
   * Mark a story as viewed by current user
   * @param {string} storyId
   * @returns {Promise<{ success: boolean }>}
   */
  viewStory: async (storyId) => {
    const res = await api.post(`/stories/${storyId}/view`);
    return res.data;
  },

  /**
   * Delete a story (owner only)
   * @param {string} storyId
   * @returns {Promise<{ success: boolean }>}
   */
  deleteStory: async (storyId) => {
    const res = await api.delete(`/stories/${storyId}`);
    return res.data;
  },

  /**
   * Update privacy for an existing active story
   * @param {string} storyId
   * @param {{ visibility: string, allowedViewers?: string[], excludedViewers?: string[] }} data
   * @returns {Promise<{ success: boolean, story: object }>}
   */
  updateStoryPrivacy: async (storyId, data) => {
    const res = await api.put(`/stories/${storyId}/privacy`, data);
    return res.data;
  },

  /**
   * Get user's default story privacy preferences
   * @returns {Promise<{ success: boolean, storyPrivacy: object }>}
   */
  getDefaultPrivacy: async () => {
    const res = await api.get('/stories/privacy/default');
    return res.data;
  },

  /**
   * Update user's default story privacy preferences
   * @param {{ visibility: string, allowedViewers?: string[], excludedViewers?: string[] }} data
   * @returns {Promise<{ success: boolean, storyPrivacy: object }>}
   */
  updateDefaultPrivacy: async (data) => {
    const res = await api.put('/stories/privacy/default', data);
    return res.data;
  },

  /**
   * Upload media file (photo or video) using the existing upload endpoint
   * @param {File} file
   * @returns {Promise<{ url: string, fileType: string, fileName: string, fileSize: number }>}
   */
  uploadMedia: async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    const res = await api.post('/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    });
    return res.data;
  }
};

export default storyService;
