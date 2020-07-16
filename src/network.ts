import {
  initLocalPeer,
  getPeerConnections,
  getConnectionData,
  connectToPeer,
  sendConnectionData
} from './p2p'
import Peer, { DataConnection } from 'peerjs'
import xs, { Stream } from 'xstream'
import sampleCombine from 'xstream/extra/sampleCombine'
import flattenConcurrently from 'xstream/extra/flattenConcurrently'

type Message = {
  from: string
  to: string
  data: string
}

const getSeedConnections = (localPeer: Peer) => {
  const seeds = [] as string[]
  return xs.merge(...seeds.map(id => connectToPeer(localPeer, id)))
}

export const initNetwork = (
  localId: string,
  messages: Stream<Message>,
  newConnectionsId: Stream<string>
) => {
  const localPeer = initLocalPeer(localId)

  const seedsConnections = getSeedConnections(localPeer)

  const newConnections = newConnectionsId
    .map(id => connectToPeer(localPeer, id))
    .flatten()

  const connections = xs.merge(
    newConnections,
    getPeerConnections(localPeer),
    seedsConnections
  )
  const activeConnections = connections
    .fold(
      (conns: DataConnection[], conn) => [
        ...conns.filter(conn => conn.open),
        conn
      ],
      []
    )
    .debug('connections')

  const messageToSend = messages
    .compose(sampleCombine(activeConnections))
    .debug()

  messageToSend.addListener({
    next: ([message, conns]) => {
      const toConnection = conns.find(conn => conn.peer == message.to)
      if (toConnection)
        sendConnectionData(toConnection, JSON.stringify(message))
    }
  })

  const receivedMessages = connections
    .map(getConnectionData)
    .compose(flattenConcurrently)
    .map(JSON.parse) as Stream<Message>

  //messages to route
  const messagesToRoute = receivedMessages
    .filter(message => message.to != localId)
    .compose(sampleCombine(activeConnections))

  messagesToRoute.addListener({
    next: ([message, conns]) => {
      const toConnection = conns.find(conn => conn.peer == message.to)
      if (toConnection)
        sendConnectionData(toConnection, JSON.stringify(message))
    }
  })

  const messagesToDecrypt = receivedMessages.filter(
    message => message.to == localId
  )

  return { messagesToDecrypt }
}
