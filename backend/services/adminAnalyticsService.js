const mongoose = require('mongoose');
const User = require('../models/User');
const Room = require('../models/Room');
const Message = require('../models/Message');
const DirectMessage = require('../models/DirectMessage');
const CallSession = require('../models/CallSession');
const Report = require('../models/Report');
const Friendship = require('../models/Friendship');
const { getOnlineCount } = require('./adminRealtimeService');

const isDBConnected = () => mongoose.connection.readyState === 1;

const DAY_MS = 24 * 60 * 60 * 1000;

const utcDayKey = (date) => new Date(date).toISOString().slice(0, 10);

const buildDayBuckets = (days) => {
  const buckets = new Map();
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(start.getTime() - i * DAY_MS);
    buckets.set(utcDayKey(d), 0);
  }
  return buckets;
};

const aggregateDaily = async (Model, { days, match = {}, dateField = 'createdAt' }) => {
  const buckets = buildDayBuckets(days);
  const start = new Date(Date.now() - days * DAY_MS);
  const rows = await Model.aggregate([
    { $match: { ...match, [dateField]: { $gte: start } } },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: `$${dateField}`, timezone: 'UTC' } },
        count: { $sum: 1 }
      }
    }
  ]);
  rows.forEach((row) => {
    if (buckets.has(row._id)) buckets.set(row._id, row.count);
  });
  return buckets;
};

const bucketsToSeries = (buckets, label = 'count') => {
  return Array.from(buckets.entries()).map(([date, count]) => ({ date, [label]: count }));
};

const mergeBuckets = (a, b, labelA = 'room', labelB = 'direct') => {
  const dates = Array.from(a.keys());
  return dates.map((date) => {
    const room = a.get(date) || 0;
    const direct = b.get(date) || 0;
    return { date, [labelA]: room, [labelB]: direct, total: room + direct };
  });
};

const distinctActiveSenders = async (since) => {
  const [roomSenders, dmSenders, recentUsers] = await Promise.all([
    Message.distinct('sender', { createdAt: { $gte: since }, isDeleted: { $ne: true } }),
    DirectMessage.distinct('sender', { createdAt: { $gte: since }, isDeleted: { $ne: true } }),
    User.distinct('_id', { lastSeen: { $gte: since }, accountStatus: { $ne: 'deleted' } })
  ]);
  const ids = new Set();
  [...roomSenders, ...dmSenders, ...recentUsers].forEach((id) => {
    if (id) ids.add(String(id));
  });
  return ids.size;
};

const aggregateDailyActiveSenders = async (Model, days) => {
  const buckets = buildDayBuckets(days);
  const start = new Date(Date.now() - days * DAY_MS);
  const rows = await Model.aggregate([
    { $match: { createdAt: { $gte: start }, isDeleted: { $ne: true } } },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: 'UTC' } },
        senders: { $addToSet: '$sender' }
      }
    },
    { $project: { count: { $size: '$senders' } } }
  ]);
  rows.forEach((row) => {
    if (buckets.has(row._id)) buckets.set(row._id, row.count);
  });
  return buckets;
};

