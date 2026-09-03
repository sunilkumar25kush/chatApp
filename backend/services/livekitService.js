const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');

let LiveKitSDK = null;
try {
  LiveKitSDK = require('livekit-server-sdk');
} catch {
  logger.info('[LiveKit] livekit-server-sdk not detected in node_modules, using standard JWT token engine fallback');
}

const getLiveKitConfig = () => {
  return {
    url: process.env.LIVEKIT_URL || 'ws://localhost:7880',
    apiKey: process.env.LIVEKIT_API_KEY || 'devkey',
    apiSecret: process.env.LIVEKIT_API_SECRET || 'secret_32_char_development_signing_key_livekit'
  };
};

/**
 * Generate a cryptographically signed Access Token for an authorized participant
 * joining an SFU room.
 *
 * @param {Object} params
 * @param {string} params.identity - Unique User ID (from MongoDB or auth)
 * @param {string} params.name - Display name of user
 * @param {string} [params.avatar] - User avatar URL
 * @param {string} params.sfuRoomName - Name of the target SFU room
 * @param {boolean} [params.canPublish=true] - Permission to publish audio/video/screen
 * @param {boolean} [params.canSubscribe=true] - Permission to receive other participants' tracks
 * @param {boolean} [params.canPublishData=true] - Permission to send real-time data packets
 * @param {string|number} [params.ttl='15m'] - Token expiration duration (default: 15 minutes)
 * @returns {Promise<{ token: string, sfuUrl: string, sfuRoomName: string }>}
 */
const generateCallToken = async ({
  identity,
  name,
  avatar = '',
  sfuRoomName,
  canPublish = true,
  canSubscribe = true,
  canPublishData = true,
  ttl = '15m'
}) => {
  const { url, apiKey, apiSecret } = getLiveKitConfig();

  if (LiveKitSDK && LiveKitSDK.AccessToken) {
    try {
      const at = new LiveKitSDK.AccessToken(apiKey, apiSecret, {
        identity: String(identity),
        name: String(name || 'Participant'),
        metadata: JSON.stringify({ avatar: avatar || '' }),
        ttl
      });

      at.addGrant({
        roomJoin: true,
        room: String(sfuRoomName),
        canPublish: Boolean(canPublish),
        canSubscribe: Boolean(canSubscribe),
        canPublishData: Boolean(canPublishData)
      });

      const token = await at.toJwt();
      return {
        token,
        sfuUrl: url,
        sfuRoomName
      };
    } catch (err) {
      logger.error(`[LiveKit] SDK token generation error: ${err.message}, using fallback engine`);
    }
  }

  // Standalone JWT Engine (100% compliant with LiveKit JWT claim specification)
  // Generates short-lived (15 min) tamper-proof access tokens
  const nowInSeconds = Math.floor(Date.now() / 1000);
  const durationSeconds = typeof ttl === 'number' ? ttl : 15 * 60; // default 15 minutes

  const payload = {
    iss: apiKey,
    sub: String(identity),
    nbf: nowInSeconds,
    exp: nowInSeconds + durationSeconds,
    name: String(name || 'Participant'),
    metadata: JSON.stringify({ avatar: avatar || '' }),
    video: {
      room: String(sfuRoomName),
      roomJoin: true,
      canPublish: Boolean(canPublish),
      canSubscribe: Boolean(canSubscribe),
      canPublishData: Boolean(canPublishData)
    }
  };

  const token = jwt.sign(payload, apiSecret, {
    algorithm: 'HS256'
  });

  return {
    token,
    sfuUrl: url,
    sfuRoomName
  };
};

module.exports = {
  getLiveKitConfig,
  generateCallToken
};
