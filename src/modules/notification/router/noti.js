const express = require('express')
const {fetchLogs, checkNewNoti, readAll} = require("../controller/noti")
const router = express.Router();
router.get("/", fetchLogs)
router.get("/check-new-log", checkNewNoti)
router.post("/read-all", readAll)
// router.post("/delete",removeLog)
module.exports = router