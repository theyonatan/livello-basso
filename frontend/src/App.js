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
  const [showAlerts, setShowAlerts] = useState(false);
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
          <h1>Tre picchi del livello basso</h1>
          <input
            type="text"
            placeholder="Enter your name"
            value={userName}
            onChange={e => { setUserName(e.target.value); localStorage.setItem('userName', e.target.value); }}
          />
          <button onClick={toggleDarkMode}>{darkMode ? 'Light Mode' : 'Dark Mode'}</button>
          <button onClick={downloadJson}>Download JSON</button>
          <input type="file" accept=".json" onChange={uploadJson} style={{ display: 'inline' }} />
          <button onClick={() => setShowAlerts(!showAlerts)}>
            {showAlerts ? 'Hide Alerts' : 'Show Alerts'}
          </button>
        </header>
        <DragDropContext onDragEnd={handleDragEnd}>
          <ListContainer filterMembers={filterMembers} setSelectedCard={setSelectedCard} />
        </DragDropContext>
        <MemberEditor />
        <Filters setFilterMembers={setFilterMembers} />
        {showAlerts && <AlertsTab />}
        {selectedCard && (
          <CardDetails card={selectedCard} close={() => setSelectedCard(null)} />
        )}
      </div>
    </BoardContext.Provider>
  );
}

function ListContainer({ filterMembers, setSelectedCard }) {
  const { board, socket, userName } = useContext(BoardContext);

  const addList = () => {
    if (!userName) return alert('Please enter your name to edit');
    const name = prompt('Enter list name');
    if (name) socket.emit('addList', { boardId: board._id, name }, (newList) => {});
  };

  return (
    <Droppable droppableId="board" type="LIST" direction="horizontal">
      {(provided) => (
        <div
          className="list-container"
          ref={provided.innerRef}
          {...provided.droppableProps}
        >
          {board.lists.map((list, index) => (
            <List
              key={list._id}
              list={list}
              index={index}
              filterMembers={filterMembers}
              setSelectedCard={setSelectedCard}
            />
          ))}
          {provided.placeholder}
          <button className="add-list-btn" onClick={addList}>+ Add List</button>
        </div>
      )}
    </Droppable>
  );
}

function List({ list, index, filterMembers, setSelectedCard }) {
  const { board, socket, userName } = useContext(BoardContext);

  const addCard = () => {
    if (!userName) return alert('Please enter your name to edit');
    const title = prompt('Enter card title');
    if (title) socket.emit('addCard', { boardId: board._id, listId: list._id, title }, (newCard) => {});
  };

  const renameList = () => {
    if (!userName) return alert('Please enter your name to edit');
    const newName = prompt('Enter new list name', list.name);
    if (newName) socket.emit('renameList', { boardId: board._id, listId: list._id, name: newName });
  };

  const removeList = () => {
    if (!userName) return alert('Please enter your name to edit');
    if (window.confirm('Are you sure you want to delete this list?')) {
      socket.emit('removeList', { boardId: board._id, listId: list._id });
    }
  };

  return (
    <Draggable draggableId={list._id} index={index}>
      {(provided) => (
        <div
          className="list"
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
        >
          <div className="list-header">
            <h3 onClick={renameList}>{list.name}</h3>
            <button onClick={removeList}>X</button>
          </div>
          <Droppable droppableId={list._id} type="CARD">
            {(provided) => (
              <div
                className="card-container"
                ref={provided.innerRef}
                {...provided.droppableProps}
              >
                {list.cards
                  .filter(card => filterMembers.length === 0 || card.assignedMembers.some(m => filterMembers.includes(m)))
                  .map((card, idx) => (
                    <Card key={card._id} card={card} index={idx} listId={list._id} setSelectedCard={setSelectedCard} />
                  ))}
                {provided.placeholder}
              </div>
            )}
          </Droppable>
          <button className="add-card-btn" onClick={addCard}>+ Add Card</button>
        </div>
      )}
    </Draggable>
  );
}

