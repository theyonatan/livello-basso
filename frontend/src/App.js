import React, { useState, useEffect, useReducer, useContext } from 'react';
import { BrowserRouter as Router, Route, Switch, useHistory, useParams } from 'react-router-dom';
import io from 'socket.io-client';
import { DragDropContext, Droppable, Draggable } from 'react-beautiful-dnd';
import './App.css';

const socket = io('https://livello-basso-production.up.railway.app');
const BoardContext = React.createContext();

function boardReducer(state, action) {
  switch (action.type) {
    case 'SET_BOARD':
      return action.payload;
    default:
      return state;
  }
}

function App() {
  const [darkMode, setDarkMode] = useState(false);
  return (
    <Router>
      <div className={`app ${darkMode ? 'dark' : ''}`}>
        <Switch>
          <Route path="/" exact component={Home} />
          <Route path="/board/:id">
            <BoardPage darkMode={darkMode} toggleDarkMode={() => setDarkMode(!darkMode)} />
          </Route>
        </Switch>
      </div>
    </Router>
  );
}

function Home() {
  const [boards, setBoards] = useState([]);
  const [newBoardName, setNewBoardName] = useState('');
  const history = useHistory();

  useEffect(() => {
    fetch('https://livello-basso-production.up.railway.app/api/boards')
      .then(res => res.json())
      .then(setBoards)
      .catch(err => console.error('Error fetching boards:', err));
  }, []);

  const createBoard = () => {
    fetch('https://livello-basso-production.up.railway.app/api/boards', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newBoardName || 'New Board' })
    })
      .then(res => res.json())
      .then(board => history.push(`/board/${board._id}`))
      .catch(err => console.error('Error creating board:', err));
  };

  return (
    <div className="home">
      <h1>Tre picchi del livello basso</h1>
      <input
        type="text"
        placeholder="New Board Name"
        value={newBoardName}
        onChange={e => setNewBoardName(e.target.value)}
      />
      <button onClick={createBoard}>Create Board</button>
      <ul>
        {boards.map(board => (
          <li key={board._id} onClick={() => history.push(`/board/${board._id}`)}>
            {board.name}
          </li>
        ))}
      </ul>
    </div>
  );
}