const getDashboardData = async ({ days = 30 } = {}) => {
  if (!isDBConnected()) {
    throw new Error('Database unavailable');
  }

  const now = Date.now();
  const last24h = new Date(now - DAY_MS);
  const last7d = new Date(now - 7 * DAY_MS);
  const last30d = new Date(now - 30 * DAY_MS);
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);

  const [
    totalUsers,
    activeUsers,
    suspendedUsers,
    bannedUsers,
    deletedUsers,
    newUsers24h,
    newUsers7d,
    totalRooms,
    publicRooms,
    privateRooms,
    suspendedRooms,
    totalRoomMessages,
    totalDirectMessages,
    pendingReports,
    activeCalls,
    callsToday
  ] = await Promise.all([
    User.countDocuments({}),
    User.countDocuments({ accountStatus: 'active' }),
    User.countDocuments({ accountStatus: 'suspended' }),
    User.countDocuments({ accountStatus: 'banned' }),
    User.countDocuments({ accountStatus: 'deleted' }),
    User.countDocuments({ createdAt: { $gte: last24h } }),
    User.countDocuments({ createdAt: { $gte: last7d } }),
    Room.countDocuments({ isDeleted: { $ne: true } }),
    Room.countDocuments({ isDeleted: { $ne: true }, isPrivate: { $ne: true }, visibility: { $ne: 'private' } }),
    Room.countDocuments({ isDeleted: { $ne: true }, $or: [{ isPrivate: true }, { visibility: 'private' }] }),
    Room.countDocuments({ isDeleted: { $ne: true }, isSuspended: true }),
    Message.countDocuments({ isDeleted: { $ne: true } }),
    DirectMessage.countDocuments({ isDeleted: { $ne: true } }),
    Report.countDocuments({ status: { $in: ['pending', 'under_review', 'escalated'] } }),
    CallSession.countDocuments({ status: { $in: ['ringing', 'active'] } }),
    CallSession.countDocuments({ createdAt: { $gte: todayStart } })
  ]);

  const [dau, mau] = await Promise.all([
    distinctActiveSenders(last24h),
    distinctActiveSenders(last30d)
  ]);

  const [userBuckets, roomMessageBuckets, dmBuckets, reportBuckets, callBuckets, activeSenderRoom, activeSenderDm] = await Promise.all([
    aggregateDaily(User, { days }),
    aggregateDaily(Message, { days, match: { isDeleted: { $ne: true } } }),
    aggregateDaily(DirectMessage, { days, match: { isDeleted: { $ne: true } } }),
    aggregateDaily(Report, { days }),
    aggregateDaily(CallSession, { days }),
    aggregateDailyActiveSenders(Message, days),
    aggregateDailyActiveSenders(DirectMessage, days)
  ]);

  const totalBeforeRange = await User.countDocuments({
    createdAt: { $lt: new Date(Date.now() - days * DAY_MS) }
  });
  let runningTotal = totalBeforeRange;
  const userGrowth = Array.from(userBuckets.entries()).map(([date, count]) => {
    runningTotal += count;
    return { date, registrations: count, totalUsers: runningTotal };
  });

  const messageActivity = mergeBuckets(roomMessageBuckets, dmBuckets);
  const engagement = Array.from(activeSenderRoom.keys()).map((date) => {
    const roomSenders = activeSenderRoom.get(date) || 0;
    const dmSenders = activeSenderDm.get(date) || 0;
    // A rough union upper bound: the same user may be counted in both sets.
    const estimatedActiveUsers = Math.max(roomSenders, dmSenders);
    return {
      date,
      activeUsers: estimatedActiveUsers,
      roomSenders,
      dmSenders
    };
  });

  const [recentUsers, recentRooms, recentReports, recentCalls] = await Promise.all([
    User.find({ accountStatus: { $ne: 'deleted' } })
      .sort({ createdAt: -1 })
      .limit(5)
      .select('username fullName email avatar publicId accountStatus createdAt lastSeen')
      .lean(),
    Room.find({ isDeleted: { $ne: true } })
      .sort({ createdAt: -1 })
      .limit(5)
      .select('name code visibility category members owner createdAt isSuspended')
      .populate('owner', 'username fullName avatar publicId')
      .lean(),
    Report.find({ status: { $in: ['pending', 'under_review', 'escalated'] } })
      .sort({ createdAt: -1 })
      .limit(5)
      .select('targetType category priority status createdAt reporter targetUser')
      .populate('reporter', 'username fullName avatar publicId')
      .lean(),
    CallSession.find({})
      .sort({ createdAt: -1 })
      .limit(5)
      .select('callId callType status creator participants startedAt endedAt duration')
      .populate('creator', 'username fullName avatar publicId')
      .lean()
  ]);

  return {
    stats: {
      totalUsers,
      activeUsers,
      suspendedUsers,
      bannedUsers,
      deletedUsers,
      onlineUsers: getOnlineCount(),
      newUsers24h,
      newUsers7d,
      dau,
      mau,
      totalRooms,
      publicRooms,
      privateRooms,
      suspendedRooms,
      totalMessages: totalRoomMessages + totalDirectMessages,
      roomMessages: totalRoomMessages,
      directMessages: totalDirectMessages,
      pendingReports,
      activeCalls,
      callsToday
    },
    charts: {
      userGrowth,
      messageActivity,
      reports: bucketsToSeries(reportBuckets),
      calls: bucketsToSeries(callBuckets),
      engagement
    },
    recent: {
      users: recentUsers,
      rooms: recentRooms.map((room) => ({ ...room, memberCount: (room.members || []).length })),
      reports: recentReports,
      calls: recentCalls
    }
  };
};

