import { box, randomBytes } from 'tweetnacl'
import {
  decodeUTF8,
  encodeUTF8,
  encodeBase64,
  decodeBase64
} from 'tweetnacl-util'
import { initNetwork } from './network'
import xs, { Stream } from 'xstream'

const newNonce = () => randomBytes(box.nonceLength)
const generateKeyPair = () => box.keyPair()

const encrypt = (secretOrSharedKey: Uint8Array, json: any) => {
  const nonce = newNonce()
  const messageUint8 = decodeUTF8(JSON.stringify(json))
  const encrypted = box.after(messageUint8, nonce, secretOrSharedKey)

  const fullMessage = new Uint8Array(nonce.length + encrypted.length)
  fullMessage.set(nonce)
  fullMessage.set(encrypted, nonce.length)

  const base64FullMessage = encodeBase64(fullMessage)
  return base64FullMessage
}

const decrypt = (secretOrSharedKey: Uint8Array, messageWithNonce: string) => {
  const messageWithNonceAsUint8Array = decodeBase64(messageWithNonce)
  const nonce = messageWithNonceAsUint8Array.slice(0, box.nonceLength)
  const message = messageWithNonceAsUint8Array.slice(
    box.nonceLength,
    messageWithNonce.length
  )

  const decrypted = box.open.after(message, nonce, secretOrSharedKey)

  if (!decrypted) throw new Error('Could not decrypt message')

  const base64DecryptedMessage = encodeUTF8(decrypted)
  return JSON.parse(base64DecryptedMessage)
}
const decodeHexa = (hexString: string) =>
  new Uint8Array(hexString.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16)))

const encodeHexa = (bytes: Uint8Array) =>
  bytes.reduce((str, byte) => str + byte.toString(16).padStart(2, '0'), '')

export const initCrypto = (
  messages: Stream<{ to: string; data: any }>,
  newPeers: Stream<string>
) => {
  const localKeys = generateKeyPair()
  console.log('public: ', encodeHexa(localKeys.publicKey))

  const encryptedMessages = messages.map((message) => {
    const shared = box.before(decodeHexa(message.to), localKeys.secretKey)
    return {
      to: message.to,
      from: encodeHexa(localKeys.publicKey),
      data: encrypt(shared, message.data)
    }
  })

  const { messagesToDecrypt } = initNetwork(
    encodeHexa(localKeys.publicKey),
    encryptedMessages,
    newPeers
  )

  const messagesDecrypted = messagesToDecrypt
    .map((message) => {
      const shared = box.before(decodeHexa(message.from), localKeys.secretKey)
      const decrypted = decrypt(shared, message.data)
      return { ...message, data: decrypted }
    })
    .debug('decrypted')

  return { messagesDecrypted }
}
