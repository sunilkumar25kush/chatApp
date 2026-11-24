const mongoose = require('mongoose');
const Story = require('../models/Story');
const StoryView = require('../models/StoryView');
const Friendship = require('../models/Friendship');
const User = require('../models/User');
const { deleteStoryMedia } = require('../services/storyCleanupService');
const logger = require('../utils/logger');

const isDBConnected = () => mongoose.connection.readyState === 1;

const getUserId = (req) => {
  if (req.user && req.user._id) return req.user._id.toString();
  if (req.user && req.user.id) return req.user.id.toString();
  return null;
};

// In-memory fallback map for test environments where MongoDB is offline
const memoryStories = new Map();
const memoryStoryViews = new Map();

/**
 * Check if viewer is allowed to see a story according to its visibility settings
 * @param {object} story 
 * @param {string} viewerId 
 * @param {Set<string>} friendIdsSet 
 * @returns {boolean}
 */
const canViewStory = (story, viewerId, friendIdsSet) => {
  const authorId = (story.userId?._id || story.userId || story.user?._id || story.user)?.toString();
  if (authorId === viewerId) return true;

  const visibility = story.visibility || 'friends';

  // 1. If public
  if (visibility === 'public') {
    const excluded = (story.excludedViewers || []).map((id) => (id?._id || id).toString());
    return !excluded.includes(viewerId);
  }

  // All other modes REQUIRE the viewer to be an accepted friend!
  // Pending friend requests or non-friends are NOT allowed.
  if (!friendIdsSet.has(authorId)) {
    return false;
  }

  // 2. Friends Except... (visibility === 'friends_except')
  if (visibility === 'friends_except') {
    const excluded = (story.excludedViewers || []).map((id) => (id?._id || id).toString());
    return !excluded.includes(viewerId);
  }

  // 3. Only Share With... (visibility === 'only_share_with' || visibility === 'custom')
  if (visibility === 'only_share_with' || visibility === 'custom') {
    const allowed = (story.allowedViewers || []).map((id) => (id?._id || id).toString());
    return allowed.includes(viewerId);
  }

  // 4. Default 'friends' (My Contacts)
  if (visibility === 'friends') {
    const excluded = (story.excludedViewers || []).map((id) => (id?._id || id).toString());
    return !excluded.includes(viewerId);
  }

  return false;
};

/**
 * Strips private audience lists from story object if viewer is not the author
 */
const sanitizeStoryForViewer = (storyObj, currentUserId) => {
  if (!storyObj) return storyObj;
  const authorId = (storyObj.userId?._id || storyObj.userId || storyObj.user?._id || storyObj.user)?.toString();
  if (authorId !== currentUserId) {
    delete storyObj.allowedViewers;
    delete storyObj.excludedViewers;
  }
  return storyObj;
};

/**
 * @desc    Create a new story / status
 * @route   POST /api/stories
 * @access  Private
 */
