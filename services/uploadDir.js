'use strict';

const path = require('path');

function getUploadsDir() {
  if (process.env.UPLOADS_DIR) return process.env.UPLOADS_DIR;

  if (process.env.HOME) {
    return path.join(process.env.HOME, 'site', 'uploads');
  }

  return path.join(__dirname, '..', 'uploads');
}

module.exports = { getUploadsDir };
