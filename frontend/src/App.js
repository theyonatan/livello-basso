import React, { useEffect, useState } from 'react';
import './App.css';

function App() {
  const [board, setBoard] = useState(null);

  useEffect(() => {
    fetch('https://cors-anywhere.herokuapp.com/https://livello-basso-production.up.railway.app/api/board')
      .then(response => response.json())
      .then(data => setBoard(data))
      .catch(err => console.error(err));
  }, []);

  const handleAddCard = async (columnId) => {
    const title = prompt("Enter card title:");
    if (!title) return;
    const description = prompt("Enter card description:") || "";
    const badge = prompt("Enter badge (C, CPP, or Other):", "C");
    const cardData = { columnId, title, description, badge };

    const res = await fetch('https://cors-anywhere.herokuapp.com/https://livello-basso-production.up.railway.app/api/cards', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cardData)
    });
    if (res.ok) {
      const card = await res.json();
      setBoard(prev => {
        const newBoard = { ...prev };
        const column = newBoard.columns.find(col => col.id === columnId);
        column.cards.push(card);
        return newBoard;
      });
    }
  };

  if (!board) return <div>Loading...</div>;

  return (
    <div className="app">
      <h1>{board.title}</h1>
      <div className="board">
        {board.columns.map(column => (
          <div key={column.id} className="column">
            <h2>{column.name}</h2>
            <div className="cards">
              {column.cards.map(card => (
                <div key={card.id} className="card">
                  <div className="card-header">
                    <span>{card.title}</span>
                    <span className="badge">{card.badge}</span>
                  </div>
                  <p>{card.description}</p>
                </div>
              ))}
            </div>
            <button onClick={() => handleAddCard(column.id)}>Add Card</button>
          </div>
        ))}
      </div>
    </div>
  );
}

export default App;