const createStory = async (req, res, next) => {
  try {
    const currentUserId = getUserId(req);
    if (!currentUserId) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const {
      mediaType,
      mediaUrl,
      thumbnailUrl,
      textContent,
      backgroundColor,
      textColor,
      caption,
      visibility: reqVisibility,
      allowedViewers: reqAllowed,
      excludedViewers: reqExcluded,
      duration,
      textConfig
    } = req.body;

    let visibility = reqVisibility;
    let allowedViewers = reqAllowed;
    let excludedViewers = reqExcluded;

    // Fallback to user default story privacy setting if not specified
    if (!visibility && isDBConnected()) {
      try {
        const authorUser = await User.findById(currentUserId).select('privacy.storyPrivacy');
        if (authorUser?.privacy?.storyPrivacy) {
          visibility = authorUser.privacy.storyPrivacy.visibility || 'friends';
          if (!allowedViewers) allowedViewers = authorUser.privacy.storyPrivacy.allowedViewers || [];
          if (!excludedViewers) excludedViewers = authorUser.privacy.storyPrivacy.excludedViewers || [];
        }
      } catch {
        /* fallback to friends */
      }
    }
    if (!visibility) visibility = 'friends';
    if (!Array.isArray(allowedViewers)) allowedViewers = [];
    if (!Array.isArray(excludedViewers)) excludedViewers = [];

    const normalizedMediaType = mediaType === 'photo' ? 'image' : mediaType;

    if (!['image', 'video', 'text'].includes(normalizedMediaType)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid mediaType. Must be image, video, or text.'
      });
    }

    if ((normalizedMediaType === 'image' || normalizedMediaType === 'video') && !mediaUrl) {
      return res.status(400).json({
        success: false,
        message: 'mediaUrl is required for image and video stories.'
      });
    }

    const effectiveText = textContent || textConfig?.text || '';
    if (normalizedMediaType === 'text' && !effectiveText.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Text content is required for text status.'
      });
    }

    // Security: Calculate expiresAt strictly on server (exactly 24 hours). Never trust client.
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    let storyDoc;

    if (isDBConnected()) {
      storyDoc = await Story.create({
        userId: currentUserId,
        user: currentUserId,
        mediaType: normalizedMediaType,
        mediaUrl: mediaUrl || '',
        thumbnailUrl: thumbnailUrl || '',
        textContent: effectiveText.trim(),
        backgroundColor: backgroundColor || textConfig?.background || 'linear-gradient(135deg, #6366f1, #a855f7)',
        textColor: textColor || textConfig?.textColor || '#ffffff',
        caption: (caption || '').trim(),
        visibility,
        allowedViewers: Array.isArray(allowedViewers) ? allowedViewers : [],
        excludedViewers: Array.isArray(excludedViewers) ? excludedViewers : [],
        duration: duration || (normalizedMediaType === 'video' ? 15 : 5),
        textConfig: {
          text: effectiveText.trim(),
          background: backgroundColor || textConfig?.background || 'linear-gradient(135deg, #6366f1, #a855f7)',
          textColor: textColor || textConfig?.textColor || '#ffffff',
          textAlign: textConfig?.textAlign || 'center',
          fontStyle: textConfig?.fontStyle || 'normal'
        },
        expiresAt
      });

      await storyDoc.populate('userId', 'username fullName avatar publicId');
      storyDoc.user = storyDoc.userId;
    } else {
      const storyId = 'mem_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
      storyDoc = {
        _id: storyId,
        userId: req.user || { _id: currentUserId, username: 'You', fullName: 'You', avatar: '' },
        user: req.user || { _id: currentUserId, username: 'You', fullName: 'You', avatar: '' },
        mediaType: normalizedMediaType,
        mediaUrl: mediaUrl || '',
        thumbnailUrl: thumbnailUrl || '',
        textContent: effectiveText.trim(),
        backgroundColor: backgroundColor || 'linear-gradient(135deg, #6366f1, #a855f7)',
        textColor: textColor || '#ffffff',
        caption: (caption || '').trim(),
        visibility,
        allowedViewers: [],
        excludedViewers: [],
        duration: duration || 5,
        textConfig: {
          text: effectiveText.trim(),
          background: backgroundColor || 'linear-gradient(135deg, #6366f1, #a855f7)',
          textColor: textColor || '#ffffff',
          textAlign: 'center'
        },
        expiresAt,
        isArchived: false,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      memoryStories.set(storyId, storyDoc);
    }

    // Real-time broadcast to all eligible friends
    const io = req.app.get('io');
    if (io) {
      try {
        let friendIds = [];
        if (isDBConnected()) {
          const friendships = await Friendship.find({
            $or: [{ requester: currentUserId }, { recipient: currentUserId }],
            status: 'accepted'
          });
          friendIds = friendships.map((f) =>
            f.requester.toString() === currentUserId ? f.recipient.toString() : f.requester.toString()
          );
        }

        io.to(`user:${currentUserId}`).emit('story_new', { story: storyDoc });
        friendIds.forEach((friendId) => {
          io.to(`user:${friendId}`).emit('story_new', { story: storyDoc });
        });
      } catch (e) {
        logger.error(`[StorySocket] Failed to broadcast story_new: ${e.message}`);
      }
    }

    return res.status(201).json({
      success: true,
      message: 'Story created successfully',
      story: storyDoc
    });
  } catch (err) {
    next(err);
  }
};

