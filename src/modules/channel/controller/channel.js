const slugify = require('slugify')

const Channel = require("../model/channel")

const createSlug = (name) => {
    return slugify(name, {
        replacement: '-',
        remove: undefined,
        lower: false,
        strict: false,
        locale: 'vi',
        trim: true
    })
}

const create = async (req, res) => {
    try {
        const { name, ...data } = req.body;
        if (!name) {
            res.status(400).json({
                success: false,
                message: "Missing field name"
            })
        }
        const slug = createSlug(name);
        const record = new Channel({
            name,
            slug,
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

const list = async (req, res) => {
    try {
        let rows = await Channel.find({ is_delete: false }).sort({created_at: -1});
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

const all = async () => {
    try {
        const data = await Channel.find({ is_delete: false }).sort({created_at: -1});
        return data;
    } catch (error) {
        console.log(error)
        res.status(500).json({
            success: false,
            message: "internal server error"
        })
    }
}

const detail = async (req, res) => {
    try {
        const { id } = req.body;
        let rows = await Channel.findOne({ id, is_delete: false });
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

const updateChannel = async (req, res) => {
    try {
        const { id, name, ...data } = req.body;
        if (name) {
            data.slug = createSlug(name);
        }
        let rows = await Channel.findOneAndUpdate(
            { 
                _id: id 
            }, 
            { 
                name,
                ...data ,
                updated_at: new Date()
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

const deleteChannel = async (req, res) => {
    try {
        const { id } = req.body;
        let rows = await Channel.findOneAndUpdate(
            { 
                _id: id 
            }, {
                is_delete: true,
                updated_at: new Date()
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
    list,
    updateChannel,
    deleteChannel,
    detail,
    all
}