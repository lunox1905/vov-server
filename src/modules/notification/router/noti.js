const express = require('express')
const {fetchLogs} = require("../controller/noti")
const router = express.Router();
router.get("/", fetchLogs)
// router.post("/delete",removeLog)
module.exports = router