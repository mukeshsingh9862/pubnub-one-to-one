import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './Home.css';

const Home = () => {
  const [userId, setUserId] = useState('');
  const [peerId, setPeerId] = useState('');
  const navigate = useNavigate();

  const handleSubmit = (e) => {
    e.preventDefault();
    
    if (userId.trim() && peerId.trim()) {
      navigate(`/chat?user=${userId.trim()}&peer=${peerId.trim()}`);
    }
  };

  return (
    <div className="home-container">
      <div className="home-card">
        <h1>PubNub Chat</h1>
        <p>Enter your user ID and the ID of the person you want to chat with</p>
        
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="userId">Your User ID</label>
            <input
              type="text"
              id="userId"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              placeholder="Enter your user ID"
              required
            />
          </div>
          
          <div className="form-group">
            <label htmlFor="peerId">Peer User ID</label>
            <input
              type="text"
              id="peerId"
              value={peerId}
              onChange={(e) => setPeerId(e.target.value)}
              placeholder="Enter peer user ID"
              required
            />
          </div>
          
          <button type="submit" className="start-chat-btn">
            Start Chat
          </button>
        </form>
      </div>
    </div>
  );
};

export default Home; 