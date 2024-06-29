const slugify = require('slugify')
const path = require('path')

const { getPort } = require('./port');
const configProducer = require('../../../config/config_producer');
const transportService = require('../transport')
const FFmpeg = require('../hls_stream/write_file_hls');
const ConvertLink = require('./convert_link');
const { createLog } = require('../../notification/controller/noti');
const ChannelModel = require('../../channel/model/channel');

const producers = new Map();
let channels;
const BASE_URL = process.env.BASE_URL
async function initProducer() {
    channels = await ChannelModel.find({ is_delete: false }).sort({created_at: -1});
    for (let i = 0; i < channels.length; i++) {
        const channelId = channels[i]._id.toString();
        const exitsChannel = producers.has(channelId);
        if (!exitsChannel) {
            producers.set(channelId, [])
        }
    }
    console.log("prods",producers)
}
initProducer()
const processWriteHLS = {};

const getProducer = (channelId) => {
    if (!producers.has(channelId) || producers.get(channelId).length == 0) {
        return null
    }
    const listProducer = producers.get(channelId)
    return listProducer.find(item => item.isActive === true);
}

const getProducerList = (channelId) => {
    if (!producers.has(channelId) || producers.get(channelId).length == 0) {
        return null
    }
    return producers.get(channelId)
}

const addProducer = (data) => {
    const listPro = producers.get(data.channelId);
    let isExits = false;
    for (let i = 0; i < listPro.length; i++) {
        if (listPro[i].uid === data.uid) {
            listPro[i] = data;
            isExits = true;
        }
    }
    if (!isExits) {
        producers.get(data.channelId).push(data)
    }
}

const addNewChannel = ({id}) => {
    producers.set(id, [])
}

const deleteProducer = ({id}) => {
    producers.delete(id)
}

const countChanel = () => {
    let amountChannel = 0;
    let amountStream = 0;
    for (let [key, value] of producers) {
        amountChannel += 1;
        amountStream += value.length;
    }
    return { amountChannel, amountStream}
}

