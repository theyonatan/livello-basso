const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
const port = 3001;

app.use(cors());
app.use(bodyParser.json());

// In-memory board storage (for demo/backups)
let boardData = {};

app.get('/api/board', (req, res) => {
  res.json(boardData);
});

app.post('/api/board', (req, res) => {
  boardData = req.body;
  res.json({ status: 'success', data: boardData });
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