function Card({ card, index, listId, setSelectedCard }) {
  const { board, socket, userName } = useContext(BoardContext);

  const deleteCard = () => {
    if (!userName) return alert('Please enter your name to edit');
    if (window.confirm('Are you sure you want to delete this card?')) {
      socket.emit('deleteCard', { boardId: board._id, listId, cardId: card._id });
    }
  };

  return (
    <Draggable draggableId={card._id} index={index}>
      {(provided) => (
        <div
          className="card"
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          onClick={() => setSelectedCard({ ...card, listId })}
        >
          <span>{card.title}</span>
          <button onClick={(e) => { e.stopPropagation(); deleteCard(); }}>X</button>
        </div>
      )}
    </Draggable>
  );
}

function CardDetails({ card, close }) {
  const { board, socket, userName } = useContext(BoardContext);
  const [title, setTitle] = useState(card.title);
  const [description, setDescription] = useState(card.description);
  const [labels, setLabels] = useState(card.labels);
  const [assignedMembers, setAssignedMembers] = useState(card.assignedMembers);
  const [comment, setComment] = useState('');
  const [newSubtask, setNewSubtask] = useState('');

  const saveChanges = () => {
    if (!userName) return alert('Please enter your name to edit');
    socket.emit('editCard', {
      boardId: board._id,
      listId: card.listId,
      cardId: card._id,
      updates: { title, description, labels, assignedMembers },
      userName
    });
  };

  const addComment = () => {
    if (!userName) return alert('Please enter your name to edit');
    if (comment) {
      socket.emit('addComment', { boardId: board._id, listId: card.listId, cardId: card._id, userName, message: comment });
      setComment('');
    }
  };

  const addSubtask = () => {
    if (!userName) return alert('Please enter your name to edit');
    if (newSubtask) {
      socket.emit('addSubtask', { boardId: board._id, listId: card.listId, cardId: card._id, title: newSubtask }, () => {
        setNewSubtask('');
      });
    }
  };

  const toggleSubtask = (subtaskId) => {
    if (!userName) return alert('Please enter your name to edit');
    socket.emit('toggleSubtask', { boardId: board._id, listId: card.listId, cardId: card._id, subtaskId });
  };

  const renameSubtask = (subtaskId, currentTitle) => {
    if (!userName) return alert('Please enter your name to edit');
    const newTitle = prompt('Enter new subtask title', currentTitle);
    if (newTitle) {
      socket.emit('renameSubtask', { boardId: board._id, listId: card.listId, cardId: card._id, subtaskId, title: newTitle });
    }
  };

  const deleteSubtask = (subtaskId) => {
    if (!userName) return alert('Please enter your name to edit');
    if (window.confirm('Are you sure you want to delete this subtask?')) {
      socket.emit('deleteSubtask', { boardId: board._id, listId: card.listId, cardId: card._id, subtaskId });
    }
  };

  const addAttachment = (e) => {
    if (!userName) return alert('Please enter your name to edit');
    const file = e.target.files[0];
    const formData = new FormData();
    formData.append('image', file);
    fetch('https://livello-basso-production.up.railway.app/api/upload', {
      method: 'POST',
      body: formData
    })
      .then(res => res.json())
      .then(data => {
        socket.emit('editCard', {
          boardId: board._id,
          listId: card.listId,
          cardId: card._id,
          updates: { attachments: [...card.attachments, data.url] },
          userName
        });
      })
      .catch(err => console.error('Error uploading attachment:', err));
  };

  return (
    <div className="modal" onClick={close}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <h2>
          <input value={title} onChange={e => setTitle(e.target.value)} onBlur={saveChanges} />
        </h2>
        <textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          onBlur={saveChanges}
          placeholder="Add a description"
        />
        <div>
          <h3>Labels</h3>
          <input
            type="text"
            value={labels.join(',')}
            onChange={e => setLabels(e.target.value.split(','))}
            onBlur={saveChanges}
          />
        </div>
        <div>
          <h3>Assigned Members</h3>
          <select
            multiple
            value={assignedMembers}
            onChange={e => setAssignedMembers([...e.target.selectedOptions].map(o => o.value))}
            onBlur={saveChanges}
          >
            {board.members.map(member => (
              <option key={member._id} value={member._id}>{member.name}</option>
            ))}
          </select>
        </div>
        <div>
          <h3>Attachments</h3>
          <input type="file" onChange={addAttachment} />
          {card.attachments.map((url, idx) => (
            <img key={idx} src={`https://livello-basso-production.up.railway.app${url}`} alt="Attachment" className="attachment" />
          ))}
        </div>
        <div>
          <h3>Subtasks</h3>
          {card.subtasks.map(subtask => (
            <div key={subtask._id}>
              <input
                type="checkbox"
                checked={subtask.completed}
                onChange={() => toggleSubtask(subtask._id)}
              />
              <span onClick={() => renameSubtask(subtask._id, subtask.title)}>{subtask.title}</span>
              <button onClick={() => deleteSubtask(subtask._id)}>X</button>
            </div>
          ))}
          <input
            value={newSubtask}
            onChange={e => setNewSubtask(e.target.value)}
            onKeyPress={e => e.key === 'Enter' && addSubtask()}
            placeholder="Add subtask"
          />
        </div>
        <div>
          <h3>Comments</h3>
          {card.comments.map((c, idx) => (
            <p key={idx}><strong>{c.userName}:</strong> {c.message} <small>{new Date(c.timestamp).toLocaleString()}</small></p>
          ))}
          <textarea value={comment} onChange={e => setComment(e.target.value)} />
          <button onClick={addComment}>Add Comment</button>
        </div>
        <div>
          <h3>Activity Log</h3>
          {card.activityLog.map((log, idx) => (
            <p key={idx}>{log.message} <small>{new Date(log.timestamp).toLocaleString()}</small></p>
          ))}
        </div>
        <button onClick={close}>Close</button>
      </div>
    </div>
  );
}

