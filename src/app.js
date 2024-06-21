const express = require('express');
const https = require('httpolyglot');
const fs = require('fs');
const path = require('path');
const cors = require("cors");
const bodyParser = require('body-parser');
const { Server } = require('socket.io');
const mediasoup = require('mediasoup');
const slugify = require('slugify')
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const app = express();
const config = require('./config');
const FFmpeg = require('./ffmpeg');
const direcLink = require('./directLink')
const authRouter = require('./modules/auth/authRouter');
const managerProducers = require('./managerProducers')
const { getPort } = require('./port');
const { hlsPlay } = require("./hlsPlay")
const { startDBConnection, closeDBConnection } = require("./db")
const {initIOServer}=require("../src/modules/stream/socket")
app.use(cors("*"))
app.use(bodyParser.json());
startDBConnection()
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
httpsServer.listen(PORT, () => {
  console.log('listening on port: ' + PORT)
})