/**
 * @desc    Get active stories feed (current user + friends/public)
 * @route   GET /api/stories
 * @route   GET /api/stories/feed
 * @access  Private
 */
const getStoriesFeed = async (req, res, next) => {
  try {
    const currentUserId = getUserId(req);
    if (!currentUserId) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const now = new Date();

    if (isDBConnected()) {
      // 1. Fetch current user's accepted friends
      const friendships = await Friendship.find({
        $or: [{ requester: currentUserId }, { recipient: currentUserId }],
        status: 'accepted'
      });

      const friendIds = friendships.map((f) =>
        f.requester.toString() === currentUserId ? f.recipient.toString() : f.requester.toString()
      );
      const friendIdsSet = new Set(friendIds);

      // 2. Fetch all active, non-expired stories from current user or any user
      const candidateStories = await Story.find({
        expiresAt: { $gt: now },
        isArchived: false,
        $or: [
          { userId: currentUserId },
          { userId: { $in: friendIds } },
          { visibility: 'public' },
          { allowedViewers: currentUserId }
        ]
      })
        .populate('userId', 'username fullName avatar publicId')
        .sort({ createdAt: 1 });

      // 3. Filter by visibility policy
      const authorizedStories = candidateStories.filter((st) =>
        canViewStory(st, currentUserId, friendIdsSet)
      );

      // 4. Batch query view records for current user
      const storyIds = authorizedStories.map((s) => s._id);
      const myViews = await StoryView.find({
        storyId: { $in: storyIds },
        viewerId: currentUserId
      }).select('storyId');

      const viewedStoryIdsSet = new Set(myViews.map((v) => v.storyId.toString()));

      // 5. Batch view counts for each story
      const viewCounts = await StoryView.aggregate([
        { $match: { storyId: { $in: storyIds } } },
        { $group: { _id: '$storyId', count: { $sum: 1 } } }
      ]);
      const viewCountsMap = new Map(viewCounts.map((vc) => [vc._id.toString(), vc.count]));

      // 6. Group stories by author
      const userGroupMap = new Map();

      authorizedStories.forEach((st) => {
        const author = st.userId || st.user;
        if (!author) return;
        const authorId = (author._id || author.id).toString();

        if (!userGroupMap.has(authorId)) {
          userGroupMap.set(authorId, {
            user: author,
            isMe: authorId === currentUserId,
            stories: [],
            hasUnseen: false,
            latestTimestamp: st.createdAt
          });
        }

        const group = userGroupMap.get(authorId);
        let storyObj = st.toObject ? st.toObject() : { ...st };
        storyObj.viewsCount = viewCountsMap.get(st._id.toString()) || 0;
        storyObj.hasViewed = viewedStoryIdsSet.has(st._id.toString());
        storyObj.user = author;
        storyObj = sanitizeStoryForViewer(storyObj, currentUserId);

        group.stories.push(storyObj);
        if (new Date(st.createdAt) > new Date(group.latestTimestamp)) {
          group.latestTimestamp = st.createdAt;
        }

        if (authorId !== currentUserId && !storyObj.hasViewed) {
          group.hasUnseen = true;
        }
      });

      const myGroup = userGroupMap.get(currentUserId) || null;
      userGroupMap.delete(currentUserId);

      // Friends sorted by unseen first, then by latest update
      const friendGroups = Array.from(userGroupMap.values()).sort((a, b) => {
        if (a.hasUnseen && !b.hasUnseen) return -1;
        if (!a.hasUnseen && b.hasUnseen) return 1;
        return new Date(b.latestTimestamp) - new Date(a.latestTimestamp);
      });

      const sanitizedStories = authorizedStories.map((st) =>
        sanitizeStoryForViewer(st.toObject ? st.toObject() : { ...st }, currentUserId)
      );

      return res.json({
        success: true,
        count: authorizedStories.length,
        myGroup,
        friendGroups,
        stories: sanitizedStories
      });
    } else {
      // Memory fallback
      const activeList = Array.from(memoryStories.values()).filter(
        (st) => new Date(st.expiresAt) > now && !st.isArchived
      );

      const userGroupMap = new Map();
      activeList.forEach((st) => {
        const author = st.userId || st.user;
        const authorId = (author._id || author.id || 'me').toString();

        if (!userGroupMap.has(authorId)) {
          userGroupMap.set(authorId, {
            user: author,
            isMe: authorId === currentUserId,
            stories: [],
            hasUnseen: false,
            latestTimestamp: st.createdAt
          });
        }

        const group = userGroupMap.get(authorId);
        group.stories.push(st);
        if (new Date(st.createdAt) > new Date(group.latestTimestamp)) {
          group.latestTimestamp = st.createdAt;
        }
      });

      const myGroup = userGroupMap.get(currentUserId) || null;
      userGroupMap.delete(currentUserId);
      const friendGroups = Array.from(userGroupMap.values());

      return res.json({
        success: true,
        myGroup,
        friendGroups,
        stories: activeList
      });
    }
  } catch (err) {
    next(err);
  }
};