function MemberEditor() {
  const { board, socket, userName } = useContext(BoardContext);

  const addMember = () => {
    if (!userName) return alert('Please enter your name to edit');
    const name = prompt('Enter member name');
    if (name) socket.emit('addMember', { boardId: board._id, name }, (newMember) => {});
  };

  const renameMember = (memberId, currentName) => {
    if (!userName) return alert('Please enter your name to edit');
    const newName = prompt('Enter new name', currentName);
    if (newName) socket.emit('renameMember', { boardId: board._id, memberId, name: newName });
  };

  const removeMember = (memberId) => {
    if (!userName) return alert('Please enter your name to edit');
    if (window.confirm('Are you sure you want to remove this member?')) {
      socket.emit('removeMember', { boardId: board._id, memberId });
    }
  };

  return (
    <div className="member-editor">
      <h2>Members</h2>
      <button onClick={addMember}>+ Add Member</button>
      {board.members.map(member => (
        <div key={member._id}>
          <span onClick={() => renameMember(member._id, member.name)}>{member.name}</span>
          <button onClick={() => removeMember(member._id)}>X</button>
        </div>
      ))}
    </div>
  );
}

function AlertsTab() {
  const { board, socket, userName } = useContext(BoardContext);
  const [message, setMessage] = useState('');

  const addAlert = () => {
    if (!userName) return alert('Please enter your name to edit');
    if (message) {
      socket.emit('addAlert', { boardId: board._id, userName, message });
      setMessage('');
    }
  };

  return (
    <div className="alerts-tab">
      <h2>Alerts</h2>
      <textarea value={message} onChange={e => setMessage(e.target.value)} />
      <button onClick={addAlert}>Add Alert</button>
      {board.alerts.map(alert => (
        <p key={alert._id}><strong>{alert.userName}:</strong> {alert.message} <small>{new Date(alert.timestamp).toLocaleString()}</small></p>
      ))}
    </div>
  );
}

function Filters({ setFilterMembers }) {
  const { board } = useContext(BoardContext);

  return (
    <div className="filters">
      <h2>Filter by Members</h2>
      <select multiple onChange={e => setFilterMembers([...e.target.selectedOptions].map(o => o.value))}>
        {board.members.map(member => (
          <option key={member._id} value={member._id}>{member.name}</option>
        ))}
      </select>
    </div>
  );
}

export default App;