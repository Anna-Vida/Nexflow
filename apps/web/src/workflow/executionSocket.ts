import {
  io,
} from 'socket.io-client'

export const executionSocket =
  io('/executions', {
    autoConnect: false,
    transports: ['websocket'],
  })