/**
 * @desc    Get active stories for a specific user
 * @route   GET /api/stories/user/:userId
 * @access  Private
 */
const getUserStories = async (req, res, next) => {
  try {
    const currentUserId = getUserId(req);
    const { userId: targetUserId } = req.params;

    if (!currentUserId) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    if (!targetUserId || !mongoose.Types.ObjectId.isValid(targetUserId)) {
      return res.status(400).json({ success: false, message: 'Invalid target user ID' });
    }

    const now = new Date();

    if (isDBConnected()) {
      // Check friendship relationship
      const friendship = await Friendship.findOne({
        $or: [
          { requester: currentUserId, recipient: targetUserId },
          { requester: targetUserId, recipient: currentUserId }
        ],
        status: 'accepted'
      });

      const friendIdsSet = new Set(friendship ? [targetUserId] : []);

      const userStories = await Story.find({
        userId: targetUserId,
        expiresAt: { $gt: now },
        isArchived: false
      })
        .populate('userId', 'username fullName avatar publicId')
        .sort({ createdAt: 1 });

      // Apply visibility filter
      const authorizedStories = userStories.filter((st) =>
        canViewStory(st, currentUserId, friendIdsSet)
      );

      const sanitizedStories = authorizedStories.map((st) =>
        sanitizeStoryForViewer(st.toObject ? st.toObject() : { ...st }, currentUserId)
      );

      return res.json({
        success: true,
        count: sanitizedStories.length,
        stories: sanitizedStories
      });
    } else {
      const list = Array.from(memoryStories.values()).filter((st) => {
        const aId = (st.userId?._id || st.userId || st.user?._id || st.user)?.toString();
        return aId === targetUserId && new Date(st.expiresAt) > now && !st.isArchived;
      });

      return res.json({
        success: true,
        count: list.length,
        stories: list
      });
    }
  } catch (err) {
    next(err);
  }
};

/**
 * @desc    Get a single story by ID
 * @route   GET /api/stories/:storyId
 * @access  Private
 */
