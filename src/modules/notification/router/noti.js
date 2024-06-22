const express = require('express')
// const { getLogs } = require("../model/noti")
const {fetchLogs} = require("../controller/noti")
const router = express.Router();
router.get("/", fetchLogs)
router.post("/delete",removeLog)
module.exports = router