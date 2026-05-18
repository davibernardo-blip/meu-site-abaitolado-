const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

// --- NOVA ROTA: Mantém o servidor acordado com o UptimeRobot ---
app.get('/', (req, res) => {
    res.send('O servidor do Gartic está acordado e pronto para o jogo!');
});

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Banco de dados em memória
let jogadores = {}; 
let palavraAtual = "";
let desenhistaId = null;
let jogoIniciado = false;

// Banco de palavras para o jogo escolher aleatoriamente
const palavras = [
    "banana", "gato", "cachorro", "carro", "computador", "casa", "aviao", 
    "maca", "sol", "futebol", "sorvete", "relogio", "girafa", "caneta", "livro"
];

function escolherProximoTurno() {
    const ids = Object.keys(jogadores);
    
    // Se tiver menos de 2 jogadores, para o jogo
    if (ids.length < 2) {
        jogoIniciado = false;
        desenhistaId = null;
        palavraAtual = "";
        io.emit('status_jogo', { msg: "⏳ Aguardando pelo menos 2 jogadores para iniciar o jogo..." });
        return;
    }

    jogoIniciado = true;
    
    // Escolhe um desenhista e uma palavra aleatória
    desenhistaId = ids[Math.floor(Math.random() * ids.length)];
    palavraAtual = palavras[Math.floor(Math.random() * palavras.length)];

    io.emit('limpar'); // Limpa a lousa de geral

    // Entrega os dados certos para cada tipo de jogador
    ids.forEach(id => {
        if (id === desenhistaId) {
            io.to(id).emit('novo_turno', {
                desenhista: jogadores[desenhistaId].nome,
                idDesenhista: desenhistaId,
                palavra: palavraAtual,
                eODesenhista: true
            });
        } else {
            // Para quem adivinha, oculta a palavra usando tracinhos
            let dicas = "_ ".repeat(palavraAtual.length).trim();
            io.to(id).emit('novo_turno', {
                desenhista: jogadores[desenhistaId].nome,
                idDesenhista: desenhistaId,
                palavra: dicas,
                eODesenhista: false
            });
        }
    });
}

io.on('connection', (socket) => {
    console.log(`Usuário conectado: ${socket.id}`);

    // Quando o jogador faz login no client
    socket.on('entrar_jogo', (dados) => {
        jogadores[socket.id] = {
            nome: dados.nome || "Anônimo",
            avatar: dados.avatar || "https://via.placeholder.com/80?text=Foto",
            pontos: 0
        };

        io.emit('atualizar_placar', jogadores);

        // Se o jogo não estava rolando e agora temos gente suficiente, começa!
        if (!jogoIniciado && Object.keys(jogadores).length >= 2) {
            escolherProximoTurno();
        } else if (!jogoIniciado) {
            socket.emit('status_jogo', { msg: "⏳ Aguardando pelo menos 2 jogadores para iniciar o jogo..." });
        } else {
            // Se entrou no meio do jogo, recebe o status atual oculto
            let dicas = "_ ".repeat(palavraAtual.length).trim();
            socket.emit('novo_turno', {
                desenhista: jogadores[desenhistaId] ? jogadores[desenhistaId].nome : "Alguém",
                idDesenhista: desenhistaId,
                palavra: dicas,
                eODesenhista: false
            });
        }
    });

    // Sincronização dos traços
    socket.on('desenhar', (dados) => {
        if (socket.id === desenhistaId) {
            socket.broadcast.emit('desenhar', dados);
        }
    });

    socket.on('limpar', () => {
        if (socket.id === desenhistaId) {
            socket.broadcast.emit('limpar');
        }
    });

    // Validação de mensagens e Chutes do Gartic
    socket.on('chat', (dados) => {
        const mensagemTexto = dados.mensagem ? dados.mensagem.trim() : "";
        const chute = mensagemTexto.toLowerCase();

        // Se o jogo está rolando, quem não está desenhando chutou a palavra certa:
        if (jogoIniciado && socket.id !== desenhistaId && chute === palavraAtual.toLowerCase()) {
            
            // Da pontos para quem acertou e para o desenhista
            jogadores[socket.id].pontos += 100;
            if (jogadores[desenhistaId]) jogadores[desenhistaId].pontos += 50;

            io.emit('chat', {
                nome: "SISTEMA",
                mensagem: `🎉 ${jogadores[socket.id].nome} ACERTOU! A palavra era: ${palavraAtual.toUpperCase()}!`
            });

            io.emit('atualizar_placar', jogadores);

            // Aguarda 3 segundos e roda o próximo turno automaticamente
            setTimeout(() => {
                escolherProximoTurno();
            }, 3000);

        } else {
            // Mensagem normal, apenas repassa
            io.emit('chat', dados);
        }
    });

    // Trata quedas de conexão
    socket.on('disconnect', () => {
        console.log(`Usuário desconectado: ${socket.id}`);
        const foiDesenhista = (socket.id === desenhistaId);
        
        delete jogadores[socket.id];
        io.emit('atualizar_placar', jogadores);

        // Se o desenhista saiu no meio do round, pula o turno
        if (foiDesenhista && jogoIniciado) {
            io.emit('chat', { nome: "SISTEMA", mensagem: "⚠️ O desenhista saiu da sala! Iniciando próxima rodada..." });
            escolherProximoTurno();
        } else if (Object.keys(jogadores).length < 2) {
            escolherProximoTurno();
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});
