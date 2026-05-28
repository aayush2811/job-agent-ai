const express = require("express");
const asyncHandler = require("../middleware/asyncHandler");
const telegramController = require("./telegram.controller");

const router = express.Router();

router.get("/status", asyncHandler(telegramController.getStatus));
router.post("/test", asyncHandler(telegramController.postTest));

module.exports = router;