function checkProducerActivity(peers, router, streamSwitchTime) {
    const interval = setInterval(async () => {
        const promises = [];
        const producerFails = [];
        const producerDelete = [];
        for (let [key, value] of producers) {
            value.forEach(item =>  {
                if (item.isDelete === true) {
                    producerDelete.push(item.channelId)
                    const channelName = channels.find(item => item._id.toString() === key).name
                    const text = channelName ? ` trong kênh ${channelName}` : '';
                    createLog({
                            has_read:false,
                            level: "warning",
                            title: "producer is deleted",
                            content: `luồng phát ${item.id}${text} đã bị xóa`
                    })
                    peers.emit("new-noti")

                }
                if (item.producer && item.isActive === true) {
                    promises.push(item.producer.getStats().then(stats => {
                        if (!stats || stats[0]?.bitrate === 0) {
                            console.log(stats)
                            if(item.sourch === 'link' && item.timeOut < 5) {
                                item.timeOut += 1;
                                return;
                            }
                            const channelName = channels.find(item => item._id.toString() === key).name
                            const text = channelName ? ` trong kênh ${channelName}` : '';
                        createLog({
                                has_read:false,
                                level: "warning",
                                title: "producer is disconneced",
                                content: `luồng phát ${item.id}${text} mất kết nối`
                            })
                            peers.emit("new-noti")
                            item.isActive = false;
                            producerFails.push({ name: item.name, channelId: item.channelId, slug: item.slug, id: item.id })
                            peers.to(item.channelId).emit('reconnect');
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
                        const list_producer = getProducerList(item);
                        if(list_producer) {
                            const pro = list_producer.find(item => item.isDelete === true)
                            await pro.producer.close();
                            await pro.transport.close();
                            const newValue = list_producer.filter(data => data.isDelete !== true);
                            producers.set(item, newValue);
                        }
                    })
                    peers.to('admin').emit('emit-delete-producer-sucess');
                }
                if (producerFails.length > 0) {
                    producerFails.forEach(async item => {
                        const data = getProducer(item.channelId)
                        const list_producer = getProducerList(item.channelId)
                        const pro = list_producer.find(producer => producer.id === item.id)
                        await pro.producer.close();
                        await pro.transport.close();
                        if (data) {
                            startRecord(router, data.producer, item.channelId, data.socketId)
                        }
                    })
                }
            })
    }, streamSwitchTime)

    return interval;
}
async function main (router, socket) {
    socket.on('create-producer', async (data, callback) => {
        const channels = await ChannelModel.find({ is_delete: false }).sort({created_at: -1});
        const exitsChannel = channels.find(item => item._id.toString() === data.channelId);
        if(!exitsChannel) {
            return;
        }
        const streamTransport = await transportService.createPlainTranport(router);
        // await streamTransport.setMaxOutgoingBitrate(30000)
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
        if (!producers.has(data.channelId)) {
            producers.set(data.channelId, [])
        }
        let isMainInput = false;
        if (!producers.has(data.channelId) || !producers.get(data.channelId).find(item => item.isActive === true)) {
            startRecord(router, producer, data.channelId, socket.id);
            isMainInput = true;
        }
        const newData = {
            channelId: data.channelId,
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

    socket.on('link-stream', async (data) => {
        const { producer, transport } = await direcLink(router, data)
        if (!producers.has(data.channelId)) {
            producers.set(data.channelId, [])
        }
        let isMainInput = false;
        if (!producers.has(data.channelId) || producers.get(data.channelId).length === 0) {
            isMainInput = true;
        }
        const newData = {
            channelId: data.channelId,
            name: data.name,
            id: producer.id,
            uid: socket.id,
            producer: producer,
            transport,
            port: transport.tuple.localPort,
            isActive: true,
            isMainInput,
            sourch: 'link',
            timeOut: 0
        }
        addProducer(newData)
        startRecord(router, producer, data.channelId, socket.id)
        socket.emit('add-directlink-success');
    })
    socket.on('list-producer', async () => {
        const results = [];
        socket.join('admin')
        const channels = await ChannelModel.find({ is_delete: false }).sort({created_at: -1});
        for (let [key, value] of producers) {
            const streams = [];
            value.forEach(item => {
                console.log("item",item)
              streams.push({
                name: item.name,
                id: item.id,
                uid: item.uid,
                note: item.note,
                port: item.port,
                isActive: item.isActive,
                isMainInput: item.isMainInput
              })
            });
            const channel = channels.find(item => item._id.toString() === key);
            results.push({
                name: channel.name,
                slug: channel.slug,
                id: key,
                streams
            })
        }
        socket.emit('emit-list-producer', results)
    })

    socket.on('delete-producer', async ({channelId, id}) => {
        const listProducer = getProducerList(channelId)
        if (listProducer) {
            const prod = listProducer.find(data => data.id === id);
            prod.isDelete = true; 
            const newProducer = listProducer.filter(data => data.id !== id);
            newProducer.push(prod)
            producers.set(channelId, newProducer);
        }
    })
}

const startRecord = async (router, producer, channelId, socketId) => {
    let recordInfo = await publishProducerRtpStream(router, producer);
    recordInfo.fileName = channelId + "-hls";
    const options = {
        "rtpParameters": recordInfo,
        "format": "hls"
    }
    processWriteHLS[socketId] = new FFmpeg(options);
}

const publishProducerRtpStream = async (router, producer) => {
    const rtpTransportConfig = configProducer.plainRtpTransport;
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

async function createProducerFormLink(transport, link) {
    new ConvertLink(
        {
            link: link,
            port: transport.tuple.localPort
        })
    const producer = await transport.produce({

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
    return producer
};

async function direcLink(router, data) {
    const transport = await transportService.createPlainTranport(router);
    const producer = await createProducerFormLink(transport, data.link);
    return { producer, transport }
};

const killProcessWriteHls = (id) => {
    if (processWriteHLS[id]) {
        processWriteHLS[id].kill()
        delete processWriteHLS[id]
    }
} 

module.exports = {
    main,
    getProducer,
    getProducerList,
    killProcessWriteHls,
    checkProducerActivity,
    countChanel,
    addNewChannel,
    deleteProducer
};