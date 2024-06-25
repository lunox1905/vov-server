const https = require('httpolyglot');
const { Server } = require('socket.io');
const mediasoup = require('mediasoup');
const slugify = require('slugify')
require('dotenv').config();
const config = require('../../config');
const FFmpeg = require('../../ffmpeg');
const direcLink = require('../../directLink')
const managerProducers = require('../../managerProducers')
const { getPort } = require('../../port');
const { createNoti } = require("../notification/controller/noti")
const {insertLog,getLogs}= require("../notification/model/noti")
console.log("host ip",process.env.HOST_IP)
let io
    const emitNoti = (data) => {
        if (!io) {
            return {
                error: True,
                message: "io server is not up"
            }
        }
        io.emit("noti", data)
        createNoti(data)
    }
const initIOServer = (httpsServer) => {    
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
    let producers = new Map()
    const peer = {};
    let webRTCTransport = []
    let processWriteHLS = {};
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
                announcedIp: process.env.HOST_IP,
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
        if (!producers.has(channelName) || producers.get(channelName).length == 0) {
            return null
        }
        const listProducer = producers.get(channelName)
        return listProducer.find(item => item.isActive === true);
    }

    const getProducerList = (channelName) => {
        if (!producers.has(channelName) || producers.get(channelName).length == 0) {
            return null
        }
        return producers.get(channelName)
    }

    const addProducer = (data) => {
        const listPro = producers.get(data.name);
        let isExits = false;
        for (let i = 0; i < listPro.length; i++) {
            if (listPro[i].uid === data.uid) {
                listPro[i] = data;
                isExits = true;
            }
        }
        if (!isExits) {
            producers.get(data.name).push(data)
        }
    }
    peers.on('connection', async socket => {
        socket.on('disconnect', () => {
            if (processWriteHLS[socket.id]) {
                processWriteHLS[socket.id].kill()
                delete processWriteHLS[socket.id]
            }
            webRTCTransport = webRTCTransport.filter(item => item.id === socket.id);
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
                }
            }
        })
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
                console.log("----------")
                let producerWrapper = getProducer(channelName)
                if (!producerWrapper) {
                    peers.emit("error-event", "Do not have stream source")
                    return
                }
                let producer = getProducer(channelName).producer;
            
                if (!producer) {
                    throw new Error(`Cannot find producer for channel ${channelName}`)
                }
                if (router.canConsume({
                    producerId: producer.id,
                    rtpCapabilities
                })) {
                    console.log("-----====-----")
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

        socket.on('create-producer', async (data, callback) => {
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
            if (!producers.has(data.name)) {
                producers.set(data.name, [])
            }
            let isMainInput = false;
            const slug = createSlug(data.name)
            if (!producers.has(data.name) || !producers.get(data.name).find(item => item.isActive === true)) {
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
            console.log("DD::", newData)
            addProducer(newData)
            callback(streamTransport.tuple.localPort)
        })

        socket.on("link-stream", async (data) => {
            const { producer, transport } = await direcLink(router, data)
            if (!producers.has(data.name)) {
                producers.set(data.name, [])
            }
            let isMainInput = false;
            if (!producers.has(data.name) || producers.get(data.name).length === 0) {
                isMainInput = true;
            }
            const slug = createSlug(data.name)
            producers.get(data.name).push(
                {
                    slug,
                    name: data.name,
                    id: producer.id,
                    note: data.note,
                    producer: producer,
                    transport,
                    port: transport.tuple.localPort,
                    isActive: true,
                    isMainInput,
                }
            )
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
                    console.log("Emit noti ", item.name)
                    // emitNoti({
                    //     level: "medium",
                    //     title: "producer is deleted",
                    //     content: ` producer ${item.name} is deleted`

                    // })
                    insertLog({
                            has_read:false,
                            level: "warning",
                            title: "producer is deleted",
                            content: ` producer ${item.name} is deleted`
                     })
                }
                if (item.producer && item.isActive === true) {
                    promises.push(item.producer.getStats().then(stats => {
                        if (!stats || stats[0]?.bitrate === 0) {
                            insertLog({
                                has_read:false,
                                level: "warning",
                                title: "producer is disconneced",
                                content: ` producer ${item.name} is disconnected`
                            })
                            peers.emit("new-noti")
                            item.isActive = false;
                            producerFails.push({ name: item.name, slug: item.slug, id: item.id })
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
                    })
                }
                if (producerFails.length > 0) {
                    producerFails.forEach(async item => {
                        const data = getProducer(item.name)
                        const list_producer = getProducerList(item.name)
                        const pro = list_producer.find(producer => producer.id === item.id)
                        await pro.producer.close();
                        await pro.transport.close();
                        if (data) {
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
                        announcedIp: process.env.HOST_IP,
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

}
module.exports = {
    initIOServer,
    io,
    emitNoti
}