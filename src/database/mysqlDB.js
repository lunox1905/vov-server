const mysql = require('mysql2/promise');
require("dotenv").config()
    let database = ""
    if (process.env.NODE_ENV == "development") {
        database= process.env.MYSQL_DB_DEV
    }
    else {
        database=process.env.MYSQL_DB_PROD
}
let connection
const mysqlConnect = async () => {
    connection= mysql.createConnection({
        host: process.env.MYSQL_HOST,
        user: process.env.MYSQL_USER,
        password: process.env.MYSQL_PASSWORD,
        database: database,
        
    });
    return connection
}
mysqlConnect().then()
module.exports = {
    connection,
    mysqlConnect
}