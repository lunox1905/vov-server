const Noti = require("../model/noti")
const createLog = async (data) => {
    try {
        const { has_read, title, content, level } = data
        console.log(has_read,"- ", title,"-",content,"-",level)
        if (has_read==null || title==null || content==null || level==null) {
            throw new Error(`Missing field, require has_read, title, content, level but receive ${has_read} , ${title}, ${content}, ${level}`)
        }
        const record = new Noti({
            has_read: has_read,
            title: title,
            content: content,
            level:level
        })
        const saveRecord=await record.save()
        return saveRecord
    } catch (error) {
        console.log(error)
    }
}
const fetchLogs = async (req, res) => {
    try {
        let rows = await Noti.find({})
        rows.sort((a, b) => new Date(a.created_time) - new Date(b.created_time) );
       rows.reverse()
        res.status(200).json({
            data: rows
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
    createLog
}