const getStoryById = async (req, res, next) => {
  try {
    const currentUserId = getUserId(req);
    const { storyId } = req.params;

    if (!currentUserId) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    if (!storyId || !mongoose.Types.ObjectId.isValid(storyId)) {
      return res.status(400).json({ success: false, message: 'Invalid story ID' });
    }

    if (isDBConnected()) {
      const story = await Story.findById(storyId).populate('userId', 'username fullName avatar publicId');

      if (!story || story.isArchived || new Date(story.expiresAt) <= new Date()) {
        return res.status(404).json({
          success: false,
          message: 'Story not found or has expired.'
        });
      }

      const authorId = (story.userId?._id || story.userId).toString();
      let friendIdsSet = new Set();
      if (authorId !== currentUserId) {
        const friendship = await Friendship.findOne({
          $or: [
            { requester: currentUserId, recipient: authorId },
            { requester: authorId, recipient: currentUserId }
          ],
          status: 'accepted'
        });
        if (friendship) friendIdsSet.add(authorId);
      }

      if (!canViewStory(story, currentUserId, friendIdsSet)) {
        return res.status(403).json({
          success: false,
          message: 'You are not authorized to view this story.'
        });
      }

      const viewsCount = await StoryView.countDocuments({ storyId: story._id });
      let storyObj = story.toObject();
      storyObj.viewsCount = viewsCount;
      storyObj.user = storyObj.userId;
      storyObj = sanitizeStoryForViewer(storyObj, currentUserId);

      return res.json({
        success: true,
        story: storyObj
      });
    } else {
      const story = memoryStories.get(storyId);
      if (!story || new Date(story.expiresAt) <= new Date()) {
        return res.status(404).json({ success: false, message: 'Story not found or has expired.' });
      }
      return res.json({ success: true, story: sanitizeStoryForViewer({ ...story }, currentUserId) });
    }
  } catch (err) {
    next(err);
  }
};

/**
 * @desc    Record that a user viewed a story (unique tracking, exclude owner)
 * @route   POST /api/stories/:storyId/view
 * @access  Private
 */
const recordStoryView = async (req, res, next) => {
  try {
    const currentUserId = getUserId(req);
    const { storyId } = req.params;

    if (!currentUserId) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    if (!storyId || !mongoose.Types.ObjectId.isValid(storyId)) {
      return res.status(400).json({ success: false, message: 'Invalid story ID' });
    }

    if (isDBConnected()) {
      const story = await Story.findById(storyId);
      if (!story || story.isArchived || new Date(story.expiresAt) <= new Date()) {
        return res.status(404).json({ success: false, message: 'Story not found or has expired' });
      }

      const authorId = (story.userId?._id || story.userId).toString();

      // Exclude story owner from viewer counts
      if (authorId === currentUserId) {
        const count = await StoryView.countDocuments({ storyId });
        return res.json({
          success: true,
          message: 'Owner view not counted',
          viewsCount: count
        });
      }

      // Record view if not already recorded (idempotent / upsert)
      let isNewView = false;
      try {
        const existingView = await StoryView.findOne({ storyId, viewerId: currentUserId });
        if (!existingView) {
          await StoryView.create({
            storyId,
            viewerId: currentUserId,
            viewedAt: new Date()
          });
          isNewView = true;
        }
      } catch (err) {
        // Duplicate key (race condition) handled gracefully
        if (err.code !== 11000) throw err;
      }

      const count = await StoryView.countDocuments({ storyId });

      // If new view, emit real-time event to story owner
      if (isNewView) {
        const io = req.app.get('io');
        if (io) {
          const viewerUser = await User.findById(currentUserId).select('username fullName avatar publicId');
          io.to(`user:${authorId}`).emit('story_viewed', {
            storyId,
            viewer: {
              user: viewerUser,
              viewedAt: new Date()
            },
            totalViews: count
          });
        }
      }

      return res.json({
        success: true,
        message: 'Story view recorded',
        viewsCount: count
      });
    } else {
      const key = `${storyId}_${currentUserId}`;
      if (!memoryStoryViews.has(key)) {
        memoryStoryViews.set(key, { storyId, viewerId: currentUserId, viewedAt: new Date() });
      }
      return res.json({ success: true, message: 'Story view recorded' });
    }
  } catch (err) {
    next(err);
  }
};

/**
 * @desc    Get viewers list for a story (OWNER ONLY)
 * @route   GET /api/stories/:storyId/views
 * @access  Private
 */
