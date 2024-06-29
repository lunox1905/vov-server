const { Server } = require('socket.io');
const mediasoup = require('mediasoup');
const slugify = require('slugify');
const fs = require('fs');
const path = require('path');


const config = require('../../config/config_producer')
const producerService = require('./producer/index')
const consumeService = require('./consumer/index')
const transportService = require('./transport')
const SettingControler = require('../setting/controller/setting');
require('dotenv').config();

const BASE_URL = process.env.BASE_URL

let listPlayerHls = [];
let io;
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
   
const initIOServer = async (httpsServer) => {    
     io = new Server(httpsServer, {
        allowEIO3: true,
        cors: {
            origin: "*"
        }
    })
    const peers = io.of('/mediasoup')
    let worker
    let router
    let consumerTransport
    let processWriteHLS = {};
    const mediaCodecs = config.mediaCodecs;
    const setting = await SettingControler.info();
    let streamSwitchTime
    if (!setting) {
        streamSwitchTime=2000
    }
    else {
         streamSwitchTime = Number(setting.streamSwitchTime) * 1000 ?? 2000;
    }

    const createWorker = async () => {
        worker = await mediasoup.createWorker({
            rtcMinPort: 20000,
            rtcMaxPort: 30000,
        })
        console.log(`worker pid ${worker.pid}`)

        worker.on('died', error => {
            console.error('mediasoup worker has died');
            setTimeout(() => process.exit(1), 2000);
        })
        router = await worker.createRouter({ mediaCodecs })
        return router
    }
    router = await createWorker()
    let checkProducerActivityInterval = producerService.checkProducerActivity(peers, router, streamSwitchTime);
    peers.on('connection', async socket => {
        socket.on('disconnect', () => {
            transportService.deleteRTCTranport(socket.id)
            listPlayerHls = listPlayerHls.filter(item => item !== socket.id)
            console.log('peer disconnected')
        })

        socket.on('createRoom', async (callback) => {
            if (router === undefined) {
                router = await worker.createRouter({ mediaCodecs })
                console.log(`Router ID: ${router.id}`)
            }

            getRtpCapabilities(callback)
        })

        const getRtpCapabilities = (callback) => {
            const rtpCapabilities = router.rtpCapabilities;
            callback({ rtpCapabilities })
        }

        socket.on('createWebRtcTransport', async ({ sender }, callback) => {
            if (sender) {
                producerSocketId = socket.id
                producerTransport = await transportService.createWebRtcTransport(router, callback)
            }
            else {
                consumerSocketId = socket.id
                consumerTransport = await transportService.createWebRtcTransport(router, callback)
                transportService.addRTCTranport(socket.id, consumerTransport)
            }
        })

        socket.on('req_hls_link', data => {
            const baseHLS = `${BASE_URL}/playhls`
            const folder = data.channelId;
            const hlsPath = path.resolve(`./files/hls/${folder}-hls`);
            if (!fs.existsSync(hlsPath)) {
              console.log('Error,cannot find hls path');
              return
            }
            socket.join(data.channelId);
            listPlayerHls.push(socket.id)
            socket.emit('res_hls_link', {
              link: `${baseHLS}/${folder}-hls.m3u8`
            })
        })
        
        socket.on('info-dashboard', (callback) => {
            const amountPlayerHls = listPlayerHls.length;
            const amountPlayerRTC = transportService.RTCTranport.length;
           
            const  { amountChannel, amountStream } = producerService.countChanel();
            
            callback({ amountChannel, amountPlayerHls, amountPlayerRTC, amountStream })
        })

        await producerService.main(router, socket);
        await consumeService.main(router, peers, socket);

        socket.on('update-stream-switch-time', (data) => {
            const time = Number(data.time) * 1000;
            clearInterval(checkProducerActivityInterval);
            checkProducerActivityInterval = producerService.checkProducerActivity(peers, router, time);
        })

    })
}
module.exports = {
    initIOServer,
    io,
}