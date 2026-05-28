const bcrypt = require("bcryptjs");

const ROUNDS = parseInt(process.env.BCRYPT_ROUNDS || "12", 10);

async function hashPassword(plain) {
  return bcrypt.hash(plain, ROUNDS);
}

async function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

module.exports = { hashPassword, verifyPassword };
