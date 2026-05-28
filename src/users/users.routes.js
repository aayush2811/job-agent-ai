const express = require("express");
const asyncHandler = require("../middleware/asyncHandler");
const usersController = require("./users.controller");

const router = express.Router();

router.get("/settings", asyncHandler(usersController.getSettings));
router.get("/me", asyncHandler(usersController.getSettings));
router.patch("/onboarding", asyncHandler(usersController.patchOnboarding));
router.patch("/profile", asyncHandler(usersController.patchProfile));

module.exports = router;
