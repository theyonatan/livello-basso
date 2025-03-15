import React, { useState, useEffect } from 'react';
import { DragDropContext, Droppable, Draggable } from 'react-beautiful-dnd';
import './App.css';

// Dummy initial board state
const initialBoardState = {
  boardName: "Default Board",
  lists: [
    {
      id: 'list-1',
      title: 'To Do',
      cards: [
        {
          id: 'card-1',
          title: 'Sample Card',
          description: 'This is a sample card description',
          label: 'Other',
          members: [],
          comments: [],
          attachments: [],
          subtasks: []
        }
      ]
    },
    {
      id: 'list-2',
      title: 'In Progress',
      cards: []
    },
    {
      id: 'list-3',
      title: 'Done',
      cards: []
    }
  ],
  members: [],
  alerts: []
};

function App() {
  const [username, setUsername] = useState('');
  const [loggedIn, setLoggedIn] = useState(false);
  const [board, setBoard] = useState(initialBoardState);
  const [activeBoard, setActiveBoard] = useState("default");
  const [filterMember, setFilterMember] = useState('');
  const [darkMode, setDarkMode] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedCard, setSelectedCard] = useState(null);

  // ----- Drag and Drop Handler -----
  const onDragEnd = (result) => {
    const { source, destination, type } = result;
    if (!destination) return;

    // If reordering lists
    if (type === 'LIST') {
      const newLists = Array.from(board.lists);
      const [removed] = newLists.splice(source.index, 1);
      newLists.splice(destination.index, 0, removed);
      setBoard({ ...board, lists: newLists });
      return;
    }

    // Dragging cards
    const sourceListIndex = board.lists.findIndex(list => list.id === source.droppableId);
    const destListIndex = board.lists.findIndex(list => list.id === destination.droppableId);
    const sourceList = board.lists[sourceListIndex];
    const destList = board.lists[destListIndex];
    const sourceCards = Array.from(sourceList.cards);
    const [removedCard] = sourceCards.splice(source.index, 1);

    if (source.droppableId === destination.droppableId) {
      // Reordering within same list
      sourceCards.splice(destination.index, 0, removedCard);
      const newList = { ...sourceList, cards: sourceCards };
      const newLists = [...board.lists];
      newLists[sourceListIndex] = newList;
      setBoard({ ...board, lists: newLists });
    } else {
      // Moving between lists
      const destCards = Array.from(destList.cards);
      destCards.splice(destination.index, 0, removedCard);
      const newSourceList = { ...sourceList, cards: sourceCards };
      const newDestList = { ...destList, cards: destCards };
      const newLists = [...board.lists];
      newLists[sourceListIndex] = newSourceList;
      newLists[destListIndex] = newDestList;
      setBoard({ ...board, lists: newLists });
    }
  };

  // ----- List Operations -----
  const addList = () => {
    if (!loggedIn) return;
    const newList = {
      id: `list-${Date.now()}`,
      title: 'New List',
      cards: []
    };
    setBoard({ ...board, lists: [...board.lists, newList] });
  };

  const renameList = (listId, newTitle) => {
    const newLists = board.lists.map(list => list.id === listId ? { ...list, title: newTitle } : list);
    setBoard({ ...board, lists: newLists });
  };

  const removeList = (listId) => {
    if (!loggedIn) return;
    const newLists = board.lists.filter(list => list.id !== listId);
    setBoard({ ...board, lists: newLists });
  };

  // ----- Card Operations -----
  const addCard = (listId) => {
    if (!loggedIn) return;
    const newCard = {
      id: `card-${Date.now()}`,
      title: 'New Card',
      description: '',
      label: 'Other',
      members: [],
      comments: [],
      attachments: [],
      subtasks: []
    };
    const newLists = board.lists.map(list => {
      if (list.id === listId) return { ...list, cards: [...list.cards, newCard] };
      return list;
    });
    setBoard({ ...board, lists: newLists });
  };

  const deleteCard = (listId, cardId) => {
    if (!loggedIn) return;
    const newLists = board.lists.map(list => {
      if (list.id === listId) {
        return { ...list, cards: list.cards.filter(card => card.id !== cardId) };
      }
      return list;
    });
    setBoard({ ...board, lists: newLists });
  };

  const openCardModal = (card, listId) => {
    setSelectedCard({ ...card, parentList: listId });
    setModalOpen(true);
  };

  const updateCard = (updatedCard) => {
    const newLists = board.lists.map(list => {
      if (list.id === updatedCard.parentList) {
        const newCards = list.cards.map(card => card.id === updatedCard.id ? updatedCard : card);
        return { ...list, cards: newCards };
      }
      return list;
    });
    setBoard({ ...board, lists: newLists });
    setSelectedCard(updatedCard);
  };

  const closeCardModal = () => {
    setModalOpen(false);
    setSelectedCard(null);
  };

  // ----- Member Editor -----
  const addMember = () => {
    if (!loggedIn) return;
    const newMember = { id: `member-${Date.now()}`, name: 'New Member' };
    setBoard({ ...board, members: [...board.members, newMember] });
  };

  const renameMember = (memberId, newName) => {
    const newMembers = board.members.map(m => m.id === memberId ? { ...m, name: newName } : m);
    setBoard({ ...board, members: newMembers });
  };

  const removeMember = (memberId) => {
    if (!loggedIn) return;
    const newMembers = board.members.filter(m => m.id !== memberId);
    // Also remove from any card assignments
    const newLists = board.lists.map(list => ({
      ...list,
      cards: list.cards.map(card => ({
        ...card,
        members: card.members.filter(id => id !== memberId)
      }))
    }));
    setBoard({ ...board, members: newMembers, lists: newLists });
  };

  // ----- Alerts Chat -----
  const handleAlertInput = (e) => {
    if (e.key === 'Enter' && loggedIn && e.target.value.trim() !== '') {
      const newAlerts = [...board.alerts, `${username}: ${e.target.value}`];
      setBoard({ ...board, alerts: newAlerts });
      e.target.value = '';
    }
  };

  // ----- Backup -----
  const downloadBackup = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(board));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", `${board.boardName || "board"}_backup.json`);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  const uploadBackup = (e) => {
    if (e.target.files.length === 0) return;
    const fileReader = new FileReader();
    fileReader.onload = (event) => {
      try {
        const backup = JSON.parse(event.target.result);
        setBoard(backup);
      } catch (err) {
        alert("Invalid backup file.");
      }
    };
    fileReader.readAsText(e.target.files[0]);
  };

  // ----- Card Modal Component -----
  const CardModal = ({ card, onClose }) => {
    const [editedCard, setEditedCard] = useState(card);

    // Update functions for subtasks, comments, attachments, etc.
    const handleChange = (e) => {
      const { name, value } = e.target;
      setEditedCard({ ...editedCard, [name]: value });
    };

    const addComment = (e) => {
      if (e.key === 'Enter' && e.target.value.trim() !== '') {
        setEditedCard({
          ...editedCard,
          comments: [...(editedCard.comments || []), `${username}: ${e.target.value}`]
        });
        e.target.value = '';
      }
    };

    // (Similar functions would be defined for attachments, subtasks, etc.)

    const saveChanges = () => {
      updateCard(editedCard);
      onClose();
    };

    return (
      <div className="modal">
        <div className="modal-content">
          <span className="close" onClick={onClose}>&times;</span>
          <h2>Edit Card</h2>
          <input
            type="text"
            name="title"
            value={editedCard.title}
            onChange={handleChange}
            placeholder="Card Title"
          />
          <textarea
            name="description"
            value={editedCard.description}
            onChange={handleChange}
            placeholder="Card Description"
            style={{ direction: 'rtl' }}
          />
          <select
            name="label"
            value={editedCard.label}
            onChange={handleChange}
          >
            <option value="C">C</option>
            <option value="CPP">CPP</option>
            <option value="Other">Other</option>
          </select>
          <div className="comments-section">
            <h3>Comments</h3>
            {(editedCard.comments || []).map((c, i) => <p key={i}>{c}</p>)}
            {loggedIn && (
              <input type="text" placeholder="Add comment" onKeyDown={addComment} />
            )}
          </div>
          {/* For brevity, similar sections for attachments, subtasks, and activity log can be added */}
          <button onClick={saveChanges}>Save</button>
        </div>
      </div>
    );
  };

  return (
    <div className={darkMode ? "App dark" : "App"}>
      <header>
        <h1>Tre picchi del livello basso</h1>
        <div className="login">
          {!loggedIn ? (
            <div>
              <input
                type="text"
                placeholder="Enter your name"
                onChange={(e) => setUsername(e.target.value)}
              />
              <button onClick={() => { if (username.trim()) setLoggedIn(true); }}>Log In</button>
            </div>
          ) : (
            <div>
              Welcome, {username} <button onClick={() => setLoggedIn(false)}>Log Out</button>
            </div>
          )}
          <button onClick={() => setDarkMode(!darkMode)}>Toggle Dark Mode</button>
        </div>
      </header>

      <div className="board-selector">
        {/* Board switching/creation (for demo purposes a select input) */}
        <select onChange={(e) => setActiveBoard(e.target.value)}>
          <option value="default">Default Board</option>
          {/* Additional board options could be added here */}
        </select>
        {loggedIn && <button>Create Board</button>}
      </div>

      <DragDropContext onDragEnd={onDragEnd}>
        <Droppable droppableId="all-lists" type="LIST" direction="horizontal">
          {(provided) => (
            <div className="lists-container" ref={provided.innerRef} {...provided.droppableProps}>
              {board.lists.map((list, listIndex) => (
                <Draggable draggableId={list.id} index={listIndex} key={list.id}>
                  {(provided) => (
                    <div className="list" ref={provided.innerRef} {...provided.draggableProps}>
                      <div className="list-header" {...provided.dragHandleProps}>
                        <input
                          type="text"
                          value={list.title}
                          onChange={(e) => renameList(list.id, e.target.value)}
                        />
                        {loggedIn && <button onClick={() => removeList(list.id)}>X</button>}
                      </div>
                      <Droppable droppableId={list.id} type="CARD">
                        {(provided) => (
                          <div className="cards-container" ref={provided.innerRef} {...provided.droppableProps}>
                            {list.cards
                              .filter(card => filterMember ? card.members.includes(filterMember) : true)
                              .map((card, cardIndex) => (
                                <Draggable draggableId={card.id} index={cardIndex} key={card.id}>
                                  {(provided) => (
                                    <div
                                      className="card"
                                      ref={provided.innerRef}
                                      {...provided.draggableProps}
                                      {...provided.dragHandleProps}
                                      style={{ ...provided.draggableProps.style, direction: 'rtl' }}
                                    >
                                      <h4>{card.title}</h4>
                                      <p>{card.description}</p>
                                      <div className="labels">
                                        <span>{card.label}</span>
                                      </div>
                                      <div className="card-members">
                                        {card.members.map(memberId => {
                                          const member = board.members.find(m => m.id === memberId);
                                          return member ? <span key={memberId}>{member.name}</span> : null;
                                        })}
                                      </div>
                                      <button onClick={() => openCardModal(card, list.id)}>Edit</button>
                                      {loggedIn && (
                                        <button onClick={() => deleteCard(list.id, card.id)}>Delete</button>
                                      )}
                                    </div>
                                  )}
                                </Draggable>
                              ))}
                            {provided.placeholder}
                          </div>
                        )}
                      </Droppable>
                      {loggedIn && <button onClick={() => addCard(list.id)}>+ Add Card</button>}
                    </div>
                  )}
                </Draggable>
              ))}
              {provided.placeholder}
              {loggedIn && <button onClick={addList}>+ Add List</button>}
            </div>
          )}
        </Droppable>
      </DragDropContext>

      <div className="sidebar">
        <div className="member-editor">
          <h3>Members</h3>
          {board.members.map(member => (
            <div key={member.id}>
              <input
                type="text"
                value={member.name}
                onChange={(e) => renameMember(member.id, e.target.value)}
              />
              {loggedIn && <button onClick={() => removeMember(member.id)}>X</button>}
            </div>
          ))}
          {loggedIn && <button onClick={addMember}>+ Add Member</button>}
        </div>
        <div className="alerts-tab">
          <h3>Alerts</h3>
          <div className="alerts-list">
            {board.alerts.map((alert, i) => (
              <div key={i} className="alert">{alert}</div>
            ))}
          </div>
          {loggedIn && (
            <div className="alert-input">
              <input type="text" placeholder="Enter alert" onKeyDown={handleAlertInput} />
            </div>
          )}
        </div>
      </div>

      <div className="backup-section">
        <button onClick={downloadBackup}>Download Backup</button>
        <input type="file" onChange={uploadBackup} />
      </div>

      <div className="filter-section">
        <select onChange={(e) => setFilterMember(e.target.value)}>
          <option value="">All Members</option>
          {board.members.map(member => (
            <option key={member.id} value={member.id}>{member.name}</option>
          ))}
        </select>
      </div>

      {modalOpen && selectedCard && (
        <CardModal card={selectedCard} onClose={closeCardModal} />
      )}
    </div>
  );
}

export default App;
