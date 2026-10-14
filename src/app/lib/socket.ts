import { io } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || (import.meta.env.DEV ? 'http://localhost:4000' : undefined);

export const socket = io(SOCKET_URL, {
  autoConnect: false,
  transports: ['websocket', 'polling'],
});

// Conexão compartilhada: o layout (alertas globais) e cada página chamam
// connect()/disconnect(); a conexão só fecha quando ninguém mais a usa.
let usuarios = 0;
const conectar = socket.connect.bind(socket);
const desconectar = socket.disconnect.bind(socket);
socket.connect = () => {
  usuarios += 1;
  if (!socket.active) conectar();
  return socket;
};
socket.disconnect = () => {
  usuarios = Math.max(0, usuarios - 1);
  if (usuarios === 0) desconectar();
  return socket;
};
