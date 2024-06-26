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
module.exports = {
    mediaCodecs
}