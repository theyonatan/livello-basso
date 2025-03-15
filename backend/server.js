const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
var cors = require('cors')
const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = 3000;

app.use(cors());
app.use(express.json());

let boards = {};

function generateId() {
    return Math.random().toString(36).substr(2, 9);
}

app.get('/api/boards', (req, res) => res.json(Object.values(boards)));
app.post('/api/boards', (req, res) => {
    const board = { _id: generateId(), name: req.body.name, lists: [], members: [], alerts: [] };
    boards[board._id] = board;
    res.json(board);
});
app.get('/api/boards/:id', (req, res) => res.json(boards[req.params.id] || {}));
app.put('/api/boards/:id', (req, res) => {
    boards[req.params.id] = req.body;
    io.to(req.params.id).emit('boardUpdated', boards[req.params.id]);
    res.sendStatus(200);
});

io.on('connection', (socket) => {
    socket.on('joinBoard', (boardId) => socket.join(boardId));
    socket.on('leaveBoard', (boardId) => socket.leave(boardId));
    socket.on('addCard', ({ boardId, listId, title }, callback) => {
        const board = boards[boardId];
        if (!board) return;
        const list = board.lists.find(l => l._id === listId);
        if (!list) return;
        const cardId = generateId();
        const newCard = { _id: cardId, title, description: '', labels: [], assignedMembers: [], comments: [], activityLog: [], attachments: [], subtasks: [] };
        list.cards.push(newCard);
        io.to(boardId).emit('boardUpdated', board);
        if (callback) callback(newCard);
    });
    socket.on('moveCard', ({ boardId, cardId, sourceListId, destListId, destIndex }) => {
        const board = boards[boardId];
        if (!board) return;
        const sourceList = board.lists.find(l => l._id === sourceListId);
        const destList = board.lists.find(l => l._id === destListId);
        if (!sourceList || !destList) return;
        const card = sourceList.cards.find(c => c._id === cardId);
        sourceList.cards = sourceList.cards.filter(c => c._id !== cardId);
        destList.cards.splice(destIndex, 0, card);
        io.to(boardId).emit('boardUpdated', board);
    });
    socket.on('moveList', ({ boardId, listId, newIndex }) => {
        const board = boards[boardId];
        if (!board) return;
        const list = board.lists.find(l => l._id === listId);
        board.lists = board.lists.filter(l => l._id !== listId);
        board.lists.splice(newIndex, 0, list);
        io.to(boardId).emit('boardUpdated', board);
    });
    socket.on('addAlert', ({ boardId, userName, message }) => {
        const board = boards[boardId];
        if (!board) return;
        board.alerts.push({ userName, message, timestamp: Date.now() });
        io.to(boardId).emit('boardUpdated', board);
    });
});

server.listen(PORT, () => console.log(`Server running on port ${PORT}`));