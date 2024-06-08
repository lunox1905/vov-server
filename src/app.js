const express = require('express');
const https = require('httpolyglot');
const fs = require('fs');
const path = require('path');
const cors = require("cors");
const { Server } = require('socket.io');
const mediasoup = require('mediasoup');
const slugify = require('slugify')
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const app = express();
const config = require('./config');
const FFmpeg = require('./ffmpeg');
const direcLink = require('./directLink')
const {
  getPort,
} = require('./port');
const { ppid } = require('process');
const managerProducers = require('./managerProducers')

app.use(cors("*"))
app.use('/play', express.static('../client/public'))
app.use('/webplay', express.static('../webclient/src'))


app.use('/playhls', (request, response) => {
  const url = request.url.substring(request.url.lastIndexOf('/') + 1);
  const base = path.basename(url, path.extname(url))
  const extractBase = base.substring(0, base.indexOf('-hls') + 4);
  let filePath = ""
  var filePathOption1 = path.resolve(`./files/hls/${base}/${url}`);
  var filePathOption2 = path.resolve(`./files/hls/${extractBase}/${url}`)
// console.log('option',filePathOption1,filePathOption2);
  if (fs.existsSync(filePathOption1)) {
    filePath = filePathOption1
  }
  else {
    filePath = filePathOption2
  }
  fs.readFile(filePath, function (error, content) {
    response.writeHead(200, { 'Access-Control-Allow-Origin': '*' });
    if (error) {
      console.log(error)
      if (error.code == 'ENOENT') {
          fs.readFile('./404.html', function (error, content) {
              response.end(content, 'utf-8');
          });
      }
      else {
          response.writeHead(500);
          response.end(' error: ' + error.code + ' ..\n');
          response.end();
      }
    }
    else {
      response.end(content, 'utf-8');
    }
  });
})

const options = {
  key: fs.readFileSync('./ssl/key.pem', 'utf-8'),
  cert: fs.readFileSync('./ssl/cert.pem', 'utf-8')
}
const httpsServer = https.createServer(options, app)
const PORT = process.env.PORT;
const HOST_IP = process.env.HOST_IP;
const BASE_URL=process.env.BASE_URL
httpsServer.listen(PORT, () => {
  console.log('listening on port: ' + PORT)
})

const io = new Server(httpsServer, {
  allowEIO3: true,
  cors: {
    origin: "*"
  }
})

const peers = io.of('/mediasoup')

let worker
let router
let producerTransport
let consumerTransport
let producers = new Map()
let uniqueStream = new Set()
let uniqueSlug=new Set()
let producerFails = new Set();
let consumers = []
const peer = {};
let webRTCTransport = []
let processWriteHLS = {};
let consumer;
let listPlayerHls = [];

const mediaCodecs = [
  {
    kind: 'audio',
    mimeType: 'audio/opus',
    preferredPayloadType: 111,
    clockRate: 48000,
    channels: 2,
    parameters: {
      minptime: 10,
      useinbandfec: 1,
    }
  },
  {
    kind: 'audio',
    mimeType: 'audio/opus',
    clockRate: 48000,
    payloadType: 101,
    channels: 2,
    parameters: { 'sprop-stereo': 1 },
    rtcpFeedback: [
      { type: 'transport-cc' },
    ],
  },
  {
    kind: 'video',
    mimeType: 'video/VP8',
    clockRate: 90000,
    parameters: {
      'x-google-start-bitrate': 1000,
    },
  },
]

managerProducers(peers, producers);

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

const createPlain = async () => {

  const streamTransport = await router.createPlainTransport({
    listenInfo: {
      protocol: "udp",
      ip: '0.0.0.0',
      announcedIp: HOST_IP,
      // port: 26000
    },
    rtcpMux: true,
    comedia: true,
  });

  return streamTransport;
}
router = createWorker()

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

const getProducer = (channelName) => {
  if (!producers.has(channelName) || producers.get(channelName).length==0) {
    return null
  }
  const listProducer = producers.get(channelName)
  return listProducer.find(item => item.isActive === true);
}

const getProducerList = (channelName) => {
  if (!producers.has(channelName) || producers.get(channelName).length==0) {
    return null
  }
  return producers.get(channelName)
}

const addProducer = (data) => {
  const listPro = producers.get(data.name);
  let isExits = false;
  for(let i = 0; i < listPro.length; i++) {
    if(listPro[i].uid === data.uid) {
      listPro[i] = data;
      isExits = true;
    } 
    if(listPro[i].isActive === false) {
      listPro[i].isMainInput = false;
    }
  }
  if(!isExits) {
    producers.get(data.name).push(data)
  }
}

