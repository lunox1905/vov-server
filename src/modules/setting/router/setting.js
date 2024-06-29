const express = require('express');

const ChannelControler = require("../controller/setting");

const router = express.Router();
router.post("/create", ChannelControler.create);
router.get("/detail", ChannelControler.detail);
router.put("/update", ChannelControler.update);

module.exports = router