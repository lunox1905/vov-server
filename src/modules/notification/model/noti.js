const mongoose = require('mongoose')
const notiSchema = new mongoose.Schema({
    level:{type:String,required:true},
    title: { type: String, required: true },
    content: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }

})
module.exports=mongoose.model('Noti',notiSchema)