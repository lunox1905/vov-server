const {createLog}=require("./modules/notification/controller/noti")
class ProducerManager {
  constructor(peers, producers) {
    this.peers = peers;
    this.producers = producers;
    this.backUpProds = []
    peers.on('connection', async socket => {
      socket.on('list-producer', () => {
        this.emitListProducers(socket)
      })
      socket.on('delete-producer', this.deleteProducer)
    })
    this.healthCheck()
  }

  broadCastListProducers = () => {
    let results = this.getAllProducer()
    this.peers.emit('emit-list-producer', results)
  }
  emitListProducers = (socket) => {
   let results = this.getAllProducer()
    socket.emit('emit-list-producer', results)
  }

  getProducers = () => {
    return this.producers
  }
  deleteProducer = async ({ channelName, id }) => {
    const listProducer = this.getProducerByChannel(channelName)
    if (listProducer) {
      const prod = listProducer.find(data => data.id === id);
      prod.isDelete = true;
      const newProducer = listProducer.filter(data => data.id !== id);
      //  push deleted producer to the end of produdcers in the same channel, and marked as deleted
      newProducer.push(prod)
      producers.set(channelName, newProducer);
      socket.emit('emit-delete-producer-sucess')
    }
  }
  getBackUpProds = () => {
    return this.backUpProds
  }
  getAllProducer = () => {
    let results = [];
    for (let [key, value] of this.producers) {
      const streams = [];
      value.forEach(item => {
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
      results.push({
        name: key,
        streams
      })
    }
    return results
  }
  getProducerByChannel = (channelName) => {
    if (!this.producers.has(channelName) || this.producers.get(channelName).length == 0) {
      return null
    }
    return this.producers.get(channelName);
  }
  emitProducerList = (socket) => {
    const results = this.getAllProducer()
    socket.emit('emit-list-producer', results)
  }
  addProducer = (data) => {
    this.createChannelArrIfNotExist(data.name)
    const listPro = this.producers.get(data.name);
    let isExits = false;
    for (let i = 0; i < listPro.length; i++) {
      if (listPro[i].uid === data.uid) {
        listPro[i] = data;
        isExits = true;
      }
    }
    if (!isExits) {
      this.producers.get(data.name).push(data)
    }

    this.broadCastListProducers()
  }
  createChannelArrIfNotExist = (channelName) => {
    if (!this.producers.has(channelName)) {
      this.producers.set(channelName, [])
    }    
  }
  getProducerStats = () => {
    for (let [channelName, prodsByChan] of this.producers) { 
      prodsByChan.forEach(prod => {
        console.log(`Channel ${channelName} ${prod.isActive} `)
      })
    }
  }
  healthCheck = () => {
    setInterval(async () => {
      // this.getProducerStats()
      const promises = [];
      const producerFails = [];
      const producerDelete = [];
      for (let [channelName, prodsByChan] of this.producers) {
        prodsByChan.forEach(prod => {
          if (prod.isDelete === true) {
            producerDelete.push(prod.name)
            createLog({
              has_read: false,
              level: "warning",
              title: "producer is deleted",
              content: ` producer ${prod.name} is deleted`
            })
            this.peers.emit("new-noti")
            this.broadCastListProducers()


          }
          if (prod.producer && prod.isActive === true) {
            promises.push(prod.producer.getStats().then(stats => {
              if (!stats || stats[0]?.bitrate === 0) {
                console.log(`producer ${prod.name} is disconnected`)
                createLog({
                  has_read: false,
                  level: "warning",
                  title: "producer is disconneced",
                  content: ` producer ${prod.name} is disconnected`
                })
                this.peers.emit("new-noti")
                prod.isActive = false;
                this.broadCastListProducers()
                producerFails.push({ channelName: prod.name, slug: prod.slug, id: prod.id })
                this.peers.to(prod.name).emit('reconnect');

                // I have comment this line, check if there are any bugs  

                // if (consumerTransport && !consumerTransport.closed) {
                //   consumerTransport.close();
                // }
              }
            }));
          }
        });
        this.producers.set(channelName, prodsByChan);
      }

      Promise.all(promises)
        .then(() => {
          this.backUpProds=[]
          if (producerDelete.length > 0) {
            producerDelete.forEach(async channelName => {
              const list_producer = this.getProducerByChannel(channelName)
              const deletedProd = list_producer.find(item => item.isDelete === true)
              await deletedProd.producer.close();
              await deletedProd.transport.close();
              const updatedProds = list_producer.filter(prod => prod.isDelete !== true);
              this.producers.set(channelName, updatedProds);
            })
            
          }
          if (producerFails.length > 0) {
            producerFails.forEach(async item => {
              const activeProd = this.getActiveProds(item.channelName)
              const listProducer = this.getProducerByChannel(item.channelName)
              const failProd = listProducer.find(producer => producer.id === item.id)
              await failProd.producer.close();
              await failProd.transport.close();
              if (activeProd) {
                this.backUpProds.push( 
                  {
                    producer: activeProd.producer,
                    slug: item.slug,
                    socketId:activeProd.socketId
                  }
                )
              }
            })
          }

        

           
        })
    }, 1000)
  }

  getActiveProds = (channelName) => {
    if (!this.producers.has(channelName) || this.producers.get(channelName).length == 0) {
      return null
    }
    const listProducer = this.producers.get(channelName)
    return listProducer.find(item => item.isActive === true);
  }
}
module.exports = {
  ProducerManager
}