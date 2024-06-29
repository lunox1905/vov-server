const Setting = require("../model/setting")

const create = async (req, res) => {
    try {
        const { ...data } = req.body;     
        const record = new Setting({
            ...data
        })
        const saveRecord = await record.save()
        res.status(200).json({
            data: saveRecord
        })
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "internal server error"
        })
    }
}

const detail = async (req, res) => {
    try {
        let rows = await Setting.findOne({})        
        res.status(200).json({
            data: rows
        })
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "internal server error"
        })
    }
}

const info = async (req, res) => {
    try {
        let rows = await Setting.findOne({})        
        return rows;
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "internal server error"
        })
    }
}

const update = async (req, res) => {
    try {
        const { id, ...data } = req.body;
       
        let rows = await Setting.updateMany(
            { 
                ...data,
            })
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
    create,
    update,
    detail,
    info
}