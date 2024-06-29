const producerService = require('../producer/index')
const transportService = require('../transport')

async function main(router, peers, socket) {
    
    socket.on('transport-recv-connect', async ({ dtlsParameters }) => {
        const consumerTransport = transportService.getRTCTranport(socket.id);
        await consumerTransport.connect({ dtlsParameters });
    })

    socket.on('consume', async ({ rtpCapabilities, channelId }, callback) => {
        try {
            if (!channelId) {
                return;
            }
            socket.join(channelId);
            let producerWrapper = producerService.getProducer(channelId)
            if (!producerWrapper) {
                peers.emit("error-event", "Do not have stream source")
                return
            }
            let producer = producerService.getProducer(channelId).producer;

            if (!producer) {
                throw new Error(`Cannot find producer for channel ${channelId}`)
            }
            if (router.canConsume({
                producerId: producer.id,
                rtpCapabilities
            })) {
                const consumerTransport = transportService.getRTCTranport(socket.id);
                await consumerTransport.setMaxOutgoingBitrate(30000)
                const consumer = await consumerTransport.consume({
                    producerId: producer.id,
                    rtpCapabilities,
                    paused: true,
                })
                await consumer.setPreferredLayers({ spatialLayer: 10 });

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
}

module.exports = {
    main,
};