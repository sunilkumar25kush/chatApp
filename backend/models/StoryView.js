const mongoose = require('mongoose');

const storyViewSchema = new mongoose.Schema(
  {
    storyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Story',
      required: [true, 'Story ID is required for a story view'],
      index: true
    },
    viewerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Viewer ID is required for a story view'],
      index: true
    },
    viewedAt: {
      type: Date,
      default: Date.now,
      index: true
    }
  },
  {
    timestamps: true
  }
);

// Guarantee each viewer is only recorded ONCE per story (no duplicates)
storyViewSchema.index({ storyId: 1, viewerId: 1 }, { unique: true });
storyViewSchema.index({ storyId: 1, viewedAt: -1 });
storyViewSchema.index({ viewerId: 1, createdAt: -1 });

const StoryView = mongoose.model('StoryView', storyViewSchema);

module.exports = StoryView;