const getStoryViews = async (req, res, next) => {
  try {
    const currentUserId = getUserId(req);
    const { storyId } = req.params;

    if (!currentUserId) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    if (!storyId || !mongoose.Types.ObjectId.isValid(storyId)) {
      return res.status(400).json({ success: false, message: 'Invalid story ID' });
    }

    if (isDBConnected()) {
      const story = await Story.findById(storyId);
      if (!story) {
        return res.status(404).json({ success: false, message: 'Story not found' });
      }

      const authorId = (story.userId?._id || story.userId).toString();

      // Security: ONLY the story owner can access the story's viewer list
      if (authorId !== currentUserId) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. Only the story owner can view this list.'
        });
      }

      const views = await StoryView.find({ storyId })
        .populate('viewerId', 'username fullName avatar publicId')
        .sort({ viewedAt: -1 });

      const formattedViews = views.map((v) => ({
        user: v.viewerId,
        viewedAt: v.viewedAt
      }));

      return res.json({
        success: true,
        count: formattedViews.length,
        views: formattedViews
      });
    } else {
      return res.json({ success: true, count: 0, views: [] });
    }
  } catch (err) {
    next(err);
  }
};

/**
 * @desc    Update story privacy settings
 * @route   PUT /api/stories/:storyId/privacy
 * @access  Private
 */
const updateStoryPrivacy = async (req, res, next) => {
  try {
    const currentUserId = getUserId(req);
    const { storyId } = req.params;
    const { visibility, allowedViewers, excludedViewers } = req.body;

    if (!currentUserId) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    if (!storyId || !mongoose.Types.ObjectId.isValid(storyId)) {
      return res.status(400).json({ success: false, message: 'Invalid story ID' });
    }

    const validVisibilities = ['friends', 'friends_except', 'custom', 'only_share_with', 'public'];
    if (visibility && !validVisibilities.includes(visibility)) {
      return res.status(400).json({ success: false, message: 'Invalid visibility value' });
    }

    if (isDBConnected()) {
      const story = await Story.findById(storyId);
      if (!story) {
        return res.status(404).json({ success: false, message: 'Story not found' });
      }

      if ((story.userId?._id || story.userId).toString() !== currentUserId) {
        return res.status(403).json({ success: false, message: 'You can only edit your own stories' });
      }

      if (visibility) story.visibility = visibility;
      if (Array.isArray(allowedViewers)) story.allowedViewers = allowedViewers;
      if (Array.isArray(excludedViewers)) story.excludedViewers = excludedViewers;

      await story.save();
      await story.populate('userId', 'username fullName avatar publicId');
      await story.populate('allowedViewers', 'username fullName avatar publicId');
      await story.populate('excludedViewers', 'username fullName avatar publicId');

      const io = req.app.get('io');
      if (io) {
        io.to(`user:${currentUserId}`).emit('story_privacy_updated', {
          storyId: story._id,
          visibility: story.visibility
        });
      }

      return res.json({
        success: true,
        message: 'Story privacy updated successfully',
        story
      });
    } else {
      const story = memoryStories.get(storyId);
      if (!story) {
        return res.status(404).json({ success: false, message: 'Story not found' });
      }
      if (visibility) story.visibility = visibility;
      if (Array.isArray(allowedViewers)) story.allowedViewers = allowedViewers;
      if (Array.isArray(excludedViewers)) story.excludedViewers = excludedViewers;
      return res.json({ success: true, message: 'Story privacy updated', story });
    }
  } catch (err) {
    next(err);
  }
};

/**
 * @desc    Get default story privacy settings for current user
 * @route   GET /api/stories/privacy/default
 * @access  Private
 */
const getDefaultStoryPrivacy = async (req, res, next) => {
  try {
    const currentUserId = getUserId(req);
    if (!currentUserId) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    if (isDBConnected()) {
      const user = await User.findById(currentUserId)
        .populate('privacy.storyPrivacy.allowedViewers', 'username fullName avatar publicId')
        .populate('privacy.storyPrivacy.excludedViewers', 'username fullName avatar publicId');

      const storyPrivacy = user?.privacy?.storyPrivacy || {
        visibility: 'friends',
        allowedViewers: [],
        excludedViewers: []
      };

      return res.json({
        success: true,
        storyPrivacy: {
          visibility: storyPrivacy.visibility || 'friends',
          allowedViewers: storyPrivacy.allowedViewers || [],
          excludedViewers: storyPrivacy.excludedViewers || []
        }
      });
    } else {
      return res.json({
        success: true,
        storyPrivacy: {
          visibility: 'friends',
          allowedViewers: [],
          excludedViewers: []
        }
      });
    }
  } catch (err) {
    next(err);
  }
};

