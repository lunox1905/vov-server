const mongoose = require('mongoose')
// Export the functions
const notiSchema = new mongoose.Schema({
    has_read: {
        type: Boolean,
        required: true,
        default: false,
    },
    title: {
        type: String,
        required: true,
        maxlength: 255
    },
    content: {
        type: String,
        required: true
    },
    level: {
        type: String,
        enum: ['info', 'warning', 'error'],
        required: true
    },
    created_at: {
        type: Date,
        default: Date.now
    }
})
module.exports = mongoose.model('Noti',notiSchema)
