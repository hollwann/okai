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

type Message = {
  from: string
  to: string
  data: string
}

export const initRouter = (localId: string, messages: Stream<Message>) => {
  const seeds = ['hollwann'] as string[]
  const localPeer = initLocalPeer(localId)
  const seedsConnections = xs
    .fromArray(seeds.map(id => connectToPeer(localPeer, id)))
    .flatten()
  const newConnections = xs.never() as Stream<DataConnection>
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

  const messageToSend = messages.compose(sampleCombine(activeConnections)).debug()
  messageToSend.addListener({
    next: ([message, conns]) => {
      const messageFormatted = {
        to: message.to,
        data: message.data,
        from: localId
      }
      const toConnection = conns.find(conn => conn.peer == message.to)
      if (toConnection)
        sendConnectionData(toConnection, JSON.stringify(messageFormatted))
    }
  })

  const receivedMessages = connections
    .map(getConnectionData)
    .flatten()
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

  return messagesToDecrypt
}
