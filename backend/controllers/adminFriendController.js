const Friendship = require('../models/Friendship');
const User = require('../models/User');
const { getFriendAnalytics } = require('../services/adminAnalyticsService');
const {
  escapeRegex,
  parsePagination,
  buildPagination,
  parseDate
} = require('../utils/adminValidation');

const listFriendships = async (req, res, next) => {
  try {
    const { page, limit, skip, sort, order } = parsePagination(req.query, {
      defaultLimit: 20,
      maxLimit: 100,
      allowedSorts: ['createdAt', 'updatedAt', 'acceptedAt'],
      defaultSort: 'createdAt'
    });

    const filter = {};
    if (['pending', 'accepted', 'rejected'].includes(req.query.status)) {
      filter.status = req.query.status;
    }
    if (req.query.search) {
      const search = escapeRegex(String(req.query.search).slice(0, 100));
      const users = await User.find({
        $or: [
          { username: { $regex: search, $options: 'i' } },
          { fullName: { $regex: search, $options: 'i' } },
          { publicId: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } }
        ]
      }).select('_id').limit(200).lean();
      filter.$or = [
        { requester: { $in: users.map((u) => u._id) } },
        { recipient: { $in: users.map((u) => u._id) } }
      ];
    }
    const from = parseDate(req.query.from);
    const to = parseDate(req.query.to);
    if (from || to) {
      filter.createdAt = {};
      if (from) filter.createdAt.$gte = from;
      if (to) filter.createdAt.$lte = to;
    }

    const total = await Friendship.countDocuments(filter);
    const friendships = await Friendship.find(filter)
      .sort({ [sort]: order })
      .skip(skip)
      .limit(limit)
      .populate('requester', 'username fullName avatar publicId accountStatus createdAt')
      .populate('recipient', 'username fullName avatar publicId accountStatus createdAt')
      .lean();

    return res.json({ success: true, data: friendships, pagination: buildPagination(total, page, limit) });
  } catch (error) {
    return next(error);
  }
};

const getFriendshipStats = async (req, res, next) => {
  try {
    const days = Math.min(Math.max(Number(req.query.days) || 30, 1), 365);
    const data = await getFriendAnalytics({ days });
    return res.json({ success: true, data });
  } catch (error) {
    return next(error);
  }
};

module.exports = { listFriendships, getFriendshipStats };
