const authService = require("./auth.service");

function sendError(res, err) {
  res.status(err.statusCode || 500).json({
    success: false,
    message: err.message || "Request failed",
    data: null,
  });
}

async function signup(req, res) {
  try {
    const data = await authService.signup(req.body);
    res.status(201).json({ success: true, message: "Account created", data });
  } catch (err) {
    sendError(res, err);
  }
}

async function login(req, res) {
  try {
    const data = await authService.login(req.body, req.headers["user-agent"]);
    res.json({ success: true, message: "Logged in", data });
  } catch (err) {
    sendError(res, err);
  }
}

async function refresh(req, res) {
  try {
    const token = req.body.refreshToken;
    const data = await authService.refresh(token);
    res.json({ success: true, message: "Token refreshed", data });
  } catch (err) {
    sendError(res, err);
  }
}

async function logout(req, res) {
  try {
    await authService.logout(req.body.refreshToken);
    res.json({ success: true, message: "Logged out", data: { ok: true } });
  } catch (err) {
    sendError(res, err);
  }
}

async function me(req, res) {
  try {
    const user = await authService.getMe(req.user.id);
    res.json({ success: true, message: "Profile", data: { user } });
  } catch (err) {
    sendError(res, err);
  }
}

async function demoLogin(req, res) {
  try {
    const data = await authService.demoLogin(req.headers["user-agent"]);
    res.json({ success: true, message: "Logged in as demo user", data });
  } catch (err) {
    sendError(res, err);
  }
}

module.exports = { signup, login, refresh, logout, me, demoLogin };
