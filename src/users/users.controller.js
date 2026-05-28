const usersService = require("./users.service");
const { sanitizeUser } = require("../auth/auth.service");

function sendError(res, err) {
  res.status(err.statusCode || 500).json({
    success: false,
    message: err.message || "Request failed",
    data: null,
  });
}

async function getSettings(req, res) {
  try {
    const data = await usersService.getSettings(req.user.id);
    res.json({ success: true, message: "Settings", data });
  } catch (err) {
    sendError(res, err);
  }
}

async function patchOnboarding(req, res) {
  try {
    const user = await usersService.updateOnboarding(req.user.id, req.body);
    res.json({
      success: true,
      message: "Onboarding updated",
      data: { user: sanitizeUser(user) },
    });
  } catch (err) {
    sendError(res, err);
  }
}

async function patchProfile(req, res) {
  try {
    const user = await usersService.updateProfile(req.user.id, req.body);
    res.json({
      success: true,
      message: "Profile updated",
      data: { user: sanitizeUser(user) },
    });
  } catch (err) {
    sendError(res, err);
  }
}

module.exports = { getSettings, patchOnboarding, patchProfile };
