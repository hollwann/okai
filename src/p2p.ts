import Peer, { DataConnection } from 'peerjs'
import xs, { Listener, Stream } from 'xstream'

const initLocalPeer = (id: string) => {
  const peer = new Peer(id, {
    host: 'localhost',
    port: 9000,
    path: '/myapp'
  })
  peer.on('open', id => {
    console.log('Connected with id: ', id)
  })
  return peer
}

const connectToPeer = (peer: Peer, peerId: string) => {
  const conn = peer.connect(peerId)
  return xs.create({
    start: (listener: Listener<Peer.DataConnection>) => {
      conn.on('open', () => listener.next(conn))
      conn.on('error', listener.error)
      conn.on('close', () => listener.complete())
    },
    stop: () => conn.close()
  })
}

const getPeerConnections = (peer: Peer) =>
  xs.create({
    start: (listener: Listener<DataConnection>) => {
      peer.on('connection', conn => listener.next(conn))
    },
    stop: () => 1
  })

const getConnectionData = (conn: DataConnection) =>
  xs.create({
    start: (listener: Listener<string>) => {
      conn.on('data', (data: string) => listener.next(data))
    },
    stop: () => 1
  })

const sendConnectionData = (conn: DataConnection, data: string) =>
  conn.send(data)

export {
  initLocalPeer,
  connectToPeer,
  getPeerConnections,
  getConnectionData,
  sendConnectionData
}
