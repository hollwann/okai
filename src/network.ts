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

const createNewconnections = (
  activeConnections: Stream<Peer.DataConnection[]>,
  peersInNetwork: Stream<string[]>,
  localPeer: Peer
): Stream<Peer.DataConnection> => {
  const maxActive = activeConnections.filter(conns => conns.length < 128)
  return xs
    .combine(peersInNetwork, maxActive)
    .map(([peers, conns]) => {
      const activeIds = conns.map(conn => conn.peer)
      const peersWithoutConnection = peers.filter(id => !activeIds.includes(id))

      const maxNewConnections = 128 - conns.length
      return xs.merge(
        ...peersWithoutConnection
          .slice(0, maxNewConnections)
          .map(id => connectToPeer(localPeer, id))
      )
    })
    .flatten()
}

const getSeedConnections = (localPeer: Peer) => {
  const seeds = ['hollwann']
  return xs.merge(...seeds.map(id => connectToPeer(localPeer, id)))
}

export const initNetwork = (
  localId: string,
  messages: Stream<Message>,
  peersInNetwork: Stream<string>
) => {
  const localPeer = initLocalPeer(localId)

  const seedsConnections = getSeedConnections(localPeer)

  const activeConnectionsProxy = xs.create() as Stream<Peer.DataConnection[]>
  const newConnections = peersInNetwork
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
  activeConnectionsProxy.imitate(xs.merge(activeConnections))

  const messageToSend = messages
    .compose(sampleCombine(activeConnections))
    .debug()

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

  return messagesToDecrypt
}
