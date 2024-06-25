const { getLogs,deleteLog } = require("../model/noti")
const removeLog = async (req, res) => {
    try {
        const { id } = req.body 
        if (!id) {
            res.status(400).send({
                success: false,
                message:"id is empty"
            })
          throw new Error("Id is empty")  
        }
        const result = await deleteLog(id)
        res.status(201).send({
            success: true,
        })
    } catch (error) {
        console.log(error)
        res.status(500).send({
            success: false,
            message: "internal server error"
        })
    }
}
const fetchLogs = async (req, res) => {
    try {
        let rows =await getLogs()
        res.status(200).json({
            data:rows
        })
    } catch (error) {
        console.log(error)
        res.status(500).json({
            success: false,
            message: "internal server error"
        })
    }
}
module.exports = {
    fetchLogs,
    removeLog
}