peers.on('connection', async socket => {
  socket.on('disconnect', () => {
    if (processWriteHLS[socket.id]) {
      processWriteHLS[socket.id].kill()
      delete processWriteHLS[socket.id]
    }
    webRTCTransport = webRTCTransport.filter(item => item.id !== socket.id);
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

  socket.on('info-dashboard', (callback) => {
    const amountPlayerHls = listPlayerHls.length;
    const amountPlayerRTC = webRTCTransport.length;
    let amountChannel = 0;
    let amountStream = 0;
    for (let [key, value] of producers) {
      amountChannel += 1;
      amountStream += value.length;
    }
    callback({amountChannel, amountPlayerHls, amountPlayerRTC, amountStream})
  })

  socket.on('createWebRtcTransport', async ({ sender }, callback) => {
    console.log(`Is this a sender request? ${sender}`)
    if (sender) {
      producerSocketId = socket.id
      producerTransport = await createWebRtcTransport(callback)
    }
    else {
      consumerSocketId = socket.id
      consumerTransport = await createWebRtcTransport(callback)
      const existsIndex = webRTCTransport.findIndex(item => item.id === socket.id);
      if (existsIndex !== -1) {
        webRTCTransport[existsIndex].consumerTransport = consumerTransport;
      } else {
        webRTCTransport.push({
          consumerTransport,
          id: socket.id
        })
        console.log(webRTCTransport.length)
      }
    }
  })

  // socket.on('record', async () => {
  //   startRecord(peer)
  // })

  socket.on('transport-recv-connect', async ({ dtlsParameters }) => {
    const consumerTransport = webRTCTransport.find(item => item.id == socket.id).consumerTransport
    await consumerTransport.connect({ dtlsParameters })
  })

  socket.on('consume', async ({ rtpCapabilities, channelName }, callback) => {
    try {
      if (!channelName) {
        throw new Error(`Invalid channel:${channelName}`)
      }
      socket.join(channelName);
      let data = getProducer(channelName);
      if (!data) {
        throw new Error(`Cannot find producer for channel ${channelName}`)
      }
      const producer = data.producer;
      if (router.canConsume({
        producerId: producer.id,
        rtpCapabilities
      })) {
        const consumerTransport = webRTCTransport.find(item => item.id == socket.id).consumerTransport;
        const consumer = await consumerTransport.consume({
          producerId: producer.id,
          rtpCapabilities,
          paused: true,
        })

        const params = {
          id: consumer.id,
          producerId: producer.id,
          kind: consumer.kind,
          rtpParameters: consumer.rtpParameters,
        }
        await consumer.resume()
        callback({ params })
      }
    } catch (error) {
      console.log(error)
      callback({
        params: {
          error: error
        }
      })
    }
  })

  // socket.on('consumer-resume', async () => {
  //   console.log('consumer resume')

  // })
  socket.on('create-producer', async (data, callback) => {
    if (! data) {
      throw new Error ("Data is empty")
    }
    if (uniqueStream.has(data.slug)) {
      throw new Error (`Slug must be unique and not null : ${data.slug}`)
    }
    
    const streamTransport = await createPlain();
    const producer = await streamTransport.produce({
      kind: 'audio',
      rtpParameters: {
        codecs: [{
          mimeType: 'audio/opus',
          clockRate: 48000,
          payloadType: 101,
          channels: 2,
          parameters: { 'sprop-stereo': 1 },
          rtcpFeedback: [
            { type: 'transport-cc' },
          ],
        }],
        encodings: [{ ssrc: 11111111 }],
      },
      appData: {},
    });
    // const isPlay = producers.find(item => item.slug === data.slug) 
    // const existsIndex = producers.findIndex(item => item.id === data.id);
    // if (existsIndex !== -1) {
    //     producers[existsIndex].producer = producer;
    // } else {
    //   producers.push({ channelName: data.channelName, slug: data.slug, id: data.id, producer });
    // }
    if (!producers.has(data.name)) {
      producers.set(data.name, [])
    }
    let isMainInput = false;
    const slug = createSlug(data.name)
    if(!producers.has(data.name) || !producers.get(data.name).find(item => item.isActive === true)) {
      startRecord(producer, slug, socket.id)
      isMainInput = true;
    }
    const newData = {
      slug: slug,
      name: data.name,
      id: producer.id,
      uid: data.uid,
      producer: producer,
      note: data.note,
      transport: streamTransport,
      port: streamTransport.tuple.localPort,
      isActive: true,
      isMainInput
    }
    addProducer(newData)
    callback(streamTransport.tuple.localPort)
  })

  socket.on("link-stream", async (data) => {
    const { producer, transport } = await direcLink(router, data)
    if (!producers.has(data.name)) {
      producers.set(data.name, [])
    }
    let isMainInput = false;
    if (!producers.has(data.name) || !producers.get(data.name).find(item => item.isActive === true)) {
      isMainInput = true;
    }
    const slug = createSlug(data.name)
    producers.get(data.name).push(
      {
        slug,
        name: data.name,
        id: producer.id,
        note: data.note,
        uid: data.uid,
        producer: producer,
        transport,
        port: transport.tuple.localPort,
        isActive: true,
        isMainInput,
      }
    )
    peers.to('admin').emit('add-channel-directlink-success')
  })
  socket.on("req_hls_link", data => {
    const baseHLS = `${BASE_URL}/playhls`
    if (!data.channel) {
      console.log('Error require channel value , got', data.channel);
      return
    }
    // console.log("prods",producers)
    if (!producers.has(data.channel)||!producers.get(data.channel).length)
    {
      console.log("Producer is not available")
      return
    }
    const folder = createSlug(data.channel);
    const hlsPath= path.resolve(`./files/hls/${folder}-hls`)
    if (!fs.existsSync(hlsPath)) {
      console.log('Error,cannot find hls path');
    return
    } 
    socket.join(data.channel);
    listPlayerHls.push(socket.id)
    socket.emit("res_hls_link", {
      link: `${baseHLS}/${folder}-hls.m3u8`
    }) 
  })
  
})

setInterval(async () => {
  const promises = [];
  const producerFails = [];
  const producerDelete = [];
  for (let [key, value] of producers) {
    value.forEach(item => {
      if (item.isDelete === true) {
        producerDelete.push(item.name)
      }
      if (item.producer && item.isActive === true) {
        promises.push(item.producer.getStats().then(stats => {
          if (!stats ||stats[0]?.bitrate === 0) {
            item.isActive = false;
            producerFails.push({name: item.name, slug: item.slug, id: item.id})
            peers.to(item.name).emit('reconnect');
            if (consumerTransport && !consumerTransport.closed) {
              consumerTransport.close();
            }
          }
        }));
      }
    });
    producers.set(key, value);
  }
  Promise.all(promises)
  .then(() => {
    if (producerDelete.length > 0) {
      producerDelete.forEach(async item => {
        const list_producer = getProducerList(item)
        const pro = list_producer.find(item => item.isDelete === true)
        await pro.producer.close();
        await pro.transport.close();
        const newValue = list_producer.filter(data => data.isDelete !== true);
        producers.set(item, newValue);
        peers.to('admin').emit('emit-delete-producer-sucess')
      })
    }
    if(producerFails.length > 0) {
      producerFails.forEach(async item => {
        const data = getProducer(item.name)
        const list_producer = getProducerList(item.name)
        const pro = list_producer.find(producer => producer.id === item.id)
        await pro.producer.close();
        await pro.transport.close();
        
        let hasChange = false;
        for (let i = 0; i < list_producer.length; i++) {
          if(list_producer[i].isActive === true && hasChange === false) {
            list_producer[i].isMainInput = true;
            hasChange = true;
          } else {
            list_producer[i].isMainInput = false;
          }
        }
        producers.set(item.name, list_producer);
        if(data) {
          startRecord(data.producer, item.slug, data.socketId)
        }
      })
    }
  })
}, 1000)
 
const createWebRtcTransport = async (callback) => {
  try {
    const webRtcTransport_options = {
      listenIps: [
        {
          ip: '0.0.0.0',
          announcedIp: HOST_IP,
        }
      ],
      enableUdp: true,
      enableTcp: true,
      preferUdp: true,
    }
    let transport = await router.createWebRtcTransport(webRtcTransport_options);
    transport.on('dtlsstatechange', dtlsState => {
      if (dtlsState === 'closed') {
        transport.close()
      }
    })

    transport.on('close', () => {
      console.log('transport closed')
    })

    callback({
      params: {
        id: transport.id,
        iceParameters: transport.iceParameters,
        iceCandidates: transport.iceCandidates,
        dtlsParameters: transport.dtlsParameters,
      }
    })
    return transport;
  } catch (error) {
    console.log(error)
    callback({
      params: {
        error: error
      }
    })
  }
}

const startRecord = async (producer, channelSlug, socketId) => {
  let recordInfo = await publishProducerRtpStream(producer);
  recordInfo.fileName = channelSlug + "-hls";
  const options = {
    "rtpParameters": recordInfo,
    "format": "hls"
  }
  processWriteHLS[socketId] = new FFmpeg(options);
}

const publishProducerRtpStream = async (producer) => {
  const rtpTransportConfig = config.plainRtpTransport;
  const rtpTransport = await router.createPlainTransport(rtpTransportConfig)
  const remoteRtpPort = await getPort();

  let remoteRtcpPort;
  if (!rtpTransportConfig.rtcpMux) {
    remoteRtcpPort = await getPort();
  }

  await rtpTransport.connect({
    ip: '127.0.0.1',
    port: remoteRtpPort,
    rtcpPort: remoteRtcpPort
  });

  const codecs = [];
  const routerCodec = router.rtpCapabilities.codecs.find(
    codec => codec.kind === producer.kind
  );
  codecs.push(routerCodec);
  const rtpCapabilities = {
    codecs,
    rtcpFeedback: []
  };

  const rtpConsumer = await rtpTransport.consume({
    producerId: producer.id,
    rtpCapabilities,
    paused: true
  });

  setTimeout(async () => {
    rtpConsumer.resume();
    rtpConsumer.requestKeyFrame();
  }, 1000);

  return {
    remoteRtpPort,
    remoteRtcpPort,
    localRtcpPort: rtpTransport.rtcpTuple ? rtpTransport.rtcpTuple.localPort : undefined,
    rtpCapabilities,
    rtpParameters: rtpConsumer.rtpParameters
  };
};