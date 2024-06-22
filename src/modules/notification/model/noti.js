const mongoose = require('mongoose')
const {mysqlConnect,connection}= require('../../../database/mysqlDB');
async function insertLog(data) {
    let connection = await mysqlConnect();
    const { has_read, title, content, level }=data
    const query = 'INSERT INTO log (has_read, title, content, level) VALUES (?, ?, ?, ?)';
    const [result] = await connection.query(query, [has_read, title, content, level]);
    return result.insertId;
}

// Function to get all log entries
async function getLogs() {
   let  connection = await mysqlConnect();
    const query = 'SELECT * FROM log';
    const [rows] = await connection.query(query);
    return rows;
}
async function deleteLog(logID) {
    let connection = await mysqlConnect();
    const query = `DELETE FROM log WHERE id = ${logID};`
    const [result] = await connection.query(query);
    return result
}

// Export the functions
module.exports = {
    insertLog,
    getLogs,
    deleteLog
};
// const notiSchema = new mongoose.Schema({
//     level:{type:String,required:true},
//     title: { type: String, required: true },
//     content: { type: String, required: true },
//     createdAt: { type: Date, default: Date.now }

// })
// module.exports=mongoose.model('Noti',notiSchema)