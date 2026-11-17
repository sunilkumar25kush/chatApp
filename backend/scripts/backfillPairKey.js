const mongoose = require('mongoose');
require('dotenv').config();
const Friendship = require('../models/Friendship');

async function run() {
  try {
    await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);
    console.log('Connected to DB');
    const all = await Friendship.find({});
    console.log(`Total friendships: ${all.length}`);
    for (const d of all) {
      if (!d.pairKey) {
        d.pairKey = Friendship.makePairKey(d.requester, d.recipient);
        await d.save();
        console.log(`Backfilled pairKey on doc ${d._id}: ${d.pairKey}`);
      }
    }
    console.log('Finished backfill.');
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

run();