/**
 * @desc    Update default story privacy settings for current user
 * @route   PUT /api/stories/privacy/default
 * @access  Private
 */
const updateDefaultStoryPrivacy = async (req, res, next) => {
  try {
    const currentUserId = getUserId(req);
    if (!currentUserId) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const { visibility, allowedViewers, excludedViewers } = req.body;
    const validVisibilities = ['friends', 'friends_except', 'custom', 'only_share_with', 'public'];

    if (visibility && !validVisibilities.includes(visibility)) {
      return res.status(400).json({ success: false, message: 'Invalid visibility option' });
    }

    if (isDBConnected()) {
      const user = await User.findById(currentUserId);
      if (!user) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }

      if (!user.privacy) user.privacy = {};
      if (!user.privacy.storyPrivacy) {
        user.privacy.storyPrivacy = { visibility: 'friends', allowedViewers: [], excludedViewers: [] };
      }

      if (visibility) user.privacy.storyPrivacy.visibility = visibility;
      if (Array.isArray(allowedViewers)) user.privacy.storyPrivacy.allowedViewers = allowedViewers;
      if (Array.isArray(excludedViewers)) user.privacy.storyPrivacy.excludedViewers = excludedViewers;

      await user.save();

      const populatedUser = await User.findById(currentUserId)
        .populate('privacy.storyPrivacy.allowedViewers', 'username fullName avatar publicId')
        .populate('privacy.storyPrivacy.excludedViewers', 'username fullName avatar publicId');

      return res.json({
        success: true,
        message: 'Default story privacy updated successfully',
        storyPrivacy: populatedUser.privacy.storyPrivacy
      });
    } else {
      return res.json({
        success: true,
        message: 'Default story privacy updated',
        storyPrivacy: {
          visibility: visibility || 'friends',
          allowedViewers: allowedViewers || [],
          excludedViewers: excludedViewers || []
        }
      });
    }
  } catch (err) {
    next(err);
  }
};

/**
 * @desc    Delete a story and its storage media (OWNER ONLY)
 * @route   DELETE /api/stories/:storyId
 * @access  Private
 */
const deleteStory = async (req, res, next) => {
  try {
    const currentUserId = getUserId(req);
    const { storyId } = req.params;

    if (!currentUserId) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    if (isDBConnected()) {
      if (!mongoose.Types.ObjectId.isValid(storyId)) {
        return res.status(400).json({ success: false, message: 'Invalid story ID' });
      }

      const story = await Story.findById(storyId);
      if (!story) {
        return res.status(404).json({ success: false, message: 'Story not found' });
      }

      const authorId = (story.userId?._id || story.userId).toString();
      if (authorId !== currentUserId) {
        return res.status(403).json({ success: false, message: 'You can only delete your own stories' });
      }

      // 1. Delete associated media from Cloudinary or local uploads storage
      if (story.mediaUrl) {
        await deleteStoryMedia(story.mediaUrl);
      }
      if (story.thumbnailUrl) {
        await deleteStoryMedia(story.thumbnailUrl);
      }

      // 2. Delete all StoryView records
      await StoryView.deleteMany({ storyId });

      // 3. Delete Story document
      await Story.findByIdAndDelete(storyId);

      const io = req.app.get('io');
      if (io) {
        io.to(`user:${currentUserId}`).emit('story_deleted', { storyId });
      }

      return res.json({ success: true, message: 'Story and associated media deleted successfully' });
    } else {
      const story = memoryStories.get(storyId);
      if (!story) {
        return res.status(404).json({ success: false, message: 'Story not found' });
      }
      memoryStories.delete(storyId);
      return res.json({ success: true, message: 'Story deleted successfully' });
    }
  } catch (err) {
    next(err);
  }
};

module.exports = {
  createStory,
  getStoriesFeed,
  getUserStories,
  getStoryById,
  recordStoryView,
  getStoryViews,
  updateStoryPrivacy,
  deleteStory,
  getDefaultStoryPrivacy,
  updateDefaultStoryPrivacy
};
