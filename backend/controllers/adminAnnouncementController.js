const Announcement = require('../models/Announcement');
const User = require('../models/User');
const { recordAudit } = require('../services/adminAuditService');
const { sendAnnouncementNow } = require('../services/announcementService');
const {
  isValidObjectId,
  parsePagination,
  buildPagination,
  requireString
} = require('../utils/adminValidation');

const listAnnouncements = async (req, res, next) => {
  try {
    const { page, limit, skip, sort, order } = parsePagination(req.query, {
      defaultLimit: 20,
      maxLimit: 100,
      allowedSorts: ['createdAt', 'scheduledFor', 'sentAt'],
      defaultSort: 'createdAt'
    });
    const filter = {};
    if (['draft', 'scheduled', 'sending', 'sent', 'cancelled', 'failed'].includes(req.query.status)) {
      filter.status = req.query.status;
    }
    if (['all', 'selected', 'online'].includes(req.query.audience)) {
      filter.audience = req.query.audience;
    }
    if (req.query.search) {
      const search = String(req.query.search).slice(0, 100).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = [
        { title: { $regex: search, $options: 'i' } },
        { message: { $regex: search, $options: 'i' } }
      ];
    }

    const total = await Announcement.countDocuments(filter);
    const announcements = await Announcement.find(filter)
      .sort({ [sort]: order })
      .skip(skip)
      .limit(limit)
      .populate('createdBy', 'username email role')
      .lean();

    return res.json({ success: true, data: announcements, pagination: buildPagination(total, page, limit) });
  } catch (error) {
    return next(error);
  }
};

const getAnnouncement = async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid announcement ID' });
    }
    const announcement = await Announcement.findById(req.params.id)
      .populate('createdBy', 'username email role')
      .lean();
    if (!announcement) return res.status(404).json({ success: false, message: 'Announcement not found' });
    return res.json({ success: true, data: announcement });
  } catch (error) {
    return next(error);
  }
};

const createAnnouncement = async (req, res, next) => {
  try {
    const titleCheck = requireString(req.body?.title, { field: 'Title', min: 3, max: 120 });
    if (!titleCheck.ok) return res.status(400).json({ success: false, message: titleCheck.message });
    const messageCheck = requireString(req.body?.message, { field: 'Message', min: 3, max: 2000 });
    if (!messageCheck.ok) return res.status(400).json({ success: false, message: messageCheck.message });

    const audience = ['all', 'selected', 'online'].includes(req.body?.audience) ? req.body.audience : 'all';
    let userIds = [];
    if (audience === 'selected') {
      if (!Array.isArray(req.body?.userIds) || !req.body.userIds.length) {
        return res.status(400).json({ success: false, message: 'Select at least one recipient' });
      }
      userIds = Array.from(new Set(req.body.userIds.filter((id) => isValidObjectId(id))));
      if (!userIds.length) return res.status(400).json({ success: false, message: 'No valid recipients selected' });
      const existing = await User.countDocuments({ _id: { $in: userIds }, accountStatus: { $ne: 'deleted' } });
      if (existing !== userIds.length) {
        return res.status(400).json({ success: false, message: 'One or more selected recipients are unavailable' });
      }
    }

    let scheduledFor = null;
    if (req.body?.scheduledFor) {
      scheduledFor = new Date(req.body.scheduledFor);
      if (Number.isNaN(scheduledFor.getTime())) {
        return res.status(400).json({ success: false, message: 'Invalid schedule date' });
      }
      if (scheduledFor.getTime() < Date.now() - 60 * 1000) {
        return res.status(400).json({ success: false, message: 'Scheduled time must be in the future' });
      }
    }

    const announcement = await Announcement.create({
      title: titleCheck.value,
      message: messageCheck.value,
      audience,
      userIds,
      scheduledFor,
      status: scheduledFor ? 'scheduled' : 'draft',
      createdBy: req.admin._id
    });

    await recordAudit({
      req,
      admin: req.admin,
      action: 'announcement.create',
      targetType: 'announcement',
      targetId: announcement._id.toString(),
      metadata: { audience, scheduled: Boolean(scheduledFor) }
    });

    return res.status(201).json({ success: true, data: announcement });
  } catch (error) {
    return next(error);
  }
};

