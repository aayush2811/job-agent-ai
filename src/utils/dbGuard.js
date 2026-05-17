const { isMongoConnected } = require("../database/db");

function requireMongo(res) {
  if (isMongoConnected()) {
    return true;
  }
  return false;
}

module.exports = {
  isDbReady: isMongoConnected,
  requireMongo,
};
