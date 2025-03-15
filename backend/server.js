const express = require('express');
const cors = require('cors');
const socketIo = require('socket.io');
const http = require('http');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: '*' } });

// Middleware
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// In-memory data storage
const boards = {};
let idCounter = 1;

function generateId() {
  return (idCounter++).toString();
}

// Multer setup for image uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage });

// Ensure uploads directory exists
if (!fs.existsSync('uploads')) fs.mkdirSync('uploads');

// REST API Endpoints
app.get('/api/boards', (req, res) => {
  const boardList = Object.values(boards).map(board => ({ _id: board._id, name: board.name }));
  res.json(boardList);
});

app.post('/api/boards', (req, res) => {
  const boardId = generateId();
  const board = { _id: boardId, name: req.body.name || 'New Board', lists: [], members: [], alerts: [] };
  boards[boardId] = board;
  res.json(board);
});

app.get('/api/boards/:id', (req, res) => {
  const board = boards[req.params.id];
  if (!board) return res.status(404).json({ error: 'Board not found' });
  res.json(board);
});

app.put('/api/boards/:id', (req, res) => {
  const boardId = req.params.id;
  if (!boards[boardId]) return res.status(404).json({ error: 'Board not found' });
  boards[boardId] = { ...req.body, _id: boardId };
  io.to(boardId).emit('boardUpdated', boards[boardId]);
  res.json(boards[boardId]);
});

app.post('/api/upload', upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  res.json({ url: `/uploads/${req.file.filename}` });
});

