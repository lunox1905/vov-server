const mongoose = require('mongoose')
// Export the functions
const settingSchema = new mongoose.Schema({
    streamSwitchTime: {
        type: Number,
        required: true,
    },
    created_at: {
        type: Date,
        default: Date.now
    }
})
module.exports = mongoose.model('Setting',settingSchema)