const getAnalyticsData = async ({ days = 30 } = {}) => {
  if (!isDBConnected()) {
    throw new Error('Database unavailable');
  }
  const dashboard = await getDashboardData({ days });

  const [roomMessages, dmMessages, userBuckets, reportStatus, reportCategories, callStats, callTypeStats] = await Promise.all([
    aggregateDaily(Message, { days, match: { isDeleted: { $ne: true } } }),
    aggregateDaily(DirectMessage, { days, match: { isDeleted: { $ne: true } } }),
    aggregateDaily(User, { days }),
    Report.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    Report.aggregate([{ $group: { _id: '$category', count: { $sum: 1 } } }, { $sort: { count: -1 } }]),
    CallSession.aggregate([
      { $match: { status: 'ended' } },
      { $group: { _id: null, avgDuration: { $avg: '$duration' }, total: { $sum: 1 } } }
    ]),
    CallSession.aggregate([
      { $group: { _id: { type: '$callType', status: '$status' }, count: { $sum: 1 } } }
    ])
  ]);

  const totalMessages = Array.from(roomMessages.values()).reduce((a, b) => a + b, 0)
    + Array.from(dmMessages.values()).reduce((a, b) => a + b, 0);

  const reportStats = reportStatus.reduce((acc, row) => {
    acc[row._id] = row.count;
    return acc;
  }, {});

  const callTypeMatrix = callTypeStats.reduce((acc, row) => {
    const key = `${row._id.type}_${row._id.status}`;
    acc[key] = row.count;
    return acc;
  }, {});

  return {
    ...dashboard,
    analytics: {
      days,
      messageActivity: mergeBuckets(roomMessages, dmMessages),
      registrations: Array.from(userBuckets.entries()).map(([date, count]) => ({ date, count })),
      totalMessagesInRange: totalMessages,
      reportStatus: reportStats,
      reportCategories: reportCategories.map((row) => ({ category: row._id, count: row.count })),
      callStats: {
        averageDurationSeconds: callStats[0] ? Math.round(callStats[0].avgDuration || 0) : 0,
        completedCalls: callStats[0]?.total || 0,
        byTypeAndStatus: callTypeMatrix
      }
    }
  };
};

const getFriendAnalytics = async ({ days = 30 } = {}) => {
  if (!isDBConnected()) {
    throw new Error('Database unavailable');
  }
  const since = new Date(Date.now() - days * DAY_MS);
  const [byStatus, recentRequests, topRequesters, topRecipients] = await Promise.all([
    Friendship.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    Friendship.countDocuments({ createdAt: { $gte: since } }),
    Friendship.aggregate([
      { $match: { createdAt: { $gte: since } } },
      { $group: { _id: '$requester', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 5 },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'user'
        }
      },
      { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
      { $project: { count: 1, username: '$user.username', avatar: '$user.avatar', accountStatus: '$user.accountStatus' } }
    ]),
    Friendship.aggregate([
      { $match: { createdAt: { $gte: since }, status: 'pending' } },
      { $group: { _id: '$recipient', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 5 },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'user'
        }
      },
      { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
      { $project: { count: 1, username: '$user.username', avatar: '$user.avatar', accountStatus: '$user.accountStatus' } }
    ])
  ]);

  const statusMap = byStatus.reduce((acc, row) => {
    acc[row._id] = row.count;
    return acc;
  }, {});

  return {
    days,
    total: (statusMap.pending || 0) + (statusMap.accepted || 0) + (statusMap.rejected || 0),
    byStatus: statusMap,
    recentRequests,
    topRequesters,
    mostRequestedRecipients: topRecipients
  };
};

module.exports = {
  getDashboardData,
  getAnalyticsData,
  getFriendAnalytics
};