// Socket.IO Logic
io.on('connection', (socket) => {
  socket.on('joinBoard', (boardId) => socket.join(boardId));
  socket.on('leaveBoard', (boardId) => socket.leave(boardId));

  socket.on('addList', ({ boardId, name }, callback) => {
    const board = boards[boardId];
    if (!board) return;
    const listId = generateId();
    const newList = { _id: listId, name, cards: [] };
    board.lists.push(newList);
    io.to(boardId).emit('boardUpdated', board);
    if (callback) callback(newList);
  });

  socket.on('renameList', ({ boardId, listId, name }) => {
    const board = boards[boardId];
    if (!board) return;
    const list = board.lists.find(l => l._id === listId);
    if (list) {
      list.name = name;
      io.to(boardId).emit('boardUpdated', board);
    }
  });

  socket.on('removeList', ({ boardId, listId }) => {
    const board = boards[boardId];
    if (!board) return;
    board.lists = board.lists.filter(l => l._id !== listId);
    io.to(boardId).emit('boardUpdated', board);
  });

  socket.on('moveList', ({ boardId, listId, newIndex }) => {
    const board = boards[boardId];
    if (!board) return;
    const listIndex = board.lists.findIndex(l => l._id === listId);
    if (listIndex === -1) return;
    const [list] = board.lists.splice(listIndex, 1);
    board.lists.splice(newIndex, 0, list);
    io.to(boardId).emit('boardUpdated', board);
  });

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

  socket.on('editCard', ({ boardId, listId, cardId, updates, userName }) => {
    const board = boards[boardId];
    if (!board) return;
    const list = board.lists.find(l => l._id === listId);
    if (!list) return;
    const card = list.cards.find(c => c._id === cardId);
    if (!card) return;
    Object.assign(card, updates);
    if (updates.title || updates.description || updates.labels || updates.assignedMembers) {
      card.activityLog.push({ message: `${userName} edited the card`, timestamp: new Date() });
    }
    io.to(boardId).emit('boardUpdated', board);
  });

  socket.on('deleteCard', ({ boardId, listId, cardId }) => {
    const board = boards[boardId];
    if (!board) return;
    const list = board.lists.find(l => l._id === listId);
    if (!list) return;
    list.cards = list.cards.filter(c => c._id !== cardId);
    io.to(boardId).emit('boardUpdated', board);
  });

  socket.on('moveCard', ({ boardId, cardId, sourceListId, destListId, destIndex }) => {
    const board = boards[boardId];
    if (!board) return;
    const sourceList = board.lists.find(l => l._id === sourceListId);
    const destList = board.lists.find(l => l._id === destListId);
    if (!sourceList || !destList) return;
    const cardIndex = sourceList.cards.findIndex(c => c._id === cardId);
    if (cardIndex === -1) return;
    const [card] = sourceList.cards.splice(cardIndex, 1);
    destList.cards.splice(destIndex, 0, card);
    io.to(boardId).emit('boardUpdated', board);
  });

  socket.on('addComment', ({ boardId, listId, cardId, userName, message }) => {
    const board = boards[boardId];
    if (!board) return;
    const list = board.lists.find(l => l._id === listId);
    if (!list) return;
    const card = list.cards.find(c => c._id === cardId);
    if (!card) return;
    card.comments.push({ userName, message, timestamp: new Date() });
    card.activityLog.push({ message: `${userName} added a comment`, timestamp: new Date() });
    io.to(boardId).emit('boardUpdated', board);
  });

  socket.on('addSubtask', ({ boardId, listId, cardId, title }, callback) => {
    const board = boards[boardId];
    if (!board) return;
    const list = board.lists.find(l => l._id === listId);
    if (!list) return;
    const card = list.cards.find(c => c._id === cardId);
    if (!card) return;
    const subtaskId = generateId();
    const newSubtask = { _id: subtaskId, title, completed: false };
    card.subtasks.push(newSubtask);
    io.to(boardId).emit('boardUpdated', board);
    if (callback) callback(newSubtask);
  });

  socket.on('toggleSubtask', ({ boardId, listId, cardId, subtaskId }) => {
    const board = boards[boardId];
    if (!board) return;
    const list = board.lists.find(l => l._id === listId);
    if (!list) return;
    const card = list.cards.find(c => c._id === cardId);
    if (!card) return;
    const subtask = card.subtasks.find(s => s._id === subtaskId);
    if (subtask) {
      subtask.completed = !subtask.completed;
      io.to(boardId).emit('boardUpdated', board);
    }
  });

  socket.on('renameSubtask', ({ boardId, listId, cardId, subtaskId, title }) => {
    const board = boards[boardId];
    if (!board) return;
    const list = board.lists.find(l => l._id === listId);
    if (!list) return;
    const card = list.cards.find(c => c._id === cardId);
    if (!card) return;
    const subtask = card.subtasks.find(s => s._id === subtaskId);
    if (subtask) {
      subtask.title = title;
      io.to(boardId).emit('boardUpdated', board);
    }
  });

  socket.on('deleteSubtask', ({ boardId, listId, cardId, subtaskId }) => {
    const board = boards[boardId];
    if (!board) return;
    const list = board.lists.find(l => l._id === listId);
    if (!list) return;
    const card = list.cards.find(c => c._id === cardId);
    if (!card) return;
    card.subtasks = card.subtasks.filter(s => s._id !== subtaskId);
    io.to(boardId).emit('boardUpdated', board);
  });

  socket.on('moveSubtask', ({ boardId, listId, cardId, subtaskId, newIndex }) => {
    const board = boards[boardId];
    if (!board) return;
    const list = board.lists.find(l => l._id === listId);
    if (!list) return;
    const card = list.cards.find(c => c._id === cardId);
    if (!card) return;
    const subtaskIndex = card.subtasks.findIndex(s => s._id === subtaskId);
    if (subtaskIndex === -1) return;
    const [subtask] = card.subtasks.splice(subtaskIndex, 1);
    card.subtasks.splice(newIndex, 0, subtask);
    io.to(boardId).emit('boardUpdated', board);
  });

  socket.on('addMember', ({ boardId, name }, callback) => {
    const board = boards[boardId];
    if (!board) return;
    const memberId = generateId();
    const newMember = { _id: memberId, name };
    board.members.push(newMember);
    io.to(boardId).emit('boardUpdated', board);
    if (callback) callback(newMember);
  });

  socket.on('renameMember', ({ boardId, memberId, name }) => {
    const board = boards[boardId];
    if (!board) return;
    const member = board.members.find(m => m._id === memberId);
    if (member) {
      member.name = name;
      io.to(boardId).emit('boardUpdated', board);
    }
  });

  socket.on('removeMember', ({ boardId, memberId }) => {
    const board = boards[boardId];
    if (!board) return;
    board.members = board.members.filter(m => m._id !== memberId);
    board.lists.forEach(list => {
      list.cards.forEach(card => {
        card.assignedMembers = card.assignedMembers.filter(m => m !== memberId);
      });
    });
    io.to(boardId).emit('boardUpdated', board);
  });

  socket.on('addAlert', ({ boardId, userName, message }) => {
    const board = boards[boardId];
    if (!board) return;
    const alertId = generateId();
    board.alerts.push({ _id: alertId, userName, message, timestamp: new Date() });
    io.to(boardId).emit('boardUpdated', board);
  });
});

// Start Server
const PORT = 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));