function BoardPage({ darkMode, toggleDarkMode }) {
  const { id } = useParams();
  const [board, dispatch] = useReducer(boardReducer, null);
  const [userName, setUserName] = useState(localStorage.getItem('userName') || '');
  const [selectedCard, setSelectedCard] = useState(null);
  const [filterMembers, setFilterMembers] = useState([]);

  useEffect(() => {
    fetch(`https://livello-basso-production.up.railway.app/api/boards/${id}`)
      .then(res => res.json())
      .then(data => dispatch({ type: 'SET_BOARD', payload: data }))
      .catch(err => console.error('Error fetching board:', err));

    socket.emit('joinBoard', id);
    socket.on('boardUpdated', (newBoard) => {
      dispatch({ type: 'SET_BOARD', payload: newBoard });
    });

    return () => {
      socket.emit('leaveBoard', id);
      socket.off('boardUpdated');
    };
  }, [id]);

  if (!board) return <div>Loading...</div>;

  const handleDragEnd = (result) => {
    if (!userName) return alert('Please enter your name to edit');
    const { source, destination, draggableId, type } = result;
    if (!destination) return;

    if (type === 'LIST') {
      socket.emit('moveList', { boardId: id, listId: draggableId, newIndex: destination.index });
    } else if (type === 'CARD') {
      socket.emit('moveCard', {
        boardId: id,
        cardId: draggableId,
        sourceListId: source.droppableId,
        destListId: destination.droppableId,
        destIndex: destination.index
      });
    }
  };

  const downloadJson = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(board));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", `${board.name}.json`);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  const uploadJson = (e) => {
    if (!userName) return alert('Please enter your name to edit');
    const file = e.target.files[0];
    const reader = new FileReader();
    reader.onload = (event) => {
      fetch(`https://livello-basso-production.up.railway.app/api/boards/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: event.target.result
      }).catch(err => console.error('Error uploading JSON:', err));
    };
    reader.readAsText(file);
  };

  return (
    <BoardContext.Provider value={{ board, socket, userName }}>
      <div className="board-page">
        <header>
          <h1>{board.name}</h1>
          <input
            type="text"
            placeholder="Enter your name"
            value={userName}
            onChange={e => { setUserName(e.target.value); localStorage.setItem('userName', e.target.value); }}
          />
          <button onClick={toggleDarkMode}>{darkMode ? 'Light Mode' : 'Dark Mode'}</button>
          <button onClick={downloadJson}>Download JSON</button>
          <input type="file" accept=".json" onChange={uploadJson} style={{ display: 'inline' }} />
        </header>
        <DragDropContext onDragEnd={handleDragEnd}>
          <ListContainer filterMembers={filterMembers} setSelectedCard={setSelectedCard} />
        </DragDropContext>
        <div className="sidebar">
          <MemberEditor />
          <Filters setFilterMembers={setFilterMembers} />
          <AlertsTab />
        </div>
        {selectedCard && (
          <CardDetails card={selectedCard} close={() => setSelectedCard(null)} />
        )}
      </div>
    </BoardContext.Provider>
  );
}

function ListContainer({ filterMembers, setSelectedCard }) {
  const { board, socket, userName } = useContext(BoardContext);
  const [newListTitle, setNewListTitle] = useState('');

  const addList = () => {
    if (!userName) return alert('Please enter your name to edit');
    if (!newListTitle) return alert('Please enter a list title');
    socket.emit('addList', { boardId: board._id, title: newListTitle }, () => setNewListTitle(''));
  };

  return (
    <Droppable droppableId="lists" direction="horizontal" type="LIST">
      {(provided) => (
        <div className="list-container" ref={provided.innerRef} {...provided.droppableProps}>
          {board.lists.filter(list => 
            !filterMembers.length || list.cards.some(card => 
              card.assignedMembers.some(m => filterMembers.includes(m))
            )
          ).map((list, index) => (
            <List key={list._id} list={list} index={index} setSelectedCard={setSelectedCard} />
          ))}
          {provided.placeholder}
          <div className="list add-list">
            <input
              type="text"
              placeholder="New List Title"
              value={newListTitle}
              onChange={e => setNewListTitle(e.target.value)}
              onKeyPress={e => e.key === 'Enter' && addList()}
            />
            <button onClick={addList}>Add List</button>
          </div>
        </div>
      )}
    </Droppable>
  );
}

function List({ list, index, setSelectedCard }) {
  const { board, socket, userName } = useContext(BoardContext);
  const [newCardTitle, setNewCardTitle] = useState('');

  const addCard = () => {
    if (!userName) return alert('Please enter your name to edit');
    if (!newCardTitle) return alert('Please enter a card title');
    socket.emit('addCard', { boardId: board._id, listId: list._id, title: newCardTitle }, () => setNewCardTitle(''));
  };

  return (
    <Draggable draggableId={list._id} index={index} type="LIST">
      {(provided) => (
        <div className="list" ref={provided.innerRef} {...provided.draggableProps} {...provided.dragHandleProps}>
          <h2>{list.title}</h2>
          <Droppable droppableId={list._id} type="CARD">
            {(provided) => (
              <div className="cards" ref={provided.innerRef} {...provided.droppableProps}>
                {list.cards.map((card, idx) => (
                  <Card key={card._id} card={card} index={idx} setSelectedCard={setSelectedCard} />
                ))}
                {provided.placeholder}
              </div>
            )}
          </Droppable>
          <input
            type="text"
            placeholder="New Card Title"
            value={newCardTitle}
            onChange={e => setNewCardTitle(e.target.value)}
            onKeyPress={e => e.key === 'Enter' && addCard()}
          />
          <button onClick={addCard}>Add Card</button>
        </div>
      )}
    </Draggable>
  );
}

function Card({ card, index, setSelectedCard }) {
  return (
    <Draggable draggableId={card._id} index={index}>
      {(provided) => (
        <div
          className="card"
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          onClick={() => setSelectedCard(card)}
        >
          {card.title}
        </div>
      )}
    </Draggable>
  );
}

function CardDetails({ card, close }) {
  const { socket, board, userName } = useContext(BoardContext);
  const [description, setDescription] = useState(card.description);
  const [comment, setComment] = useState('');

  const addComment = () => {
    if (!userName) return alert('Please enter your name to comment');
    socket.emit('addComment', { boardId: board._id, cardId: card._id, userName, text: comment });
    setComment('');
  };

  const updateDescription = () => {
    socket.emit('updateCard', { boardId: board._id, cardId: card._id, updates: { description } });
  };

  return (
    <div className="modal">
      <div className="modal-content">
        <h2>{card.title}</h2>
        <textarea value={description} onChange={e => setDescription(e.target.value)} onBlur={updateDescription} />
        <h3>Comments</h3>
        {card.comments.map((c, idx) => (
          <p key={idx}>{c.userName}: {c.text} <small>{new Date(c.timestamp).toLocaleString()}</small></p>
        ))}
        <input
          type="text"
          value={comment}
          onChange={e => setComment(e.target.value)}
          onKeyPress={e => e.key === 'Enter' && addComment()}
        />
        <button onClick={addComment}>Add Comment</button>
        <button onClick={close}>Close</button>
      </div>
    </div>
  );
}

function MemberEditor() {
  const { board, socket, userName } = useContext(BoardContext);
  const [newMember, setNewMember] = useState('');

  const addMember = () => {
    if (!userName) return alert('Please enter your name to edit');
    if (!newMember) return alert('Please enter a member name');
    socket.emit('addMember', { boardId: board._id, member: newMember });
    setNewMember('');
  };

  return (
    <div className="member-editor">
      <h3>Members</h3>
      {board.members.map((m, idx) => (
        <div key={idx} className="member">{m}</div>
      ))}
      <input
        type="text"
        value={newMember}
        onChange={e => setNewMember(e.target.value)}
        onKeyPress={e => e.key === 'Enter' && addMember()}
      />
      <button onClick={addMember}>Add Member</button>
    </div>
  );
}

function Filters({ setFilterMembers }) {
  const { board } = useContext(BoardContext);

  return (
    <div className="filters">
      <h3>Filter by Member</h3>
      <select multiple onChange={e => setFilterMembers([...e.target.selectedOptions].map(o => o.value))}>
        {board.members.map((m, idx) => (
          <option key={idx} value={m}>{m}</option>
        ))}
      </select>
    </div>
  );
}

function AlertsTab() {
  const { board, socket, userName } = useContext(BoardContext);
  const [message, setMessage] = useState('');

  const addAlert = () => {
    if (!userName) return alert('Please enter your name to post alerts');
    if (!message) return alert('Please enter a message');
    socket.emit('addAlert', { boardId: board._id, userName, message });
    setMessage('');
  };

  return (
    <div className="alerts-tab">
      <h3>Alerts</h3>
      <div className="alerts-list">
        {board.alerts.map((a, idx) => (
          <p key={idx}>{a.userName}: {a.message} <small>{new Date(a.timestamp).toLocaleString()}</small></p>
        ))}
      </div>
      <input
        type="text"
        value={message}
        onChange={e => setMessage(e.target.value)}
        onKeyPress={e => e.key === 'Enter' && addAlert()}
      />
      <button onClick={addAlert}>Post Alert</button>
    </div>
  );
}

export default App;