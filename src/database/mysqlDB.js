const mysql = require('mysql2/promise');
require("dotenv").config()
    let database = ""
    if (process.env.NODE_ENV == "development") {
        database= process.env.MYSQL_DB_DEV
    }
    else {
        database=process.env.MYSQL_DB_PROD
}
// let connection
const mysqlConnect = async () => {
    
  const  connection= mysql.createConnection({
        host: process.env.MYSQL_HOST,
        user: process.env.MYSQL_USER,
        password: process.env.MYSQL_PASSWORD,
        database: database,
        
    });
    console.log('Connected to the mysql.');
    return connection
}
module.exports = {
    // connection,
    mysqlConnect
}