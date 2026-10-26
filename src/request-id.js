const crypto = require('crypto');

function generateRequestId(prefix = 'req') {
  return `${prefix}_${crypto.randomBytes(4).toString('hex')}`;
}

module.exports = { generateRequestId };
