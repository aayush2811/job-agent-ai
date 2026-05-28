const express = require("express");
const asyncHandler = require("../middleware/asyncHandler");
const authController = require("./auth.controller");
const { requireAuth } = require("./auth.middleware");

const router = express.Router();

router.post("/signup", asyncHandler(authController.signup));
router.post("/login", asyncHandler(authController.login));
router.post("/demo-login", asyncHandler(authController.demoLogin));
router.post("/refresh", asyncHandler(authController.refresh));
router.post("/logout", asyncHandler(authController.logout));
router.get("/me", requireAuth, asyncHandler(authController.me));

module.exports = router;
