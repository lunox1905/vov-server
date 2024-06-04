
const getProducer = (producers, channelName) => {
    if (!producers.has(channelName) || producers.get(channelName).length==0) {
      return null
    }
    return producers.get(channelName);
  }

async function managerProducers(peers, producers) {
    peers.on('connection', async socket => {

        socket.on('list-producer', () => {
            const results = [];
            for (let [key, value] of producers) {
                const streams = [];
                value.forEach(item => {
                  streams.push({
                    ...item
                  })
                });
                results.push({
                    name: key,
                    streams
                })
            }
            socket.emit('emit-list-producer', results)
        })

        socket.on('delete-producer', async ({name, id}) => {
            console.log(name)
            const listProducer = getProducer(producers, name)
            if (listProducer) {
                const prod = listProducer.find(data => data.id === id);
                prod.isDelete = true; 
                const newProducer = listProducer.filter(data => data.id !== id);
                newProducer.push(prod)
                producers.set(name, newProducer);
                socket.emit('emit-delete-producer-sucess')
            }
            
        })
    })
}

module.exports=managerProducers