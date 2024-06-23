const { io } = require("../stream/socket")
const {createNoti}=require("../notification/controller/noti")
const emitNoti = (data) => { 
    if (!io) {
        return {
            error: True,
            message: "io server is not up"
        }
    }
    io.emit("noti", data)
    createNoti(data)
}
module.exports = {
    emitNoti
}