const { Server } = require('socket.io');
const mediasoup = require('mediasoup');
const slugify = require('slugify')
require('dotenv').config();
const config = require('../../config');
const FFmpeg = require('../../ffmpeg');
const direcLink = require('../../directLink')
const { ProducerManager } = require('../../managerProducers')
const { getPort } = require('../../port');
const { mediaCodecs } = require('./codecs')
let io
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

    const producerManager = new ProducerManager(peers, producers);

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
            producerManager.createChannelArrIfNotExist(data.name)
            
            let isMainInput = false;
            const slug = createSlug(data.name)
            if (!producerManager.getActiveProds()) {
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
            producerManager.addProducer(newData)
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
            producerManager.addProducer(
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
        const backUpProds = producerManager.getBackUpProds()
            
        if (backUpProds) {
            backUpProds.forEach(obj => {
                startRecord(obj.producer, obj.slug, obj.socketId)
            })
        }
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
}