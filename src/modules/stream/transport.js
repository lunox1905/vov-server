let webRTCTransport = []

const createPlainTranport = async (router) => {

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

const createWebRtcTransport = async (router, callback) => {
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

const RTCTranport = () => {
    return webRTCTransport
}

const getRTCTranport = (id) => {
    return webRTCTransport.find(item => item.id == id).consumerTransport;
}

const addRTCTranport = (id, consumerTransport) => {
    const existsIndex = webRTCTransport.findIndex(item => item.id === id);
    if (existsIndex !== -1) {
        webRTCTransport[existsIndex].consumerTransport = consumerTransport;
    } else {
        webRTCTransport.push({
            consumerTransport,
            id
        })
    }
}

const deleteRTCTranport = (id) => {
    webRTCTransport = webRTCTransport.filter(item => item.id === id);
}

module.exports = {
    createPlainTranport,
    createWebRtcTransport,
    RTCTranport,
    getRTCTranport,
    addRTCTranport,
    deleteRTCTranport
};