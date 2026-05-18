const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" } // Permite que o seu site no Netlify acesse este servidor
});

io.on('connection', (socket) => {
    console.log('Um jogador conectou:', socket.id);

    // Quando receber um desenho, repassa para todos os outros
    socket.on('desenho', (dados) => {
        socket.broadcast.emit('desenho', dados);
    });

    // Quando receber mensagem no chat, repassa para todo mundo (incluindo quem mandou)
    socket.on('chat', (dados) => {
        io.emit('chat', dados);
    });

    socket.on('disconnect', () => {
        console.log('Jogador desconectou:', socket.id);
    });
});

// A porta é definida pelo próprio Render
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});