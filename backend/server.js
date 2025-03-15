const express = require('express');
const bodyParser = require('body-parser');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(bodyParser.json());

// In-memory board data (replace with a database in production)
let board = {
  title: "Tre picchi del livello basso",
  columns: [
    { id: 'col1', name: 'general tasks', cards: [] },
    { id: 'col2', name: 'doing today', cards: [] },
    { id: 'col3', name: 'finishing', cards: [] },
    { id: 'col4', name: 'done', cards: [] },
  ]
};

// Get board data
app.get('/api/board', (req, res) => {
  res.json(board);
});

// Add a new card to a column
app.post('/api/cards', (req, res) => {
  const { columnId, title, description, badge } = req.body;
  if (!columnId || !title) {
    return res.status(400).json({ error: "Column ID and title are required" });
  }
  const card = {
    id: uuidv4(),
    title,
    description,
    badge, // Expected values: "C", "CPP", "Other"
  };

  const column = board.columns.find(col => col.id === columnId);
  if (!column) {
    return res.status(404).json({ error: "Column not found" });
  }
  column.cards.push(card);
  res.status(201).json(card);
});

// Update a card
app.put('/api/cards/:id', (req, res) => {
  const cardId = req.params.id;
  const { title, description, badge } = req.body;
  let cardFound = false;
  board.columns.forEach(col => {
    col.cards.forEach(card => {
      if (card.id === cardId) {
        card.title = title || card.title;
        card.description = description || card.description;
        card.badge = badge || card.badge;
        cardFound = true;
        res.json(card);
      }
    });
  });
  if (!cardFound) {
    res.status(404).json({ error: "Card not found" });
  }
});

// Delete a card
app.delete('/api/cards/:id', (req, res) => {
  const cardId = req.params.id;
  let cardFound = false;
  board.columns.forEach(col => {
    const index = col.cards.findIndex(card => card.id === cardId);
    if (index !== -1) {
      col.cards.splice(index, 1);
      cardFound = true;
    }
  });
  if (cardFound) {
    res.json({ success: true });
  } else {
    res.status(404).json({ error: "Card not found" });
  }
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Backend server is running on port ${PORT}`);
});
