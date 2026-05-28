const mongoose = require("mongoose");

function toObjectId(userId) {
  if (!userId) return null;
  return mongoose.Types.ObjectId.isValid(String(userId))
    ? new mongoose.Types.ObjectId(String(userId))
    : null;
}

/** Mongo filter: resources owned by this user */
function ownedBy(userId) {
  const oid = toObjectId(userId);
  if (!oid) return { userId: null };
  return { userId: oid };
}

module.exports = { ownedBy, toObjectId };