const updateAnnouncement = async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid announcement ID' });
    }
    const announcement = await Announcement.findById(req.params.id);
    if (!announcement) return res.status(404).json({ success: false, message: 'Announcement not found' });
    if (!['draft', 'scheduled'].includes(announcement.status)) {
      return res.status(409).json({ success: false, message: 'Only draft or scheduled announcements can be edited' });
    }

    const updates = {};
    const fields = [];
    if (typeof req.body?.title === 'string') {
      const check = requireString(req.body.title, { field: 'Title', min: 3, max: 120 });
      if (!check.ok) return res.status(400).json({ success: false, message: check.message });
      updates.title = check.value;
      fields.push('title');
    }
    if (typeof req.body?.message === 'string') {
      const check = requireString(req.body.message, { field: 'Message', min: 3, max: 2000 });
      if (!check.ok) return res.status(400).json({ success: false, message: check.message });
      updates.message = check.value;
      fields.push('message');
    }
    if (['all', 'selected', 'online'].includes(req.body?.audience)) {
      updates.audience = req.body.audience;
      fields.push('audience');
    }
    if (Array.isArray(req.body?.userIds)) {
      updates.userIds = Array.from(new Set(req.body.userIds.filter((id) => isValidObjectId(id))));
      fields.push('userIds');
    }
    if (req.body?.scheduledFor !== undefined) {
      if (req.body.scheduledFor === null || req.body.scheduledFor === '') {
        updates.scheduledFor = null;
        updates.status = 'draft';
      } else {
        const date = new Date(req.body.scheduledFor);
        if (Number.isNaN(date.getTime()) || date.getTime() < Date.now() - 60 * 1000) {
          return res.status(400).json({ success: false, message: 'Scheduled time must be in the future' });
        }
        updates.scheduledFor = date;
        updates.status = 'scheduled';
      }
      fields.push('scheduledFor');
    }

    if (!fields.length) return res.status(400).json({ success: false, message: 'No editable fields supplied' });

    const updated = await Announcement.findByIdAndUpdate(
      announcement._id,
      { $set: updates },
      { new: true, runValidators: true }
    );

    await recordAudit({
      req,
      admin: req.admin,
      action: 'announcement.update',
      targetType: 'announcement',
      targetId: announcement._id.toString(),
      metadata: { fields }
    });

    return res.json({ success: true, data: updated });
  } catch (error) {
    return next(error);
  }
};

const sendAnnouncement = async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid announcement ID' });
    }
    const announcement = await sendAnnouncementNow(req.params.id);
    if (!announcement) {
      return res.status(409).json({ success: false, message: 'Announcement cannot be sent from its current state' });
    }
    await recordAudit({
      req,
      admin: req.admin,
      action: 'announcement.send',
      targetType: 'announcement',
      targetId: announcement._id.toString(),
      metadata: { audience: announcement.audience, delivered: announcement.stats?.delivered || 0 }
    });
    return res.json({ success: true, data: announcement });
  } catch (error) {
    return next(error);
  }
};

const cancelAnnouncement = async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid announcement ID' });
    }
    const announcement = await Announcement.findOneAndUpdate(
      { _id: req.params.id, status: { $in: ['draft', 'scheduled'] } },
      { $set: { status: 'cancelled', cancelledAt: new Date() } },
      { new: true }
    );
    if (!announcement) {
      return res.status(409).json({ success: false, message: 'Announcement cannot be cancelled' });
    }
    await recordAudit({
      req,
      admin: req.admin,
      action: 'announcement.cancel',
      targetType: 'announcement',
      targetId: announcement._id.toString()
    });
    return res.json({ success: true, data: announcement });
  } catch (error) {
    return next(error);
  }
};

const getAnnouncementStats = async (req, res, next) => {
  try {
    const rows = await Announcement.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 }, delivered: { $sum: '$stats.delivered' } } }
    ]);
    const byStatus = rows.reduce((acc, row) => {
      acc[row._id] = { count: row.count, delivered: row.delivered || 0 };
      return acc;
    }, {});
    return res.json({ success: true, data: { byStatus } });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  listAnnouncements,
  getAnnouncement,
  createAnnouncement,
  updateAnnouncement,
  sendAnnouncement,
  cancelAnnouncement,
  getAnnouncementStats
};
