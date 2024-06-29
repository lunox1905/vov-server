const express = require('express');

const ChannelControler = require("../controller/channel");

const router = express.Router();
router.post("/create", ChannelControler.create);
router.get("/detail", ChannelControler.detail);
router.get("/list", ChannelControler.list);
router.put("/update", ChannelControler.updateChannel);
router.post("/delete", ChannelControler.deleteChannel);

module.exports = router