const express = require('express');
const https = require('httpolyglot');
const fs = require('fs');
const path = require('path');
const cors = require("cors");
const bodyParser = require('body-parser');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const app = express();
const authRouter = require('./modules/auth/authRouter');
const logRouter=require('./modules/notification/router/noti')
const { hlsPlay } = require("./hlsPlay")
const {mysqlConnect}=require("./database/mysqlDB")
const { startDBConnection, closeDBConnection } = require("./database/mongoDB")
const {initIOServer}=require("../src/modules/stream/socket")
app.use(cors("*"))
app.use(bodyParser.json());
async function main ()  {
  
  // await startDBConnection()
  await mysqlConnect()
}
main()
const options = {
  key: fs.readFileSync('./ssl/key.pem', 'utf-8'),
  cert: fs.readFileSync('./ssl/cert.pem', 'utf-8')
}
const httpsServer = https.createServer(options, app)
const PORT = process.env.PORT;
initIOServer(httpsServer)
app.get("/", (req, res) => {
  res.send("hello")
})
app.use("/auth", authRouter)
app.use('/playhls', hlsPlay)
app.use('/logs',logRouter)
httpsServer.listen(PORT, () => {
  console.log('listening on port: ' + PORT)
})