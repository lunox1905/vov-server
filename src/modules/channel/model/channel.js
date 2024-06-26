const mongoose = require('mongoose')
// Export the functions
const channelSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
    },
    slug: {
        type: String,
        required: true,
    },
    description: {
        type: String,
        required: false,
    },
    is_delete: {
        type: Boolean,
        default: false,
    },
    updated_at: {
        type: Date,
        default: Date.now
    },
    created_at: {
        type: Date,
        default: Date.now
    }
})
module.exports = mongoose.model('Channel',channelSchema)
